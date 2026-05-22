const appState = {
  user: null,
  products: [],
  orders: [],
  cart: [],
  search: "",
  filter: "all",
  dbStatus: null,
  editingImages: [],
  settings: {
    gst_rate: 5.0,
    delivery_fee_standard: 99.0,
    delivery_fee_threshold: 999.0,
    other_charges: 0.0
  },
  wishlist: JSON.parse(localStorage.getItem("shibani_wishlist") || "[]"),
  profile: null,
  myOrders: [],
  appliedPromo: null,
  appliedPointsRedeem: 0,
  checkoutTotal: 0,
  coupons: [],
  adminOrderStatusFilter: "all",
  adminOrderSearch: "",
  adminProductSearch: ""
};

const loginScreen = document.querySelector("#loginScreen");
const dashboardScreen = document.querySelector("#dashboardScreen");
const loginForm = document.querySelector("#loginForm");
const loginMessage = document.querySelector("#loginMessage");
const usernameInput = document.querySelector("#usernameInput");
const passwordInput = document.querySelector("#passwordInput");
const databaseStatus = document.querySelector("#databaseStatus");
const dbMode = document.querySelector("#dbMode");
const roleLabel = document.querySelector("#roleLabel");
const dashboardNav = document.querySelector("#dashboardNav");
const dashboardEyebrow = document.querySelector("#dashboardEyebrow");
const dashboardTitle = document.querySelector("#dashboardTitle");
const dashboardSubtitle = document.querySelector("#dashboardSubtitle");
const statsGrid = document.querySelector("#statsGrid");
const productGrid = document.querySelector("#productGrid");
const emptyProducts = document.querySelector("#emptyProducts");
const productForm = document.querySelector("#productForm");
const productFormTitle = document.querySelector("#productFormTitle");
const productFormSubtitle = document.querySelector("#productFormSubtitle");
const editingProductId = document.querySelector("#editingProductId");
const saveProductButton = document.querySelector("#saveProductButton");
const cancelEditButton = document.querySelector("#cancelEditButton");
const photoInput = document.querySelector("#photoInput");
const photoPreview = document.querySelector("#photoPreview");
const searchInput = document.querySelector("#searchInput");
const filterInput = document.querySelector("#filterInput");
const checkoutPanel = document.querySelector("#checkoutPanel");
const cartItems = document.querySelector("#cartItems");
const cartTotal = document.querySelector("#cartTotal");
const orderForm = document.querySelector("#orderForm");
const ordersList = document.querySelector("#ordersList");
const toast = document.querySelector("#toast");
const settingsPanel = document.querySelector("#settingsPanel");
const settingsForm = document.querySelector("#settingsForm");

const demoAccounts = {
  admin: { username: "admin", password: "admin123" },
  customer: { username: "customer", password: "customer123" }
};

function escapeHTML(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function initials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Something went wrong");
  }
  return data;
}

async function boot() {
  await loadStatus();
  try {
    const data = await api("/api/me");
    if (data.user) {
      appState.user = data.user;
      await enterDashboard();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
  initNewFeatures();
}

async function loadStatus() {
  const data = await api("/api/status");
  appState.dbStatus = data;
  if (data.mysql_ready) {
    databaseStatus.textContent = `MySQL connected: ${data.database}`;
    databaseStatus.classList.add("ok");
  } else {
    databaseStatus.textContent = "MySQL not connected. App is using temporary demo storage.";
    databaseStatus.classList.add("warn");
  }
}

function showLogin() {
  loginScreen.classList.remove("hidden");
  dashboardScreen.classList.add("hidden");
  
  const loginFormEl = document.querySelector("#loginForm");
  const signupFormEl = document.querySelector("#signupForm");
  const authCardTitle = document.querySelector("#authCardTitle");
  const authCardSubtitle = document.querySelector("#authCardSubtitle");
  const demoLoginsContainer = document.querySelector("#demoLoginsContainer");
  
  if (loginFormEl && signupFormEl) {
    loginFormEl.classList.remove("hidden");
    signupFormEl.classList.add("hidden");
    if (authCardTitle) authCardTitle.textContent = "Welcome back";
    if (authCardSubtitle) authCardSubtitle.textContent = "Enter your ID and password to continue.";
    if (demoLoginsContainer) demoLoginsContainer.classList.remove("hidden");
  }
  
  resetChatWidget();
}

async function login(username, password) {
  loginMessage.textContent = "";
  document.querySelector("#loginButton").disabled = true;
  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    appState.user = data.user;
    showToast(`Welcome ${data.user.full_name}`);
    await enterDashboard();
  } catch (error) {
    loginMessage.textContent = error.message;
    loginMessage.classList.add("error");
  } finally {
    document.querySelector("#loginButton").disabled = false;
  }
}

async function loadSettings() {
  try {
    const data = await api("/api/settings");
    appState.settings = data;
  } catch (error) {
    console.error("Failed to load settings:", error);
  }
}

async function loadCoupons() {
  try {
    const endpoint = appState.user.role === "admin" ? "/api/admin/coupons" : "/api/coupons";
    const data = await api(endpoint);
    appState.coupons = data;
  } catch (error) {
    console.error("Failed to load coupons:", error);
  }
}

async function enterDashboard() {
  loginScreen.classList.add("hidden");
  dashboardScreen.classList.remove("hidden");
  await loadSettings();
  configureDashboardForRole();
  await Promise.all([
    loadProducts(),
    loadCoupons(),
    appState.user.role === "admin" 
      ? loadOrders() 
      : Promise.all([loadCustomerProfile(), loadMyOrders(), syncWishlist(), loadQuests()])
  ]);
  resetChatWidget();
  renderDashboard();
  handleNavigation();
  
  const chatWidgetToggle = document.querySelector("#chatWidgetToggle");
  if (chatWidgetToggle) {
    if (appState.user.role === "admin") {
      chatWidgetToggle.classList.add("hidden");
      const chatWidget = document.querySelector("#supportChatWidget");
      if (chatWidget) chatWidget.classList.add("hidden");
    } else {
      chatWidgetToggle.classList.remove("hidden");
    }
  }
}

function configureDashboardForRole() {
  const isAdmin = appState.user.role === "admin";
  roleLabel.textContent = isAdmin ? "Admin Dashboard" : "Customer Dashboard";
  dashboardEyebrow.textContent = isAdmin ? "Admin control room" : "Customer shopping room";
  dashboardTitle.textContent = isAdmin ? "Manage Shibani Cloth Shop" : "Shop the Shibani Collection";
  dashboardSubtitle.textContent = isAdmin
    ? "Upload clothes, control products, and watch customer orders."
    : "Browse clothes, add to cart, and place orders from your dashboard.";
  dbMode.textContent = appState.dbStatus?.mysql_ready ? "MySQL active" : "Demo memory";

  document.querySelectorAll(".admin-only").forEach((element) => element.classList.toggle("hidden", !isAdmin));
  document.querySelectorAll(".customer-only").forEach((element) => element.classList.toggle("hidden", isAdmin));
  const dashboardGrid = document.querySelector(".dashboard-grid");
  if (dashboardGrid) {
    dashboardGrid.classList.toggle("admin-hidden", !isAdmin);
  }
  dashboardNav.innerHTML = isAdmin
    ? `<a href="#dashboardOverviewPanel">Overview</a><a href="#adminProductsPanel">Products List</a><a href="#adminPanel">Add Product</a><a href="#ordersPanel">Orders</a><a href="#couponsPanel">Coupons</a><a href="#loyaltyAdminPanel">Loyalty Points</a><a href="#reviewsModeratorPanel">Reviews</a><a href="#financialAnalyticsPanel">Analytics</a><a href="#settingsPanel">Settings</a>`
    : `<a href="#catalogTitle">Shop</a><a href="#checkoutPanel">Cart</a><a href="#wishlistPanel">Wishlist</a><a href="#purchaseHistoryPanel">History</a><a href="#customerProfilePanel">Profile</a>`;

  if (isAdmin) {
    const settingsGst = document.querySelector("#settingsGst");
    const settingsDelivery = document.querySelector("#settingsDelivery");
    const settingsThreshold = document.querySelector("#settingsThreshold");
    const settingsOther = document.querySelector("#settingsOther");
    
    if (settingsGst) settingsGst.value = appState.settings.gst_rate;
    if (settingsDelivery) settingsDelivery.value = appState.settings.delivery_fee_standard;
    if (settingsThreshold) settingsThreshold.value = appState.settings.delivery_fee_threshold;
    if (settingsOther) settingsOther.value = appState.settings.other_charges;

    const settingsLoyaltyEnabled = document.querySelector("#settingsLoyaltyEnabled");
    const settingsLoyaltyTier1Limit = document.querySelector("#settingsLoyaltyTier1Limit");
    const settingsLoyaltyTier1Rate = document.querySelector("#settingsLoyaltyTier1Rate");
    const settingsLoyaltyTier2Limit = document.querySelector("#settingsLoyaltyTier2Limit");
    const settingsLoyaltyTier2Rate = document.querySelector("#settingsLoyaltyTier2Rate");
    const settingsLoyaltyTier3Limit = document.querySelector("#settingsLoyaltyTier3Limit");
    const settingsLoyaltyTier3Rate = document.querySelector("#settingsLoyaltyTier3Rate");
    const settingsLoyaltyTier4Limit = document.querySelector("#settingsLoyaltyTier4Limit");
    const settingsLoyaltyTier4Rate = document.querySelector("#settingsLoyaltyTier4Rate");
    const settingsLoyaltyTier5Limit = document.querySelector("#settingsLoyaltyTier5Limit");
    const settingsLoyaltyTier5Rate = document.querySelector("#settingsLoyaltyTier5Rate");
    const settingsLoyaltyTier6Limit = document.querySelector("#settingsLoyaltyTier6Limit");
    const settingsLoyaltyTier6Rate = document.querySelector("#settingsLoyaltyTier6Rate");
    const settingsLoyaltyTier7Rate = document.querySelector("#settingsLoyaltyTier7Rate");
    const settingsLoyaltyRedeemRatio = document.querySelector("#settingsLoyaltyRedeemRatio");
    const settingsLoyaltyMinEarn = document.querySelector("#settingsLoyaltyMinEarn");
    const settingsLoyaltyMinRedeem = document.querySelector("#settingsLoyaltyMinRedeem");
    const settingsLoyaltyWelcome = document.querySelector("#settingsLoyaltyWelcome");
    const settingsLoyaltyMaxPercent = document.querySelector("#settingsLoyaltyMaxPercent");
    
    if (settingsLoyaltyEnabled) settingsLoyaltyEnabled.value = appState.settings.loyalty_enabled !== undefined ? appState.settings.loyalty_enabled : "1";
    if (settingsLoyaltyTier1Limit) settingsLoyaltyTier1Limit.value = appState.settings.loyalty_tier1_limit !== undefined ? appState.settings.loyalty_tier1_limit : 1000.0;
    if (settingsLoyaltyTier1Rate) settingsLoyaltyTier1Rate.value = appState.settings.loyalty_tier1_rate !== undefined ? appState.settings.loyalty_tier1_rate : 5.0;
    if (settingsLoyaltyTier2Limit) settingsLoyaltyTier2Limit.value = appState.settings.loyalty_tier2_limit !== undefined ? appState.settings.loyalty_tier2_limit : 3000.0;
    if (settingsLoyaltyTier2Rate) settingsLoyaltyTier2Rate.value = appState.settings.loyalty_tier2_rate !== undefined ? appState.settings.loyalty_tier2_rate : 10.0;
    if (settingsLoyaltyTier3Limit) settingsLoyaltyTier3Limit.value = appState.settings.loyalty_tier3_limit !== undefined ? appState.settings.loyalty_tier3_limit : 5000.0;
    if (settingsLoyaltyTier3Rate) settingsLoyaltyTier3Rate.value = appState.settings.loyalty_tier3_rate !== undefined ? appState.settings.loyalty_tier3_rate : 15.0;
    if (settingsLoyaltyTier4Limit) settingsLoyaltyTier4Limit.value = appState.settings.loyalty_tier4_limit !== undefined ? appState.settings.loyalty_tier4_limit : 7000.0;
    if (settingsLoyaltyTier4Rate) settingsLoyaltyTier4Rate.value = appState.settings.loyalty_tier4_rate !== undefined ? appState.settings.loyalty_tier4_rate : 20.0;
    if (settingsLoyaltyTier5Limit) settingsLoyaltyTier5Limit.value = appState.settings.loyalty_tier5_limit !== undefined ? appState.settings.loyalty_tier5_limit : 10000.0;
    if (settingsLoyaltyTier5Rate) settingsLoyaltyTier5Rate.value = appState.settings.loyalty_tier5_rate !== undefined ? appState.settings.loyalty_tier5_rate : 25.0;
    if (settingsLoyaltyTier6Limit) settingsLoyaltyTier6Limit.value = appState.settings.loyalty_tier6_limit !== undefined ? appState.settings.loyalty_tier6_limit : 15000.0;
    if (settingsLoyaltyTier6Rate) settingsLoyaltyTier6Rate.value = appState.settings.loyalty_tier6_rate !== undefined ? appState.settings.loyalty_tier6_rate : 30.0;
    if (settingsLoyaltyTier7Rate) settingsLoyaltyTier7Rate.value = appState.settings.loyalty_tier7_rate !== undefined ? appState.settings.loyalty_tier7_rate : 35.0;
    if (settingsLoyaltyRedeemRatio) settingsLoyaltyRedeemRatio.value = appState.settings.loyalty_redeem_ratio !== undefined ? appState.settings.loyalty_redeem_ratio : 10.0;
    if (settingsLoyaltyMinEarn) settingsLoyaltyMinEarn.value = appState.settings.loyalty_min_order_to_earn !== undefined ? appState.settings.loyalty_min_order_to_earn : 0.0;
    if (settingsLoyaltyMinRedeem) settingsLoyaltyMinRedeem.value = appState.settings.loyalty_min_order_to_redeem !== undefined ? appState.settings.loyalty_min_order_to_redeem : 0.0;
    if (settingsLoyaltyWelcome) settingsLoyaltyWelcome.value = appState.settings.loyalty_welcome_points !== undefined ? appState.settings.loyalty_welcome_points : 100;
    if (settingsLoyaltyMaxPercent) settingsLoyaltyMaxPercent.value = appState.settings.loyalty_max_redemption_percent !== undefined ? appState.settings.loyalty_max_redemption_percent : 100.0;

    const loyaltyRuleTier1Limit = document.querySelector("#loyaltyRuleTier1Limit");
    const loyaltyRuleTier1Rate = document.querySelector("#loyaltyRuleTier1Rate");
    const loyaltyRuleTier2Limit = document.querySelector("#loyaltyRuleTier2Limit");
    const loyaltyRuleTier2Rate = document.querySelector("#loyaltyRuleTier2Rate");
    const loyaltyRuleTier3Limit = document.querySelector("#loyaltyRuleTier3Limit");
    const loyaltyRuleTier3Rate = document.querySelector("#loyaltyRuleTier3Rate");
    const loyaltyRuleTier4Limit = document.querySelector("#loyaltyRuleTier4Limit");
    const loyaltyRuleTier4Rate = document.querySelector("#loyaltyRuleTier4Rate");
    const loyaltyRuleTier5Limit = document.querySelector("#loyaltyRuleTier5Limit");
    const loyaltyRuleTier5Rate = document.querySelector("#loyaltyRuleTier5Rate");
    const loyaltyRuleTier6Limit = document.querySelector("#loyaltyRuleTier6Limit");
    const loyaltyRuleTier6Rate = document.querySelector("#loyaltyRuleTier6Rate");
    const loyaltyRuleTier7Rate = document.querySelector("#loyaltyRuleTier7Rate");
    
    if (loyaltyRuleTier1Limit) loyaltyRuleTier1Limit.value = appState.settings.loyalty_tier1_limit !== undefined ? appState.settings.loyalty_tier1_limit : 1000.0;
    if (loyaltyRuleTier1Rate) loyaltyRuleTier1Rate.value = appState.settings.loyalty_tier1_rate !== undefined ? appState.settings.loyalty_tier1_rate : 5.0;
    if (loyaltyRuleTier2Limit) loyaltyRuleTier2Limit.value = appState.settings.loyalty_tier2_limit !== undefined ? appState.settings.loyalty_tier2_limit : 3000.0;
    if (loyaltyRuleTier2Rate) loyaltyRuleTier2Rate.value = appState.settings.loyalty_tier2_rate !== undefined ? appState.settings.loyalty_tier2_rate : 10.0;
    if (loyaltyRuleTier3Limit) loyaltyRuleTier3Limit.value = appState.settings.loyalty_tier3_limit !== undefined ? appState.settings.loyalty_tier3_limit : 5000.0;
    if (loyaltyRuleTier3Rate) loyaltyRuleTier3Rate.value = appState.settings.loyalty_tier3_rate !== undefined ? appState.settings.loyalty_tier3_rate : 15.0;
    if (loyaltyRuleTier4Limit) loyaltyRuleTier4Limit.value = appState.settings.loyalty_tier4_limit !== undefined ? appState.settings.loyalty_tier4_limit : 7000.0;
    if (loyaltyRuleTier4Rate) loyaltyRuleTier4Rate.value = appState.settings.loyalty_tier4_rate !== undefined ? appState.settings.loyalty_tier4_rate : 20.0;
    if (loyaltyRuleTier5Limit) loyaltyRuleTier5Limit.value = appState.settings.loyalty_tier5_limit !== undefined ? appState.settings.loyalty_tier5_limit : 10000.0;
    if (loyaltyRuleTier5Rate) loyaltyRuleTier5Rate.value = appState.settings.loyalty_tier5_rate !== undefined ? appState.settings.loyalty_tier5_rate : 25.0;
    if (loyaltyRuleTier6Limit) loyaltyRuleTier6Limit.value = appState.settings.loyalty_tier6_limit !== undefined ? appState.settings.loyalty_tier6_limit : 15000.0;
    if (loyaltyRuleTier6Rate) loyaltyRuleTier6Rate.value = appState.settings.loyalty_tier6_rate !== undefined ? appState.settings.loyalty_tier6_rate : 30.0;
    if (loyaltyRuleTier7Rate) loyaltyRuleTier7Rate.value = appState.settings.loyalty_tier7_rate !== undefined ? appState.settings.loyalty_tier7_rate : 35.0;
  }
}

async function loadProducts() {
  const data = await api("/api/products");
  appState.products = data.products;
}

async function loadOrders() {
  const data = await api("/api/orders");
  appState.orders = data.orders;
}

async function loadCustomerProfile() {
  if (appState.user.role !== "customer") return;
  try {
    const profile = await api("/api/profile");
    appState.profile = profile;
    
    const profileName = document.querySelector("#profileName");
    const profilePhone = document.querySelector("#profilePhone");
    
    if (profileName) profileName.value = profile.saved_name || "";
    if (profilePhone) profilePhone.value = profile.saved_phone || "";
    
    let addresses = [];
    if (profile.saved_address) {
      try {
        const parsed = JSON.parse(profile.saved_address);
        if (Array.isArray(parsed)) {
          addresses = parsed;
        } else {
          addresses = [{
            label: "Default",
            address: String(parsed),
            name: profile.saved_name || profile.full_name || "",
            phone: profile.saved_phone || ""
          }];
        }
      } catch (e) {
        addresses = [{
          label: "Default",
          address: profile.saved_address,
          name: profile.saved_name || profile.full_name || "",
          phone: profile.saved_phone || ""
        }];
      }
    }
    appState.profile.addresses = addresses;
    
    const customerName = document.querySelector("#customerName");
    const customerPhone = document.querySelector("#customerPhone");
    const customerAddress = document.querySelector("#customerAddress");
    
    const firstAddr = addresses[0] || {};
    if (customerName && !customerName.value) customerName.value = firstAddr.name || profile.saved_name || profile.full_name || "";
    if (customerPhone && !customerPhone.value) customerPhone.value = firstAddr.phone || profile.saved_phone || "";
    if (customerAddress && !customerAddress.value) customerAddress.value = firstAddr.address || "";
    
    renderProfileAddresses();
    renderCheckoutAddressChips();
    renderLoyaltyWidgets();
  } catch (error) {
    console.error("Failed to load customer profile:", error);
  }
}

function renderLoyaltyWidgets() {
  if (!appState.user || appState.user.role !== "customer") return;
  
  const settings = appState.settings || {};
  const loyaltyEnabled = settings.loyalty_enabled !== undefined ? settings.loyalty_enabled === "1" : true;
  const tier1Limit = settings.loyalty_tier1_limit !== undefined ? parseFloat(settings.loyalty_tier1_limit) : 1000.0;
  const tier1Rate = settings.loyalty_tier1_rate !== undefined ? parseFloat(settings.loyalty_tier1_rate) : 5.0;
  const tier2Limit = settings.loyalty_tier2_limit !== undefined ? parseFloat(settings.loyalty_tier2_limit) : 3000.0;
  const tier2Rate = settings.loyalty_tier2_rate !== undefined ? parseFloat(settings.loyalty_tier2_rate) : 10.0;
  const tier3Limit = settings.loyalty_tier3_limit !== undefined ? parseFloat(settings.loyalty_tier3_limit) : 5000.0;
  const tier3Rate = settings.loyalty_tier3_rate !== undefined ? parseFloat(settings.loyalty_tier3_rate) : 15.0;
  const tier4Limit = settings.loyalty_tier4_limit !== undefined ? parseFloat(settings.loyalty_tier4_limit) : 7000.0;
  const tier4Rate = settings.loyalty_tier4_rate !== undefined ? parseFloat(settings.loyalty_tier4_rate) : 20.0;
  const tier5Limit = settings.loyalty_tier5_limit !== undefined ? parseFloat(settings.loyalty_tier5_limit) : 10000.0;
  const tier5Rate = settings.loyalty_tier5_rate !== undefined ? parseFloat(settings.loyalty_tier5_rate) : 25.0;
  const tier6Limit = settings.loyalty_tier6_limit !== undefined ? parseFloat(settings.loyalty_tier6_limit) : 15000.0;
  const tier6Rate = settings.loyalty_tier6_rate !== undefined ? parseFloat(settings.loyalty_tier6_rate) : 30.0;
  const tier7Rate = settings.loyalty_tier7_rate !== undefined ? parseFloat(settings.loyalty_tier7_rate) : 35.0;
  const redeemRatio = settings.loyalty_redeem_ratio !== undefined ? parseFloat(settings.loyalty_redeem_ratio) : 10.0;

  const loyaltyWidgetCard = document.querySelector("#loyaltyWidgetCard");
  if (loyaltyWidgetCard) {
    if (loyaltyEnabled) {
      loyaltyWidgetCard.classList.remove("hidden");
      const statusDesc = loyaltyWidgetCard.querySelector(".loyalty-status-desc");
      if (statusDesc) {
        statusDesc.innerHTML = `
          <div style="margin-top: 4px; line-height: 1.5;">
            Earn more points as you shop:
            <ul style="margin: 4px 0 0 16px; padding: 0; list-style-type: disc;">
              <li>Orders under Rs. <strong>${tier1Limit}</strong>: <strong>${tier1Rate} pts</strong> per Rs. 100 spent</li>
              <li>Orders under Rs. <strong>${tier2Limit}</strong>: <strong>${tier2Rate} pts</strong> per Rs. 100 spent</li>
              <li>Orders under Rs. <strong>${tier3Limit}</strong>: <strong>${tier3Rate} pts</strong> per Rs. 100 spent</li>
              <li>Orders under Rs. <strong>${tier4Limit}</strong>: <strong>${tier4Rate} pts</strong> per Rs. 100 spent</li>
              <li>Orders under Rs. <strong>${tier5Limit}</strong>: <strong>${tier5Rate} pts</strong> per Rs. 100 spent</li>
              <li>Orders under Rs. <strong>${tier6Limit}</strong>: <strong>${tier6Rate} pts</strong> per Rs. 100 spent</li>
              <li>Orders Rs. <strong>${tier6Limit}</strong> or above: <strong>${tier7Rate} pts</strong> per Rs. 100 spent</li>
            </ul>
          </div>
        `;
      }
      const conversionHint = loyaltyWidgetCard.querySelector(".points-conversion-hint");
      if (conversionHint) {
        conversionHint.textContent = `${redeemRatio.toFixed(1)} points = Rs. 1.00 Discount`;
      }
    } else {
      loyaltyWidgetCard.classList.add("hidden");
    }
  }

  const points = appState.profile ? (appState.profile.loyalty_points !== undefined ? appState.profile.loyalty_points : 100) : 100;
  
  const profilePointsVal = document.querySelector("#profilePointsVal");
  if (profilePointsVal) {
    profilePointsVal.textContent = points;
  }
  
  const checkoutPointsBalance = document.querySelector("#checkoutPointsBalance");
  const checkoutPointsValuation = document.querySelector("#checkoutPointsValuation");
  const checkoutLoyaltyRedeemContainer = document.querySelector("#checkoutLoyaltyRedeemContainer");
  
  if (checkoutPointsBalance) checkoutPointsBalance.textContent = points;
  if (checkoutPointsValuation) {
    const val = redeemRatio > 0 ? (points / redeemRatio).toFixed(2) : "0.00";
    checkoutPointsValuation.textContent = val;
  }
  
  if (checkoutLoyaltyRedeemContainer) {
    if (loyaltyEnabled && points > 0) {
      checkoutLoyaltyRedeemContainer.classList.remove("hidden");
    } else {
      checkoutLoyaltyRedeemContainer.classList.add("hidden");
    }
  }
}


function renderProfileAddresses() {
  const profileAddressesList = document.querySelector("#profileAddressesList");
  if (!profileAddressesList) return;
  profileAddressesList.innerHTML = "";
  
  const addresses = (appState.profile && appState.profile.addresses) || [];
  if (addresses.length === 0) {
    profileAddressesList.innerHTML = `<p style="font-size: 0.9rem; color: var(--text-muted); font-style: italic;">No saved addresses yet.</p>`;
    return;
  }
  
  addresses.forEach((addr, index) => {
    const card = document.createElement("div");
    card.className = "address-card";
    card.style = "border: 1px solid var(--border-color); padding: 12px; border-radius: 8px; position: relative; background: rgba(255,255,255,0.01); display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;";
    card.innerHTML = `
      <div style="font-size: 0.9rem; line-height: 1.4;">
        <strong style="color: var(--primary); display: inline-block; padding: 2px 6px; border-radius: 4px; background: rgba(107, 70, 193, 0.1); font-size: 0.75rem; text-transform: uppercase; margin-bottom: 4px;">${escapeHTML(addr.label)}</strong>
        <div style="font-weight: 600; color: var(--text-main);">${escapeHTML(addr.name)} - ${escapeHTML(addr.phone)}</div>
        <div style="color: var(--text-muted); margin-top: 4px;">${escapeHTML(addr.address)}</div>
      </div>
      <button type="button" class="delete-address-btn" data-index="${index}" style="background: none; border: none; color: #ff4d4d; cursor: pointer; font-size: 0.85rem; font-weight: 600;">Delete</button>
    `;
    profileAddressesList.appendChild(card);
  });
  
  profileAddressesList.querySelectorAll(".delete-address-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const idx = parseInt(btn.getAttribute("data-index"));
      if (confirm("Are you sure you want to delete this address?")) {
        addresses.splice(idx, 1);
        await saveProfileAddressBook();
      }
    });
  });
}

function renderCheckoutAddressChips() {
  const checkoutAddressSelector = document.querySelector("#checkoutAddressSelector");
  const checkoutAddressChips = document.querySelector("#checkoutAddressChips");
  if (!checkoutAddressSelector || !checkoutAddressChips) return;
  
  const addresses = (appState.profile && appState.profile.addresses) || [];
  if (addresses.length === 0) {
    checkoutAddressSelector.classList.add("hidden");
    return;
  }
  
  checkoutAddressSelector.classList.remove("hidden");
  checkoutAddressChips.innerHTML = "";
  
  const getIconForLabel = (label) => {
    const l = (label || "").toLowerCase();
    if (l.includes("home")) return "🏠";
    if (l.includes("work") || l.includes("office") || l.includes("job")) return "💼";
    return "📍";
  };
  
  addresses.forEach((addr) => {
    const card = document.createElement("div");
    card.className = "checkout-address-card";
    card.innerHTML = `
      <div class="address-card-header">
        <span class="address-card-icon">${getIconForLabel(addr.label)}</span>
        <span class="address-card-tag">${escapeHTML(addr.label)}</span>
      </div>
      <div class="address-card-body">
        <div class="address-card-name">${escapeHTML(addr.name || "")}</div>
        <div class="address-card-phone">${escapeHTML(addr.phone || "")}</div>
        <div class="address-card-details">${escapeHTML(addr.address)}</div>
      </div>
    `;
    card.addEventListener("click", () => {
      const customerName = document.querySelector("#customerName");
      const customerPhone = document.querySelector("#customerPhone");
      const customerAddress = document.querySelector("#customerAddress");
      if (customerName) customerName.value = addr.name || "";
      if (customerPhone) customerPhone.value = addr.phone || "";
      if (customerAddress) customerAddress.value = addr.address || "";
      
      checkoutAddressChips.querySelectorAll(".checkout-address-card").forEach(c => {
        c.classList.remove("selected");
      });
      card.classList.add("selected");
    });
    checkoutAddressChips.appendChild(card);
  });
}

async function saveProfileAddressBook() {
  try {
    const saved_name = document.querySelector("#profileName").value.trim();
    const saved_phone = document.querySelector("#profilePhone").value.trim();
    const saved_address = JSON.stringify(appState.profile.addresses);
    
    await api("/api/profile", {
      method: "PUT",
      body: JSON.stringify({
        saved_name,
        saved_phone,
        saved_address
      })
    });
    
    await loadCustomerProfile();
  } catch (error) {
    showToast(`Error saving address book: ${error.message}`);
  }
}

