// Shibani Fashion Unified App Controller

// Global App State
async function ensureProductsLoaded() {
    if (appState.products.length > 0) return true;
    try {
        const data = await api("/api/products");
        if (data && data.products) {
            appState.products = data.products;
            return true;
        }
    } catch (err) {
        console.error("Failed to load products during hydration:", err);
    }
    return false;
}
function safeParseJSON(val, fallback) {
    if (val == null) return fallback;
    try { const r = JSON.parse(val); return r !== null ? r : fallback; } catch { return fallback; }
}

function formatPrice(amount) {
    const num = typeof amount === "string" ? parseFloat(amount) : Number(amount);
    if (Number.isNaN(num)) return "Rs. 0";
    return "Rs. " + num.toLocaleString("en-IN");
}

function lsGet(key, fallback) {
    try { const v = localStorage.getItem(key); return v !== null ? v : fallback; } catch { return fallback; }
}
const appState = {
    user: null,
    products: [],
    cart: safeParseJSON(lsGet("shibani_cart"), []),
    wishlist: safeParseJSON(lsGet("shibani_wishlist"), []),
    settings: {
        gst_rate: 5.0,
        delivery_fee_standard: 99.0,
        delivery_fee_threshold: 999.0,
        other_charges: 0.0
    },
    compareList: safeParseJSON(lsGet("shibani_compare"), [])
};

// Global API Helper
const _escapeDiv = document.createElement("div");
function escapeHTML(str) {
    _escapeDiv.textContent = str;
    return _escapeDiv.innerHTML;
}

// Focus trap helpers for modals/drawers
let activeFocusTrap = null;
function trapFocus(container) {
    activeFocusTrap = container;
    const focusable = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const firstFocusable = focusable[0];
    if (firstFocusable) setTimeout(() => firstFocusable.focus(), 50);
    const handleKey = (e) => {
        if (e.key !== "Tab" || !activeFocusTrap) return;
        const els = Array.from(activeFocusTrap.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    container._focusTrapHandler = handleKey;
}
function releaseFocus(container) {
    if (container && container._focusTrapHandler) {
        document.removeEventListener("keydown", container._focusTrapHandler);
        delete container._focusTrapHandler;
    }
    activeFocusTrap = null;
}

// Toast notification system
const activeToasts = new Set();
function removeToast(el) {
    if (!el || el._removing) return;
    el._removing = true;
    el.classList.remove("toast-enter");
    el.classList.add("toast-exit");
    setTimeout(() => { el.remove(); activeToasts.delete(el); }, 300);
}
function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    
    for (const t of activeToasts) {
        if (t.textContent.trim() === message) {
            removeToast(t); break;
        }
    }
    const el = document.createElement("div");
    el.className = `toast toast-${type} pointer-events-auto flex items-start gap-3 px-5 py-4 shadow-xl border transition-all duration-300 toast-enter`;
    
    if (document.documentElement.getAttribute("data-theme") === "dark") {
        el.classList.add("bg-neutral-800", "border-neutral-700", "text-neutral-100");
    } else {
        el.classList.add("bg-white", "border-neutral-200", "text-neutral-900");
    }

    const icon = type === "error" ? "fa-circle-exclamation text-rose-500" : "fa-circle-check text-emerald-600";
    el.innerHTML = `<i class="fa-solid ${icon} text-sm mt-0.5 flex-shrink-0"></i><span class="flex-grow">${escapeHTML(message)}</span><button class="dismiss-btn text-neutral-400 hover:text-neutral-600 transition flex-shrink-0" aria-label="Dismiss">&times;</button>`;
    el.querySelector(".dismiss-btn")?.addEventListener("click", () => removeToast(el));
    container.appendChild(el);
    activeToasts.add(el);
    setTimeout(() => removeToast(el), 4000);
}

// Loading overlay helpers
function showLoading(msg = "Loading...") {
    const overlay = document.getElementById("globalLoadingOverlay");
    const msgEl = document.getElementById("loadingOverlayMessage");
    if (overlay) overlay.classList.remove("hidden");
    if (msgEl) msgEl.textContent = msg;
}
function hideLoading() {
    const overlay = document.getElementById("globalLoadingOverlay");
    if (overlay) overlay.classList.add("hidden");
}

async function api(path, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const { headers: optHeaders, ...safeOptions } = options;
    const headers = { "Content-Type": "application/json", ...(optHeaders || {}) };
    
    if (["POST", "PUT", "DELETE"].includes(method)) {
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
        if (csrfToken) {
            headers["X-CSRF-Token"] = csrfToken;
        }
    }

    const response = await fetch(path, {
        headers: headers,
        credentials: "same-origin",
        ...safeOptions
    });
    if (!response.ok) {
        let errorText = "Request failed";
        try { const errBody = await response.json(); errorText = errBody.error || errorText; } catch (_) {}
        throw new Error(errorText);
    }
    const text = await response.text();
    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return null;
    }
}

function _logoutHandler() {
    api("/api/logout", { method: "POST" }).then(() => {
        appState.cart = [];
        localStorage.setItem("shibani_cart", "[]");
        window.location.href = "/";
    }).catch(() => window.location.href = "/");
}

function _initUserDropdown() {
    const trigger = document.getElementById("userDropdownTrigger");
    const menu = document.getElementById("userDropdownMenu");
    if (!trigger || !menu) return;
    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.classList.toggle("open");
        trigger.setAttribute("aria-expanded", menu.classList.contains("open"));
        const chevron = trigger.querySelector(".fa-chevron-down");
        if (chevron) chevron.style.transform = menu.classList.contains("open") ? "rotate(180deg)" : "rotate(0deg)";
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

function _initSearchSubmit() {
    const submit = (input) => {
        if (input?.value?.trim()) window.location.href = "/shop?q=" + encodeURIComponent(input.value.trim());
    };
    const form = document.getElementById("globalSearchForm");
    const input = document.getElementById("globalSearchInput");
    if (form && input) form.addEventListener("submit", (e) => { e.preventDefault(); submit(input); });
    const mForm = document.getElementById("mobileSearchForm");
    const mInput = document.getElementById("mobileSearchInput");
    if (mForm && mInput) mForm.addEventListener("submit", (e) => { e.preventDefault(); submit(mInput); });
}

function _initCartDrawer() {
    const drawer = document.getElementById("cartDrawer");
    const panel = document.getElementById("cartDrawerPanel");
    const backdrop = document.getElementById("cartDrawerBackdrop");
    const closeBtn = document.getElementById("cartDrawerCloseBtn");
    const shopBtn = document.getElementById("cartDrawerShopBtn");
    if (!drawer || !panel) return;

    let closeTimer = null;

    const open = async () => {
        if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
        backdrop?.classList.remove("hidden");
        backdrop?.classList.add("open");
        panel.classList.remove("hidden");
        panel.classList.add("open");
        document.body.style.overflow = "hidden";
        document.getElementById("cartDrawerItems")?.classList.add("hidden");
        document.getElementById("cartDrawerEmpty")?.classList.add("hidden");
        document.getElementById("cartDrawerFooter")?.classList.add("hidden");
        await _renderCartDrawer();
    };

    const close = () => {
        backdrop?.classList.remove("open");
        panel.classList.remove("open");
        document.body.style.overflow = "";
        closeTimer = setTimeout(() => { drawer.classList.add("hidden"); }, 400);
    };

    window.openCartDrawer = open;
    window.closeCartDrawer = close;

    if (closeBtn) closeBtn.addEventListener("click", close);
    if (backdrop) backdrop.addEventListener("click", close);
    if (shopBtn) shopBtn?.addEventListener("click", () => { close(); window.location.href = "/shop"; });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !drawer.classList.contains("hidden")) close();
    });
}

async function _renderCartDrawer() {
    await ensureProductsLoaded();
    const items = appState.cart;
    const itemsEl = document.getElementById("cartDrawerItems");
    const emptyEl = document.getElementById("cartDrawerEmpty");
    const footerEl = document.getElementById("cartDrawerFooter");
    const countEl = document.getElementById("cartDrawerCount");
    const subtotalEl = document.getElementById("cartDrawerSubtotal");

    if (!items || items.length === 0) {
    if (itemsEl) itemsEl.innerHTML = "";
    if (emptyEl) emptyEl.classList.remove("hidden");
    if (footerEl) footerEl.classList.add("hidden");
    if (countEl) countEl.textContent = "0";
    if (subtotalEl) subtotalEl.textContent = "Rs. 0";
    _updateShippingProgress(0);
    return;
}

if (emptyEl) emptyEl.classList.add("hidden");
if (footerEl) footerEl.classList.remove("hidden");
if (itemsEl) itemsEl.classList.remove("hidden");

    let html = "";
    let total = 0;
    items.forEach((item, idx) => {
        const product = appState.products.find(p => String(p.id) === String(item.product_id));
        if (!product) return;
        const price = Number(product.price) || 0;
        const qty = item.quantity != null ? item.quantity : 1;
        const lineTotal = price * qty;
        total += lineTotal;
        const parsedImages = product.image ? [product.image] : (product.images || []);
        html += `
            <div class="flex gap-4 py-4 border-b border-[var(--neutral-50)] group">
                <div class="w-16 h-20 bg-[var(--neutral-50)] flex-shrink-0 overflow-hidden">
                    <img src="${escapeHTML(parsedImages[0] || 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=100')}" alt="${escapeHTML(product.name || 'Product')}" class="w-full h-full object-cover object-top" loading="lazy" />
                </div>
                <div class="flex-grow min-w-0">
                    <h4 class="text-xs font-semibold uppercase tracking-wider text-[var(--neutral-800)] truncate">${escapeHTML(product.name || 'Product')}</h4>
                    <p class="text-[10px] text-[var(--neutral-400)] uppercase tracking-wider mt-0.5">Rs. ${price.toLocaleString("en-IN")}</p>
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
                    <span class="text-xs font-bold text-[var(--neutral-900)]">Rs. ${lineTotal.toLocaleString("en-IN")}</span>
                </div>
            </div>`;
    });

    if (itemsEl) itemsEl.innerHTML = html;
    if (countEl) countEl.textContent = items.length;
    if (subtotalEl) subtotalEl.textContent = "Rs. " + total.toLocaleString("en-IN");

    itemsEl?.querySelectorAll("[data-cart-inc]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const idx = parseInt(btn.dataset.cartInc);
            const item = appState.cart[idx];
            if (item) { item.quantity++; localStorage.setItem("shibani_cart", JSON.stringify(appState.cart)); await _renderCartDrawer(); updateBadges(); }
        });
    });
    itemsEl?.querySelectorAll("[data-cart-dec]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const idx = parseInt(btn.dataset.cartDec);
            const item = appState.cart[idx];
            if (item) { item.quantity--; if (item.quantity <= 0) appState.cart.splice(idx, 1); localStorage.setItem("shibani_cart", JSON.stringify(appState.cart)); await _renderCartDrawer(); updateBadges(); }
        });
    });
    itemsEl?.querySelectorAll("[data-cart-remove]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const idx = parseInt(btn.dataset.cartRemove);
            appState.cart.splice(idx, 1);
            localStorage.setItem("shibani_cart", JSON.stringify(appState.cart));
            await _renderCartDrawer();
            updateBadges();
        });
    });

    _updateShippingProgress(total);
}

function _updateShippingProgress(total) {
    const threshold = Number(appState.settings.delivery_fee_threshold) || 999;
    const progressEl = document.getElementById("shippingProgressBar");
    const textEl = document.getElementById("shippingProgressText");
    const remainingEl = document.getElementById("shippingRemaining");
    if (!progressEl) return;
    if (total >= threshold) {
        progressEl.style.width = "100%";
        if (textEl) textEl.textContent = "You've unlocked free shipping!";
    } else {
        progressEl.style.width = Math.min((total / threshold) * 100, 99) + "%";
        if (remainingEl) remainingEl.textContent = (threshold - total).toLocaleString("en-IN");
    }
}

function _initCartIconTrigger() {
    const cartBtn = document.getElementById("cartIconBtn");
    if (cartBtn) cartBtn.addEventListener("click", () => { if (window.openCartDrawer) window.openCartDrawer(); });
    const mobileCartBtn = document.getElementById("mobileCartBtn");
    if (mobileCartBtn) mobileCartBtn.addEventListener("click", () => { if (window.openCartDrawer) window.openCartDrawer(); });
}

function _initMobileNav() {
    const profileBtn = document.getElementById("mobileProfileBtn");
    if (profileBtn) profileBtn.addEventListener("click", () => { window.location.href = "/profile"; });
    let lastScroll = 0;
    const nav = document.getElementById("mobileBottomNav");
    if (!nav) return;
    window.addEventListener("scroll", () => {
        const current = window.scrollY;
        if (current > lastScroll && current > 100) nav.classList.add("hidden-nav");
        else nav.classList.remove("hidden-nav");
        lastScroll = current;
    }, { passive: true });
}

function _setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.body.setAttribute("data-theme", theme);
    try { localStorage.setItem("shibani-theme", theme); } catch (_) {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === "dark" ? "#0a0a0a" : "#ffffff";
}

function _applyTheme() {
    let theme = "light";
    try { theme = localStorage.getItem("shibani-theme") || "light"; } catch (_) {}
    _setTheme(theme);
    const icon = document.getElementById("themeIcon");
    if (icon) icon.className = theme === "dark" ? "fa-regular fa-sun text-base" : "fa-regular fa-moon text-base";
}

function _initThemeToggle() {
    const btn = document.getElementById("themeToggle");
    const icon = document.getElementById("themeIcon");
    if (!btn) return;
    btn.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme") || document.body.getAttribute("data-theme") || "light";
        const next = current === "dark" ? "light" : "dark";
        _setTheme(next);
        if (icon) icon.className = next === "dark" ? "fa-regular fa-sun text-base" : "fa-regular fa-moon text-base";
    });
}

function _initScrollReveal() {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) { entry.target.classList.add("visible"); observer.unobserve(entry.target); }
        });
    }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });
    document.querySelectorAll(".reveal").forEach(el => observer.observe(el));
}

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

async function initGlobal() {
    _initUserDropdown();
    _initMobileMenu();
    _initSearchSubmit();
    _initCartDrawer();
    _initCartIconTrigger();
    _initMobileNav();
    _initThemeToggle();
    _initScrollReveal();
    _initHeaderScroll();
    _applyTheme();
    updateBadges();
    initSearchSuggestions();

    ["globalLogoutBtn", "adminLogoutBtn", "adminMobileLogoutBtn"].forEach(id => {
        document.getElementById(id)?.addEventListener("click", _logoutHandler);
    });

    const newsForm = document.getElementById("newsletterForm");
    if (newsForm) {
        newsForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const input = newsForm.querySelector('input[type="email"]');
            if (input?.value) showToast("Subscribed! Thank you.");
            newsForm.reset();
        });
    }

    try {
        const data = await api("/api/me");
        if (data && data.user) {
            appState.user = data.user;
            try {
                const wishData = await api("/api/wishlist");
                if (wishData && wishData.wishlist) {
                    appState.wishlist = wishData.wishlist.map(p => p.id);
                    localStorage.setItem("shibani_wishlist", JSON.stringify(appState.wishlist));
                }
            } catch (_) {}
        }
    } catch (_) {}
}

