/**
 * initGlobal — shared initialization run on every page.
 *
 * Extracted from the original monolithic main.js to avoid duplication
 * and to provide a clean dependency boundary.
 */
import { api } from "../api/client.js";
import { cartStore } from "../state/cart-store.js";
import { wishlistStore } from "../state/wishlist-store.js";

export async function initGlobal() {
  await _fetchUser();
  _initUserDropdown();
  _initMobileMenu();
  _initSearch();
  _initLogout();
  _initMiniCart();
  cartStore.subscribe(_updateBadges);
  wishlistStore.subscribe(_updateBadges);
  _updateBadges();
}

async function _fetchUser() {
  try {
    const { data } = await api("/api/me");
    if (data?.user) {
      window.__user = data.user;
      try {
        const { data: wishData } = await api("/api/wishlist");
        if (wishData?.wishlist) {
          wishData.wishlist.forEach(p => {
            if (!wishlistStore.has(p.id)) wishlistStore.toggle(p.id);
          });
        }
      } catch (_) { /* guest */ }
    }
  } catch (_) { /* guest */ }
}

function _initUserDropdown() {
  const trigger = document.getElementById("userDropdownTrigger");
  const menu = document.getElementById("userDropdownMenu");
  if (!trigger || !menu) return;
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const hidden = menu.classList.toggle("hidden");
    trigger.setAttribute("aria-expanded", !hidden);
  });
  document.addEventListener("click", () => {
    menu.classList.add("hidden");
    trigger.setAttribute("aria-expanded", "false");
  });
}

function _initMobileMenu() {
  const btn = document.getElementById("mobileMenuToggle");
  const nav = document.getElementById("mobileNavMenu");
  if (!btn || !nav) return;
  btn.addEventListener("click", () => {
    const hidden = nav.classList.toggle("hidden");
    btn.setAttribute("aria-expanded", !hidden);
  });
  const searchBtn = document.getElementById("mobileSearchToggle");
  const searchEl = document.getElementById("mobileSearchContainer");
  if (searchBtn && searchEl) searchBtn.addEventListener("click", () => searchEl.classList.toggle("hidden"));
}

function _initSearch() {
  const submitSearch = (input) => {
    if (input?.value?.trim()) window.location.href = `/shop?q=${encodeURIComponent(input.value.trim())}`;
  };
  const form = document.getElementById("globalSearchForm");
  const input = document.getElementById("globalSearchInput");
  if (form && input) form.addEventListener("submit", (e) => { e.preventDefault(); submitSearch(input); });
  const mForm = document.getElementById("mobileSearchForm");
  const mInput = document.getElementById("mobileSearchInput");
  if (mForm && mInput) mForm.addEventListener("submit", (e) => { e.preventDefault(); submitSearch(mInput); });
}

function _initLogout() {
  const handle = async () => {
    try {
      await api("/api/logout", { method: "POST" });
      cartStore.clear();
      window.location.href = "/";
    } catch (err) { /* ignore */ }
  };
  ["globalLogoutBtn", "adminLogoutBtn", "adminMobileLogoutBtn"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", handle);
  });
}

function _initMiniCart() {
  const openBtn = document.getElementById("miniCartToggle");
  const closeBtn = document.getElementById("miniCartCloseBtn");
  const drawer = document.getElementById("miniCartDrawer");
  const overlay = document.getElementById("miniCartOverlay");
  if (!drawer) return;

  const open = () => {
    drawer.classList.remove("translate-x-full");
    if (overlay) overlay.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  };
  const close = () => {
    drawer.classList.add("translate-x-full");
    if (overlay) overlay.classList.add("hidden");
    document.body.style.overflow = "";
  };

  if (openBtn) openBtn.addEventListener("click", open);
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (overlay) overlay.addEventListener("click", close);

  cartStore.subscribe(() => {
    if (!drawer.classList.contains("translate-x-full")) _renderMiniCart(drawer);
  });
}

function _renderMiniCart(drawer) {
  const items = cartStore.getCart();
  const list = drawer.querySelector("[data-minicart-items]");
  const total = drawer.querySelector("[data-minicart-total]");
  if (!list) return;
  if (items.length === 0) {
    list.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">Your cart is empty</p>';
    if (total) total.textContent = "₹0";
    return;
  }
  let html = "";
  let sum = 0;
  items.forEach((item, i) => {
    sum += (item.price || 0) * item.quantity;
    html += `<div class="flex items-center gap-3 p-3 border-b dark:border-gray-700">
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate">${item.name || "Product"}</p>
        <p class="text-xs text-gray-400">Qty: ${item.quantity} × ₹${item.price || 0}</p>
      </div>
      <button class="text-red-400 text-xs" data-remove="${i}">&times;</button>
    </div>`;
  });
  list.innerHTML = html;
  if (total) total.textContent = `₹${sum}`;
  list.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => cartStore.removeItem(parseInt(btn.dataset.remove)));
  });
}

function _updateBadges() {
  const cartBadge = document.getElementById("cartBadge");
  const wishBadge = document.getElementById("wishlistBadge");
  const cartCount = cartStore.count;
  const wishCount = wishlistStore.getItems().length;
  if (cartBadge) { cartBadge.textContent = cartCount; cartBadge.classList.toggle("hidden", cartCount === 0); }
  if (wishBadge) { wishBadge.textContent = wishCount; wishBadge.classList.toggle("hidden", wishCount === 0); }
}
