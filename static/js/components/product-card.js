import { escapeHTML } from "../utils/dom.js";
import { formatPrice, parseProductImages } from "../utils/formatters.js";

export function renderProductCard(product) {
  const images = parseProductImages(product.image, product.images);
  const discount = product.old_price && product.old_price > product.price
    ? Math.round((1 - product.price / product.old_price) * 100)
    : 0;

  return `
    <div class="group relative bg-white dark:bg-gray-800 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100 dark:border-gray-700 flex flex-col product-card cursor-pointer"
         data-id="${product.id}" role="article" aria-label="${escapeHTML(product.name)}">

      ${product.badge ? `<span class="absolute top-3 left-3 z-10 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-lg">${escapeHTML(product.badge)}</span>` : ""}
      ${discount > 0 ? `<span class="absolute top-3 right-3 z-10 bg-red-500 text-white text-[11px] font-bold px-2 py-1 rounded-full shadow-lg">-${discount}%</span>` : ""}

      <div class="relative overflow-hidden aspect-[3/4] bg-gray-100 dark:bg-gray-700">
        <img src="${escapeHTML(images[0] || 'https://via.placeholder.com/400x500?text=No+Image')}"
             alt="${escapeHTML(product.name)}"
             class="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
             loading="lazy"
             onerror="this.src='https://via.placeholder.com/400x500?text=No+Image'">

        <!-- Quick actions overlay -->
        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
          <button class="quick-view-btn bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-2.5 rounded-full shadow-lg hover:bg-indigo-600 hover:text-white transition-all"
                  data-id="${product.id}" aria-label="Quick view ${escapeHTML(product.name)}">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
          </button>
          <button class="wishlist-btn bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-2.5 rounded-full shadow-lg hover:bg-red-500 hover:text-white transition-all"
                  data-id="${product.id}" aria-label="Toggle wishlist">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
          </button>
        </div>

        ${product.stock?.toLowerCase() === "out of stock"
          ? '<div class="absolute inset-0 bg-white/60 dark:bg-gray-900/60 flex items-center justify-center"><span class="bg-gray-900 text-white px-4 py-2 rounded-full text-sm font-semibold">Out of Stock</span></div>'
          : product.stock?.toLowerCase() === "limited stock"
            ? '<div class="absolute bottom-3 left-3 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-2 py-0.5 rounded-full">Limited</div>'
            : ""}
      </div>

      <div class="p-4 flex flex-col flex-1">
        <p class="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-medium mb-1">${escapeHTML(product.category || "")}</p>
        <h3 class="font-semibold text-gray-800 dark:text-gray-100 text-sm leading-tight mb-2 line-clamp-2">${escapeHTML(product.name)}</h3>

        <div class="flex items-center gap-1 mb-2">
          ${renderStars(product.rating)}
          <span class="text-[11px] text-gray-400 ml-1">(${product.rating || 0})</span>
        </div>

        <div class="mt-auto flex items-center justify-between">
          <div class="flex items-baseline gap-2">
            <span class="text-lg font-bold text-indigo-600 dark:text-indigo-400">${formatPrice(product.price)}</span>
            ${product.old_price && product.old_price > product.price
              ? `<span class="text-sm text-gray-400 line-through">${formatPrice(product.old_price)}</span>`
              : ""}
          </div>
          <button class="add-to-cart-btn bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-full transition-colors"
                  data-id="${product.id}" aria-label="Add to cart">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"/></svg>
          </button>
        </div>
      </div>
    </div>`;
}

export function renderStars(rating) {
  const full = Math.floor(rating || 0);
  const half = (rating || 0) - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  return `<span class="flex text-yellow-400 text-xs" aria-label="${rating} out of 5 stars">
    ${'<svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>'.repeat(full)}
    ${half ? '<svg class="w-3.5 h-3.5" viewBox="0 0 20 20"><defs><linearGradient id="half"><stop offset="50%" stop-color="currentColor"/><stop offset="50%" stop-color="#D1D5DB"/></linearGradient></defs><path fill="url(#half)" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>' : ""}
    ${'<svg class="w-3.5 h-3.5 fill-gray-300" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>'.repeat(empty)}
  </span>`;
}