// --- SEARCH SUGGESTIONS ---
function initSearchSuggestions() {
    const input = document.getElementById("globalSearchInput");
    const mobileInput = document.getElementById("mobileSearchInput");
    const desktopDrop = document.getElementById("searchSuggestions");
    const mobileDrop = document.getElementById("mobileSearchSuggestions");
    if (!input && !mobileInput) return;
    
    let debounceTimer;
    const handler = (value) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const dropdown = input === document.activeElement ? desktopDrop : mobileDrop;
            renderSuggestions(value, dropdown || desktopDrop);
        }, 250);
    };
    
    if (input && desktopDrop) {
        input.addEventListener("input", () => handler(input.value));
        input.addEventListener("keydown", (e) => handleSearchKeydown(e, desktopDrop, input));
        input.addEventListener("blur", () => setTimeout(() => desktopDrop.classList.add("hidden"), 200));
        input.addEventListener("focus", () => { if (input.value.trim()) desktopDrop.classList.remove("hidden"); });
    }
    if (mobileInput && mobileDrop) {
        mobileInput.addEventListener("input", () => handler(mobileInput.value));
        mobileInput.addEventListener("keydown", (e) => handleSearchKeydown(e, mobileDrop, mobileInput));
        mobileInput.addEventListener("blur", () => setTimeout(() => mobileDrop.classList.add("hidden"), 200));
        mobileInput.addEventListener("focus", () => { if (mobileInput.value.trim()) mobileDrop.classList.remove("hidden"); });
    }
}

function renderSuggestions(query, dropdown) {
    if (!query || !query.trim()) { dropdown.classList.add("hidden"); return; }
    const q = query.trim().toLowerCase();
    const products = appState.products || [];
    const matches = products.filter(p =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q)
    ).slice(0, 8);
    
    if (matches.length === 0) {
        dropdown.innerHTML = `<div class="px-4 py-3 text-xs text-neutral-400 uppercase tracking-wider">No results found</div>`;
    } else {
        dropdown.innerHTML = matches.map((p, i) => `
            <div class="search-suggestion flex items-center gap-3 px-4 py-2.5 border-b border-neutral-50 last:border-0" data-index="${i}" data-href="/product/${p.id}">
                <img src="${escapeHTML((parseProductImages(p.image, p.images)[0]) || '')}" class="w-9 h-11 object-cover rounded flex-shrink-0" onerror="this.style.display='none'" />
                <div class="flex-grow min-w-0">
                    <p class="text-xs font-semibold text-neutral-800 truncate uppercase tracking-wider">${escapeHTML(p.name)}</p>
                    <p class="text-[10px] text-neutral-400 uppercase tracking-wider">${p.category} — ${formatPrice(p.price)}</p>
                </div>
            </div>
        `).join("");
        dropdown.querySelectorAll(".search-suggestion").forEach(el => {
            el.addEventListener("click", () => {
                window.location.href = el.dataset.href;
                dropdown.classList.add("hidden");
            });
            el.addEventListener("mouseenter", () => {
                dropdown.querySelectorAll(".search-suggestion").forEach(e => e.classList.remove("active"));
                el.classList.add("active");
            });
        });
    }
    dropdown.classList.remove("hidden");
}

function handleSearchKeydown(e, dropdown, input) {
    const items = dropdown.querySelectorAll(".search-suggestion");
    if (items.length === 0) return;
    let idx = Array.from(items).findIndex(el => el.classList.contains("active"));
    if (e.key === "ArrowDown") {
        e.preventDefault();
        idx = Math.min(idx + 1, items.length - 1);
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        idx = Math.max(idx - 1, 0);
    } else if (e.key === "Enter" && idx >= 0) {
        e.preventDefault();
        window.location.href = items[idx].dataset.href;
        dropdown.classList.add("hidden");
        return;
    } else if (e.key === "Escape") {
        dropdown.classList.add("hidden");
        return;
    } else return;
    items.forEach(el => el.classList.remove("active"));
    items[idx].classList.add("active");
}





// --- IMAGE ZOOM (product detail page) ---
function initImageZoom() {
    const container = document.querySelector(".zoom-container");
    const img = document.getElementById("detailMainImage");
    const lens = document.getElementById("imageZoomLens");
    if (!container || !img || !lens) return;
    const lensSize = 120;
    
    container.addEventListener("mouseenter", () => {
        if (window.innerWidth < 768) return;
        lens.classList.remove("hidden");
        lens.style.backgroundImage = `url(${img.src})`;
        const bgW = img.naturalWidth * 2;
        const bgH = img.naturalHeight * 2;
        lens.style.backgroundSize = `${bgW}px ${bgH}px`;
    });
    
    container.addEventListener("mousemove", (e) => {
        if (window.innerWidth < 768) return;
        const rect = container.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        const lx = Math.max(0, Math.min(e.clientX - rect.left - lensSize / 2, rect.width - lensSize));
        const ly = Math.max(0, Math.min(e.clientY - rect.top - lensSize / 2, rect.height - lensSize));
        lens.style.left = lx + "px";
        lens.style.top = ly + "px";
        const bgW = img.naturalWidth * 2;
        const bgH = img.naturalHeight * 2;
        const posX = (x / 100) * bgW;
        const posY = (y / 100) * bgH;
        lens.style.backgroundPosition = `-${posX - lensSize / 2}px -${posY - lensSize / 2}px`;
    });
    
    container.addEventListener("mouseleave", () => {
        lens.classList.add("hidden");
    });
}


// --- PERSONALIZED RECOMMENDATIONS ---
function loadRecommendations(currentProductId) {
    const section = document.getElementById("recommendationsSection");
    const grid = document.getElementById("recommendationsGrid");
    const heading = document.getElementById("recommendationsHeading");
    if (!section || !grid) return;
    
    const recentIds = safeParseJSON(localStorage.getItem("shibani_recent_viewed"), []);
    const products = appState.products || [];
    
    // Gather categories from recently viewed items (excluding current product)
    const recentCategories = new Set();
    recentIds.filter(id => id !== currentProductId).forEach(id => {
        const p = products.find(pr => pr.id === id);
        if (p && p.category) recentCategories.add(p.category);
    });
    
    // Also add the current product's category
    const currentProduct = products.find(p => p.id === currentProductId);
    if (currentProduct && currentProduct.category) {
        recentCategories.add(currentProduct.category);
    }
    
    if (recentCategories.size === 0) { section.classList.add("hidden"); return; }
    
    // Find products in those categories, excluding already viewed and current
    const excludeIds = new Set(recentIds);
    excludeIds.add(currentProductId);
    
    let recs = products.filter(p =>
        recentCategories.has(p.category) && !excludeIds.has(p.id)
    );
    
    // Sort by rating for quality
    recs.sort((a, b) => b.rating - a.rating);
    recs = recs.slice(0, 6);
    
    if (recs.length === 0) { section.classList.add("hidden"); return; }
    
    const catArr = Array.from(recentCategories);
    if (heading) {
        heading.textContent = catArr.length === 1
            ? `More from ${catArr[0].charAt(0).toUpperCase() + catArr[0].slice(1)} Collection`
            : "Recommended For You";
    }
    
    section.classList.remove("hidden");
    grid.innerHTML = recs.map(p => renderProductCard(p)).join("");
    attachCardEvents(grid);
}


function updateBadges() {
    const cartQty = appState.cart.reduce((sum, item) => sum + item.quantity, 0);
    const wishQty = appState.wishlist.length;

    const badgeIds = ["cartBadge", "wishlistBadge", "mobileCartBadge"];
    const qtys = { cartBadge: cartQty, wishlistBadge: wishQty, mobileCartBadge: cartQty };

    badgeIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const qty = qtys[id] || 0;
        el.textContent = qty;
        if (qty > 0) { el.classList.remove("scale-0"); el.classList.add("scale-100"); }
        else { el.classList.remove("scale-100"); el.classList.add("scale-0"); }
    });
}

// Global Cart and Wishlist triggers
function toggleWishlistItem(productId) {
    const idx = appState.wishlist.indexOf(Number(productId));
    if (idx > -1) {
        appState.wishlist.splice(idx, 1);
        showToast("Removed from wishlist");
    } else {
        appState.wishlist.push(Number(productId));
        showToast("Added to wishlist!");
    }
    localStorage.setItem("shibani_wishlist", JSON.stringify(appState.wishlist));
    updateBadges();
    
    // Sync with database if logged in
    if (appState.user) {
        api("/api/wishlist", {
            method: "POST",
            body: JSON.stringify({ product_id: Number(productId) })
        }).catch(err => console.warn("Failed to sync wishlist toggle with database:", err));
    }
    
    // Update active state in document if present
    document.querySelectorAll(`[data-wishlist-id="${productId}"]`).forEach(btn => {
        btn.classList.toggle("text-rose-500");
        btn.classList.toggle("text-slate-400");
    });
    
    // Auto-update UI if on the My Wishlist page
    if (window.location.pathname === "/wishlist") {
        initWishlist();
    }
}

function addToCart(productId, quantity = 1, size = "M", color = "Default") {
    const existing = appState.cart.find(item => item.product_id === Number(productId) && item.size === size && item.color === color);
    if (existing) {
        existing.quantity += quantity;
    } else {
        appState.cart.push({ product_id: Number(productId), quantity, size, color });
    }
    localStorage.setItem("shibani_cart", JSON.stringify(appState.cart));
    showToast("Added to shopping bag!");
    updateBadges();
}


// --- 1. HOMEPAGE CONTROLLER ---
async function initHome() {
    const container = document.getElementById("featuredProductsGrid");
    if (!container) return;
    
    try {
        const data = await api("/api/products");
        if (data && data.products) {
            appState.products = data.products;
            
            // Render top 4 rated products
            const topProducts = [...data.products]
                .sort((a, b) => b.rating - a.rating)
                .slice(0, 4);
                
            container.innerHTML = topProducts.map(p => renderProductCard(p)).join("");
            attachCardEvents(container);
        }
    } catch (err) {
        container.innerHTML = `<p class="col-span-full text-center text-slate-400 font-semibold py-8">Failed to load best sellers.</p>`;
    }
}

function renderProductCard(product) {
    const isWishlisted = (appState.wishlist || []).includes(product.id);
    const parsedImages = parseProductImages(product.image, product.images);
    const mainImg = parsedImages[0] || 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=400';
    const secondaryImg = parsedImages[1] || null;
    
    const sizes = (product.size || "").split(",").map(s => s.trim()).filter(Boolean);
    const firstSize = sizes[0] || "M";
    
    return `
    <div class="bg-white border border-neutral-100 flex flex-col justify-between group h-full relative" data-product-card-id="${product.id}">
        <!-- Wishlist toggle -->
        <button type="button" class="wishlist-card-toggle absolute top-4 right-4 z-20 p-2 text-neutral-400 hover:text-neutral-900 transition duration-300 ${isWishlisted ? 'text-rose-500 hover:text-rose-600' : 'text-neutral-400'}" data-wishlist-id="${product.id}">
            <i class="fa-solid fa-heart text-base"></i>
        </button>
        
        <!-- Aspect 3/4 Image Container with Double-Image Hover Swap -->
        <div class="relative aspect-[3/4] overflow-hidden bg-neutral-50 cursor-pointer group/image" onclick="window.location.href='/product/${Number(product.id)}'">
            <img src="${mainImg}" alt="${escapeHTML(product.name)}" loading="lazy" class="w-full h-full object-cover object-top transition duration-700 ease-in-out group-hover:scale-102" />
            ${secondaryImg ? `
            <img src="${secondaryImg}" alt="${escapeHTML(product.name)}" loading="lazy" class="absolute inset-0 w-full h-full object-cover object-top opacity-0 transition-opacity duration-700 ease-in-out group-hover:opacity-100 group-hover:scale-102" />
            ` : ''}
            <!-- Quick View overlay -->
            <div class="absolute inset-0 bg-black/0 group-hover/image:bg-black/20 transition-all duration-500 flex items-center justify-center opacity-0 group-hover/image:opacity-100 z-10" onclick="event.stopPropagation()">
                <button type="button" class="quick-view-btn px-5 py-2.5 bg-white text-neutral-900 font-bold text-[10px] uppercase tracking-widest shadow-lg hover:bg-neutral-100 transition" data-quick-view-id="${product.id}" onclick="event.stopPropagation(); openQuickView(${Number(product.id)})">
                    <i class="fa-regular fa-eye mr-1.5"></i> Quick View
                </button>
            </div>
            
            ${product.badge ? `
            <span class="absolute top-4 left-4 bg-neutral-900 text-white font-light text-[9px] px-2.5 py-1 uppercase tracking-widest z-10">
                ${product.badge}
            </span>` : ''}
        </div>
        
        <!-- Info & Controls -->
        <div class="p-4 sm:p-5 space-y-3 flex-grow flex flex-col justify-between">
            <div class="space-y-1">
                <div class="flex justify-between items-center text-[10px] font-light text-neutral-400 uppercase tracking-widest">
                    <span>${product.category}</span>
                    <span class="text-neutral-500 flex items-center gap-1"><i class="fa-solid fa-star text-[9px]"></i> ${product.rating}</span>
                </div>
                <h3 class="font-medium text-neutral-900 text-xs uppercase tracking-wider group-hover:text-neutral-600 transition duration-300 line-clamp-1 cursor-pointer" onclick="window.location.href='/product/${Number(product.id)}'">
                    ${escapeHTML(product.name)}
                </h3>
            </div>
            
            <div class="space-y-3 pt-2 border-t border-neutral-100">
                <div class="flex justify-between items-baseline">
                    <strong class="text-neutral-900 font-medium text-sm tracking-wider">${formatPrice(product.price)}</strong>
                    ${product.old_price > product.price ? `
                    <span class="text-[10px] text-neutral-400 line-through tracking-wider">${formatPrice(product.old_price)}</span>` : ''}
                </div>
                
                <!-- Bottom Action Row -->
                <div class="flex gap-2">
                    <button type="button" class="add-to-cart-quick-btn flex-grow py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-light text-[10px] uppercase tracking-widest transition duration-300" 
                            data-quick-cart-id="${product.id}" data-size="${firstSize}" data-color="${product.color || 'Default'}">
                        ADD TO BAG
                    </button>
                    <!-- Compare check -->
                    <label class="flex items-center gap-1.5 px-3 border border-neutral-200 hover:border-neutral-400 bg-neutral-50 cursor-pointer text-[10px] font-light tracking-widest text-neutral-500 uppercase transition">
                        <input type="checkbox" class="compare-checkbox-quick w-3 h-3 accent-black border-neutral-300 rounded-none focus:ring-0" data-compare-id="${product.id}" />
                        <span>COMPARE</span>
                    </label>
                </div>
            </div>
        </div>
    </div>
    `;
}


function parseProductImages(fallbackImg, imagesJson) {
    let list = [];
    if (Array.isArray(imagesJson)) {
        list = imagesJson;
    } else {
        try {
            list = JSON.parse(imagesJson || "[]");
        } catch (e) {}
    }
    if (fallbackImg && Array.isArray(list) && !list.includes(fallbackImg)) {
        list.unshift(fallbackImg);
    }
    return list.filter(Boolean);
}

function populateColorFilters(products) {
    const container = document.getElementById("shopColorFiltersContainer");
    if (!container) return;
    const colorSet = new Set();
    products.forEach(p => {
        const c = (p.color || "").trim();
        if (c) colorSet.add(c);
    });
    const colors = Array.from(colorSet).sort();
    if (colors.length === 0) { container.parentElement.classList.add("hidden"); return; }
    container.parentElement.classList.remove("hidden");
    container.innerHTML = colors.map(c => `
        <button type="button" class="color-filter-btn border border-neutral-200 text-neutral-800 text-[10px] tracking-widest px-3 py-1.5 uppercase hover:border-neutral-900 transition duration-200" data-color="${escapeHTML(c)}">${escapeHTML(c)}</button>
    `).join("");
}

