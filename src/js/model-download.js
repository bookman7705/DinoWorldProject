/**
 * Fetch remote models without Range requests.
 * Three.js FileLoader rejects HTTP 206; the gateway returns 206 for Range requests.
 */
export async function fetchRemoteModelArrayBuffer(url, { signal } = {}) {
  const response = await fetch(url, {
    method: "GET",
    signal,
    cache: "default"
  });

  if (!response.ok) {
    throw new Error(`Model download failed (${response.status}): ${url}`);
  }

  return response.arrayBuffer();
}