async function loadMyOrders() {
  if (appState.user.role !== "customer") return;
  try {
    const data = await api("/api/orders/my");
    appState.myOrders = data.orders;
    renderPurchaseHistory();
  } catch (error) {
    console.error("Failed to load order history:", error);
  }
}

function renderDashboard() {
  renderStats();
  renderProducts();
  renderCart();
  renderOrders();
  if (appState.user.role === "customer") {
    renderPurchaseHistory();
  } else if (appState.user.role === "admin") {
    renderCouponsList();
    renderDashboardOverview();
    renderAdminProductsTable();
  }
}

function renderStats() {
  const totalProducts = appState.products.length;
  const inStock = appState.products.filter((product) => product.stock === "In stock").length;
  const cartValue = getCartTotal();
  const orderValue = appState.orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const stats = appState.user.role === "admin"
    ? [
        ["Products", totalProducts],
        ["In stock", inStock],
        ["Orders", appState.orders.length],
        ["Order value", formatPrice(orderValue)]
      ]
    : [
        ["Products", totalProducts],
        ["Cart items", appState.cart.reduce((sum, item) => sum + item.quantity, 0)],
        ["Cart value", formatPrice(cartValue)],
        ["Categories", "3"]
      ];

  statsGrid.innerHTML = stats
    .map(([label, value]) => `<article><strong>${value}</strong><span>${label}</span></article>`)
    .join("");
}

function getVisibleProducts() {
  const search = appState.search.trim().toLowerCase();
  
  if (!appState.refinedFilters) {
    appState.refinedFilters = {
      maxPrice: 10000,
      stockOnly: false,
      selectedSizes: [],
      sortBy: "none"
    };
  }
  
  let list = appState.products.filter((product) => {
    let matchesFilter = false;
    if (appState.filter === "wishlist") {
      matchesFilter = appState.wishlist.includes(Number(product.id));
    } else {
      matchesFilter = appState.filter === "all" || product.category === appState.filter;
    }
    const text = `${product.name} ${product.category} ${product.size} ${product.color} ${product.description}`.toLowerCase();
    const basicMatch = matchesFilter && (!search || text.includes(search));
    
    if (!basicMatch) return false;
    
    const priceVal = Number(product.price) || 0;
    if (priceVal > appState.refinedFilters.maxPrice) return false;
    
    if (appState.refinedFilters.stockOnly && product.stock === "Out of stock") return false;
    
    if (appState.refinedFilters.selectedSizes.length > 0) {
      const productSizes = (product.size || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
      const hasSize = appState.refinedFilters.selectedSizes.some(size => productSizes.includes(size));
      if (!hasSize) return false;
    }
    
    return true;
  });
  
  if (appState.refinedFilters.sortBy === "price-asc") {
    list.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
  } else if (appState.refinedFilters.sortBy === "price-desc") {
    list.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
  } else if (appState.refinedFilters.sortBy === "rating") {
    list.sort((a, b) => (Number(b.rating) || 4.5) - (Number(a.rating) || 4.5));
  } else if (appState.refinedFilters.sortBy === "name") {
    list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }
  
  return list;
}

function renderProducts() {
  const products = getVisibleProducts();
  productGrid.innerHTML = products.map(renderProductCard).join("");
  emptyProducts.classList.toggle("hidden", products.length > 0);
}

function renderProductCard(product) {
  const images = getProductImages(product);
  
  let mediaHTML = "";
  if (images.length > 1) {
    mediaHTML = `
      <div class="product-carousel">
        <button class="carousel-control prev" type="button" aria-label="Previous image">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <div class="carousel-track">
          ${images.map((img, i) => `<img class="carousel-img ${i === 0 ? "active" : ""}" src="${encodeURI(img)}" alt="${escapeHTML(product.name)}" />`).join("")}
        </div>
        <button class="carousel-control next" type="button" aria-label="Next image">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
        <div class="carousel-dots">
          ${images.map((_, i) => `<span class="carousel-dot ${i === 0 ? "active" : ""}" data-index="${i}"></span>`).join("")}
        </div>
      </div>
    `;
  } else if (images[0]) {
    mediaHTML = `<img src="${encodeURI(images[0])}" alt="${escapeHTML(product.name)}" />`;
  } else {
    mediaHTML = `<div class="placeholder-media ${escapeHTML(product.category)}">${escapeHTML(initials(product.name))}</div>`;
  }

  const oldPrice = (product.old_price && product.old_price > product.price) ? `<span class="old-price">${formatPrice(product.old_price)}</span>` : "";
  
  const isWishlisted = appState.wishlist.includes(Number(product.id));
  const wishlistBtn = appState.user.role === "customer"
    ? `<button class="wishlist-btn ${isWishlisted ? "active" : ""}" type="button" data-wishlist="${product.id}" aria-label="Toggle Wishlist">
         <svg width="18" height="18" viewBox="0 0 24 24" fill="${isWishlisted ? "var(--rose)" : "none"}" stroke="var(--rose)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
         </svg>
       </button>`
    : "";

  const sizes = (product.size || "").split(",").map(s => s.trim()).filter(Boolean);
  const sizePillsHTML = sizes.map((sz, idx) => `
    <span class="size-pill ${idx === 0 ? "selected" : ""}" data-size="${escapeHTML(sz)}">${escapeHTML(sz)}</span>
  `).join("");

  const sizeSelectorHTML = (appState.user.role === "customer" && sizes.length > 0)
    ? `<div class="size-selector-row">
         <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
           <span class="size-selector-label">Select Size:</span>
           <span class="fit-finder-trigger" data-product-id="${product.id}" style="font-size: 11px; color: var(--teal); font-weight: 700; cursor: pointer; text-decoration: underline;">📏 Fit Finder</span>
         </div>
         <div class="size-pills-container">
           ${sizePillsHTML}
         </div>
       </div>`
    : "";

  const defaultPalettes = {
    women: ["#cc3965", "#7c458a", "#0a948c", "#366ba3"],
    men: ["#366ba3", "#123a63", "#0a948c", "#258c54"],
    kids: ["#e2a536", "#cc5a39", "#a8543b", "#366ba3"]
  };
  const colorList = (product.color || "Blue").split(",").map(c => c.trim()).filter(Boolean);
  const mockColors = colorList.length > 1 ? colorList : [product.color, ...(defaultPalettes[product.category] || ["#cc3965", "#0a948c"]).slice(0, 3)];

  const swatchHTML = mockColors.map((colorVal, idx) => {
    const isHex = colorVal.startsWith("#");
    const bgStyle = isHex ? colorVal : colorVal.toLowerCase();
    return `<span class="color-swatch ${idx === 0 ? "active" : ""}" data-color="${escapeHTML(colorVal)}" style="background-color: ${escapeHTML(bgStyle)};" title="${escapeHTML(colorVal)}"></span>`;
  }).join("");

  const colorSwatchesHTML = (appState.user.role === "customer")
    ? `<div class="color-swatches-row">
         <span class="size-selector-label">Color: <span class="active-color-label">${escapeHTML(mockColors[0])}</span></span>
         <div class="color-swatches-container">
           ${swatchHTML}
         </div>
       </div>`
    : "";

  const adminActions = appState.user.role === "admin"
    ? `<div class="admin-card-actions">
          <button class="small-button edit-button" type="button" data-edit="${product.id}">Edit</button>
          <button class="danger-link" type="button" data-delete="${product.id}">Delete</button>
        </div>`
    : `<button class="small-button" type="button" data-add="${product.id}" ${product.stock === "Out of stock" ? "disabled" : ""}>Add to cart</button>`;

  const stockClass = product.stock === "Out of stock" ? "stock-out" : (product.stock === "Limited stock" ? "stock-limited" : "stock-in");

  return `
    <article class="product-card ${product.stock === "Out of stock" ? "out-of-stock-card" : ""}" data-product-id="${product.id}">
      <div class="product-media">
        ${mediaHTML}
        <span class="stock-pill ${stockClass}">${escapeHTML(product.stock)}</span>
        ${product.badge ? `<span class="badge-pill">${escapeHTML(product.badge)}</span>` : ""}
        ${wishlistBtn}
      </div>
      <div class="product-info">
        <p>${escapeHTML(titleCase(product.category))} · <span class="card-color-display">${escapeHTML(product.color)}</span></p>
        <h3>${escapeHTML(product.name)}</h3>
        <p>${escapeHTML(product.description) || "No description added."}</p>
        <div class="rating-row">
          <span>Star ${Number(product.rating || 4.5).toFixed(1)}</span>
          <span>Size options: ${escapeHTML(product.size)}</span>
        </div>
        ${colorSwatchesHTML}
        ${sizeSelectorHTML}
        <div class="product-bottom">
          <strong>${formatPrice(product.price)} ${oldPrice}</strong>
          ${adminActions}
        </div>
      </div>
    </article>
  `;
}

function getProductImages(product) {
  const images = Array.isArray(product.images) ? product.images : [];
  if (product.image && !images.includes(product.image)) {
    return [product.image, ...images];
  }
  return images;
}

function addToCart(productId, customSize = null, customColor = null) {
  const product = appState.products.find((item) => Number(item.id) === Number(productId));
  if (!product) return;
  
  const card = document.querySelector(`.product-card[data-product-id="${productId}"]`);
  let selectedSize = customSize;
  if (!selectedSize) {
    if (card) {
      const selectedPill = card.querySelector(".size-pill.selected");
      if (selectedPill) {
        selectedSize = selectedPill.dataset.size;
      } else {
        const firstPill = card.querySelector(".size-pill");
        if (firstPill) {
          selectedSize = firstPill.dataset.size;
        } else {
          const sizes = product.size.split(",").map(s => s.trim()).filter(Boolean);
          if (sizes.length) selectedSize = sizes[0];
        }
      }
    } else {
      const sizes = product.size.split(",").map(s => s.trim()).filter(Boolean);
      if (sizes.length) selectedSize = sizes[0];
    }
  }

  // Handle selected color variant
  let selectedColor = customColor;
  if (!selectedColor) {
    selectedColor = product.color;
    if (card) {
      const activeSwatch = card.querySelector(".color-swatch.active");
      if (activeSwatch) {
        selectedColor = activeSwatch.dataset.color;
      }
    }
  }

  const existing = appState.cart.find(
    (item) => Number(item.product_id) === Number(productId) && item.size === selectedSize && item.color === selectedColor
  );
  if (existing) {
    existing.quantity += 1;
  } else {
    appState.cart.push({ product_id: product.id, quantity: 1, size: selectedSize, color: selectedColor });
  }
  showToast(`${product.name} (${selectedSize} / ${selectedColor}) added to cart`);
  renderDashboard();
}

function changeCartQuantity(productId, size, color, direction) {
  const item = appState.cart.find(
    (entry) => Number(entry.product_id) === Number(productId) && entry.size === size && (entry.color === color || !color || !entry.color)
  );
  if (!item) return;
  item.quantity += direction;
  if (item.quantity <= 0) {
    appState.cart = appState.cart.filter(
      (entry) => !(Number(entry.product_id) === Number(productId) && entry.size === size && (entry.color === color || !color || !entry.color))
    );
  }
  renderDashboard();
}

function getCartProducts() {
  return appState.cart
    .map((item) => {
      const product = appState.products.find((entry) => Number(entry.id) === Number(item.product_id));
      return product ? { ...product, quantity: item.quantity, size: item.size, color: item.color || product.color } : null;
    })
    .filter(Boolean);
}

function getCartTotal() {
  const items = getCartProducts();
  const subtotal = items.reduce((sum, product) => sum + product.price * product.quantity, 0);
  if (subtotal === 0) return 0;
  
  let coupon = (appState.appliedPromo || "").trim().toUpperCase();
  let discount = 0;
  let delivery = subtotal > appState.settings.delivery_fee_threshold ? 0 : appState.settings.delivery_fee_standard;

  const promo = appState.coupons.find(c => c.code.toUpperCase() === coupon);
  if (promo && promo.active) {
    if (subtotal >= Number(promo.min_subtotal || 0)) {
      if (promo.code.toUpperCase() === "FREEDELIVERY") {
        delivery = 0;
      } else if (promo.discount_type === "percentage") {
        discount = subtotal * (Number(promo.discount_value) / 100);
      } else if (promo.discount_type === "fixed") {
        discount = Number(promo.discount_value);
      }
    }
  }

  const settings = appState.settings || {};
  const loyaltyEnabled = settings.loyalty_enabled !== undefined ? settings.loyalty_enabled === "1" : true;
  const redeemRatio = settings.loyalty_redeem_ratio !== undefined ? parseFloat(settings.loyalty_redeem_ratio) : 10.0;
  const minRedeemSubtotal = settings.loyalty_min_order_to_redeem !== undefined ? parseFloat(settings.loyalty_min_order_to_redeem) : 0.0;
  const maxRedemptionPercent = settings.loyalty_max_redemption_percent !== undefined ? parseFloat(settings.loyalty_max_redemption_percent) : 100.0;

  let pointsDiscount = 0;
  if (loyaltyEnabled && appState.appliedPointsRedeem > 0 && subtotal >= minRedeemSubtotal && redeemRatio > 0) {
    pointsDiscount = appState.appliedPointsRedeem / redeemRatio;
    const maxAllowedPointsDiscount = (subtotal - discount) * (maxRedemptionPercent / 100.0);
    if (pointsDiscount > maxAllowedPointsDiscount) {
      pointsDiscount = maxAllowedPointsDiscount;
    }
  }

  const tax = Math.max(0, (subtotal - discount - pointsDiscount) * (appState.settings.gst_rate / 100));
  return Math.max(0, subtotal - discount - pointsDiscount + delivery + tax + appState.settings.other_charges);
}

function renderCart() {
  if (appState.user.role !== "customer") return;
  renderCheckoutCoupons();
  const items = getCartProducts();
  
  cartItems.innerHTML = items.length
    ? items
        .map((item) => {
          const images = getProductImages(item);
          const imageHTML = images[0]
            ? `<img class="cart-item-thumb" src="${encodeURI(images[0])}" alt="${escapeHTML(item.name)}" />`
            : `<div class="cart-item-thumb-placeholder ${escapeHTML(item.category)}">${escapeHTML(initials(item.name))}</div>`;
          
          return `
            <div class="cart-item">
              <div class="cart-item-image-wrapper">
                ${imageHTML}
              </div>
              <div class="cart-item-details">
                <h4 class="cart-item-name">${escapeHTML(item.name)}</h4>
                <p class="cart-item-meta">
                  <span class="cart-item-color">Color: ${escapeHTML(item.color)}</span> · 
                  <span class="cart-item-size">Size: ${escapeHTML(item.size)}</span>
                </p>
                <div class="cart-item-price-info">
                  <span class="unit-price">${formatPrice(item.price)}</span>
                  <span class="item-subtotal">Subtotal: ${formatPrice(item.price * item.quantity)}</span>
                </div>
              </div>
              <div class="cart-item-actions">
                <div class="quantity-controls">
                  <button type="button" class="qty-btn" data-minus="${item.id}" data-size="${escapeHTML(item.size)}" data-color="${escapeHTML(item.color)}" aria-label="Decrease quantity">−</button>
                  <span class="qty-number">${item.quantity}</span>
                  <button type="button" class="qty-btn" data-plus="${item.id}" data-size="${escapeHTML(item.size)}" data-color="${escapeHTML(item.color)}" aria-label="Increase quantity">+</button>
                </div>
                <button type="button" class="remove-item-btn" data-remove="${item.id}" data-size="${escapeHTML(item.size)}" data-color="${escapeHTML(item.color)}" aria-label="Remove item">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            </div>
          `;
        })
        .join("")
    : `<p class="empty-state">Your cart is empty.</p>`;

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  
  let coupon = (appState.appliedPromo || "").trim().toUpperCase();
  const promo = appState.coupons.find(c => c.code.toUpperCase() === coupon);
  if (promo) {
    let invalid = false;
    let removeReason = "";
    if (subtotal < Number(promo.min_subtotal || 0)) {
      invalid = true;
      removeReason = `subtotal fell below Rs. ${Number(promo.min_subtotal).toLocaleString()}`;
    } else if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      invalid = true;
      removeReason = "coupon has expired";
    } else if (promo.usage_limit !== null && promo.usage_limit !== undefined && (promo.usage_count || 0) >= promo.usage_limit) {
      invalid = true;
      removeReason = "coupon usage limit reached";
    }
    
    if (invalid) {
      appState.appliedPromo = null;
      coupon = "";
      const msg = document.querySelector("#promoMessage");
      if (msg) {
        msg.textContent = `Coupon ${promo.code} removed (${removeReason})`;
        msg.className = "promo-msg error";
      }
    }
  }

  let discount = 0;
  let delivery = subtotal === 0 ? 0 : (subtotal > appState.settings.delivery_fee_threshold ? 0 : appState.settings.delivery_fee_standard);

  if (promo && promo.active) {
    if (subtotal >= Number(promo.min_subtotal || 0)) {
      if (promo.code.toUpperCase() === "FREEDELIVERY") {
        delivery = 0;
      } else if (promo.discount_type === "percentage") {
        discount = subtotal * (Number(promo.discount_value) / 100);
      } else if (promo.discount_type === "fixed") {
        discount = Number(promo.discount_value);
      }
    }
  }

  const settings = appState.settings || {};
  const loyaltyEnabled = settings.loyalty_enabled !== undefined ? settings.loyalty_enabled === "1" : true;
  const redeemRatio = settings.loyalty_redeem_ratio !== undefined ? parseFloat(settings.loyalty_redeem_ratio) : 10.0;
  const minRedeemSubtotal = settings.loyalty_min_order_to_redeem !== undefined ? parseFloat(settings.loyalty_min_order_to_redeem) : 0.0;
  const maxRedemptionPercent = settings.loyalty_max_redemption_percent !== undefined ? parseFloat(settings.loyalty_max_redemption_percent) : 100.0;

  if (!loyaltyEnabled) {
    appState.appliedPointsRedeem = 0;
  }

  const maxPoints = appState.profile ? (appState.profile.loyalty_points !== undefined ? appState.profile.loyalty_points : 100) : 100;
  if (appState.appliedPointsRedeem > maxPoints) {
    appState.appliedPointsRedeem = maxPoints;
  }
  if (subtotal === 0 || subtotal < minRedeemSubtotal) {
    appState.appliedPointsRedeem = 0;
  }

  const availableLimit = subtotal - discount;
  const maxAllowedPointsDiscount = availableLimit * (maxRedemptionPercent / 100.0);
  
  let pointsDiscount = 0;
  if (appState.appliedPointsRedeem > 0 && redeemRatio > 0) {
    pointsDiscount = appState.appliedPointsRedeem / redeemRatio;
    if (pointsDiscount > maxAllowedPointsDiscount) {
      pointsDiscount = maxAllowedPointsDiscount;
      appState.appliedPointsRedeem = Math.floor(pointsDiscount * redeemRatio);
    }
  } else {
    appState.appliedPointsRedeem = 0;
  }

  const tax = Math.max(0, (subtotal - discount - pointsDiscount) * (appState.settings.gst_rate / 100));
  const other = subtotal === 0 ? 0 : appState.settings.other_charges;
  const total = Math.max(0, subtotal - discount - pointsDiscount + delivery + tax + other);

  const billingSubtotal = document.querySelector("#billingSubtotal");
  const billingDiscountRow = document.querySelector("#billingDiscountRow");
  const appliedCouponLabel = document.querySelector("#appliedCouponLabel");
  const billingDiscount = document.querySelector("#billingDiscount");
  const billingDelivery = document.querySelector("#billingDelivery");
  const billingTax = document.querySelector("#billingTax");
  const billingOther = document.querySelector("#billingOther");
  const billingTaxRate = document.querySelector("#billingTaxRate");
  const billingOtherRow = document.querySelector("#billingOtherRow");

  const billingPointsDiscountRow = document.querySelector("#billingPointsDiscountRow");
  const appliedPointsLabel = document.querySelector("#appliedPointsLabel");
  const billingPointsDiscount = document.querySelector("#billingPointsDiscount");

  if (billingSubtotal) billingSubtotal.textContent = formatPrice(subtotal);
  
  if (coupon) {
    if (billingDiscountRow) billingDiscountRow.classList.remove("hidden");
    if (appliedCouponLabel) appliedCouponLabel.textContent = coupon;
    if (billingDiscount) billingDiscount.textContent = `-Rs. ${discount.toFixed(2)}`;
  } else {
    if (billingDiscountRow) billingDiscountRow.classList.add("hidden");
  }

  if (appState.appliedPointsRedeem > 0) {
    if (billingPointsDiscountRow) billingPointsDiscountRow.classList.remove("hidden");
    if (appliedPointsLabel) appliedPointsLabel.textContent = `${appState.appliedPointsRedeem} pts`;
    if (billingPointsDiscount) billingPointsDiscount.textContent = `-Rs. ${pointsDiscount.toFixed(2)}`;
    
    const pointsInput = document.querySelector("#checkoutRedeemPointsInput");
    if (pointsInput) pointsInput.value = appState.appliedPointsRedeem;
    const loyaltyMessage = document.querySelector("#loyaltyMessage");
    if (loyaltyMessage) {
      loyaltyMessage.textContent = `Redeemed ${appState.appliedPointsRedeem} points (Rs. ${pointsDiscount.toFixed(2)} off)`;
      loyaltyMessage.className = "loyalty-msg success";
      loyaltyMessage.classList.remove("hidden");
    }
  } else {
    if (billingPointsDiscountRow) billingPointsDiscountRow.classList.add("hidden");
    const pointsInput = document.querySelector("#checkoutRedeemPointsInput");
    if (pointsInput) pointsInput.value = "";
    const loyaltyMessage = document.querySelector("#loyaltyMessage");
    if (loyaltyMessage) {
      loyaltyMessage.classList.add("hidden");
    }
  }

  if (billingDelivery) billingDelivery.textContent = formatPrice(delivery);
  if (billingTaxRate) billingTaxRate.textContent = appState.settings.gst_rate;
  if (billingTax) billingTax.textContent = formatPrice(tax);
  if (billingOther) billingOther.textContent = formatPrice(other);
  if (billingOtherRow) {
    billingOtherRow.classList.toggle("hidden", other === 0);
  }
  if (cartTotal) cartTotal.textContent = formatPrice(total);

  // Free Shipping Progress Tracker update
  const freeShippingMessage = document.querySelector("#freeShippingMessage");
  const freeShippingProgressFill = document.querySelector("#freeShippingProgressFill");
  const freeShippingStatusIcon = document.querySelector("#freeShippingStatusIcon");
  
  if (freeShippingMessage && freeShippingProgressFill) {
    const threshold = appState.settings.delivery_fee_threshold;
    if (subtotal === 0) {
      freeShippingProgressFill.style.width = "0%";
      freeShippingProgressFill.classList.remove("unlocked");
      freeShippingMessage.textContent = "Add items to get Free Shipping!";
      if (freeShippingStatusIcon) freeShippingStatusIcon.textContent = "🚚";
    } else if (subtotal >= threshold) {
      freeShippingProgressFill.style.width = "100%";
      freeShippingProgressFill.classList.add("unlocked");
      freeShippingMessage.innerHTML = "Congratulations! You've unlocked <strong>Free Shipping!</strong> 🎉";
      if (freeShippingStatusIcon) freeShippingStatusIcon.textContent = "🎁";
    } else {
      const percentage = (subtotal / threshold) * 100;
      freeShippingProgressFill.style.width = `${Math.min(100, percentage)}%`;
      freeShippingProgressFill.classList.remove("unlocked");
      const remaining = threshold - subtotal;
      freeShippingMessage.innerHTML = `Add <strong>Rs. ${remaining.toFixed(2)}</strong> more for <strong>Free Shipping!</strong>`;
      if (freeShippingStatusIcon) freeShippingStatusIcon.textContent = "🚚";
    }
  }

  const cartLink = document.querySelector('a[href="#checkoutPanel"]');
  if (cartLink) {
    const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const oldBadge = cartLink.querySelector(".cart-badge");
    const oldVal = oldBadge ? parseInt(oldBadge.textContent) : 0;
    
    cartLink.innerHTML = `Cart${totalCount > 0 ? ` <span class="cart-badge">${totalCount}</span>` : ""}`;
    
    if (totalCount > 0 && totalCount !== oldVal) {
      const newBadge = cartLink.querySelector(".cart-badge");
      if (newBadge) {
        newBadge.classList.add("cart-bounce");
        newBadge.addEventListener("animationend", () => {
          newBadge.classList.remove("cart-bounce");
        });
      }
    }
  }
}

function renderOrders() {
  if (appState.user.role !== "admin") return;

  let filtered = appState.orders || [];
  
  // Filter by status tab
  if (appState.adminOrderStatusFilter && appState.adminOrderStatusFilter !== "all") {
    filtered = filtered.filter(o => o.status === appState.adminOrderStatusFilter);
  }
  
  // Filter by search query
  if (appState.adminOrderSearch) {
    const searchQ = appState.adminOrderSearch.trim().toLowerCase();
    filtered = filtered.filter(o => {
      return String(o.id).includes(searchQ) ||
             o.customer_name.toLowerCase().includes(searchQ) ||
             o.phone.toLowerCase().includes(searchQ) ||
             o.address.toLowerCase().includes(searchQ);
    });
  }

  ordersList.innerHTML = filtered.length
    ? filtered
        .map(
          (order) => {
            const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
            let delivery = subtotal > appState.settings.delivery_fee_threshold ? 0 : appState.settings.delivery_fee_standard;
            const other = appState.settings.other_charges;
            let tax = subtotal * (appState.settings.gst_rate / 100);
            
            const diff = (subtotal + delivery + tax + other) - order.total;
            let discount = 0;
            if (diff > 0) {
              if (Math.abs(diff - delivery) < 1) {
                discount = 0;
                delivery = 0;
              } else {
                const factor = 1 + (appState.settings.gst_rate / 100);
                discount = Math.max(0, subtotal - (order.total - delivery - other) / factor);
                tax = Math.max(0, (subtotal - discount) * (appState.settings.gst_rate / 100));
              }
            } else {
              discount = 0;
            }

            const itemsHtmlList = (order.items || []).map(item => {
              const product = appState.products.find(p => p.id === item.product_id);
              const imgUrl = product ? product.image : "";
              return `
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                  <img src="${imgUrl || ''}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px; background: rgba(255,255,255,0.05);" />
                  <div>
                    <strong style="color: var(--text-main); font-size: 13px;">${escapeHTML(item.product_name)}</strong>
                    <div style="font-size: 11px; color: var(--muted); margin-top: 2px;">
                      Qty: ${item.quantity} · Size: ${escapeHTML(item.size || "M")} · Price: ${formatPrice(item.price)}
                    </div>
                  </div>
                </div>
              `;
            }).join("");

            return `
              <article class="order-card" style="cursor: pointer; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                  <div>
                    <strong>#${order.id} · ${escapeHTML(order.customer_name)}</strong>
                    <p style="margin: 4px 0 2px;">${escapeHTML(order.phone)} · ${escapeHTML(order.payment_mode)}</p>
                    <p style="margin: 0; font-size: 12px; color: var(--muted);">${escapeHTML(order.address)}</p>
                  </div>
                  <div style="text-align: right; display: flex; flex-direction: column; gap: 6px; align-items: flex-end;">
                    <strong style="font-size: 1.1rem; color: var(--text-main);">${formatPrice(order.total)}</strong>
                    <select class="status-select" data-order-status="${order.id}" style="padding: 4px 8px; border-radius: 6px; font-size: 12px;">
                      ${["New", "Confirmed", "Packed", "Out for delivery", "Delivered", "Cancelled"]
                        .map((status) => `<option value="${status}" ${order.status === status ? "selected" : ""}>${status}</option>`)
                        .join("")}
                    </select>
                  </div>
                </div>
                
                <div class="order-details-box hidden" style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed var(--border-color);">
                  <div class="order-detail-header">Order Items</div>
                  <div style="margin-bottom: 15px;">
                    ${itemsHtmlList}
                  </div>
                  
                  <div class="order-detail-header">Payment Breakdown</div>
                  <div style="display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-muted); margin-bottom: 15px;">
                    <div style="display: flex; justify-content: space-between;">
                      <span>Items Subtotal:</span>
                      <span>${formatPrice(subtotal)}</span>
                    </div>
                    ${discount > 0 ? `
                    <div style="display: flex; justify-content: space-between; color: var(--green);">
                      <span>Discount Savings:</span>
                      <span>-${formatPrice(discount)}</span>
                    </div>` : ""}
                    <div style="display: flex; justify-content: space-between;">
                      <span>Delivery Charges:</span>
                      <span>${delivery > 0 ? formatPrice(delivery) : "FREE"}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                      <span>GST / Tax (${appState.settings.gst_rate}%):</span>
                      <span>${formatPrice(tax)}</span>
                    </div>
                    ${other > 0 ? `
                    <div style="display: flex; justify-content: space-between;">
                      <span>Other Fees:</span>
                      <span>${formatPrice(other)}</span>
                    </div>` : ""}
                    <div style="display: flex; justify-content: space-between; font-weight: 600; color: var(--text-main); border-top: 1px solid var(--border-color); padding-top: 4px;">
                      <span>Total Paid:</span>
                      <span>${formatPrice(order.total)}</span>
                    </div>
                  </div>
                  
                  <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button type="button" class="secondary-action print-slip-btn" data-print-slip-id="${order.id}" style="padding: 6px 12px; font-size: 12px; display: flex; align-items: center; gap: 6px;">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 6 2 18 2 18 9"></polyline>
                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                        <rect x="6" y="14" width="12" height="8"></rect>
                      </svg>
                      Print Packing Slip
                    </button>
                  </div>
                </div>
              </article>
            `;
          }
        )
        .join("")
    : `<p class="empty-state">No matching customer orders found.</p>`;
}