function attachCardEvents(container) {
    // 1. Wishlist buttons
    container.querySelectorAll(".wishlist-card-toggle").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleWishlistItem(btn.dataset.wishlistId);
        });
    });
    
    // 2. Add to Cart buttons
    container.querySelectorAll(".add-to-cart-quick-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            addToCart(btn.dataset.quickCartId, 1, btn.dataset.size, btn.dataset.color);
        });
    });
    
    // 3. Compare checkbox trigger
    container.querySelectorAll(".compare-checkbox-quick").forEach(cb => {
        // Init checked state from comparison list
        cb.checked = (appState.compareList || []).includes(Number(cb.dataset.compareId));
        
        cb.addEventListener("change", () => {
            const pId = Number(cb.dataset.compareId);
            if (cb.checked) {
                if (appState.compareList.length >= 3) {
                    cb.checked = false;
                    showToast("You can compare a maximum of 3 items.", "error");
                    return;
                }
                appState.compareList.push(pId);
            } else {
                const idx = appState.compareList.findIndex(id => Number(id) === Number(pId));
                if (idx > -1) appState.compareList.splice(idx, 1);
            }
            localStorage.setItem("shibani_compare", JSON.stringify(appState.compareList));
            updateCompareDrawer();
        });
    });
}


// --- 2. SHOP CATALOG CONTROLLER ---
async function initShop() {
    const container = document.getElementById("shopProductsGrid");
    if (!container) return;
    
    // 1. Parse search query from URL
    const urlParams = new URLSearchParams(window.location.search);
    const searchVal = urlParams.get("q") || "";
    const categoryVal = urlParams.get("category") || "";
    
    // Set checkbox checked based on URL
    if (categoryVal) {
        document.querySelectorAll(`input[name="categoryFilter"][value="${CSS.escape(categoryVal)}"]`).forEach(cb => cb.checked = true);
    }
    
    // 2. Fetch products
    try {
        const data = await api("/api/products");
        if (data && data.products) {
            appState.products = data.products;
            populateColorFilters(data.products);
            filterAndRenderShop(searchVal);
        }
    } catch (err) {
        console.error("Error loading shop catalog:", err);
        container.innerHTML = `<p class="col-span-full text-center text-slate-400 font-semibold py-12">Failed to load catalog. Detail: ${escapeHTML(err.message || String(err))}</p>`;
    }
    
    // 3. Attach filter changes listeners
    document.querySelectorAll('input[name="categoryFilter"]').forEach(cb => {
        cb.addEventListener("change", () => filterAndRenderShop(""));
    });
    
    const priceSlider = document.getElementById("priceRangeFilter");
    const priceValLabel = document.getElementById("priceRangeValue");
    if (priceSlider && priceValLabel) {
        priceSlider.addEventListener("input", () => {
            priceValLabel.textContent = formatPrice(priceSlider.value);
            filterAndRenderShop("");
        });
    }
    
    document.querySelectorAll(".size-filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            btn.classList.toggle("bg-neutral-900");
            btn.classList.toggle("text-white");
            btn.classList.toggle("border-neutral-900");
            filterAndRenderShop("");
        });
    });
    
    // Color filter toggles
    document.querySelectorAll(".color-filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            btn.classList.toggle("bg-neutral-900");
            btn.classList.toggle("text-white");
            btn.classList.toggle("border-neutral-900");
            filterAndRenderShop("");
        });
    });
    
    // Rating filter toggles (single select)
    document.querySelectorAll(".rating-filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const wasActive = btn.classList.contains("bg-neutral-900");
            document.querySelectorAll(".rating-filter-btn").forEach(b => {
                b.classList.remove("bg-neutral-900", "text-white", "border-neutral-900");
                b.classList.add("border-neutral-200", "text-neutral-800");
            });
            if (!wasActive) {
                btn.classList.add("bg-neutral-900", "text-white", "border-neutral-900");
                btn.classList.remove("border-neutral-200", "text-neutral-800");
            }
            filterAndRenderShop("");
        });
    });
    
    // Stock toggle
    const stockToggle = document.getElementById("inStockOnlyFilter");
    if (stockToggle) stockToggle.addEventListener("change", () => filterAndRenderShop(""));
    
    const sortSelect = document.getElementById("shopSortSelect");
    if (sortSelect) {
        sortSelect.addEventListener("change", () => filterAndRenderShop(""));
    }
    
    const clearBtn = document.getElementById("clearFiltersBtn");
    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            document.querySelectorAll('input[name="categoryFilter"]').forEach(cb => cb.checked = false);
            if (priceSlider) {
                priceSlider.value = 15000;
                priceValLabel.textContent = formatPrice(15000);
            }
            document.querySelectorAll(".size-filter-btn").forEach(btn => {
                btn.classList.remove("bg-neutral-900", "text-white", "border-neutral-900");
            });
            document.querySelectorAll(".color-filter-btn").forEach(btn => {
                btn.classList.remove("bg-neutral-900", "text-white", "border-neutral-900");
                btn.classList.add("border-neutral-200", "text-neutral-800");
            });
            document.querySelectorAll(".rating-filter-btn").forEach(btn => {
                btn.classList.remove("bg-neutral-900", "text-white", "border-neutral-900");
                btn.classList.add("border-neutral-200", "text-neutral-800");
            });
            const stockToggle = document.getElementById("inStockOnlyFilter");
            if (stockToggle) stockToggle.checked = false;
            if (sortSelect) sortSelect.value = "default";
            filterAndRenderShop("");
        });
    }
    
    // Initial comparison drawer update
    updateCompareDrawer();
}

function filterAndRenderShop(searchQuery = "") {
    const container = document.getElementById("shopProductsGrid");
    const emptyState = document.getElementById("shopEmptyProducts");
    const countLabel = document.getElementById("shopProductCount");
    if (!container) return;
    
    // 1. Gather filter states
    const selectedCategories = Array.from(document.querySelectorAll('input[name="categoryFilter"]:checked')).map(cb => cb.value);
    const maxPrice = Number(document.getElementById("priceRangeFilter")?.value || 15000);
    const selectedSizes = Array.from(document.querySelectorAll(".size-filter-btn.bg-neutral-900")).map(btn => btn.dataset.size);
    const sortMode = document.getElementById("shopSortSelect")?.value || "default";
    const selectedColors = Array.from(document.querySelectorAll(".color-filter-btn.bg-neutral-900")).map(btn => btn.dataset.color);
    const minRating = Number(document.querySelector(".rating-filter-btn.bg-neutral-900")?.dataset.rating || 0);
    const inStockOnly = document.getElementById("inStockOnlyFilter")?.checked || false;
    
    // 2. Filter products list
    let filtered = [...appState.products];
    
    // Filter by search query
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(p => (p.name || "").toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q));
    }
    
    // Filter by category
    if (selectedCategories.length > 0) {
        filtered = filtered.filter(p => selectedCategories.includes(p.category));
    }
    
    // Filter by max price
    filtered = filtered.filter(p => p.price <= maxPrice);
    
    // Filter by size
    if (selectedSizes.length > 0) {
        filtered = filtered.filter(p => {
            const sizesList = (p.size || "").split(",").map(s => s.trim().toUpperCase());
            return selectedSizes.some(sz => sizesList.includes(sz));
        });
    }
    
    // Filter by color
    if (selectedColors.length > 0) {
        filtered = filtered.filter(p => {
            const pColors = (p.color || "").toLowerCase().split(/[,;\/]/).map(s => s.trim()).filter(Boolean);
            return selectedColors.some(c => pColors.some(pc => pc === c.toLowerCase()));
        });
    }
    
    // Filter by min rating
    if (minRating > 0) {
        filtered = filtered.filter(p => Number(p.rating) >= minRating);
    }
    
    // Filter by stock availability
    if (inStockOnly) {
        filtered = filtered.filter(p => (p.stock || "").toLowerCase() !== "out of stock");
    }
    
    // 3. Sort list
    if (sortMode === "price-asc") {
        filtered.sort((a, b) => a.price - b.price);
    } else if (sortMode === "price-desc") {
        filtered.sort((a, b) => b.price - a.price);
    } else if (sortMode === "rating-desc") {
        filtered.sort((a, b) => b.rating - a.rating);
    } else if (sortMode === "name-asc") {
        filtered.sort((a, b) => a.name.localeCompare(b.name));
    }
    
    // 4. Render results
    countLabel.textContent = filtered.length;
    
    if (filtered.length === 0) {
        container.innerHTML = "";
        emptyState.classList.remove("hidden");
    } else {
        emptyState.classList.add("hidden");
        container.innerHTML = filtered.map(p => renderProductCard(p)).join("");
        attachCardEvents(container);
    }
}

// Comparison Drawer and side-by-side Table logic
let _compareTimer = null;

function updateCompareDrawer() {
    const drawer = document.getElementById("compareDrawer");
    const countLabel = document.getElementById("compareCountLabel");
    const body = document.getElementById("compareDrawerBody");
    const wishlistCompareBtn = document.getElementById("compareWishlistBtn");
    
    if (!drawer || !body) return;
    
    const count = appState.compareList.length;
    if (countLabel) countLabel.textContent = `${count}/3`;
    
    if (wishlistCompareBtn) {
        wishlistCompareBtn.textContent = `Compare Selected (${count}/3)`;
        wishlistCompareBtn.disabled = count < 2;
    }
    
    if (count === 0) {
        drawer.classList.add("translate-y-full", "opacity-0");
        _compareTimer = setTimeout(() => { drawer.classList.add("hidden"); drawer.classList.remove("opacity-0"); }, 300);
        return;
    }
    
    if (_compareTimer) { clearTimeout(_compareTimer); _compareTimer = null; }
    drawer.classList.remove("hidden");
    setTimeout(() => drawer.classList.remove("translate-y-full"), 10);
    
    // Get full product objects to compare
    const productsToCompare = appState.compareList.map(id => appState.products.find(p => p.id === id)).filter(Boolean);
    
    if (productsToCompare.length < 2) {
        body.innerHTML = `
        <div class="text-center py-8 text-slate-400 font-semibold">
            <i class="fa-solid fa-circle-info text-indigo-500 mb-2 block text-lg"></i>
            Select at least 2 items to compare side-by-side specs.
        </div>`;
        return;
    }
    
    // Draw spec table columns
    body.innerHTML = `
    <div class="grid grid-cols-${productsToCompare.length + 1} gap-6 text-sm font-semibold divide-x divide-slate-100 text-slate-600">
        <!-- Labels column -->
        <div class="space-y-4 pr-4">
            <div class="h-40 flex items-end font-bold text-slate-800 uppercase tracking-wider text-xs">Product Details</div>
            <div class="py-2 border-b border-slate-50">Price</div>
            <div class="py-2 border-b border-slate-50">Category</div>
            <div class="py-2 border-b border-slate-50">Rating</div>
            <div class="py-2 border-b border-slate-50">Colors</div>
            <div class="py-2 border-b border-slate-50">Sizes</div>
            <div class="py-2">Stock</div>
        </div>
        
        <!-- Products columns -->
        ${productsToCompare.map(p => {
            const parsedImages = parseProductImages(p.image, p.images);
            return `
            <div class="space-y-4 pl-6 relative">
                <!-- Quick Remove -->
                <button onclick="removeCompareItem(${Number(p.id)})" class="absolute top-0 right-0 p-1 text-slate-400 hover:text-rose-500 transition"><i class="fa-solid fa-circle-xmark"></i></button>
                <div class="h-40 flex flex-col justify-end gap-2">
                    <img src="${escapeHTML(parsedImages[0] || 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=100')}" class="w-16 h-16 rounded-xl object-cover" />
                    <h4 class="font-bold text-slate-800 line-clamp-2 leading-tight">${escapeHTML(p.name)}</h4>
                </div>
                <div class="py-2 border-b border-slate-50 text-indigo-600 font-extrabold">${formatPrice(p.price)}</div>
                <div class="py-2 border-b border-slate-50 uppercase">${p.category}</div>
                <div class="py-2 border-b border-slate-50 text-amber-500"><i class="fa-solid fa-star"></i> ${p.rating}</div>
                <div class="py-2 border-b border-slate-50 truncate">${escapeHTML(p.color)}</div>
                <div class="py-2 border-b border-slate-50 truncate">${escapeHTML(p.size)}</div>
                <div class="py-2 font-bold ${p.stock === 'In stock' ? 'text-emerald-500' : 'text-amber-500'}">${p.stock}</div>
            </div>`;
        }).join("")}
    </div>`;
}

function removeCompareItem(productId) {
    const idx = appState.compareList.findIndex(id => Number(id) === Number(productId));
    if (idx > -1) {
        appState.compareList.splice(idx, 1);
        localStorage.setItem("shibani_compare", JSON.stringify(appState.compareList));
        updateCompareDrawer();
        
        // Uncheck matching checkboxes on screen
        document.querySelectorAll(`.compare-checkbox-quick[data-compare-id="${productId}"]`).forEach(cb => cb.checked = false);
    }
}

// Bind closures to global window scope
window.removeCompareItem = removeCompareItem;


