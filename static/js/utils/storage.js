export const STORAGE_KEYS = {
  CART: "shopping_cart",
  WISHLIST: "wishlist",
  RECENTLY_VIEWED: "recently_viewed",
  USER: "user_info",
  TOGGLE_STATES: "toggle_states",
  COMPARE: "compare_products",
  SAVED_CART: "saved_cart",
};

export function safeParseJSON(val, fallback = null) {
  if (val === null || val === undefined) return fallback;
  try { return JSON.parse(val); }
  catch { return fallback; }
}

export function getItem(key, fallback = null) {
  try { const v = localStorage.getItem(key); if (v === null) return fallback; const r = safeParseJSON(v, v); return r !== null ? r : fallback; }
  catch { return fallback; }
}

export function setItem(key, value) {
  try { localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value)); }
  catch { /* quota exceeded or private mode */ }
}

export function removeItem(key) {
  try { localStorage.removeItem(key); }
  catch { /* noop */ }
}
