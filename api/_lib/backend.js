// Shared helper for Vercel API routes to call Apple/Google backend services.
// Environment variables:
//   APPLE_SERVICE_URL  — e.g. "https://apple.yourapp.com" or "http://localhost:8080"
//   GOOGLE_SERVICE_URL — e.g. "https://google.yourapp.com" or "http://localhost:8081"
//   ADMIN_API_KEY      — same key used by both backend services

const APPLE_URL = process.env.APPLE_SERVICE_URL || "";
const GOOGLE_URL = process.env.GOOGLE_SERVICE_URL || "";
const API_KEY = process.env.ADMIN_API_KEY || "";

// Forward a request to a backend service.
export async function callBackend(baseUrl, path, { method = "GET", body } = {}) {
  if (!baseUrl) {
    return { ok: false, status: 0, data: { error: "Backend URL not configured" } };
  }

  const url = `${baseUrl}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;

  try {
    const resp = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { error: `Failed to reach backend: ${err.message}` } };
  }
}

// Call both Apple and Google backends and merge results.
export async function callBothBackends(applePath, googlePath, { method = "POST", appleBody, googleBody } = {}) {
  const results = { apple: null, google: null };

  const [appleResult, googleResult] = await Promise.allSettled([
    APPLE_URL ? callBackend(APPLE_URL, applePath, { method, body: appleBody }) : Promise.resolve(null),
    GOOGLE_URL ? callBackend(GOOGLE_URL, googlePath, { method, body: googleBody }) : Promise.resolve(null),
  ]);

  if (appleResult.status === "fulfilled" && appleResult.value) results.apple = appleResult.value.data;
  if (googleResult.status === "fulfilled" && googleResult.value) results.google = googleResult.value.data;

  return results;
}

// Check if the Vercel request has a valid admin API key.
export function verifyAuth(req) {
  if (!API_KEY) return true; // No key set = dev mode, allow all.
  const auth = req.headers["authorization"] || "";
  return auth === `Bearer ${API_KEY}`;
}