// --- QUICK VIEW MODAL CONTROLLER ---
function openQuickView(productId) {
    const modal = document.getElementById("quickViewModal");
    if (!modal) return;
    const product = appState.products.find(p => p.id === productId);
    if (!product) return;
    
    const parsedImages = parseProductImages(product.image, product.images);
    
    // Set images
    const mainImg = document.getElementById("qvMainImage");
    if (mainImg) {
        mainImg.src = parsedImages[0] || 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600';
        mainImg.alt = product.name || '';
    }
    
    // Badge
    const badge = document.getElementById("qvBadge");
    if (badge) {
        if (product.badge) {
            badge.textContent = product.badge;
            badge.classList.remove("hidden");
        } else {
            badge.classList.add("hidden");
        }
    }
    
    // Thumbnails
    const thumbContainer = document.getElementById("qvThumbnails");
    if (thumbContainer) {
        if (parsedImages.length > 1) {
            thumbContainer.innerHTML = parsedImages.map((img, i) => `
                <button type="button" class="qv-thumb w-14 h-16 overflow-hidden border ${i === 0 ? 'border-neutral-900' : 'border-neutral-200'} bg-white flex-shrink-0" data-img="${img}">
                    <img src="${img}" alt="" class="w-full h-full object-cover object-top" />
                </button>
            `).join("");
            // Thumbnail click
            thumbContainer.querySelectorAll(".qv-thumb").forEach(btn => {
                btn.addEventListener("click", () => {
                    thumbContainer.querySelectorAll(".qv-thumb").forEach(b => b.classList.replace("border-neutral-900", "border-neutral-200"));
                    btn.classList.replace("border-neutral-200", "border-neutral-900");
                    if (mainImg) mainImg.src = btn.dataset.img;
                });
            });
        } else {
            thumbContainer.innerHTML = "";
        }
    }
    
    // Category
    const cat = document.getElementById("qvCategory");
    if (cat) cat.textContent = `COLLECTION / ${product.category || ''}`;
    
    // Name
    const name = document.getElementById("qvName");
    if (name) name.textContent = product.name || '';
    
    // Price
    const price = document.getElementById("qvPrice");
    if (price) price.textContent = formatPrice(product.price);
    
    // Old price / save badge
    const oldPrice = document.getElementById("qvOldPrice");
    const saveBadge = document.getElementById("qvSaveBadge");
    if (oldPrice && saveBadge) {
        if (product.old_price && Number(product.old_price) > Number(product.price)) {
            oldPrice.textContent = formatPrice(product.old_price);
            oldPrice.classList.remove("hidden");
            const pct = Math.round((1 - Number(product.price) / Number(product.old_price)) * 100);
            saveBadge.textContent = `Save ${pct}%`;
            saveBadge.classList.remove("hidden");
        } else {
            oldPrice.classList.add("hidden");
            saveBadge.classList.add("hidden");
        }
    }
    
    // Description
    const desc = document.getElementById("qvDescription");
    if (desc) desc.textContent = product.description || 'Premium quality apparel. Carefully chosen fabric tailored with style and care.';
    
    // Stock
    const stock = document.getElementById("qvStock");
    if (stock) {
        const isOut = (product.stock || '').toLowerCase() === 'out of stock';
        const isLimited = (product.stock || '').toLowerCase() === 'limited stock';
        stock.textContent = product.stock || 'In stock';
        stock.className = `inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
            isOut ? 'bg-rose-50 text-rose-600' : isLimited ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
        }`;
    }
    
    // Sizes
    const sizesContainer = document.getElementById("qvSizes");
    if (sizesContainer) {
        const sizes = (product.size || "").split(",").map(s => s.trim()).filter(Boolean);
        sizesContainer.innerHTML = sizes.map((sz, i) => `
            <button type="button" class="qv-size-btn px-4 py-2 border text-[10px] tracking-widest uppercase transition duration-200 ${
                i === 0 ? 'border-neutral-900 bg-neutral-900 text-white font-bold' : 'border-neutral-200 text-neutral-800 hover:border-neutral-900'
            }" data-size="${sz}">${sz}</button>
        `).join("");
        sizesContainer.querySelectorAll(".qv-size-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                sizesContainer.querySelectorAll(".qv-size-btn").forEach(b => {
                    b.classList.remove("border-neutral-900", "bg-neutral-900", "text-white", "font-bold");
                    b.classList.add("border-neutral-200", "text-neutral-800");
                });
                btn.classList.add("border-neutral-900", "bg-neutral-900", "text-white", "font-bold");
                btn.classList.remove("border-neutral-200", "text-neutral-800");
            });
        });
    }
    
    // Store product data on modal for add to cart/wishlist
    modal.dataset.productId = productId;
    
    // Set full details link
    const fullLink = document.getElementById("qvFullDetails");
    if (fullLink) fullLink.href = `/product/${productId}`;
    
    // Show modal
    modal.classList.remove("hidden");
    modal.classList.add("open");
}

function closeQuickView() {
    const modal = document.getElementById("quickViewModal");
    if (modal) {
        modal.classList.remove("open");
        setTimeout(() => { modal.classList.add("hidden"); }, 300);
        releaseFocus(modal);
    }
}

// Wire quick view modal events (called once on DOM ready)
function initQuickViewModal() {
    const modal = document.getElementById("quickViewModal");
    if (!modal) return;
    
    // Close button
    const closeBtn = document.getElementById("closeQuickViewBtn");
    if (closeBtn) closeBtn.addEventListener("click", closeQuickView);
    
    // Backdrop click
    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeQuickView();
    });
    
    // Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal.classList.contains("open")) closeQuickView();
    });
    
    // Add to Cart
    const addBtn = document.getElementById("qvAddToCartBtn");
    if (addBtn) {
        addBtn.addEventListener("click", () => {
            const pid = Number(modal.dataset.productId);
            const selectedSizeEl = document.querySelector("#qvSizes .qv-size-btn.border-neutral-900") || document.querySelector("#qvSizes .qv-size-btn");
            const size = selectedSizeEl ? selectedSizeEl.dataset.size : "M";
            addToCart(pid, 1, size, "Default");
            showToast("Added to shopping bag!", "success");
        });
    }
    
    // Wishlist
    const wishBtn = document.getElementById("qvWishlistBtn");
    if (wishBtn) {
        wishBtn.addEventListener("click", () => {
            const pid = Number(modal.dataset.productId);
            toggleWishlistItem(pid);
        });
    }
    
    // Close quick view on full details link
    const fullLink = document.getElementById("qvFullDetails");
    if (fullLink) {
        fullLink.addEventListener("click", () => {
            closeQuickView();
        });
    }
}


// --- 3. PRODUCT DETAIL CONTROLLER ---
async function initProductDetail() {
    const pIdEl = document.getElementById("currentProductId");
    if (!pIdEl) return;
    
    const productId = Number(pIdEl.dataset.id) || 0;
    
    // Track recently viewed
    trackRecentlyViewed(productId);
    
    // Image zoom
    initImageZoom();
    
    // 1. Thumbnail click logic
    document.querySelectorAll(".gallery-thumb").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".gallery-thumb").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const mainImg = document.getElementById("detailMainImage");
            if (mainImg) mainImg.src = btn.dataset.imgSrc;
        });
    });
    
    // 2. Size detail pill select
    document.querySelectorAll(".size-pill").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".size-pill").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
        });
    });
    
    // 3. Add to Cart submit
    const addToCartBtn = document.getElementById("detailAddToCartBtn");
    if (addToCartBtn) {
        addToCartBtn.addEventListener("click", () => {
            const selectedSizeEl = document.querySelector(".size-pill.active");
            const selectedSize = selectedSizeEl ? selectedSizeEl.dataset.size : "M";
            addToCart(productId, 1, selectedSize, "Default");
        });
    }
    
    // 4. Add to Wishlist submit
    const addToWishlistBtn = document.getElementById("detailAddToWishlistBtn");
    if (addToWishlistBtn) {
        addToWishlistBtn.addEventListener("click", () => {
            toggleWishlistItem(productId);
        });
    }
    
    // 5. Fit Finder Modal controls
    const fitFinderModal = document.getElementById("sizeFinderModal");
    const triggerFitBtn = document.getElementById("triggerFitFinderBtn");
    const closeFitBtn = document.getElementById("closeFitFinderBtn");
    
    if (fitFinderModal && triggerFitBtn) {
        triggerFitBtn.addEventListener("click", () => {
            fitFinderModal.classList.remove("hidden");
            fitFinderModal.classList.add("open");
            calculateFitRecommendation();
        });
        
        const closeFitFinder = () => {
            fitFinderModal.classList.remove("open");
            fitFinderModal.classList.add("hidden");
        };

        if (closeFitBtn) {
            closeFitBtn.addEventListener("click", closeFitFinder);
        }

        // Close on clicking the background overlay
        fitFinderModal.addEventListener("click", (e) => {
            if (e.target === fitFinderModal) {
                closeFitFinder();
            }
        });

        // Close on Escape keypress
        if (fitFinderModal._escapeHandler) {
            document.removeEventListener("keydown", fitFinderModal._escapeHandler);
        }
        fitFinderModal._escapeHandler = (e) => {
            if (e.key === "Escape" && fitFinderModal.classList.contains("open")) {
                closeFitFinder();
            }
        };
        document.addEventListener("keydown", fitFinderModal._escapeHandler);
        
        // Modal range sliders events
        const heightSlider = document.getElementById("sfHeight");
        const weightSlider = document.getElementById("sfWeight");
        const fitSelect = document.getElementById("sfFit");
        
        if (heightSlider) heightSlider.addEventListener("input", calculateFitRecommendation);
        if (weightSlider) weightSlider.addEventListener("input", calculateFitRecommendation);
        if (fitSelect) fitSelect.addEventListener("change", calculateFitRecommendation);
        
        const applyFitBtn = document.getElementById("applyFitFinderSizeBtn");
        if (applyFitBtn) {
            applyFitBtn.addEventListener("click", () => {
                const recSize = document.getElementById("sfResultSize")?.textContent || "M";
                const targetPill = Array.from(document.querySelectorAll(".size-pill")).find(pill => pill.dataset.size.toUpperCase() === recSize.toUpperCase());
                if (targetPill) {
                    targetPill.click();
                    showToast(`Applied size ${recSize}!`);
                } else {
                    showToast(`Recommended size ${recSize} not in stock.`, "error");
                }
                closeFitFinder();
            });
        }
    }
    
    // 6. Submit Review Form
    const reviewForm = document.getElementById("submitReviewForm");
    if (reviewForm) {
        reviewForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const ratingEl = document.getElementById("reviewRatingSelect");
            const rating = Number(ratingEl ? ratingEl.value : 3);
            const sizing_fit = document.getElementById("reviewSizingSelect").value;
            const comment = document.getElementById("reviewCommentText").value.trim();
            
            try {
                await api("/api/reviews", {
                    method: "POST",
                    body: JSON.stringify({ product_id: productId, rating, sizing_fit, comment })
                });
                showToast("Review submitted successfully! Pending moderator approval.");
                reviewForm.reset();
            } catch (err) {
                showToast(err.message || "Failed to submit review.", "error");
            }
        });
    }
    
    // 7. Load approved reviews list
    loadProductReviews(productId);
    
    // 8. Track recently viewed products
    
    // 9. Load related and recently viewed grids
    loadRelatedAndRecentlyViewed(productId);
    loadRecommendations(productId);
}

function calculateFitRecommendation() {
    const height = Number(document.getElementById("sfHeight")?.value || 170);
    const weight = Number(document.getElementById("sfWeight")?.value || 65);
    const fit = document.getElementById("sfFit")?.value || "regular";
    
    document.getElementById("sfHeightVal").textContent = `${height} cm`;
    document.getElementById("sfWeightVal").textContent = `${weight} kg`;
    
    // BMI formula Sizing mapping
    const bmi = weight / ((height / 100) ** 2);
    let baseIdx = 2; // Default M
    if (bmi < 18.5) baseIdx = 0; // XS
    else if (bmi < 21.0) baseIdx = 1; // S
    else if (bmi < 24.5) baseIdx = 2; // M
    else if (bmi < 28.0) baseIdx = 3; // L
    else if (bmi < 32.0) baseIdx = 4; // XL
    else baseIdx = 5; // XXL
    
    let recommendedIdx = baseIdx;
    if (fit === "slim") recommendedIdx = Math.max(0, baseIdx - 1);
    else if (fit === "loose") recommendedIdx = Math.min(5, baseIdx + 1);
    
    const sizeNames = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    const resultSize = sizeNames[recommendedIdx];
    
    const resultLabel = document.getElementById("sfResultSize");
    if (resultLabel) resultLabel.textContent = resultSize;
}

async function loadProductReviews(productId) {
    const list = document.getElementById("productReviewsList");
    const countLabel = document.getElementById("reviewsCountLabel");
    if (!list) return;
    
    try {
        const data = await api(`/api/reviews?product_id=${productId}`);
        const reviews = data.reviews || [];
        if (countLabel) countLabel.textContent = reviews.length;
        
        if (reviews.length === 0) {
            list.innerHTML = `<p class="text-slate-400 font-semibold py-8 text-center text-sm">No reviews yet. Be the first to review this cloth!</p>`;
            return;
        }
        
        list.innerHTML = reviews.map(r => `
        <div class="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-3">
            <div class="flex items-center justify-between text-xs font-semibold">
                <div class="flex items-center gap-2">
                    <span class="w-8 h-8 rounded-full bg-slate-100 text-indigo-600 font-extrabold flex items-center justify-center text-xs">
                        ${(r.username || '').slice(0, 2).toUpperCase()}
                    </span>
                    <span class="text-slate-700">${escapeHTML(r.username)}</span>
                </div>
                <div class="flex items-center gap-1.5 text-amber-500">
                    <i class="fa-solid fa-star"></i>
                    <span class="text-slate-700">${r.rating}</span>
                </div>
            </div>
            <p class="text-slate-500 text-sm leading-relaxed">${escapeHTML(r.comment)}</p>
            <div class="flex gap-4 pt-2 border-t border-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Fit: <strong class="text-indigo-600">${escapeHTML(r.sizing_fit)}</strong></span>
                <span>Date: ${r.created_at.split("T")[0]}</span>
            </div>
        </div>`).join("");
    } catch (err) {
        list.innerHTML = `<p class="text-center text-slate-400 text-xs py-6">Failed to load reviews.</p>`;
    }
}


function trackRecentlyViewed(productId) {
    let recent = safeParseJSON(localStorage.getItem("shibani_recent_viewed"), []);
    recent = recent.filter(id => id !== productId && typeof id === "number" && !isNaN(id));
    recent.unshift(productId);
    if (recent.length > 6) {
        recent = recent.slice(0, 6);
    }
    localStorage.setItem("shibani_recent_viewed", JSON.stringify(recent));
}

async function loadRelatedAndRecentlyViewed(currentProductId) {
    try {
        let products = appState.products;
        if (!products || products.length === 0) {
            const data = await api("/api/products");
            products = data.products || [];
            appState.products = products;
        }

        const currentProduct = products.find(p => p.id === currentProductId);
        if (!currentProduct) return;

        // 1. Related Products
        const relatedGrid = document.getElementById("relatedProductsGrid");
        if (relatedGrid) {
            const related = products
                .filter(p => p.category === currentProduct.category && p.id !== currentProduct.id)
                .slice(0, 6);

            if (related.length === 0) {
                relatedGrid.innerHTML = `<p class="col-span-full text-slate-400 font-semibold py-8 text-center text-sm">No related products found.</p>`;
            } else {
                relatedGrid.innerHTML = related.map(p => renderProductCard(p)).join("");
                attachCardEvents(relatedGrid);
            }
        }

        // 2. Recently Viewed
        const recentSection = document.getElementById("recentlyViewedSection");
        const recentGrid = document.getElementById("recentlyViewedGrid");
        if (recentSection && recentGrid) {
            const recentIds = safeParseJSON(localStorage.getItem("shibani_recent_viewed"), [])
                .filter(id => id !== currentProductId);

            const recentProducts = recentIds
                .map(id => products.find(p => p.id === id))
                .filter(Boolean)
                .slice(0, 6);

            if (recentProducts.length > 0) {
                recentSection.classList.remove("hidden");
                recentGrid.innerHTML = recentProducts.map(p => renderProductCard(p)).join("");
                attachCardEvents(recentGrid);
            } else {
                recentSection.classList.add("hidden");
            }
        }
    } catch (err) {
        console.warn("Failed to load related or recently viewed products:", err);
    }
}


