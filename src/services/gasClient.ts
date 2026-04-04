// Helper to call GAS web app endpoints and read the JSON response.
//
// Uses Content-Type: text/plain to keep the request "simple" (no CORS
// preflight).  GAS redirects through script.googleusercontent.com which
// sets CORS headers on the final response.

export async function callGas<T = unknown>(url: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`GAS request failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  if (data.success === false) {
    throw new Error(data.error || 'Unknown GAS error');
  }

  return data as T;
}
