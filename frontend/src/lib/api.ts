const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

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
