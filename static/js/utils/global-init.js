import { api } from "../api/client.js";
import { cartStore } from "../state/cart-store.js";
import { wishlistStore } from "../state/wishlist-store.js";
import { showToast } from "../components/toast.js";

export async function initGlobal() {
  await _fetchUser();
  _initUserDropdown();
  _initMobileMenu();
  _initSearch();
  _initLogout();
  _initCartDrawer();
  _initMobileNav();
  _initThemeToggle();
  _initScrollReveal();
  _initCartIconTrigger();
  _initHeaderScroll();
  cartStore.subscribe(_updateBadges);
  wishlistStore.subscribe(_updateBadges);
  _updateBadges();
  _applyTheme();
}

/* ---- Fetch User ---- */
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

/* ---- User Dropdown (Desktop) ---- */
function _initUserDropdown() {
  const trigger = document.getElementById("userDropdownTrigger");
  const menu = document.getElementById("userDropdownMenu");
  if (!trigger || !menu) return;
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("open");
    const isOpen = menu.classList.contains("open");
    trigger.setAttribute("aria-expanded", isOpen);
    const chevron = trigger.querySelector(".fa-chevron-down");
    if (chevron) chevron.style.transform = isOpen ? "rotate(180deg)" : "rotate(0deg)";
  });
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && !trigger.contains(e.target)) {
      menu.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
      const chevron = trigger.querySelector(".fa-chevron-down");
      if (chevron) chevron.style.transform = "rotate(0deg)";
    }
  });
}

/* ---- Mobile Menu ---- */
function _initMobileMenu() {
  const btn = document.getElementById("mobileMenuToggle");
  const nav = document.getElementById("mobileNavMenu");
  if (!btn || !nav) return;
  btn.addEventListener("click", () => {
    const hidden = nav.classList.toggle("hidden");
    btn.setAttribute("aria-expanded", !hidden);
    const icon = btn.querySelector("i");
    if (icon) icon.className = hidden ? "fa-solid fa-bars text-lg" : "fa-solid fa-xmark text-lg";
  });
  const searchBtn = document.getElementById("mobileSearchToggle");
  const searchEl = document.getElementById("mobileSearchContainer");
  if (searchBtn && searchEl) {
    searchBtn.addEventListener("click", () => {
      searchEl.classList.toggle("hidden");
      searchEl.querySelector("input")?.focus();
    });
  }
}

/* ---- Search ---- */
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

/* ---- Logout ---- */
function _initLogout() {
  const handle = async () => {
    try {
      await api("/api/logout", { method: "POST" });
      cartStore.clear();
      window.location.href = "/";
    } catch (_) { /* ignore */ }
  };
  ["globalLogoutBtn", "adminLogoutBtn", "adminMobileLogoutBtn"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", handle);
  });
}

/* ---- Cart Drawer ---- */
let cartDrawerOpen = false;

function _initCartDrawer() {
  const drawer = document.getElementById("cartDrawer");
  const panel = document.getElementById("cartDrawerPanel");
  const backdrop = document.getElementById("cartDrawerBackdrop");
  const closeBtn = document.getElementById("cartDrawerCloseBtn");
  const shopBtn = document.getElementById("cartDrawerShopBtn");
  if (!drawer || !panel) return;

  const open = () => {
    drawer.classList.remove("hidden");
    requestAnimationFrame(() => {
      backdrop?.classList.add("open");
      panel.classList.add("open");
    });
    document.body.style.overflow = "hidden";
    cartDrawerOpen = true;
    _renderCartDrawer(panel);
  };

  const close = () => {
    backdrop?.classList.remove("open");
    panel.classList.remove("open");
    document.body.style.overflow = "";
    setTimeout(() => { drawer.classList.add("hidden"); }, 400);
    cartDrawerOpen = false;
  };

  // Expose globally for other components
  window.openCartDrawer = open;
  window.closeCartDrawer = close;

  if (closeBtn) closeBtn.addEventListener("click", close);
  if (backdrop) backdrop.addEventListener("click", close);
  if (shopBtn) shopBtn?.addEventListener("click", () => { close(); window.location.href = "/shop"; });

  cartStore.subscribe(() => {
    if (cartDrawerOpen) _renderCartDrawer(panel);
  });
}

