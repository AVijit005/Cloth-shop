import { escapeHTML } from "../utils/dom.js";

const activeToasts = new Set();

export function showToast(message, type = "success") {
  if (activeToasts.has(message)) return;
  activeToasts.add(message);
  const container = document.getElementById("toastContainer") || (() => {
    const c = document.createElement("div");
    c.id = "toastContainer";
    c.className = "fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none";
    c.setAttribute("aria-live", "polite");
    document.body.appendChild(c);
    return c;
  })();

  const colors = { success: "bg-green-500", error: "bg-red-500", info: "bg-blue-500", warning: "bg-yellow-500" };
  const toast = document.createElement("div");
  toast.className = `${colors[type] || colors.info} text-white px-5 py-3 rounded-lg shadow-xl flex items-center gap-3 pointer-events-auto transition-all duration-500 translate-x-0 opacity-100`;
  toast.innerHTML = `
    <span>${escapeHTML(message)}</span>
    <button class="ml-2 text-white/80 hover:text-white" onclick="this.parentElement.remove()" aria-label="Dismiss">&times;</button>
  `;
  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-x-4");
    const remove = () => { toast.remove(); activeToasts.delete(message); };
    toast.addEventListener("transitionend", remove, { once: true });
    setTimeout(remove, 500);
  }, 3000);
  container.appendChild(toast);
}

export function removeToast(el) {
  if (el && el.parentElement) {
    el.remove();
    const msg = el.querySelector("span")?.textContent;
    if (msg) activeToasts.delete(msg);
  }
}
