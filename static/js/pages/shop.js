import { api } from "../api/client.js";
import { cartStore } from "../state/cart-store.js";
import { wishlistStore } from "../state/wishlist-store.js";
import { renderProductCard } from "../components/product-card.js";
import { showToast } from "../components/toast.js";
import { debounce } from "../utils/dom.js";

export async function init() {
  const grid = document.getElementById("productGrid");
  if (!grid) return;
  const { data } = await api("/api/products");
  if (data?.products && Array.isArray(data.products)) {
    grid.innerHTML = data.products.map(renderProductCard).join("");
    _attachCardEvents(grid);
  }
}

function _attachCardEvents(container) {
  container.addEventListener("click", (e) => {
    const target = e.target.closest("button");
    if (!target) {
      const card = e.target.closest(".product-card");
      if (card?.dataset?.id) window.location.href = `/product/${card.dataset.id}`;
      return;
    }
    const id = parseInt(target.dataset.id);
    if (!id) return;

    if (target.classList.contains("add-to-cart-btn")) {
      cartStore.addItem(id);
      showToast("Added to cart!");
    } else if (target.classList.contains("wishlist-btn")) {
      const now = wishlistStore.toggle(id);
      showToast(now ? "Added to wishlist" : "Removed from wishlist", "info");
    } else if (target.classList.contains("quick-view-btn")) {
      window.location.href = `/product/${id}`;
    }
  });
}