// --- 4. CART & CHECKOUT CONTROLLER ---
async function initCart() {
    const container = document.getElementById("cartItemsList");
    if (!container) return;
    
    // Fetch products database for naming and details matching
    try {
        const data = await api("/api/products");
        if (data && data.products) {
            appState.products = data.products;
            
            // Sync settings variables
            const settingsData = await api("/api/settings");
            Object.assign(appState.settings, settingsData);
        }
    } catch (err) {
        console.error("Config synchronization error:", err);
    }
    
    // Sync address details if logged in
    if (appState.user) {
        try {
            const profileData = await api("/api/profile");
            
            // Populate address selector book dropdown
            const addrSelect = document.getElementById("checkoutAddressSelector");
            const savedAddrList = JSON.parse(profileData.profile.saved_address || "[]");
            
            if (savedAddrList.length > 0 && addrSelect) {
                savedAddrList.forEach((addr, idx) => {
                    const opt = document.createElement("option");
                    opt.value = idx;
                    opt.textContent = `${addr.label}: ${addr.name} (${addr.phone})`;
                    addrSelect.appendChild(opt);
                });
                
                // Add event trigger to autofill details on select
                addrSelect.addEventListener("change", () => {
                    const fields = document.getElementById("checkoutAddressFieldsContainer");
                    if (addrSelect.value === "new") {
                        fields.classList.remove("hidden");
                        document.getElementById("checkoutName").value = "";
                        document.getElementById("checkoutPhone").value = "";
                        document.getElementById("checkoutAddress").value = "";
                    } else {
                        fields.classList.add("hidden");
                        const selAddr = savedAddrList[Number(addrSelect.value)];
                        document.getElementById("checkoutName").value = selAddr.name;
                        document.getElementById("checkoutPhone").value = selAddr.phone;
                        document.getElementById("checkoutAddress").value = selAddr.address;
                    }
                });
            }
        } catch (e) {}
    }
    
    // Render shopping bag
    renderCart();
    renderSaveForLater();
    
    // Progress bar interactive updates
    const nameInput = document.getElementById("checkoutName");
    const phoneInput = document.getElementById("checkoutPhone");
    const addrInput = document.getElementById("checkoutAddress");
    const progressTrack = document.getElementById("checkoutProgressTrack");
    
    function updateProgress() {
        if (!progressTrack) return;
        if ((nameInput && nameInput.value.trim()) || (phoneInput && phoneInput.value.trim()) || (addrInput && addrInput.value.trim())) {
            progressTrack.style.width = "66%";
        } else {
            progressTrack.style.width = "33%";
        }
    }
    if (nameInput) nameInput.addEventListener("input", updateProgress);
    if (phoneInput) phoneInput.addEventListener("input", updateProgress);
    if (addrInput) addrInput.addEventListener("input", updateProgress);
    
    // Coupon form validation
    const applyCouponBtn = document.getElementById("applyPromoBtn");
    if (applyCouponBtn) {
        applyCouponBtn.addEventListener("click", applyCouponCode);
    }
    
    // Submit order event
    const checkoutForm = document.getElementById("checkoutForm");
    if (checkoutForm) {
        checkoutForm.addEventListener("submit", handleCheckoutSubmit);
    }
}

async function renderCart() {
    await ensureProductsLoaded();
    const container = document.getElementById("cartItemsList");
    const summaryPanel = document.getElementById("checkoutSummaryPanel");
    const emptyState = document.getElementById("cartEmptyState");
    
    if (!container) return;
    
    if (appState.cart.length === 0) {
        container.innerHTML = "";
        if (summaryPanel) summaryPanel.classList.add("hidden");
        if (emptyState) emptyState.classList.remove("hidden");
        return;
    }
    
    if (emptyState) emptyState.classList.add("hidden");
    if (summaryPanel) summaryPanel.classList.remove("hidden");
    
    container.innerHTML = appState.cart.map((item, idx) => {
        const product = appState.products.find(p => String(p.id) === String(item.product_id));
        if (!product) return;
        const price = Number(product.price) || 0;
        const qty = item.quantity != null ? item.quantity : 1;
        return `
        <div class="bg-white border border-slate-100 rounded-3xl p-4 sm:p-6 shadow-sm flex gap-4 sm:gap-6 items-center">
            <img src="${escapeHTML(parsedImages[0] || 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=100')}" class="w-20 h-20 rounded-2xl object-cover flex-shrink-0" />
            <div class="flex-grow space-y-1">
                <h4 class="font-extrabold text-slate-800 text-sm sm:text-base leading-tight">${escapeHTML(product.name)}</h4>
                <div class="flex flex-wrap gap-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <span>Size: <strong class="text-indigo-600">${escapeHTML(item.size)}</strong></span>
                    <span>Color: <strong class="text-indigo-600">${escapeHTML(item.color)}</strong></span>
                </div>
                <strong class="text-indigo-600 font-extrabold text-sm block">${formatPrice(product.price * item.quantity)}</strong>
            </div>
            
            <!-- Quantity adjust actions -->
            <div class="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div class="flex items-center border border-slate-100 rounded-xl overflow-hidden bg-slate-50 text-slate-600 text-xs font-bold shadow-inner">
                    <button type="button" onclick="adjustCartQty(${idx}, -1)" class="w-8 h-8 flex items-center justify-center hover:bg-slate-200">-</button>
                    <span class="w-8 text-center text-slate-800">${item.quantity}</span>
                    <button type="button" onclick="adjustCartQty(${idx}, 1)" class="w-8 h-8 flex items-center justify-center hover:bg-slate-200">+</button>
                </div>
                <div class="flex gap-2">
                    <button type="button" onclick="saveForLater(${idx})" class="text-indigo-600 hover:text-indigo-700 text-[10px] font-bold flex items-center gap-0.5"><i class="fa-regular fa-bookmark"></i> Save</button>
                    <button type="button" onclick="adjustCartQty(${idx}, -999)" class="text-rose-500 hover:text-rose-600 text-[10px] font-bold flex items-center gap-0.5"><i class="fa-solid fa-trash-can"></i> Remove</button>
                </div>
            </div>
        </div>`;
    }).join("");
    
    // Render Saved for Later
    renderSaveForLater();
    
    // Calculate final bill
    calculateBillingTotals();
    
    // Sync mini cart
    renderMiniCart();
}

function renderMiniCart() {
    if (typeof _renderCartDrawer === "function") _renderCartDrawer();
}

async function adjustCartQty(index, amount) {
    const item = appState.cart[index];
    if (!item) return;
    
    item.quantity += amount;
    if (item.quantity <= 0) {
        appState.cart.splice(index, 1);
        showToast("Outfit removed from bag.");
    } else {
        showToast("Quantity updated.");
    }
    
    localStorage.setItem("shibani_cart", JSON.stringify(appState.cart));
    await renderCart();
    updateBadges();
}


async function saveForLater(index) {
    const item = appState.cart[index];
    if (!item) return;

    let saved = safeParseJSON(localStorage.getItem("shibani_saved_later"), []);
    const existing = saved.find(s => s.product_id === item.product_id && s.size === item.size && s.color === item.color);
    if (!existing) {
        saved.push(item);
    }
    localStorage.setItem("shibani_saved_later", JSON.stringify(saved));
    
    appState.cart.splice(index, 1);
    localStorage.setItem("shibani_cart", JSON.stringify(appState.cart));
    
    showToast("Outfit moved to Save for Later.");
    await renderCart();
    updateBadges();
}

async function moveToCart(index) {
    let saved = safeParseJSON(localStorage.getItem("shibani_saved_later"), []);
    const item = saved[index];
    if (!item) return;

    const existing = appState.cart.find(c => c.product_id === item.product_id && c.size === item.size && c.color === item.color);
    if (existing) {
        existing.quantity += item.quantity;
    } else {
        appState.cart.push(item);
    }
    localStorage.setItem("shibani_cart", JSON.stringify(appState.cart));
    
    saved.splice(index, 1);
    localStorage.setItem("shibani_saved_later", JSON.stringify(saved));
    
    showToast("Outfit moved to shopping bag.");
    await renderCart();
    updateBadges();
}

function removeSavedLater(index) {
    let saved = safeParseJSON(localStorage.getItem("shibani_saved_later"), []);
    saved.splice(index, 1);
    localStorage.setItem("shibani_saved_later", JSON.stringify(saved));
    
    showToast("Saved outfit removed.");
    renderSaveForLater();
}

function renderSaveForLater() {
    const section = document.getElementById("saveForLaterSection");
    const list = document.getElementById("saveForLaterList");
    if (!section || !list) return;

    const saved = safeParseJSON(localStorage.getItem("shibani_saved_later"), []);
    if (saved.length === 0) {
        section.classList.add("hidden");
        list.innerHTML = "";
        return;
    }

    section.classList.remove("hidden");
    list.innerHTML = saved.map((item, idx) => {
        const product = appState.products.find(p => p.id === item.product_id);
        if (!product) return '';

        const parsedImages = parseProductImages(product.image, product.images);

        return `
        <div class="bg-white border border-neutral-200 p-4 sm:p-5 flex gap-4 sm:gap-6 items-center">
            <img src="${escapeHTML(parsedImages[0] || 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=100')}" class="w-16 h-20 object-cover flex-shrink-0 opacity-90" />
            <div class="flex-grow space-y-1">
                <h4 class="font-medium text-neutral-900 text-xs uppercase tracking-wider leading-tight">${escapeHTML(product.name)}</h4>
                <div class="flex flex-wrap gap-3 text-[10px] font-light text-neutral-400 uppercase tracking-widest">
                    <span>Size: <strong class="font-medium text-neutral-700">${escapeHTML(item.size)}</strong></span>
                    <span>Color: <strong class="font-medium text-neutral-700">${escapeHTML(item.color)}</strong></span>
                </div>
                <strong class="text-neutral-950 font-medium text-xs block tracking-wider">${formatPrice(product.price)}</strong>
            </div>
            <div class="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                <button type="button" onclick="moveToCart(${idx})" class="px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white font-light text-[10px] uppercase tracking-widest transition duration-300">Move to Bag</button>
                <button type="button" onclick="removeSavedLater(${idx})" class="px-4 py-2.5 border border-neutral-200 hover:bg-neutral-50 text-neutral-500 font-light text-[10px] uppercase tracking-widest transition duration-300">Remove</button>
            </div>
        </div>`;
    }).join("");
}

window.saveForLater = saveForLater;
window.moveToCart = moveToCart;
window.removeSavedLater = removeSavedLater;
window.renderSaveForLater = renderSaveForLater;



function calculateBillingTotals() {
    const subtotalLabel = document.getElementById("billSubtotal");
    const discountRow = document.getElementById("billDiscountRow");
    const discountLabel = document.getElementById("billDiscount");
    const gstLabel = document.getElementById("billGst");
    const deliveryLabel = document.getElementById("billDelivery");
    const totalLabel = document.getElementById("billTotal");
    if (!subtotalLabel || !gstLabel || !deliveryLabel || !totalLabel) return;
    
    // 1. Compute subtotal
    const subtotal = appState.cart.reduce((sum, item) => {
        const p = appState.products.find(prod => prod.id === item.product_id);
        return sum + (p ? p.price * item.quantity : 0);
    }, 0);
    
    subtotalLabel.textContent = formatPrice(subtotal);
    
    // 2. Compute Promo Code Coupon Discount
    let promoDiscount = 0;
    if (appState.appliedPromo) {
        const promo = appState.appliedPromo;
        if (subtotal >= Number(promo.min_subtotal)) {
            if (promo.discount_type === "percentage") {
                promoDiscount = subtotal * (Number(promo.discount_value) / 100);
            } else {
                promoDiscount = Number(promo.discount_value);
            }
            discountRow.classList.remove("hidden");
            discountLabel.textContent = `-${formatPrice(promoDiscount)}`;
        } else {
            // Deactivate code if minimum subtotal criteria no longer met
            appState.appliedPromo = null;
            discountRow.classList.add("hidden");
            showToast(`Coupon removed: Requires minimum spend of ${formatPrice(promo.min_subtotal)}`, "error");
        }
    } else {
        discountRow.classList.add("hidden");
    }
    
    // 3. Compute Loyalty Coins discount (purged)
    let pointsDiscount = 0;
    
    // 4. Compute GST Tax (5% standard)
    const taxableSubtotal = subtotal - promoDiscount - pointsDiscount;
    const gstRate = Number(appState.settings.gst_rate || 5);
    const gst = Math.max(0, taxableSubtotal * (gstRate / 100));
    gstLabel.textContent = formatPrice(gst);
    
    // 5. Compute Delivery Fee (free above threshold)
    const threshold = Number(appState.settings.delivery_fee_threshold || 999);
    const deliveryFeeStandard = Number(appState.settings.delivery_fee_standard || 99);
    const delivery = (taxableSubtotal >= threshold || taxableSubtotal <= 0) ? 0 : deliveryFeeStandard;
    deliveryLabel.textContent = delivery === 0 ? "FREE" : formatPrice(delivery);
    
    // 6. Total Billing sum
    const otherCharges = Number(appState.settings.other_charges || 0);
    const total = Math.max(0, taxableSubtotal + gst + delivery + otherCharges);
    totalLabel.textContent = formatPrice(total);
    appState.checkoutTotal = total;
}

async function applyCouponCode() {
    const codeInput = document.getElementById("promoCodeInput");
    const msg = document.getElementById("promoMessage");
    if (!codeInput || !msg) return;
    
    const code = codeInput.value.trim().toUpperCase();
    if (!code) return;
    
    try {
        const couponsData = await api("/api/coupons");
        const list = couponsData.coupons || [];
        const match = list.find(c => c.code.toUpperCase() === code && c.active);
        
        if (!match) {
            msg.textContent = "Invalid or expired coupon code.";
            msg.className = "text-xs font-bold text-rose-500";
            msg.classList.remove("hidden");
            return;
        }
        
        // Match found
        appState.appliedPromo = match;
        msg.textContent = `Coupon applied! Saved ${match.discount_value}${match.discount_type === 'percentage' ? '%' : ' Rs.'}`;
        msg.className = "text-xs font-bold text-emerald-600";
        msg.classList.remove("hidden");
        
        calculateBillingTotals();
        showToast("Discount coupon applied!");
    } catch (err) {
        showToast("Failed to fetch coupons.", "error");
    }
}

let upiInterval = null;
window.addEventListener("beforeunload", () => { if (upiInterval) { clearInterval(upiInterval); upiInterval = null; } });

async function handleCheckoutSubmit(e) {
    e.preventDefault();
    if (!appState.user) {
        showToast("Login required to place orders.", "error");
        setTimeout(() => window.location.href = "/login", 1000);
        return;
    }
    
    const name = document.getElementById("checkoutName").value.trim();
    const phone = document.getElementById("checkoutPhone").value.trim();
    const address = document.getElementById("checkoutAddress").value.trim();
    const paymentModeEl = document.querySelector('input[name="paymentMode"]:checked'); const paymentMode = paymentModeEl ? paymentModeEl.value : "COD";
    const couponCode = appState.appliedPromo ? appState.appliedPromo.code : "";
    
    const orderData = {
        customer_name: name,
        phone,
        address,
        payment_mode: paymentMode,
        coupon_code: couponCode,
        items: appState.cart
    };
    
    if (paymentMode === "COD") {
        // Place COD order directly
        try {
            showLoading("Placing your order...");
            const data = await api("/api/orders", {
                method: "POST",
                body: JSON.stringify(orderData)
            });
            hideLoading();
            showToast(`🎉 Order #${data.order_id} placed successfully!`);
            localStorage.removeItem("shibani_cart");
            setTimeout(() => window.location.href = "/order-confirmation?order_id=" + data.order_id, 1500);
        } catch (err) {
            hideLoading();
            showToast(err.message || "Failed to place order.", "error");
        }
    } else {
        // Launch UPI Payment scans overlay
        const upiModal = document.getElementById("upiPaymentModal");
        const upiAmount = document.getElementById("upiAmountLabel");
        const upiQr = document.getElementById("upiQrCode");
        
        if (upiModal && upiAmount && upiQr) {
            upiAmount.textContent = formatPrice(appState.checkoutTotal);
            
            // Build dynamic UPI URI link and render QR Code image
            const upiUri = `upi://pay?pa=shibani@upi&pn=ShibaniFashion&am=${appState.checkoutTotal}&cu=INR`;
            upiQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(upiUri)}`;
            
            upiModal.classList.remove("hidden");
            upiModal.classList.add("open");
            
            // Timer countdown (5 minutes limit)
            let seconds = 300;
            const timerLabel = document.getElementById("upiTimer");
            
            clearInterval(upiInterval);
            upiInterval = setInterval(() => {
                seconds--;
                const min = String(Math.floor(seconds / 60)).padStart(2, "0");
                const sec = String(seconds % 60).padStart(2, "0");
                timerLabel.textContent = `${min}:${sec}`;
                
                if (seconds <= 0) {
                    clearInterval(upiInterval);
                    showToast("UPI payment session expired.", "error");
                    upiModal.classList.remove("open");
                    upiModal.classList.add("hidden");
                }
            }, 1000);
            
            // Bind handlers for modal actions
            const confirmBtn = document.getElementById("upiConfirmBtn");
            const cancelBtn = document.getElementById("upiCancelBtn");
            
            if (!confirmBtn || !cancelBtn) return;
            
            // Remove old listeners to prevent accumulation
            if (confirmBtn._upiHandler) {
                confirmBtn.removeEventListener("click", confirmBtn._upiHandler);
            }
            if (cancelBtn._upiHandler) {
                cancelBtn.removeEventListener("click", cancelBtn._upiHandler);
            }
            
            confirmBtn._upiHandler = async () => {
                clearInterval(upiInterval);
                upiModal.classList.remove("open");
                upiModal.classList.add("hidden");
                showLoading("Processing your payment...");

                try {
                    const data = await api("/api/orders", {
                        method: "POST",
                        body: JSON.stringify(orderData)
                    });
                    hideLoading();
                    showToast(`🎉 Order #${data.order_id} placed successfully!`);
                    localStorage.removeItem("shibani_cart");
                    setTimeout(() => window.location.href = "/order-confirmation?order_id=" + data.order_id, 1500);
                } catch (err) {
                    hideLoading();
                    showToast(err.message || "Failed to place order.", "error");
                }
            };
            
            cancelBtn._upiHandler = () => {
                clearInterval(upiInterval);
                upiModal.classList.remove("open");
                upiModal.classList.add("hidden");
            };
            
            confirmBtn.addEventListener("click", confirmBtn._upiHandler);
            cancelBtn.addEventListener("click", cancelBtn._upiHandler);
        }
    }
}