function renderPurchaseHistory() {
  const container = document.querySelector("#purchaseHistoryList");
  if (!container) return;
  
  const orders = appState.myOrders || [];
  if (!orders.length) {
    container.innerHTML = `<p class="empty-state">You haven't placed any orders yet.</p>`;
    return;
  }
  
  container.innerHTML = orders.map((order) => {
    const dateStr = new Date(order.created_at).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
    
    const itemsHtml = (order.items || []).map((item) => `
      <li class="history-card-item">
        <span>
          <span class="history-card-item-qty">${item.quantity}x</span>
          ${escapeHTML(item.product_name)} 
          ${item.size ? `<span class="history-card-item-size">${escapeHTML(item.size)}</span>` : ""}
        </span>
        <span>${formatPrice(item.price * item.quantity)}</span>
      </li>
    `).join("");
    
    let statusClass = "status-new";
    const statusLower = (order.status || "").toLowerCase();
    if (statusLower === "confirmed") statusClass = "status-confirmed";
    else if (statusLower === "packed") statusClass = "status-packed";
    else if (statusLower === "out for delivery") statusClass = "status-out-for-delivery";
    else if (statusLower === "delivered") statusClass = "status-delivered";
    else if (statusLower === "cancelled") statusClass = "status-cancelled";

    let stepperHtml = "";
    const steps = ["New", "Confirmed", "Packed", "Out for delivery", "Delivered"];
    const currentIndex = steps.indexOf(order.status);
    if (currentIndex >= 0) {
      const progressPercent = (currentIndex / (steps.length - 1)) * 100;
      stepperHtml = `
        <div class="history-order-stepper">
          <div class="stepper-line-bg"></div>
          <div class="stepper-line-fill" style="width: ${progressPercent}%;"></div>
          ${steps.map((step, idx) => {
            let stepClass = "";
            if (idx < currentIndex) stepClass = "completed";
            else if (idx === currentIndex) stepClass = "active";
            return `
              <div class="stepper-step ${stepClass}">
                <div class="step-bubble">${idx + 1}</div>
                <div class="step-label">${step}</div>
              </div>
            `;
          }).join("")}
        </div>
      `;
    }

    let pointsHtml = "";
    if (order.redeemed_points || order.earned_points) {
      const parts = [];
      if (order.redeemed_points) parts.push(`Redeemed: ${order.redeemed_points} pts`);
      if (order.earned_points) parts.push(`Earned: +${order.earned_points} pts`);
      pointsHtml = `<div class="history-card-points" style="font-size: 11px; color: var(--primary); font-weight: 700; margin-top: 5px;">💎 ${parts.join(" · ")}</div>`;
    }
    
    return `
      <article class="history-card">
        <div class="history-card-header">
          <span class="history-card-id">Order #${order.id}</span>
          <span class="history-card-status ${statusClass}">${escapeHTML(order.status)}</span>
        </div>
        <div class="history-card-meta">
          <span>Date: ${dateStr}</span>
          <span>Payment: ${escapeHTML(order.payment_mode)}</span>
          ${pointsHtml}
        </div>
        ${stepperHtml}
        <ul class="history-card-items">
          ${itemsHtml}
        </ul>
        <div class="history-card-footer">
          <span class="history-card-total">Total: ${formatPrice(order.total)}</span>
          <div class="history-card-actions">
            ${order.status === "New" ? `<button class="history-card-cancel-btn" data-cancel-order-id="${order.id}">Cancel Order</button>` : ""}
            <button class="small-button secondary-action view-invoice-btn" data-order-id="${order.id}">View Receipt</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

async function readPhoto(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

async function readPhotos(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return [];
  return Promise.all(files.map((file) => readPhoto(file)));
}

async function createProduct(event) {
  event.preventDefault();
  const saveButton = document.querySelector("#saveProductButton");
  saveButton.disabled = true;
  try {
    const uploadedImages = await readPhotos(photoInput.files);
    const images = uploadedImages.length ? uploadedImages : appState.editingImages;
    const product = {
      name: document.querySelector("#nameInput").value.trim(),
      category: document.querySelector("#categoryInput").value,
      price: Number(document.querySelector("#priceInput").value),
      old_price: Number(document.querySelector("#oldPriceInput").value) || 0,
      color: document.querySelector("#colorInput").value.trim(),
      size: document.querySelector("#sizeInput").value.trim(),
      stock: document.querySelector("#stockInput").value,
      rating: Number(document.querySelector("#ratingInput").value) || 4.5,
      badge: document.querySelector("#badgeInput").value.trim(),
      description: document.querySelector("#descriptionInput").value.trim(),
      image: images[0] || "",
      images
    };
    const productId = editingProductId.value;
    if (productId) {
      await api(`/api/products/${productId}`, { method: "PUT", body: JSON.stringify(product) });
      showToast("Product updated in database");
    } else {
      await api("/api/products", { method: "POST", body: JSON.stringify(product) });
      showToast("Product added to database");
    }
    resetProductForm();
    await loadProducts();
    renderDashboard();
  } catch (error) {
    showToast(`Error: ${error.message}`);
  } finally {
    saveButton.disabled = false;
  }
}

async function deleteProduct(productId) {
  if (!confirm("Delete this product from admin dashboard?")) return;
  try {
    await api(`/api/products/${productId}`, { method: "DELETE" });
    await loadProducts();
    renderDashboard();
    showToast("Product deleted");
  } catch (error) {
    showToast(`Error: ${error.message}`);
  }
}

function editProduct(productId) {
  const product = appState.products.find((item) => Number(item.id) === Number(productId));
  if (!product) return;

  window.location.hash = "#adminPanel";
  editingProductId.value = product.id;
  appState.editingImages = getProductImages(product);
  productFormTitle.textContent = "Edit Cloth";
  productFormSubtitle.textContent = "Update product details, stock, price, and photos.";
  saveProductButton.textContent = "Save Changes";
  cancelEditButton.classList.remove("hidden");
  document.querySelector("#nameInput").value = product.name;
  document.querySelector("#categoryInput").value = product.category;
  document.querySelector("#priceInput").value = product.price;
  document.querySelector("#oldPriceInput").value = product.old_price || "";
  document.querySelector("#colorInput").value = product.color;
  document.querySelector("#sizeInput").value = product.size;
  document.querySelector("#stockInput").value = product.stock;
  document.querySelector("#ratingInput").value = product.rating || 4.5;
  document.querySelector("#badgeInput").value = product.badge || "";
  document.querySelector("#descriptionInput").value = product.description || "";
  renderPhotoPreview(appState.editingImages);
  document.querySelector("#adminPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetProductForm() {
  productForm.reset();
  photoInput.value = "";
  editingProductId.value = "";
  appState.editingImages = [];
  productFormTitle.textContent = "Add New Cloth";
  productFormSubtitle.textContent = "Upload product details to the shop.";
  saveProductButton.textContent = "Add Product";
  cancelEditButton.classList.add("hidden");
  photoPreview.innerHTML = "Photo preview";
}

function renderPhotoPreview(images) {
  if (!images.length) {
    photoPreview.innerHTML = "Photo preview";
    return;
  }

  photoPreview.innerHTML = `
    <div class="preview-grid">
      ${images.map((image) => `<img src="${encodeURI(image)}" alt="Product preview" />`).join("")}
    </div>
  `;
}

async function updateOrderStatus(orderId, status) {
  try {
    await api(`/api/orders/${orderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    await loadOrders();
    renderDashboard();
    showToast(`Order #${orderId} marked ${status}`);
  } catch (error) {
    showToast(`Error: ${error.message}`);
  }
}

async function saveSettings(event) {
  event.preventDefault();
  const saveBtn = event.target.querySelector("button[type='submit']");
  if (saveBtn) saveBtn.disabled = true;
  try {
    const data = {
      gst_rate: Number(document.querySelector("#settingsGst").value),
      delivery_fee_standard: Number(document.querySelector("#settingsDelivery").value),
      delivery_fee_threshold: Number(document.querySelector("#settingsThreshold").value),
      other_charges: Number(document.querySelector("#settingsOther").value),
      loyalty_enabled: document.querySelector("#settingsLoyaltyEnabled").value,
      loyalty_tier1_limit: Number(document.querySelector("#settingsLoyaltyTier1Limit").value),
      loyalty_tier1_rate: Number(document.querySelector("#settingsLoyaltyTier1Rate").value),
      loyalty_tier2_limit: Number(document.querySelector("#settingsLoyaltyTier2Limit").value),
      loyalty_tier2_rate: Number(document.querySelector("#settingsLoyaltyTier2Rate").value),
      loyalty_tier3_limit: Number(document.querySelector("#settingsLoyaltyTier3Limit").value),
      loyalty_tier3_rate: Number(document.querySelector("#settingsLoyaltyTier3Rate").value),
      loyalty_tier4_limit: Number(document.querySelector("#settingsLoyaltyTier4Limit").value),
      loyalty_tier4_rate: Number(document.querySelector("#settingsLoyaltyTier4Rate").value),
      loyalty_tier5_limit: Number(document.querySelector("#settingsLoyaltyTier5Limit").value),
      loyalty_tier5_rate: Number(document.querySelector("#settingsLoyaltyTier5Rate").value),
      loyalty_tier6_limit: Number(document.querySelector("#settingsLoyaltyTier6Limit").value),
      loyalty_tier6_rate: Number(document.querySelector("#settingsLoyaltyTier6Rate").value),
      loyalty_tier7_rate: Number(document.querySelector("#settingsLoyaltyTier7Rate").value),
      loyalty_redeem_ratio: Number(document.querySelector("#settingsLoyaltyRedeemRatio").value),
      loyalty_min_order_to_earn: Number(document.querySelector("#settingsLoyaltyMinEarn").value),
      loyalty_min_order_to_redeem: Number(document.querySelector("#settingsLoyaltyMinRedeem").value),
      loyalty_welcome_points: Number(document.querySelector("#settingsLoyaltyWelcome").value),
      loyalty_max_redemption_percent: Number(document.querySelector("#settingsLoyaltyMaxPercent").value)
    };
    const response = await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify(data)
    });
    appState.settings = response;
    showToast("Settings updated successfully");
    configureDashboardForRole();
    renderDashboard();
  } catch (error) {
    showToast(`Error saving settings: ${error.message}`);
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function removeFromCart(productId, size, color) {
  const product = appState.products.find((item) => Number(item.id) === Number(productId));
  appState.cart = appState.cart.filter(
    (entry) => !(Number(entry.product_id) === Number(productId) && entry.size === size && (entry.color === color || !color || !entry.color))
  );
  if (product) {
    showToast(`${product.name} (${size}${color ? ' / ' + color : ''}) removed from cart`);
  } else {
    showToast(`Item removed from cart`);
  }
  renderDashboard();
}

function createConfetti() {
  const modal = document.querySelector("#orderSuccessModal");
  if (!modal) return;
  modal.querySelectorAll(".confetti-particle").forEach((el) => el.remove());
  
  const colors = ["#cc3965", "#0a948c", "#e2a536", "#366ba3", "#258c54", "#fff"];
  const particleCount = 60;
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement("div");
    particle.classList.add("confetti-particle");
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const randomLeft = Math.random() * 100;
    const randomSize = Math.random() * 8 + 6;
    const randomDelay = Math.random() * 2;
    const randomDuration = Math.random() * 2.5 + 2.5;
    const randomRotate = Math.random() * 360;
    
    particle.style.left = `${randomLeft}%`;
    particle.style.width = `${randomSize}px`;
    particle.style.height = `${randomSize}px`;
    particle.style.backgroundColor = randomColor;
    particle.style.animationDelay = `${randomDelay}s`;
    particle.style.animationDuration = `${randomDuration}s`;
    particle.style.transform = `rotate(${randomRotate}deg)`;
    
    const shape = Math.floor(Math.random() * 3);
    if (shape === 1) {
      particle.style.borderRadius = "50%";
    } else if (shape === 2) {
      particle.style.clipPath = "polygon(50% 0%, 0% 100%, 100% 100%)";
    }
    modal.appendChild(particle);
  }
}

function showOrderSuccessModal(summary) {
  const modal = document.querySelector("#orderSuccessModal");
  const receiptCard = document.querySelector("#receiptCard");
  if (!modal || !receiptCard) return;

  const dateStr = new Date().toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  const itemsHtml = summary.items
    .map(
      (item) => `
      <div class="receipt-item-row">
        <span class="item-qty-name">${item.quantity}x ${escapeHTML(item.name)} (${escapeHTML(item.size)})</span>
        <span class="item-line-total">${formatPrice(item.price * item.quantity)}</span>
      </div>
    `
    )
    .join("");

  const discountRowHtml = (summary.discount && summary.discount > 0)
    ? `
      <div class="receipt-bill-row">
        <span>Discount (${escapeHTML(summary.coupon_code || "Coupon Applied")})</span>
        <span>-${formatPrice(summary.discount)}</span>
      </div>
    `
    : "";

  const otherRowHtml = summary.other > 0
    ? `
      <div class="receipt-bill-row">
        <span>Other Charges</span>
        <span>${formatPrice(summary.other)}</span>
      </div>
    `
    : "";

  receiptCard.innerHTML = `
    <div class="receipt-header">
      <div class="receipt-brand">SHIBANI</div>
      <div class="receipt-tagline">Premium Fashion Store</div>
      <div class="receipt-dashed-line"></div>
      <div class="receipt-info-row">
        <strong>Invoice No:</strong> <span>#${summary.order_id}</span>
      </div>
      <div class="receipt-info-row">
        <strong>Date:</strong> <span>${dateStr}</span>
      </div>
    </div>
    
    <div class="receipt-dashed-line"></div>
    
    <div class="receipt-section">
      <h5 class="receipt-sec-title">Customer Details</h5>
      <p><strong>Name:</strong> ${escapeHTML(summary.customer_name)}</p>
      <p><strong>Phone:</strong> ${escapeHTML(summary.phone)}</p>
      <p><strong>Address:</strong> ${escapeHTML(summary.address)}</p>
      <p><strong>Payment:</strong> ${escapeHTML(summary.payment_mode)}</p>
    </div>
    
    <div class="receipt-dashed-line"></div>
    
    <div class="receipt-section">
      <h5 class="receipt-sec-title">Items Purchased</h5>
      <div class="receipt-items-list">
        ${itemsHtml}
      </div>
    </div>
    
    <div class="receipt-dashed-line"></div>
    
    <div class="receipt-section receipt-summary">
      <div class="receipt-bill-row">
        <span>Subtotal</span>
        <span>${formatPrice(summary.subtotal)}</span>
      </div>
      ${discountRowHtml}
      <div class="receipt-bill-row">
        <span>Delivery Fee</span>
        <span>${formatPrice(summary.delivery)}</span>
      </div>
      <div class="receipt-bill-row">
        <span>GST / Tax (${appState.settings.gst_rate}%)</span>
        <span>${formatPrice(summary.tax)}</span>
      </div>
      ${otherRowHtml}
      <div class="receipt-dashed-line font-dashed"></div>
      <div class="receipt-bill-row receipt-total-row">
        <strong>Total Paid</strong>
        <strong>${formatPrice(summary.total)}</strong>
      </div>
    </div>
    
    <div class="receipt-dashed-line"></div>
    <div class="receipt-footer">
      <p>Thank you for shopping with us!</p>
      <p>Visit again soon.</p>
    </div>
  `;

  modal.classList.remove("hidden");
  createConfetti();

  const svgCheckmark = modal.querySelector(".checkmark-check");
  if (svgCheckmark) {
    svgCheckmark.style.animation = "none";
    svgCheckmark.offsetHeight; // trigger reflow
    svgCheckmark.style.animation = null;
  }
}

async function toggleWishlist(productId) {
  try {
    const data = await api("/api/wishlist", {
      method: "POST",
      body: JSON.stringify({ product_id: productId })
    });
    const index = appState.wishlist.indexOf(Number(productId));
    if (data.added) {
      if (index === -1) appState.wishlist.push(Number(productId));
      showToast("Added to wishlist");
    } else {
      if (index > -1) appState.wishlist.splice(index, 1);
      showToast("Removed from wishlist");
    }
    localStorage.setItem("shibani_wishlist", JSON.stringify(appState.wishlist));
    renderProducts();
    if (window.location.hash === "#wishlistPanel") {
      loadWishlist();
    }
  } catch (err) {
    showToast("Failed to update wishlist: " + err.message);
  }
}

async function placeOrder(event) {
  event.preventDefault();
  if (appState.cart.length === 0) {
    showToast("Error: Cart is empty!");
    return;
  }
  const submitButton = event.target.querySelector("button[type='submit']");
  if (submitButton) submitButton.disabled = true;
  try {
    const customerDetails = {
      customer_name: document.querySelector("#customerName").value.trim(),
      phone: document.querySelector("#customerPhone").value.trim(),
      address: document.querySelector("#customerAddress").value.trim(),
      payment_mode: document.querySelector("#paymentMode").value,
      items: appState.cart,
      save_profile: document.querySelector("#saveProfileCheck").checked,
      coupon_code: appState.appliedPromo || "",
      redeemed_points: appState.appliedPointsRedeem || 0
    };

    if (customerDetails.payment_mode === "UPI on confirmation") {
      pendingOrderData = customerDetails;
      
      const total = getCartTotal();
      const upiUri = `upi://pay?pa=shibani.fashion@okaxis&pn=Shibani%20Fashion&am=${total}&cu=INR`;
      
      const upiQrCode = document.querySelector("#upiQrCode");
      if (upiQrCode) {
        upiQrCode.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(upiUri)}`;
      }
      const upiPayAmount = document.querySelector("#upiPayAmount");
      if (upiPayAmount) {
        upiPayAmount.textContent = formatPrice(total);
      }
      
      const upiStatusContainer = document.querySelector("#upiStatusContainer");
      if (upiStatusContainer) upiStatusContainer.classList.add("hidden");
      
      const upiConfirmBtn = document.querySelector("#upiConfirmBtn");
      if (upiConfirmBtn) {
        upiConfirmBtn.disabled = false;
        upiConfirmBtn.textContent = "Confirm Payment";
      }
      
      const upiCancelBtn = document.querySelector("#upiCancelBtn");
      if (upiCancelBtn) {
        upiCancelBtn.disabled = false;
      }
      
      const upiPaymentModal = document.querySelector("#upiPaymentModal");
      if (upiPaymentModal) {
        upiPaymentModal.classList.remove("hidden");
      }
      
      startUpiTimer();
      
      if (submitButton) submitButton.disabled = false;
      return;
    }

    const result = await api("/api/orders", { method: "POST", body: JSON.stringify(customerDetails) });
    
    const orderedItems = getCartProducts();
    const orderSummary = {
      order_id: result.order_id,
      customer_name: customerDetails.customer_name,
      phone: customerDetails.phone,
      address: customerDetails.address,
      payment_mode: customerDetails.payment_mode,
      items: orderedItems.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        size: item.size
      })),
      subtotal: result.subtotal,
      discount: result.discount,
      delivery: result.delivery,
      tax: result.tax,
      other: result.other,
      total: result.total,
      coupon_code: result.coupon_code
    };

    appState.cart = [];
    appState.appliedPromo = null;
    appState.appliedPointsRedeem = 0;
    const promoInput = document.querySelector("#promoCodeInput");
    if (promoInput) promoInput.value = "";
    const promoMsg = document.querySelector("#promoMessage");
    if (promoMsg) {
      promoMsg.textContent = "";
      promoMsg.className = "promo-msg hidden";
    }
    const pointsInput = document.querySelector("#checkoutRedeemPointsInput");
    if (pointsInput) pointsInput.value = "";
    const pointsMsg = document.querySelector("#loyaltyMessage");
    if (pointsMsg) {
      pointsMsg.textContent = "";
      pointsMsg.className = "loyalty-msg hidden";
    }

    orderForm.reset();
    
    if (customerDetails.save_profile) {
      await loadCustomerProfile();
    }
    await loadMyOrders();
    loadQuests();
    renderDashboard();
    
    showOrderSuccessModal(orderSummary);
  } catch (error) {
    showToast(`Error: ${error.message}`);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2400);
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  login(usernameInput.value.trim(), passwordInput.value);
});

// Toggle buttons and signup logic
const toSignupBtn = document.querySelector("#toSignupBtn");
const toLoginBtn = document.querySelector("#toLoginBtn");
const loginFormEl = document.querySelector("#loginForm");
const signupFormEl = document.querySelector("#signupForm");
const authCardTitle = document.querySelector("#authCardTitle");
const authCardSubtitle = document.querySelector("#authCardSubtitle");
const demoLoginsContainer = document.querySelector("#demoLoginsContainer");

if (toSignupBtn && toLoginBtn && loginFormEl && signupFormEl) {
  toSignupBtn.addEventListener("click", (e) => {
    e.preventDefault();
    loginFormEl.classList.add("hidden");
    signupFormEl.classList.remove("hidden");
    if (authCardTitle) authCardTitle.textContent = "Create Account";
    if (authCardSubtitle) authCardSubtitle.textContent = "Sign up to start shopping premium fashion.";
    if (demoLoginsContainer) demoLoginsContainer.classList.add("hidden");
  });
  
  toLoginBtn.addEventListener("click", (e) => {
    e.preventDefault();
    signupFormEl.classList.add("hidden");
    loginFormEl.classList.remove("hidden");
    if (authCardTitle) authCardTitle.textContent = "Welcome back";
    if (authCardSubtitle) authCardSubtitle.textContent = "Enter your ID and password to continue.";
    if (demoLoginsContainer) demoLoginsContainer.classList.remove("hidden");
  });
}

if (signupFormEl) {
  signupFormEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fullNameInput = document.querySelector("#signupFullNameInput");
    const usernameInput = document.querySelector("#signupUsernameInput");
    const passwordInput = document.querySelector("#signupPasswordInput");
    const signupMessage = document.querySelector("#signupMessage");
    const signupButton = document.querySelector("#signupButton");
    
    const fullName = (fullNameInput.value || "").trim();
    const username = (usernameInput.value || "").trim();
    const password = passwordInput.value;
    
    if (!fullName || !username || !password) {
      if (signupMessage) {
        signupMessage.textContent = "All fields are required";
        signupMessage.style.color = "var(--danger)";
      }
      return;
    }
    
    if (password.length < 6) {
      if (signupMessage) {
        signupMessage.textContent = "Password must be at least 6 characters";
        signupMessage.style.color = "var(--danger)";
      }
      return;
    }
    
    signupButton.disabled = true;
    if (signupMessage) {
      signupMessage.textContent = "Creating account...";
      signupMessage.style.color = "var(--text-muted)";
    }
    
    try {
      const data = await api("/api/register", {
        method: "POST",
        body: JSON.stringify({
          username,
          password,
          full_name: fullName
        })
      });
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      appState.user = data.user;
      showToast(`Welcome, ${fullName}!`);
      await enterDashboard();
      
      fullNameInput.value = "";
      usernameInput.value = "";
      passwordInput.value = "";
      if (signupMessage) signupMessage.textContent = "";
    } catch (err) {
      if (signupMessage) {
        signupMessage.textContent = err.message || "Failed to register";
        signupMessage.style.color = "var(--danger)";
      }
    } finally {
      signupButton.disabled = false;
    }
  });
}

document.querySelectorAll("[data-demo-login]").forEach((button) => {
  button.addEventListener("click", () => {
    const account = demoAccounts[button.dataset.demoLogin];
    usernameInput.value = account.username;
    passwordInput.value = account.password;
    login(account.username, account.password);
  });
});

document.querySelector("#logoutButton").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST", body: "{}" });
  window.location.hash = "";
  appState.user = null;
  appState.cart = [];
  appState.appliedPromo = null;
  appState.appliedPointsRedeem = 0;
  appState.profile = null;
  appState.myOrders = [];
  
  if (orderForm) orderForm.reset();
  const profileForm = document.querySelector("#profileForm");
  if (profileForm) profileForm.reset();
  
  if (cartItems) cartItems.innerHTML = "";
  const historyList = document.querySelector("#purchaseHistoryList");
  if (historyList) historyList.innerHTML = "";
  
  showLogin();
});

productForm.addEventListener("submit", createProduct);
orderForm.addEventListener("submit", placeOrder);

photoInput.addEventListener("change", async () => {
  const images = await readPhotos(photoInput.files);
  renderPhotoPreview(images.length ? images : appState.editingImages);
});

cancelEditButton.addEventListener("click", resetProductForm);

searchInput.addEventListener("input", (event) => {
  appState.search = event.target.value;
  renderProducts();
});

filterInput.addEventListener("change", (event) => {
  appState.filter = event.target.value;
  renderProducts();
});

productGrid.addEventListener("click", (event) => {
  const carouselPrev = event.target.closest(".carousel-control.prev");
  const carouselNext = event.target.closest(".carousel-control.next");
  const carouselDot = event.target.closest(".carousel-dot");
  if (carouselPrev || carouselNext || carouselDot) {
    event.stopPropagation();
    event.preventDefault();
    const card = event.target.closest(".product-card");
    if (!card) return;
    const imgs = card.querySelectorAll(".carousel-img");
    const dots = card.querySelectorAll(".carousel-dot");
    if (!imgs.length) return;
    let activeIdx = Array.from(imgs).findIndex(img => img.classList.contains("active"));
    if (activeIdx === -1) activeIdx = 0;
    
    imgs[activeIdx].classList.remove("active");
    dots[activeIdx].classList.remove("active");
    
    if (carouselPrev) {
      activeIdx = (activeIdx - 1 + imgs.length) % imgs.length;
    } else if (carouselNext) {
      activeIdx = (activeIdx + 1) % imgs.length;
    } else if (carouselDot) {
      activeIdx = parseInt(carouselDot.dataset.index);
    }
    
    imgs[activeIdx].classList.add("active");
    dots[activeIdx].classList.add("active");
    return;
  }
  const sizePill = event.target.closest(".size-pill");
  if (sizePill) {
    const container = sizePill.closest(".size-pills-container");
    if (container) {
      container.querySelectorAll(".size-pill").forEach(p => p.classList.remove("selected"));
      sizePill.classList.add("selected");
    }
    return;
  }
  const fitFinder = event.target.closest(".fit-finder-trigger");
  if (fitFinder) {
    openSizeFinder(fitFinder.dataset.productId);
    return;
  }
  const colorSwatch = event.target.closest(".color-swatch");
  if (colorSwatch) {
    const container = colorSwatch.closest(".color-swatches-container");
    if (container) {
      const swatches = container.querySelectorAll(".color-swatch");
      swatches.forEach(s => s.classList.remove("active"));
      colorSwatch.classList.add("active");
      
      const card = colorSwatch.closest(".product-card");
      if (card) {
        const activeColorLabel = card.querySelector(".active-color-label");
        if (activeColorLabel) {
          activeColorLabel.textContent = colorSwatch.dataset.color;
        }
        const colorDisplay = card.querySelector(".card-color-display");
        if (colorDisplay) {
          colorDisplay.textContent = colorSwatch.dataset.color;
        }
        
        const idx = Array.from(swatches).indexOf(colorSwatch);
        const track = card.querySelector(".carousel-track");
        if (track) {
          const imgs = track.querySelectorAll(".carousel-img");
          if (imgs[idx]) {
            imgs.forEach(img => img.classList.remove("active"));
            imgs[idx].classList.add("active");
            
            const dots = card.querySelectorAll(".carousel-dot");
            if (dots[idx]) {
              dots.forEach(dot => dot.classList.remove("active"));
              dots[idx].classList.add("active");
            }
          }
        } else {
          const singleImg = card.querySelector(".product-media > img");
          if (singleImg) {
            const product = appState.products.find(p => Number(p.id) === Number(card.dataset.productId));
            if (product) {
              const images = getProductImages(product);
              if (images[idx]) {
                singleImg.src = encodeURI(images[idx]);
              }
            }
          }
        }
      }
    }
    return;
  }
  const addButton = event.target.closest("[data-add]");
  const deleteButton = event.target.closest("[data-delete]");
  const editButton = event.target.closest("[data-edit]");
  const wishlistButton = event.target.closest("[data-wishlist]");
  if (addButton) addToCart(addButton.dataset.add);
  if (deleteButton) deleteProduct(deleteButton.dataset.delete);
  if (editButton) editProduct(editButton.dataset.edit);
  if (wishlistButton) toggleWishlist(Number(wishlistButton.dataset.wishlist));
  
  const card = event.target.closest(".product-card");
  if (card && !addButton && !deleteButton && !editButton && !wishlistButton) {
    openProductDetails(card.dataset.productId);
  }
});

cartItems.addEventListener("click", (event) => {
  const plus = event.target.closest("[data-plus]");
  const minus = event.target.closest("[data-minus]");
  const remove = event.target.closest("[data-remove]");
  if (plus) changeCartQuantity(plus.dataset.plus, plus.dataset.size, plus.dataset.color, 1);
  if (minus) changeCartQuantity(minus.dataset.minus, minus.dataset.size, minus.dataset.color, -1);
  if (remove) removeFromCart(remove.dataset.remove, remove.dataset.size, remove.dataset.color);
});

ordersList.addEventListener("change", (event) => {
  const statusSelect = event.target.closest("[data-order-status]");
  if (statusSelect) updateOrderStatus(statusSelect.dataset.orderStatus, statusSelect.value);
});

settingsForm.addEventListener("submit", saveSettings);

document.querySelector("#printReceiptBtn").addEventListener("click", () => {
  window.print();
});

document.querySelector("#closeReceiptBtn").addEventListener("click", () => {
  const modal = document.querySelector("#orderSuccessModal");
  if (modal) modal.classList.add("hidden");
  const catalog = document.querySelector("#catalogTitle");
  if (catalog) catalog.scrollIntoView({ behavior: "smooth" });
});

const profileForm = document.querySelector("#profileForm");
if (profileForm) {
  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitBtn = profileForm.querySelector("button[type='submit']");
    if (submitBtn) submitBtn.disabled = true;
    try {
      const data = {
        saved_name: document.querySelector("#profileName").value.trim(),
        saved_phone: document.querySelector("#profilePhone").value.trim(),
        saved_address: JSON.stringify((appState.profile && appState.profile.addresses) || [])
      };
      await api("/api/profile", {
        method: "PUT",
        body: JSON.stringify(data)
      });
      showToast("Profile settings saved successfully");
      await loadCustomerProfile();
    } catch (error) {
      showToast(`Error updating profile: ${error.message}`);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

const addNewAddressBtn = document.querySelector("#addNewAddressBtn");
if (addNewAddressBtn) {
  addNewAddressBtn.addEventListener("click", async () => {
    const labelInput = document.querySelector("#newAddressLabel");
    const nameInput = document.querySelector("#newAddressName");
    const phoneInput = document.querySelector("#newAddressPhone");
    const textInput = document.querySelector("#newAddressText");
    
    const label = (labelInput.value || "").trim();
    const name = (nameInput.value || "").trim();
    const phone = (phoneInput.value || "").trim();
    const address = (textInput.value || "").trim();
    
    if (!label || !name || !phone || !address) {
      showToast("Please fill all fields to add an address");
      return;
    }
    
    if (!appState.profile) {
      appState.profile = { addresses: [] };
    }
    if (!appState.profile.addresses) {
      appState.profile.addresses = [];
    }
    
    appState.profile.addresses.push({ label, name, phone, address });
    
    labelInput.value = "";
    nameInput.value = "";
    phoneInput.value = "";
    textInput.value = "";
    
    await saveProfileAddressBook();
    showToast("New address added!");
    renderProfileAddresses();
    renderCheckoutAddressChips();
  });
}

const purchaseHistoryList = document.querySelector("#purchaseHistoryList");
if (purchaseHistoryList) {
  purchaseHistoryList.addEventListener("click", (event) => {
    const cancelBtn = event.target.closest(".history-card-cancel-btn");
    if (cancelBtn) {
      const orderId = Number(cancelBtn.dataset.cancelOrderId);
      if (confirm("Are you sure you want to cancel this order?")) {
        cancelOrder(orderId);
      }
      return;
    }
    const viewBtn = event.target.closest(".view-invoice-btn");
    if (viewBtn) {
      const orderId = Number(viewBtn.dataset.orderId);
      const order = (appState.myOrders || []).find(o => Number(o.id) === orderId);
      if (order) {
        const orderedItems = (order.items || []).map(item => ({
          name: item.product_name,
          quantity: item.quantity,
          price: item.price,
          size: item.size || "M"
        }));
        const subtotal = orderedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        
        const total = order.total;
        const raw_delivery = subtotal > appState.settings.delivery_fee_threshold ? 0 : appState.settings.delivery_fee_standard;
        const raw_tax = subtotal * (appState.settings.gst_rate / 100);
        const raw_other = appState.settings.other_charges;
        const diff = subtotal + raw_delivery + raw_tax + raw_other - total;
        
        const discount = diff > 0 ? diff : 0;
        const delivery = (diff < 0 && Math.abs(diff) === raw_delivery) ? 0 : raw_delivery;
        const tax = raw_tax;
        const other = raw_other;
        
        const summary = {
          order_id: order.id,
          customer_name: order.customer_name,
          phone: order.phone,
          address: order.address,
          payment_mode: order.payment_mode,
          items: orderedItems,
          subtotal: subtotal,
          discount: discount,
          delivery: delivery,
          tax: tax,
          other: other,
          total: total,
          coupon_code: ""
        };
        showOrderSuccessModal(summary);
      }
    }
  });
}

const applyPromoBtn = document.querySelector("#applyPromoBtn");
if (applyPromoBtn) {
  applyPromoBtn.addEventListener("click", () => {
    const input = document.querySelector("#promoCodeInput");
    const msg = document.querySelector("#promoMessage");
    const code = (input.value || "").trim().toUpperCase();
    
    if (!code) {
      appState.appliedPromo = null;
      if (msg) {
        msg.textContent = "";
        msg.className = "promo-msg hidden";
      }
      renderDashboard();
      return;
    }
    
    const subtotal = getCartProducts().reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (subtotal === 0) {
      if (msg) {
        msg.textContent = "Your cart is empty";
        msg.className = "promo-msg error";
      }
      return;
    }
    
    const promo = appState.coupons.find(c => c.code.toUpperCase() === code);
    if (!promo || !promo.active) {
      if (msg) {
        msg.textContent = "Invalid coupon code";
        msg.className = "promo-msg error";
      }
      return;
    }
    
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      if (msg) {
        msg.textContent = "This coupon code has expired";
        msg.className = "promo-msg error";
      }
      return;
    }
    
    if (promo.usage_limit !== null && promo.usage_limit !== undefined && (promo.usage_count || 0) >= promo.usage_limit) {
      if (msg) {
        msg.textContent = "This coupon has reached its usage limit";
        msg.className = "promo-msg error";
      }
      return;
    }
    
    if (subtotal < Number(promo.min_subtotal || 0)) {
      if (msg) {
        msg.textContent = `Coupon requires minimum subtotal of Rs. ${Number(promo.min_subtotal).toLocaleString()}`;
        msg.className = "promo-msg error";
      }
      return;
    }
    
    appState.appliedPromo = code;
    if (msg) {
      let desc = "";
      if (promo.code.toUpperCase() === "FREEDELIVERY") {
        desc = "Free Delivery";
      } else if (promo.discount_type === "percentage") {
        desc = `${promo.discount_value}% off`;
      } else if (promo.discount_type === "fixed") {
        desc = `Rs. ${promo.discount_value} off`;
      }
      msg.textContent = `Coupon ${promo.code} applied (${desc})`;
      msg.className = "promo-msg success";
    }
    
    renderDashboard();
  });
}

const applyPointsBtn = document.querySelector("#applyPointsBtn");
if (applyPointsBtn) {
  applyPointsBtn.addEventListener("click", () => {
    const input = document.querySelector("#checkoutRedeemPointsInput");
    const msg = document.querySelector("#loyaltyMessage");
    if (!input || !msg) return;

    const settings = appState.settings || {};
    const loyaltyEnabled = settings.loyalty_enabled !== undefined ? settings.loyalty_enabled === "1" : true;
    const redeemRatio = settings.loyalty_redeem_ratio !== undefined ? parseFloat(settings.loyalty_redeem_ratio) : 10.0;
    const minRedeemSubtotal = settings.loyalty_min_order_to_redeem !== undefined ? parseFloat(settings.loyalty_min_order_to_redeem) : 0.0;
    const maxRedemptionPercent = settings.loyalty_max_redemption_percent !== undefined ? parseFloat(settings.loyalty_max_redemption_percent) : 100.0;

    if (!loyaltyEnabled) {
      msg.textContent = "Loyalty points redemption is currently disabled";
      msg.className = "loyalty-msg error";
      msg.classList.remove("hidden");
      return;
    }

    const val = parseInt(input.value || "0", 10);
    if (isNaN(val) || val < 0) {
      msg.textContent = "Please enter a valid amount of points to redeem";
      msg.className = "loyalty-msg error";
      msg.classList.remove("hidden");
      return;
    }

    if (input.value === "" || val === 0) {
      appState.appliedPointsRedeem = 0;
      msg.textContent = "";
      msg.className = "loyalty-msg hidden";
      renderDashboard();
      return;
    }

    const maxPoints = appState.profile ? (appState.profile.loyalty_points !== undefined ? appState.profile.loyalty_points : 100) : 100;
    if (val > maxPoints) {
      msg.textContent = `You only have ${maxPoints} points available`;
      msg.className = "loyalty-msg error";
      msg.classList.remove("hidden");
      return;
    }

    const items = getCartProducts();
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (subtotal === 0) {
      msg.textContent = "Your cart is empty";
      msg.className = "loyalty-msg error";
      msg.classList.remove("hidden");
      return;
    }

    if (subtotal < minRedeemSubtotal) {
      msg.textContent = `Minimum order subtotal to redeem points is Rs. ${minRedeemSubtotal.toFixed(2)}`;
      msg.className = "loyalty-msg error";
      msg.classList.remove("hidden");
      return;
    }

    let coupon = (appState.appliedPromo || "").trim().toUpperCase();
    let discount = 0;
    const promo = appState.coupons.find(c => c.code.toUpperCase() === coupon);
    if (promo && promo.active && subtotal >= Number(promo.min_subtotal || 0)) {
      if (promo.discount_type === "percentage") {
        discount = subtotal * (Number(promo.discount_value) / 100);
      } else if (promo.discount_type === "fixed") {
        discount = Number(promo.discount_value);
      }
    }

    const availableLimit = subtotal - discount;
    const maxAllowedDiscount = availableLimit * (maxRedemptionPercent / 100.0);
    
    let pointsDiscount = val / redeemRatio;
    if (pointsDiscount > maxAllowedDiscount) {
      pointsDiscount = maxAllowedDiscount;
      const allowedPoints = Math.floor(maxAllowedDiscount * redeemRatio);
      appState.appliedPointsRedeem = allowedPoints;
      input.value = allowedPoints;
      
      const capMessage = maxRedemptionPercent < 100.0 
        ? `capped to ${maxRedemptionPercent}% of remaining subtotal` 
        : `capped to subtotal`;
      msg.textContent = `Points discount ${capMessage}. Redeemed ${allowedPoints} points (Rs. ${pointsDiscount.toFixed(2)} off)`;
      msg.className = "loyalty-msg success";
      msg.classList.remove("hidden");
    } else {
      appState.appliedPointsRedeem = val;
      msg.textContent = `Redeemed ${val} points (Rs. ${pointsDiscount.toFixed(2)} off)`;
      msg.className = "loyalty-msg success";
      msg.classList.remove("hidden");
    }

    renderDashboard();
  });
}

async function cancelOrder(orderId) {
  try {
    const result = await api(`/api/orders/${orderId}/cancel`, {
      method: "PUT"
    });
    showToast("Order cancelled successfully!");
    await Promise.all([loadCustomerProfile(), loadMyOrders()]);
    renderPurchaseHistory();
    renderDashboard();
  } catch (error) {
    showToast(error.message || "Failed to cancel order", "error");
  }
}

const availableCouponsContainer = document.querySelector(".available-coupons");
if (availableCouponsContainer) {
  availableCouponsContainer.addEventListener("click", (event) => {
    const pill = event.target.closest(".coupon-pill");
    if (pill) {
      const promoInput = document.querySelector("#promoCodeInput");
      if (promoInput) {
        promoInput.value = pill.dataset.coupon;
        const applyBtn = document.querySelector("#applyPromoBtn");
        if (applyBtn) applyBtn.click();
      }
    }
  });
}

// New Feature Global Variables
let activeSizeFinderProductId = null;
let upiTimerInterval = null;
let pendingOrderData = null;

// Size & Fit Finder Logic
function openSizeFinder(productId) {
  activeSizeFinderProductId = productId;
  const modal = document.querySelector("#sizeFinderModal");
  if (modal) {
    modal.classList.remove("hidden");
  }
  calculateFitRecommendation();
}

function calculateFitRecommendation() {
  const heightInput = document.querySelector("#sfHeight");
  const weightInput = document.querySelector("#sfWeight");
  const fitInput = document.querySelector("#sfFit");
  
  if (!heightInput || !weightInput || !fitInput) return;
  
  const height = parseInt(heightInput.value, 10);
  const weight = parseInt(weightInput.value, 10);
  const fit = fitInput.value;
  
  const heightVal = document.querySelector("#sfHeightVal");
  const weightVal = document.querySelector("#sfWeightVal");
  
  if (heightVal) heightVal.textContent = height + " cm";
  if (weightVal) weightVal.textContent = weight + " kg";
  
  if (!activeSizeFinderProductId) return;
  const product = appState.products.find(p => Number(p.id) === Number(activeSizeFinderProductId));
  if (!product) return;
  
  const bmi = weight / ((height / 100) ** 2);
  let baseIdx = 2; // Default M
  if (bmi < 18.5) baseIdx = 0; // XS
  else if (bmi < 21.0) baseIdx = 1; // S
  else if (bmi < 24.5) baseIdx = 2; // M
  else if (bmi < 28.0) baseIdx = 3; // L
  else if (bmi < 32.0) baseIdx = 4; // XL
  else baseIdx = 5; // XXL
  
  let recommendedIdx = baseIdx;
  if (fit === "slim") {
    recommendedIdx = Math.max(0, baseIdx - 1);
  } else if (fit === "loose") {
    recommendedIdx = Math.min(5, baseIdx + 1);
  }
  
  const sizeNames = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  const baseRecSize = sizeNames[recommendedIdx];
  
  const available = (product.size || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
  
  let finalSize = baseRecSize;
  let scoreAdjust = 0;
  
  if (available.length > 0) {
    if (available.includes(baseRecSize)) {
      finalSize = baseRecSize;
    } else {
      let minDistance = 999;
      let closestSize = available[0];
      available.forEach(sz => {
        const szIdx = sizeNames.indexOf(sz);
        if (szIdx !== -1) {
          const dist = Math.abs(szIdx - recommendedIdx);
          if (dist < minDistance) {
            minDistance = dist;
            closestSize = sz;
          }
        }
      });
      finalSize = closestSize;
      scoreAdjust = -12 * minDistance;
    }
  }
  
  const bmiFraction = (bmi % 3) / 3;
  let baseScore = 98 - Math.abs(bmiFraction - 0.5) * 5 + scoreAdjust;
  baseScore = Math.max(68, Math.min(99, Math.round(baseScore)));
  
  const recSizeEl = document.querySelector("#sfRecommendedSize");
  const matchEl = document.querySelector("#sfMatchPercent");
  if (recSizeEl) recSizeEl.textContent = finalSize;
  if (matchEl) matchEl.textContent = `${baseScore}% Fit Match Score`;
  
  const resultBox = document.querySelector("#sfResultBox");
  if (resultBox) resultBox.classList.remove("hidden");
  
  const applyBtn = document.querySelector("#sfApplyBtn");
  if (applyBtn) applyBtn.disabled = false;
}

// UPI Payment Logic
function startUpiTimer() {
  if (upiTimerInterval) clearInterval(upiTimerInterval);
  let duration = 300;
  const timerDisplay = document.querySelector("#upiTimer");
  if (!timerDisplay) return;
  
  const updateTimer = () => {
    let minutes = Math.floor(duration / 60);
    let seconds = duration % 60;
    
    minutes = minutes < 10 ? "0" + minutes : minutes;
    seconds = seconds < 10 ? "0" + seconds : seconds;
    
    timerDisplay.textContent = `${minutes}:${seconds}`;
    
    if (duration <= 0) {
      clearInterval(upiTimerInterval);
      showToast("UPI payment session expired. Please try again.");
      const modal = document.querySelector("#upiPaymentModal");
      if (modal) modal.classList.add("hidden");
      const submitButton = document.querySelector("#orderForm button[type='submit']");
      if (submitButton) submitButton.disabled = false;
    }
    duration--;
  };
  
  updateTimer();
  upiTimerInterval = setInterval(updateTimer, 1000);
}

async function confirmUpiPayment() {
  const upiStatusContainer = document.querySelector("#upiStatusContainer");
  const upiStatusText = document.querySelector("#upiStatusText");
  const upiConfirmBtn = document.querySelector("#upiConfirmBtn");
  const upiCancelBtn = document.querySelector("#upiCancelBtn");
  
  if (upiStatusContainer) {
    upiStatusContainer.classList.remove("hidden");
  }
  if (upiStatusText) {
    upiStatusText.textContent = "Verifying transaction security...";
  }
  if (upiConfirmBtn) {
    upiConfirmBtn.disabled = true;
    upiConfirmBtn.textContent = "Verifying...";
  }
  if (upiCancelBtn) {
    upiCancelBtn.disabled = true;
  }
  
  setTimeout(async () => {
    try {
      if (upiStatusText) {
        upiStatusText.textContent = "Processing order creation...";
      }
      
      const result = await api("/api/orders", { method: "POST", body: JSON.stringify(pendingOrderData) });
      
      const orderedItems = getCartProducts();
      const orderSummary = {
        order_id: result.order_id,
        customer_name: pendingOrderData.customer_name,
        phone: pendingOrderData.phone,
        address: pendingOrderData.address,
        payment_mode: pendingOrderData.payment_mode,
        items: orderedItems.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          size: item.size
        })),
        subtotal: result.subtotal,
        discount: result.discount,
        delivery: result.delivery,
        tax: result.tax,
        other: result.other,
        total: result.total,
        coupon_code: result.coupon_code
      };

      appState.cart = [];
      appState.appliedPromo = null;
      appState.appliedPointsRedeem = 0;
      const promoInput = document.querySelector("#promoCodeInput");
      if (promoInput) promoInput.value = "";
      const promoMsg = document.querySelector("#promoMessage");
      if (promoMsg) {
        promoMsg.textContent = "";
        promoMsg.className = "promo-msg hidden";
      }
      const pointsInput = document.querySelector("#checkoutRedeemPointsInput");
      if (pointsInput) pointsInput.value = "";
      const pointsMsg = document.querySelector("#loyaltyMessage");
      if (pointsMsg) {
        pointsMsg.textContent = "";
        pointsMsg.className = "loyalty-msg hidden";
      }

      orderForm.reset();
      
      if (pendingOrderData.save_profile) {
        await loadCustomerProfile();
      }
      await loadMyOrders();
      loadQuests();
      renderDashboard();
      
      if (upiTimerInterval) clearInterval(upiTimerInterval);
      const modal = document.querySelector("#upiPaymentModal");
      if (modal) modal.classList.add("hidden");
      
      showOrderSuccessModal(orderSummary);
      pendingOrderData = null;
    } catch (error) {
      showToast(`Payment Verification Failed: ${error.message}`);
      if (upiConfirmBtn) {
        upiConfirmBtn.disabled = false;
        upiConfirmBtn.textContent = "Confirm Payment";
      }
      if (upiCancelBtn) {
        upiCancelBtn.disabled = false;
      }
      if (upiStatusContainer) {
        upiStatusContainer.classList.add("hidden");
      }
    }
  }, 2000);
}

// Chatbot Logic
function resetChatWidget() {
  const chatMessages = document.querySelector("#chatMessages");
  if (chatMessages) {
    const userName = appState.user ? (appState.profile?.saved_name || appState.user.full_name || "Customer") : "Customer";
    chatMessages.innerHTML = `
      <!-- Initial Greetings -->
      <div class="chat-bubble bot">
        Hello <strong>${escapeHTML(userName)}</strong>! Welcome to Shibani Fashion Store. How can I help you today?
      </div>
      <div id="chatQuickReplies" class="chat-grid-replies">
        <button class="chat-grid-btn" data-faq="stylist" type="button">
          <span class="grid-btn-icon">✨</span>
          <span class="grid-btn-title">Style Assistant</span>
          <span class="grid-btn-desc">Find matching outfits</span>
        </button>
        <button class="chat-grid-btn" data-faq="order" type="button">
          <span class="grid-btn-icon">📦</span>
          <span class="grid-btn-title">Track Orders</span>
          <span class="grid-btn-desc">View shipment status</span>
        </button>
        <button class="chat-grid-btn" data-faq="coupons" type="button">
          <span class="grid-btn-icon">🏷️</span>
          <span class="grid-btn-title">Active Coupons</span>
          <span class="grid-btn-desc">Browse promo codes</span>
        </button>
        <button class="chat-grid-btn" data-faq="agent" type="button">
          <span class="grid-btn-icon">💬</span>
          <span class="grid-btn-title">Live Concierge</span>
          <span class="grid-btn-desc">Speak with Pooja</span>
        </button>
      </div>
    `;
  }
  
  const chatWidget = document.querySelector("#supportChatWidget");
  if (chatWidget) {
    chatWidget.classList.add("hidden");
  }
  
  const chatWidgetToggle = document.querySelector("#chatWidgetToggle");
  if (chatWidgetToggle) {
    chatWidgetToggle.classList.add("hidden");
  }
  
  const chatAgentBanner = document.querySelector("#chatAgentBanner");
  if (chatAgentBanner) {
    chatAgentBanner.classList.add("hidden");
  }
  
  appState.chatAgentActive = false;
  appState.chatQuiz = null;
  appState.chatPendingAdd = null;
}

function addChatMessage(sender, text, isHtml = false) {
  const chatMessages = document.querySelector("#chatMessages");
  if (!chatMessages) return;
  
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${sender}`;
  
  if (sender === 'bot' && isHtml) {
    bubble.innerHTML = text;
  } else {
    bubble.innerHTML = escapeHTML(text).replace(/\n/g, "<br>");
  }
  
  const quickReplies = document.querySelector("#chatQuickReplies");
  if (quickReplies && sender === 'user') {
    quickReplies.style.display = 'none';
  }
  
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showBotReply(reply, delay = 1000) {
  const chatMessages = document.querySelector("#chatMessages");
  if (!chatMessages) return;
  
  const typingIndicator = document.createElement("div");
  typingIndicator.id = "chatTypingIndicator";
  typingIndicator.className = "chat-bubble bot";
  typingIndicator.style.fontStyle = "italic";
  typingIndicator.style.color = "var(--muted)";
  typingIndicator.innerHTML = `
    <span class="typing-dot" style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--muted); animation: bounce 0.6s infinite alternate;"></span>
    <span class="typing-dot" style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--muted); animation: bounce 0.6s 0.2s infinite alternate;"></span>
    <span class="typing-dot" style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--muted); animation: bounce 0.6s 0.4s infinite alternate;"></span>
  `;
  chatMessages.appendChild(typingIndicator);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  setTimeout(() => {
    const indicator = document.querySelector("#chatTypingIndicator");
    if (indicator) indicator.remove();
    
    if (typeof reply === "string") {
      addChatMessage('bot', reply, false);
    } else if (reply && typeof reply === "object") {
      addChatMessage('bot', reply.text, reply.isHtml);
    }
  }, delay);
}

// Bind New Feature Event Listeners
function initNewFeatures() {
  const sfHeightInput = document.querySelector("#sfHeight");
  if (sfHeightInput) sfHeightInput.addEventListener("input", calculateFitRecommendation);
  const sfWeightInput = document.querySelector("#sfWeight");
  if (sfWeightInput) sfWeightInput.addEventListener("input", calculateFitRecommendation);
  const sfFitInput = document.querySelector("#sfFit");
  if (sfFitInput) sfFitInput.addEventListener("change", calculateFitRecommendation);
  
  const sfApplyBtn = document.querySelector("#sfApplyBtn");
  if (sfApplyBtn) {
    sfApplyBtn.addEventListener("click", () => {
      if (!activeSizeFinderProductId) return;
      const recSizeEl = document.querySelector("#sfRecommendedSize");
      if (recSizeEl) {
        const recommendedSize = recSizeEl.textContent;
        const card = document.querySelector(`.product-card[data-product-id="${activeSizeFinderProductId}"]`);
        if (card) {
          const pills = card.querySelectorAll(".size-pill");
          let found = false;
          pills.forEach(pill => {
            if (pill.dataset.size.toUpperCase() === recommendedSize.toUpperCase()) {
              pills.forEach(p => p.classList.remove("selected"));
              pill.classList.add("selected");
              found = true;
            }
          });
          if (!found && pills.length > 0) {
            pills.forEach(pill => {
              if (pill.dataset.size.toUpperCase().includes(recommendedSize.toUpperCase()) || recommendedSize.toUpperCase().includes(pill.dataset.size.toUpperCase())) {
                pills.forEach(p => p.classList.remove("selected"));
                pill.classList.add("selected");
                found = true;
              }
            });
          }
        }
      }
      const modal = document.querySelector("#sizeFinderModal");
      if (modal) modal.classList.add("hidden");
      activeSizeFinderProductId = null;
    });
  }
  
  const sfCloseBtn = document.querySelector("#sfCloseBtn");
  if (sfCloseBtn) {
    sfCloseBtn.addEventListener("click", () => {
      const modal = document.querySelector("#sizeFinderModal");
      if (modal) modal.classList.add("hidden");
      activeSizeFinderProductId = null;
    });
  }

  const sfModal = document.querySelector("#sizeFinderModal");
  if (sfModal) {
    sfModal.addEventListener("click", (e) => {
      if (e.target === sfModal) {
        sfModal.classList.add("hidden");
        activeSizeFinderProductId = null;
      }
    });
  }

  const upiConfirmBtn = document.querySelector("#upiConfirmBtn");
  if (upiConfirmBtn) {
    upiConfirmBtn.addEventListener("click", confirmUpiPayment);
  }
  const upiCancelBtn = document.querySelector("#upiCancelBtn");
  if (upiCancelBtn) {
    upiCancelBtn.addEventListener("click", () => {
      if (upiTimerInterval) clearInterval(upiTimerInterval);
      const modal = document.querySelector("#upiPaymentModal");
      if (modal) modal.classList.add("hidden");
      pendingOrderData = null;
      showToast("UPI checkout cancelled");
    });
  }

  const upiModal = document.querySelector("#upiPaymentModal");
  if (upiModal) {
    upiModal.addEventListener("click", (e) => {
      if (e.target === upiModal) {
        if (upiTimerInterval) clearInterval(upiTimerInterval);
        upiModal.classList.add("hidden");
        pendingOrderData = null;
        showToast("UPI checkout cancelled");
      }
    });
  }

  initExtraNewFeatures();

  // Chatbot NLP & Concierge Helpers
  function generateChatCartHtml() {
    if (appState.cart.length === 0) {
      return `
        <div class="chat-cart-card" id="chatCartCard">
          <div class="chat-cart-header">🛒 Your Shopping Bag</div>
          <div style="text-align: center; padding: 16px 0; color: var(--muted); font-size: 11px;">
            Your shopping bag is empty.
          </div>
        </div>
      `;
    }
    
    let itemsHtml = "";
    let subtotal = 0;
    
    for (const item of appState.cart) {
      const prod = appState.products.find(p => Number(p.id) === Number(item.product_id));
      if (!prod) continue;
      
      const price = prod.price;
      const itemTotal = price * item.quantity;
      subtotal += itemTotal;
      
      const images = getProductImages(prod);
      const imgUrl = images[0] ? encodeURI(images[0]) : "";
      const imgHtml = imgUrl 
        ? `<img class="chat-cart-item-img" src="${imgUrl}" alt="${escapeHTML(prod.name)}" />`
        : `<div class="chat-cart-item-img" style="display:grid; place-items:center; background:rgba(0,0,0,0.05); font-size:9px; font-weight:bold; color:var(--muted);">${escapeHTML(initials(prod.name))}</div>`;
      
      itemsHtml += `
        <div class="chat-cart-item" data-product-id="${prod.id}" data-size="${escapeHTML(item.size)}" data-color="${escapeHTML(item.color)}">
          ${imgHtml}
          <div class="chat-cart-item-details">
            <div class="chat-cart-item-name" title="${escapeHTML(prod.name)}">${escapeHTML(prod.name)}</div>
            <div class="chat-cart-item-meta">${escapeHTML(item.size)} / ${escapeHTML(item.color)}</div>
            <div class="chat-cart-item-price">${formatPrice(price)}</div>
          </div>
          <div class="chat-cart-item-actions">
            <button class="chat-cart-qty-btn minus" data-action="decrease" type="button">−</button>
            <span class="chat-cart-qty-value">${item.quantity}</span>
            <button class="chat-cart-qty-btn plus" data-action="increase" type="button">+</button>
            <button class="chat-cart-remove-btn" type="button" title="Remove">🗑️</button>
          </div>
        </div>
      `;
    }
    
    let discountHtml = "";
    let finalTotal = subtotal;
    
    if (appState.appliedPromo) {
      const promo = appState.coupons.find(c => c.code.toUpperCase() === appState.appliedPromo.toUpperCase());
      if (promo) {
        let discountAmount = 0;
        if (promo.discount_type === "percentage") {
          discountAmount = (subtotal * Number(promo.discount_value)) / 100;
        } else if (promo.discount_type === "fixed") {
          discountAmount = Number(promo.discount_value);
        }
        if (discountAmount > subtotal) discountAmount = subtotal;
        finalTotal = subtotal - discountAmount;
        
        if (discountAmount > 0) {
          discountHtml = `
            <div class="chat-cart-row discount">
              <span>Promo (${escapeHTML(promo.code)}):</span>
              <strong>-${formatPrice(discountAmount)}</strong>
            </div>
          `;
        }
      }
    }
    
    return `
      <div class="chat-cart-card" id="chatCartCard">
        <div class="chat-cart-header">🛒 Your Shopping Bag</div>
        <div class="chat-cart-items">
          ${itemsHtml}
        </div>
        <div class="chat-cart-summary">
          <div class="chat-cart-row">
            <span>Subtotal:</span>
            <strong>${formatPrice(subtotal)}</strong>
          </div>
          ${discountHtml}
          <div class="chat-cart-row" style="font-size:11.5px; font-weight:700; border-top:1px dashed var(--line); padding-top:6px; margin-top:4px;">
            <span>Total:</span>
            <strong>${formatPrice(finalTotal)}</strong>
          </div>
        </div>
        <button class="chat-checkout-btn-main" id="chatGoToCheckoutBtn" type="button">Proceed to Checkout ➔</button>
      </div>
    `;
  }

  function generateChatOrderTrackerHtml(order) {
    const status = (order.status || "New").toLowerCase();
    
    if (status === "cancelled") {
      return `
        <div class="chat-tracker-timeline">
          <div class="tracker-title">📦 Order #${order.id}</div>
          <div style="background: rgba(224, 86, 126, 0.1); border: 1px solid var(--rose); color: var(--rose); padding: 8px; border-radius: 10px; text-align: center; font-size: 11px; font-weight: 700; margin: 8px 0;">
            ❌ This order has been Cancelled
          </div>
          <div class="tracker-footer">
            Total: <strong>${formatPrice(order.total)}</strong> · Date: ${new Date(order.created_at || Date.now()).toLocaleDateString()}
          </div>
        </div>
      `;
    }
    
    let s1Class = "", s2Class = "", s3Class = "", s4Class = "";
    let l1Active = false, l2Active = false, l3Active = false;
    
    if (status === "new") {
      s1Class = "active";
    } else if (status === "confirmed") {
      s1Class = "completed";
      l1Active = true;
      s2Class = "active";
    } else if (status === "packed" || status === "out for delivery") {
      s1Class = "completed";
      s2Class = "completed";
      l1Active = true;
      l2Active = true;
      s3Class = "active";
    } else if (status === "delivered") {
      s1Class = "completed";
      s2Class = "completed";
      s3Class = "completed";
      s4Class = "active completed";
      l1Active = true;
      l2Active = true;
      l3Active = true;
    }
    
    const line1Html = l1Active ? "active" : "";
    const line2Html = l2Active ? "active" : "";
    const line3Html = l3Active ? "active" : "";
    
    return `
      <div class="chat-tracker-timeline">
        <div class="tracker-title">📦 Order #${order.id} Tracking Details</div>
        <div class="tracker-steps-row">
          <div class="tracker-timeline-step ${s1Class}">
            <div class="step-icon">📝</div>
            <div class="step-text">Ordered</div>
          </div>
          <div class="tracker-timeline-line ${line1Html}"></div>
          <div class="tracker-timeline-step ${s2Class}">
            <div class="step-icon">✅</div>
            <div class="step-text">Confirmed</div>
          </div>
          <div class="tracker-timeline-line ${line2Html}"></div>
          <div class="tracker-timeline-step ${s3Class}">
            <div class="step-icon">🚚</div>
            <div class="step-text">Shipped</div>
          </div>
          <div class="tracker-timeline-line ${line3Html}"></div>
          <div class="tracker-timeline-step ${s4Class}">
            <div class="step-icon">🎁</div>
            <div class="step-text">Delivered</div>
          </div>
        </div>
        <div class="tracker-footer">
          Current Status: <strong style="color:var(--teal); text-transform: capitalize;">${order.status}</strong><br>
          Total: <strong>${formatPrice(order.total)}</strong> · Placed: ${new Date(order.created_at || Date.now()).toLocaleDateString()}
        </div>
      </div>
    `;
  }

  function generateChatCouponsHtml() {
    const active = appState.coupons.filter(c => c.active);
    if (active.length === 0) {
      return `
        <div class="chat-coupons-container" id="chatCouponsContainer">
          <div class="chat-cart-card">
            <div class="chat-cart-header">🏷️ Active Coupons</div>
            <div style="text-align: center; padding: 12px; color: var(--muted); font-size: 11px;">
              There are currently no active coupon codes.
            </div>
          </div>
        </div>
      `;
    }
    
    let cardsHtml = "";
    for (const c of active) {
      let desc = "";
      if (c.code.toUpperCase() === "FREEDELIVERY") {
        desc = "Free shipping on all orders";
      } else if (c.discount_type === "percentage") {
        desc = `${c.discount_value}% off your purchase`;
      } else {
        desc = `Rs. ${c.discount_value} off your order`;
      }
      const minText = c.min_subtotal > 0 ? `Min order Rs. ${c.min_subtotal}` : "No min spend";
      
      const isApplied = appState.appliedPromo && appState.appliedPromo.toUpperCase() === c.code.toUpperCase();
      const btnText = isApplied ? "Applied ✅" : "Apply Code";
      const btnClass = isApplied ? "chat-coupon-apply-btn applied" : "chat-coupon-apply-btn";
      
      cardsHtml += `
        <div class="chat-coupon-card">
          <div class="coupon-badge">${escapeHTML(minText)}</div>
          <div class="coupon-code">${escapeHTML(c.code)}</div>
          <div class="coupon-desc">${escapeHTML(desc)}</div>
          <button class="${btnClass}" data-coupon-code="${escapeHTML(c.code)}" type="button">${btnText}</button>
        </div>
      `;
    }
    
    return `
      <div class="chat-coupons-container" id="chatCouponsContainer">
        <div style="font-weight: 700; font-size: 12.5px; color: var(--ink); margin-bottom: 6px;">🏷️ Active Coupons & Offers</div>
        <div class="chat-coupons-carousel">
          ${cardsHtml}
        </div>
      </div>
    `;
  }

  function applyPromoChat(code) {
    const cleanCode = (code || "").trim().toUpperCase();
    if (!cleanCode) {
      appState.appliedPromo = null;
      renderDashboard();
      return { success: true, message: "Coupon removed." };
    }
    const subtotal = getCartProducts().reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (subtotal === 0) {
      return { success: false, message: "Your shopping bag is empty." };
    }
    const promo = appState.coupons.find(c => c.code.toUpperCase() === cleanCode);
    if (!promo || !promo.active) {
      return { success: false, message: `Coupon code "${cleanCode}" is invalid.` };
    }
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return { success: false, message: `Coupon code "${cleanCode}" has expired.` };
    }
    if (promo.usage_limit !== null && promo.usage_limit !== undefined && (promo.usage_count || 0) >= promo.usage_limit) {
      return { success: false, message: `Coupon code "${cleanCode}" usage limit reached.` };
    }
    if (subtotal < Number(promo.min_subtotal || 0)) {
      return { success: false, message: `Coupon code "${cleanCode}" requires a minimum subtotal of Rs. ${Number(promo.min_subtotal).toLocaleString()}.` };
    }
    appState.appliedPromo = cleanCode;
    
    let desc = "";
    if (promo.code.toUpperCase() === "FREEDELIVERY") {
      desc = "Free Delivery";
    } else if (promo.discount_type === "percentage") {
      desc = `${promo.discount_value}% off`;
    } else if (promo.discount_type === "fixed") {
      desc = `Rs. ${promo.discount_value} off`;
    }
    
    const input = document.querySelector("#promoCodeInput");
    if (input) input.value = cleanCode;
    const msg = document.querySelector("#promoMessage");
    if (msg) {
      msg.textContent = `Coupon ${promo.code} applied (${desc})`;
      msg.className = "promo-msg success";
    }
    
    renderDashboard();
    return { success: true, message: `Coupon <strong>${promo.code}</strong> applied successfully (${desc})!`, code: promo.code, discount: desc };
  }

  function modifyCartFromChat(text) {
    const lower = text.toLowerCase();
    
    // Clear / Empty cart
    if (lower === "empty cart" || lower === "clear cart" || lower === "empty bag" || lower === "clear bag") {
      appState.cart = [];
      appState.appliedPromo = null;
      renderDashboard();
      return {
        text: "🛒 Your shopping bag has been cleared. Let me know if you would like to view some products!",
        isHtml: false
      };
    }
    
    // Remove product
    if (lower.startsWith("remove ") || lower.startsWith("delete ")) {
      let cleanName = lower.replace(/^(remove|delete)\s+(?:item\s+|product\s+)?/g, "").trim();
      let matchedItem = null;
      let matchedProd = null;
      
      const idMatch = cleanName.match(/^#?(\d+)$/);
      if (idMatch) {
        const prodId = Number(idMatch[1]);
        matchedItem = appState.cart.find(item => Number(item.product_id) === prodId);
        if (matchedItem) {
          matchedProd = appState.products.find(p => Number(p.id) === prodId);
        }
      } else {
        for (const item of appState.cart) {
          const prod = appState.products.find(p => Number(p.id) === Number(item.product_id));
          if (prod && prod.name.toLowerCase().includes(cleanName)) {
            matchedItem = item;
            matchedProd = prod;
            break;
          }
        }
      }
      
      if (matchedItem && matchedProd) {
        appState.cart = appState.cart.filter(item => item !== matchedItem);
        renderDashboard();
        return {
          text: `🗑️ Removed <strong>${escapeHTML(matchedProd.name)}</strong> (${escapeHTML(matchedItem.size)} / ${escapeHTML(matchedItem.color)}) from your cart.`,
          isHtml: true
        };
      } else {
        return {
          text: `I couldn't find "${escapeHTML(cleanName)}" in your cart. Check your cart using "show cart".`,
          isHtml: true
        };
      }
    }
    
    // Update quantity
    if (lower.includes("quantity") || lower.includes("qty") || lower.includes("set ") || lower.includes("change ")) {
      const qtyMatch = lower.match(/(?:quantity|qty|to)\s+(\d+)/i) || lower.match(/(?:set|change)\s+(\d+)/i);
      if (qtyMatch) {
        const targetQty = Number(qtyMatch[1]);
        let cleanName = lower
          .replace(/(?:set|change|update|increase|decrease)\s+(?:quantity|qty)?\s*(?:of)?/g, "")
          .replace(/(?:to|qty|quantity)\s+\d+/g, "")
          .replace(/item\s+|product\s+/g, "")
          .trim();
          
        let matchedItem = null;
        let matchedProd = null;
        
        const idMatch = cleanName.match(/^#?(\d+)$/);
        if (idMatch) {
          const prodId = Number(idMatch[1]);
          matchedItem = appState.cart.find(item => Number(item.product_id) === prodId);
          if (matchedItem) {
            matchedProd = appState.products.find(p => Number(p.id) === prodId);
          }
        } else {
          for (const item of appState.cart) {
            const prod = appState.products.find(p => Number(p.id) === Number(item.product_id));
            if (prod && prod.name.toLowerCase().includes(cleanName)) {
              matchedItem = item;
              matchedProd = prod;
              break;
            }
          }
        }
        
        if (matchedItem && matchedProd) {
          if (targetQty <= 0) {
            appState.cart = appState.cart.filter(item => item !== matchedItem);
            renderDashboard();
            return {
              text: `🗑️ Removed <strong>${escapeHTML(matchedProd.name)}</strong> from your cart.`,
              isHtml: true
            };
          } else {
            matchedItem.quantity = targetQty;
            renderDashboard();
            return {
              text: `📝 Updated quantity of <strong>${escapeHTML(matchedProd.name)}</strong> (${escapeHTML(matchedItem.size)} / ${escapeHTML(matchedItem.color)}) to <strong>${targetQty}</strong>.`,
              isHtml: true
            };
          }
        } else {
          return {
            text: `I couldn't find "${escapeHTML(cleanName)}" in your cart. Check your cart using "show cart".`,
            isHtml: true
          };
        }
      }
    }
    
    return null;
  }

  function searchProductsChat(query) {
    const lower = query.toLowerCase();
    let matched = [...appState.products];

    // 1. Parse Category
    let category = null;
    if (lower.includes("men")) {
      category = "men";
    } else if (lower.includes("women") || lower.includes("girl") || lower.includes("lady") || lower.includes("ladies") || lower.includes("saree") || lower.includes("dress")) {
      category = "women";
    } else if (lower.includes("kids") || lower.includes("child") || lower.includes("boy") || lower.includes("baby")) {
      category = "kids";
    }
    if (category) {
      matched = matched.filter(p => p.category.toLowerCase() === category);
    }

    // 2. Parse price/budget filters
    const underMatch = lower.match(/(?:under|below|less than|budget|price\s*<|<)\s*(\d+)/);
    if (underMatch) {
      const maxPrice = parseFloat(underMatch[1]);
      matched = matched.filter(p => p.price <= maxPrice);
    }

    const aboveMatch = lower.match(/(?:above|over|more than|greater than|price\s*>\s*|>)\s*(\d+)/);
    if (aboveMatch) {
      const minPrice = parseFloat(aboveMatch[1]);
      matched = matched.filter(p => p.price >= minPrice);
    }

    // 3. Parse Color
    const colors = ["red", "blue", "black", "white", "green", "yellow", "pink", "purple", "orange", "grey", "gray", "brown", "gold", "silver"];
    let matchedColor = null;
    for (const c of colors) {
      if (lower.includes(c)) {
        matchedColor = c;
        break;
      }
    }
    if (matchedColor) {
      matched = matched.filter(p => p.color && p.color.toLowerCase().includes(matchedColor));
    }

    // 3.5 Parse Occasion/Theme matching
    if (lower.includes("casual")) {
      matched = matched.filter(p => p.name.toLowerCase().includes("shirt") || p.name.toLowerCase().includes("set") || p.name.toLowerCase().includes("kurti") || (p.description && p.description.toLowerCase().includes("casual")));
    } else if (lower.includes("office") || lower.includes("work")) {
      matched = matched.filter(p => p.name.toLowerCase().includes("shirt") || p.name.toLowerCase().includes("kurti") || (p.description && p.description.toLowerCase().includes("office")) || (p.description && p.description.toLowerCase().includes("work")));
    } else if (lower.includes("party") || lower.includes("festive") || lower.includes("wedding") || lower.includes("occasion")) {
      matched = matched.filter(p => p.name.toLowerCase().includes("saree") || (p.badge && p.badge.toLowerCase().includes("best seller")) || (p.badge && p.badge.toLowerCase().includes("new")) || (p.description && p.description.toLowerCase().includes("festive")));
    } else if (lower.includes("daily") || lower.includes("comfort")) {
      matched = matched.filter(p => p.name.toLowerCase().includes("kurti") || p.name.toLowerCase().includes("set") || (p.description && p.description.toLowerCase().includes("daily")) || (p.description && p.description.toLowerCase().includes("comfort")));
    }

    // 4. Parse general product keywords (name or description)
    const stopWords = ["under", "below", "above", "over", "more", "less", "budget", "price", "men", "women", "kids", "red", "blue", "black", "white", "green", "yellow", "pink", "purple", "orange", "grey", "gray", "brown", "gold", "silver", "find", "show", "get", "recommend", "want", "search", "looking", "for", "a", "an", "the", "in", "with", "buy", "cloth", "clothes", "shopping", "website", "assistant", "shibani", "casual", "office", "work", "party", "festive", "daily", "comfort", "wedding", "occasion", "outfit", "outfits"];
    
    const keywords = lower.split(/\s+/).filter(w => w && !stopWords.includes(w) && w.length > 2);
    if (keywords.length > 0) {
      matched = matched.filter(p => {
        const target = `${p.name} ${p.description || ""}`.toLowerCase();
        return keywords.some(k => target.includes(k));
      });
    }

    return matched;
  }

  function generateChatCarousel(products) {
    if (products.length === 0) return "";
    
    let html = `<div class="chat-products-carousel">`;
    for (const p of products) {
      const images = getProductImages(p);
      const imgUrl = images[0] ? encodeURI(images[0]) : "";
      const imgHtml = imgUrl 
        ? `<img class="chat-product-img" src="${imgUrl}" alt="${escapeHTML(p.name)}" />`
        : `<div class="chat-product-img" style="display:grid; place-items:center; background:rgba(0,0,0,0.05); font-size:11px; font-weight:bold; color:var(--muted);">${escapeHTML(initials(p.name))}</div>`;
        
      html += `
        <div class="chat-product-card">
          ${imgHtml}
          <div class="chat-product-info">
            <div class="chat-product-name" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</div>
            <div class="chat-product-price">${formatPrice(p.price)}</div>
          </div>
          <div style="display:flex; gap:4px; margin-top:auto;">
            <button class="chat-product-btn view" data-chat-view-product-id="${p.id}" type="button">View</button>
            <button class="chat-product-btn add" data-chat-add-product-id="${p.id}" type="button">Add</button>
          </div>
        </div>
      `;
    }
    html += `</div>`;
    return html;
  }

  function getBotResponse(text) {
    const lower = text.toLowerCase();
    
    // 1. Stylist Quiz conversational state machine
    if (appState.chatQuiz) {
      if (appState.chatQuiz.step === "color") {
        const colors = ["red", "blue", "black", "white", "green", "yellow", "pink", "purple", "orange", "grey", "gray", "brown", "gold", "silver"];
        let choice = null;
        for (const c of colors) {
          if (lower.includes(c)) { choice = c; break; }
        }
        if (lower.includes("any") || lower.includes("all") || lower.includes("mixed") || lower.includes("rainbow")) {
          choice = "any";
        }
        
        if (choice) {
          appState.chatQuiz.color = choice;
          appState.chatQuiz.colorName = choice === "any" ? "Any Color" : choice.charAt(0).toUpperCase() + choice.slice(1);
          appState.chatQuiz.step = "collection";
          return {
            text: `🛍️ <strong>Step 3: Select Collection Category</strong><br>
                   Which catalog collection should we browse?<br><br>
                   <div class="chat-categories" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
                     <button class="chat-reply-btn style-category-btn" data-category="men" type="button">🤵 Men's</button>
                     <button class="chat-reply-btn style-category-btn" data-category="women" type="button">💃 Women's</button>
                     <button class="chat-reply-btn style-category-btn" data-category="kids" type="button">👶 Kids'</button>
                     <button class="chat-reply-btn style-category-btn" data-category="any" type="button">🌟 Show All</button>
                   </div>`,
            isHtml: true
          };
        } else {
          return {
            text: `I didn't quite catch the color. Please click one of the buttons or choose Red, Blue, Black, White, or type "any color".`,
            isHtml: false
          };
        }
      }
      
      if (appState.chatQuiz.step === "collection") {
        let choice = null;
        if (lower.includes("men")) choice = "men";
        else if (lower.includes("women") || lower.includes("lady") || lower.includes("girl") || lower.includes("saree") || lower.includes("dress")) choice = "women";
        else if (lower.includes("kid") || lower.includes("child") || lower.includes("baby") || lower.includes("boy")) choice = "kids";
        else if (lower.includes("any") || lower.includes("all") || lower.includes("show all") || lower.includes("both")) choice = "any";
        
        if (choice) {
          const catText = choice === "any" ? "Show All" : choice.charAt(0).toUpperCase() + choice.slice(1);
          
          const occasion = appState.chatQuiz.occasion;
          const color = appState.chatQuiz.color;
          
          let matched = [...appState.products];
          
          // Filter occasion
          if (occasion === 'casual') {
            matched = matched.filter(p => p.name.toLowerCase().includes("shirt") || p.name.toLowerCase().includes("set") || p.name.toLowerCase().includes("kurti") || (p.description && p.description.toLowerCase().includes("casual")));
          } else if (occasion === 'office') {
            matched = matched.filter(p => p.name.toLowerCase().includes("shirt") || p.name.toLowerCase().includes("kurti") || (p.description && p.description.toLowerCase().includes("office")) || (p.description && p.description.toLowerCase().includes("work")));
          } else if (occasion === 'party') {
            matched = matched.filter(p => p.name.toLowerCase().includes("saree") || (p.badge && p.badge.toLowerCase().includes("best seller")) || (p.badge && p.badge.toLowerCase().includes("new")) || (p.description && p.description.toLowerCase().includes("festive")));
          } else if (occasion === 'daily') {
            matched = matched.filter(p => p.name.toLowerCase().includes("kurti") || p.name.toLowerCase().includes("set") || (p.description && p.description.toLowerCase().includes("daily")) || (p.description && p.description.toLowerCase().includes("comfort")));
          }
          
          // Filter color
          if (color && color !== "any") {
            matched = matched.filter(p => p.color && p.color.toLowerCase().includes(color));
          }
          
          // Filter category
          if (choice && choice !== "any") {
            matched = matched.filter(p => p.category.toLowerCase() === choice);
          }
          
          let notice = "";
          if (matched.length === 0) {
            // Relax filters: find items matching just the occasion
            matched = [...appState.products];
            if (occasion === 'casual') {
              matched = matched.filter(p => p.name.toLowerCase().includes("shirt") || p.name.toLowerCase().includes("set") || p.name.toLowerCase().includes("kurti") || (p.description && p.description.toLowerCase().includes("casual")));
            } else if (occasion === 'office') {
              matched = matched.filter(p => p.name.toLowerCase().includes("shirt") || p.name.toLowerCase().includes("kurti") || (p.description && p.description.toLowerCase().includes("office")) || (p.description && p.description.toLowerCase().includes("work")));
            } else if (occasion === 'party') {
              matched = matched.filter(p => p.name.toLowerCase().includes("saree") || (p.badge && p.badge.toLowerCase().includes("best seller")) || (p.badge && p.badge.toLowerCase().includes("new")) || (p.description && p.description.toLowerCase().includes("festive")));
            } else if (occasion === 'daily') {
              matched = matched.filter(p => p.name.toLowerCase().includes("kurti") || p.name.toLowerCase().includes("set") || (p.description && p.description.toLowerCase().includes("daily")) || (p.description && p.description.toLowerCase().includes("comfort")));
            }
            notice = `<br><span style="font-size: 11px; color: var(--muted); font-style: italic;">Note: No exact color/collection matches found. Displaying general recommendations for your occasion instead.</span>`;
          }
          
          const carouselHtml = generateChatCarousel(matched);
          const quizResultText = `✨ <strong>Your Customized Stylist Results</strong><br>
                                 We've prepared your custom fashion recommendation based on your choices:<br>
                                 • Occasion: <strong>${appState.chatQuiz.occasionName}</strong><br>
                                 • Color: <strong>${appState.chatQuiz.colorName}</strong><br>
                                 • Collection: <strong>${catText}</strong><br>
                                 ${notice}<br>
                                 ${carouselHtml || "No products currently available matching this occasion."}`;
                                 
          appState.chatQuiz = null; // reset quiz state
          return {
            text: quizResultText,
            isHtml: true
          };
        } else {
          return {
            text: `Please select a collection: Men, Women, Kids, or choose "any".`,
            isHtml: false
          };
        }
      }
    }

    // 2. Chat coupon application commands
    if (lower.startsWith("apply ") && (lower.includes("coupon") || lower.includes("promo") || lower.includes("code"))) {
      const words = lower.split(/\s+/);
      const code = words[words.length - 1].toUpperCase();
      const result = applyPromoChat(code);
      return {
        text: result.message,
        isHtml: true
      };
    }
    if (lower.includes("apply coupon") || lower.includes("apply promo") || lower.includes("apply code")) {
      const match = lower.match(/(?:coupon|promo|code)\s+([a-zA-Z0-9_]+)/i);
      if (match) {
        const code = match[1].toUpperCase();
        const result = applyPromoChat(code);
        return {
          text: result.message,
          isHtml: true
        };
      }
    }
    if (lower === "remove coupon" || lower === "remove promo" || lower === "delete coupon") {
      const result = applyPromoChat("");
      return {
        text: result.message,
        isHtml: false
      };
    }

    // 3. Cart management commands
    if (lower === "empty cart" || lower === "clear cart" || lower === "empty bag" || lower === "clear bag") {
      appState.cart = [];
      appState.appliedPromo = null;
      renderDashboard();
      return {
        text: "🛒 Your shopping bag has been cleared. Let me know if you would like to view some products!",
        isHtml: false
      };
    }
    if (lower.startsWith("remove ") || lower.startsWith("delete ") || lower.includes("quantity") || lower.includes("qty") || lower.includes("set ") || lower.includes("change ")) {
      const result = modifyCartFromChat(text);
      if (result) return result;
    }

    // Checkout concierge intent
    if (lower === "checkout" || lower === "buy" || lower.includes("place order") || lower === "purchase") {
      if (appState.cart.length === 0) {
        return {
          text: "🛒 Your shopping bag is currently empty. Add some products first!",
          isHtml: false
        };
      }
      return {
        text: `💳 <strong>Checkout Concierge</strong><br>
               I can help you check out quickly! Would you like me to auto-fill your delivery info using your saved profile details?<br><br>
               <div class="chat-checkout-actions" style="display: flex; gap: 6px; margin-top: 4px;">
                 <button class="chat-reply-btn chat-autofill-btn" data-autofill="yes" type="button">✅ Yes, Auto-fill & Go</button>
                 <button class="chat-reply-btn chat-autofill-btn" data-autofill="no" type="button">✏️ No, I'll type it</button>
               </div>`,
        isHtml: true
      };
    }

    // Add to cart parser
    if (lower.startsWith("add ") || lower.includes("add to cart") || lower.includes("add to bag") || lower.includes("buy ")) {
      let sizeMatch = lower.match(/size\s+([a-zA-Z0-9\-\s]+years|[sml|xl|free]+)/i);
      let requestedSize = sizeMatch ? sizeMatch[1].trim().toUpperCase() : null;
      
      const colors = ["red", "blue", "black", "white", "green", "yellow", "pink", "purple", "orange", "grey", "gray", "brown", "gold", "silver"];
      let requestedColor = null;
      for (const c of colors) {
        if (lower.includes(c)) {
          requestedColor = c;
          break;
        }
      }

      let idMatch = lower.match(/(?:product|id|#)\s*(\d+)/i) || lower.match(/add\s*(\d+)/i);
      let targetProduct = null;
      
      if (idMatch) {
        const prodId = Number(idMatch[1]);
        targetProduct = appState.products.find(p => Number(p.id) === prodId);
      } else {
        let cleanName = lower
          .replace(/add\s+/g, "")
          .replace(/to\s+cart/g, "")
          .replace(/to\s+bag/g, "")
          .replace(/size\s+[a-zA-Z0-9\-\s]+/g, "")
          .trim();
        for (const c of colors) {
          cleanName = cleanName.replace(new RegExp(c, "g"), "");
        }
        cleanName = cleanName.trim();
        
        if (cleanName.length > 2) {
          targetProduct = appState.products.find(p => p.name.toLowerCase().includes(cleanName));
        }
      }

      if (targetProduct) {
        const sizes = targetProduct.size.split(",").map(s => s.trim().toUpperCase());
        let finalSize = null;
        if (requestedSize) {
          finalSize = sizes.find(s => s === requestedSize || s.includes(requestedSize));
        }
        if (!finalSize && sizes.length > 0) {
          finalSize = targetProduct.size.split(",")[0].trim();
        }

        let finalColor = targetProduct.color;
        if (requestedColor) {
          if (targetProduct.color.toLowerCase().includes(requestedColor)) {
            finalColor = targetProduct.color;
          }
        }
        
        addToCart(targetProduct.id, finalSize, finalColor);
        return {
          text: `🛒 <strong>Added to Shopping Bag!</strong><br>I have added <strong>${escapeHTML(targetProduct.name)}</strong> (${escapeHTML(finalSize)} / ${escapeHTML(finalColor)}) to your cart.<br><br><button class="chat-product-btn add" id="chatGoToCheckoutBtn" style="width: 100%;">Proceed to Checkout ➔</button>`,
          isHtml: true
        };
      }
    }

    // Style quiz / recommendation
    if (lower.includes("recommend") || lower.includes("suggest") || lower.includes("style") || lower.includes("wear") || lower.includes("dress me") || lower.includes("help me choose") || lower.includes("quiz") || lower.includes("fashion helper") || lower.includes("fashion advice")) {
      return {
        text: `✨ <strong>Shibani Fashion Personal Stylist</strong><br>
               I'd love to help you find the perfect outfit! What occasion are you dressing for today?<br><br>
               <div class="chat-occasions" style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
                 <button class="chat-reply-btn style-occasion-btn" data-occasion="casual" type="button">👕 Casual Wear</button>
                 <button class="chat-reply-btn style-occasion-btn" data-occasion="office" type="button">💼 Office & Work</button>
                 <button class="chat-reply-btn style-occasion-btn" data-occasion="party" type="button">✨ Festive & Party</button>
                 <button class="chat-reply-btn style-occasion-btn" data-occasion="daily" type="button">🏡 Daily Comfort</button>
               </div>`,
        isHtml: true
      };
    }

    // Order tracking query
    if (lower.includes("track") || lower.includes("order") || lower.includes("status")) {
      const match = lower.match(/(?:order|track|#)\s*(\d+)/i);
      if (match) {
        const orderId = Number(match[1]);
        const order = [...(appState.myOrders || []), ...(appState.orders || [])].find(o => Number(o.id) === orderId);
        if (order) {
          return {
            text: generateChatOrderTrackerHtml(order),
            isHtml: true
          };
        } else {
          return {
            text: `I couldn't find an order with ID #${orderId} in our system. Please double check the ID.`,
            isHtml: false
          };
        }
      } else {
        const myOrders = appState.myOrders || [];
        if (myOrders.length > 0) {
          const list = myOrders.map(o => `• Order #${o.id} - ${formatPrice(o.total)} (<a href="#" data-chat-track-order-id="${o.id}" style="color:var(--teal); font-weight:bold; text-decoration:underline;">Track Status</a>)`).join("<br>");
          return {
            text: `Here are your recent orders:<br>${list}`,
            isHtml: true
          };
        } else {
          return {
            text: `To track an order, please provide an order ID (e.g. "track order 12"). Currently, no orders are associated with your profile.`,
            isHtml: false
          };
        }
      }
    }

    // Return Policy
    if (lower.includes("return") || lower.includes("refund") || lower.includes("exchange")) {
      return {
        text: `🔄 <strong>Return & Refund Policy</strong><br>
               We offer a hassle-free <strong>10-day return policy</strong> on all unworn items with original tags intact.<br>
               Refunds are processed back to the original payment mode within 5-7 working days.`,
        isHtml: true
      };
    }

    // Coupons
    if (lower.includes("coupon") || lower.includes("discount") || lower.includes("promo") || lower.includes("code") || lower.includes("offer")) {
      return {
        text: generateChatCouponsHtml(),
        isHtml: true
      };
    }

    // Cart / Checkout
    if (lower.includes("cart") || lower.includes("basket") || lower.includes("checkout") || lower.includes("pay")) {
      if (appState.cart.length === 0) {
        return {
          text: "🛒 Your cart is empty. Add some products from the catalog to get started!",
          isHtml: false
        };
      } else {
        return {
          text: generateChatCartHtml(),
          isHtml: true
        };
      }
    }

    // Size Finder / AI Fit recommendation
    if (lower.includes("size") || lower.includes("fit") || lower.includes("finder") || lower.includes("tall") || lower.includes("height")) {
      return {
        text: "📏 <strong>AI Size & Fit Guide</strong><br>Unsure about your size? We have an interactive AI Fit Finder next to product size selectors. Simply input your height and weight to get a custom recommendation!",
        isHtml: true
      };
    }

    // Live Agent Transfer
    if (lower.includes("agent") || lower.includes("speak") || lower.includes("pooja") || lower.includes("human") || lower.includes("live") || lower.includes("concierge")) {
      return {
        type: "agent_transfer"
      };
    }

    // General NLP Product Finder
    const matchedProducts = searchProductsChat(text);
    if (matchedProducts.length > 0) {
      const carouselHtml = generateChatCarousel(matchedProducts);
      
      let pillsHtml = "";
      if (matchedProducts.length > 1) {
        const matchesLower = text.toLowerCase();
        let filterOptions = [];
        
        if (!matchesLower.includes("under") && !matchesLower.includes("below") && !matchesLower.includes("less")) {
          filterOptions.push({ label: "💰 Under 1500", query: `${text} under 1500` });
          filterOptions.push({ label: "💰 Under 3000", query: `${text} under 3000` });
        }
        
        const colors = ["red", "blue", "black", "white", "yellow", "pink", "green"];
        let colorsInQuery = colors.filter(c => matchesLower.includes(c));
        if (colorsInQuery.length === 0) {
          const foundColors = [...new Set(matchedProducts.map(p => p.color ? p.color.toLowerCase() : "").filter(Boolean))];
          for (const col of foundColors.slice(0, 2)) {
            const capCol = col.charAt(0).toUpperCase() + col.slice(1);
            filterOptions.push({ label: `🌈 ${capCol}`, query: `${col} ${text}` });
          }
        }
        
        if (filterOptions.length > 0) {
          const pillButtons = filterOptions.map(opt => 
            `<button class="chat-filter-btn" data-query="${escapeHTML(opt.query)}" type="button">${escapeHTML(opt.label)}</button>`
          ).join("");
          pillsHtml = `
            <div style="font-size: 11px; color: var(--muted); margin-top: 8px;">Narrow search:</div>
            <div class="chat-filter-pills" style="display: flex; gap: 6px; overflow-x: auto; padding: 4px 0; margin-top: 2px;">
              ${pillButtons}
            </div>
          `;
        }
      }
      
      return {
        text: `🛍️ I found <strong>${matchedProducts.length} product(s)</strong> matching your search:<br>${carouselHtml}${pillsHtml}`,
        isHtml: true
      };
    }

    // Fallback help message
    return {
      text: `🤖 <strong>Shibani Assistant Help Desk</strong><br>
             I can assist you with:<br>
             • 🔍 Product searches (e.g. "red dress under 2000" or "men shirts")<br>
             • 📦 Order tracking (e.g. "track order 73" or "order status")<br>
             • 🛒 Cart & Checkout (e.g. "show cart" or "checkout")<br>
             • 🏷️ Discounts & Coupons (e.g. "coupons")<br>
             • 💬 Connecting you to a concierge agent (e.g. "speak with an agent")`,
      isHtml: true
    };
  }

  function getAgentResponse(text) {
    const lower = text.toLowerCase();
    
    if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
      return "Hi there! I'm here to guide your shopping experience. Are you looking for men's, women's, or kids' collections today?";
    }
    if (lower.includes("price") || lower.includes("expensive") || lower.includes("cheap")) {
      return "We offer premium quality fabrics at very competitive prices, and you can apply coupons at checkout. Do you have a specific budget in mind?";
    }
    if (lower.includes("size") || lower.includes("fit") || lower.includes("m") || lower.includes("l") || lower.includes("xl")) {
      return "Our sizing runs true to standard fits. If you are unsure, our AI Fit tool on each product card is highly accurate. What item are you looking to size?";
    }
    if (lower.includes("material") || lower.includes("fabric") || lower.includes("cotton") || lower.includes("silk")) {
      return "We use 100% premium cotton, linen blends, and organic silks for our collections. They are perfect for all seasons. Any specific material you prefer?";
    }
    if (lower.includes("thank")) {
      return "You are very welcome! It is my pleasure to help. Let me know if there's anything else you need.";
    }
    
    const matched = searchProductsChat(text);
    if (matched.length > 0) {
      const carouselHtml = generateChatCarousel(matched);
      return `I found these options in our catalog that match your request. Let me know if you would like me to add any of these to your shopping bag:<br>${carouselHtml}`;
    }
    
    return "That sounds interesting! I can look into that for you. Let me know if you would like to view some of our popular designs, check stock, or if you need help checking out.";
  }

  const chatToggle = document.querySelector("#chatWidgetToggle");
  const chatWidget = document.querySelector("#supportChatWidget");
  const closeChat = document.querySelector("#closeChatBtn");
  
  if (chatToggle && chatWidget) {
    chatToggle.addEventListener("click", () => {
      chatWidget.classList.toggle("hidden");
      if (!chatWidget.classList.contains("hidden")) {
        const chatMessages = document.querySelector("#chatMessages");
        if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    });
  }
  
  if (closeChat && chatWidget) {
    closeChat.addEventListener("click", () => {
      chatWidget.classList.add("hidden");
    });
  }

  // Disconnect live concierge session
  const disconnectAgentBtn = document.querySelector("#disconnectAgentBtn");
  if (disconnectAgentBtn) {
    disconnectAgentBtn.addEventListener("click", () => {
      const banner = document.querySelector("#chatAgentBanner");
      if (banner) banner.classList.add("hidden");
      appState.chatAgentActive = false;
      addChatMessage("bot", "Live agent session ended. Shibani AI Assistant is back online to help you.");
    });
  }

  // Chat message container click delegation
  const chatMessages = document.querySelector("#chatMessages");
  if (chatMessages) {
    chatMessages.addEventListener("click", (e) => {
      // Clicked on a view product button
      const viewBtn = e.target.closest("[data-chat-view-product-id]");
      if (viewBtn) {
        const productId = viewBtn.dataset.chatViewProductId;
        window.location.hash = "#catalogTitle";
        setTimeout(() => {
          const card = document.querySelector(`.product-card[data-product-id="${productId}"]`);
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add("highlight-flash");
            setTimeout(() => card.classList.remove("highlight-flash"), 1500);
          } else {
            showToast("Product is not currently visible in the catalog layout.");
          }
        }, 100);
      }
      
      // Clicked on an add product button
      const addBtn = e.target.closest("[data-chat-add-product-id]");
      if (addBtn) {
        const productId = Number(addBtn.dataset.chatAddProductId);
        const product = appState.products.find(p => Number(p.id) === productId);
        if (product) {
          const sizes = product.size.split(",").map(s => s.trim());
          if (sizes.length > 1) {
            // Initiate conversational add quiz
            appState.chatPendingAdd = {
              product_id: productId,
              product_name: product.name,
              color: product.color
            };
            const sizeButtonsHtml = sizes.map(size => 
              `<button class="chat-reply-btn style-add-size-btn" data-size="${size}" type="button">${size}</button>`
            ).join("");
            
            const botReply = {
              text: `✨ <strong>Select Size for ${escapeHTML(product.name)}</strong><br>
                     Please choose a size to add this item to your shopping bag:<br><br>
                     <div class="chat-sizes" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
                       ${sizeButtonsHtml}
                     </div>`,
              isHtml: true
            };
            showBotReply(botReply, 400);
          } else {
            addToCart(productId, sizes[0] || "Free Size", product.color);
            showBotReply(`🛒 Added <strong>${escapeHTML(product.name)}</strong> to your shopping bag!`, 400);
          }
        }
      }

      // Clicked on a size button for adding to cart
      const addSizeBtn = e.target.closest(".style-add-size-btn");
      if (addSizeBtn) {
        if (!appState.chatPendingAdd) return;
        const size = addSizeBtn.dataset.size;
        const { product_id, product_name, color } = appState.chatPendingAdd;
        
        addChatMessage('user', `Size: ${size}`);
        addToCart(product_id, size, color);
        
        appState.chatPendingAdd = null; // clear state
        
        const botReply = {
          text: `🛒 <strong>Added to Shopping Bag!</strong><br>I have added <strong>${escapeHTML(product_name)}</strong> (${escapeHTML(size)} / ${escapeHTML(color)}) to your shopping bag.<br><br><button class="chat-product-btn add" id="chatGoToCheckoutBtn" style="width: 100%;">Proceed to Checkout ➔</button>`,
          isHtml: true
        };
        showBotReply(botReply, 600);
        return;
      }

      // Clicked on chat auto-fill button
      const autofillBtn = e.target.closest(".chat-autofill-btn");
      if (autofillBtn) {
        const choice = autofillBtn.dataset.autofill;
        if (choice === 'yes') {
          addChatMessage('user', "Yes, auto-fill details");
          
          const savedName = appState.profile?.saved_name || appState.user?.full_name || "";
          const savedPhone = appState.profile?.saved_phone || "";
          
          let savedAddr = "";
          try {
            const addrList = JSON.parse(appState.profile?.saved_address || "[]");
            if (Array.isArray(addrList) && addrList.length > 0) {
              savedAddr = addrList[0].address;
            }
          } catch {
            savedAddr = appState.profile?.saved_address || "";
          }
          
          const nameInput = document.querySelector("#customerName");
          const phoneInput = document.querySelector("#customerPhone");
          const addressInput = document.querySelector("#customerAddress");
          
          if (nameInput) nameInput.value = savedName;
          if (phoneInput) phoneInput.value = savedPhone;
          if (addressInput) addressInput.value = savedAddr;
          
          window.location.hash = "#checkoutPanel";
          
          showBotReply({
            text: `📝 <strong>Profile Details Filled!</strong><br>
                   I've populated your checkout form with:<br>
                   • Name: <strong>${escapeHTML(savedName || "N/A")}</strong><br>
                   • Phone: <strong>${escapeHTML(savedPhone || "N/A")}</strong><br>
                   • Address: <strong>${escapeHTML(savedAddr || "N/A")}</strong><br><br>
                   Please review and submit the checkout form.`,
            isHtml: true
          }, 800);
        } else {
          addChatMessage('user', "I'll type it myself");
          window.location.hash = "#checkoutPanel";
          showBotReply("No problem! I've opened the checkout form for you. Let me know if you need coupon codes!", 600);
        }
        return;
      }
      
      // Clicked on proceed to checkout
      const checkoutBtn = e.target.closest("#chatGoToCheckoutBtn");
      if (checkoutBtn) {
        window.location.hash = "#checkoutPanel";
      }

      // Clicked on in-chat track order links
      const trackLink = e.target.closest("[data-chat-track-order-id]");
      if (trackLink) {
        e.preventDefault();
        const orderId = trackLink.dataset.chatTrackOrderId;
        const resp = getBotResponse(`track order ${orderId}`);
        addChatMessage("user", `Track Order #${orderId}`);
        showBotReply(resp, 600);
      }

      // Clicked on a style occasion button
      const occasionBtn = e.target.closest(".style-occasion-btn");
      if (occasionBtn) {
        const occasion = occasionBtn.dataset.occasion;
        const text = occasionBtn.textContent.trim().substring(2);
        addChatMessage('user', `Occasion: ${text}`);
        
        appState.chatQuiz = {
          step: "color",
          occasion: occasion,
          occasionName: text
        };
        
        const botReply = {
          text: `🎨 <strong>Step 2: Choose your Color Family</strong><br>
                 Which color palette stands out to you today?<br><br>
                 <div class="chat-colors" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
                   <button class="chat-reply-btn style-color-btn" data-color="red" type="button">🔴 Red & Warm tones</button>
                   <button class="chat-reply-btn style-color-btn" data-color="blue" type="button">🔵 Blue & Indigo</button>
                   <button class="chat-reply-btn style-color-btn" data-color="white" type="button">⚪ White & Pastel</button>
                   <button class="chat-reply-btn style-color-btn" data-color="black" type="button">⚫ Dark & Neutral</button>
                   <button class="chat-reply-btn style-color-btn" data-color="any" type="button">🌈 Any Color</button>
                 </div>`,
          isHtml: true
        };
        showBotReply(botReply, 800);
        return;
      }

      // Clicked on a style color button
      const colorBtn = e.target.closest(".style-color-btn");
      if (colorBtn) {
        if (!appState.chatQuiz) return;
        const color = colorBtn.dataset.color;
        const text = colorBtn.textContent.trim().substring(2);
        addChatMessage('user', `Color: ${text}`);
        
        appState.chatQuiz.color = color;
        appState.chatQuiz.colorName = text;
        appState.chatQuiz.step = "collection";
        
        const botReply = {
          text: `🛍️ <strong>Step 3: Select Collection Category</strong><br>
                 Which catalog collection should we browse?<br><br>
                 <div class="chat-categories" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
                   <button class="chat-reply-btn style-category-btn" data-category="men" type="button">🤵 Men's</button>
                   <button class="chat-reply-btn style-category-btn" data-category="women" type="button">💃 Women's</button>
                   <button class="chat-reply-btn style-category-btn" data-category="kids" type="button">👶 Kids'</button>
                   <button class="chat-reply-btn style-category-btn" data-category="any" type="button">🌟 Show All</button>
                 </div>`,
          isHtml: true
        };
        showBotReply(botReply, 800);
        return;
      }

      // Clicked on a style category button
      const categoryBtn = e.target.closest(".style-category-btn");
      if (categoryBtn) {
        if (!appState.chatQuiz) return;
        const category = categoryBtn.dataset.category;
        const text = categoryBtn.textContent.trim().substring(2);
        addChatMessage('user', `Collection: ${text}`);
        
        const resp = getBotResponse(category);
        showBotReply(resp, 1000);
        return;
      }

      // Clicked on welcome grid action tiles
      const gridBtn = e.target.closest(".chat-grid-btn");
      if (gridBtn) {
        const faq = gridBtn.dataset.faq;
        if (faq) {
          const title = gridBtn.querySelector(".grid-btn-title").textContent.trim();
          addChatMessage('user', title);
          
          if (faq === 'agent') {
            triggerAgentTransfer();
          } else {
            let query = "";
            if (faq === 'stylist') query = "personal stylist";
            else if (faq === 'order') query = "track order";
            else if (faq === 'coupons') query = "coupons";
            
            const resp = getBotResponse(query);
            showBotReply(resp, 800);
          }
        }
        return;
      }

      // Clicked on a chat cart qty button (+ or -)
      const qtyBtn = e.target.closest(".chat-cart-qty-btn");
      if (qtyBtn) {
        const itemEl = qtyBtn.closest(".chat-cart-item");
        if (itemEl) {
          const productId = Number(itemEl.dataset.productId);
          const size = itemEl.dataset.size;
          const color = itemEl.dataset.color;
          const isIncrease = qtyBtn.classList.contains("plus");
          
          changeCartQuantity(productId, size, color, isIncrease ? 1 : -1);
          
          // Re-render the chat cart card in-place if it exists
          const cartCard = document.querySelector("#chatCartCard");
          if (cartCard) {
            cartCard.outerHTML = generateChatCartHtml();
          }
        }
        return;
      }

      // Clicked on a chat cart remove button
      const removeItemBtn = e.target.closest(".chat-cart-remove-btn");
      if (removeItemBtn) {
        const itemEl = removeItemBtn.closest(".chat-cart-item");
        if (itemEl) {
          const productId = Number(itemEl.dataset.productId);
          const size = itemEl.dataset.size;
          const color = itemEl.dataset.color;
          
          // Remove from cart
          appState.cart = appState.cart.filter(
            (entry) => !(Number(entry.product_id) === Number(productId) && entry.size === size && (entry.color === color || !color || !entry.color))
          );
          
          // Check/reset promo if requirements no longer met
          const subtotal = getCartProducts().reduce((sum, item) => sum + item.price * item.quantity, 0);
          if (subtotal === 0) {
            appState.appliedPromo = null;
          } else if (appState.appliedPromo) {
            const promo = appState.coupons.find(c => c.code.toUpperCase() === appState.appliedPromo.toUpperCase());
            if (promo && subtotal < Number(promo.min_subtotal || 0)) {
              appState.appliedPromo = null;
              showToast(`Promo ${promo.code} removed (minimum subtotal requirement not met)`);
            }
          }
          
          renderDashboard();
          
          // Re-render the chat cart card in-place
          const cartCard = document.querySelector("#chatCartCard");
          if (cartCard) {
            cartCard.outerHTML = generateChatCartHtml();
          }
        }
        return;
      }

      // Clicked on apply coupon button inside chat
      const couponBtn = e.target.closest(".chat-coupon-apply-btn");
      if (couponBtn) {
        const code = couponBtn.dataset.couponCode;
        if (code) {
          addChatMessage("user", `Apply Coupon: ${code}`);
          const result = applyPromoChat(code);
          showBotReply(result.message, 600);
          
          // Update the coupons container in-place
          const couponsContainer = document.querySelector("#chatCouponsContainer");
          if (couponsContainer) {
            couponsContainer.outerHTML = generateChatCouponsHtml();
          }
          // Update the cart container in-place as well if it exists
          const cartCard = document.querySelector("#chatCartCard");
          if (cartCard) {
            cartCard.outerHTML = generateChatCartHtml();
          }
        }
        return;
      }

      // Clicked on a search filter refinement pill
      const filterBtn = e.target.closest(".chat-filter-btn");
      if (filterBtn) {
        const query = filterBtn.dataset.query;
        if (query) {
          addChatMessage("user", query);
          const resp = getBotResponse(query);
          showBotReply(resp, 800);
        }
        return;
      }

      // Clicked on a quick reply button
      const replyBtn = e.target.closest(".chat-reply-btn");
      if (replyBtn) {
        const faq = replyBtn.dataset.faq;
        if (faq) {
          const text = replyBtn.textContent.trim().substring(2);
          addChatMessage('user', text);
          
          if (faq === 'agent') {
            triggerAgentTransfer();
          } else {
            let query = "";
            if (faq === 'order') query = "track order";
            else if (faq === 'returns') query = "return policy";
            else if (faq === 'coupons') query = "coupons";
            
            const resp = getBotResponse(query);
            showBotReply(resp, 1000);
          }
        }
      }
    });
  }

  const triggerAgentTransfer = () => {
    showBotReply("Connecting you to a live support concierge...", 800);
    setTimeout(() => {
      const banner = document.querySelector("#chatAgentBanner");
      if (banner) banner.classList.remove("hidden");
      appState.chatAgentActive = true;
      showBotReply("Hello! I am Pooja, your personal fashion concierge today. How can I help you find the perfect outfit?", 1000);
    }, 1200);
  };

  const chatForm = document.querySelector("#chatForm");
  const chatInput = document.querySelector("#chatInput");
  if (chatForm && chatInput) {
    chatForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;
      
      addChatMessage('user', text);
      chatInput.value = "";
      
      if (appState.chatAgentActive) {
        const agentText = getAgentResponse(text);
        showBotReply(agentText, 1200);
      } else {
        const resp = getBotResponse(text);
        if (resp.type === "agent_transfer") {
          triggerAgentTransfer();
        } else {
          showBotReply(resp, 1000);
        }
      }
    });
  }

  // Voice Input Speech Recognition
  const chatMicBtn = document.querySelector("#chatMicBtn");
  if (chatMicBtn && chatInput) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = 'en-IN';
      recognition.interimResults = false;
      
      let isRecording = false;
      
      recognition.onstart = () => {
        isRecording = true;
        chatMicBtn.classList.add("recording");
        chatInput.placeholder = "Listening...";
      };
      
      recognition.onresult = (event) => {
        const resultText = event.results[0][0].transcript;
        chatInput.value = resultText;
      };
      
      recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === 'not-allowed') {
          showToast("Microphone permission denied.");
        } else {
          showToast(`Speech recognition error: ${event.error}`);
        }
        cleanupMic();
      };
      
      recognition.onend = () => {
        cleanupMic();
        const text = chatInput.value.trim();
        if (text) {
          addChatMessage('user', text);
          chatInput.value = "";
          
          if (appState.chatAgentActive) {
            const agentText = getAgentResponse(text);
            showBotReply(agentText, 1200);
          } else {
            const resp = getBotResponse(text);
            if (resp.type === "agent_transfer") {
              triggerAgentTransfer();
            } else {
              showBotReply(resp, 1000);
            }
          }
        }
      };
      
      function cleanupMic() {
        isRecording = false;
        chatMicBtn.classList.remove("recording");
        chatInput.placeholder = "Type a message...";
      }
      
      chatMicBtn.addEventListener("click", () => {
        if (!isRecording) {
          recognition.start();
        } else {
          recognition.stop();
        }
      });
    } else {
      chatMicBtn.addEventListener("click", () => {
        showToast("Speech recognition is not supported in this browser. Please use Chrome/Edge.");
      });
    }
  }

  // Admin Products spreadsheet search & button triggers
  const adminProductSearch = document.querySelector("#adminProductSearch");
  if (adminProductSearch) {
    adminProductSearch.addEventListener("input", (e) => {
      appState.adminProductSearch = e.target.value;
      renderAdminProductsTable();
    });
  }

  const adminAddNewProductBtn = document.querySelector("#adminAddNewProductBtn");
  if (adminAddNewProductBtn) {
    adminAddNewProductBtn.addEventListener("click", () => {
      resetProductForm();
      window.location.hash = "#adminPanel";
    });
  }

  // Admin Products Table body change (stock update) & click (edit/delete) triggers
  const adminProductsTableBody = document.querySelector("#adminProductsTableBody");
  if (adminProductsTableBody) {
    adminProductsTableBody.addEventListener("change", (e) => {
      const select = e.target.closest("[data-product-stock-id]");
      if (select) {
        updateProductStock(select.dataset.productStockId, select.value);
      }
    });
    adminProductsTableBody.addEventListener("click", (e) => {
      const editBtn = e.target.closest("[data-edit-product-id]");
      const deleteBtn = e.target.closest("[data-delete-product-id]");
      if (editBtn) {
        editProduct(editBtn.dataset.editProductId);
      } else if (deleteBtn) {
        deleteProduct(deleteBtn.dataset.deleteProductId);
      }
    });
  }

  // Low Stock List Restock button triggers
  const lowStockList = document.querySelector("#lowStockList");
  if (lowStockList) {
    lowStockList.addEventListener("click", (e) => {
      const restockBtn = e.target.closest("[data-restock-id]");
      if (restockBtn) {
        quickRestockProduct(restockBtn.dataset.restockId);
      }
    });
  }

  // Admin Order Search & status filter tabs triggers
  const adminOrderSearchInput = document.querySelector("#adminOrderSearch");
  if (adminOrderSearchInput) {
    adminOrderSearchInput.addEventListener("input", (e) => {
      appState.adminOrderSearch = e.target.value;
      renderOrders();
    });
  }

  const orderTabs = document.querySelector(".order-tabs");
  if (orderTabs) {
    orderTabs.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-order-tab]");
      if (btn) {
        orderTabs.querySelectorAll(".tab-btn").forEach(b => {
          b.classList.remove("active");
          b.style.background = "transparent";
          b.style.color = "var(--muted)";
        });
        btn.classList.add("active");
        btn.style.background = "";
        btn.style.color = "";
        appState.adminOrderStatusFilter = btn.dataset.orderTab;
        renderOrders();
      }
    });
  }

  // Admin Orders List click delegation (expand order card, print packing slip)
  if (ordersList) {
    ordersList.addEventListener("click", (e) => {
      if (e.target.closest("select") || e.target.closest("button")) {
        const printBtn = e.target.closest(".print-slip-btn");
        if (printBtn) {
          printPackingSlip(printBtn.dataset.printSlipId);
        }
        return;
      }
      const card = e.target.closest(".order-card");
      if (card) {
        const detailsBox = card.querySelector(".order-details-box");
        if (detailsBox) {
          detailsBox.classList.toggle("hidden");
        }
      }
    });
  }
}

