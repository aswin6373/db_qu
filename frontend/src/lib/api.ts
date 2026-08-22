const API_URL = import.meta.env.VITE_API_URL ?? "";

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
  } catch {
    throw new Error("Cannot reach QueryMind API. Please make sure the backend server is running.");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = body.detail ?? "Request failed";
    if (response.status === 401 && token) {
      localStorage.removeItem("querymind_token");
      window.dispatchEvent(new CustomEvent("querymind:auth-expired", { detail: message }));
    }
    throw new Error(message);
  }
  return response.json();
}