// Bind closures to global window scope
window.adjustCartQty = adjustCartQty;


// --- 5. MY WISHLIST CONTROLLER ---
async function initWishlist() {
    const grid = document.getElementById("wishlistGrid");
    const emptyState = document.getElementById("wishlistEmptyState");
    const compareBtn = document.getElementById("compareWishlistBtn");
    if (!grid) return;
    
    if (appState.wishlist.length === 0) {
        grid.innerHTML = "";
        emptyState.classList.remove("hidden");
        if (compareBtn) compareBtn.classList.add("hidden");
        return;
    }
    
    emptyState.classList.add("hidden");
    if (compareBtn) compareBtn.classList.remove("hidden");
    
    // Fetch product objects
    try {
        const data = await api("/api/products");
        if (data && data.products) {
            appState.products = data.products;
            
            const wishlistedProducts = appState.wishlist
                .map(id => data.products.find(p => p.id === id))
                .filter(Boolean);
                
            if (wishlistedProducts.length === 0) {
                grid.innerHTML = "";
                emptyState.classList.remove("hidden");
                if (compareBtn) compareBtn.classList.add("hidden");
                return;
            }
            
            grid.innerHTML = wishlistedProducts.map(p => renderProductCard(p)).join("");
            attachCardEvents(grid);
        }
    } catch (err) {
        grid.innerHTML = `<p class="col-span-full text-center text-slate-400 font-semibold py-8">Failed to load wishlist.</p>`;
    }
    
    // Compare trigger binding (one-time setup via flag)
    if (compareBtn && !compareBtn._listenerAttached) {
        compareBtn.addEventListener("click", () => {
            const drawer = document.getElementById("compareDrawer");
            if (drawer) {
                drawer.classList.remove("hidden");
                setTimeout(() => drawer.classList.remove("translate-y-full"), 10);
            }
        });
        compareBtn._listenerAttached = true;
    }
}


// --- 6. MY ORDERS CONTROLLER ---
async function initOrders() {
    const container = document.getElementById("ordersPageContainer");
    const emptyState = document.getElementById("ordersEmptyState");
    if (!container) return;
    
    try {
        const data = await api("/api/orders/my");
        const list = data.orders || [];
        
        if (list.length === 0) {
            container.innerHTML = "";
            emptyState.classList.remove("hidden");
            return;
        }
        
        emptyState.classList.add("hidden");
        container.innerHTML = list.map(order => {
            const dateStr = order.created_at.split("T")[0];
            const isCancellable = order.status === "New";
            
            const itemsHTML = (order.items || []).map(item => `
            <div class="flex justify-between items-center text-xs font-semibold py-1.5 border-b border-slate-50 last:border-none text-slate-500">
                <span class="text-slate-700">${escapeHTML(item.product_name)} <small class="text-slate-400">(${escapeHTML(item.size || 'M')})</small> x${item.quantity}</span>
                <span class="text-slate-800">${formatPrice(item.price * item.quantity)}</span>
            </div>`).join("");
            
            return `
            <div class="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-4">
                <!-- Header -->
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-4">
                    <div>
                        <span class="text-xs font-bold text-slate-400 uppercase tracking-widest">Order ID</span>
                        <strong class="text-slate-800 font-extrabold text-sm block mt-0.5">#${order.id}</strong>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="text-xs font-bold text-slate-400 uppercase">${dateStr}</span>
                        <span class="px-3 py-1 rounded-full text-xs font-bold uppercase ${
                            order.status === 'Cancelled' ? 'bg-rose-50 text-rose-500 border border-rose-100' :
                            order.status === 'Delivered' ? 'bg-emerald-50 text-emerald-500 border border-emerald-100' :
                            'bg-amber-50 text-amber-500 border border-amber-100'
                        }">${order.status}</span>
                    </div>
                </div>
                
                <!-- Items -->
                <div class="space-y-1.5">
                    ${itemsHTML}
                </div>
                
                <!-- Summary / Actions footer -->
                <div class="flex justify-between items-center pt-4 border-t border-slate-100">
                    <div>
                        <span class="text-xs font-semibold text-slate-400 uppercase block">Total Billing</span>
                        <strong class="text-indigo-600 font-black text-lg">${formatPrice(order.total)}</strong>
                    </div>
                    
                    <div class="flex items-center gap-3">
                        <button type="button" onclick="triggerReceiptView(${order.id})" class="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs rounded-xl transition">
                            Invoice
                        </button>
                        ${isCancellable ? `
                        <button type="button" onclick="cancelOrder(${order.id})" class="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-500 font-bold text-xs rounded-xl transition">
                            Cancel Order
                        </button>` : ''}
                    </div>
                </div>
            </div>`;
        }).join("");
    } catch (err) {
        container.innerHTML = `<p class="text-center text-slate-400 py-8 font-semibold">Failed to load order history.</p>`;
    }
}

async function cancelOrder(orderId) {
    if (!confirm("Are you sure you want to cancel this order?")) return;
    try {
        await api(`/api/orders/${orderId}/cancel`, { method: "PUT" });
        showToast("Order cancelled successfully!");
        initOrders();
    } catch (err) {
        showToast(err.message || "Failed to cancel order.", "error");
    }
}

async function triggerReceiptView(orderId) {
    const modal = document.getElementById("receiptModal");
    const body = document.getElementById("receiptModalBody");
    if (!modal || !body) return;
    
    body.innerHTML = `<p class="text-center py-6 text-slate-400">Loading invoice details...</p>`;
    modal.classList.remove("hidden");
    
    try {
        const data = await api("/api/orders/my");
        const list = data.orders || [];
        const order = list.find(o => o.id === orderId);
        if (!order) {
            body.innerHTML = `<p class="text-center py-6 text-rose-500">Invoice not found.</p>`;
            return;
        }
        
        const gstRate = 5;
        const total = Number(order.total) || 0;
        const subtotal = total / (1 + (gstRate / 100));
        const gst = total - subtotal;
        
        const itemsListHTML = (order.items || []).map(item => `
        <div class="flex justify-between py-1 border-b border-slate-50 last:border-none">
            <span>${escapeHTML(item.product_name)} <small>(${escapeHTML(item.size || 'M')})</small> x${item.quantity}</span>
            <span class="text-slate-800">${formatPrice(item.price * item.quantity)}</span>
        </div>`).join("");
        
        body.innerHTML = `
        <div class="space-y-4">
            <div class="grid grid-cols-2 gap-2 pb-3 border-b border-slate-100">
                <div>
                    <span class="text-[10px] text-slate-400 uppercase font-bold block">Invoice No</span>
                    <strong class="text-slate-800 font-extrabold">#SHB-${order.id}</strong>
                </div>
                <div class="text-right">
                    <span class="text-[10px] text-slate-400 uppercase font-bold block">Date</span>
                    <strong class="text-slate-800 font-extrabold">${order.created_at.split("T")[0]}</strong>
                </div>
            </div>
            
            <div class="space-y-1">
                <span class="text-[10px] text-slate-400 uppercase font-bold block">Shipping To:</span>
                <p class="text-slate-700 font-bold">${escapeHTML(order.customer_name)}</p>
                <p class="text-slate-400 leading-tight">${escapeHTML(order.address)}</p>
                <p class="text-slate-400">Ph: ${escapeHTML(order.phone)}</p>
            </div>
            
            <div class="border-y border-dashed border-slate-200 py-3 space-y-2">
                <span class="text-[10px] text-slate-400 uppercase font-bold block">Items List:</span>
                ${itemsListHTML}
            </div>
            
            <div class="space-y-2 text-right">
                <div class="flex justify-between">
                    <span>Taxable Subtotal:</span>
                    <span class="text-slate-800">${formatPrice(subtotal)}</span>
                </div>
                <div class="flex justify-between">
                    <span>GST (Tax ${gstRate}%):</span>
                    <span class="text-slate-800">${formatPrice(gst)}</span>
                </div>
                <div class="flex justify-between font-bold text-sm text-indigo-600 pt-2 border-t border-slate-100">
                    <span>Grand Total:</span>
                    <span>${formatPrice(total)}</span>
                </div>
            </div>
        </div>`;
        
        // Print action binding
        const printBtn = document.getElementById("printReceiptBtn");
        if (!printBtn) return;
        printBtn.onclick = () => {
            const printWindow = window.open('', '_blank');
            if (!printWindow) { showToast("Please allow pop-ups to print.", "error"); return; }
            printWindow.document.write(`
            <html><head><title>Invoice #SHB-${order.id}</title>
            <style>body{font-family:sans-serif;padding:40px;max-width:500px;margin:0 auto;line-height:1.6;}
            table{width:100%;border-collapse:collapse;} th,td{padding:8px;text-align:left;border-bottom:1px solid #eee;}
            .text-right{text-align:right;}</style></head><body>
            <div style="text-align:center;border-bottom:2px dashed #ccc;padding-bottom:20px;margin-bottom:20px;">
                <h2>SHIBANI FASHION</h2>
                <p style="font-size:12px;color:#666;">Official Purchase Receipt</p>
            </div>
            ${document.getElementById("receiptModalBody").innerHTML}
            </body></html>`);
            printWindow.document.close();
            printWindow.print();
        };
        
        const closeBtn = document.getElementById("closeReceiptBtn");
        if (closeBtn && !closeBtn._receiptHandler) {
            closeBtn._receiptHandler = () => {
                modal.classList.add("hidden");
            };
            closeBtn.addEventListener("click", closeBtn._receiptHandler);
        }
    } catch (err) {
        body.innerHTML = `<p class="text-center py-6 text-rose-500">Error rendering invoice.</p>`;
    }
}

// Bind closures to global window scope
window.cancelOrder = cancelOrder;
window.triggerReceiptView = triggerReceiptView;


// --- 7. MY PROFILE CONTROLLER ---
async function initProfile() {
    const profileForm = document.getElementById("profileForm");
    if (!profileForm) return;
    
    // 1. Fetch profile details
    try {
        const data = await api("/api/profile");
        const profile = data.profile || {};
        
        document.getElementById("profileFullName").value = profile.full_name || "";
        document.getElementById("profilePhone").value = profile.saved_phone || "";
        
        renderProfileAddresses(safeParseJSON(profile.saved_address, []));
    } catch (err) {
        console.error("Profile load failure:", err);
    }
    
    // 2. Submit Profile info form (only once)
    if (!profileForm._initSubmit) {
        profileForm._initSubmit = true;
        profileForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const fullName = document.getElementById("profileFullName").value.trim();
            const phone = document.getElementById("profilePhone").value.trim();
            
            try {
                await api("/api/profile", {
                    method: "PUT",
                    body: JSON.stringify({ saved_name: fullName, saved_phone: phone })
                });
                showToast("Profile details updated successfully!");
            } catch (err) {
                showToast(err.message || "Failed to update profile.", "error");
            }
        });
    }
    
    // 3. Address Modal overlays
    const addressModal = document.getElementById("addressModal");
    const addAddrBtn = document.getElementById("addNewAddressBtn");
    const closeAddrBtn = document.getElementById("closeAddressModalBtn");
    
    if (addressModal && addAddrBtn) {
        if (!addressModal._initAddr) {
            addressModal._initAddr = true;
            addAddrBtn.addEventListener("click", () => addressModal.classList.remove("hidden"));
            if (closeAddrBtn) closeAddrBtn.addEventListener("click", () => addressModal.classList.add("hidden"));
            
            const addressForm = document.getElementById("addressForm");
            addressForm.addEventListener("submit", handleAddAddressSubmit);
        }
    }
}

function renderProfileAddresses(addressList) {
    const container = document.getElementById("profileAddressesList");
    if (!container) return;
    
    if (addressList.length === 0) {
        container.innerHTML = `<p class="text-slate-400 font-semibold italic text-xs py-4 text-center">No shipping addresses saved yet.</p>`;
        return;
    }
    
    container.innerHTML = addressList.map((addr, idx) => `
    <div class="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex justify-between items-start gap-4 shadow-sm hover:shadow-md transition">
        <div class="space-y-1 text-xs">
            <span class="px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 font-bold uppercase">${escapeHTML(addr.label)}</span>
            <p class="font-bold text-slate-800 text-sm mt-1">${escapeHTML(addr.name)}</p>
            <p class="text-slate-400 leading-tight">${escapeHTML(addr.address)}</p>
            <p class="text-slate-400">Ph: ${escapeHTML(addr.phone)}</p>
        </div>
        
        <button type="button" onclick="deleteProfileAddress(${idx})" class="p-2 text-rose-500 hover:text-rose-600 rounded-full hover:bg-rose-50 transition text-xs font-bold">
            <i class="fa-solid fa-trash-can"></i> Delete
        </button>
    </div>`).join("");
}

async function handleAddAddressSubmit(e) {
    e.preventDefault();
    const label = document.getElementById("addressLabelInput").value.trim();
    const name = document.getElementById("addressNameInput").value.trim();
    const phone = document.getElementById("addressPhoneInput").value.trim();
    const address = document.getElementById("addressDetailsInput").value.trim();
    
    // Fetch current address list, push new item
    try {
        const data = await api("/api/profile");
        const list = JSON.parse(data.profile.saved_address || "[]");
        list.push({ label, name, phone, address });
        
        // Update profile
        await api("/api/profile", {
            method: "PUT",
            body: JSON.stringify({ saved_address: JSON.stringify(list) })
        });
        
        showToast("New address added successfully!");
        document.getElementById("addressForm").reset();
        document.getElementById("addressModal").classList.add("hidden");
        initProfile();
    } catch (err) {
        showToast(err.message || "Failed to add address.", "error");
    }
}