function handleNavigation() {
  const hash = window.location.hash || "#catalogTitle";
  const isAdmin = appState.user && appState.user.role === "admin";
  
  // Highlight active link in dashboardNav
  document.querySelectorAll(".dashboard-nav a").forEach(link => {
    const href = link.getAttribute("href");
    if (href === hash || (hash === "#catalogTitle" && href === "#catalogTitle")) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });

  const adminPanel = document.querySelector("#adminPanel");
  const settingsPanel = document.querySelector("#settingsPanel");
  const couponsPanel = document.querySelector("#couponsPanel");
  const ordersPanel = document.querySelector("#ordersPanel");
  const loyaltyAdminPanel = document.querySelector("#loyaltyAdminPanel");
  const checkoutPanel = document.querySelector("#checkoutPanel");
  const purchaseHistoryPanel = document.querySelector("#purchaseHistoryPanel");
  const customerProfilePanel = document.querySelector("#customerProfilePanel");
  const mainPanel = document.querySelector(".main-panel");
  const dashboardOverviewPanel = document.querySelector("#dashboardOverviewPanel");
  const adminProductsPanel = document.querySelector("#adminProductsPanel");

  // New Panels
  const wishlistPanel = document.querySelector("#wishlistPanel");
  const reviewsModeratorPanel = document.querySelector("#reviewsModeratorPanel");
  const financialAnalyticsPanel = document.querySelector("#financialAnalyticsPanel");

  // Reset scroll on view change
  window.scrollTo({ top: 0, behavior: "smooth" });

  // Toggle admin-hidden to fix squashing
  const dashboardGrid = document.querySelector(".dashboard-grid");
  if (dashboardGrid) {
    const isTwoColumnView = isAdmin && hash === "#adminPanel";
    dashboardGrid.classList.toggle("admin-hidden", !isTwoColumnView);
  }

  if (isAdmin) {
    // Hide customer panels
    if (checkoutPanel) checkoutPanel.classList.add("hidden");
    if (purchaseHistoryPanel) purchaseHistoryPanel.classList.add("hidden");
    if (customerProfilePanel) customerProfilePanel.classList.add("hidden");
    if (wishlistPanel) wishlistPanel.classList.add("hidden");

    // Hide all admin panels
    if (dashboardOverviewPanel) dashboardOverviewPanel.classList.add("hidden");
    if (adminProductsPanel) adminProductsPanel.classList.add("hidden");
    if (adminPanel) adminPanel.classList.add("hidden");
    if (settingsPanel) settingsPanel.classList.add("hidden");
    if (couponsPanel) couponsPanel.classList.add("hidden");
    if (ordersPanel) ordersPanel.classList.add("hidden");
    if (loyaltyAdminPanel) loyaltyAdminPanel.classList.add("hidden");
    if (reviewsModeratorPanel) reviewsModeratorPanel.classList.add("hidden");
    if (financialAnalyticsPanel) financialAnalyticsPanel.classList.add("hidden");
    if (mainPanel) mainPanel.classList.add("hidden");

    // Show appropriate panel
    if (hash === "#dashboardOverviewPanel") {
      if (dashboardOverviewPanel) dashboardOverviewPanel.classList.remove("hidden");
    } else if (hash === "#adminProductsPanel") {
      if (adminProductsPanel) adminProductsPanel.classList.remove("hidden");
    } else if (hash === "#settingsPanel") {
      if (settingsPanel) settingsPanel.classList.remove("hidden");
    } else if (hash === "#couponsPanel") {
      if (couponsPanel) couponsPanel.classList.remove("hidden");
    } else if (hash === "#ordersPanel") {
      if (ordersPanel) ordersPanel.classList.remove("hidden");
    } else if (hash === "#loyaltyAdminPanel") {
      if (loyaltyAdminPanel) loyaltyAdminPanel.classList.remove("hidden");
      loadAdminCustomers();
    } else if (hash === "#reviewsModeratorPanel") {
      if (reviewsModeratorPanel) reviewsModeratorPanel.classList.remove("hidden");
      loadAdminReviews();
    } else if (hash === "#financialAnalyticsPanel") {
      if (financialAnalyticsPanel) financialAnalyticsPanel.classList.remove("hidden");
      loadAnalyticsDashboard();
    } else if (hash === "#adminPanel") {
      if (adminPanel) adminPanel.classList.remove("hidden");
      if (mainPanel) mainPanel.classList.remove("hidden");
    } else {
      // Default to overview for admin if hash is catalogTitle or anything else
      if (dashboardOverviewPanel) dashboardOverviewPanel.classList.remove("hidden");
    }
  } else {
    // Hide admin panels
    if (dashboardOverviewPanel) dashboardOverviewPanel.classList.add("hidden");
    if (adminProductsPanel) adminProductsPanel.classList.add("hidden");
    if (adminPanel) adminPanel.classList.add("hidden");
    if (settingsPanel) settingsPanel.classList.add("hidden");
    if (couponsPanel) couponsPanel.classList.add("hidden");
    if (ordersPanel) ordersPanel.classList.add("hidden");
    if (loyaltyAdminPanel) loyaltyAdminPanel.classList.add("hidden");
    if (reviewsModeratorPanel) reviewsModeratorPanel.classList.add("hidden");
    if (financialAnalyticsPanel) financialAnalyticsPanel.classList.add("hidden");

    // Customer routing
    if (hash === "#checkoutPanel") {
      if (checkoutPanel) checkoutPanel.classList.remove("hidden");
      if (mainPanel) mainPanel.classList.add("hidden");
      if (purchaseHistoryPanel) purchaseHistoryPanel.classList.add("hidden");
      if (customerProfilePanel) customerProfilePanel.classList.add("hidden");
      if (wishlistPanel) wishlistPanel.classList.add("hidden");
    } else if (hash === "#purchaseHistoryPanel") {
      if (purchaseHistoryPanel) purchaseHistoryPanel.classList.remove("hidden");
      if (mainPanel) mainPanel.classList.add("hidden");
      if (checkoutPanel) checkoutPanel.classList.add("hidden");
      if (customerProfilePanel) customerProfilePanel.classList.add("hidden");
      if (wishlistPanel) wishlistPanel.classList.add("hidden");
    } else if (hash === "#customerProfilePanel") {
      if (customerProfilePanel) customerProfilePanel.classList.remove("hidden");
      if (mainPanel) mainPanel.classList.add("hidden");
      if (checkoutPanel) checkoutPanel.classList.add("hidden");
      if (purchaseHistoryPanel) purchaseHistoryPanel.classList.add("hidden");
      if (wishlistPanel) wishlistPanel.classList.add("hidden");
      loadQuests();
    } else if (hash === "#wishlistPanel") {
      if (wishlistPanel) wishlistPanel.classList.remove("hidden");
      if (mainPanel) mainPanel.classList.add("hidden");
      if (checkoutPanel) checkoutPanel.classList.add("hidden");
      if (purchaseHistoryPanel) purchaseHistoryPanel.classList.add("hidden");
      if (customerProfilePanel) customerProfilePanel.classList.add("hidden");
      loadWishlist();
    } else {
      // Default to shop (products catalog)
      if (mainPanel) mainPanel.classList.remove("hidden");
      if (checkoutPanel) checkoutPanel.classList.add("hidden");
      if (purchaseHistoryPanel) purchaseHistoryPanel.classList.add("hidden");
      if (customerProfilePanel) customerProfilePanel.classList.add("hidden");
      if (wishlistPanel) wishlistPanel.classList.add("hidden");
    }
  }
}

