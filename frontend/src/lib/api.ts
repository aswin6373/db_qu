const API_URL = import.meta.env.VITE_API_URL ?? "";

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
  timeoutMs?: number
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      // Without a client-side timeout a stalled/killed backend would leave a
      // spinner on screen forever with no way to recover.
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : options.signal,
      headers: {
        // Only declare a JSON body when there is one — forcing the header
        // onto GET/DELETE turns every simple request into a CORS preflight.
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("This question took too long to answer. Please try rephrasing it or try again.");
    }
    throw new Error("Cannot reach QueryMind API. Please make sure the backend server is running.");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = body?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail) && detail.length > 0 && detail[0]?.msg
          ? detail[0].msg
          : "Request failed";
    if (response.status === 401 && token) {
      localStorage.removeItem("querymind_token");
      window.dispatchEvent(new CustomEvent("querymind:auth-expired", { detail: message }));
    }
    throw new Error(message);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const parsed = await response.json().catch(() => {
    throw new Error("The API returned an unreadable response.");
  });
  return parsed as T;
}