async function deleteProfileAddress(index) {
    if (!confirm("Are you sure you want to delete this address?")) return;
    try {
        const data = await api("/api/profile");
        const list = JSON.parse(data.profile.saved_address || "[]");
        list.splice(index, 1);
        
        await api("/api/profile", {
            method: "PUT",
            body: JSON.stringify({ saved_address: JSON.stringify(list) })
        });
        
        showToast("Address deleted successfully!");
        initProfile();
    } catch (err) {
        showToast(err.message || "Failed to delete address.", "error");
    }
}

// Bind closures to global window scope
window.deleteProfileAddress = deleteProfileAddress;





// --- 9. ADMIN OVERVIEW CONTROLLER ---
async function initAdminOverview() {
    const form = document.getElementById("settingsForm");
    if (!form) return;
    
    // 1. Fetch global settings variables
    try {
        const settings = await api("/api/settings");
        document.getElementById("settingsGst").value = settings.gst_rate;
        document.getElementById("settingsDelivery").value = settings.delivery_fee_standard;
        document.getElementById("settingsThreshold").value = settings.delivery_fee_threshold;
        document.getElementById("settingsOtherCharges").value = settings.other_charges;
    } catch (err) {
        console.error("Failed to load settings:", err);
    }
    
    // 2. Fetch admin overview analytics
    try {
        const stats = await api("/api/admin/analytics");
        document.getElementById("adminStatRevenue").textContent = formatPrice(stats.total_revenue || 0);
        document.getElementById("adminStatOrders").textContent = stats.total_orders || 0;
        
        // Count customers and pending reviews
        const customersData = await api("/api/admin/customers");
        document.getElementById("adminStatCustomers").textContent = (customersData.customers || []).length;
        
        const reviewsData = await api("/api/admin/reviews");
        const pendingReviews = (reviewsData.reviews || []).filter(r => r.status === "pending").length;
        document.getElementById("adminStatReviews").textContent = pendingReviews;
    } catch (err) {
        console.error("Overview stats error:", err);
    }
    
    // 3. Compile inventory stock warnings
    try {
        const data = await api("/api/products");
        const warningsList = document.getElementById("lowStockList");
        if (data && data.products && warningsList) {
            const warningProducts = data.products.filter(p => p.stock === "Out of stock" || p.stock === "Limited stock");
            
            if (warningProducts.length === 0) {
                warningsList.innerHTML = `
                <div class="p-4 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-2xl flex items-center justify-center gap-2 border border-emerald-100">
                    <i class="fa-solid fa-circle-check"></i> All products are in stock!
                </div>`;
            } else {
                warningsList.innerHTML = warningProducts.map(p => `
                <div class="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl flex justify-between items-center text-xs font-semibold hover:shadow-sm transition">
                    <div class="space-y-0.5">
                        <span class="text-slate-800 font-bold block line-clamp-1">${escapeHTML(p.name)}</span>
                        <span class="text-[10px] text-slate-400 block">${p.category}</span>
                    </div>
                    <span class="px-2 py-0.5 rounded font-bold uppercase ${
                        p.stock === 'Out of stock' ? 'bg-rose-50 text-rose-500 border border-rose-100' : 'bg-amber-50 text-amber-500 border border-amber-100'
                    }">${p.stock}</span>
                </div>`).join("");
            }
        }
    } catch (e) {}
    
    // 4. Save settings submission
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const gst_rate = Number(document.getElementById("settingsGst").value);
        const delivery_fee_standard = Number(document.getElementById("settingsDelivery").value);
        const delivery_fee_threshold = Number(document.getElementById("settingsThreshold").value);
        const other_charges = Number(document.getElementById("settingsOtherCharges").value);
        
        try {
            await api("/api/settings", {
                method: "PUT",
                body: JSON.stringify({ gst_rate, delivery_fee_standard, delivery_fee_threshold, other_charges })
            });
            showToast("Store configurations saved successfully!");
        } catch (err) {
            showToast(err.message || "Failed to update configurations.", "error");
        }
    });
}


// --- 10. ADMIN PRODUCTS CATALOG CONTROLLER ---
async function initAdminProducts() {
    const tableBody = document.getElementById("adminProductsTableBody");
    if (!tableBody) return;
    
    // 1. Load catalog list
    loadAdminCatalog();
    
    // 2. Add product modal controllers
    const modal = document.getElementById("productModal");
    const openBtn = document.getElementById("adminAddNewProductBtn");
    const closeBtn = document.getElementById("closeProductModalBtn");
    const cancelBtn = document.getElementById("cancelEditButton");
    
    if (modal && openBtn) {
        openBtn.addEventListener("click", () => {
            document.getElementById("productForm").reset();
            document.getElementById("editingProductId").value = "";
            document.getElementById("productFormTitle").textContent = "Add New Cloth";
            document.getElementById("saveProductButton").textContent = "Add Product";
            document.getElementById("photoPreview").innerHTML = "No image";
            modal.classList.remove("hidden");
        });
        
        const closeModal = () => modal.classList.add("hidden");
        closeBtn.addEventListener("click", closeModal);
        if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
    }
    
    // 3. Submit Product creation form
    const form = document.getElementById("productForm");
    if (form) {
        form.addEventListener("submit", handleProductFormSubmit);
    }
    
    // 4. Input search filter
    const searchInput = document.getElementById("adminProductSearch");
    if (searchInput) {
        searchInput.addEventListener("input", () => loadAdminCatalog(searchInput.value.trim()));
    }
}

async function loadAdminCatalog(filterQuery = "") {
    const tableBody = document.getElementById("adminProductsTableBody");
    if (!tableBody) return;
    
    try {
        const data = await api("/api/products");
        const list = data.products || [];
        
        let filtered = [...list];
        if (filterQuery) {
            const q = filterQuery.toLowerCase();
            filtered = filtered.filter(p => (p.name || "").toLowerCase().includes(q) || String(p.id).includes(q));
        }
        
        if (filtered.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400">No matching clothes in catalog.</td></tr>`;
            return;
        }
        
        tableBody.innerHTML = filtered.map(p => {
            const parsedImages = parseProductImages(p.image, p.images);
            return `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                <td class="py-4 px-6 text-xs text-slate-400 whitespace-nowrap">#${p.id}</td>
                <td class="py-4 px-6 flex items-center gap-3">
                    <img src="${escapeHTML(parsedImages[0] || 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=100')}" class="w-12 h-12 rounded-xl object-cover shrink-0" />
                    <span class="text-slate-800 font-bold line-clamp-1 whitespace-nowrap">${escapeHTML(p.name)}</span>
                </td>
                <td class="py-4 px-6 uppercase text-xs whitespace-nowrap">${p.category}</td>
                <td class="py-4 px-6 text-indigo-600 font-extrabold whitespace-nowrap">${formatPrice(p.price)}</td>
                <td class="py-4 px-6 whitespace-nowrap">
                    <span class="px-2 py-0.5 rounded text-xs font-bold uppercase ${
                        p.stock === 'Out of stock' ? 'bg-rose-50 text-rose-500 border border-rose-100' :
                        p.stock === 'Limited stock' ? 'bg-amber-50 text-amber-500 border border-amber-100' :
                        'bg-emerald-50 text-emerald-500 border border-emerald-100'
                    }">${p.stock}</span>
                </td>
                <td class="py-4 px-6 text-right space-x-2">
                    <button type="button" onclick="editAdminProduct(${p.id})" class="text-indigo-600 hover:text-indigo-800"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button type="button" onclick="deleteAdminProduct(${p.id})" class="text-rose-500 hover:text-rose-700"><i class="fa-solid fa-trash-can"></i></button>
                </td>
            </tr>`;
        }).join("");
    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-rose-500">Error loading catalog.</td></tr>`;
    }
}

async function editAdminProduct(productId) {
    const modal = document.getElementById("productModal");
    if (!modal) return;
    
    try {
        const data = await api("/api/products");
        const list = data.products || [];
        const p = list.find(prod => prod.id === productId);
        
        if (!p) return;
        
        document.getElementById("editingProductId").value = p.id;
        document.getElementById("nameInput").value = p.name;
        document.getElementById("categoryInput").value = p.category;
        document.getElementById("priceInput").value = p.price;
        document.getElementById("oldPriceInput").value = p.old_price || "";
        document.getElementById("colorInput").value = p.color;
        document.getElementById("sizeInput").value = p.size;
        document.getElementById("stockInput").value = p.stock;
        document.getElementById("ratingInput").value = p.rating;
        document.getElementById("badgeInput").value = p.badge || "";
        document.getElementById("descriptionInput").value = p.description || "";
        
        const parsedImages = parseProductImages(p.image, p.images);
        const preview = document.getElementById("photoPreview");
        if (preview && parsedImages.length > 0) {
            preview.innerHTML = `<img src="${parsedImages[0]}" class="w-full h-full object-cover" />`;
        }
        
        document.getElementById("productFormTitle").textContent = "Edit Cloth Details";
        document.getElementById("saveProductButton").textContent = "Save Changes";
        modal.classList.remove("hidden");
    } catch (err) {
        showToast("Error fetching product details.", "error");
    }
}

async function deleteAdminProduct(productId) {
    if (!confirm("Are you sure you want to delete this product?")) return;
    try {
        await api(`/api/products/${productId}`, { method: "DELETE" });
        showToast("Product deleted successfully!");
        loadAdminCatalog();
    } catch (err) {
        showToast(err.message || "Failed to delete product.", "error");
    }
}

async function handleProductFormSubmit(e) {
    e.preventDefault();
    const editId = document.getElementById("editingProductId").value;
    const name = document.getElementById("nameInput").value.trim();
    const category = document.getElementById("categoryInput").value;
    const price = Number(document.getElementById("priceInput").value);
    const oldPrice = Number(document.getElementById("oldPriceInput").value || 0);
    const color = document.getElementById("colorInput").value.trim();
    const size = document.getElementById("sizeInput").value.trim();
    const stock = document.getElementById("stockInput").value;
    const rating = Number(document.getElementById("ratingInput").value);
    const badge = document.getElementById("badgeInput").value.trim();
    const description = document.getElementById("descriptionInput").value.trim();
    
    // File upload support (handles base64 conversion for simplicity)
    const fileInput = document.getElementById("photoInput");
    let base64Image = "";
    
    if (fileInput && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        base64Image = await convertFileToBase64(file);
    }
    
    const productPayload = {
        name, category, price, old_price: oldPrice, color, size, stock, rating, badge, description
    };
    if (base64Image) {
        productPayload.image = base64Image;
    }
    
    try {
        if (editId) {
            // Edit existing
            await api(`/api/products/${editId}`, {
                method: "PUT",
                body: JSON.stringify(productPayload)
            });
            showToast("Product updated successfully!");
        } else {
            // Create new
            await api("/api/products", {
                method: "POST",
                body: JSON.stringify(productPayload)
            });
            showToast("New product created successfully!");
        }
        document.getElementById("productForm").reset();
        document.getElementById("productModal").classList.add("hidden");
        loadAdminCatalog();
    } catch (err) {
        showToast(err.message || "Failed to save product.", "error");
    }
}

function convertFileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// Bind closures to global window scope
window.editAdminProduct = editAdminProduct;
window.deleteAdminProduct = deleteAdminProduct;


// --- 11. ADMIN ORDERS CONTROLLER ---
async function initAdminOrders() {
    const tableBody = document.getElementById("adminOrdersTableBody");
    if (!tableBody) return;
    
    // 1. Load orders
    loadAdminOrders();
    
    // 2. Attach Filter tabs events
    document.querySelectorAll(".order-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".order-tab").forEach(t => {
                t.classList.remove("bg-neutral-900", "text-white", "border-neutral-900");
                t.classList.add("bg-transparent", "text-neutral-500", "border-neutral-200");
            });
            tab.classList.add("bg-neutral-900", "text-white", "border-neutral-900");
            tab.classList.remove("bg-transparent", "text-neutral-500", "border-neutral-200");
            
            loadAdminOrders(tab.dataset.status);
        });
    });
    
    // 3. Search filter
    const searchInput = document.getElementById("adminOrderSearchInput");
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            const activeTab = document.querySelector(".order-tab.bg-neutral-900");
            const status = activeTab ? activeTab.dataset.status : "all";
            loadAdminOrders(status, searchInput.value.trim());
        });
    }
}

async function loadAdminOrders(statusFilter = "all", searchQuery = "") {
    const tableBody = document.getElementById("adminOrdersTableBody");
    if (!tableBody) return;
    
    try {
        const data = await api("/api/orders");
        const list = data.orders || [];
        
        let filtered = [...list];
        
        // Status filter
        if (statusFilter !== "all") {
            filtered = filtered.filter(o => o.status === statusFilter);
        }
        
        // Search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(o => (o.customer_name || "").toLowerCase().includes(q) || String(o.id).includes(q));
        }
        
        if (filtered.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400">No matching orders found.</td></tr>`;
            return;
        }
        
        tableBody.innerHTML = filtered.map(o => {
            const dateStr = o.created_at.split("T")[0];
            const itemsHTML = (o.items || []).map(item => `
            <div class="py-0.5 border-b border-slate-50 last:border-none">
                ${escapeHTML(item.product_name)} <small>(${escapeHTML(item.size || 'M')})</small> x${item.quantity}
            </div>`).join("");
            
            return `
            <tr class="hover:bg-slate-50 border-b border-slate-100 transition align-top">
                <td class="py-4 px-6 text-xs text-slate-400 whitespace-nowrap">#${o.id}</td>
                <td class="py-4 px-6 space-y-0.5">
                    <p class="font-bold text-slate-800">${escapeHTML(o.customer_name)}</p>
                    <p class="text-[10px] text-slate-400">${escapeHTML(o.phone)}</p>
                    <p class="text-[10px] text-slate-400 max-w-[180px] leading-tight">${escapeHTML(o.address)}</p>
                </td>
                <td class="py-4 px-6 text-xs max-w-[200px] divide-y divide-slate-50">${itemsHTML}</td>
                <td class="py-4 px-6 text-indigo-600 font-extrabold text-base">${formatPrice(o.total)}</td>
                <td class="py-4 px-6">
                    <select onchange="updateAdminOrderStatus(${o.id}, this.value)" class="bg-slate-100 border-none rounded-xl px-2 py-1.5 text-xs font-bold text-slate-700 focus:outline-none">
                        <option value="New" ${o.status === 'New' ? 'selected' : ''}>New</option>
                        <option value="Confirmed" ${o.status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
                        <option value="Packed" ${o.status === 'Packed' ? 'selected' : ''}>Packed</option>
                        <option value="Out for delivery" ${o.status === 'Out for delivery' ? 'selected' : ''}>Out for delivery</option>
                        <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                        <option value="Cancelled" ${o.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </td>
            </tr>`;
        }).join("");
    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-rose-500">Error loading orders.</td></tr>`;
    }
}