window.addEventListener("hashchange", handleNavigation);

// --- Admin Loyalty & Reward Points Panel Logic ---
appState.adminCustomers = [];

async function loadAdminCustomers() {
  try {
    const data = await api("/api/admin/customers");
    appState.adminCustomers = data.customers || [];
    renderAdminCustomers();
  } catch (error) {
    showToast(error.message || "Failed to load customers", "error");
  }
}

function renderAdminCustomers() {
  const tbody = document.querySelector("#adminLoyaltyTableBody");
  if (!tbody) return;
  
  const searchInput = document.querySelector("#adminLoyaltySearch");
  const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
  
  const filtered = appState.adminCustomers.filter(c => {
    return (c.username || "").toLowerCase().includes(query) ||
           (c.full_name || "").toLowerCase().includes(query) ||
           (c.saved_name || "").toLowerCase().includes(query) ||
           (c.saved_phone || "").includes(query);
  });
  
  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 24px; color: var(--muted);">
          No customers found.
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = filtered.map(c => {
    const contactInfo = c.saved_phone 
      ? `<div>${escapeHTML(c.saved_phone)}</div>` 
      : `<span style="color: var(--muted); font-style: italic;">No phone</span>`;
      
    let nameAddress = "";
    if (c.saved_name || c.saved_address) {
      let addrDisplay = "";
      if (c.saved_address) {
        try {
          const parsed = JSON.parse(c.saved_address);
          if (Array.isArray(parsed)) {
            addrDisplay = parsed.map(item => `<strong>${escapeHTML(item.label)}:</strong> ${escapeHTML(item.address)}`).join("<br>");
          } else {
            addrDisplay = escapeHTML(c.saved_address);
          }
        } catch(e) {
          addrDisplay = escapeHTML(c.saved_address);
        }
      }
      nameAddress = `
        <div style="font-size: 13px;">
          ${c.saved_name ? `<strong>Name:</strong> ${escapeHTML(c.saved_name)}` : ""}
          ${addrDisplay ? `<div style="margin-top: 4px; line-height: 1.3;">${addrDisplay}</div>` : ""}
        </div>
      `;
    } else {
      nameAddress = `<span style="color: var(--muted); font-style: italic;">No shipping profile</span>`;
    }
    
    const pts = c.loyalty_points !== undefined && c.loyalty_points !== null ? c.loyalty_points : 100;
    const badgeClass = pts === 0 ? "points-badge zero" : "points-badge";
    
    return `
      <tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 12px; font-weight: 600;">#${c.id}</td>
        <td style="padding: 12px; font-weight: 500; color: var(--text-main);">${escapeHTML(c.username)}</td>
        <td style="padding: 12px;">${escapeHTML(c.full_name)}</td>
        <td style="padding: 12px;">${contactInfo}</td>
        <td style="padding: 12px; max-width: 250px;">${nameAddress}</td>
        <td style="padding: 12px;"><span class="${badgeClass}">${pts} pts</span></td>
        <td style="padding: 12px; text-align: right;">
          <button class="primary-action adjust-pts-btn" data-id="${c.id}" data-username="${escapeHTML(c.username)}" data-points="${pts}" type="button" style="padding: 6px 12px; font-size: 12px; border-radius: 6px;">
            Adjust Points
          </button>
        </td>
      </tr>
    `;
  }).join("");
  
  // Attach event listeners to adjust buttons
  tbody.querySelectorAll(".adjust-pts-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const username = btn.getAttribute("data-username");
      const points = btn.getAttribute("data-points");
      openPointsAdjustModal(id, username, points);
    });
  });
}

