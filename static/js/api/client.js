import { escapeHTML } from "../utils/dom.js";

/**
 * Centralized API client for all backend requests.
 *
 * - Automatically attaches CSRF token from <meta name="csrf-token">
 * - JSON encodes request bodies
 * - Parses JSON responses
 * - Returns structured { error, data, status } objects
 */
export async function api(path, options = {}) {
  const { method = "GET", body, params, retries = 0 } = options;

  let url = path;
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== "")
    ).toString();
    if (qs) url += "?" + qs;
  }

  const headers = { "Content-Type": "application/json" };
  const metaToken = document.querySelector('meta[name="csrf-token"]');
  if (metaToken) headers["X-CSRF-Token"] = metaToken.getAttribute("content");

  const fetchOpts = { method, headers };
  if (body && method !== "GET") fetchOpts.body = JSON.stringify(body);

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, fetchOpts);
      const contentType = resp.headers.get("content-type") || "";
      const data = contentType.includes("application/json") ? await resp.json() : await resp.text();
      if (!resp.ok) return { error: data.error || `Request failed (${resp.status})`, status: resp.status, data };
      return { data, status: resp.status, error: null };
    } catch (err) {
      lastError = err;
      if (attempt < retries) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  return { error: lastError.message || "Network error", status: 0, data: null };
}

export function apiFormData(path, formData) {
  const metaToken = document.querySelector('meta[name="csrf-token"]');
  const headers = {};
  if (metaToken) headers["X-CSRF-Token"] = metaToken.getAttribute("content");
  return fetch(path, { method: "POST", headers, body: formData }).then(r => r.json());
}