function _renderCartDrawer(panel) {
  const items = cartStore.getCart();
  const itemsEl = document.getElementById("cartDrawerItems");
  const emptyEl = document.getElementById("cartDrawerEmpty");
  const footerEl = document.getElementById("cartDrawerFooter");
  const countEl = document.getElementById("cartDrawerCount");
  const subtotalEl = document.getElementById("cartDrawerSubtotal");
  const mobileBadge = document.getElementById("mobileCartBadge");

  if (!items || items.length === 0) {
    if (itemsEl) itemsEl.innerHTML = "";
    if (emptyEl) emptyEl.classList.remove("hidden");
    if (footerEl) footerEl.classList.add("hidden");
    if (countEl) countEl.textContent = "0";
    if (subtotalEl) subtotalEl.textContent = "Rs. 0";
    if (mobileBadge) { mobileBadge.textContent = "0"; mobileBadge.classList.add("scale-0"); }
    _updateShippingProgress(0);
    return;
  }

  if (emptyEl) emptyEl.classList.add("hidden");
  if (footerEl) footerEl.classList.remove("hidden");

  let html = "";
  let total = 0;
  items.forEach((item, idx) => {
    const price = item.price || 0;
    const qty = item.quantity || 1;
    const lineTotal = price * qty;
    total += lineTotal;
    html += `
      <div class="flex gap-4 py-4 border-b border-[var(--neutral-50)] group">
        <div class="w-16 h-20 bg-[var(--neutral-50)] flex-shrink-0 overflow-hidden">
          <img src="${item.image || 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=100'}" alt="${item.name || 'Product'}" class="w-full h-full object-cover object-top" loading="lazy" />
        </div>
        <div class="flex-grow min-w-0">
          <h4 class="text-xs font-semibold uppercase tracking-wider text-[var(--neutral-800)] truncate">${item.name || 'Product'}</h4>
          <p class="text-[10px] text-[var(--neutral-400)] uppercase tracking-wider mt-0.5">Rs. ${price.toLocaleString()}</p>
          <div class="flex items-center gap-2 mt-2">
            <div class="qty-selector">
              <button data-cart-dec="${idx}"><i class="fa-solid fa-minus"></i></button>
              <span>${qty}</span>
              <button data-cart-inc="${idx}"><i class="fa-solid fa-plus"></i></button>
            </div>
            <button data-cart-remove="${idx}" class="text-[var(--neutral-400)] hover:text-[var(--color-error)] transition text-xs ml-auto opacity-0 group-hover:opacity-100">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </div>
        <div class="text-right flex-shrink-0">
          <span class="text-xs font-bold text-[var(--neutral-900)]">Rs. ${lineTotal.toLocaleString()}</span>
        </div>
      </div>`;
  });

  if (itemsEl) itemsEl.innerHTML = html;
  if (countEl) countEl.textContent = items.length;
  if (subtotalEl) subtotalEl.textContent = `Rs. ${total.toLocaleString()}`;

  // Line item event listeners
  itemsEl?.querySelectorAll("[data-cart-inc]").forEach(btn => {
    btn.addEventListener("click", () => cartStore.adjustQty(parseInt(btn.dataset.cartInc), 1));
  });
  itemsEl?.querySelectorAll("[data-cart-dec]").forEach(btn => {
    btn.addEventListener("click", () => cartStore.adjustQty(parseInt(btn.dataset.cartDec), -1));
  });
  itemsEl?.querySelectorAll("[data-cart-remove]").forEach(btn => {
    btn.addEventListener("click", () => cartStore.removeItem(parseInt(btn.dataset.cartRemove)));
  });

  _updateShippingProgress(total);
}