function openPointsAdjustModal(userId, username, currentPoints) {
  const modal = document.querySelector("#pointsAdjustModal");
  if (!modal) return;
  
  document.querySelector("#adjustPointsUserId").value = userId;
  document.querySelector("#adjustModalCustomerName").textContent = `Customer: ${username} (ID: #${userId})`;
  document.querySelector("#adjustModalCurrentPoints").textContent = `${currentPoints} pts`;
  document.querySelector("#adjustPointsValue").value = "";
  document.querySelector("#adjustPointsAction").value = "set";
  
  modal.classList.remove("hidden");
}

function closePointsAdjustModal() {
  const modal = document.querySelector("#pointsAdjustModal");
  if (modal) modal.classList.add("hidden");
}

// Initialise event listeners
(function initLoyaltyAdminListeners() {
  const searchInput = document.querySelector("#adminLoyaltySearch");
  if (searchInput) {
    searchInput.addEventListener("input", renderAdminCustomers);
  }
  
  const adjustForm = document.querySelector("#pointsAdjustForm");
  if (adjustForm) {
    adjustForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const userId = document.querySelector("#adjustPointsUserId").value;
      const action = document.querySelector("#adjustPointsAction").value;
      const value = parseInt(document.querySelector("#adjustPointsValue").value);
      
      if (isNaN(value) || value < 0) {
        showToast("Please enter a valid positive points value", "error");
        return;
      }
      
      const saveBtn = document.querySelector("#savePointsAdjustBtn");
      if (saveBtn) saveBtn.disabled = true;
      
      try {
        let backendAction = "set";
        let backendValue = value;
        if (action === "add") {
          backendAction = "adjust";
          backendValue = value;
        } else if (action === "subtract") {
          backendAction = "adjust";
          backendValue = -value;
        }

        const response = await api(`/api/admin/customers/${userId}/adjust-points`, {
          method: "POST",
          body: JSON.stringify({ action: backendAction, value: backendValue })
        });
        if (response.ok) {
          showToast(`Successfully updated points balance. New balance: ${response.loyalty_points} pts`, "success");
          closePointsAdjustModal();
          loadAdminCustomers();
        } else {
          showToast(response.error || "Failed to update points balance", "error");
        }
      } catch (error) {
        showToast(error.message || "Failed to update points balance", "error");
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    });
  }
  
  const closeBtn = document.querySelector("#closePointsAdjustBtn");
  if (closeBtn) {
    closeBtn.addEventListener("click", closePointsAdjustModal);
  }
  
  const modalOverlay = document.querySelector("#pointsAdjustModal");
  if (modalOverlay) {
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) {
        closePointsAdjustModal();
      }
    });
  }

  const loyaltyRulesForm = document.querySelector("#loyaltyRulesForm");
  if (loyaltyRulesForm) {
    loyaltyRulesForm.addEventListener("submit", saveLoyaltyRules);
  }
})();

