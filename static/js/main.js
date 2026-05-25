/**
 * Shibani Fashion Store — Application Entry Point
 *
 * Architecture:
 *   main.js              (this file) — Bootstraps page-specific controllers
 *   ├── api/             — Backend API client modules (auth, products, orders)
 *   ├── state/           — Reactive stores (cart, wishlist)
 *   ├── components/      — Reusable UI components (toast, cards, modal)
 *   └── utils/           — Pure utility functions (storage, dom, formatters)
 *
 * Pattern: Body data attribute `data-page="shop"` determines which
 * controller to initialize. This avoids path-parsing duplication and
 * makes the page-controller mapping explicit.
 */
import { showToast } from "./components/toast.js";
import { cartStore } from "./state/cart-store.js";
import { wishlistStore } from "./state/wishlist-store.js";
import { initGlobal } from "./utils/global-init.js";
import { formatPrice } from "./utils/formatters.js";

// Page controllers — lazy-loaded per route
const pageControllers = {
  home:        () => import("./pages/home.js"),
  shop:        () => import("./pages/shop.js"),
  product:     () => import("./pages/product.js"),
  cart:        () => import("./pages/cart.js"),
  checkout:    () => import("./pages/checkout.js"),
  orders:      () => import("./pages/orders.js"),
  wishlist:    () => import("./pages/wishlist.js"),
  profile:     () => import("./pages/profile.js"),
  admin:       () => import("./pages/admin.js"),
  login:       () => import("./pages/login.js"),
  signup:      () => import("./pages/signup.js"),
};

async function boot() {
  await initGlobal();

  const pageAttr = document.body.getAttribute("data-page");
  if (!pageAttr) return;

  const loader = pageControllers[pageAttr];
  if (!loader) return;

  try {
    const mod = await loader();
    if (mod.init) await mod.init();
  } catch (err) {
    console.error(`[${pageAttr}] init failed:`, err);
    showToast("Failed to initialize page", "error");
  }
}

// Expose key APIs globally for inline onclick handlers in templates
// and for the legacy monolithic main.js which depends on formatPrice as a global
window.showToast = showToast;
window.cartStore = cartStore;
window.wishlistStore = wishlistStore;
window.formatPrice = formatPrice;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