function _updateShippingProgress(total) {
  const threshold = 999;
  const progressEl = document.getElementById("shippingProgressBar");
  const textEl = document.getElementById("shippingProgressText");
  const remainingEl = document.getElementById("shippingRemaining");
  if (!progressEl) return;

  if (total >= threshold) {
    progressEl.style.width = "100%";
    if (textEl) textEl.textContent = "You've unlocked free shipping!";
  } else {
    const pct = (total / threshold) * 100;
    progressEl.style.width = `${Math.min(pct, 99)}%`;
    if (remainingEl) remainingEl.textContent = (threshold - total).toLocaleString();
  }
}

/* ---- Cart Icon Trigger ---- */
function _initCartIconTrigger() {
  const cartBtn = document.getElementById("cartIconBtn");
  if (cartBtn) {
    cartBtn.addEventListener("click", () => {
      if (window.openCartDrawer) window.openCartDrawer();
    });
  }
  const mobileCartBtn = document.getElementById("mobileCartBtn");
  if (mobileCartBtn) {
    mobileCartBtn.addEventListener("click", () => {
      if (window.openCartDrawer) window.openCartDrawer();
    });
  }
}

/* ---- Mobile Bottom Nav ---- */
function _initMobileNav() {
  const profileBtn = document.getElementById("mobileProfileBtn");
  if (profileBtn) {
    profileBtn.addEventListener("click", () => {
      window.location.href = "/profile";
    });
  }

  let lastScroll = 0;
  const nav = document.getElementById("mobileBottomNav");
  if (!nav) return;

  window.addEventListener("scroll", () => {
    const current = window.scrollY;
    if (current > lastScroll && current > 100) {
      nav.classList.add("hidden-nav");
    } else {
      nav.classList.remove("hidden-nav");
    }
    lastScroll = current;
  }, { passive: true });
}

/* ---- Dark Mode Toggle ---- */
function _initThemeToggle() {
  const btn = document.getElementById("themeToggle");
  const icon = document.getElementById("themeIcon");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") ||
                    document.body.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    _setTheme(next);
    if (icon) {
      icon.className = next === "dark"
        ? "fa-regular fa-sun text-base"
        : "fa-regular fa-moon text-base";
    }
  });
}

function _setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.body.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("shibani-theme", theme);
  } catch (_) { /* ignore */ }
  // Update meta theme-color
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "dark" ? "#0a0a0a" : "#ffffff";
}

function _applyTheme() {
  let theme = "light";
  try {
    theme = localStorage.getItem("shibani-theme") || "light";
  } catch (_) { /* ignore */ }
  _setTheme(theme);
  const icon = document.getElementById("themeIcon");
  if (icon) {
    icon.className = theme === "dark"
      ? "fa-regular fa-sun text-base"
      : "fa-regular fa-moon text-base";
  }
}

/* ---- Scroll Reveal ---- */
function _initScrollReveal() {
  if (typeof IntersectionObserver === "undefined") return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });

  document.querySelectorAll(".reveal").forEach(el => observer.observe(el));
}

/* ---- Header Scroll Effect ---- */
function _initHeaderScroll() {
  const header = document.getElementById("mainHeader");
  if (!header) return;
  let ticking = false;

  window.addEventListener("scroll", () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        if (window.scrollY > 20) {
          header.style.borderBottomColor = "rgba(10,10,10,0.08)";
          header.style.boxShadow = "0 4px 20px rgba(10,10,10,0.06)";
        } else {
          header.style.borderBottomColor = "rgba(10,10,10,0.06)";
          header.style.boxShadow = "none";
        }
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
}

/* ---- Badge Updates ---- */
function _updateBadges() {
  const cartBadge = document.getElementById("cartBadge");
  const wishBadge = document.getElementById("wishlistBadge");
  const mobileCartBadge = document.getElementById("mobileCartBadge");
  const cartCount = cartStore.count;
  const wishCount = wishlistStore.getItems().length;

  if (cartBadge) {
    cartBadge.textContent = cartCount;
    cartBadge.classList.toggle("scale-0", cartCount === 0);
  }
  if (wishBadge) {
    wishBadge.textContent = wishCount;
    wishBadge.classList.toggle("scale-0", wishCount === 0);
  }
  if (mobileCartBadge) {
    mobileCartBadge.textContent = cartCount;
    mobileCartBadge.classList.toggle("scale-0", cartCount === 0);
  }
}