async function saveLoyaltyRules(event) {
  event.preventDefault();
  const saveBtn = event.target.querySelector("button[type='submit']");
  if (saveBtn) saveBtn.disabled = true;
  try {
    const data = {
      gst_rate: appState.settings.gst_rate !== undefined ? appState.settings.gst_rate : 5.0,
      delivery_fee_standard: appState.settings.delivery_fee_standard !== undefined ? appState.settings.delivery_fee_standard : 99.0,
      delivery_fee_threshold: appState.settings.delivery_fee_threshold !== undefined ? appState.settings.delivery_fee_threshold : 999.0,
      other_charges: appState.settings.other_charges !== undefined ? appState.settings.other_charges : 0.0,
      loyalty_enabled: appState.settings.loyalty_enabled !== undefined ? appState.settings.loyalty_enabled : "1",
      loyalty_tier1_limit: Number(document.querySelector("#loyaltyRuleTier1Limit").value),
      loyalty_tier1_rate: Number(document.querySelector("#loyaltyRuleTier1Rate").value),
      loyalty_tier2_limit: Number(document.querySelector("#loyaltyRuleTier2Limit").value),
      loyalty_tier2_rate: Number(document.querySelector("#loyaltyRuleTier2Rate").value),
      loyalty_tier3_limit: Number(document.querySelector("#loyaltyRuleTier3Limit").value),
      loyalty_tier3_rate: Number(document.querySelector("#loyaltyRuleTier3Rate").value),
      loyalty_tier4_limit: Number(document.querySelector("#loyaltyRuleTier4Limit").value),
      loyalty_tier4_rate: Number(document.querySelector("#loyaltyRuleTier4Rate").value),
      loyalty_tier5_limit: Number(document.querySelector("#loyaltyRuleTier5Limit").value),
      loyalty_tier5_rate: Number(document.querySelector("#loyaltyRuleTier5Rate").value),
      loyalty_tier6_limit: Number(document.querySelector("#loyaltyRuleTier6Limit").value),
      loyalty_tier6_rate: Number(document.querySelector("#loyaltyRuleTier6Rate").value),
      loyalty_tier7_rate: Number(document.querySelector("#loyaltyRuleTier7Rate").value),
      loyalty_redeem_ratio: appState.settings.loyalty_redeem_ratio !== undefined ? appState.settings.loyalty_redeem_ratio : 10.0,
      loyalty_min_order_to_earn: appState.settings.loyalty_min_order_to_earn !== undefined ? appState.settings.loyalty_min_order_to_earn : 0.0,
      loyalty_min_order_to_redeem: appState.settings.loyalty_min_order_to_redeem !== undefined ? appState.settings.loyalty_min_order_to_redeem : 0.0,
      loyalty_welcome_points: appState.settings.loyalty_welcome_points !== undefined ? appState.settings.loyalty_welcome_points : 100,
      loyalty_max_redemption_percent: appState.settings.loyalty_max_redemption_percent !== undefined ? appState.settings.loyalty_max_redemption_percent : 100.0
    };
    const response = await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify(data)
    });
    appState.settings = response;
    showToast("Loyalty rules updated successfully");
    configureDashboardForRole();
    renderDashboard();
  } catch (error) {
    showToast(`Error saving loyalty rules: ${error.message}`);
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

// --- Coupon Management Panel Logic ---

function renderCheckoutCoupons() {
  const container = document.querySelector("#checkoutCouponPills");
  if (!container) return;
  
  const activeCoupons = (appState.coupons || []).filter(c => c.active);
  
  if (activeCoupons.length === 0) {
    const parent = document.querySelector(".available-coupons");
    if (parent) parent.classList.add("hidden");
    return;
  }
  
  const parent = document.querySelector(".available-coupons");
  if (parent) parent.classList.remove("hidden");
  
  container.innerHTML = activeCoupons.map(c => {
    let desc = "";
    if (c.code.toUpperCase() === "FREEDELIVERY") {
      desc = "Free Shipping";
    } else if (c.discount_type === "percentage") {
      desc = `${c.discount_value}% Off`;
    } else {
      desc = `Rs. ${c.discount_value} Off`;
    }
    const minTxt = c.min_subtotal > 0 ? ` (Min. Rs. ${c.min_subtotal})` : "";
    return `
      <button type="button" class="coupon-pill" data-coupon="${escapeHTML(c.code)}" title="Click to apply coupon">
        <span class="coupon-code">${escapeHTML(c.code)}</span>
        <span class="coupon-desc">${escapeHTML(desc)}${escapeHTML(minTxt)}</span>
      </button>
    `;
  }).join("");
}

function renderCouponsList() {
  const listContainer = document.querySelector("#couponsList");
  if (!listContainer) return;
  if (appState.user.role !== "admin") return;
  
  if (!appState.coupons || appState.coupons.length === 0) {
    listContainer.innerHTML = `<p class="empty-state">No coupons stored. Create one above!</p>`;
    return;
  }
  
  listContainer.innerHTML = appState.coupons.map(c => {
    const isActive = !!c.active;
    const activeClass = isActive ? 'active-coupon' : 'inactive-coupon';
    const statusText = isActive ? 'Active' : 'Inactive';
    const statusClass = isActive ? 'active' : 'inactive';
    
    let desc = "";
    if (c.code.toUpperCase() === "FREEDELIVERY") {
      desc = "Free Shipping";
    } else if (c.discount_type === "percentage") {
      desc = `${c.discount_value}% Off`;
    } else {
      desc = `Rs. ${c.discount_value} Off`;
    }
    
    return `
      <div class="coupon-card ${activeClass}" data-id="${c.id}">
        <div class="coupon-card-header">
          <span class="coupon-card-code">${escapeHTML(c.code)}</span>
          <span class="coupon-card-status ${statusClass}">${statusText}</span>
        </div>
        <div class="coupon-card-details">
          <div class="coupon-card-detail-item">
            <span>Offer:</span>
            <strong>${escapeHTML(desc)}</strong>
          </div>
          <div class="coupon-card-detail-item">
            <span>Min. Subtotal:</span>
            <span>Rs. ${Number(c.min_subtotal || 0).toLocaleString()}</span>
          </div>
          <div class="coupon-card-detail-item">
            <span>Expiry Date:</span>
            <span>${c.expires_at ? escapeHTML(c.expires_at.split(" ")[0]) : "No Expiry"}</span>
          </div>
          <div class="coupon-card-detail-item">
            <span>Usage Info:</span>
            <span>Used: ${c.usage_count || 0} / ${c.usage_limit !== null && c.usage_limit !== undefined ? c.usage_limit : "∞"}</span>
          </div>
        </div>
        <div class="coupon-card-actions">
          <button type="button" class="coupon-action-btn edit-btn" data-edit-coupon="${c.id}">
            Edit
          </button>
          <button type="button" class="coupon-action-btn delete-btn" data-delete-coupon="${c.id}">
            Delete
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function editCoupon(id) {
  const c = appState.coupons.find(coupon => coupon.id === id);
  if (!c) return;
  
  document.querySelector("#couponIdInput").value = c.id;
  document.querySelector("#couponCodeInput").value = c.code;
  document.querySelector("#couponTypeInput").value = c.discount_type;
  document.querySelector("#couponValueInput").value = c.discount_value;
  document.querySelector("#couponMinSubtotalInput").value = c.min_subtotal;
  document.querySelector("#couponExpiryInput").value = c.expires_at ? c.expires_at.split(" ")[0] : "";
  document.querySelector("#couponUsageLimitInput").value = c.usage_limit !== null && c.usage_limit !== undefined ? c.usage_limit : "";
  document.querySelector("#couponActiveInput").checked = !!c.active;
  
  document.querySelector("#saveCouponBtn").textContent = "Update Coupon";
  document.querySelector("#cancelCouponEditBtn").classList.remove("hidden");
  
  document.querySelector("#couponForm").scrollIntoView({ behavior: "smooth" });
}

function resetCouponForm() {
  const form = document.querySelector("#couponForm");
  if (form) form.reset();
  document.querySelector("#couponIdInput").value = "";
  document.querySelector("#saveCouponBtn").textContent = "Add Coupon";
  document.querySelector("#cancelCouponEditBtn").classList.add("hidden");
}

async function deleteCoupon(id) {
  if (!confirm("Are you sure you want to delete this coupon?")) return;
  try {
    await api(`/api/admin/coupons/${id}`, {
      method: "DELETE"
    });
    showToast("Coupon deleted successfully");
    await loadCoupons();
    renderCouponsList();
  } catch (error) {
    showToast(`Error deleting coupon: ${error.message}`);
  }
}

// Bind Coupon Form & List events
const couponForm = document.querySelector("#couponForm");
if (couponForm) {
  couponForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const idVal = document.querySelector("#couponIdInput").value;
    const code = document.querySelector("#couponCodeInput").value.trim().toUpperCase();
    const discount_type = document.querySelector("#couponTypeInput").value;
    const discount_value = Number(document.querySelector("#couponValueInput").value);
    const min_subtotal = Number(document.querySelector("#couponMinSubtotalInput").value);
    const active = document.querySelector("#couponActiveInput").checked ? 1 : 0;
    const expires_at_val = document.querySelector("#couponExpiryInput").value;
    const expires_at = expires_at_val ? expires_at_val : null;
    const usage_limit_val = document.querySelector("#couponUsageLimitInput").value;
    const usage_limit = usage_limit_val !== "" ? Number(usage_limit_val) : null;
    
    const submitBtn = document.querySelector("#saveCouponBtn");
    if (submitBtn) submitBtn.disabled = true;
    
    try {
      const data = { code, discount_type, discount_value, min_subtotal, active, expires_at, usage_limit };
      if (idVal) {
        await api(`/api/admin/coupons/${idVal}`, {
          method: "PUT",
          body: JSON.stringify(data)
        });
        showToast("Coupon updated successfully");
      } else {
        await api("/api/admin/coupons", {
          method: "POST",
          body: JSON.stringify(data)
        });
        showToast("Coupon added successfully");
      }
      resetCouponForm();
      await loadCoupons();
      renderCouponsList();
    } catch (error) {
      showToast(`Error saving coupon: ${error.message}`);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

const cancelCouponEditBtn = document.querySelector("#cancelCouponEditBtn");
if (cancelCouponEditBtn) {
  cancelCouponEditBtn.addEventListener("click", resetCouponForm);
}

const couponsList = document.querySelector("#couponsList");
if (couponsList) {
  couponsList.addEventListener("click", (event) => {
    const editBtn = event.target.closest("[data-edit-coupon]");
    const deleteBtn = event.target.closest("[data-delete-coupon]");
    if (editBtn) {
      const couponId = parseInt(editBtn.dataset.editCoupon);
      editCoupon(couponId);
    } else if (deleteBtn) {
      const couponId = parseInt(deleteBtn.dataset.deleteCoupon);
      deleteCoupon(couponId);
    }
  });
}

// --- Advanced Admin & Overview Panels Functions ---

function renderDashboardOverview() {
  if (appState.user.role !== "admin") return;

  const activeOrders = appState.orders.filter(o => o.status !== "Cancelled");
  const totalRevenue = activeOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const totalOrders = appState.orders.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  
  const totalProducts = appState.products.length;
  const inStockProducts = appState.products.filter(p => p.stock === "In stock").length;
  const inventoryHealth = totalProducts > 0 ? Math.round((inStockProducts / totalProducts) * 100) : 0;

  const kpiStatsGrid = document.querySelector("#kpiStatsGrid");
  if (kpiStatsGrid) {
    kpiStatsGrid.innerHTML = `
      <div class="kpi-card rev">
        <span>Total Revenue</span>
        <strong>${formatPrice(totalRevenue)}</strong>
        <div class="kpi-sub">From ${activeOrders.length} valid orders</div>
      </div>
      <div class="kpi-card ord">
        <span>Total Orders</span>
        <strong>${totalOrders}</strong>
        <div class="kpi-sub">Lifetime orders count</div>
      </div>
      <div class="kpi-card cpc">
        <span>Active Coupons</span>
        <strong>${appState.coupons.filter(c => c.active).length}</strong>
        <div class="kpi-sub">Promotions currently live</div>
      </div>
      <div class="kpi-card aov">
        <span>Avg. Order Value</span>
        <strong>${formatPrice(avgOrderValue)}</strong>
        <div class="kpi-sub">Revenue per order average</div>
      </div>
      <div class="kpi-card hlth">
        <span>Inventory Health</span>
        <strong>${inventoryHealth}%</strong>
        <div class="kpi-sub">${inStockProducts} of ${totalProducts} items in stock</div>
      </div>
    `;
  }

  // Calculate Sales by Category
  const categorySales = { men: 0, women: 0, kids: 0 };
  appState.orders.forEach(order => {
    if (order.status === "Cancelled") return;
    (order.items || []).forEach(item => {
      const p = appState.products.find(prod => prod.id === item.product_id);
      const cat = p ? p.category : "men";
      const catKey = cat.toLowerCase();
      if (categorySales[catKey] !== undefined) {
        categorySales[catKey] += item.price * item.quantity;
      } else {
        categorySales[catKey] = item.price * item.quantity;
      }
    });
  });

  const maxSales = Math.max(categorySales.men, categorySales.women, categorySales.kids, 1);
  const chartContainer = document.querySelector("#categorySalesChart");
  if (chartContainer) {
    chartContainer.innerHTML = `
      <div class="chart-bar-wrapper">
        <span class="chart-val">${formatPrice(categorySales.men)}</span>
        <div class="chart-bar" style="height: ${Math.max(5, Math.round((categorySales.men / maxSales) * 100))}%"></div>
        <span class="chart-lbl">Men</span>
      </div>
      <div class="chart-bar-wrapper">
        <span class="chart-val">${formatPrice(categorySales.women)}</span>
        <div class="chart-bar" style="height: ${Math.max(5, Math.round((categorySales.women / maxSales) * 100))}%"></div>
        <span class="chart-lbl">Women</span>
      </div>
      <div class="chart-bar-wrapper">
        <span class="chart-val">${formatPrice(categorySales.kids)}</span>
        <div class="chart-bar" style="height: ${Math.max(5, Math.round((categorySales.kids / maxSales) * 100))}%"></div>
        <span class="chart-lbl">Kids</span>
      </div>
    `;
  }

  // Populate Stock Alerts
  const lowStockList = document.querySelector("#lowStockList");
  if (lowStockList) {
    const lowStockItems = appState.products.filter(p => p.stock !== "In stock");
    if (lowStockItems.length === 0) {
      lowStockList.innerHTML = `<p style="font-size: 13px; color: var(--muted); margin: 0;">✅ All products are in stock.</p>`;
    } else {
      lowStockList.innerHTML = lowStockItems.map(p => {
        const images = getProductImages(p);
        const imgUrl = images[0] || "";
        const badgeClass = p.stock === "Limited stock" ? "limited" : "out";
        const badgeText = p.stock === "Limited stock" ? "Limited" : "Out of Stock";
        return `
          <div class="low-stock-item">
            <div class="low-stock-info">
              <img class="low-stock-thumb" src="${imgUrl}" alt="${escapeHTML(p.name)}" />
              <div class="low-stock-details">
                <span class="low-stock-name">${escapeHTML(p.name)}</span>
                <span class="low-stock-meta">${escapeHTML(titleCase(p.category))} · ID: ${p.id}</span>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="low-stock-badge ${badgeClass}">${badgeText}</span>
              <button type="button" class="small-button restock-btn" data-restock-id="${p.id}" style="padding: 4px 8px; font-size: 11px;">Restock</button>
            </div>
          </div>
        `;
      }).join("");
    }
  }
}

async function updateProductStock(productId, newStock) {
  const product = appState.products.find(p => Number(p.id) === Number(productId));
  if (!product) return;
  
  const updatedProduct = {
    ...product,
    stock: newStock
  };
  
  try {
    await api(`/api/products/${productId}`, {
      method: "PUT",
      body: JSON.stringify(updatedProduct)
    });
    
    product.stock = newStock;
    showToast(`Stock updated to '${newStock}' for ${product.name}`);
    renderDashboard();
  } catch (error) {
    showToast(`Error updating stock: ${error.message}`);
  }
}

async function quickRestockProduct(productId) {
  await updateProductStock(productId, "In stock");
}

function renderAdminProductsTable() {
  const tbody = document.querySelector("#adminProductsTableBody");
  if (!tbody) return;
  if (appState.user.role !== "admin") return;
  
  let filtered = appState.products || [];
  if (appState.adminProductSearch) {
    const q = appState.adminProductSearch.trim().toLowerCase();
    filtered = filtered.filter(p => 
      String(p.id).includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  }
  
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--muted);">No products found matching search query.</td></tr>`;
    return;
  }
  
  tbody.innerHTML = filtered.map(p => {
    const images = getProductImages(p);
    const imgUrl = images[0] || "";
    const imgHTML = imgUrl 
      ? `<img class="admin-table-img" src="${imgUrl}" alt="${escapeHTML(p.name)}" />`
      : `<div class="admin-table-img" style="display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.05); font-weight: bold; font-size: 11px;">${escapeHTML(initials(p.name))}</div>`;
    
    const stockOptions = ["In stock", "Limited stock", "Out of stock"].map(opt => 
      `<option value="${opt}" ${p.stock === opt ? "selected" : ""}>${opt}</option>`
    ).join("");
    
    return `
      <tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 12px;">${p.id}</td>
        <td style="padding: 12px;">${imgHTML}</td>
        <td style="padding: 12px; font-weight: 600; color: var(--text-main);">${escapeHTML(p.name)}</td>
        <td style="padding: 12px; text-transform: capitalize;">${escapeHTML(p.category)}</td>
        <td style="padding: 12px;">${formatPrice(p.price)}</td>
        <td style="padding: 12px;">
          <select class="admin-stock-select" data-product-stock-id="${p.id}">
            ${stockOptions}
          </select>
        </td>
        <td style="padding: 12px; text-align: right;">
          <div style="display: flex; justify-content: flex-end; gap: 8px;">
            <button type="button" class="small-button edit-product-btn" data-edit-product-id="${p.id}" style="padding: 4px 8px; font-size: 12px;">Edit</button>
            <button type="button" class="danger-link delete-product-btn" data-delete-product-id="${p.id}" style="padding: 4px 8px; font-size: 12px; border: none; background: transparent; cursor: pointer;">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function printPackingSlip(orderId) {
  const order = appState.orders.find(o => Number(o.id) === Number(orderId));
  if (!order) return;
  
  const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  let delivery = subtotal > appState.settings.delivery_fee_threshold ? 0 : appState.settings.delivery_fee_standard;
  const other = appState.settings.other_charges;
  let tax = subtotal * (appState.settings.gst_rate / 100);
  
  const diff = (subtotal + delivery + tax + other) - order.total;
  let discount = 0;
  if (diff > 0) {
    if (Math.abs(diff - delivery) < 1) {
      discount = 0;
      delivery = 0;
    } else {
      const factor = 1 + (appState.settings.gst_rate / 100);
      discount = Math.max(0, subtotal - (order.total - delivery - other) / factor);
      tax = Math.max(0, (subtotal - discount) * (appState.settings.gst_rate / 100));
    }
  } else {
    discount = 0;
  }
  
  const itemsHtml = order.items.map(item => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${escapeHTML(item.product_name)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${escapeHTML(item.size || 'M')}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${formatPrice(item.price)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${formatPrice(item.price * item.quantity)}</td>
    </tr>
  `).join("");

  const printWindow = window.open("", "_blank", "width=800,height=600");
  if (!printWindow) {
    showToast("Popup blocked! Please allow popups to print packing slips.");
    return;
  }
  
  const htmlContent = `
    <html>
      <head>
        <title>Packing Slip - Order #${order.id}</title>
        <style>
          body { font-family: 'Inter', system-ui, sans-serif; color: #333; padding: 20px; line-height: 1.4; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .title { font-size: 24px; font-weight: bold; text-transform: uppercase; }
          .meta-info { margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
          .section-title { font-weight: bold; text-transform: uppercase; margin-bottom: 8px; font-size: 14px; color: #666; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { padding: 8px; background: #f5f5f5; border-bottom: 2px solid #ddd; font-weight: bold; text-transform: uppercase; font-size: 12px; }
          .totals { text-align: right; margin-left: auto; width: 300px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 14px; }
          .totals-bold { font-weight: bold; font-size: 16px; border-top: 1px solid #333; padding-top: 6px; margin-top: 6px; }
          @media print {
            body { padding: 0; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">Shibani Fashion</div>
            <div>High-End Apparel & Couture</div>
          </div>
          <div style="text-align: right;">
            <div class="title">PACKING SLIP</div>
            <div>Order ID: #${order.id}</div>
            <div>Date: ${new Date(order.created_at || Date.now()).toLocaleDateString("en-IN")}</div>
          </div>
        </div>
        
        <div class="meta-info">
          <div>
            <div class="section-title">Shipping Address</div>
            <strong>${escapeHTML(order.customer_name)}</strong><br>
            Phone: ${escapeHTML(order.phone)}<br>
            Address: ${escapeHTML(order.address)}
          </div>
          <div>
            <div class="section-title">Order Information</div>
            Payment Mode: ${escapeHTML(order.payment_mode)}<br>
            Status: ${escapeHTML(order.status)}
          </div>
        </div>
        
        <div class="section-title">Items Pack List</div>
        <table>
          <thead>
            <tr>
              <th style="text-align: left;">Item Description</th>
              <th>Size</th>
              <th>Qty</th>
              <th style="text-align: right;">Unit Price</th>
              <th style="text-align: right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        
        <div class="totals">
          <div>Subtotal:</div>
          <div>${formatPrice(subtotal)}</div>
          ${discount > 0 ? `
            <div style="color: green;">Discount:</div>
            <div style="color: green;">-${formatPrice(discount)}</div>
          ` : ""}
          <div>Delivery:</div>
          <div>${delivery > 0 ? formatPrice(delivery) : "FREE"}</div>
          <div>GST (${appState.settings.gst_rate}%):</div>
          <div>${formatPrice(tax)}</div>
          ${other > 0 ? `
            <div>Other Fees:</div>
            <div>${formatPrice(other)}</div>
          ` : ""}
          <div class="totals-bold">Total Paid:</div>
          <div class="totals-bold">${formatPrice(order.total)}</div>
        </div>
        
        <div style="margin-top: 40px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #eee; padding-top: 10px;">
          Thank you for shopping with Shibani Fashion! For queries, contact support@shibanifashion.com
        </div>
        
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          }
        </script>
      </body>
    </html>
  `;
  
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

// ============================================================================
// --- 5 Advanced E-Commerce Panels Frontend Logic ---
// ============================================================================

let selectedComparisonProductIds = [];


// 1. Wishlist Comparison Matrix Custom Card Renderer
function renderWishlistProductCard(product) {
  const baseCardHtml = renderProductCard(product);
  const checkboxHtml = `
    <div class="compare-checkbox-row" style="padding: 8px 16px; border-top: 1px solid var(--border-color); display: flex; align-items: center; gap: 8px; font-size: 13px;">
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; width: 100%;">
        <input type="checkbox" class="compare-checkbox" data-product-id="${product.id}" style="width: 16px; height: 16px; accent-color: var(--teal);" />
        <span>Compare this item</span>
      </label>
    </div>
  `;
  return baseCardHtml.replace("</article>", checkboxHtml + "</article>");
}

// 2. Product Details Modal & Sizing Feedback & Review Submission
async function openProductDetails(productId) {
  const product = appState.products.find(p => Number(p.id) === Number(productId));
  if (!product) return;
  
  const pdmProductId = document.querySelector("#pdmProductId");
  if (pdmProductId) pdmProductId.value = product.id;
  
  const pdmName = document.querySelector("#pdmName");
  if (pdmName) pdmName.textContent = product.name;
  
  const pdmCategory = document.querySelector("#pdmCategory");
  if (pdmCategory) {
    pdmCategory.textContent = product.category;
    pdmCategory.className = `badge-pill ${product.category}`;
  }
  
  const pdmPrice = document.querySelector("#pdmPrice");
  if (pdmPrice) pdmPrice.textContent = formatPrice(product.price);
  
  const pdmDescription = document.querySelector("#pdmDescription");
  if (pdmDescription) pdmDescription.textContent = product.description || "No description available.";
  
  const pdmMediaContainer = document.querySelector("#pdmMediaContainer");
  if (pdmMediaContainer) {
    const images = getProductImages(product);
    if (images[0]) {
      pdmMediaContainer.innerHTML = `<img src="${encodeURI(images[0])}" style="width: 100%; height: 100%; object-fit: cover;" alt="${escapeHTML(product.name)}" />`;
    } else {
      pdmMediaContainer.innerHTML = `<div class="placeholder-media ${escapeHTML(product.category)}" style="width: 100%; height: 100%; font-size: 32px;">${escapeHTML(initials(product.name))}</div>`;
    }
  }
  
  try {
    const data = await api(`/api/reviews?product_id=${product.id}`);
    const reviews = data.reviews || [];
    
    let smallCount = 0, fitCount = 0, largeCount = 0;
    reviews.forEach(r => {
      if (r.sizing_fit === "small") smallCount++;
      else if (r.sizing_fit === "fit") fitCount++;
      else if (r.sizing_fit === "large") largeCount++;
    });
    
    const totalFit = smallCount + fitCount + largeCount;
    const smallPct = totalFit > 0 ? Math.round((smallCount / totalFit) * 100) : 0;
    const fitPct = totalFit > 0 ? Math.round((fitCount / totalFit) * 100) : 0;
    const largePct = totalFit > 0 ? Math.round((largeCount / totalFit) * 100) : 0;
    
    const countEl = document.querySelector("#pdmSizingCount");
    if (countEl) countEl.textContent = `${totalFit} sizing feedback${totalFit === 1 ? "" : "s"}`;
    
    const barSmall = document.querySelector("#pdmFitSmallBar");
    if (barSmall) barSmall.style.width = `${smallPct}%`;
    const pctSmall = document.querySelector("#pdmFitSmallPct");
    if (pctSmall) pctSmall.textContent = `${smallPct}%`;
    
    const barTrue = document.querySelector("#pdmFitTrueBar");
    if (barTrue) barTrue.style.width = `${fitPct}%`;
    const pctTrue = document.querySelector("#pdmFitTruePct");
    if (pctTrue) pctTrue.textContent = `${fitPct}%`;
    
    const barLarge = document.querySelector("#pdmFitLargeBar");
    if (barLarge) barLarge.style.width = `${largePct}%`;
    const pctLarge = document.querySelector("#pdmFitLargePct");
    if (pctLarge) pctLarge.textContent = `${largePct}%`;
    
    const list = document.querySelector("#pdmReviewsList");
    const emptyText = document.querySelector("#pdmNoReviewsText");
    
    if (list) {
      if (reviews.length > 0) {
        if (emptyText) emptyText.classList.add("hidden");
        list.innerHTML = reviews.map(r => {
          const stars = "⭐".repeat(r.rating) + "☆".repeat(5 - r.rating);
          const fitText = r.sizing_fit === "small" ? "Runs Small" : (r.sizing_fit === "large" ? "Runs Large" : "True to Size");
          return `
            <div style="background: rgba(255,255,255,0.02); padding: 10px; border-radius: 8px; border: 1px solid var(--border-color); font-size: 12px; margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <strong>${escapeHTML(r.username)}</strong>
                <span style="color: var(--muted); font-size: 11px;">${new Date(r.created_at || Date.now()).toLocaleDateString()}</span>
              </div>
              <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
                <span style="color: var(--gold);">${stars}</span>
                <span class="badge-pill" style="font-size: 10px; padding: 2px 6px;">Fit: ${fitText}</span>
              </div>
              <p style="margin: 0; color: var(--text); line-height: 1.4;">${escapeHTML(r.comment)}</p>
            </div>
          `;
        }).join("");
      } else {
        list.innerHTML = "";
        if (emptyText) emptyText.classList.remove("hidden");
      }
    }
  } catch (err) {
    console.error("Error loading reviews:", err);
    showToast("Failed to load reviews.");
  }
  
  const writeReviewSection = document.querySelector("#writeReviewSection");
  if (writeReviewSection) {
    writeReviewSection.classList.toggle("hidden", appState.user.role !== "customer");
  }
  
  const form = document.querySelector("#submitReviewForm");
  if (form) form.reset();
  
  const detailsModal = document.querySelector("#productDetailsModal");
  if (detailsModal) detailsModal.classList.remove("hidden");
}

async function handleReviewSubmit(event) {
  event.preventDefault();
  const productId = Number(document.querySelector("#pdmProductId").value);
  const rating = Number(document.querySelector("#reviewRatingSelect").value);
  const sizing_fit = document.querySelector("#reviewFitSelect").value;
  const comment = document.querySelector("#reviewCommentText").value;
  
  if (!comment.trim()) {
    showToast("Please enter a review comment.");
    return;
  }
  
  try {
    await api("/api/reviews", {
      method: "POST",
      body: JSON.stringify({ product_id: productId, rating, sizing_fit, comment })
    });
    showToast("Review submitted successfully!");
    loadQuests();
    await openProductDetails(productId);
  } catch (err) {
    showToast(err.message || "Failed to submit review.");
  }
}

// 3. Wishlist Panel Logic
async function loadWishlist() {
  try {
    const data = await api("/api/wishlist");
    const wishlist = data.wishlist || [];
    const grid = document.querySelector("#wishlistItemsGrid");
    const emptyMsg = document.querySelector("#emptyWishlist");
    const compareBtn = document.querySelector("#compareWishlistBtn");
    
    if (!grid) return;
    
    selectedComparisonProductIds = [];
    if (compareBtn) {
      compareBtn.textContent = "Compare Selected (0/3)";
      compareBtn.disabled = true;
    }
    
    if (wishlist.length === 0) {
      grid.innerHTML = "";
      if (emptyMsg) emptyMsg.classList.remove("hidden");
      return;
    }
    
    if (emptyMsg) emptyMsg.classList.add("hidden");
    
    grid.innerHTML = wishlist.map(renderWishlistProductCard).join("");
    
    grid.querySelectorAll(".compare-checkbox").forEach(cb => {
      cb.addEventListener("change", (e) => {
        const productId = Number(e.target.dataset.productId);
        if (e.target.checked) {
          if (selectedComparisonProductIds.length >= 3) {
            e.target.checked = false;
            showToast("You can compare a maximum of 3 products.");
            return;
          }
          selectedComparisonProductIds.push(productId);
        } else {
          selectedComparisonProductIds = selectedComparisonProductIds.filter(id => id !== productId);
        }
        
        if (compareBtn) {
          compareBtn.textContent = `Compare Selected (${selectedComparisonProductIds.length}/3)`;
          compareBtn.disabled = selectedComparisonProductIds.length < 2;
        }
      });
    });
  } catch (err) {
    showToast("Failed to load wishlist: " + err.message);
  }
}

async function syncWishlist() {
  try {
    const data = await api("/api/wishlist");
    appState.wishlist = (data.wishlist || []).map(p => Number(p.id));
    localStorage.setItem("shibani_wishlist", JSON.stringify(appState.wishlist));
  } catch (err) {
    console.error("Wishlist sync error:", err);
  }
}

function renderComparisonMatrix() {
  const products = selectedComparisonProductIds.map(id => appState.products.find(p => Number(p.id) === id)).filter(Boolean);
  const table = document.querySelector("#comparisonTable");
  if (!table) return;
  
  if (products.length === 0) {
    table.innerHTML = "<tr><td style='padding: 20px; text-align: center; color: var(--muted);'>No products selected for comparison.</td></tr>";
    return;
  }
  
  let headerRow = `<tr style="border-bottom: 1px solid var(--border-color);"><th style="padding: 16px; font-weight: 700; color: var(--muted); width: 150px;">Attribute</th>`;
  products.forEach(p => {
    const img = getProductImages(p)[0] || "";
    const media = img ? `<img src="${encodeURI(img)}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px; margin-bottom: 8px;" />` : `<div class="placeholder-media" style="width: 80px; height: 80px; border-radius: 8px; margin-bottom: 8px; font-size: 12px;">${initials(p.name)}</div>`;
    headerRow += `
      <th style="padding: 16px; text-align: center; min-width: 180px;">
        <div style="display: flex; flex-direction: column; align-items: center;">
          ${media}
          <span style="font-weight: 600; font-size: 14px; text-align: center; color: var(--text);">${escapeHTML(p.name)}</span>
        </div>
      </th>
    `;
  });
  headerRow += `</tr>`;
  
  let priceRow = `<tr style="border-bottom: 1px solid var(--border-color);"><td style="padding: 12px 16px; font-weight: 600; color: var(--muted);">Price</td>`;
  products.forEach(p => {
    const oldPrice = p.old_price && p.old_price > p.price ? `<span style="text-decoration: line-through; color: var(--muted); font-size: 11px; margin-left: 6px;">${formatPrice(p.old_price)}</span>` : "";
    priceRow += `<td style="padding: 12px 16px; text-align: center; font-weight: 700; color: var(--primary);">${formatPrice(p.price)}${oldPrice}</td>`;
  });
  priceRow += `</tr>`;
  
  let categoryRow = `<tr style="border-bottom: 1px solid var(--border-color);"><td style="padding: 12px 16px; font-weight: 600; color: var(--muted);">Category</td>`;
  products.forEach(p => {
    categoryRow += `<td style="padding: 12px 16px; text-align: center; text-transform: capitalize;">${escapeHTML(p.category)}</td>`;
  });
  categoryRow += `</tr>`;
  
  let sizesRow = `<tr style="border-bottom: 1px solid var(--border-color);"><td style="padding: 12px 16px; font-weight: 600; color: var(--muted);">Available Sizes</td>`;
  products.forEach(p => {
    sizesRow += `<td style="padding: 12px 16px; text-align: center;">${escapeHTML(p.size || "Free Size")}</td>`;
  });
  sizesRow += `</tr>`;
  
  let colorsRow = `<tr style="border-bottom: 1px solid var(--border-color);"><td style="padding: 12px 16px; font-weight: 600; color: var(--muted);">Colors</td>`;
  products.forEach(p => {
    colorsRow += `<td style="padding: 12px 16px; text-align: center;">${escapeHTML(p.color || "As shown")}</td>`;
  });
  colorsRow += `</tr>`;
  
  let stockRow = `<tr style="border-bottom: 1px solid var(--border-color);"><td style="padding: 12px 16px; font-weight: 600; color: var(--muted);">Stock Status</td>`;
  products.forEach(p => {
    const stockClass = p.stock === "Out of stock" ? "color: var(--rose);" : (p.stock === "Limited stock" ? "color: var(--gold);" : "color: var(--teal);");
    stockRow += `<td style="padding: 12px 16px; text-align: center; font-weight: 600; ${stockClass}">${escapeHTML(p.stock)}</td>`;
  });
  stockRow += `</tr>`;
  
  let ratingRow = `<tr style="border-bottom: 1px solid var(--border-color);"><td style="padding: 12px 16px; font-weight: 600; color: var(--muted);">Avg. Rating</td>`;
  products.forEach(p => {
    ratingRow += `<td style="padding: 12px 16px; text-align: center; font-weight: 600; color: var(--gold);">⭐ ${Number(p.rating || 4.5).toFixed(1)}</td>`;
  });
  ratingRow += `</tr>`;
  
  let actionRow = `<tr><td style="padding: 16px; font-weight: 600; color: var(--muted);">Action</td>`;
  products.forEach(p => {
    actionRow += `
      <td style="padding: 16px; text-align: center;">
        <button class="primary-action small-button" type="button" onclick="addToCart(${p.id}); document.querySelector('#comparisonModal').classList.add('hidden');" ${p.stock === 'Out of stock' ? 'disabled' : ''} style="margin: 0 auto;">
          Add to Cart
        </button>
      </td>
    `;
  });
  actionRow += `</tr>`;
  
  table.innerHTML = headerRow + priceRow + categoryRow + sizesRow + colorsRow + stockRow + ratingRow + actionRow;
}



// 7. Financial Reports & Sales Trends Analytics Dashboard
async function loadAnalyticsDashboard() {
  try {
    const data = await api("/api/admin/analytics");
    renderKPIs(data.summary || {});
    drawSalesTrendChart(data.daily_trend || []);
    drawCategorySalesChart(data.category_sales || {});
  } catch (err) {
    showToast("Failed to load analytics: " + err.message);
  }
}

function renderKPIs(summary) {
  const grid = document.querySelector("#analyticsStatsGrid");
  if (!grid) return;
  grid.innerHTML = `
    <div class="stat-card" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 20px; border-radius: 12px; display: flex; flex-direction: column; gap: 8px;">
      <span style="font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px;">Total Revenue</span>
      <span style="font-size: 24px; font-weight: 800; color: var(--primary);">${formatPrice(summary.total_revenue || 0)}</span>
    </div>
    <div class="stat-card" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 20px; border-radius: 12px; display: flex; flex-direction: column; gap: 8px;">
      <span style="font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px;">Total Orders</span>
      <span style="font-size: 24px; font-weight: 800; color: var(--text);">${summary.total_orders || 0}</span>
    </div>
    <div class="stat-card" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 20px; border-radius: 12px; display: flex; flex-direction: column; gap: 8px;">
      <span style="font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px;">Average Order Value</span>
      <span style="font-size: 24px; font-weight: 800; color: var(--teal);">${formatPrice(summary.aov || 0)}</span>
    </div>
    <div class="stat-card" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 20px; border-radius: 12px; display: flex; flex-direction: column; gap: 8px;">
      <span style="font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px;">Loyalty Pts (Earned / Redeemed)</span>
      <span style="font-size: 20px; font-weight: 800; color: var(--gold);">${summary.points_earned || 0} / ${summary.points_redeemed || 0}</span>
    </div>
  `;
}

function drawSalesTrendChart(trendData) {
  const canvas = document.querySelector("#salesTrendCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = 300 * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  
  const width = rect.width;
  const height = 300;
  
  ctx.clearRect(0, 0, width, height);
  
  if (!trendData || trendData.length === 0) {
    ctx.fillStyle = "var(--muted)";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No sales trend data available", width / 2, height / 2);
    return;
  }
  
  const paddingLeft = 60;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;
  
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  
  const maxRevenue = Math.max(...trendData.map(d => d.revenue), 1000);
  const maxVal = Math.ceil(maxRevenue / 1000) * 1000;
  
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "var(--muted)";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const val = (maxVal / yTicks) * i;
    const y = paddingTop + chartHeight - (val / maxVal) * chartHeight;
    
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - paddingRight, y);
    ctx.stroke();
    
    ctx.fillText(`Rs.${Math.round(val)}`, paddingLeft - 8, y);
  }
  
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  
  const xLabelStep = Math.max(Math.ceil(trendData.length / 6), 1);
  trendData.forEach((d, idx) => {
    if (idx % xLabelStep === 0 || idx === trendData.length - 1) {
      const x = paddingLeft + (idx / (trendData.length - 1 || 1)) * chartWidth;
      
      let dateLabel = d.date;
      try {
        const parts = d.date.split("-");
        if (parts.length === 3) {
          const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
          dateLabel = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }
      } catch(e) {}
      
      ctx.fillText(dateLabel, x, paddingTop + chartHeight + 8);
    }
  });
  
  ctx.beginPath();
  trendData.forEach((d, idx) => {
    const x = paddingLeft + (idx / (trendData.length - 1 || 1)) * chartWidth;
    const y = paddingTop + chartHeight - (d.revenue / maxVal) * chartHeight;
    if (idx === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.strokeStyle = "var(--primary)";
  ctx.lineWidth = 3;
  ctx.shadowColor = "rgba(10, 148, 140, 0.4)";
  ctx.shadowBlur = 6;
  ctx.stroke();
  ctx.shadowBlur = 0;
  
  const grad = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + chartHeight);
  grad.addColorStop(0, "rgba(10, 148, 140, 0.25)");
  grad.addColorStop(1, "rgba(10, 148, 140, 0.0)");
  
  ctx.beginPath();
  trendData.forEach((d, idx) => {
    const x = paddingLeft + (idx / (trendData.length - 1 || 1)) * chartWidth;
    const y = paddingTop + chartHeight - (d.revenue / maxVal) * chartHeight;
    if (idx === 0) {
      ctx.moveTo(x, paddingTop + chartHeight);
      ctx.lineTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
    if (idx === trendData.length - 1) {
      ctx.lineTo(x, paddingTop + chartHeight);
    }
  });
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  
  ctx.fillStyle = "var(--teal)";
  trendData.forEach((d, idx) => {
    const x = paddingLeft + (idx / (trendData.length - 1 || 1)) * chartWidth;
    const y = paddingTop + chartHeight - (d.revenue / maxVal) * chartHeight;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fill();
  });
}

function drawCategorySalesChart(categorySales) {
  const canvas = document.querySelector("#categorySalesCanvas");
  const legend = document.querySelector("#categoryLegend");
  if (!canvas || !legend) return;
  
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(cx, cy) - 10;
  
  ctx.clearRect(0, 0, width, height);
  
  const categories = ["men", "women", "kids"];
  const colors = {
    men: "#366ba3",
    women: "#cc3965",
    kids: "#e2a536"
  };
  
  const values = categories.map(cat => categorySales[cat] || 0.0);
  const total = values.reduce((a, b) => a + b, 0);
  
  if (total === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.fillStyle = "#1e1e2d";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.stroke();
    ctx.fillStyle = "var(--muted)";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No Category Sales", cx, cy);
    
    legend.innerHTML = `
      <span style="display: flex; align-items: center; gap: 4px;"><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #366ba3;"></span> Men: 0%</span>
      <span style="display: flex; align-items: center; gap: 4px;"><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #cc3965;"></span> Women: 0%</span>
      <span style="display: flex; align-items: center; gap: 4px;"><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #e2a536;"></span> Kids: 0%</span>
    `;
    return;
  }
  
  let startAngle = -Math.PI / 2;
  
  categories.forEach((cat, idx) => {
    const val = categorySales[cat] || 0;
    const share = val / total;
    const arcSize = share * 2 * Math.PI;
    
    if (arcSize > 0) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, startAngle + arcSize);
      ctx.closePath();
      ctx.fillStyle = colors[cat];
      ctx.fill();
      ctx.strokeStyle = "#1c1c28";
      ctx.lineWidth = 3;
      ctx.stroke();
      
      startAngle += arcSize;
    }
  });
  
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.6, 0, 2 * Math.PI);
  ctx.fillStyle = "#1c1c28";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  ctx.stroke();
  
  ctx.fillStyle = "var(--text)";
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(formatPrice(total), cx, cy);
  
  legend.innerHTML = categories.map(cat => {
    const val = categorySales[cat] || 0;
    const pct = total > 0 ? Math.round((val / total) * 100) : 0;
    return `
      <span style="display: flex; align-items: center; gap: 6px; font-weight: 500;">
        <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${colors[cat]};"></span>
        <span style="text-transform: capitalize;">${cat}</span>: ${pct}%
      </span>
    `;
  }).join("");
}

// 8. Reviews Moderation Panel (Admin)
async function loadAdminReviews() {
  try {
    const data = await api("/api/admin/reviews");
    const reviews = data.reviews || [];
    const tbody = document.querySelector("#adminReviewsTableBody");
    if (!tbody) return;
    
    if (reviews.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: var(--muted);">No reviews found in queue.</td></tr>`;
      return;
    }
    
    tbody.innerHTML = reviews.map(r => {
      const isApproved = r.status === "approved";
      const badgeClass = isApproved ? "badge-pill women" : "badge-pill kids";
      const toggleAction = isApproved ? "hidden" : "approved";
      const toggleText = isApproved ? "Hide" : "Approve";
      const toggleBtnClass = isApproved ? "danger-link" : "small-button";
      const fitText = r.sizing_fit === "small" ? "Runs Small" : (r.sizing_fit === "large" ? "Runs Large" : "True to Size");
      return `
        <tr style="border-bottom: 1px solid var(--border-color);">
          <td style="padding: 12px;">${r.id}</td>
          <td style="padding: 12px; font-weight: 600;">${escapeHTML(r.product_name)}</td>
          <td style="padding: 12px;">${escapeHTML(r.username)}</td>
          <td style="padding: 12px; color: var(--gold);">${"⭐".repeat(r.rating)}</td>
          <td style="padding: 12px;">${fitText}</td>
          <td style="padding: 12px; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHTML(r.comment)}">${escapeHTML(r.comment)}</td>
          <td style="padding: 12px;"><span class="${badgeClass}">${r.status}</span></td>
          <td style="padding: 12px; text-align: right;">
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
              <button class="${toggleBtnClass}" type="button" onclick="updateReviewStatus(${r.id}, '${toggleAction}')">${toggleText}</button>
              <button class="danger-link" type="button" onclick="deleteReview(${r.id})" style="margin-left: 8px;">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    showToast("Failed to load admin reviews: " + err.message);
  }
}

async function updateReviewStatus(reviewId, status) {
  try {
    await api(`/api/admin/reviews/${reviewId}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    showToast(`Review status updated to ${status}`);
    await loadAdminReviews();
  } catch (err) {
    showToast("Failed to update review status: " + err.message);
  }
}

async function deleteReview(reviewId) {
  if (!confirm("Are you sure you want to delete this review?")) return;
  try {
    await api(`/api/admin/reviews/${reviewId}`, {
      method: "DELETE"
    });
    showToast("Review deleted successfully");
    await loadAdminReviews();
  } catch (err) {
    showToast("Failed to delete review: " + err.message);
  }
}

// Bind globals for inline onclick support
window.updateReviewStatus = updateReviewStatus;
window.deleteReview = deleteReview;
window.openProductDetails = openProductDetails;

function initExtraNewFeatures() {
  const closeDetailsModalBtn = document.querySelector("#closeDetailsModalBtn");
  if (closeDetailsModalBtn) {
    closeDetailsModalBtn.addEventListener("click", () => {
      document.querySelector("#productDetailsModal").classList.add("hidden");
    });
  }

  const productDetailsModal = document.querySelector("#productDetailsModal");
  if (productDetailsModal) {
    productDetailsModal.addEventListener("click", (e) => {
      if (e.target === productDetailsModal) {
        productDetailsModal.classList.add("hidden");
      }
    });
  }
  
  const submitReviewForm = document.querySelector("#submitReviewForm");
  if (submitReviewForm) {
    submitReviewForm.addEventListener("submit", handleReviewSubmit);
  }
  
  const compareWishlistBtn = document.querySelector("#compareWishlistBtn");
  if (compareWishlistBtn) {
    compareWishlistBtn.addEventListener("click", () => {
      renderComparisonMatrix();
      document.querySelector("#comparisonModal").classList.remove("hidden");
    });
  }
  
  const closeComparisonModalBtn = document.querySelector("#closeComparisonModalBtn");
  if (closeComparisonModalBtn) {
    closeComparisonModalBtn.addEventListener("click", () => {
      document.querySelector("#comparisonModal").classList.add("hidden");
    });
  }

  const comparisonModal = document.querySelector("#comparisonModal");
  if (comparisonModal) {
    comparisonModal.addEventListener("click", (e) => {
      if (e.target === comparisonModal) {
        comparisonModal.classList.add("hidden");
      }
    });
  }
  
  // Initialize newly added advanced filters and mannequin customization controls
  initRefinedFilters();
}

// --- Refined Filters Functions ---
function initRefinedFilters() {
  const toggleBtn = document.querySelector("#refinedFiltersToggleBtn");
  const drawer = document.querySelector("#refinedFiltersDrawer");
  
  if (toggleBtn && drawer) {
    toggleBtn.addEventListener("click", () => {
      drawer.classList.toggle("collapsed");
    });
  }
  
  const priceRange = document.querySelector("#filterPriceRange");
  const priceCurrent = document.querySelector("#priceRangeCurrent");
  if (priceRange && priceCurrent) {
    priceRange.addEventListener("input", (e) => {
      const val = e.target.value;
      priceCurrent.textContent = `Rs. ${Number(val).toLocaleString()}`;
      if (!appState.refinedFilters) appState.refinedFilters = {};
      appState.refinedFilters.maxPrice = Number(val);
      renderProducts();
    });
  }
  
  const stockOnly = document.querySelector("#filterStockOnly");
  if (stockOnly) {
    stockOnly.addEventListener("change", (e) => {
      if (!appState.refinedFilters) appState.refinedFilters = {};
      appState.refinedFilters.stockOnly = e.target.checked;
      renderProducts();
    });
  }
  
  const sizeChips = document.querySelectorAll("#filterSizeChips .size-chip");
  sizeChips.forEach(chip => {
    chip.addEventListener("click", () => {
      chip.classList.toggle("active");
      const activeChips = document.querySelectorAll("#filterSizeChips .size-chip.active");
      const selected = Array.from(activeChips).map(c => c.getAttribute("data-size"));
      if (!appState.refinedFilters) appState.refinedFilters = {};
      appState.refinedFilters.selectedSizes = selected;
      renderProducts();
    });
  });
  
  const sortBy = document.querySelector("#filterSortBy");
  if (sortBy) {
    sortBy.addEventListener("change", (e) => {
      if (!appState.refinedFilters) appState.refinedFilters = {};
      appState.refinedFilters.sortBy = e.target.value;
      renderProducts();
    });
  }
  
  const clearBtn = document.querySelector("#clearRefinedFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (priceRange) {
        priceRange.value = 10000;
        priceCurrent.textContent = "Rs. 10,000";
      }
      if (stockOnly) stockOnly.checked = false;
      sizeChips.forEach(c => c.classList.remove("active"));
      if (sortBy) sortBy.value = "none";
      
      appState.refinedFilters = {
        maxPrice: 10000,
        stockOnly: false,
        selectedSizes: [],
        sortBy: "none"
      };
      renderProducts();
    });
  }
}



// --- Gamification Quests Functions ---
async function loadQuests() {
  if (!appState.user || appState.user.role !== "customer") return;
  const container = document.querySelector("#questsListContainer");
  if (!container) return;
  
  try {
    const data = await api("/api/gamification/quests");
    const quests = data.quests || [];
    
    if (quests.length === 0) {
      container.innerHTML = `<p style="text-align: center; color: var(--muted); font-size: 13px;">No active quests.</p>`;
      return;
    }
    
    container.innerHTML = quests.map(q => {
      const progressPercent = Math.min(100, (q.progress / q.target) * 100);
      let actionHTML = "";
      
      if (q.claimed) {
        actionHTML = `<span class="quest-status-claimed">✅ Claimed</span>`;
      } else if (q.completed) {
        actionHTML = `<button type="button" class="quest-claim-btn" onclick="claimQuestReward('${q.quest_key}')">Claim Reward</button>`;
      } else {
        actionHTML = `<button type="button" class="quest-claim-btn disabled">In Progress</button>`;
      }
      
      return `
        <div class="quest-item-row" style="margin-bottom: 10px;">
          <div class="quest-info-block">
            <div class="quest-title-bar">
              <span class="quest-name">${escapeHTML(q.title)}</span>
              <span class="quest-points-tag">+${q.points} pts</span>
            </div>
            <p class="quest-description">${escapeHTML(q.description)}</p>
            <div class="quest-progress-outer">
              <div class="quest-progress-inner" style="width: ${progressPercent}%;"></div>
            </div>
            <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">
              Progress: ${q.progress} / ${q.target}
            </div>
          </div>
          <div class="quest-action-block">
            ${actionHTML}
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    console.error("Failed to load quests:", err);
    container.innerHTML = `<p style="text-align: center; color: var(--rose); font-size: 13px;">Error loading quests.</p>`;
  }
}

async function claimQuestReward(questKey) {
  try {
    const data = await api("/api/gamification/quests/claim", {
      method: "POST",
      body: JSON.stringify({ quest_key: questKey })
    });
    
    showToast(`🎉 Quest completed! Reward points added.`);
    
    // Update loyalty points in state and UI
    if (appState.user) {
      appState.user.loyalty_points = data.new_points_balance;
    }
    
    const spinPointsVal = document.querySelector("#spinPointsVal");
    if (spinPointsVal) spinPointsVal.textContent = data.new_points_balance;
    
    const profilePointsVal = document.querySelector("#profilePointsVal");
    if (profilePointsVal) profilePointsVal.textContent = data.new_points_balance;
    
    // Refresh quests list
    await loadQuests();
  } catch (err) {
    showToast(err.message || "Failed to claim reward.");
  }
}

window.claimQuestReward = claimQuestReward;

boot();