async function updateAdminOrderStatus(orderId, newStatus) {
    try {
        await api(`/api/orders/${orderId}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status: newStatus })
        });
        showToast(`Order status updated to ${newStatus}!`);
        
        const activeTab = document.querySelector(".order-tab.bg-neutral-900");
        const status = activeTab ? activeTab.dataset.status : "all";
        loadAdminOrders(status);
    } catch (err) {
        showToast(err.message || "Failed to update order status.", "error");
    }
}

// Bind closures to global window scope
window.updateAdminOrderStatus = updateAdminOrderStatus;


// --- 12. ADMIN CUSTOMERS CONTROLLER ---
async function initAdminCustomers() {
    const tableBody = document.getElementById("adminCustomersTableBody");
    if (!tableBody) return;
    
    // 1. Load customers
    loadAdminCustomers();
    
    // 2. Search filter
    const searchInput = document.getElementById("adminCustomerSearch");
    if (searchInput) {
        searchInput.addEventListener("input", () => loadAdminCustomers(searchInput.value.trim()));
    }
}

async function loadAdminCustomers(filterQuery = "") {
    const tableBody = document.getElementById("adminCustomersTableBody");
    if (!tableBody) return;
    
    try {
        const data = await api("/api/admin/customers");
        const list = data.customers || [];
        
        let filtered = [...list];
        if (filterQuery) {
            const q = filterQuery.toLowerCase();
            filtered = filtered.filter(c => (c.full_name || "").toLowerCase().includes(q) || (c.username || "").toLowerCase().includes(q) || String(c.id).includes(q));
        }
        
        if (filtered.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="2" class="py-8 text-center text-slate-400">No matching customers.</td></tr>`;
            return;
        }
        
        tableBody.innerHTML = filtered.map(c => `
        <tr class="hover:bg-slate-50 border-b border-slate-100 transition align-middle">
            <td class="py-4 px-6 text-xs text-slate-400 whitespace-nowrap">#${c.id}</td>
            <td class="py-4 px-6 space-y-0.5">
                <p class="font-bold text-slate-800">${escapeHTML(c.full_name)}</p>
                <p class="text-xs text-slate-400">${escapeHTML(c.username)}</p>
            </td>
        </tr>`).join("");
    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="2" class="py-8 text-center text-rose-500">Error loading customers.</td></tr>`;
    }
}


// --- 13. ADMIN REVIEWS CONTROLLER ---
async function initAdminReviews() {
    const list = document.getElementById("adminReviewsList");
    if (!list) return;
    
    // 1. Load reviews
    loadAdminReviews();
}

async function loadAdminReviews() {
    const list = document.getElementById("adminReviewsList");
    if (!list) return;
    
    try {
        const data = await api("/api/admin/reviews");
        const reviews = data.reviews || [];
        
        if (reviews.length === 0) {
            list.innerHTML = `<p class="text-center text-neutral-400 font-light py-12 bg-white border border-neutral-200 uppercase tracking-widest text-[10px]">All customer reviews are moderated!</p>`;
            return;
        }
        
        list.innerHTML = reviews.map(r => `
        <div class="bg-white border border-neutral-200 p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <div class="space-y-2 flex-grow">
                <div class="flex items-center gap-3">
                    <span class="w-8 h-8 bg-neutral-900 text-white font-light flex items-center justify-center text-[10px] uppercase">${(r.username || '').slice(0, 2)}</span>
                    <strong class="text-neutral-900 font-medium text-xs uppercase tracking-wider">${escapeHTML(r.username)}</strong>
                    <span class="px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider ${
                        r.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'
                    }">${r.status}</span>
                </div>
                <p class="text-neutral-500 text-xs font-light tracking-wide leading-relaxed">${escapeHTML(r.comment)}</p>
                <div class="flex gap-4 text-[9px] font-light text-neutral-400 uppercase tracking-widest">
                    <span>Product ID: <strong class="font-medium text-neutral-700">#${r.product_id}</strong></span>
                    <span>Rating: <strong class="text-neutral-900 font-medium">${r.rating} / 5</strong></span>
                    <span>Sizing Fit: <strong class="text-neutral-900 font-medium">${escapeHTML(r.sizing_fit)}</strong></span>
                </div>
            </div>
            
            <div class="flex gap-2.5 flex-shrink-0 w-full sm:w-auto">
                ${r.status === 'pending' ? `
                <button type="button" onclick="moderateAdminReview(${r.id}, 'approved')" class="flex-grow sm:flex-grow-0 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-light text-[10px] uppercase tracking-widest transition duration-300">
                    Approve
                </button>` : ''}
                <button type="button" onclick="deleteAdminReview(${r.id})" class="flex-grow sm:flex-grow-0 px-4 py-2 border border-neutral-200 text-red-500 hover:bg-red-50 font-light text-[10px] uppercase tracking-widest transition duration-300">
                    Delete
                </button>
            </div>
        </div>`).join("");
    } catch (err) {
        list.innerHTML = `<p class="text-center text-neutral-400 py-8 uppercase tracking-widest text-[10px]">Failed to load reviews.</p>`;
    }
}

async function moderateAdminReview(reviewId, action) {
    try {
        await api(`/api/admin/reviews/${reviewId}`, {
            method: "PATCH",
            body: JSON.stringify({ status: action })
        });
        showToast("Review approved!");
        loadAdminReviews();
    } catch (err) {
        showToast(err.message || "Failed to moderate review.", "error");
    }
}

async function deleteAdminReview(reviewId) {
    if (!confirm("Are you sure you want to delete this review?")) return;
    try {
        await api(`/api/admin/reviews/${reviewId}`, { method: "DELETE" });
        showToast("Review deleted successfully!");
        loadAdminReviews();
    } catch (err) {
        showToast(err.message || "Failed to delete review.", "error");
    }
}

// Bind closures to global window scope
window.moderateAdminReview = moderateAdminReview;
window.deleteAdminReview = deleteAdminReview;


// --- 14. ADMIN ANALYTICS CONTROLLER ---
async function initAdminAnalytics() {
    const trendCanvas = document.getElementById("salesTrendCanvas");
    const categoryCanvas = document.getElementById("categorySalesCanvas");
    if (!trendCanvas || !categoryCanvas) return;
    
    try {
        const stats = await api("/api/admin/analytics");
        
        // Render detailed analytics table breakdown
        const tableContainer = document.getElementById("analyticsDetailsSection");
        if (tableContainer && stats.category_sales && stats.weekly_sales) {
            const categoriesHTML = Object.entries(stats.category_sales).map(([cat, val]) => `
            <div class="flex justify-between py-2 border-b border-slate-100 last:border-none">
                <span class="uppercase">${cat}</span>
                <span class="text-slate-800 font-bold">${formatPrice(val)}</span>
            </div>`).join("");
            
            const weeklyHTML = Object.entries(stats.weekly_sales).map(([wk, val]) => `
            <div class="flex justify-between py-2 border-b border-slate-100 last:border-none">
                <span>Week of ${wk}</span>
                <span class="text-slate-800 font-bold">${formatPrice(val)}</span>
            </div>`).join("");
            
            tableContainer.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div class="space-y-2">
                    <span class="text-[10px] text-slate-400 uppercase font-bold block mb-2">Category Sales Breakdown</span>
                    ${categoriesHTML}
                </div>
                <div class="space-y-2">
                    <span class="text-[10px] text-slate-400 uppercase font-bold block mb-2">Weekly Revenue Logs</span>
                    ${weeklyHTML}
                </div>
            </div>`;
        }
        
        // 1. Draw Sales Trend Line Chart on Canvas
        drawSalesTrendLineChart(stats.weekly_sales || {});
        
        // 2. Draw Category Sales Pie Chart on Canvas
        drawCategorySalesPieChart(stats.category_sales || {});
        
    } catch (err) {
        console.error("Analytics rendering error:", err);
    }
}

function drawSalesTrendLineChart(weeklySales) {
    const canvas = document.getElementById("salesTrendCanvas");
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    
    // Scale for device pixel ratio support
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = 300 * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = 300;
    
    ctx.clearRect(0, 0, width, height);
    
    const entries = Object.entries(weeklySales);
    if (entries.length === 0) return;
    
    // Calculate chart sizing bounds
    const padding = 50;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    const maxVal = Math.max(...entries.map(([, val]) => val), 1000);
    const minVal = 0;
    
    // Draw grid lines
    ctx.strokeStyle = "#f1f5f9";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding + (chartHeight * i) / 4;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
        
        // Label values
        ctx.fillStyle = "#94a3b8";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "right";
        const val = maxVal - (maxVal * i) / 4;
        ctx.fillText(Math.floor(val).toLocaleString("en-IN"), padding - 10, y + 4);
    }
    
    // Plot Line
    ctx.strokeStyle = "#171717";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    
    entries.forEach(([date, val], idx) => {
        const x = padding + (chartWidth * idx) / Math.max(entries.length - 1, 1);
        const y = padding + chartHeight - (chartHeight * (val - minVal)) / (maxVal - minVal);
        
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        
        // Draw date labels
        ctx.fillStyle = "#94a3b8";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(date, x, height - padding + 20);
    });
    ctx.stroke();
    
    // Plot Points
    entries.forEach(([date, val], idx) => {
        const x = padding + (chartWidth * idx) / Math.max(entries.length - 1, 1);
        const y = padding + chartHeight - (chartHeight * (val - minVal)) / (maxVal - minVal);
        
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#171717";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    });
}

function drawCategorySalesPieChart(categorySales) {
    const canvas = document.getElementById("categorySalesCanvas");
    const legend = document.getElementById("categorySalesLegend");
    if (!canvas || !legend) return;
    
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const center = width / 2;
    const radius = center - 10;
    
    ctx.clearRect(0, 0, width, height);
    
    const entries = Object.entries(categorySales);
    const total = entries.reduce((sum, [, val]) => sum + val, 0);
    
    if (total === 0) {
        ctx.fillStyle = "#94a3b8";
        ctx.textAlign = "center";
        ctx.font = "12px sans-serif";
        ctx.fillText("No sales registered.", center, center);
        return;
    }
    
    const colors = ["#171717", "#404040", "#737373", "#a3a3a3"];
    let currentAngle = 0;
    
    legend.innerHTML = "";
    
    entries.forEach(([category, val], idx) => {
        const sliceAngle = (val / total) * 2 * Math.PI;
        const color = colors[idx % colors.length];
        
        // Draw Pie sector slice
        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.arc(center, center, radius, currentAngle, currentAngle + sliceAngle);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        currentAngle += sliceAngle;
        
        // Populate Legend
        const percentage = Math.round((val / total) * 100);
        legend.innerHTML += `
        <div class="flex items-center gap-2 text-xs font-semibold text-neutral-500">
            <span class="w-3.5 h-3.5 flex-shrink-0" style="background-color: ${color};"></span>
            <span class="truncate uppercase flex-grow text-[10px] font-light tracking-wider">${escapeHTML(category)}</span>
            <span class="text-neutral-900 font-medium text-[10px] tracking-wider">${percentage}%</span>
        </div>`;
    });
}

async function initLogin() {
    const loginForm = document.getElementById("loginForm");
    const loginMessage = document.getElementById("loginMessage");
    const quickAdmin = document.getElementById("quickLoginAdminBtn");
    const quickCustomer = document.getElementById("quickLoginCustomerBtn");
    
    if (!loginForm) return;
    
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = document.getElementById("usernameInput").value.trim();
        const password = document.getElementById("passwordInput").value;
        const submitBtn = document.getElementById("loginSubmitBtn");
        
        if (!username || !password) {
            loginMessage.textContent = "Please fill in all fields.";
            loginMessage.classList.remove("hidden");
            return;
        }
        
        try {
            showLoading("Signing in...");
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing In...';
            loginMessage.classList.add("hidden");
            
            const res = await api("/api/login", {
                method: "POST",
                body: JSON.stringify({ username, password })
            });
            
            hideLoading();
            showToast("Successfully signed in!");
            
            // Redirect based on role
            setTimeout(() => {
                if (res.user && res.user.role === "admin") {
                    window.location.href = "/admin";
                } else {
                    window.location.href = "/";
                }
            }, 500);
        } catch (err) {
            hideLoading();
            loginMessage.textContent = err.message || "Invalid credentials.";
            loginMessage.classList.remove("hidden");
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span class="absolute left-0 inset-y-0 flex items-center pl-3 text-indigo-500 group-hover:text-indigo-400">
                <i class="fa-solid fa-lock-open"></i>
            </span> Sign In`;
        }
    });
    
    // Quick Demo Credentials Buttons
    if (quickAdmin) {
        quickAdmin.addEventListener("click", () => {
            document.getElementById("usernameInput").value = "admin";
            document.getElementById("passwordInput").value = "admin123";
            loginForm.dispatchEvent(new Event("submit"));
        });
    }
    
    if (quickCustomer) {
        quickCustomer.addEventListener("click", () => {
            document.getElementById("usernameInput").value = "customer";
            document.getElementById("passwordInput").value = "customer123";
            loginForm.dispatchEvent(new Event("submit"));
        });
    }
}

function initContact() {
    const form = document.getElementById("contactUsForm");
    if (!form) return;
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        showToast("Thank you for your message! We will get back to you shortly.");
        form.reset();
    });
}

async function initSignup() {
    const signupForm = document.getElementById("signupForm");
    const signupMessage = document.getElementById("signupMessage");
    
    if (!signupForm) return;
    
    signupForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const full_name = document.getElementById("signupFullNameInput").value.trim();
        const email = document.getElementById("signupEmailInput").value.trim();
        const username = document.getElementById("signupUsernameInput").value.trim();
        const password = document.getElementById("signupPasswordInput").value;
        const submitBtn = document.getElementById("signupSubmitBtn");
        
        if (!full_name || !email || !username || !password) {
            signupMessage.textContent = "Please fill in all fields.";
            signupMessage.classList.remove("hidden");
            return;
        }
        
        if (password.length < 6) {
            signupMessage.textContent = "Password must be at least 6 characters.";
            signupMessage.classList.remove("hidden");
            return;
        }
        
        try {
            showLoading("Creating your account...");
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> CREATING ACCOUNT...';
            signupMessage.classList.add("hidden");
            
            const res = await api("/api/register", {
                method: "POST",
                body: JSON.stringify({ full_name, email, username, password })
            });
            
            hideLoading();
            showToast("Welcome to Shibani! Your account has been created.");
            setTimeout(() => {
                window.location.href = "/";
            }, 1000);
        } catch (err) {
            hideLoading();
            signupMessage.textContent = err.message || "Failed to create account.";
            signupMessage.classList.remove("hidden");
            submitBtn.disabled = false;
            submitBtn.innerHTML = `Sign Up`;
        }
    });
}


// --- 15. DYNAMIC ROUTING ENTRY POINT ---
document.addEventListener("DOMContentLoaded", () => {
    // Initialize global headers, buttons, logout handlers
    initGlobal();
    initQuickViewModal();
    
    // Page router matching
    const path = window.location.pathname;
    
    if (path === "/" || path === "/index.html") {
        initHome();
    } else if (path === "/shop") {
        initShop();
    } else if (path === "/login") {
        initLogin();
    } else if (path === "/signup") {
        initSignup();
    } else if (path.startsWith("/product/")) {
        initProductDetail();
    } else if (path === "/cart") {
        initCart();
    } else if (path === "/wishlist") {
        initWishlist();
    } else if (path === "/orders") {
        initOrders();
    } else if (path === "/contact") {
        initContact();
    } else if (path === "/profile") {
        initProfile();
    } else if (path === "/admin" || path === "/admin/") {
        initAdminOverview();
    } else if (path === "/admin/products") {
        initAdminProducts();
    } else if (path === "/admin/orders") {
        initAdminOrders();
    } else if (path === "/admin/customers") {
        initAdminCustomers();
    } else if (path === "/admin/reviews") {
        initAdminReviews();
    } else if (path === "/admin/analytics") {
        initAdminAnalytics();
    }
});
