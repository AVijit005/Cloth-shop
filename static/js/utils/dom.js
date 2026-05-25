export function escapeHTML(str) {
  if (typeof str !== "string") return "";
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return str.replace(/[&<>"']/g, ch => map[ch]);
}

let activeFocusTrap = null;

export function trapFocus(container) {
  if (!container) return;
  const focusable = container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  activeFocusTrap = { container, first, last };
  first.focus();
  const handler = (e) => {
    if (e.key !== "Tab") return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  container.addEventListener("keydown", handler);
  container._trapHandler = handler;
}

export function releaseFocus(container) {
  if (!container) return;
  const handler = container._trapHandler;
  if (handler) container.removeEventListener("keydown", handler);
  delete container._trapHandler;
  activeFocusTrap = null;
}

let loadingOverlay = null;

export function showLoading(msg = "Loading...") {
  if (loadingOverlay) return;
  loadingOverlay = document.createElement("div");
  loadingOverlay.id = "loadingOverlay";
  loadingOverlay.className = "fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]";
  loadingOverlay.setAttribute("role", "alert");
  loadingOverlay.setAttribute("aria-live", "polite");
  loadingOverlay.innerHTML = `<div class="bg-white dark:bg-gray-800 rounded-xl px-8 py-6 shadow-2xl flex items-center gap-4"><svg class="animate-spin h-6 w-6 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg><span class="text-gray-700 dark:text-gray-200 font-medium">${escapeHTML(msg)}</span></div>`;
  document.body.appendChild(loadingOverlay);
}

export function hideLoading() {
  if (loadingOverlay) { loadingOverlay.remove(); loadingOverlay = null; }
}

export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
