const STORAGE_KEY = "b2b_platform_v4";
const SESSION_KEY = "b2b_session_v1";
const NOTIFICATION_STATE_KEY = "b2b_notification_state_v1";
const ENABLE_PHP_FALLBACK = String(window.B2B_ENABLE_PHP_FALLBACK || "false").trim().toLowerCase() === "true";
const API_STATE_URLS = buildApiStateUrls();
const API_STATE_STREAM_URLS = buildApiStateStreamUrls();
const API_AUTH_BASES = buildApiAuthBases();
const API_PAYMENT_BASES = buildApiPaymentBases();
const API_COMMISSION_BASES = buildApiCommissionBases();
const FREE_DELIVERY_THRESHOLD = 500000;
const BASE_DELIVERY_FEE = 30000;
const MAX_IMAGE_UPLOAD_BYTES = 2 * 1024 * 1024;
const PLATFORM_COMMISSION_RATE = 0.08;
const REWARD_POINT_STEP_AMOUNT = 10000;
const REWARD_POINTS_PER_STEP = 100;
const ORDER_STEP_FLOW = Object.freeze([
  { key: "Шинэ", label: "Шинэ" },
  { key: "Нийлүүлэгч хүлээн авсан", label: "Хүлээн авсан" },
  { key: "Хүргэлтэд гарсан", label: "Хүргэлт" },
  { key: "Худалдан авагч хүлээн авсан", label: "Дууссан" },
]);
const MOJIBAKE_RE = /[\u00C2\u00C3\u00D0-\u00D3\u00E2\u201A\u00AE]/;
const UTF8_ENCODER = new TextEncoder();
const UTF8_DECODER = new TextDecoder();

function uniqueUrls(values) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function shouldUseLocalApiFallback() {
  const protocol = String(window.location.protocol || "").trim().toLowerCase();
  const hostname = String(window.location.hostname || "").trim().toLowerCase();
  return protocol === "file:" || hostname === "localhost" || hostname === "127.0.0.1";
}

function buildApiStateUrls() {
  const urls = [window.B2B_API_URL || `${window.location.origin}/api/state`];

  if (shouldUseLocalApiFallback() && window.location.port !== "5000") {
    urls.push("http://localhost:5000/api/state");
  }

  if (ENABLE_PHP_FALLBACK) {
    urls.push("api/state.php");
  }

  return uniqueUrls(urls);
}

function toStateStreamUrl(stateUrl) {
  const url = String(stateUrl || "").trim();
  if (!url || !/\/api\/state/i.test(url)) return "";
  return url.replace(/\/api\/state(?:\?.*)?$/i, "/api/state/stream");
}

function buildApiStateStreamUrls() {
  const urls = [window.B2B_STATE_STREAM_URL || `${window.location.origin}/api/state/stream`];
  API_STATE_URLS.forEach((stateUrl) => {
    const streamUrl = toStateStreamUrl(stateUrl);
    if (streamUrl) urls.push(streamUrl);
  });
  return uniqueUrls(urls);
}

function buildApiAuthBases() {
  const urls = [window.B2B_AUTH_URL || `${window.location.origin}/api/auth`];

  if (shouldUseLocalApiFallback() && window.location.port !== "5000") {
    urls.push("http://localhost:5000/api/auth");
  }

  return uniqueUrls(urls);
}

function buildApiPaymentBases() {
  const urls = [window.B2B_PAYMENT_URL || `${window.location.origin}/api/payments`];

  if (shouldUseLocalApiFallback() && window.location.port !== "5000") {
    urls.push("http://localhost:5000/api/payments");
  }

  return uniqueUrls(urls);
}

function buildApiCommissionBases() {
  const urls = [window.B2B_COMMISSION_URL || `${window.location.origin}/api/commissions`];

  if (shouldUseLocalApiFallback() && window.location.port !== "5000") {
    urls.push("http://localhost:5000/api/commissions");
  }

  return uniqueUrls(urls);
}

const CP1252_EXTRA_BYTE_MAP = Object.freeze({
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
});

function repairMojibakePass(input) {
  const bytes = [];
  for (const ch of input) {
    const code = ch.codePointAt(0);
    if (code <= 0xff) {
      bytes.push(code);
      continue;
    }
    const mapped = CP1252_EXTRA_BYTE_MAP[code];
    if (mapped !== undefined) {
      bytes.push(mapped);
      continue;
    }
    bytes.push(...UTF8_ENCODER.encode(ch));
  }
  return UTF8_DECODER.decode(Uint8Array.from(bytes));
}

function repairMojibakeString(input) {
  if (!input || !MOJIBAKE_RE.test(input)) return input;
  let value = input;
  for (let i = 0; i < 2; i += 1) {
    const next = repairMojibakePass(value);
    if (next === value) break;
    value = next;
  }
  return value;
}

function repairMojibakeDeep(value) {
  if (typeof value === "string") return repairMojibakeString(value);
  if (Array.isArray(value)) return value.map((item) => repairMojibakeDeep(item));
  if (value && typeof value === "object") {
    const next = {};
    Object.entries(value).forEach(([key, item]) => {
      next[key] = repairMojibakeDeep(item);
    });
    return next;
  }
  return value;
}

function repairDomMojibake(root = document.body) {
  if (!root) return;

  const fixText = (value) => {
    const raw = String(value ?? "");
    if (!raw || !MOJIBAKE_RE.test(raw)) return raw;
    return repairMojibakeString(raw);
  };

  const fixElement = (element) => {
    if (!(element instanceof Element)) return;

    ["placeholder", "title", "aria-label", "value"].forEach((attr) => {
      if (!element.hasAttribute(attr)) return;
      const current = element.getAttribute(attr);
      const next = fixText(current);
      if (next !== current) element.setAttribute(attr, next);
    });

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const currentValue = element.value;
      const nextValue = fixText(currentValue);
      if (nextValue !== currentValue) element.value = nextValue;
    }
  };

  if (root instanceof Element) {
    fixElement(root);
    root.querySelectorAll("*").forEach((element) => fixElement(element));
  }

  const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode = textWalker.nextNode();
  while (textNode) {
    const current = textNode.nodeValue || "";
    if (current && MOJIBAKE_RE.test(current)) {
      const next = repairMojibakeString(current);
      if (next !== current) textNode.nodeValue = next;
    }
    textNode = textWalker.nextNode();
  }
}

function isQuestionCorruptedText(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/^\?+$/.test(text)) return true;

  const qCount = (text.match(/\?/g) || []).length;
  if (qCount < 2) return false;

  return qCount / text.length >= 0.3;
}

function safeUiText(value, fallback = "") {
  const fallbackText = repairMojibakeString(String(fallback || ""));
  const text = repairMojibakeString(String(value ?? "").trim());
  if (!text) return fallbackText;
  return isQuestionCorruptedText(text) ? fallbackText : text;
}

function normalizeCompanyKey(value) {
  return repairMojibakeString(String(value ?? ""))
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isSameCompany(a, b) {
  const left = normalizeCompanyKey(a);
  const right = normalizeCompanyKey(b);
  return Boolean(left) && left === right;
}

const CATEGORY_LABELS = {
  vegetables: "ЖИМС, НОГОО",
  meat: "МАХ, МАХАН БҮТЭЭГДЭХҮҮН",
  dairy: "СҮҮ, ЦАГААН ИДЭЭ",
  bakery: "ГУРИЛАН БҮТЭЭГДЭХҮҮН",
};

const DEFAULT_IMAGES = {
  vegetables: "https://images.unsplash.com/photo-1631021967261-c57ee4dfa9bb?auto=format&fit=crop&w=600&q=80",
  meat: "https://images.unsplash.com/photo-1740586222627-48338edac67d?auto=format&fit=crop&w=600&q=80",
  dairy: "https://images.unsplash.com/photo-1635714293982-65445548ac42?auto=format&fit=crop&w=600&q=80",
  bakery: "https://images.unsplash.com/photo-1649675602217-416a4fafcecb?auto=format&fit=crop&w=600&q=80",
  default: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80",
};

CATEGORY_LABELS.beverages = "\u0423\u041d\u0414\u0410\u0410";
CATEGORY_LABELS.confectionery = "\u0427\u0418\u0425\u042d\u0420 \u0410\u041c\u0422\u0422\u0410\u041d";
CATEGORY_LABELS.frozen = "\u0417\u0410\u0419\u0420\u041c\u0410\u0413";

DEFAULT_IMAGES.beverages = "https://images.unsplash.com/photo-1624517452488-04869289c4ca?auto=format&fit=crop&w=600&q=80";
DEFAULT_IMAGES.confectionery = "https://images.unsplash.com/photo-1621939514649-280e2ee25f60?auto=format&fit=crop&w=600&q=80";
DEFAULT_IMAGES.frozen = "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=600&q=80";

const CATEGORY_ORDER = ["vegetables", "meat", "dairy", "bakery", "beverages", "confectionery", "frozen"];

const BUYER_BUSINESS_TYPE_OPTIONS = [
  { value: "restaurant", label: "Ресторан" },
  { value: "cafe", label: "Кафе" },
  { value: "store", label: "Дэлгүүр" },
  { value: "wholesale", label: "Бөөний төв" },
];

const SUPPLIER_BUSINESS_TYPE_OPTIONS = [
  { value: "manufacturer", label: "Үйлдвэрлэгч" },
  { value: "importer", label: "Импортлогч" },
  { value: "wholesaler", label: "Бөөний нийлүүлэгч" },
];

const SUPPLIER_VERIFICATION_STATUSES = new Set(["pending", "verified", "rejected", "suspended"]);
const REWARD_STATUSES = new Set(["pending", "earned", "skipped", "cancelled"]);

const CATEGORY_ICONS = {
  all: "\u{1F6D2}",
  vegetables: "\u{1F96C}",
  meat: "\u{1F969}",
  dairy: "\u{1F95B}",
  bakery: "\u{1F35E}",
  beverages: "\u{1F964}",
  confectionery: "\u{1F36C}",
  frozen: "\u{1F366}",
};

const REQUIRED_PRODUCTS = [
  {
    name: "Cola 1.5L",
    category: "beverages",
    price: 4800,
    unit: "pcs",
    minOrder: 6,
    stock: 220,
    supplierCompany: "Soft Drink Trade",
    image: DEFAULT_IMAGES.beverages,
  },
  {
    name: "Orange Juice 1L",
    category: "beverages",
    price: 6200,
    unit: "pcs",
    minOrder: 6,
    stock: 180,
    supplierCompany: "Soft Drink Trade",
    image: DEFAULT_IMAGES.beverages,
  },
  {
    name: "Chocolate Bar",
    category: "confectionery",
    price: 2500,
    unit: "pcs",
    minOrder: 24,
    stock: 360,
    supplierCompany: "Sweet Market LLC",
    image: DEFAULT_IMAGES.confectionery,
  },
  {
    name: "Fruit Candy Mix",
    category: "confectionery",
    price: 7800,
    unit: "pack",
    minOrder: 10,
    stock: 140,
    supplierCompany: "Sweet Market LLC",
    image: DEFAULT_IMAGES.confectionery,
  },
  {
    name: "Vanilla Ice Cream 450ml",
    category: "frozen",
    price: 9500,
    unit: "pcs",
    minOrder: 8,
    stock: 120,
    supplierCompany: "Cold Chain Foods",
    image: DEFAULT_IMAGES.frozen,
  },
  {
    name: "Popsicle Mix Pack",
    category: "frozen",
    price: 11200,
    unit: "pack",
    minOrder: 6,
    stock: 95,
    supplierCompany: "Cold Chain Foods",
    image: DEFAULT_IMAGES.frozen,
  },
];

const DEFAULT_USERS = [
  {
    id: 1,
    role: "buyer",
    company: "Мини маркет-01",
    email: "buyer@foodsupply.mn",
    password: "Buyer@12345",
    contactName: "Demo Buyer",
    phone: "99001122",
    address: "Улаанбаатар",
    businessType: "store",
    rewardPoints: 0,
    totalEarnedPoints: 0,
    totalUsedPoints: 0,
    createdAt: "2026-03-23T08:00:00.000Z",
  },
  {
    id: 2,
    role: "supplier",
    company: "Талх Трейд ХХК",
    email: "supplier@foodsupply.mn",
    password: "Supplier@12345",
    contactName: "Demo Supplier",
    phone: "99002233",
    address: "Улаанбаатар",
    businessType: "wholesale",
    bankName: "Хаан Банк",
    bankAccountName: "Талх Трейд ХХК",
    bankAccountMasked: "******4321",
    qpayReceiverCode: "",
    companyName: "Ð¢Ð°Ð»Ñ… Ð¢Ñ€ÐµÐ¹Ð´ Ð¥Ð¥Ðš",
    registerNumber: "9000001",
    contactPersonName: "Demo Supplier",
    contactPersonPhone: "99002233",
    contactPersonEmail: "supplier@foodsupply.mn",
    supplierAgreementAccepted: true,
    supplierAgreementAcceptedAt: "2026-03-23T08:05:00.000Z",
    verificationStatus: "verified",
    verificationNote: "",
    verifiedAt: "2026-03-23T08:05:00.000Z",
    verifiedBy: "system",
    rewardPoints: 0,
    totalEarnedPoints: 0,
    totalUsedPoints: 0,
    createdAt: "2026-03-23T08:05:00.000Z",
  },
  {
    id: 3,
    role: "admin",
    company: "Систем Админ",
    email: "admin@example.com",
    password: "admin123",
    contactName: "System Admin",
    phone: "00000000",
    address: "System",
    businessType: "admin",
    rewardPoints: 0,
    totalEarnedPoints: 0,
    totalUsedPoints: 0,
    createdAt: "2026-03-23T08:10:00.000Z",
  },
];

const DEFAULT_STATE = {
  products: [
    {
      id: 1,
      name: "Шинэ улаан лооль",
      category: "vegetables",
      price: 8500,
      unit: "кг",
      minOrder: 5,
      stock: 160,
      supplierCompany: "Талх Трейд ХХК",
      image: DEFAULT_IMAGES.vegetables,
    },
    {
      id: 2,
      name: "Үхрийн цул мах",
      category: "meat",
      price: 42000,
      unit: "кг",
      minOrder: 3,
      stock: 72,
      supplierCompany: "Талх Трейд ХХК",
      image: DEFAULT_IMAGES.meat,
    },
    {
      id: 3,
      name: "Сүү 1л",
      category: "dairy",
      price: 3800,
      unit: "литр",
      minOrder: 12,
      stock: 210,
      supplierCompany: "Ферм Фүүдс ХХК",
      image: DEFAULT_IMAGES.dairy,
    },
    {
      id: 4,
      name: "Атар талх",
      category: "bakery",
      price: 2900,
      unit: "ширхэг",
      minOrder: 20,
      stock: 340,
      supplierCompany: "Талх Трейд ХХК",
      image: DEFAULT_IMAGES.bakery,
    },
  ],
  orders: [],
  coupons: [],
  carts: {},
  meta: {},
  announcements: [
    { id: 1, text: "Системийн шинэ боломжууд идэвхжлээ.", createdAt: "2026-03-23T08:30:00.000Z" },
    { id: 2, text: "Хүргэлтийн статусаа цаг тухайд нь шинэчилнэ үү.", createdAt: "2026-03-23T09:00:00.000Z" },
  ],
  nextProductId: 5,
  nextOrderId: 1001,
  nextNoticeId: 3,
  nextCouponId: 1,
  users: DEFAULT_USERS,
  nextUserId: 4,
  session: null,
};

let state = deepClone(DEFAULT_STATE);
let selectedCategory = "all";
let buyerOrdersOpen = false;
let buyerOrdersInitialized = false;
let authMode = "login";
let listenersBound = false;
let saveDebounceTimer = null;
let hasShownSyncError = false;
let activeApiStateUrl = API_STATE_URLS[0];
let activeApiStateStreamUrl = API_STATE_STREAM_URLS[0] || "";
let activeApiAuthBase = API_AUTH_BASES[0];
let activeApiPaymentBase = API_PAYMENT_BASES[0];
let activeApiCommissionBase = API_COMMISSION_BASES[0];
let stateEventSource = null;
let stateStreamReconnectTimer = null;
let statePollingTimer = null;
let isRemoteRefreshInProgress = false;
let activeQPayOrderQueue = [];
let activeQPayOrderId = 0;
let activeQPayInvoiceId = "";
let qpayStatusPollingTimer = null;

// Был.mn төлбөрийн state variables
let activeBylnOrderQueue = [];
let activeBylnOrderId = 0;
let activeBylnInvoiceId = "";
let bylnStatusPollingTimer = null;

let checkoutInProgress = false;
let activeCartCouponCode = "";
let activeCartCouponMessage = "";
let activeCartCouponTone = "info";
let activeCartPointsMessage = "";
let activeCartPointsTone = "info";
let lastCartPointsWarningKey = "";
let notificationState = loadNotificationState();
let latestNotifications = [];
const PORTAL_ROLES = new Set(["buyer", "supplier", "admin"]);
const PICKUP_TIME_SLOT_VALUES = ["09:00–12:00", "12:00–15:00", "15:00–18:00"];
const forcedPortalRole = detectPortalRole();

const authView = document.getElementById("authView");
const buyerView = document.getElementById("buyerView");
const adminView = document.getElementById("adminView");
const authForm = document.getElementById("authForm");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const authTitle = document.getElementById("authTitle");
const authSwitchHint = document.getElementById("authSwitchHint");
const toggleAuthModeBtn = document.getElementById("toggleAuthModeBtn");
const authLoginFields = document.getElementById("authLoginFields");
const authRegisterFields = document.getElementById("authRegisterFields");
const roleInput = document.getElementById("roleInput");
const authRoleCards = document.querySelectorAll("[data-role-card]");

const closeAuthBtn = document.getElementById("closeAuthBtn");
const openLoginBtn = document.getElementById("openLoginBtn");
const openRegisterBtn = document.getElementById("openRegisterBtn");
const openProfileBtn = document.getElementById("openProfileBtn");
const notificationMenu = document.getElementById("notificationMenu");
const notificationToggleBtn = document.getElementById("notificationToggleBtn");
const notificationCount = document.getElementById("notificationCount");
const notificationPanel = document.getElementById("notificationPanel");
const notificationList = document.getElementById("notificationList");
const notificationSummary = document.getElementById("notificationSummary");
const markNotificationsReadBtn = document.getElementById("markNotificationsReadBtn");
const logoutMarketBtn = document.getElementById("logoutMarketBtn");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const rememberLoginInput = document.getElementById("rememberLoginInput");

const loginEmailInput = document.getElementById("loginEmailInput");
const loginPasswordInput = document.getElementById("loginPasswordInput");

const registerCompanyInput = document.getElementById("registerCompanyInput");
const registerContactInput = document.getElementById("registerContactInput");
const registerEmailInput = document.getElementById("registerEmailInput");
const registerPhoneInput = document.getElementById("registerPhoneInput");
const registerAddressInput = document.getElementById("registerAddressInput");
const registerNumberInput = document.getElementById("registerNumberInput");
const registerContactPersonPhoneInput = document.getElementById("registerContactPersonPhoneInput");
const registerContactPersonEmailInput = document.getElementById("registerContactPersonEmailInput");
const registerBusinessTypeInput = document.getElementById("registerBusinessTypeInput");
const supplierRegisterFields = document.getElementById("supplierRegisterFields");
const registerBankNameInput = document.getElementById("registerBankNameInput");
const registerBankHolderInput = document.getElementById("registerBankHolderInput");
const registerBankAccountInput = document.getElementById("registerBankAccountInput");
const registerQPayReceiverInput = document.getElementById("registerQPayReceiverInput");
const registerBankAccountForBylnInput = document.getElementById("registerBankAccountForBylnInput");
const registerSupplierAgreementInput = document.getElementById("registerSupplierAgreementInput");
const registerPasswordInput = document.getElementById("registerPasswordInput");
const registerPasswordConfirmInput = document.getElementById("registerPasswordConfirmInput");
const registerTermsInput = document.getElementById("registerTermsInput");

const productSearch = document.getElementById("productSearch");
const productSections = document.getElementById("productSections");
const categoryNav = document.getElementById("categoryNav");
const footerCategories = document.getElementById("footerCategories");
const faqSection = document.getElementById("faqSection");
const buyerRewardPanel = document.getElementById("buyerRewardPanel");
const buyerRewardPoints = document.getElementById("buyerRewardPoints");
const buyerRewardTotalEarned = document.getElementById("buyerRewardTotalEarned");
const buyerRewardTotalUsed = document.getElementById("buyerRewardTotalUsed");
const buyerRewardHint = document.getElementById("buyerRewardHint");
const buyerOrdersPanel = document.getElementById("buyerOrdersPanel");
const buyerOrdersList = document.getElementById("buyerOrdersList");
const toggleBuyerOrdersBtn = document.getElementById("toggleBuyerOrdersBtn");
const openCartBtn = document.getElementById("openCartBtn");
const closeCartBtn = document.getElementById("closeCartBtn");
const openAddProductFromPanelBtn = document.getElementById("openAddProductFromPanelBtn");
const marketSessionBadge = document.getElementById("marketSessionBadge");
const supplierTopPanel = document.getElementById("supplierTopPanel");
const supplierVerificationBanner = document.getElementById("supplierVerificationBanner");
const supplierInlineProducts = document.getElementById("supplierInlineProducts");
const supplierInlineOrders = document.getElementById("supplierInlineOrders");
const cartOverlay = document.getElementById("cartOverlay");
const cartDrawer = document.getElementById("cartDrawer");
const cartItems = document.getElementById("cartItems");
const drawerItemCount = document.getElementById("drawerItemCount");
const cartCount = document.getElementById("cartCount");
const cartSubtotal = document.getElementById("cartSubtotal");
const cartDelivery = document.getElementById("cartDelivery");
const cartTotal = document.getElementById("cartTotal");
const cartDiscount = document.getElementById("cartDiscount");
const cartUsedPoints = document.getElementById("cartUsedPoints");
const cartEarnedPoints = document.getElementById("cartEarnedPoints");
const cartRewardBalance = document.getElementById("cartRewardBalance");
const cartPlatformFee = document.getElementById("cartPlatformFee");
const cartSupplierPayout = document.getElementById("cartSupplierPayout");
const cartFlowHint = document.getElementById("cartFlowHint");
const checkoutBtn = document.getElementById("checkoutBtn");
const cartCouponInput = document.getElementById("cartCouponInput");
const applyCouponBtn = document.getElementById("applyCouponBtn");
const cartCouponStatus = document.getElementById("cartCouponStatus");
const cartPointsInput = document.getElementById("cartPointsInput");
const cartPointsStatus = document.getElementById("cartPointsStatus");
const cartPickupDateInput = document.getElementById("cartPickupDateInput");
const cartPickupTimeSlotInput = document.getElementById("cartPickupTimeSlotInput");
const cartPickupNoteInput = document.getElementById("cartPickupNoteInput");
const cartDeliveryAddressInput = document.getElementById("cartDeliveryAddressInput");
const cartLocationNoteInput = document.getElementById("cartLocationNoteInput");
const cartContactPhoneInput = document.getElementById("cartContactPhoneInput");
const cartLatitudeInput = document.getElementById("cartLatitudeInput");
const cartLongitudeInput = document.getElementById("cartLongitudeInput");
const cartMapUrlInput = document.getElementById("cartMapUrlInput");
const useMaxPointsBtn = document.getElementById("useMaxPointsBtn");
const portalLinks = document.querySelectorAll("[data-portal-link]");

const statProducts = document.getElementById("statProducts");
const statSuppliers = document.getElementById("statSuppliers");
const statOrders = document.getElementById("statOrders");
const statPendingOrders = document.getElementById("statPendingOrders");
const heroDashboardBadge = document.getElementById("heroDashboardBadge");
const guestShowcase = document.getElementById("guestShowcase");
const homeDiscovery = document.getElementById("homeDiscovery");
const spotlightCategories = document.getElementById("spotlightCategories");
const featuredProductsSection = document.getElementById("featuredProductsSection");
const buyerHero = document.querySelector(".buyer-hero");
const buyerCategoriesBar = document.querySelector(".buyer-categories");

const adminSessionLabel = document.getElementById("adminSessionLabel");
const adminStatUsers = document.getElementById("adminStatUsers");
const adminStatSuppliers = document.getElementById("adminStatSuppliers");
const adminStatOrders = document.getElementById("adminStatOrders");
const adminStatPending = document.getElementById("adminStatPending");
const adminUserRows = document.getElementById("adminUserRows");
const adminOrderRows = document.getElementById("adminOrderRows");
const adminOrderChart = document.getElementById("adminOrderChart");
const adminSupplierChart = document.getElementById("adminSupplierChart");
const adminNoticeList = document.getElementById("adminNoticeList");
const adminNoticeForm = document.getElementById("adminNoticeForm");
const adminNoticeInput = document.getElementById("adminNoticeInput");
const adminToggleNoticeBtn = document.getElementById("adminToggleNoticeBtn");
const adminGenerateCommissionBtn = document.getElementById("adminGenerateCommissionBtn");
const adminSupplierVerificationRows = document.getElementById("adminSupplierVerificationRows");
const adminSupplierVerificationSummary = document.getElementById("adminSupplierVerificationSummary");
const adminCouponSummary = document.getElementById("adminCouponSummary");
const adminCouponRows = document.getElementById("adminCouponRows");
const adminCouponForm = document.getElementById("adminCouponForm");
const adminCouponCodeInput = document.getElementById("adminCouponCodeInput");
const adminCouponDiscountTypeInput = document.getElementById("adminCouponDiscountTypeInput");
const adminCouponDiscountValueInput = document.getElementById("adminCouponDiscountValueInput");
const adminCouponMinOrderInput = document.getElementById("adminCouponMinOrderInput");
const adminCouponMaxDiscountInput = document.getElementById("adminCouponMaxDiscountInput");
const adminCouponUsageLimitInput = document.getElementById("adminCouponUsageLimitInput");
const adminCouponValidFromInput = document.getElementById("adminCouponValidFromInput");
const adminCouponValidToInput = document.getElementById("adminCouponValidToInput");
const supplierVerificationModal = document.getElementById("supplierVerificationModal");
const closeSupplierVerificationBtn = document.getElementById("closeSupplierVerificationBtn");
const supplierVerificationModalTitle = document.getElementById("supplierVerificationModalTitle");
const supplierVerificationModalBody = document.getElementById("supplierVerificationModalBody");

const addProductModal = document.getElementById("addProductModal");
const productForm = document.getElementById("productForm");
const productCategoryInput = document.getElementById("productCategory");
const productImageUrlInput = document.getElementById("productImage");
const productImageFileInput = document.getElementById("productImageFile");
const productImagePreviewWrap = document.getElementById("productImagePreviewWrap");
const productImagePreview = document.getElementById("productImagePreview");
const qpayModal = document.getElementById("qpayModal");
const qpayModalTitle = document.getElementById("qpayModalTitle");
const qpayModalOrder = document.getElementById("qpayModalOrder");
const qpayModalSupplier = document.getElementById("qpayModalSupplier");
const qpayModalAmount = document.getElementById("qpayModalAmount");
const qpayModalInvoice = document.getElementById("qpayModalInvoice");
const qpayQrImage = document.getElementById("qpayQrImage");
const qpayQrText = document.getElementById("qpayQrText");
const qpayPayLink = document.getElementById("qpayPayLink");
const qpayCheckBtn = document.getElementById("qpayCheckBtn");
const qpayCloseBtn = document.getElementById("qpayCloseBtn");
const qpayMockPayBtn = document.getElementById("qpayMockPayBtn");

// Был.mn төлбөрийн modal elements
const bylnModal = document.getElementById("bylnModal");
const bylnModalTitle = document.getElementById("bylnModalTitle");
const bylnModalOrder = document.getElementById("bylnModalOrder");
const bylnModalSupplier = document.getElementById("bylnModalSupplier");
const bylnModalAmount = document.getElementById("bylnModalAmount");
const bylnModalInvoice = document.getElementById("bylnModalInvoice");
const bylnQrImage = document.getElementById("bylnQrImage");
const bylnQrText = document.getElementById("bylnQrText");
const bylnPayLink = document.getElementById("bylnPayLink");
const bylnCheckBtn = document.getElementById("bylnCheckBtn");
const bylnCloseBtn = document.getElementById("bylnCloseBtn");
const bylnMockPayBtn = document.getElementById("bylnMockPayBtn");

if (!bylnModal) console.warn("[DEBUG] bylnModal not found");

const profileModal = document.getElementById("profileModal");
const closeProfileBtn = document.getElementById("closeProfileBtn");
const profileForm = document.getElementById("profileForm");
const profileRoleLabel = document.getElementById("profileRoleLabel");
const profileCreatedAt = document.getElementById("profileCreatedAt");
const profileRewardPoints = document.getElementById("profileRewardPoints");
const profileTotalEarnedPoints = document.getElementById("profileTotalEarnedPoints");
const profileTotalUsedPoints = document.getElementById("profileTotalUsedPoints");
const profileCompanyInput = document.getElementById("profileCompanyInput");
const profileEmailInput = document.getElementById("profileEmailInput");
const profileContactInput = document.getElementById("profileContactInput");
const profilePhoneInput = document.getElementById("profilePhoneInput");
const profileAddressInput = document.getElementById("profileAddressInput");
const profileBusinessTypeInput = document.getElementById("profileBusinessTypeInput");
const profileSupplierFields = document.getElementById("profileSupplierFields");
const profileBankNameInput = document.getElementById("profileBankNameInput");
const profileBankHolderInput = document.getElementById("profileBankHolderInput");
const profileBankAccountInput = document.getElementById("profileBankAccountInput");
const profileQPayReceiverInput = document.getElementById("profileQPayReceiverInput");
const profileSupplierAgreementInput = document.getElementById("profileSupplierAgreementInput");

const toast = document.getElementById("toast");

bootstrapApp();

async function bootstrapApp() {
  let bootstrapError = null;

  try {
    state = await loadState();
    if (state.session?.token) {
      await refreshCurrentSessionUserFromApi();
    }
    await migrateLegacyPasswords();
    await trimLegacyOrdersIfNeeded();
  } catch (error) {
    bootstrapError = error;
    console.error("Bootstrap failed:", error);
    const cached = repairMojibakeDeep(loadCachedState());
    const localSession = repairMojibakeDeep(loadSession());
    state = normalizeState({
      ...deepClone(DEFAULT_STATE),
      ...(cached || {}),
      session: localSession,
    });
  }

  setupListeners();
  renderApp();
  setupStateRealtimeSync();

  if (bootstrapError) {
    showToast("Өгөгдөл ачаалахад алдаа гарлаа. Локал горимоор үргэлжилж байна.");
  }
}

function getStateMeta(source = state) {
  return source && typeof source.meta === "object" && source.meta ? source.meta : {};
}

function getOrderTimestamp(order) {
  const value = order?.statusUpdatedAt || order?.paymentConfirmedAt || order?.createdAt || "";
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortOrdersByRecency(orders = []) {
  return [...orders]
    .filter((row) => row && typeof row === "object")
    .sort((left, right) => {
      const timeDelta = getOrderTimestamp(right) - getOrderTimestamp(left);
      if (timeDelta !== 0) return timeDelta;
      return Number(right?.id || 0) - Number(left?.id || 0);
    });
}

async function trimLegacyOrdersIfNeeded() {
  const meta = getStateMeta(state);
  if (meta.orderCleanupDoneV1) return;

  const orders = Array.isArray(state.orders) ? state.orders : [];
  const nextOrders = orders.length > 5 ? sortOrdersByRecency(orders).slice(0, 5) : orders;
  state = normalizeState({
    ...deepClone(state),
    orders: nextOrders,
    meta: {
      ...meta,
      orderCleanupDoneV1: true,
      orderCleanupDoneAt: new Date().toISOString(),
    },
  });
  saveState();
}

async function loadState() {
  const cached = repairMojibakeDeep(loadCachedState());
  const localSession = repairMojibakeDeep(loadSession());
  const remote = repairMojibakeDeep(await fetchRemoteState());

  if (remote) {
    const merged = normalizeState({
      ...deepClone(DEFAULT_STATE),
      ...remote,
      session: localSession,
    });
    const snapshot = deepClone(merged);
    snapshot.session = null;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return merged;
  }

  const merged = normalizeState({
    ...deepClone(DEFAULT_STATE),
    ...(cached || {}),
    session: localSession,
  });
  return merged;
}

async function fetchRemoteState() {
  const endpoints = getApiCandidates();
  for (const endpoint of endpoints) {
    try {
      const response = await fetchWithTimeout(withCacheBust(endpoint), {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const remote = payload?.state && typeof payload.state === "object" ? payload.state : null;
      activeApiStateUrl = endpoint;
      return remote;
    } catch {
      continue;
    }
  }
  return null;
}

function getApiCandidates() {
  return [activeApiStateUrl, ...API_STATE_URLS.filter((url) => url !== activeApiStateUrl)];
}

function getStateStreamCandidates() {
  if (!activeApiStateStreamUrl) return [...API_STATE_STREAM_URLS];
  return [activeApiStateStreamUrl, ...API_STATE_STREAM_URLS.filter((url) => url !== activeApiStateStreamUrl)];
}

function getAuthApiCandidates() {
  return [activeApiAuthBase, ...API_AUTH_BASES.filter((url) => url !== activeApiAuthBase)];
}

function getPaymentApiCandidates() {
  return [activeApiPaymentBase, ...API_PAYMENT_BASES.filter((url) => url !== activeApiPaymentBase)];
}

function getCommissionApiCandidates() {
  return [activeApiCommissionBase, ...API_COMMISSION_BASES.filter((url) => url !== activeApiCommissionBase)];
}

function isLatin1HeaderSafe(value) {
  const text = String(value || "");
  for (const char of text) {
    const code = char.codePointAt(0);
    if (Number(code || 0) > 0xff) return false;
  }
  return true;
}

function appendCompanyHeaders(headers, company) {
  const actorCompany = String(company || "").trim();
  if (!actorCompany) return;

  if (isLatin1HeaderSafe(actorCompany)) {
    headers["X-B2B-Company"] = actorCompany;
    return;
  }

  headers["X-B2B-Company-URI"] = encodeURIComponent(actorCompany);
}

function buildActorHeaders() {
  const actorRole = String(state.session?.role || "guest").toLowerCase();
  const actorCompany = String(state.session?.company || "").trim();
  const sessionToken = String(state.session?.token || "").trim();
  const headers = {
    "Content-Type": "application/json",
    "X-B2B-Role": actorRole,
  };
  appendCompanyHeaders(headers, actorCompany);
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  return headers;
}

function hasServerAuthToken() {
  return Boolean(String(state.session?.token || "").trim());
}

function isAdminLoginEmail(email) {
  const normalized = normalizeEmail(email);
  return normalized === "admin@foodsupply.mn" || normalized === "admin@example.com";
}

function withCacheBust(url) {
  const suffix = url.includes("?") ? "&" : "?";
  return `${url}${suffix}t=${Date.now()}`;
}

async function postAuth(path, payload) {
  let lastError = null;

  for (const base of getAuthApiCandidates()) {
    try {
      const response = await fetchWithTimeout(`${base}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (!response.ok) {
        const err = new Error(String(body?.error || `HTTP ${response.status}`));
        err.status = response.status;
        throw err;
      }

      activeApiAuthBase = base;
      return body;
    } catch (error) {
      lastError = error;
      if (error?.status && error.status < 500) throw error;
    }
  }

  throw lastError || new Error("Auth API unavailable");
}

async function apiLogin(role, email, password) {
  return postAuth("/login", { role, email, password });
}

async function apiRegister(payload) {
  return postAuth("/register", payload);
}

async function apiGetCurrentUser() {
  const result = await requestApiWithActor(getAuthApiCandidates(), "/me", "GET");
  activeApiAuthBase = result.base;
  return result.body;
}

async function apiListAdminSuppliers(status = "pending") {
  const result = await requestApiWithActor(
    getAuthApiCandidates(),
    `/admin/suppliers?status=${encodeURIComponent(String(status || "pending"))}`,
    "GET"
  );
  activeApiAuthBase = result.base;
  return result.body;
}

async function apiGetAdminSupplier(supplierId) {
  const result = await requestApiWithActor(
    getAuthApiCandidates(),
    `/admin/suppliers/${encodeURIComponent(String(supplierId || 0))}`,
    "GET"
  );
  activeApiAuthBase = result.base;
  return result.body;
}

async function apiChangeAdminSupplierVerification(supplierId, action, note = "") {
  const result = await requestApiWithActor(
    getAuthApiCandidates(),
    `/admin/suppliers/${encodeURIComponent(String(supplierId || 0))}/${encodeURIComponent(String(action || ""))}`,
    "POST",
    note ? { note } : {}
  );
  activeApiAuthBase = result.base;
  return result.body;
}

async function apiListAdminCoupons() {
  const result = await requestApiWithActor(getAuthApiCandidates(), "/admin/coupons", "GET");
  activeApiAuthBase = result.base;
  return result.body;
}

async function apiCreateAdminCoupon(payload) {
  const result = await requestApiWithActor(getAuthApiCandidates(), "/admin/coupons", "POST", payload);
  activeApiAuthBase = result.base;
  return result.body;
}

async function apiDeactivateAdminCoupon(couponId) {
  const result = await requestApiWithActor(
    getAuthApiCandidates(),
    `/admin/coupons/${encodeURIComponent(String(couponId || 0))}/deactivate`,
    "PATCH",
    {}
  );
  activeApiAuthBase = result.base;
  return result.body;
}

async function requestApiWithActor(candidates, path, method = "GET", payload = null, timeoutMs = 9000) {
  let lastError = null;
  const headers = buildActorHeaders();

  for (let index = 0; index < candidates.length; index += 1) {
    const base = candidates[index];
    const hasMoreCandidates = index < candidates.length - 1;
    try {
      const options = {
        method,
        headers,
      };
      if (payload !== null) {
        options.body = JSON.stringify(payload);
      }

      const response = await fetchWithTimeout(`${base}${path}`, options, timeoutMs);
      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (!response.ok) {
        const err = new Error(String(body?.error || `HTTP ${response.status}`));
        err.status = response.status;
        throw err;
      }

      return { base, body };
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      if (status && status < 500) {
        const shouldTryNext = hasMoreCandidates && (status === 401 || status === 403 || status === 404);
        if (!shouldTryNext) throw error;
      }
    }
  }

  throw lastError || new Error("API request failed");
}

async function apiCreateQPayInvoice(orderId) {
  const result = await requestApiWithActor(getPaymentApiCandidates(), "/qpay/invoice", "POST", { orderId });
  activeApiPaymentBase = result.base;
  return result.body;
}

async function apiCheckQPayInvoice(invoiceId) {
  const result = await requestApiWithActor(getPaymentApiCandidates(), `/qpay/invoice/${encodeURIComponent(invoiceId)}/status`, "GET");
  activeApiPaymentBase = result.base;
  return result.body;
}

async function apiMockPayQPayInvoice(invoiceId) {
  const result = await requestApiWithActor(
    getPaymentApiCandidates(),
    `/qpay/invoice/${encodeURIComponent(invoiceId)}/mock-pay`,
    "POST",
    {}
  );
  activeApiPaymentBase = result.base;
  return result.body;
}

// =================== Был.mn төлбөрийн API функцүүд ===================

async function apiCreateBylnInvoice(orderId) {
  const result = await requestApiWithActor(getPaymentApiCandidates(), "/bylo/invoice", "POST", { orderId });
  activeApiPaymentBase = result.base;
  return result.body;
}

async function apiCheckBylnInvoice(invoiceId) {
  const result = await requestApiWithActor(getPaymentApiCandidates(), `/bylo/invoice/${encodeURIComponent(invoiceId)}/status`, "GET");
  activeApiPaymentBase = result.base;
  return result.body;
}

async function apiMockPayBylnInvoice(invoiceId) {
  const result = await requestApiWithActor(
    getPaymentApiCandidates(),
    `/bylo/invoice/${encodeURIComponent(invoiceId)}/mock-pay`,
    "POST",
    {}
  );
  activeApiPaymentBase = result.base;
  return result.body;
}

async function apiGenerateMonthlyCommission(month) {
  const result = await requestApiWithActor(
    getCommissionApiCandidates(),
    "/statements/generate",
    "POST",
    { month }
  );
  activeApiCommissionBase = result.base;
  return result.body;
}

async function fetchWithTimeout(url, options, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function loadCachedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? repairMojibakeDeep(parsed) : null;
  } catch {
    return null;
  }
}

async function refreshStateFromRemote() {
  if (isRemoteRefreshInProgress) return;
  isRemoteRefreshInProgress = true;

  try {
    const remote = repairMojibakeDeep(await fetchRemoteState());
    if (!remote) return;

    const merged = normalizeState({
      ...deepClone(DEFAULT_STATE),
      ...remote,
      session: state.session,
    });

    state = merged;
    const snapshot = deepClone(merged);
    snapshot.session = null;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    renderApp();
  } catch {
    // Stream refresh failures are non-fatal. The app keeps working with last known state.
  } finally {
    isRemoteRefreshInProgress = false;
  }
}

function stopStatePolling() {
  if (!statePollingTimer) return;
  clearInterval(statePollingTimer);
  statePollingTimer = null;
}

function startStatePolling(intervalMs = 8000) {
  if (statePollingTimer) return;
  statePollingTimer = setInterval(() => {
    refreshStateFromRemote();
  }, intervalMs);
}

function closeStateStream() {
  if (stateEventSource) {
    stateEventSource.close();
    stateEventSource = null;
  }
}

function scheduleStateStreamReconnect() {
  if (stateStreamReconnectTimer) return;

  stateStreamReconnectTimer = setTimeout(() => {
    stateStreamReconnectTimer = null;
    connectStateStream();
  }, 2500);
}

function connectStateStream() {
  if (typeof window.EventSource !== "function") {
    startStatePolling();
    return;
  }

  const candidates = getStateStreamCandidates();
  if (!candidates.length) {
    startStatePolling();
    return;
  }

  closeStateStream();
  const streamUrl = candidates[0];

  try {
    const es = new EventSource(streamUrl, { withCredentials: false });
    stateEventSource = es;

    es.addEventListener("open", () => {
      activeApiStateStreamUrl = streamUrl;
      stopStatePolling();
    });

    es.addEventListener("state-changed", () => {
      refreshStateFromRemote();
    });

    es.addEventListener("error", () => {
      closeStateStream();
      startStatePolling();
      scheduleStateStreamReconnect();
    });
  } catch {
    startStatePolling();
    scheduleStateStreamReconnect();
  }
}

function setupStateRealtimeSync() {
  connectStateStream();
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.role || !parsed.company) return null;
    return repairMojibakeDeep({
      role: String(parsed.role),
      company: String(parsed.company),
      token: String(parsed.token || ""),
    });
  } catch {
    return null;
  }
}

function saveSession() {
  if (!state.session) return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function loadNotificationState() {
  try {
    const raw = localStorage.getItem(NOTIFICATION_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveNotificationState() {
  try {
    localStorage.setItem(NOTIFICATION_STATE_KEY, JSON.stringify(notificationState));
  } catch {
    // Ignore local notification cache failures.
  }
}

function getNotificationAudienceKey(session = state.session) {
  const role = String(session?.role || "").trim().toLowerCase();
  const companyKey = normalizeCompanyKey(session?.company || "");
  if ((role !== "buyer" && role !== "supplier") || !companyKey) return "";
  return `${role}:${companyKey}`;
}

function getSeenNotificationIds(session = state.session) {
  const audienceKey = getNotificationAudienceKey(session);
  if (!audienceKey) return new Set();
  const seenIds = notificationState[audienceKey];
  if (!Array.isArray(seenIds)) return new Set();
  return new Set(
    seenIds
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  );
}

function markNotificationsAsRead(notificationIds, session = state.session) {
  const audienceKey = getNotificationAudienceKey(session);
  if (!audienceKey) return;

  const nextSeen = getSeenNotificationIds(session);
  let hasChanges = false;

  notificationIds.forEach((id) => {
    const key = String(id || "").trim();
    if (!key || nextSeen.has(key)) return;
    nextSeen.add(key);
    hasChanges = true;
  });

  if (!hasChanges) return;
  notificationState[audienceKey] = Array.from(nextSeen).slice(-300);
  saveNotificationState();
}

function getNotificationTimestamp(value, fallback = "") {
  const raw = String(value || fallback || "").trim();
  if (!raw) return 0;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function formatNotificationDate(value) {
  const parsed = new Date(value || 0);
  if (Number.isNaN(parsed.getTime())) return "Огноо тодорхойгүй";
  return parsed.toLocaleString("mn-MN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createNotificationEntry({
  id,
  kind = "system",
  title = "",
  message = "",
  createdAt = "",
  target = "",
  orderId = 0,
}) {
  const notificationId = String(id || "").trim();
  if (!notificationId) return null;

  const fallbackTime = new Date().toISOString();
  const createdValue = String(createdAt || fallbackTime);
  return {
    id: notificationId,
    kind,
    title: safeUiText(title, "Мэдэгдэл"),
    message: safeUiText(message, ""),
    createdAt: createdValue,
    timestamp: getNotificationTimestamp(createdValue, fallbackTime),
    target: String(target || "").trim(),
    orderId: Math.max(0, Number(orderId || 0) || 0),
  };
}

function buildAnnouncementNotifications() {
  return [...(state.announcements || [])].map((notice) =>
    createNotificationEntry({
      id: `announcement-${Number(notice?.id || 0)}`,
      kind: "announcement",
      title: "Системийн зар",
      message: safeUiText(notice?.text, "Шинэ мэдэгдэл"),
      createdAt: String(notice?.createdAt || ""),
      target: "announcements",
    })
  );
}

function buildBuyerNotifications(session) {
  const company = String(session?.company || "").trim();
  if (!company) return [];

  const notifications = [];
  const buyerOrders = (state.orders || [])
    .filter((order) => isSameCompany(order?.buyerCompany, company))
    .map((order) => normalizeOrderForUi(order));

  buyerOrders.forEach((order) => {
    notifications.push(
      createNotificationEntry({
        id: `buyer-order-${order.id}-created`,
        kind: "order",
        title: `Захиалга #${order.id} бүртгэгдлээ`,
        message: `${safeUiText(order.supplierCompany, "Нийлүүлэгч")}-д ${formatMoney(getOrderPayableAmountClient(order))} дүнтэй захиалга илгээгдлээ.`,
        createdAt: order.createdAt,
        target: "buyer-orders",
        orderId: order.id,
      })
    );

    if (isPaymentCompleted(order.paymentStatus)) {
      notifications.push(
        createNotificationEntry({
          id: `buyer-order-${order.id}-paid-${String(order.paymentConfirmedAt || order.qpayPaidAt || order.paymentStatus)}`,
          kind: "payment",
          title: `Захиалга #${order.id} төлөгдсөн`,
          message: "Төлбөр амжилттай баталгаажиж, нийлүүлэгч рүү захиалга илгээгдлээ.",
          createdAt: order.paymentConfirmedAt || order.qpayPaidAt || order.createdAt,
          target: "buyer-orders",
          orderId: order.id,
        })
      );
    }

    const normalizedStatus = normalizeOrderStatus(order.status);
    if (normalizedStatus === "Нийлүүлэгч хүлээн авсан") {
      notifications.push(
        createNotificationEntry({
          id: `buyer-order-${order.id}-accepted-${String(order.supplierAcceptedAt || order.statusUpdatedAt || order.status)}`,
          kind: "order",
          title: `Захиалга #${order.id} баталгаажлаа`,
          message: `${safeUiText(order.supplierCompany, "Нийлүүлэгч")} захиалгыг хүлээн авч бэлтгэж эхэллээ.`,
          createdAt: order.supplierAcceptedAt || order.statusUpdatedAt || order.createdAt,
          target: "buyer-orders",
          orderId: order.id,
        })
      );
    }

    if (normalizedStatus === "Хүргэлтэд гарсан") {
      notifications.push(
        createNotificationEntry({
          id: `buyer-order-${order.id}-shipped-${String(order.shippedAt || order.statusUpdatedAt || order.status)}`,
          kind: "delivery",
          title: `Захиалга #${order.id} хүргэлтэд гарлаа`,
          message: "Таны захиалга замд гарсан тул хүлээн авахад бэлэн байгаарай.",
          createdAt: order.shippedAt || order.statusUpdatedAt || order.createdAt,
          target: "buyer-orders",
          orderId: order.id,
        })
      );
    }

    if (normalizedStatus === "Худалдан авагч хүлээн авсан") {
      notifications.push(
        createNotificationEntry({
          id: `buyer-order-${order.id}-completed-${String(order.receivedAt || order.statusUpdatedAt || order.status)}`,
          kind: "delivery",
          title: `Захиалга #${order.id} дууслаа`,
          message: "Хүлээн авалт баталгаажиж захиалга амжилттай хаагдлаа.",
          createdAt: order.receivedAt || order.statusUpdatedAt || order.createdAt,
          target: "buyer-orders",
          orderId: order.id,
        })
      );
    }
  });

  return notifications;
}

function buildSupplierNotifications(session) {
  const company = String(session?.company || "").trim();
  if (!company) return [];

  const notifications = [];
  const supplierOrders = (state.orders || [])
    .filter((order) => isSameCompany(order?.supplierCompany, company))
    .map((order) => normalizeOrderForUi(order));

  supplierOrders.forEach((order) => {
    const normalizedStatus = normalizeOrderStatus(order.status);
    if (normalizedStatus === "Шинэ" && isPaymentCompleted(order.paymentStatus)) {
      notifications.push(
        createNotificationEntry({
          id: `supplier-order-${order.id}-new-${String(order.paymentConfirmedAt || order.qpayPaidAt || order.createdAt)}`,
          kind: "order",
          title: `Шинэ захиалга #${order.id}`,
          message: `${safeUiText(order.buyerCompany, "Худалдан авагч")} төлбөрөө баталгаажуулсан байна. Захиалгаа хүлээн авна уу.`,
          createdAt: order.paymentConfirmedAt || order.qpayPaidAt || order.createdAt,
          target: "supplier-orders",
          orderId: order.id,
        })
      );
    }

    if (normalizedStatus === "Нийлүүлэгч хүлээн авсан") {
      notifications.push(
        createNotificationEntry({
          id: `supplier-order-${order.id}-accepted-${String(order.supplierAcceptedAt || order.statusUpdatedAt || order.status)}`,
          kind: "order",
          title: `Захиалга #${order.id} хүлээн авсан`,
          message: "Захиалга бэлтгэгдэж байна. Дараагийн алхам нь хүргэлтэд гаргах.",
          createdAt: order.supplierAcceptedAt || order.statusUpdatedAt || order.createdAt,
          target: "supplier-orders",
          orderId: order.id,
        })
      );
    }

    if (normalizedStatus === "Хүргэлтэд гарсан") {
      notifications.push(
        createNotificationEntry({
          id: `supplier-order-${order.id}-shipped-${String(order.shippedAt || order.statusUpdatedAt || order.status)}`,
          kind: "delivery",
          title: `Захиалга #${order.id} замд гарсан`,
          message: `${safeUiText(order.buyerCompany, "Худалдан авагч")} хүлээн авалтаа баталгаажуулахыг хүлээж байна.`,
          createdAt: order.shippedAt || order.statusUpdatedAt || order.createdAt,
          target: "supplier-orders",
          orderId: order.id,
        })
      );
    }

    if (normalizedStatus === "Худалдан авагч хүлээн авсан") {
      notifications.push(
        createNotificationEntry({
          id: `supplier-order-${order.id}-received-${String(order.receivedAt || order.statusUpdatedAt || order.status)}`,
          kind: "delivery",
          title: `Захиалга #${order.id} хүлээн авагдлаа`,
          message: `${safeUiText(order.buyerCompany, "Худалдан авагч")} бараагаа амжилттай хүлээн авсан.`,
          createdAt: order.receivedAt || order.statusUpdatedAt || order.createdAt,
          target: "supplier-orders",
          orderId: order.id,
        })
      );
    }

    if (isPayoutTransferred(order.payoutStatus)) {
      notifications.push(
        createNotificationEntry({
          id: `supplier-order-${order.id}-payout-${String(order.payoutTransferredAt || order.payoutStatus)}`,
          kind: "payout",
          title: `Захиалга #${order.id} шилжүүлэг хийгдлээ`,
          message: `${formatMoney(order.supplierPayoutAmount)} нийлүүлэгчийн данс руу шилжсэн.`,
          createdAt: order.payoutTransferredAt || order.receivedAt || order.createdAt,
          target: "supplier-orders",
          orderId: order.id,
        })
      );
    }
  });

  return notifications;
}

function buildCurrentNotifications(session = state.session) {
  const role = String(session?.role || "").trim().toLowerCase();
  if (role !== "buyer" && role !== "supplier") return [];

  const notifications = [
    ...buildAnnouncementNotifications(),
    ...(role === "buyer" ? buildBuyerNotifications(session) : buildSupplierNotifications(session)),
  ].filter(Boolean);

  const unique = new Map();
  notifications.forEach((notification) => {
    unique.set(notification.id, notification);
  });

  return Array.from(unique.values())
    .sort((a, b) => {
      if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
      return String(b.id).localeCompare(String(a.id));
    })
    .slice(0, 16);
}

function getUnreadNotifications(notifications = latestNotifications, session = state.session) {
  const seenIds = getSeenNotificationIds(session);
  return notifications.filter((notification) => !seenIds.has(notification.id));
}

function getNotificationKindLabel(kind) {
  if (kind === "payment") return "Төлбөр";
  if (kind === "delivery") return "Хүргэлт";
  if (kind === "payout") return "Шилжүүлэг";
  if (kind === "order") return "Захиалга";
  return "Зар";
}

function renderNotificationItems(notifications = latestNotifications, session = state.session) {
  if (!notificationList) return;

  const unreadIds = new Set(getUnreadNotifications(notifications, session).map((notification) => notification.id));
  if (!notifications.length) {
    notificationList.innerHTML = `
      <div class="notification-empty">
        <strong>Шинэ мэдэгдэл алга</strong>
        <p>Захиалга, төлбөр, системийн зарууд энд харагдана.</p>
      </div>
    `;
    return;
  }

  notificationList.innerHTML = notifications
    .map((notification) => {
      const unreadClass = unreadIds.has(notification.id) ? " is-unread" : "";
      return `
        <button
          class="notification-item${unreadClass}"
          type="button"
          data-action="notification-jump"
          data-notification-target="${escapeAttr(notification.target || "")}"
          data-notification-id="${escapeAttr(notification.id)}"
          data-order-id="${notification.orderId || 0}"
        >
          <div class="notification-item-head">
            <span class="notification-kind">${escapeHtml(getNotificationKindLabel(notification.kind))}</span>
            <span class="notification-time">${escapeHtml(formatNotificationDate(notification.createdAt))}</span>
          </div>
          <strong>${escapeHtml(notification.title)}</strong>
          <p>${escapeHtml(notification.message)}</p>
        </button>
      `;
    })
    .join("");
}

function openNotificationPanel() {
  if (!notificationPanel || !notificationToggleBtn) return;
  setElementHidden(notificationPanel, false);
  notificationToggleBtn.setAttribute("aria-expanded", "true");
  markNotificationsAsRead(latestNotifications.map((notification) => notification.id));
  renderNotifications();
}

function closeNotificationPanel() {
  if (!notificationPanel || !notificationToggleBtn) return;
  setElementHidden(notificationPanel, true);
  notificationToggleBtn.setAttribute("aria-expanded", "false");
}

function scrollToNotificationTarget(target, orderId = 0) {
  const normalizedTarget = String(target || "").trim().toLowerCase();
  if (normalizedTarget === "buyer-orders") {
    buyerOrdersOpen = true;
    renderBuyerOrdersPanel();
    buyerOrdersPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (normalizedTarget === "supplier-orders") {
    renderBuyerOrdersPanel();
    renderSupplierTopPanel();
    const targetPanel =
      supplierTopPanel && !supplierTopPanel.classList.contains("hidden") ? supplierTopPanel : buyerOrdersPanel;
    targetPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (normalizedTarget === "announcements") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  if (orderId > 0) {
    buyerOrdersPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function renderNotifications(session = state.session) {
  const role = String(session?.role || "").trim().toLowerCase();
  const canShowNotifications = role === "buyer" || role === "supplier";

  if (notificationMenu) {
    notificationMenu.classList.toggle("hidden", !canShowNotifications);
  }

  if (!canShowNotifications) {
    latestNotifications = [];
    closeNotificationPanel();
    return;
  }

  latestNotifications = buildCurrentNotifications(session);
  const unreadNotifications = getUnreadNotifications(latestNotifications, session);

  if (notificationCount) {
    notificationCount.textContent = String(Math.min(unreadNotifications.length, 99));
    notificationCount.classList.toggle("hidden", unreadNotifications.length === 0);
  }

  if (notificationSummary) {
    notificationSummary.textContent = unreadNotifications.length
      ? `${unreadNotifications.length} шинэ мэдэгдэл байна`
      : latestNotifications.length
        ? "Сүүлийн update-уудыг эндээс харна"
        : "Шинэ update хараахан ирээгүй байна";
  }

  if (markNotificationsReadBtn) {
    markNotificationsReadBtn.disabled = unreadNotifications.length === 0;
  }

  renderNotificationItems(latestNotifications, session);
}

function detectPortalRole() {
  const bodyRole = String(document.body?.dataset?.portal || "").trim().toLowerCase();
  if (PORTAL_ROLES.has(bodyRole)) return bodyRole;
  const pageName = String(window.location.pathname.split("/").pop() || "").toLowerCase();
  if (pageName === "buyer.html") return "buyer";
  if (pageName === "supplier.html") return "supplier";
  if (pageName === "admin.html") return "admin";
  return "";
}

function isRoleLockedByPortal() {
  return PORTAL_ROLES.has(forcedPortalRole);
}

function getCurrentPageName() {
  return String(window.location.pathname.split("/").pop() || "").toLowerCase();
}

function redirectToAdminPortal() {
  const page = getCurrentPageName();
  if (page === "admin.html") return false;
  window.location.assign("admin.html");
  return true;
}

function setAuthMode(mode) {
  const selectedRole = String(roleInput?.value || "buyer").toLowerCase();
  const forceLoginOnly = selectedRole === "admin";
  authMode = forceLoginOnly ? "login" : mode === "register" ? "register" : "login";
  const isRegister = authMode === "register";
  const adminLoginTitle = "Админ нэвтрэх";
  if (authTitle) authTitle.textContent = isRegister ? "Бүртгүүлэх" : "Нэвтрэх";
  if (authSubmitBtn) authSubmitBtn.textContent = isRegister ? "Бүртгүүлэх" : "Нэвтрэх";
  if (authSwitchHint) authSwitchHint.textContent = isRegister ? "Бүртгэлтэй юу?" : "Бүртгэлгүй юу?";
  if (toggleAuthModeBtn) toggleAuthModeBtn.textContent = isRegister ? "Нэвтрэх" : "Бүртгүүлэх";
  if (authTitle && !isRegister && selectedRole === "admin") authTitle.textContent = adminLoginTitle;
  authLoginFields?.classList.toggle("hidden", isRegister);
  authRegisterFields?.classList.toggle("hidden", !isRegister);
  authLoginFields?.querySelectorAll("input, select, textarea").forEach((field) => {
    field.disabled = isRegister;
  });
  authRegisterFields?.querySelectorAll("input, select, textarea").forEach((field) => {
    field.disabled = !isRegister;
  });
  syncSupplierRegistrationFields();
  repairDomMojibake(authView || document.body);
}

function applyRoleSelection(role) {
  const normalized = isRoleLockedByPortal()
    ? forcedPortalRole
    : role === "supplier"
      ? "supplier"
      : role === "admin"
        ? "admin"
        : "buyer";
  if (roleInput) roleInput.value = normalized;
  authRoleCards.forEach((card) => {
    const cardRole = card.getAttribute("data-role-card");
    const active = cardRole === normalized;
    card.classList.toggle("active", active);
    card.setAttribute("aria-pressed", active ? "true" : "false");
  });
  if (loginEmailInput) {
    loginEmailInput.placeholder = normalized === "admin" ? "admin@foodsupply.mn" : "buyer@foodsupply.mn";
  }

  if (!isRoleLockedByPortal()) {
    const loginOnlyRole = normalized === "admin";
    if (loginOnlyRole) {
      setAuthMode("login");
    }
    toggleAuthModeBtn?.classList.toggle("hidden", loginOnlyRole);
    authSwitchHint?.classList.toggle("hidden", loginOnlyRole);
    openRegisterBtn?.classList.toggle("hidden", loginOnlyRole);
  }

  syncSupplierRegistrationFields();
}

function updateRegisterBusinessTypeOptions(isSupplier) {
  if (!registerBusinessTypeInput) return;

  const currentValue = String(registerBusinessTypeInput.value || "");
  const options = isSupplier ? SUPPLIER_BUSINESS_TYPE_OPTIONS : BUYER_BUSINESS_TYPE_OPTIONS;
  const markup = [
    `<option value="">Сонгох</option>`,
    ...options.map((option) => `<option value="${escapeAttr(option.value)}">${escapeHtml(option.label)}</option>`),
  ];

  registerBusinessTypeInput.innerHTML = markup.join("");
  if (options.some((option) => option.value === currentValue)) {
    registerBusinessTypeInput.value = currentValue;
  } else {
    registerBusinessTypeInput.value = options[0]?.value || "";
  }
}

function syncSupplierRegistrationFields() {
  const isSupplier = String(roleInput?.value || "buyer").toLowerCase() === "supplier";
  const shouldShow = isSupplier && authMode === "register";

  setElementHidden(supplierRegisterFields, !shouldShow);
  updateRegisterBusinessTypeOptions(isSupplier);

  [
    registerNumberInput,
    registerBankNameInput,
    registerBankHolderInput,
    registerBankAccountInput,
    registerBankAccountForBylnInput,
    registerContactPersonPhoneInput,
    registerContactPersonEmailInput,
    registerQPayReceiverInput,
    registerSupplierAgreementInput,
  ].forEach((field) => {
    if (!field) return;
    field.disabled = !shouldShow;
    field.required = isSupplier;
  });
}

function getRoleLabel(role) {
  const normalized = String(role || "").toLowerCase();
  if (normalized === "supplier") return "Ханган нийлүүлэгч";
  if (normalized === "buyer") return "ЖДБ";
  if (normalized === "admin") return "Админ";
  return "Зочин";
}

function formatDateTimeText(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("mn-MN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function maskBankAccountClient(value) {
  const cleaned = String(value || "").replace(/\s+/g, "");
  if (!cleaned) return "";
  const tail = cleaned.slice(-4);
  return `${"*".repeat(Math.max(0, cleaned.length - tail.length))}${tail}`;
}

function normalizeSupplierVerificationStatusClient(value, fallback = "verified") {
  const status = String(value || "").trim().toLowerCase();
  if (SUPPLIER_VERIFICATION_STATUSES.has(status)) return status;

  const fallbackStatus = String(fallback || "").trim().toLowerCase();
  if (SUPPLIER_VERIFICATION_STATUSES.has(fallbackStatus)) return fallbackStatus;
  return "";
}

function normalizeRewardStatusClient(value, fallback = "pending") {
  const status = String(value || "").trim().toLowerCase();
  if (REWARD_STATUSES.has(status)) return status;
  const fallbackStatus = String(fallback || "").trim().toLowerCase();
  return REWARD_STATUSES.has(fallbackStatus) ? fallbackStatus : "pending";
}

function normalizeCouponCodeClient(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function calculateEarnedPointsClient(amount) {
  const eligibleAmount = Math.max(0, Number(amount || 0));
  return Math.floor(eligibleAmount / REWARD_POINT_STEP_AMOUNT) * REWARD_POINTS_PER_STEP;
}

function normalizeCouponRecordClient(coupon = {}, fallbackId = 1) {
  const nowIso = new Date().toISOString();
  const discountType = String(coupon.discountType || "fixed").trim().toLowerCase() === "percent" ? "percent" : "fixed";
  const discountValue = Math.max(0, Number(coupon.discountValue || 0));
  const minOrderAmount = Math.max(0, Number(coupon.minOrderAmount || 0));
  const maxDiscountAmount = Math.max(0, Number(coupon.maxDiscountAmount || 0));
  const usageLimit = Math.max(0, Math.floor(Number(coupon.usageLimit || 0) || 0));
  const usedCount = Math.max(0, Math.floor(Number(coupon.usedCount || 0) || 0));
  return {
    id: Math.max(1, Number(coupon.id || fallbackId) || fallbackId),
    code: normalizeCouponCodeClient(coupon.code || ""),
    discountType,
    discountValue,
    minOrderAmount,
    maxDiscountAmount,
    validFrom: String(coupon.validFrom || ""),
    validTo: String(coupon.validTo || ""),
    usageLimit,
    usedCount,
    isActive: coupon.isActive === undefined ? true : Boolean(coupon.isActive),
    createdAt: String(coupon.createdAt || nowIso),
    createdBy: String(coupon.createdBy || ""),
    updatedAt: String(coupon.updatedAt || nowIso),
  };
}

function getOrderPayableAmountClient(order) {
  return Math.max(0, Number(order?.finalAmount ?? order?.totalAmount ?? order?.total ?? 0));
}

function getCurrentBuyerRewardUser() {
  const user = getCurrentSessionUser();
  if (!user || String(user.role || "").toLowerCase() !== "buyer") return null;
  return user;
}

function getCouponDiscountClient(coupon, subtotal) {
  const base = Math.max(0, Number(subtotal || 0));
  if (!coupon || base <= 0) return 0;
  let discount =
    coupon.discountType === "percent"
      ? Math.round(base * (Math.max(0, Number(coupon.discountValue || 0)) / 100))
      : Math.round(Math.max(0, Number(coupon.discountValue || 0)));
  if (Number(coupon.maxDiscountAmount || 0) > 0) {
    discount = Math.min(discount, Math.round(Number(coupon.maxDiscountAmount || 0)));
  }
  return Math.max(0, Math.min(discount, base));
}

function validateCouponClient(code, subtotal) {
  const normalizedCode = normalizeCouponCodeClient(code);
  if (!normalizedCode) {
    return { ok: false, reason: "empty", message: "Промо код оруулна уу.", coupon: null, discountAmount: 0 };
  }

  const coupon = (state.coupons || []).find((row) => normalizeCouponCodeClient(row.code) === normalizedCode) || null;
  if (!coupon) {
    return { ok: false, reason: "invalid", message: "Промо код хүчингүй эсвэл хугацаа дууссан байна.", coupon: null, discountAmount: 0 };
  }
  if (!coupon.isActive) {
    return { ok: false, reason: "invalid", message: "Промо код хүчингүй эсвэл хугацаа дууссан байна.", coupon, discountAmount: 0 };
  }

  const nowTime = Date.now();
  const validFromTime = coupon.validFrom ? new Date(coupon.validFrom).getTime() : 0;
  const validToTime = coupon.validTo ? new Date(coupon.validTo).getTime() : 0;
  if (validFromTime && nowTime < validFromTime) {
    return { ok: false, reason: "invalid", message: "Промо код хүчингүй эсвэл хугацаа дууссан байна.", coupon, discountAmount: 0 };
  }
  if (validToTime && nowTime > validToTime) {
    return { ok: false, reason: "invalid", message: "Промо код хүчингүй эсвэл хугацаа дууссан байна.", coupon, discountAmount: 0 };
  }
  if (subtotal < Math.max(0, Number(coupon.minOrderAmount || 0))) {
    return { ok: false, reason: "condition", message: "Энэ урамшууллын нөхцөл хангагдаагүй байна.", coupon, discountAmount: 0 };
  }
  if (Number(coupon.usageLimit || 0) > 0 && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit || 0)) {
    return { ok: false, reason: "condition", message: "Энэ урамшууллын нөхцөл хангагдаагүй байна.", coupon, discountAmount: 0 };
  }

  return {
    ok: true,
    reason: "success",
    message: `${coupon.code} амжилттай хэрэглэгдлээ.`,
    coupon,
    discountAmount: getCouponDiscountClient(coupon, subtotal),
  };
}

function setInlineStatusTone(element, tone = "") {
  if (!element) return;
  element.classList.remove("is-success", "is-error", "is-warning", "is-info");
  if (tone) {
    element.classList.add(`is-${tone}`);
  }
}

function getTodayDateInputValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function normalizeExternalLinkValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function normalizeOptionalCoordinate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function ensureCheckoutFieldDefaults() {
  const today = getTodayDateInputValue();
  const buyerUser = getCurrentSessionUser();
  if (cartPickupDateInput) {
    cartPickupDateInput.min = today;
    if (!cartPickupDateInput.value || cartPickupDateInput.value < today) {
      cartPickupDateInput.value = today;
    }
  }
  if (cartPickupTimeSlotInput && !cartPickupTimeSlotInput.value) {
    cartPickupTimeSlotInput.value = PICKUP_TIME_SLOT_VALUES[0];
  }
  if (cartDeliveryAddressInput && !String(cartDeliveryAddressInput.value || "").trim() && buyerUser?.address) {
    cartDeliveryAddressInput.value = String(buyerUser.address || "");
  }
  if (cartContactPhoneInput && !String(cartContactPhoneInput.value || "").trim() && buyerUser?.phone) {
    cartContactPhoneInput.value = String(buyerUser.phone || "");
  }
}

function resetCheckoutFieldValues() {
  const today = getTodayDateInputValue();
  if (cartPickupDateInput) {
    cartPickupDateInput.min = today;
    cartPickupDateInput.value = "";
  }
  if (cartPickupTimeSlotInput) cartPickupTimeSlotInput.value = "";
  if (cartPickupNoteInput) cartPickupNoteInput.value = "";
  if (cartDeliveryAddressInput) cartDeliveryAddressInput.value = "";
  if (cartLocationNoteInput) cartLocationNoteInput.value = "";
  if (cartContactPhoneInput) cartContactPhoneInput.value = "";
  if (cartLatitudeInput) cartLatitudeInput.value = "";
  if (cartLongitudeInput) cartLongitudeInput.value = "";
  if (cartMapUrlInput) cartMapUrlInput.value = "";
}

function restoreCheckoutFieldsFromOrder(order = {}) {
  const today = getTodayDateInputValue();
  if (cartPickupDateInput) {
    cartPickupDateInput.min = today;
    cartPickupDateInput.value = String(order.pickupDate || "");
  }
  if (cartPickupTimeSlotInput) {
    cartPickupTimeSlotInput.value = String(order.pickupTimeSlot || "");
  }
  if (cartPickupNoteInput) {
    cartPickupNoteInput.value = String(order.pickupNote || "");
  }
  if (cartDeliveryAddressInput) {
    cartDeliveryAddressInput.value = String(order.deliveryAddress || "");
  }
  if (cartLocationNoteInput) {
    cartLocationNoteInput.value = String(order.locationNote || "");
  }
  if (cartContactPhoneInput) {
    cartContactPhoneInput.value = String(order.contactPhone || "");
  }
  if (cartLatitudeInput) {
    cartLatitudeInput.value =
      order.latitude === null || order.latitude === undefined || order.latitude === "" ? "" : String(order.latitude);
  }
  if (cartLongitudeInput) {
    cartLongitudeInput.value =
      order.longitude === null || order.longitude === undefined || order.longitude === "" ? "" : String(order.longitude);
  }
  if (cartMapUrlInput) {
    cartMapUrlInput.value = String(order.mapUrl || "");
  }
}

function readCheckoutOrderDetails() {
  const today = getTodayDateInputValue();
  const pickupDate = String(cartPickupDateInput?.value || "").trim();
  const pickupTimeSlot = String(cartPickupTimeSlotInput?.value || "").trim();
  const pickupNote = String(cartPickupNoteInput?.value || "").trim();
  const deliveryAddress = String(cartDeliveryAddressInput?.value || "").trim();
  const locationNote = String(cartLocationNoteInput?.value || "").trim();
  const contactPhone = String(cartContactPhoneInput?.value || "").trim();
  const mapUrlRaw = String(cartMapUrlInput?.value || "").trim();
  const mapUrl = normalizeExternalLinkValue(mapUrlRaw);

  if (!pickupDate) {
    return { ok: false, message: "Хүлээн авах огноо сонгоно уу." };
  }
  if (pickupDate < today) {
    return { ok: false, message: "Өнгөрсөн огноо сонгох боломжгүй." };
  }
  if (!PICKUP_TIME_SLOT_VALUES.includes(pickupTimeSlot)) {
    return { ok: false, message: "Хүлээн авах цагийн интервалыг сонгоно уу." };
  }
  if (!deliveryAddress) {
    return { ok: false, message: "Хаяг оруулна уу." };
  }
  if (!contactPhone) {
    return { ok: false, message: "Холбоо барих утас оруулна уу." };
  }
  if (mapUrlRaw && !mapUrl) {
    return { ok: false, message: "Газрын зургийн холбоос буруу байна." };
  }

  return {
    ok: true,
    data: {
      pickupDate,
      pickupTimeSlot,
      pickupNote,
      deliveryAddress,
      locationNote,
      contactPhone,
      latitude: normalizeOptionalCoordinate(cartLatitudeInput?.value),
      longitude: normalizeOptionalCoordinate(cartLongitudeInput?.value),
      mapUrl,
    },
  };
}

function getRequestedCartPoints() {
  return Math.max(0, Math.floor(Number(cartPointsInput?.value || 0) || 0));
}

function buildCartPricingSummary(cartItemsList = null) {
  const detailedItems =
    Array.isArray(cartItemsList) && cartItemsList.length
      ? cartItemsList
      : getCurrentCart()
          .map((line) => {
            const product = state.products.find((item) => item.id === line.productId);
            if (!product) return null;
            return {
              product,
              qty: line.qty,
              subtotal: line.qty * product.price,
            };
          })
          .filter(Boolean);

  const subtotal = detailedItems.reduce((acc, line) => acc + line.subtotal, 0);
  const delivery = subtotal === 0 ? 0 : subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : BASE_DELIVERY_FEE;
  const platformFee = Math.round(subtotal * PLATFORM_COMMISSION_RATE);
  const supplierPayout = Math.max(0, subtotal - platformFee);
  const rewardUser = getCurrentBuyerRewardUser();
  const rewardBalance = Math.max(0, Number(rewardUser?.rewardPoints || 0));

  const couponResult =
    subtotal > 0 && activeCartCouponCode
      ? validateCouponClient(activeCartCouponCode, subtotal)
      : { ok: false, message: "", coupon: null, discountAmount: 0 };
  const discountAmount = couponResult.ok ? couponResult.discountAmount : 0;
  const requestedPoints = getRequestedCartPoints();
  const usablePoints = Math.max(0, Math.min(requestedPoints, rewardBalance, subtotal - discountAmount));
  const finalAmount = Math.max(0, subtotal - discountAmount - usablePoints);
  const earnedPoints = calculateEarnedPointsClient(finalAmount);

  return {
    items: detailedItems,
    subtotal,
    delivery,
    platformFee,
    supplierPayout,
    rewardBalance,
    appliedCoupon: couponResult.ok ? couponResult.coupon : null,
    couponMessage: couponResult.ok ? activeCartCouponMessage || couponResult.message : activeCartCouponMessage || couponResult.message,
    discountAmount,
    usedPoints: usablePoints,
    finalAmount,
    earnedPoints,
  };
}

function distributeAmountAcrossBuckets(totalAmount, bucketTotals) {
  const target = Math.max(0, Math.round(Number(totalAmount || 0)));
  const buckets = Array.isArray(bucketTotals) ? bucketTotals.map((value) => Math.max(0, Number(value || 0))) : [];
  const baseTotal = buckets.reduce((sum, value) => sum + value, 0);
  if (!buckets.length || target <= 0 || baseTotal <= 0) {
    return buckets.map(() => 0);
  }

  const provisional = buckets.map((value, index) => {
    const exact = (target * value) / baseTotal;
    return {
      index,
      value,
      amount: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });

  let assigned = provisional.reduce((sum, row) => sum + row.amount, 0);
  let remaining = target - assigned;
  provisional
    .slice()
    .sort((left, right) => right.remainder - left.remainder)
    .forEach((row) => {
      if (remaining <= 0) return;
      row.amount += 1;
      remaining -= 1;
    });

  return provisional
    .sort((left, right) => left.index - right.index)
    .map((row) => Math.min(Math.round(row.amount), Math.round(row.value)));
}

function restoreRewardUsageFromOrder(order) {
  const rewardUser = getCurrentBuyerRewardUser();
  if (!rewardUser || !order) return;
  const usedPoints = Math.max(0, Number(order.usedPoints || 0));
  if (usedPoints <= 0) return;
  rewardUser.rewardPoints = Math.max(0, Number(rewardUser.rewardPoints || 0) + usedPoints);
  rewardUser.totalUsedPoints = Math.max(0, Number(rewardUser.totalUsedPoints || 0) - usedPoints);
}

function restoreCouponUsageFromOrder(order) {
  const couponCode = normalizeCouponCodeClient(order?.appliedCouponCode || "");
  if (!couponCode) return;
  const coupon = (state.coupons || []).find((row) => normalizeCouponCodeClient(row.code) === couponCode);
  if (!coupon) return;
  coupon.usedCount = Math.max(0, Number(coupon.usedCount || 0) - 1);
}

function applyCartCoupon() {
  const code = normalizeCouponCodeClient(cartCouponInput?.value || "");
  if (!code) {
    activeCartCouponCode = "";
    activeCartCouponMessage = "";
    activeCartCouponTone = "info";
    renderCart();
    return;
  }

  const pricing = buildCartPricingSummary();
  const result = validateCouponClient(code, pricing.subtotal);
  if (!result.ok) {
    activeCartCouponCode = "";
    activeCartCouponMessage = result.message;
    activeCartCouponTone = result.reason === "condition" ? "warning" : "error";
    renderCart();
    if (result.reason !== "empty") {
      showToast(result.message, activeCartCouponTone);
    }
    return;
  }

  activeCartCouponCode = code;
  activeCartCouponMessage = result.message;
  activeCartCouponTone = "success";
  renderCart();
  showToast(result.message, "success");
}

function handleCartPointsInput() {
  const pricing = buildCartPricingSummary();
  const requestedPoints = Math.max(0, Math.floor(Number(cartPointsInput?.value || 0) || 0));
  const maxPoints = Math.max(0, Math.min(pricing.rewardBalance, pricing.subtotal - pricing.discountAmount));

  if (requestedPoints > maxPoints && requestedPoints > 0) {
    activeCartPointsMessage = "Ашиглах бонус үлдэгдлээс хэтэрсэн байна.";
    activeCartPointsTone = "warning";
    const warningKey = `${requestedPoints}:${maxPoints}`;
    if (lastCartPointsWarningKey !== warningKey) {
      lastCartPointsWarningKey = warningKey;
      showToast(activeCartPointsMessage, "warning");
    }
  } else if (requestedPoints > 0) {
    activeCartPointsMessage = `${Math.min(requestedPoints, maxPoints).toLocaleString("mn-MN")} бонус ашиглагдана.`;
    activeCartPointsTone = "success";
    lastCartPointsWarningKey = "";
  } else {
    activeCartPointsMessage = "";
    activeCartPointsTone = "info";
    lastCartPointsWarningKey = "";
  }
  renderCart();
}

function useMaxRewardPoints() {
  const pricing = buildCartPricingSummary();
  const maxPoints = Math.max(0, Math.min(pricing.rewardBalance, pricing.subtotal - pricing.discountAmount));
  if (cartPointsInput) {
    cartPointsInput.value = maxPoints > 0 ? String(maxPoints) : "";
  }
  activeCartPointsMessage = maxPoints > 0 ? `${maxPoints.toLocaleString("mn-MN")} бонус ашиглагдана.` : "";
  activeCartPointsTone = maxPoints > 0 ? "success" : "info";
  lastCartPointsWarningKey = "";
  renderCart();
}

function getSupplierVerificationLabel(status) {
  const normalized = normalizeSupplierVerificationStatusClient(status, "");
  if (normalized === "verified") return "Баталгаажсан";
  if (normalized === "rejected") return "Татгалзсан";
  if (normalized === "suspended") return "Түр түдгэлзсэн";
  return "Хүлээгдэж байна";
}

function getSupplierVerificationBannerText(status) {
  const normalized = normalizeSupplierVerificationStatusClient(status, "pending");
  if (normalized === "verified") return "Таны бүртгэл баталгаажсан байна.";
  if (normalized === "rejected") return "Таны бүртгэл татгалзсан байна.";
  if (normalized === "suspended") return "Таны бүртгэл түр түдгэлзсэн байна.";
  return "Таны бүртгэл админы хяналтад байна.";
}

function getSupplierBusinessTypeLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "manufacturer") return "Үйлдвэрлэгч";
  if (normalized === "importer") return "Импортлогч";
  if (normalized === "wholesaler") return "Бөөний нийлүүлэгч";
  return safeUiText(value, "Бусад");
}

function getSupplierVerificationBadgeClass(status) {
  const normalized = normalizeSupplierVerificationStatusClient(status, "pending") || "pending";
  return `supplier-verification-badge--${normalized}`;
}

function isSupplierVerifiedUser(user = getCurrentSessionUser()) {
  return normalizeSupplierVerificationStatusClient(user?.verificationStatus, "pending") === "verified";
}

function getCurrentSessionUser() {
  if (!state.session) return null;
  const role = String(state.session.role || "").trim().toLowerCase();
  const company = String(state.session.company || "").trim();
  if (!role || !company) return null;
  return (
    (state.users || []).find(
      (row) => String(row.role || "").trim().toLowerCase() === role && isSameCompany(row.company, company)
    ) || null
  );
}

function ensureVerifiedSupplierAccess(actionLabel = "Энэ үйлдэл") {
  const session = state.session;
  if (!session || session.role !== "supplier") return false;
  if (!isSupplierVerifiedUser()) {
    showToast(`${actionLabel} хийхийн тулд нийлүүлэгчийн бүртгэл баталгаажсан байх ёстой.`);
    return false;
  }
  return true;
}

function syncProfileFieldsByRole(role) {
  const isSupplier = String(role || "").trim().toLowerCase() === "supplier";
  setElementHidden(profileSupplierFields, !isSupplier);

  [
    profileBankNameInput,
    profileBankHolderInput,
    profileBankAccountInput,
    profileSupplierAgreementInput,
  ].forEach((field) => {
    if (!field) return;
    field.disabled = !isSupplier;
  });
}

function populateProfileForm(user) {
  if (!user) return;
  if (profileRoleLabel) profileRoleLabel.textContent = getRoleLabel(user.role);
  if (profileCreatedAt) profileCreatedAt.textContent = formatDateTimeText(user.createdAt);
  if (profileRewardPoints) profileRewardPoints.textContent = formatMoney(Number(user.rewardPoints || 0));
  if (profileTotalEarnedPoints) profileTotalEarnedPoints.textContent = `${Math.max(0, Number(user.totalEarnedPoints || 0)).toLocaleString("mn-MN")} оноо`;
  if (profileTotalUsedPoints) profileTotalUsedPoints.textContent = `${Math.max(0, Number(user.totalUsedPoints || 0)).toLocaleString("mn-MN")} оноо`;
  if (profileCompanyInput) profileCompanyInput.value = String(user.company || "");
  if (profileEmailInput) profileEmailInput.value = String(user.email || "");
  if (profileContactInput) profileContactInput.value = String(user.contactName || "");
  if (profilePhoneInput) profilePhoneInput.value = String(user.phone || "");
  if (profileAddressInput) profileAddressInput.value = String(user.address || "");
  if (profileBusinessTypeInput) profileBusinessTypeInput.value = String(user.businessType || "");
  if (profileBankNameInput) profileBankNameInput.value = String(user.bankName || "");
  if (profileBankHolderInput) profileBankHolderInput.value = String(user.bankAccountName || "");
  if (profileQPayReceiverInput) profileQPayReceiverInput.value = String(user.qpayReceiverCode || "");
  if (profileBankAccountInput) {
    profileBankAccountInput.value = "";
    profileBankAccountInput.placeholder = user.bankAccountMasked
      ? `Одоогийн: ${user.bankAccountMasked}`
      : "Шинэ дансны дугаар оруулна уу";
  }
  if (profileSupplierAgreementInput) {
    profileSupplierAgreementInput.checked = Boolean(user.supplierAgreementAccepted);
  }
  syncProfileFieldsByRole(user.role);
}

function openProfileModal() {
  const user = getCurrentSessionUser();
  if (!user) {
    showToast("Профайл мэдээлэл олдсонгүй.");
    return;
  }
  populateProfileForm(user);
  setElementHidden(profileModal, false);
  repairDomMojibake(profileModal || document.body);
  profileContactInput?.focus();
}

function closeProfileModal() {
  setElementHidden(profileModal, true);
}

function handleProfileSubmit(event) {
  event.preventDefault();

  const user = getCurrentSessionUser();
  if (!user || !state.session) {
    showToast("Нэвтэрсэн хэрэглэгчийн мэдээлэл олдсонгүй.");
    return;
  }

  const contactName = String(profileContactInput?.value || "").trim();
  const phone = String(profilePhoneInput?.value || "").trim();
  const address = String(profileAddressInput?.value || "").trim();
  const businessType = String(profileBusinessTypeInput?.value || "").trim();
  const role = String(user.role || "").trim().toLowerCase();
  const isSupplier = role === "supplier";

  if (!contactName || !phone || !address || !businessType) {
    showToast("Профайлын бүх талбарыг бөглөнө үү.");
    return;
  }

  if (!/^\d{8}$/.test(phone)) {
    showToast("Утасны дугаар 8 оронтой байх ёстой.");
    return;
  }

  user.contactName = contactName;
  user.phone = phone;
  user.address = address;
  user.businessType = businessType;

  if (isSupplier) {
    const bankName = String(profileBankNameInput?.value || "").trim();
    const bankAccountName = String(profileBankHolderInput?.value || "").trim();
    const bankAccountNumber = String(profileBankAccountInput?.value || "").trim();
    const qpayReceiverCode = String(profileQPayReceiverInput?.value || "").trim();
    const supplierAgreementAccepted = Boolean(profileSupplierAgreementInput?.checked);

    if (!bankName || !bankAccountName) {
      showToast("Банк болон данс эзэмшигчийн нэрээ оруулна уу.");
      return;
    }
    if (!supplierAgreementAccepted) {
      showToast("Нийлүүлэгчийн нөхцөлийг зөвшөөрсөн байх шаардлагатай.");
      return;
    }
    if (bankAccountNumber && bankAccountNumber.replace(/\D/g, "").length < 6) {
      showToast("Дансны дугаараа зөв оруулна уу.");
      return;
    }

    user.bankName = bankName;
    user.bankAccountName = bankAccountName;
    user.qpayReceiverCode = qpayReceiverCode;
    const bankAccount = String(profileBankAccountInput?.value || "").trim();
    if (bankAccount) {
      user.bankAccount = bankAccount;
    }
    if (bankAccountNumber) {
      user.bankAccountNumber = bankAccountNumber;
      user.bankAccountMasked = maskBankAccountClient(bankAccountNumber);
    } else if (!user.bankAccountMasked && user.bankAccountNumber) {
      user.bankAccountMasked = maskBankAccountClient(user.bankAccountNumber);
    }
    user.supplierAgreementAccepted = true;
    user.supplierAgreementAcceptedAt = String(user.supplierAgreementAcceptedAt || new Date().toISOString());
  }

  saveState();
  closeProfileModal();
  renderApp();
  showToast("Профайл хадгалагдлаа.");
}

function setElementHidden(element, hidden) {
  if (!element) return;
  element.classList.toggle("hidden", hidden);
  element.setAttribute("aria-hidden", hidden ? "true" : "false");
}

function openAuthModal(mode = "login") {
  if (isRoleLockedByPortal()) {
    applyRoleSelection(forcedPortalRole);
  } else if (!roleInput?.value || roleInput.value === "admin") {
    applyRoleSelection("buyer");
  }
  setAuthMode(mode);
  setElementHidden(authView, false);
  repairDomMojibake(authView || document.body);
  if (authMode === "register") registerCompanyInput?.focus();
  else loginEmailInput?.focus();
}

function closeAuthModal() {
  setElementHidden(authView, true);
}

function normalizeState(source) {
  const next = deepClone(source);
  const defaultProductById = new Map((DEFAULT_STATE.products || []).map((row) => [Number(row.id), row]));
  const defaultNoticeById = new Map((DEFAULT_STATE.announcements || []).map((row) => [Number(row.id), row]));
  const defaultUserById = new Map((DEFAULT_USERS || []).map((row) => [Number(row.id), row]));

  next.products = (next.products || []).map((item, index) => {
    const id = Number(item.id || index + 1);
    const category = String(item.category || "vegetables").toLowerCase();
    const stockValue = Number(item.stock ?? (item.inStock ? 1 : 0));
    const seed = defaultProductById.get(id) || {};
    return {
      id,
      name: safeUiText(item.name, safeUiText(seed.name, "Нэргүй бараа")),
      category,
      price: Number(item.price || 0),
      unit: safeUiText(item.unit, safeUiText(seed.unit, "ширхэг")),
      minOrder: Math.max(1, Number(item.minOrder || 1)),
      stock: Math.max(0, stockValue),
      supplierCompany: safeUiText(item.supplierCompany || item.supplier, safeUiText(seed.supplierCompany, "Нийлүүлэгч")),
      image: String(item.image || DEFAULT_IMAGES[category] || DEFAULT_IMAGES.default),
    };
  });
  next.products = ensureRequiredProducts(next.products);

  next.orders = (next.orders || []).map((order, index) => ({
    id: Number(order.id || index + 1),
    buyerCompany: safeUiText(order.buyerCompany, "ЖДБ"),
    supplierCompany: safeUiText(order.supplierCompany, "Нийлүүлэгч"),
    items: (order.items || []).map((item) => ({
      productId: Number(item.productId || 0),
      name: safeUiText(item.name, "Бараа"),
      price: Number(item.price || 0),
      unit: safeUiText(item.unit, "ширхэг"),
      qty: Math.max(1, Number(item.qty || 1)),
      subtotal: Number(item.subtotal || 0),
    })),
    subtotal: Math.max(0, Number(order.subtotal ?? order.total ?? 0)),
    discountAmount: Math.max(0, Number(order.discountAmount || 0)),
    usedPoints: Math.max(0, Number(order.usedPoints || 0)),
    earnedPoints: Math.max(
      0,
      Number(order.earnedPoints || Math.floor(Number(order.finalAmount ?? order.total ?? 0) / REWARD_POINT_STEP_AMOUNT) * REWARD_POINTS_PER_STEP)
    ),
    finalAmount: Math.max(0, Number(order.finalAmount ?? Math.max(0, Number(order.total || 0) - Number(order.discountAmount || 0) - Number(order.usedPoints || 0)))),
    rewardStatus: normalizeRewardStatusClient(order.rewardStatus, "pending"),
    appliedCouponCode: normalizeCouponCodeClient(order.appliedCouponCode || ""),
    pickupDate: safeUiText(order.pickupDate, ""),
    pickupTimeSlot: safeUiText(order.pickupTimeSlot, ""),
    pickupNote: safeUiText(order.pickupNote, ""),
    deliveryAddress: safeUiText(order.deliveryAddress, ""),
    locationNote: safeUiText(order.locationNote, ""),
    contactPhone: safeUiText(order.contactPhone, ""),
    latitude: Number.isFinite(Number(order.latitude)) ? Number(order.latitude) : null,
    longitude: Number.isFinite(Number(order.longitude)) ? Number(order.longitude) : null,
    mapUrl: normalizeExternalLinkValue(order.mapUrl || ""),
    total: Number(order.total || 0),
    status: safeUiText(order.status, "Шинэ"),
    paymentStatus: safeUiText(order.paymentStatus, "Төлөгдөөгүй"),
    deliveryStatus: safeUiText(order.deliveryStatus, "Хүлээгдэж байна"),
    platformFeeRate: Number(order.platformFeeRate || PLATFORM_COMMISSION_RATE),
    platformFeeAmount: Math.max(0, Number(order.platformFeeAmount || 0)),
    supplierPayoutAmount: Math.max(
      0,
      Number(order.supplierPayoutAmount || Number(order.total || 0) - Number(order.platformFeeAmount || 0))
    ),
    paymentMethod: safeUiText(order.paymentMethod, "supplier_qpay"),
    paymentRequestedAt: String(order.paymentRequestedAt || ""),
    paymentConfirmedAt: String(order.paymentConfirmedAt || ""),
    statusUpdatedAt: String(order.statusUpdatedAt || ""),
    supplierAcceptedAt: String(order.supplierAcceptedAt || ""),
    shippedAt: String(order.shippedAt || ""),
    receivedAt: String(order.receivedAt || ""),
    payoutStatus: safeUiText(order.payoutStatus, "Хүлээгдэж байна"),
    payoutTransferredAt: String(order.payoutTransferredAt || ""),
    qpayInvoiceId: String(order.qpayInvoiceId || ""),
    qpayInvoiceNo: String(order.qpayInvoiceNo || ""),
    qpayQrText: String(order.qpayQrText || ""),
    qpayQrImage: String(order.qpayQrImage || ""),
    qpayDeepLink: String(order.qpayDeepLink || ""),
    qpayWebUrl: String(order.qpayWebUrl || ""),
    qpayReceiverCode: String(order.qpayReceiverCode || ""),
    qpayStatus: safeUiText(order.qpayStatus, "NOT_REQUESTED"),
    qpayMode: safeUiText(order.qpayMode, "mock"),
    qpayPaidAt: String(order.qpayPaidAt || ""),
    createdAt: String(order.createdAt || new Date().toISOString()),
  }));

  if (!next.carts || typeof next.carts !== "object") next.carts = {};
  next.coupons = (next.coupons || [])
    .map((coupon, index) => normalizeCouponRecordClient(coupon, Number(coupon.id || index + 1)))
    .filter((coupon) => coupon.code);
  next.announcements = (next.announcements || []).map((row, index) => {
    const id = Number(row.id || index + 1);
    const seed = defaultNoticeById.get(id) || {};
    return {
      id,
      text: safeUiText(row.text, safeUiText(seed.text, "")),
      createdAt: String(row.createdAt || new Date().toISOString()),
    };
  });
  const sourceUsers = Array.isArray(next.users) && next.users.length > 0 ? next.users : DEFAULT_USERS;
  next.users = sourceUsers.map((user, index) => {
    const id = Number(user.id || index + 1);
    const seed = defaultUserById.get(id) || {};
    return {
      id,
      role: String(user.role || "buyer"),
      company: safeUiText(user.company, safeUiText(seed.company, "")),
      companyName: safeUiText(user.companyName, safeUiText(seed.companyName || seed.company, safeUiText(user.company, ""))),
      registerNumber: safeUiText(user.registerNumber, safeUiText(seed.registerNumber, "")),
      email: String(user.email || "").trim().toLowerCase(),
      password: String(user.password || ""),
      contactName: safeUiText(user.contactName, safeUiText(seed.contactName, "")),
      contactPersonName: safeUiText(user.contactPersonName, safeUiText(seed.contactPersonName || seed.contactName, safeUiText(user.contactName, ""))),
      phone: String(user.phone || ""),
      contactPersonPhone: safeUiText(user.contactPersonPhone, safeUiText(seed.contactPersonPhone, safeUiText(user.phone, ""))),
      contactPersonEmail: String(user.contactPersonEmail || seed.contactPersonEmail || user.email || "").trim().toLowerCase(),
      address: safeUiText(user.address, safeUiText(seed.address, "")),
      businessType: safeUiText(user.businessType, safeUiText(seed.businessType, "")),
      bankName: safeUiText(user.bankName, safeUiText(seed.bankName, "")),
      bankAccountName: safeUiText(user.bankAccountName, safeUiText(seed.bankAccountName, "")),
      bankAccountNumber: String(user.bankAccountNumber || seed.bankAccountNumber || ""),
      bankAccount: String(user.bankAccount || seed.bankAccount || ""),
      qpayReceiverCode: safeUiText(user.qpayReceiverCode, safeUiText(seed.qpayReceiverCode, "")),
      bankAccountMasked: safeUiText(user.bankAccountMasked, safeUiText(seed.bankAccountMasked, "")),
      supplierAgreementAccepted: Boolean(user.supplierAgreementAccepted ?? seed.supplierAgreementAccepted ?? false),
      supplierAgreementAcceptedAt: String(user.supplierAgreementAcceptedAt || seed.supplierAgreementAcceptedAt || ""),
      verificationStatus: normalizeSupplierVerificationStatusClient(
        user.verificationStatus || seed.verificationStatus || "",
        String(user.role || "").toLowerCase() === "supplier" ? "verified" : ""
      ),
      verificationNote: safeUiText(user.verificationNote, safeUiText(seed.verificationNote, "")),
      verifiedAt: String(user.verifiedAt || seed.verifiedAt || ""),
      verifiedBy: String(user.verifiedBy || seed.verifiedBy || ""),
      rewardPoints: Math.max(0, Number(user.rewardPoints ?? seed.rewardPoints ?? 0)),
      totalEarnedPoints: Math.max(0, Number(user.totalEarnedPoints ?? seed.totalEarnedPoints ?? user.rewardPoints ?? 0)),
      totalUsedPoints: Math.max(0, Number(user.totalUsedPoints ?? seed.totalUsedPoints ?? 0)),
      verificationHistory: Array.isArray(user.verificationHistory)
        ? user.verificationHistory.map((entry) => ({
            action: String(entry?.action || "").trim(),
            status: normalizeSupplierVerificationStatusClient(entry?.status, "pending"),
            note: safeUiText(entry?.note, ""),
            changedBy: safeUiText(entry?.changedBy, ""),
            changedAt: String(entry?.changedAt || ""),
          }))
        : Array.isArray(seed.verificationHistory)
          ? seed.verificationHistory
          : [],
      createdAt: String(user.createdAt || new Date().toISOString()),
    };
  });
  next.meta = next.meta && typeof next.meta === "object" ? { ...next.meta } : {};
  const hasAdminUser = next.users.some(
    (user) => normalizeEmail(user.email) === "admin@example.com" && String(user.role || "") === "admin"
  );
  if (!hasAdminUser) {
    const fallbackAdmin = DEFAULT_USERS.find((user) => String(user.role || "") === "admin");
    if (fallbackAdmin) {
      next.users.push({
        ...fallbackAdmin,
        id: maxId(next.users) + 1,
      });
    }
  }
  next.nextProductId = Math.max(next.nextProductId || 1, maxId(next.products) + 1);
  next.nextOrderId = Math.max(next.nextOrderId || 1, maxId(next.orders) + 1);
  next.nextNoticeId = Math.max(next.nextNoticeId || 1, maxId(next.announcements) + 1);
  next.nextCouponId = Math.max(next.nextCouponId || 1, maxId(next.coupons) + 1);
  next.nextUserId = Math.max(next.nextUserId || 1, maxId(next.users) + 1);
  if (next.session && (!next.session.role || !next.session.company)) next.session = null;
  return next;
}

function maxId(collection) {
  return collection.reduce((acc, item) => Math.max(acc, Number(item.id || 0)), 0);
}

function productSeedKey(name, category) {
  return `${String(name || "").trim().toLowerCase()}::${String(category || "").trim().toLowerCase()}`;
}

function ensureRequiredProducts(products) {
  const existingKeys = new Set(products.map((item) => productSeedKey(item.name, item.category)));
  const additions = [];
  let nextId = maxId(products) + 1;

  REQUIRED_PRODUCTS.forEach((seed) => {
    const category = normalizeCategory(seed.category);
    const key = productSeedKey(seed.name, category);
    if (existingKeys.has(key)) return;
    existingKeys.add(key);
    additions.push({
      id: nextId++,
      name: seed.name,
      category,
      price: Number(seed.price || 0),
      unit: String(seed.unit || "pcs"),
      minOrder: Math.max(1, Number(seed.minOrder || 1)),
      stock: Math.max(0, Number(seed.stock || 0)),
      supplierCompany: String(seed.supplierCompany || "Supplier"),
      image: String(seed.image || DEFAULT_IMAGES[category] || DEFAULT_IMAGES.default),
    });
  });

  return [...products, ...additions];
}

function saveState() {
  const snapshot = deepClone(state);
  snapshot.session = null;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));

  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    persistState(snapshot);
  }, 120);
}

async function persistState(snapshot) {
  let lastError = null;
  const endpoints = getApiCandidates();
  const actorRole = String(state.session?.role || "guest").toLowerCase();
  const actorCompany = String(state.session?.company || "").trim();
  const sessionToken = String(state.session?.token || "").trim();
  const requestHeaders = {
    "Content-Type": "application/json",
    "X-B2B-Role": actorRole,
  };
  appendCompanyHeaders(requestHeaders, actorCompany);
  if (sessionToken) {
    requestHeaders.Authorization = `Bearer ${sessionToken}`;
  }

  for (const endpoint of endpoints) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify({ state: snapshot }),
      });
      if (!response.ok) {
        const err = new Error(`HTTP ${response.status}`);
        err.status = response.status;
        throw err;
      }
      activeApiStateUrl = endpoint;
      hasShownSyncError = false;
      return;
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  if (!hasShownSyncError) {
    hasShownSyncError = true;
    if (lastError?.status === 401 || lastError?.status === 403) {
      showToast("Please sign in before syncing with server.");
    } else {
      showToast("Server sync failed. Working in local mode.");
    }
  }
  console.error("State sync failed:", lastError);
}

function setupListeners() {
  if (listenersBound) return;
  listenersBound = true;

  if (openLoginBtn) openLoginBtn.textContent = "\u041d\u044d\u0432\u0442\u0440\u044d\u0445";
  if (openRegisterBtn) openRegisterBtn.textContent = "\u0411\u04af\u0440\u0442\u0433\u04af\u04af\u043b\u044d\u0445";
  if (openProfileBtn) {
    openProfileBtn.setAttribute("aria-label", "\u041f\u0440\u043e\u0444\u0430\u0439\u043b");
    openProfileBtn.setAttribute("title", "\u041f\u0440\u043e\u0444\u0430\u0439\u043b");
  }
  if (closeAuthBtn) closeAuthBtn.textContent = "\u00d7";
  setElementHidden(authView, true);
  setElementHidden(cartDrawer, true);
  setElementHidden(addProductModal, true);
  setElementHidden(qpayModal, true);
  setElementHidden(profileModal, true);
  setElementHidden(notificationPanel, true);
  setAuthMode("login");
  applyRoleSelection(forcedPortalRole || "buyer");

  if (isRoleLockedByPortal()) {
    authRoleCards.forEach((card) => {
      const cardRole = String(card.getAttribute("data-role-card") || "");
      const isActiveRole = cardRole === forcedPortalRole;
      card.classList.toggle("hidden", !isActiveRole);
      card.disabled = !isActiveRole;
    });
    if (openRegisterBtn) {
      openRegisterBtn.classList.toggle("hidden", forcedPortalRole !== "buyer");
    }
    if (forcedPortalRole !== "buyer") {
      if (toggleAuthModeBtn) toggleAuthModeBtn.classList.add("hidden");
      if (authSwitchHint) authSwitchHint.classList.add("hidden");
    }
  }

  portalLinks.forEach((link) => {
    const linkRole = String(link.getAttribute("data-portal-link") || "").toLowerCase();
    if (linkRole && linkRole === forcedPortalRole) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }
  });

  authForm?.addEventListener("submit", handleAuthSubmit);

  openLoginBtn?.addEventListener("click", () => openAuthModal("login"));
  openRegisterBtn?.addEventListener("click", () => openAuthModal("register"));
  toggleAuthModeBtn?.addEventListener("click", () => {
    setAuthMode(authMode === "login" ? "register" : "login");
  });
  forgotPasswordBtn?.addEventListener("click", () => {
    showToast("Админтай холбогдож нууц үг сэргээлт хийлгэнэ үү.");
  });

  closeAuthBtn?.addEventListener("click", closeAuthModal);
  authView?.addEventListener("click", (event) => {
    if (event.target === authView) closeAuthModal();
  });

  authRoleCards.forEach((card) => {
    card.addEventListener("click", () => {
      const role = card.getAttribute("data-role-card");
      applyRoleSelection(role || "buyer");
    });
  });

  productSearch?.addEventListener("input", () => renderBuyerMarketplace());

  toggleBuyerOrdersBtn?.addEventListener("click", () => {
    const forceBuyerPortalPanel = isRoleLockedByPortal() && forcedPortalRole === "buyer";
    if (forceBuyerPortalPanel) {
      buyerOrdersOpen = true;
      renderBuyerOrdersPanel();
      buyerOrdersPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    buyerOrdersOpen = !buyerOrdersOpen;
    renderBuyerOrdersPanel();
    if (buyerOrdersOpen) {
      buyerOrdersPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  openCartBtn?.addEventListener("click", openCartDrawer);
  closeCartBtn?.addEventListener("click", closeCartDrawer);
  cartOverlay?.addEventListener("click", closeCartDrawer);
  applyCouponBtn?.addEventListener("click", applyCartCoupon);
  cartCouponInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyCartCoupon();
    }
  });
  cartPointsInput?.addEventListener("input", handleCartPointsInput);
  useMaxPointsBtn?.addEventListener("click", useMaxRewardPoints);
  checkoutBtn?.addEventListener("click", checkout);

  logoutMarketBtn?.addEventListener("click", logout);
  document.getElementById("logoutAdminBtn")?.addEventListener("click", logout);
  openProfileBtn?.addEventListener("click", openProfileModal);
  notificationToggleBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (notificationPanel?.classList.contains("hidden")) {
      openNotificationPanel();
      return;
    }
    closeNotificationPanel();
  });
  markNotificationsReadBtn?.addEventListener("click", () => {
    markNotificationsAsRead(latestNotifications.map((notification) => notification.id));
    renderNotifications();
  });
  closeProfileBtn?.addEventListener("click", closeProfileModal);
  profileForm?.addEventListener("submit", handleProfileSubmit);
  profileModal?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.hasAttribute("data-close-profile")) {
      closeProfileModal();
    }
  });
  closeSupplierVerificationBtn?.addEventListener("click", closeSupplierVerificationModal);
  supplierVerificationModal?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.hasAttribute("data-close-supplier-verification")) {
      closeSupplierVerificationModal();
    }
  });

  openAddProductFromPanelBtn?.addEventListener("click", openAddProductModal);

  addProductModal?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.hasAttribute("data-close-modal")) {
      closeAddProductModal();
    }
  });

  productForm?.addEventListener("submit", onAddProduct);
  productImageFileInput?.addEventListener("change", () => {
    void updateProductImagePreview();
  });
  productImageUrlInput?.addEventListener("input", () => {
    void updateProductImagePreview();
  });
  qpayCloseBtn?.addEventListener("click", closeQPayModal);
  qpayCheckBtn?.addEventListener("click", () => {
    void checkActiveQPayInvoiceStatus();
  });
  qpayMockPayBtn?.addEventListener("click", () => {
    void mockPayActiveQPayInvoice();
  });
  qpayModal?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.hasAttribute("data-close-qpay")) {
      closeQPayModal();
    }
  });

  // Был.mn modal event listeners
  bylnCloseBtn?.addEventListener("click", closeBylnModal);
  bylnCheckBtn?.addEventListener("click", () => {
    void checkActiveBylnInvoiceStatus();
  });
  bylnMockPayBtn?.addEventListener("click", () => {
    void mockPayActiveBylnInvoice();
  });
  bylnModal?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.hasAttribute("data-close-byln")) {
      closeBylnModal();
    }
  });

  adminNoticeForm?.addEventListener("submit", onAddNotice);
  adminCouponForm?.addEventListener("submit", onAdminCouponSubmit);
  adminToggleNoticeBtn?.addEventListener("click", () => {
    adminNoticeForm?.classList.toggle("hidden");
  });
  adminGenerateCommissionBtn?.addEventListener("click", async () => {
    if (!state.session || state.session.role !== "admin") {
      showToast("Зөвхөн админ тайлан үүсгэнэ.");
      return;
    }
    try {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const result = await apiGenerateMonthlyCommission(month);
      showToast(`Шимтгэлийн тайлан үүслээ: ${Number(result?.count || 0)} нийлүүлэгч.`);
    } catch (error) {
      showToast(String(error?.message || "Шимтгэлийн тайлан үүсгэхэд алдаа гарлаа."));
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (authView && !authView.classList.contains("hidden")) closeAuthModal();
    if (cartDrawer && !cartDrawer.classList.contains("hidden")) closeCartDrawer();
    if (addProductModal && !addProductModal.classList.contains("hidden")) closeAddProductModal();
    if (qpayModal && !qpayModal.classList.contains("hidden")) closeQPayModal();
    if (bylnModal && !bylnModal.classList.contains("hidden")) closeBylnModal();
    if (profileModal && !profileModal.classList.contains("hidden")) closeProfileModal();
    if (supplierVerificationModal && !supplierVerificationModal.classList.contains("hidden")) closeSupplierVerificationModal();
    if (notificationPanel && !notificationPanel.classList.contains("hidden")) closeNotificationPanel();
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (notificationMenu && !notificationMenu.contains(target) && notificationPanel && !notificationPanel.classList.contains("hidden")) {
      closeNotificationPanel();
    }

    const actionTrigger = target.closest("[data-action]");
    if (!(actionTrigger instanceof HTMLElement)) return;

    const action = actionTrigger.dataset.action;
    if (!action) return;

    const productId = Number(actionTrigger.dataset.productId || 0);
    const orderId = Number(actionTrigger.dataset.orderId || 0);
    const supplierId = Number(actionTrigger.dataset.supplierId || 0);
    const notificationTarget = String(actionTrigger.dataset.notificationTarget || "");

    if (action === "category-select") {
      selectedCategory = String(actionTrigger.dataset.category || "all");
      renderBuyerMarketplace();
      return;
    }
    if (action === "scroll-products") {
      scrollToProducts();
      return;
    }
    if (action === "clear-filters") {
      clearBuyerFilters();
      return;
    }
    if (action === "notification-jump") {
      const notificationId = String(actionTrigger.dataset.notificationId || "").trim();
      if (notificationId) {
        markNotificationsAsRead([notificationId]);
      }
      renderNotifications();
      closeNotificationPanel();
      scrollToNotificationTarget(notificationTarget, orderId);
      return;
    }
    if (action === "open-add-product") {
      openAddProductModal();
      return;
    }
    if (action === "supplier-view") {
      void openSupplierVerificationDetail(supplierId);
      return;
    }
    if (action === "supplier-verify") {
      void changeSupplierVerificationStatus(supplierId, "verify");
      return;
    }
    if (action === "supplier-reject") {
      void changeSupplierVerificationStatus(supplierId, "reject");
      return;
    }
    if (action === "supplier-suspend") {
      void changeSupplierVerificationStatus(supplierId, "suspend");
      return;
    }
    if (action === "coupon-deactivate") {
      void deactivateAdminCoupon(Number(actionTrigger.dataset.couponId || 0));
      return;
    }
    if (action === "add-cart") addToCart(productId);
    if (action === "cart-inc") updateCartQty(productId, +1);
    if (action === "cart-dec") updateCartQty(productId, -1);
    if (action === "cart-remove") removeFromCart(productId);
    if (action === "stock-inc") updateSupplierStock(productId, +1);
    if (action === "stock-dec") updateSupplierStock(productId, -1);
    if (action === "product-delete") deleteSupplierProduct(productId);
    if (action === "order-confirm") updateOrderStatus(orderId, "Нийлүүлэгч хүлээн авсан", "Бэлтгэж байна");
    if (action === "order-ship") updateOrderStatus(orderId, "Хүргэлтэд гарсан", "Замд");
    if (action === "order-pay") markOrderPaid(orderId);
    if (action === "order-transfer") transferOrderPayout(orderId);
    if (action === "order-edit-buyer") editBuyerOrder(orderId);
    if (action === "order-delete-buyer") deleteBuyerOrder(orderId);
    if (action === "order-receive-buyer") markOrderReceivedByBuyer(orderId);
    if (action === "order-pay-buyer") {
      if (!orderId) {
        showToast("Захиалгын дугаар олдсонгүй.");
        return;
      }
      if (!state.session || state.session.role !== "buyer") {
        showToast("Төлөхийн тулд ЖДБ эрхээр нэвтэрнэ үү.");
        if (authView?.classList.contains("hidden")) openAuthModal("login");
        return;
      }
      if (!hasServerAuthToken()) {
        showToast("Серверийн нэвтрэлт дууссан байна. Дахин нэвтэрнэ үү.");
        if (authView?.classList.contains("hidden")) openAuthModal("login");
        return;
      }

      // Был.mn төлбөр
      showToast("Был.mn invoice бэлдэж байна...");
      void ensureOrderBylnInvoiceAndOpen(orderId, [orderId]).catch((error) => {
        if (Number(error?.status || 0) === 401) {
          showToast("Нэвтрэлт хүчингүй байна. Дахин нэвтэрнэ үү.");
          if (authView?.classList.contains("hidden")) openAuthModal("login");
          return;
        }
        if (Number(error?.status || 0) === 404) {
          showToast("Төлбөрийн API олдсонгүй. API server-ээ restart хийгээрэй.");
          return;
        }
        showToast(String(error?.message || "Был.mn нээхэд алдаа гарлаа."));
      });
      return;
    }
  });

  window.addEventListener("beforeunload", () => {
    closeStateStream();
    stopStatePolling();
  });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isPasswordHash(value) {
  return /^sha256\$[a-f0-9]{64}$/i.test(String(value || ""));
}

async function hashPassword(value) {
  const plain = String(value || "");
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return plain;

  const bytes = new TextEncoder().encode(plain);
  const digest = await subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `sha256$${hex}`;
}

async function verifyPassword(plain, stored) {
  const expected = String(stored || "");
  if (!isPasswordHash(expected)) return expected === String(plain || "");

  const hashed = await hashPassword(plain);
  return hashed === expected;
}

async function migrateLegacyPasswords() {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || !Array.isArray(state?.users) || state.users.length === 0) return;

  let changed = false;
  for (const user of state.users) {
    if (!user || typeof user !== "object") continue;
    const current = String(user.password || "");
    if (isPasswordHash(current)) continue;
    user.password = await hashPassword(current);
    changed = true;
  }

  if (changed) {
    const snapshot = deepClone(state);
    snapshot.session = null;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }
}

async function upsertLocalUserFromAuth(authUser, plainPassword) {
  if (!authUser || typeof authUser !== "object") return;

  const email = normalizeEmail(authUser.email);
  const role = String(authUser.role || "buyer");
  const hashed = plainPassword ? await hashPassword(plainPassword) : "";

  const existing = (state.users || []).find(
    (row) => normalizeEmail(row.email) === email && String(row.role || "buyer") === role
  );

  if (existing) {
    existing.company = String(authUser.company || existing.company || "");
    existing.companyName = String(authUser.companyName || authUser.company || existing.companyName || existing.company || "");
    existing.registerNumber = String(authUser.registerNumber || existing.registerNumber || "");
    if (hashed) existing.password = hashed;
    existing.contactName = String(authUser.contactName || existing.contactName || "");
    existing.contactPersonName = String(authUser.contactPersonName || authUser.contactName || existing.contactPersonName || existing.contactName || "");
    existing.phone = String(authUser.phone || existing.phone || "");
    existing.contactPersonPhone = String(authUser.contactPersonPhone || authUser.phone || existing.contactPersonPhone || existing.phone || "");
    existing.contactPersonEmail = normalizeEmail(
      authUser.contactPersonEmail || authUser.email || existing.contactPersonEmail || existing.email || ""
    );
    existing.address = String(authUser.address || existing.address || "");
    existing.businessType = String(authUser.businessType || existing.businessType || "");
    existing.bankName = String(authUser.bankName || existing.bankName || "");
    existing.bankAccountName = String(authUser.bankAccountName || existing.bankAccountName || "");
    existing.bankAccountMasked = String(authUser.bankAccountMasked || existing.bankAccountMasked || "");
    existing.qpayReceiverCode = String(authUser.qpayReceiverCode || existing.qpayReceiverCode || "");
    existing.verificationStatus = normalizeSupplierVerificationStatusClient(
      authUser.verificationStatus || existing.verificationStatus || "",
      String(existing.role || role).toLowerCase() === "supplier" ? "verified" : ""
    );
    existing.verificationNote = String(authUser.verificationNote || existing.verificationNote || "");
    existing.verifiedAt = String(authUser.verifiedAt || existing.verifiedAt || "");
    existing.verifiedBy = String(authUser.verifiedBy || existing.verifiedBy || "");
    existing.supplierAgreementAccepted = Boolean(
      authUser.supplierAgreementAccepted ?? existing.supplierAgreementAccepted ?? false
    );
    existing.supplierAgreementAcceptedAt = String(
      authUser.supplierAgreementAcceptedAt || existing.supplierAgreementAcceptedAt || ""
    );
    existing.rewardPoints = Math.max(0, Number(authUser.rewardPoints ?? existing.rewardPoints ?? 0));
    existing.totalEarnedPoints = Math.max(0, Number(authUser.totalEarnedPoints ?? existing.totalEarnedPoints ?? existing.rewardPoints ?? 0));
    existing.totalUsedPoints = Math.max(0, Number(authUser.totalUsedPoints ?? existing.totalUsedPoints ?? 0));
    existing.createdAt = String(authUser.createdAt || existing.createdAt || new Date().toISOString());
    existing.id = Math.max(1, Number(authUser.id || existing.id || 1));
  } else {
    state.users.push({
      id: Math.max(1, Number(authUser.id || state.nextUserId || 1)),
      role,
      company: String(authUser.company || ""),
      companyName: String(authUser.companyName || authUser.company || ""),
      registerNumber: String(authUser.registerNumber || ""),
      email,
      password: hashed,
      contactName: String(authUser.contactName || ""),
      contactPersonName: String(authUser.contactPersonName || authUser.contactName || ""),
      phone: String(authUser.phone || ""),
      contactPersonPhone: String(authUser.contactPersonPhone || authUser.phone || ""),
      contactPersonEmail: normalizeEmail(authUser.contactPersonEmail || authUser.email || ""),
      address: String(authUser.address || ""),
      businessType: String(authUser.businessType || ""),
      bankName: String(authUser.bankName || ""),
      bankAccountName: String(authUser.bankAccountName || ""),
      bankAccountMasked: String(authUser.bankAccountMasked || ""),
      qpayReceiverCode: String(authUser.qpayReceiverCode || ""),
      verificationStatus: normalizeSupplierVerificationStatusClient(
        authUser.verificationStatus || "",
        role === "supplier" ? "verified" : ""
      ),
      verificationNote: String(authUser.verificationNote || ""),
      verifiedAt: String(authUser.verifiedAt || ""),
      verifiedBy: String(authUser.verifiedBy || ""),
      supplierAgreementAccepted: Boolean(authUser.supplierAgreementAccepted || false),
      supplierAgreementAcceptedAt: String(authUser.supplierAgreementAcceptedAt || ""),
      rewardPoints: Math.max(0, Number(authUser.rewardPoints || 0)),
      totalEarnedPoints: Math.max(0, Number(authUser.totalEarnedPoints || 0)),
      totalUsedPoints: Math.max(0, Number(authUser.totalUsedPoints || 0)),
      createdAt: String(authUser.createdAt || new Date().toISOString()),
    });
  }

  state.nextUserId = Math.max(Number(state.nextUserId || 1), maxId(state.users) + 1);
}

async function refreshCurrentSessionUserFromApi() {
  if (!state.session?.token) return;

  try {
    const remote = await apiGetCurrentUser();
    if (!remote?.user) return;
    await upsertLocalUserFromAuth(remote.user, "");
    state.session.role = String(remote.user.role || state.session.role || "");
    state.session.company = String(remote.user.company || state.session.company || "");
    saveSession();
  } catch (error) {
    console.warn("Current user sync failed:", error);
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  const role = String(roleInput?.value || "buyer");
  if (authForm && !authForm.checkValidity()) {
    authForm.reportValidity();
    return;
  }

  if (authMode === "register") {
    const company = String(registerCompanyInput?.value || "").trim();
    const contactName = String(registerContactInput?.value || "").trim();
    const email = normalizeEmail(registerEmailInput?.value);
    const phone = String(registerPhoneInput?.value || "").trim();
    const address = String(registerAddressInput?.value || "").trim();
    const registerNumber = String(registerNumberInput?.value || "").trim();
    const contactPersonPhone = String(registerContactPersonPhoneInput?.value || "").trim();
    const contactPersonEmail = normalizeEmail(registerContactPersonEmailInput?.value || "");
    const businessType = String(registerBusinessTypeInput?.value || "").trim();
    const bankName = String(registerBankNameInput?.value || "").trim();
    const bankAccountName = String(registerBankHolderInput?.value || "").trim();
    const bankAccountNumber = String(registerBankAccountInput?.value || "").trim();
    const bankAccount = String(registerBankAccountForBylnInput?.value || "").trim();
    const qpayReceiverCode = String(registerQPayReceiverInput?.value || "").trim();
    const supplierAgreementAccepted = Boolean(registerSupplierAgreementInput?.checked);
    const password = String(registerPasswordInput?.value || "");
    const confirm = String(registerPasswordConfirmInput?.value || "");
    const agreed = Boolean(registerTermsInput?.checked);
    const isSupplier = role === "supplier";

    if (!company || !contactName || !email || !phone || !address || !businessType || !password || !confirm) {
      showToast("Бүртгэлийн бүх талбарыг бөглөнө үү.");
      return;
    }
    if (!email.includes("@")) {
      showToast("Зөв имэйл хаяг оруулна уу.");
      return;
    }
    if (!/^\d{8}$/.test(phone)) {
      showToast("Утасны дугаар 8 оронтой байх ёстой.");
      return;
    }
    if (password.length < 8) {
      showToast("Нууц үг дор хаяж 8 тэмдэгттэй байна.");
      return;
    }
    if (password !== confirm) {
      showToast("Нууц үг хоорондоо таарахгүй байна.");
      return;
    }
    if (!agreed) {
      showToast("Нөхцөлийг зөвшөөрнө үү.");
      return;
    }
    if (isSupplier) {
      if (!bankName || !bankAccountName || !bankAccountNumber) {
        showToast("Нийлүүлэгчийн дансны мэдээллээ бүрэн оруулна уу.");
        return;
      }
      if (bankAccountNumber.replace(/\D/g, "").length < 6) {
        showToast("Дансны дугаараа зөв оруулна уу.");
        return;
      }
      if (!supplierAgreementAccepted) {
        showToast("Нийлүүлэгчийн гэрээ, шилжүүлгийн нөхцөлийг зөвшөөрнө үү.");
        return;
      }
    }
    try {
      const remote = await apiRegister({
        role,
        company,
        email,
        password,
        contactName,
        contactPersonName: contactName,
        phone,
        contactPersonPhone,
        contactPersonEmail,
        address,
        businessType,
        registerNumber,
        bankName,
        bankAccountName,
        bankAccountNumber,
        bankAccount,
        qpayReceiverCode,
        supplierAgreementAccepted,
      });

      if (remote?.user) {
        await upsertLocalUserFromAuth(remote.user, password);
      }

      login(String(remote?.user?.role || role), String(remote?.user?.company || company), String(remote?.token || ""));
      if (isSupplier) {
        showToast("Таны хүсэлт илгээгдлээ. Админ баталгаажуулсны дараа нийлүүлэгчийн эрх идэвхжинэ.");
      }
      closeAuthModal();
      authForm?.reset();
      applyRoleSelection("buyer");
      setAuthMode("login");
      return;
    } catch (error) {
      if (error?.status && error.status < 500) {
        showToast(String(error.message || "Бүртгэх үед алдаа гарлаа."));
        return;
      }
      showToast("Сервертэй холбогдож чадсангүй. Дахин оролдоно уу.");
      return;
    }
    authForm?.reset();
    applyRoleSelection("buyer");
    setAuthMode("login");
    return;
  }

  const email = normalizeEmail(loginEmailInput?.value);
  const password = String(loginPasswordInput?.value || "");
  if (!email || !password) {
    showToast("Имэйл болон нууц үгээ оруулна уу.");
    return;
  }

  try {
    const loginRole = forcedPortalRole === "admin" || role === "admin" || isAdminLoginEmail(email) ? "admin" : role;
    const remote = await apiLogin(loginRole, email, password);
    if (remote?.user) {
      await upsertLocalUserFromAuth(remote.user, password);
    }

    login(String(remote?.user?.role || loginRole), String(remote?.user?.company || ""), String(remote?.token || ""));
    closeAuthModal();
    return;
  } catch (error) {
    if (error?.status && error.status < 500) {
      showToast(String(error.message || "Нэвтрэх мэдээлэл буруу байна."));
      return;
    }
    showToast("Сервертэй холбогдож чадсангүй. Дахин оролдоно уу.");
    return;
  }
}

function login(role, company, token = "") {
  if (isRoleLockedByPortal() && role !== forcedPortalRole && role !== "admin") {
    showToast("Энэ хуудас зөвхөн тухайн хэрэглэгчийн төрөлд зориулагдсан.");
    return;
  }
  const normalizedCompany = safeUiText(company, "").trim();
  state.session = { role, company: normalizedCompany, token: String(token || "") };
  if (!state.carts[normalizedCompany]) state.carts[normalizedCompany] = [];
  saveSession();
  saveState();
  const roleLabel = role === "buyer" ? "ЖДБ" : role === "supplier" ? "Нийлүүлэгч" : "Админ";
  const actionLabel = authMode === "register" ? "бүртгэгдэж" : "нэвтэрч";
  showToast(`${roleLabel} эрхээр ${actionLabel} орлоо.`);
  authMode = "login";
  if (role === "admin") {
    if (redirectToAdminPortal()) return;
  }
  renderApp();
}

function logout() {
  activeCartCouponCode = "";
  activeCartCouponMessage = "";
  activeCartCouponTone = "info";
  activeCartPointsMessage = "";
  activeCartPointsTone = "info";
  lastCartPointsWarningKey = "";
  if (cartCouponInput) cartCouponInput.value = "";
  if (cartPointsInput) cartPointsInput.value = "";
  resetCheckoutFieldValues();
  closeCartDrawer();
  closeQPayModal();
  closeProfileModal();
  closeNotificationPanel();
  state.session = null;
  clearSession();
  saveState();
  if (isRoleLockedByPortal()) {
    window.location.assign("index.html");
    return;
  }
  closeAuthModal();
  renderApp();
}

function renderApp() {
  const session = state.session;
  const sessionRole = String(session?.role || "");
  const portalRole = isRoleLockedByPortal() ? forcedPortalRole : "";
  if (!portalRole && sessionRole === "admin") {
    if (redirectToAdminPortal()) return;
  }
  const effectiveRole = portalRole && sessionRole !== portalRole ? "" : sessionRole;
  const isAdminPortal = portalRole === "admin";
  const isAdmin = effectiveRole === "admin";

  if (isAdminPortal) {
    setElementHidden(buyerView, true);
    setElementHidden(adminView, false);
    if (isAdmin) {
      closeAuthModal();
      renderAdminPanel();
    } else {
      if (adminSessionLabel) adminSessionLabel.textContent = "Админ нэвтрэлт шаардлагатай";
      if (authView?.classList.contains("hidden")) openAuthModal("login");
    }
    repairDomMojibake(document.body);
    return;
  }

  const marketRole = effectiveRole === "supplier" ? "supplier" : effectiveRole === "buyer" ? "buyer" : "guest";
  setElementHidden(buyerView, false);
  setElementHidden(adminView, true);

  renderMarketRoleUI(marketRole);
  renderNotifications();
  renderBuyerMarketplace();
  renderBuyerStats();
  renderBuyerRewardPanel();
  renderCart();
  renderBuyerOrdersPanel();
  if (marketRole === "supplier") renderSupplierTopPanel();

  if (portalRole && marketRole === "guest" && authView?.classList.contains("hidden")) {
    openAuthModal("login");
  }
  repairDomMojibake(document.body);
}

function getAllCategories() {
  const fromProducts = Array.from(new Set(state.products.map((item) => String(item.category || "other").toLowerCase())));
  const ordered = CATEGORY_ORDER.filter((category) => fromProducts.includes(category));
  const extra = fromProducts.filter((category) => !CATEGORY_ORDER.includes(category));
  return [...ordered, ...extra];
}

function getCategoryLabel(category) {
  return CATEGORY_LABELS[category] || toTitleCase(category);
}

function getCategoryIcon(category) {
  return CATEGORY_ICONS[category] || "\u{1F4E6}";
}

function toTitleCase(text) {
  const str = String(text || "");
  if (!str) return "Бусад";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function renderBuyerStats() {
  const products = state.products.filter((item) => item.stock > 0);
  const supplierSet = new Set(products.map((item) => item.supplierCompany));
  const pendingOrders = state.orders.filter((order) => normalizeOrderStatus(order.status) === "Шинэ");
  const noticeCount = Array.isArray(state.announcements) ? state.announcements.length : 0;
  animateHeroCount(statProducts, products.length);
  animateHeroCount(statSuppliers, supplierSet.size);
  animateHeroCount(statOrders, state.orders.length);
  animateHeroCount(statPendingOrders, pendingOrders.length);
  if (heroDashboardBadge) {
    heroDashboardBadge.textContent = String(noticeCount);
  }
}

function renderBuyerRewardPanel() {
  if (!buyerRewardPanel) return;

  const session = state.session;
  const isBuyer = Boolean(session && String(session.role || "").toLowerCase() === "buyer");
  buyerRewardPanel.classList.toggle("hidden", !isBuyer);
  if (!isBuyer) return;

  const rewardUser = getCurrentBuyerRewardUser();
  if (!rewardUser) {
    buyerRewardPanel.classList.add("hidden");
    return;
  }

  const buyerOrders = (state.orders || []).filter((order) => isSameCompany(order.buyerCompany, session.company));
  const pendingRewardOrders = buyerOrders.filter((order) => {
    const normalizedOrder = normalizeOrderForUi(order);
    return normalizedOrder.rewardStatus !== "earned" && isPaymentCompleted(normalizedOrder.paymentStatus);
  }).length;

  if (buyerRewardPoints) buyerRewardPoints.textContent = formatMoney(Number(rewardUser.rewardPoints || 0));
  if (buyerRewardTotalEarned) {
    buyerRewardTotalEarned.textContent = `${Math.max(0, Number(rewardUser.totalEarnedPoints || 0)).toLocaleString("mn-MN")} оноо`;
  }
  if (buyerRewardTotalUsed) {
    buyerRewardTotalUsed.textContent = `${Math.max(0, Number(rewardUser.totalUsedPoints || 0)).toLocaleString("mn-MN")} оноо`;
  }
  if (buyerRewardHint) {
    buyerRewardHint.textContent =
      pendingRewardOrders > 0
        ? `${pendingRewardOrders} захиалгын бонус хүлээгдэж байна. Хүргэлт хүлээн авсны дараа автоматаар нэмэгдэнэ.`
        : "Checkout дээр бонус болон купон кодоо ашиглаад захиалгын дүнгээ бууруулна.";
  }
}

function animateHeroCount(element, value) {
  if (!element) return;
  const targetValue = Number(value) || 0;
  const previousTarget = Number(element.dataset.targetValue || "-1");

  if (previousTarget === targetValue) {
    element.textContent = String(targetValue);
    element.dataset.currentValue = String(targetValue);
    return;
  }

  const startValue = Number(element.dataset.currentValue || element.textContent.replace(/[^\d.-]/g, "")) || 0;
  const duration = 720;
  const startTime = performance.now();

  element.dataset.targetValue = String(targetValue);

  function tick(now) {
    if (Number(element.dataset.targetValue || "-1") !== targetValue) return;
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const nextValue = Math.round(startValue + (targetValue - startValue) * eased);
    element.textContent = String(nextValue);
    element.dataset.currentValue = String(nextValue);
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

function renderMarketRoleUI(role) {
  const portalRole = isRoleLockedByPortal() ? forcedPortalRole : "";
  const supplierPortalMode = portalRole === "supplier";
  const isSupplier = role === "supplier";
  const isBuyer = role === "buyer";
  const isGuest = role === "guest";

  const showSupplierUi = portalRole ? portalRole === "supplier" && isSupplier : isSupplier;
  const showBuyerUi = portalRole ? portalRole === "buyer" && isBuyer : isBuyer;
  const showGuestUi = portalRole ? isGuest : isGuest;
  const showSupplierSidePanel = Boolean(state.session && showSupplierUi);
  const showProfileUi = Boolean(state.session && (showSupplierUi || showBuyerUi));

  if (marketSessionBadge) {
    const hasSessionBadge = Boolean(state.session && (showSupplierUi || showBuyerUi));
    marketSessionBadge.classList.toggle("hidden", !hasSessionBadge);
    if (hasSessionBadge) {
      marketSessionBadge.textContent = `${showSupplierUi ? "\u041d\u0438\u0439\u043b\u04af\u04af\u043b\u044d\u0433\u0447" : "\u0416\u0414\u0411"}: ${state.session.company}`;
    }
  }
  openProfileBtn?.classList.toggle("hidden", !showProfileUi);
  if (!showProfileUi && profileModal && !profileModal.classList.contains("hidden")) {
    closeProfileModal();
  }

  toggleBuyerOrdersBtn?.classList.add("hidden");

  openCartBtn?.classList.toggle("hidden", !showBuyerUi);
  supplierTopPanel?.classList.toggle("hidden", !showSupplierUi);
  faqSection?.classList.toggle("hidden", showSupplierSidePanel);
  guestShowcase?.classList.toggle("hidden", !showGuestUi);
  const showSupplierDiscovery = supplierPortalMode ? showSupplierUi || showGuestUi : true;
  homeDiscovery?.classList.toggle("hidden", !showSupplierDiscovery);
  buyerHero?.classList.toggle("hidden", supplierPortalMode);
  buyerCategoriesBar?.classList.toggle("hidden", supplierPortalMode);
  productSections?.classList.toggle("hidden", supplierPortalMode);
  if (productSearch) productSearch.disabled = supplierPortalMode;
  logoutMarketBtn?.classList.toggle("hidden", isGuest);
  openLoginBtn?.classList.toggle("hidden", !isGuest);
  openRegisterBtn?.classList.toggle("hidden", !isGuest || (portalRole && portalRole !== "buyer"));

  if (showBuyerUi && !buyerOrdersInitialized) {
    buyerOrdersOpen = true;
    buyerOrdersInitialized = true;
  }

  if (!showBuyerUi) {
    buyerOrdersOpen = false;
    buyerOrdersInitialized = false;
    closeCartDrawer();
  }

  toggleBuyerOrdersBtn?.setAttribute("aria-expanded", showBuyerUi && buyerOrdersOpen ? "true" : "false");
}

function renderSupplierTopPanel() {
  if (!supplierInlineProducts || !supplierInlineOrders || !state.session) return;
  const supplierUser = getCurrentSessionUser();
  const verificationStatus = normalizeSupplierVerificationStatusClient(supplierUser?.verificationStatus, "pending");
  const canManageSupplier = verificationStatus === "verified";
  const supplierOrderHead = supplierTopPanel?.querySelector(".supplier-order-head");
  const useSideRailOrders = Boolean(state.session?.role === "supplier" && homeDiscovery && !homeDiscovery.classList.contains("hidden"));
  supplierOrderHead?.classList.toggle("hidden", useSideRailOrders);
  supplierInlineOrders?.classList.toggle("hidden", useSideRailOrders);
  if (supplierVerificationBanner) {
    const isVerified = verificationStatus === "verified";
    const bannerTone = verificationStatus;
    supplierVerificationBanner.className = `supplier-verification-banner supplier-verification-banner--${bannerTone}`;
    supplierVerificationBanner.innerHTML = `
      <div class="supplier-verification-copy">
        <strong>${escapeHtml(isVerified ? "Нийлүүлэгч баталгаажсан" : "Нийлүүлэгчийн баталгаажуулалт")}</strong>
        <p>${escapeHtml(getSupplierVerificationBannerText(verificationStatus))}</p>
        ${
          supplierUser?.verificationNote && !isVerified
            ? `<small class="muted">${escapeHtml(supplierUser.verificationNote)}</small>`
            : ""
        }
      </div>
      <span class="supplier-verification-pill verification-badge verification-badge--${bannerTone}">${escapeHtml(
        getSupplierVerificationLabel(verificationStatus)
      )}</span>
    `;
    setElementHidden(supplierVerificationBanner, false);
  }
  if (openAddProductFromPanelBtn) {
    openAddProductFromPanelBtn.disabled = !canManageSupplier;
    openAddProductFromPanelBtn.title = canManageSupplier
      ? ""
      : "Нийлүүлэгчийн эрх баталгаажсаны дараа бараа нэмнэ";
  }
  const sessionCompany = state.session.company;
  const items = state.products
    .filter((item) => isSameCompany(item.supplierCompany, sessionCompany))
    .sort((a, b) => b.id - a.id);

  if (items.length === 0) {
    supplierInlineProducts.innerHTML = renderEmptyState(
      "Бараа бүртгэгдээгүй байна",
      "Эхний бараагаа нэмээд худалдан авагчдад харагдуулна уу.",
      "Шинэ бараа нэмэх",
      "open-add-product"
    );
  } else {
    supplierInlineProducts.innerHTML = items
      .map((item) => {
        const image = String(item.image || DEFAULT_IMAGES[item.category] || DEFAULT_IMAGES.default);
        const stockStatus = item.stock > item.minOrder ? "in-stock" : "low-stock";
        return `
          <article class="inline-product">
            <div class="inline-product-main">
              <img class="inline-product-thumb" src="${escapeAttr(image)}" alt="${escapeAttr(item.name)}" loading="lazy">
              <div class="inline-product-info">
                <strong class="product-name">${escapeHtml(item.name)}</strong>
                <div class="product-meta-row">
                  <span class="category-badge">${escapeHtml(getCategoryLabel(item.category))}</span>
                  <span class="price-highlight">${formatMoney(item.price)}/${escapeHtml(item.unit)}</span>
                </div>
                <div class="product-meta-row">
                  <span class="meta-label">Мин: ${item.minOrder} ${escapeHtml(item.unit)}</span>
                  <span class="stock-badge stock-badge--${stockStatus}">${item.stock} ${escapeHtml(item.unit)}</span>
                </div>
              </div>
            </div>
            <div class="table-actions">
              <button class="product-btn product-btn--dec" type="button" data-action="stock-dec" data-product-id="${item.id}" title="−1" ${canManageSupplier ? "" : "disabled"}>−</button>
              <button class="product-btn product-btn--inc" type="button" data-action="stock-inc" data-product-id="${item.id}" title="+1" ${canManageSupplier ? "" : "disabled"}>+</button>
              <button class="product-btn product-btn--delete" type="button" data-action="product-delete" data-product-id="${item.id}" ${canManageSupplier ? "" : "disabled"}>🗑️</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  if (useSideRailOrders) {
    supplierInlineOrders.innerHTML = "";
    return;
  }

  const orders = state.orders
    .filter((order) => isSameCompany(order.supplierCompany, sessionCompany))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (orders.length === 0) {
    const otherSupplierOrders = state.orders.filter((order) => !isSameCompany(order.supplierCompany, sessionCompany));
    const otherSupplierNames = Array.from(
      new Set(otherSupplierOrders.map((order) => safeUiText(order.supplierCompany, "Нийлүүлэгч")).filter(Boolean))
    )
      .slice(0, 3)
      .join(", ");
    const extraHint =
      otherSupplierOrders.length > 0
        ? `Одоогоор ${otherSupplierOrders.length} захиалга бусад нийлүүлэгч дээр байна (${escapeHtml(
            otherSupplierNames || "бусад"
          )}).`
        : "Одоогоор системд шинэ захиалга алга.";
    supplierInlineOrders.innerHTML = renderEmptyState(
      "Одоогоор танай компанид шинэ захиалга алга",
      `Нэвтэрсэн компани: ${escapeHtml(sessionCompany)}. ${extraHint}`
    );
    return;
  }

  const normalizedOrders = orders.map((order) => normalizeOrderForUi(order));
  const pendingOrders = normalizedOrders.filter((order) => order.status === "Шинэ");
  const otherOrders = normalizedOrders.filter((order) => order.status !== "Шинэ");

  supplierInlineOrders.innerHTML = `
    <section class="supplier-order-group">
      <div class="supplier-order-group-head">
        <h5>Баталгаажуулах захиалга</h5>
        <span class="supplier-order-count">${pendingOrders.length}</span>
      </div>
      ${
        pendingOrders.length
          ? `<div class="stack supplier-order-stack">${pendingOrders.map(renderSupplierOrderCard).join("")}</div>`
          : `<p class="muted">Шинэ захиалга алга.</p>`
      }
    </section>
    <section class="supplier-order-group">
      <div class="supplier-order-group-head">
        <h5>Бусад захиалгын явц</h5>
        <span class="supplier-order-count">${otherOrders.length}</span>
      </div>
      ${
        otherOrders.length
          ? `<div class="stack supplier-order-stack">${otherOrders.map(renderSupplierOrderCard).join("")}</div>`
          : `<p class="muted">Одоогоор бусад явцын захиалга алга.</p>`
      }
    </section>
  `;
}

function getFilteredBuyerProducts() {
  const query = String(productSearch?.value || "").trim().toLowerCase();
  return state.products
    .filter((item) => item.stock > 0)
    .filter((item) => (selectedCategory === "all" ? true : item.category === selectedCategory))
    .filter((item) => {
      if (!query) return true;
      const haystack = `${item.name} ${item.supplierCompany} ${getCategoryLabel(item.category)}`.toLowerCase();
      return haystack.includes(query);
    });
}

function getFeaturedBuyerProducts(filteredProducts = []) {
  return [...filteredProducts]
    .sort((a, b) => {
      const stockGap = Number(b.stock || 0) - Number(a.stock || 0);
      if (stockGap !== 0) return stockGap;
      const minOrderGap = Number(a.minOrder || 0) - Number(b.minOrder || 0);
      if (minOrderGap !== 0) return minOrderGap;
      return Number(a.price || 0) - Number(b.price || 0);
    })
    .slice(0, 4);
}

function renderMarketplaceProductAction(item, options = {}) {
  const {
    buyerLabel = "Сагсанд нэмэх",
    guestLabel = "Нэвтэрч захиална",
    viewerLabel = "Зөвхөн харах горим",
  } = options;

  const isBuyer = state.session?.role === "buyer";
  const isSupplierOwner =
    state.session?.role === "supplier" && isSameCompany(item.supplierCompany, state.session?.company);

  if (isBuyer) {
    return `<button class="btn btn-primary block" type="button" data-action="add-cart" data-product-id="${item.id}">${buyerLabel}</button>`;
  }

  if (isSupplierOwner) {
    return `
      <div class="table-actions table-actions--single">
        <button class="btn btn-light block" type="button" data-action="product-delete" data-product-id="${item.id}" ${isSupplierVerifiedUser() ? "" : "disabled"}>Устгах</button>
      </div>
    `;
  }

  return `<button class="btn btn-light block" type="button" disabled>${state.session ? viewerLabel : guestLabel}</button>`;
}

function renderSpotlightCategories(filteredProducts = []) {
  if (!spotlightCategories) return;

  const categoryCounts = filteredProducts.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  const cards = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([category, count]) => {
      const activeClass = category === selectedCategory ? "active" : "";
      return `
        <button class="spotlight-category-card ${activeClass}" type="button" data-action="category-select" data-category="${escapeAttr(category)}">
          <span class="spotlight-category-icon" aria-hidden="true">${escapeHtml(getCategoryIcon(category))}</span>
          <span class="spotlight-category-copy">
            <strong>${escapeHtml(getCategoryLabel(category))}</strong>
            <small>${count} бараа</small>
          </span>
        </button>
      `;
    })
    .join("");

  spotlightCategories.classList.toggle("hidden", !cards);
  spotlightCategories.innerHTML = cards;
}

function renderFeaturedProductCard(item) {
  const imageSource = item.image || DEFAULT_IMAGES.default;
  return `
    <article class="featured-card">
      <div class="featured-card-media">
        <img src="${escapeAttr(imageSource)}" alt="${escapeAttr(item.name)}">
        <span class="featured-badge">${escapeHtml(getCategoryLabel(item.category))}</span>
      </div>
      <div class="featured-card-body">
        <div class="featured-card-top">
          <div>
            <h5>${escapeHtml(item.name)}</h5>
            <p>${escapeHtml(item.supplierCompany)}</p>
          </div>
          <span class="stock-tag in-stock">Нөөц: ${item.stock}</span>
        </div>
        <div class="featured-card-meta">
          <span>Мин: ${item.minOrder} ${escapeHtml(item.unit)}</span>
          <span>${escapeHtml(getCategoryLabel(item.category))}</span>
        </div>
        <div class="featured-card-price">
          <strong>${formatMoney(item.price)}</strong>
          <span>/${escapeHtml(item.unit)}</span>
        </div>
        ${renderMarketplaceProductAction(item, { buyerLabel: "Шууд сагслах" })}
      </div>
    </article>
  `;
}

function renderHomeDiscovery(filteredProducts = []) {
  if (!featuredProductsSection) return;

  renderSpotlightCategories(filteredProducts);
  const featuredProducts = getFeaturedBuyerProducts(filteredProducts);

  featuredProductsSection.innerHTML = featuredProducts.length
    ? featuredProducts.map((item) => renderFeaturedProductCard(item)).join("")
    : `
      <article class="featured-empty">
        <strong>Онцлох бараа олдсонгүй.</strong>
        <span>Хайлтын үг эсвэл ангиллаа өөрчлөөд дахин оролдоно уу.</span>
      </article>
    `;
}

function renderBuyerMarketplace() {
  renderCategoryNav();
  renderFooterCategories();
  const filtered = getFilteredBuyerProducts();
  renderHomeDiscovery(filtered);
  const grouped = filtered.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const categoryOrder = selectedCategory === "all" ? getAllCategories() : [selectedCategory];
  const sections = categoryOrder
    .filter((category) => grouped[category] && grouped[category].length > 0)
    .map((category) => {
      const products = grouped[category];
      return `
        <section class="product-section">
          <div class="section-head">
            <h4>${escapeHtml(getCategoryLabel(category))}</h4>
            <p>${products.length} бараа</p>
          </div>
          <div class="product-grid">
            ${products.map(renderProductCard).join("")}
          </div>
        </section>
      `;
    })
    .join("");

  if (productSections) {
    productSections.innerHTML =
      sections ||
      `<div class="panel"><div class="stack">${renderEmptyState("Илэрц олдсонгүй", "Хайлтын үг эсвэл ангиллаа өөрчлөөд дахин оролдоно уу.", "Шүүлтүүр цэвэрлэх", "clear-filters")}</div></div>`;
  }
}

function renderProductCard(item) {
  const minOrderText = `Мин: ${item.minOrder} ${item.unit}`;
  const actionButton = renderMarketplaceProductAction(item);
  return `
    <article class="product-card">
      <div class="product-thumb">
        <img src="${escapeAttr(item.image || DEFAULT_IMAGES.default)}" alt="${escapeAttr(item.name)}">
      </div>
      <div class="product-body">
        <span class="small">${escapeHtml(getCategoryLabel(item.category))}</span>
        <h5 class="product-title">${escapeHtml(item.name)}</h5>
        <span class="small">${escapeHtml(item.supplierCompany)}</span>
        <div class="price-row">
          <strong>${formatMoney(item.price)}</strong>
          <span class="small">/${escapeHtml(item.unit)}</span>
        </div>
        <div class="meta-row">
          <span>${minOrderText}</span>
          <span class="stock-tag in-stock">Нөөц: ${item.stock}</span>
        </div>
        ${actionButton}
      </div>
    </article>
  `;
}

function renderCategoryNav() {
  if (!categoryNav) return;
  const categories = getAllCategories();
  const chips = [
    { key: "all", label: "\u0411\u04AE\u0413\u0414" },
    ...categories.map((category) => ({ key: category, label: getCategoryLabel(category) })),
  ];
  categoryNav.innerHTML = chips
    .map((chip) => {
      const activeClass = chip.key === selectedCategory ? "active" : "";
      return `
        <button class="category-chip ${activeClass}" type="button" data-action="category-select" data-category="${chip.key}">
          <span class="chip-icon" aria-hidden="true">${escapeHtml(getCategoryIcon(chip.key))}</span>
          <span class="chip-label">${escapeHtml(chip.label)}</span>
        </button>
      `;
    })
    .join("");
}

function renderFooterCategories() {
  if (!footerCategories) return;
  const categories = getAllCategories().slice(0, 5);
  footerCategories.innerHTML = categories.map((category) => `<li>${escapeHtml(getCategoryLabel(category))}</li>`).join("");
}

function scrollToProducts() {
  if (!productSections) return;
  productSections.scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearBuyerFilters() {
  selectedCategory = "all";
  if (productSearch) productSearch.value = "";
  renderBuyerMarketplace();
  scrollToProducts();
}

function getCurrentCart() {
  const session = state.session;
  if (!session) return [];
  if (!state.carts[session.company]) state.carts[session.company] = [];
  return state.carts[session.company];
}

function addToCart(productId) {
  const session = state.session;
  if (!session || session.role !== "buyer") return;
  const product = state.products.find((item) => item.id === productId);
  if (!product || product.stock <= 0) return;

  const cart = getCurrentCart();
  const current = cart.find((line) => line.productId === productId);
  const step = product.minOrder || 1;
  const nextQty = (current?.qty || 0) + step;

  if (nextQty > product.stock) {
    showToast("Үлдэгдлээс их хэмжээгээр сагслах боломжгүй.");
    return;
  }

  if (current) current.qty = nextQty;
  else cart.push({ productId, qty: step });

  saveState();
  renderCart();
  showToast("Сагсанд нэмэгдлээ.");
}

function updateCartQty(productId, direction) {
  const cart = getCurrentCart();
  const line = cart.find((item) => item.productId === productId);
  if (!line) return;

  const product = state.products.find((item) => item.id === productId);
  if (!product) return;

  const step = product.minOrder || 1;
  const nextQty = line.qty + direction * step;

  if (nextQty <= 0) {
    removeFromCart(productId);
    return;
  }
  if (nextQty > product.stock) {
    showToast("Үлдэгдлээс давсан тоо.");
    return;
  }

  line.qty = nextQty;
  saveState();
  renderCart();
}

function removeFromCart(productId) {
  const session = state.session;
  if (!session) return;
  const cart = getCurrentCart();
  state.carts[session.company] = cart.filter((line) => line.productId !== productId);
  saveState();
  renderCart();
}

function renderCart() {
  ensureCheckoutFieldDefaults();
  const cart = getCurrentCart();
  const items = cart
    .map((line) => {
      const product = state.products.find((item) => item.id === line.productId);
      if (!product) return null;
      return {
        product,
        qty: line.qty,
        subtotal: line.qty * product.price,
      };
    })
    .filter(Boolean);

  const pricing = buildCartPricingSummary(items);

  if (cartCount) cartCount.textContent = String(items.length);
  if (drawerItemCount) drawerItemCount.textContent = `${items.length} бараа`;
  if (cartSubtotal) cartSubtotal.textContent = formatMoney(pricing.subtotal);
  if (cartDelivery) cartDelivery.textContent = pricing.delivery === 0 ? "Үнэгүй" : formatMoney(pricing.delivery);
  if (cartDiscount) cartDiscount.textContent = `-${formatMoney(pricing.discountAmount)}`;
  if (cartUsedPoints) cartUsedPoints.textContent = `-${formatMoney(pricing.usedPoints)}`;
  if (cartEarnedPoints) cartEarnedPoints.textContent = `${pricing.earnedPoints.toLocaleString("mn-MN")} оноо`;
  if (cartRewardBalance) cartRewardBalance.textContent = formatMoney(pricing.rewardBalance);
  if (cartPlatformFee) cartPlatformFee.textContent = formatMoney(pricing.platformFee);
  if (cartSupplierPayout) cartSupplierPayout.textContent = formatMoney(pricing.supplierPayout);
  if (cartTotal) cartTotal.textContent = formatMoney(pricing.finalAmount);
  if (cartFlowHint) {
    cartFlowHint.textContent =
      "Subtotal, купон, бонус, final дүн автоматаар тооцогдоно.";
  }
  if (cartCouponInput && document.activeElement !== cartCouponInput) {
    cartCouponInput.value = activeCartCouponCode;
  }
  if (cartCouponStatus) {
    cartCouponStatus.textContent = pricing.couponMessage || activeCartCouponMessage || "Промо кодыг энд шалгаж хэрэглэнэ.";
    setInlineStatusTone(cartCouponStatus, pricing.appliedCoupon ? "success" : activeCartCouponTone);
  }
  if (cartPointsStatus) {
    const defaultPointsMessage = "Ашигласан бонус нь захиалгын дүнгээс хасагдана.";
    cartPointsStatus.textContent = activeCartPointsMessage || defaultPointsMessage;
    setInlineStatusTone(cartPointsStatus, activeCartPointsMessage ? activeCartPointsTone : "info");
  }
  if (cartPointsInput) {
    const maxPoints = Math.max(0, Math.min(pricing.rewardBalance, pricing.subtotal - pricing.discountAmount));
    cartPointsInput.max = String(maxPoints);
    if (document.activeElement !== cartPointsInput) {
      cartPointsInput.value = pricing.usedPoints > 0 ? String(pricing.usedPoints) : "";
    }
  }
  if (applyCouponBtn) {
    applyCouponBtn.disabled = items.length === 0 || checkoutInProgress;
  }
  if (useMaxPointsBtn) {
    useMaxPointsBtn.disabled = items.length === 0 || pricing.rewardBalance <= 0;
  }
  if (checkoutBtn) {
    checkoutBtn.disabled = items.length === 0 || checkoutInProgress;
    checkoutBtn.textContent = checkoutInProgress ? "QPay QR бэлдэж байна..." : "Сагсаас QPay төлөх";
  }

  if (!cartItems) return;

  if (items.length === 0) {
    cartItems.innerHTML = renderEmptyState(
      "Сагс хоосон байна",
      "Бараа жагсаалтаас бүтээгдэхүүнээ сонгож сагсандаа нэмнэ үү.",
      "Бараа үзэх",
      "scroll-products"
    );
    repairDomMojibake(cartDrawer || cartItems);
    return;
  }

  cartItems.innerHTML = items
    .map((line) => {
      const { product, qty, subtotal: lineSum } = line;
      const imageSource = isValidImageSource(product.image)
        ? product.image
        : DEFAULT_IMAGES[product.category] || DEFAULT_IMAGES.default;
      return `
        <div class="cart-line">
          <div class="cart-line-media">
            <img src="${escapeAttr(imageSource)}" alt="${escapeAttr(product.name)}">
          </div>
          <div class="cart-line-main">
            <div class="cart-line-head">
              <strong class="cart-line-name">${escapeHtml(product.name)}</strong>
              <span class="cart-line-sum">${formatMoney(lineSum)}</span>
            </div>
            <div class="cart-line-meta muted">${formatMoney(product.price)} / ${escapeHtml(product.unit)} | Мин: ${product.minOrder} ${escapeHtml(product.unit)}</div>
            <div class="cart-line-actions">
              <div class="qty-controls">
                <button type="button" data-action="cart-dec" data-product-id="${product.id}" aria-label="Тоо хасах">-</button>
                <button type="button" class="qty-value" disabled aria-label="Тоо">${qty}</button>
                <button type="button" data-action="cart-inc" data-product-id="${product.id}" aria-label="Тоо нэмэх">+</button>
              </div>
              <button class="btn btn-light cart-remove-btn" type="button" data-action="cart-remove" data-product-id="${product.id}">Устгах</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  repairDomMojibake(cartDrawer || cartItems);
}

function openCartDrawer() {
  ensureCheckoutFieldDefaults();
  setElementHidden(cartOverlay, false);
  setElementHidden(cartDrawer, false);
  openCartBtn?.setAttribute("aria-expanded", "true");
}

function closeCartDrawer() {
  setElementHidden(cartOverlay, true);
  setElementHidden(cartDrawer, true);
  openCartBtn?.setAttribute("aria-expanded", "false");
}

function openAddProductModal() {
  const session = state.session;
  if (!session || session.role !== "supplier") return;
  if (!ensureVerifiedSupplierAccess("Бараа нэмэх")) return;
  populateProductCategoryOptions();
  setProductImagePreview("");
  if (productImageFileInput) productImageFileInput.value = "";
  setElementHidden(addProductModal, false);
}

function closeAddProductModal() {
  setProductImagePreview("");
  setElementHidden(addProductModal, true);
}

function getAvailableProductCategories() {
  const known = [...CATEGORY_ORDER];
  const fromProducts = Array.from(
    new Set(
      (state.products || [])
        .map((item) => normalizeCategory(item.category))
        .filter(Boolean)
    )
  );
  const extras = fromProducts.filter((category) => !known.includes(category));
  return [...known, ...extras];
}

function populateProductCategoryOptions(selectedValue = "") {
  if (!productCategoryInput) return;
  const categories = getAvailableProductCategories();
  const selected = normalizeCategory(selectedValue || productCategoryInput.value || "");
  const options = [
    `<option value="">Сонгох</option>`,
    ...categories.map((category) => {
      const selectedAttr = category === selected ? " selected" : "";
      return `<option value="${escapeAttr(category)}"${selectedAttr}>${escapeHtml(getCategoryLabel(category))}</option>`;
    }),
  ];
  productCategoryInput.innerHTML = options.join("");
  if (!selected && categories.length > 0) {
    productCategoryInput.value = categories[0];
  }
}

function isValidImageSource(value) {
  const src = String(value || "").trim();
  if (!src) return false;
  if (src.startsWith("data:image/")) return true;
  try {
    const parsed = new URL(src);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Зураг файл уншихад алдаа гарлаа."));
    reader.readAsDataURL(file);
  });
}

async function resolveProductImage(category) {
  const file = productImageFileInput?.files?.[0];
  const manualUrl = String(productImageUrlInput?.value || "").trim();

  if (file) {
    if (!String(file.type || "").startsWith("image/")) {
      throw new Error("Зөвхөн зураг файл оруулна уу.");
    }
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      throw new Error("Зургийн хэмжээ 2MB-аас бага байх ёстой.");
    }
    const dataUrl = await readImageFileAsDataUrl(file);
    if (!isValidImageSource(dataUrl)) {
      throw new Error("Зургийн файл буруу форматтай байна.");
    }
    return dataUrl;
  }

  if (manualUrl) {
    if (!isValidImageSource(manualUrl)) {
      throw new Error("Зургийн URL буруу байна.");
    }
    return manualUrl;
  }

  return DEFAULT_IMAGES[category] || DEFAULT_IMAGES.default;
}

function setProductImagePreview(source) {
  if (!productImagePreviewWrap || !productImagePreview) return;
  const src = String(source || "").trim();
  if (!src) {
    productImagePreview.removeAttribute("src");
    productImagePreviewWrap.classList.add("hidden");
    return;
  }
  productImagePreview.src = src;
  productImagePreviewWrap.classList.remove("hidden");
}

async function updateProductImagePreview() {
  const file = productImageFileInput?.files?.[0];
  if (file) {
    if (!String(file.type || "").startsWith("image/")) {
      showToast("Зөвхөн зураг файл сонгоно уу.");
      if (productImageFileInput) productImageFileInput.value = "";
      setProductImagePreview("");
      return;
    }
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      showToast("Зургийн хэмжээ 2MB-аас бага байх ёстой.");
      if (productImageFileInput) productImageFileInput.value = "";
      setProductImagePreview("");
      return;
    }
    const dataUrl = await readImageFileAsDataUrl(file);
    setProductImagePreview(dataUrl);
    return;
  }

  const manualUrl = String(productImageUrlInput?.value || "").trim();
  if (manualUrl && isValidImageSource(manualUrl)) {
    setProductImagePreview(manualUrl);
    return;
  }
  setProductImagePreview("");
}

function findOrderById(orderId) {
  const id = Math.max(1, Number(orderId || 0) || 0);
  if (!id) return null;
  return (state.orders || []).find((row) => Number(row?.id || 0) === id) || null;
}

function stopQPayStatusPolling() {
  if (!qpayStatusPollingTimer) return;
  clearInterval(qpayStatusPollingTimer);
  qpayStatusPollingTimer = null;
}

function closeQPayModal() {
  stopQPayStatusPolling();
  setElementHidden(qpayModal, true);
  activeQPayOrderQueue = [];
  activeQPayOrderId = 0;
  activeQPayInvoiceId = "";
}

function stopBylnStatusPolling() {
  if (!bylnStatusPollingTimer) return;
  clearInterval(bylnStatusPollingTimer);
  bylnStatusPollingTimer = null;
}

function closeBylnModal() {
  stopBylnStatusPolling();
  setElementHidden(bylnModal, true);
  activeBylnOrderQueue = [];
  activeBylnOrderId = 0;
  activeBylnInvoiceId = "";
}

function openQPayModal(order, queueOrderIds = []) {
  if (!qpayModal || !order) return;

  activeQPayOrderQueue = Array.isArray(queueOrderIds) ? [...queueOrderIds] : [];
  activeQPayOrderId = Number(order.id || 0);
  activeQPayInvoiceId = String(order.qpayInvoiceId || "").trim();

  if (qpayModalTitle) qpayModalTitle.textContent = "QPay төлбөр";
  if (qpayModalOrder) qpayModalOrder.textContent = `Захиалга #${order.id}`;
  if (qpayModalSupplier) qpayModalSupplier.textContent = String(order.supplierCompany || "");
  if (qpayModalAmount) qpayModalAmount.textContent = formatMoney(getOrderPayableAmountClient(order));
  if (qpayModalInvoice) qpayModalInvoice.textContent = order.qpayInvoiceNo || activeQPayInvoiceId || "-";
  if (qpayQrText) qpayQrText.textContent = order.qpayQrText || "";
  if (qpayQrImage) {
    const fallbackQr = order.qpayQrText
      ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(order.qpayQrText)}`
      : "";
    qpayQrImage.src = order.qpayQrImage || fallbackQr;
  }
  if (qpayPayLink) {
    const href = order.qpayDeepLink || order.qpayWebUrl || "";
    if (href) {
      qpayPayLink.setAttribute("href", href);
      qpayPayLink.classList.remove("hidden");
    } else {
      qpayPayLink.setAttribute("href", "#");
      qpayPayLink.classList.add("hidden");
    }
  }
  if (qpayMockPayBtn) {
    qpayMockPayBtn.classList.toggle("hidden", String(order.qpayMode || "").toLowerCase() === "live");
  }

  setElementHidden(qpayModal, false);
  stopQPayStatusPolling();
  if (activeQPayInvoiceId) {
    qpayStatusPollingTimer = setInterval(() => {
      void checkActiveQPayInvoiceStatus(true);
    }, 5000);
  }
}

function applyInvoiceToLocalOrder(orderId, invoice = {}) {
  const order = findOrderById(orderId);
  if (!order) return null;

  order.paymentMethod = "supplier_qpay";
  order.qpayInvoiceId = String(invoice.invoiceId || "").trim();
  order.qpayInvoiceNo = String(invoice.invoiceNo || "").trim();
  order.qpayQrText = String(invoice.qrText || "").trim();
  order.qpayQrImage = String(invoice.qrImage || "").trim();
  order.qpayDeepLink = String(invoice.deepLink || "").trim();
  order.qpayWebUrl = String(invoice.webUrl || "").trim();
  order.qpayReceiverCode = String(invoice.receiverCode || "").trim();
  order.qpayMode = String(invoice.mode || "mock").trim();
  order.qpayStatus = "PENDING";
  order.paymentRequestedAt = new Date().toISOString();
  return order;
}

// Был.mn төлбөрийн функцүүд
function applyBylnInvoiceToLocalOrder(orderId, invoice = {}) {
  const order = findOrderById(orderId);
  if (!order) return null;

  order.paymentMethod = "supplier_byl";
  order.bylnInvoiceId = String(invoice.invoiceId || "").trim();
  order.bylnInvoiceNo = String(invoice.invoiceNo || "").trim();
  order.bylnInvoiceUrl = String(invoice.invoiceUrl || "").trim();
  order.bylnQrText = String(invoice.qrText || "").trim();
  order.bylnQrImage = String(invoice.qrImage || "").trim();
  order.bylnDeepLink = String(invoice.deepLink || "").trim();
  order.bylnWebUrl = String(invoice.webUrl || "").trim();
  order.bylnMode = String(invoice.mode || "mock").trim();
  order.bylnStatus = "PENDING";
  order.paymentRequestedAt = new Date().toISOString();
  return order;
}

function openBylnModal(order, queueOrderIds = []) {
  if (!bylnModal || !order) return;

  activeBylnOrderQueue = Array.isArray(queueOrderIds) ? [...queueOrderIds] : [];
  activeBylnOrderId = Number(order.id || 0);
  activeBylnInvoiceId = String(order.bylnInvoiceId || "").trim();

  if (bylnModalTitle) bylnModalTitle.textContent = "Был.mn QR төлбөр";
  if (bylnModalOrder) bylnModalOrder.textContent = `Захиалга #${order.id}`;
  if (bylnModalSupplier) bylnModalSupplier.textContent = String(order.supplierCompany || "");
  if (bylnModalAmount) bylnModalAmount.textContent = formatMoney(getOrderPayableAmountClient(order));
  if (bylnModalInvoice) bylnModalInvoice.textContent = order.bylnInvoiceNo || activeBylnInvoiceId || "-";
  if (bylnQrText) bylnQrText.textContent = order.bylnQrText || "";
  if (bylnQrImage) {
    const fallbackQr = order.bylnQrText
      ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(order.bylnQrText)}`
      : "";
    bylnQrImage.src = order.bylnQrImage || fallbackQr;
  }
  if (bylnPayLink) {
    const isLive = String(order.bylnMode || "").toLowerCase() === "live";
    const href = order.bylnInvoiceUrl || order.bylnWebUrl || order.bylnDeepLink || "";
    
    if (href && isLive) {
      bylnPayLink.setAttribute("href", href);
      bylnPayLink.classList.remove("hidden");
      bylnPayLink.textContent = "Был.mn рүү шилжих";

      // Үсэрдэг болгох: Автоматаар шинэ цонхонд Byl.mn-ий төлбөрийн веб рүү үсрэх
      try {
        window.open(href, "_blank");
      } catch (e) {
        console.warn("Popup blocked. User must click the link manually.");
      }
    } else {
      bylnPayLink.setAttribute("href", "#");
      if (!isLive) {
        bylnPayLink.classList.remove("hidden");
        bylnPayLink.textContent = "Тохиргоо буруу (Mock)";
        bylnPayLink.onclick = (e) => { e.preventDefault(); alert('BYL_TOKEN буруу эсвэл дутуу байгаа тул жинхэнэ нэхэмжлэх үүссэнгүй. "Mock төлсөн болгох" товчоор туршина уу.'); };
      } else {
        bylnPayLink.classList.add("hidden");
      }
    }
  }
  if (bylnMockPayBtn) {
    bylnMockPayBtn.classList.toggle("hidden", String(order.bylnMode || "").toLowerCase() === "live");
  }

  setElementHidden(bylnModal, false);
  stopBylnStatusPolling();
  if (activeBylnInvoiceId) {
    bylnStatusPollingTimer = setInterval(() => {
      void checkActiveBylnInvoiceStatus(true);
    }, 5000);
  }
}

function markLocalOrderAsPaid(orderId) {
  const order = findOrderById(orderId);
  if (!order) return;
  const nowIso = new Date().toISOString();
  order.paymentStatus = "Төлөгдсөн";
  order.paymentMethod = "supplier_qpay";
  order.paymentConfirmedAt = nowIso;
  order.qpayStatus = "PAID";
  order.qpayPaidAt = nowIso;
  order.payoutStatus = "Хүлээгдэж байна";
}

function isOrderNotFoundApiError(error) {
  const status = Number(error?.status || 0);
  if (status === 404) return true;
  const message = String(error?.message || "").toLowerCase();
  return message.includes("order not found");
}

async function forceSyncStateForPayment() {
  const snapshot = deepClone(state);
  snapshot.session = null;
  await persistState(snapshot);
}

async function ensureOrderInvoiceAndOpen(orderId, queueOrderIds = []) {
  if (!qpayModal) {
    const err = new Error("QPay popup ачаалагдаагүй байна. Ctrl+F5 хийгээд дахин оролдоно уу.");
    err.status = 500;
    throw err;
  }

  const localOrder = findOrderById(orderId);
  if (!localOrder) {
    const err = new Error("Захиалгын мэдээлэл олдсонгүй. Хуудсаа Ctrl+F5 хийгээд дахин оролдоно уу.");
    err.status = 404;
    throw err;
  }

  if (!localOrder.qpayInvoiceId) {
    let created = null;
    try {
      created = await apiCreateQPayInvoice(orderId);
    } catch (error) {
      if (!isOrderNotFoundApiError(error)) throw error;
      showToast("Захиалга sync хийж байна...");
      await forceSyncStateForPayment();
      created = await apiCreateQPayInvoice(orderId);
    }
    const updatedOrder = applyInvoiceToLocalOrder(orderId, created?.invoice || {});
    if (!updatedOrder?.qpayInvoiceId) {
      throw new Error("QPay invoice үүсээгүй байна.");
    }
    saveState();
    renderApp();
  }

  const order = findOrderById(orderId);
  if (!order) {
    const err = new Error("QPay нээх захиалга олдсонгүй.");
    err.status = 404;
    throw err;
  }
  openQPayModal(order, queueOrderIds);
}

function getNextUnpaidOrderIdFromQueue() {
  const queue = Array.isArray(activeQPayOrderQueue) ? activeQPayOrderQueue : [];
  for (const id of queue) {
    const order = findOrderById(id);
    if (!order) continue;
    if (normalizePaymentStatus(order.paymentStatus) === "Төлөгдөөгүй") {
      return Number(order.id || 0);
    }
  }
  return 0;
}

async function ensureOrderBylnInvoiceAndOpen(orderId, queueOrderIds = []) {

  const localOrder = findOrderById(orderId);
  if (!localOrder) {
    const err = new Error("Захиалгын мэдээлэл олдсонгүй. Хуудсаа Ctrl+F5 хийгээд дахин оролдоно уу.");
    err.status = 404;
    throw err;
  }

  if (!localOrder.bylnInvoiceId) {
    let created = null;
    try {
      created = await apiCreateBylnInvoice(orderId);
    } catch (error) {
      if (!isOrderNotFoundApiError(error)) throw error;
      showToast("Захиалга sync хийж байна...");
      await forceSyncStateForPayment();
      created = await apiCreateBylnInvoice(orderId);
    }
    const updatedOrder = applyBylnInvoiceToLocalOrder(orderId, created?.invoice || {});
    if (!updatedOrder?.bylnInvoiceId) {
      throw new Error("Был.mn invoice үүсээгүй байна.");
    }
    saveState();
    renderApp();
  }

  const order = findOrderById(orderId);
  if (!order) {
    const err = new Error("Был.mn нээх захиалга олдсонгүй.");
    err.status = 404;
    throw err;
  }
  const href = order.bylnInvoiceUrl || order.bylnWebUrl || order.bylnDeepLink || "";
  if (href) {
    // Шууд цонх шилжих (Был.mn рүү үсрэх)
    window.location.href = href;
  } else {
    showToast("Был.mn төлбөрийн холбоос үүссэнгүй.");
  }
}

async function checkActiveQPayInvoiceStatus(silent = false) {
  if (!activeQPayInvoiceId || !activeQPayOrderId) return;

  try {
    const checked = await apiCheckQPayInvoice(activeQPayInvoiceId);
    if (checked?.paid) {
      markLocalOrderAsPaid(activeQPayOrderId);
      saveState();
      renderApp();

      const nextOrderId = getNextUnpaidOrderIdFromQueue();
      if (nextOrderId && nextOrderId !== activeQPayOrderId) {
        if (!silent) showToast("Нэг захиалгын төлбөр баталгаажлаа. Дараагийн QPay нээгдэж байна.");
        await ensureOrderInvoiceAndOpen(nextOrderId, activeQPayOrderQueue);
        return;
      }

      closeQPayModal();
      if (!silent) showToast("QPay төлбөр амжилттай баталгаажлаа.");
      return;
    }

    if (!silent) showToast("Төлбөр хараахан орж ирээгүй байна. Дахин шалгана уу.");
  } catch (error) {
    if (!silent) showToast(String(error?.message || "QPay төлбөр шалгахад алдаа гарлаа."));
  }
}

async function mockPayActiveQPayInvoice() {
  if (!activeQPayInvoiceId) return;
  try {
    await apiMockPayQPayInvoice(activeQPayInvoiceId);
    await checkActiveQPayInvoiceStatus(true);
    showToast("Mock төлбөр амжилттай.");
  } catch (error) {
    showToast(String(error?.message || "Mock төлбөр хийхэд алдаа гарлаа."));
  }
}

async function checkActiveBylnInvoiceStatus(silent = false) {
  if (!activeBylnInvoiceId || !activeBylnOrderId) return;

  try {
    const checked = await apiCheckBylnInvoice(activeBylnInvoiceId);
    if (checked?.paid) {
      markLocalOrderAsPaid(activeBylnOrderId);
      saveState();
      renderApp();

      const nextOrderId = getNextUnpaidOrderIdFromQueue();
      if (nextOrderId && nextOrderId !== activeBylnOrderId) {
        if (!silent) showToast("Нэг захиалгын төлбөр баталгаажлаа. Дараагийн Был.mn нээгдэж байна.");
        await ensureOrderBylnInvoiceAndOpen(nextOrderId, activeBylnOrderQueue);
        return;
      }

      closeBylnModal();
      if (!silent) showToast("Был.mn төлбөр амжилттай баталгаажлаа.");
      return;
    }

    if (!silent) showToast("Төлбөр хараахан орж ирээгүй байна. Дахин шалгана уу.");
  } catch (error) {
    if (!silent) showToast(String(error?.message || "Был.mn төлбөр шалгахад алдаа гарлаа."));
  }
}

async function mockPayActiveBylnInvoice() {
  if (!activeBylnInvoiceId) return;
  try {
    await apiMockPayBylnInvoice(activeBylnInvoiceId);
    await checkActiveBylnInvoiceStatus(true);
    showToast("Mock төлбөр амжилттай.");
  } catch (error) {
    showToast(String(error?.message || "Mock төлбөр хийхэд алдаа гарлаа."));
  }
}

async function checkout() {
  if (checkoutInProgress) return;
  const session = state.session;
  if (!session || session.role !== "buyer") {
    showToast("QPay төлөхийн тулд ЖДБ эрхээр нэвтэрнэ үү.");
    if (authView?.classList.contains("hidden")) openAuthModal("login");
    return;
  }
  if (!hasServerAuthToken()) {
    showToast("Серверийн нэвтрэлт дууссан байна. Дахин нэвтэрнэ үү.");
    if (authView?.classList.contains("hidden")) openAuthModal("login");
    return;
  }
  const cart = getCurrentCart();
  if (cart.length === 0) {
    showToast("Сагс хоосон байна.");
    return;
  }
  const rewardUser = getCurrentBuyerRewardUser();
  const checkoutDetailsResult = readCheckoutOrderDetails();
  if (!checkoutDetailsResult.ok) {
    showToast(checkoutDetailsResult.message, "warning");
    return;
  }
  const checkoutDetails = checkoutDetailsResult.data;

  for (const line of cart) {
    const product = state.products.find((item) => item.id === line.productId);
    if (!product || product.stock < line.qty) {
      showToast("Зарим барааны үлдэгдэл хүрэлцэхгүй байна.");
      return;
    }
  }

  checkoutInProgress = true;
  renderCart();

  try {
    const pricing = buildCartPricingSummary();
    const bySupplier = {};
    cart.forEach((line) => {
      const product = state.products.find((item) => item.id === line.productId);
      if (!product) return;
      if (!bySupplier[product.supplierCompany]) bySupplier[product.supplierCompany] = [];
      bySupplier[product.supplierCompany].push({ product, qty: line.qty });
    });

    const supplierEntries = Object.entries(bySupplier).map(([supplierCompany, lines]) => {
      const items = lines.map((entry) => {
        const subtotal = entry.product.price * entry.qty;
        return {
          productId: entry.product.id,
          name: entry.product.name,
          productName: entry.product.name,
          price: entry.product.price,
          unitPrice: entry.product.price,
          unit: entry.product.unit,
          qty: entry.qty,
          quantity: entry.qty,
          subtotal,
          lineTotal: subtotal,
          supplierCompany,
          supplierName: supplierCompany,
        };
      });

      return {
        supplierCompany,
        items,
        subtotal: items.reduce((acc, item) => acc + item.subtotal, 0),
      };
    });

    const discountAllocations = distributeAmountAcrossBuckets(
      pricing.discountAmount,
      supplierEntries.map((entry) => entry.subtotal)
    );
    const pointAllocations = distributeAmountAcrossBuckets(
      pricing.usedPoints,
      supplierEntries.map((entry) => Math.max(0, entry.subtotal - discountAllocations[supplierEntries.indexOf(entry)]))
    );

    const createdOrderIds = [];
    supplierEntries.forEach((entry, index) => {
      const subtotal = entry.subtotal;
      const discountAmount = Math.max(0, Number(discountAllocations[index] || 0));
      const usedPoints = Math.max(0, Number(pointAllocations[index] || 0));
      const finalAmount = Math.max(0, subtotal - discountAmount - usedPoints);
      const platformFeeAmount = Math.round(subtotal * PLATFORM_COMMISSION_RATE);
      const supplierPayoutAmount = Math.max(0, subtotal - platformFeeAmount);
      const orderId = state.nextOrderId++;
      state.orders.push({
        id: orderId,
        buyerCompany: session.company,
        supplierCompany: entry.supplierCompany,
        items: entry.items,
        subtotal,
        discountAmount,
        usedPoints,
        earnedPoints: calculateEarnedPointsClient(finalAmount),
        finalAmount,
        rewardStatus: "pending",
        appliedCouponCode: pricing.appliedCoupon?.code || "",
        pickupDate: checkoutDetails.pickupDate,
        pickupTimeSlot: checkoutDetails.pickupTimeSlot,
        pickupNote: checkoutDetails.pickupNote,
        deliveryAddress: checkoutDetails.deliveryAddress,
        locationNote: checkoutDetails.locationNote,
        contactPhone: checkoutDetails.contactPhone,
        latitude: checkoutDetails.latitude,
        longitude: checkoutDetails.longitude,
        mapUrl: checkoutDetails.mapUrl,
        totalAmount: subtotal,
        total: subtotal,
        status: "Шинэ",
        paymentStatus: "Төлөгдөөгүй",
        deliveryStatus: "Төлбөр хүлээгдэж байна",
        paymentMethod: "supplier_qpay",
        paymentRequestedAt: "",
        paymentConfirmedAt: "",
        statusUpdatedAt: "",
        supplierAcceptedAt: "",
        shippedAt: "",
        receivedAt: "",
        platformFeeRate: PLATFORM_COMMISSION_RATE,
        platformFeeAmount,
        supplierPayoutAmount,
        payoutStatus: "Хүлээгдэж байна",
        payoutTransferredAt: "",
        qpayInvoiceId: "",
        qpayInvoiceNo: "",
        qpayQrText: "",
        qpayQrImage: "",
        qpayDeepLink: "",
        qpayWebUrl: "",
        qpayReceiverCode: "",
        qpayStatus: "NOT_REQUESTED",
        qpayMode: "mock",
        qpayPaidAt: "",
        createdAt: new Date().toISOString(),
      });
      createdOrderIds.push(orderId);

      entry.items.forEach((item) => {
        const product = state.products.find((row) => row.id === item.productId);
        if (product) product.stock = Math.max(0, product.stock - item.qty);
      });
    });

    if (rewardUser && pricing.usedPoints > 0) {
      rewardUser.rewardPoints = Math.max(0, Number(rewardUser.rewardPoints || 0) - pricing.usedPoints);
      rewardUser.totalUsedPoints = Math.max(0, Number(rewardUser.totalUsedPoints || 0) + pricing.usedPoints);
    }
    if (pricing.appliedCoupon) {
      const coupon = (state.coupons || []).find((row) => normalizeCouponCodeClient(row.code) === pricing.appliedCoupon.code);
      if (coupon) {
        coupon.usedCount = Math.max(0, Number(coupon.usedCount || 0) + 1);
      }
    }

    state.carts[session.company] = [];
    activeCartCouponCode = "";
    activeCartCouponMessage = "";
    activeCartCouponTone = "info";
    activeCartPointsTone = "info";
    activeCartPointsMessage = "";
    lastCartPointsWarningKey = "";
    if (cartCouponInput) cartCouponInput.value = "";
    if (cartPointsInput) cartPointsInput.value = "";
    resetCheckoutFieldValues();
    saveState();
    renderApp();
    const checkoutMessages = [];
    if (pricing.appliedCoupon?.code) {
      checkoutMessages.push(`${pricing.appliedCoupon.code} амжилттай хэрэглэгдлээ.`);
    }
    if (pricing.usedPoints > 0) {
      checkoutMessages.push(`${Math.max(0, Number(pricing.usedPoints || 0)).toLocaleString("mn-MN")} бонус ашиглагдлаа.`);
    }
    checkoutMessages.push("Сагсаас захиалга үүслээ. QPay QR нээгдэж байна...");
    showToast(checkoutMessages.join(" "), pricing.usedPoints > 0 || pricing.appliedCoupon ? "success" : "info");

    const firstOrderId = createdOrderIds[0];
    if (!firstOrderId) return;

    await ensureOrderInvoiceAndOpen(firstOrderId, createdOrderIds);
    closeCartDrawer();
  } catch (error) {
    if (Number(error?.status || 0) === 401) {
      showToast("Нэвтрэлт хүчингүй байна. Дахин нэвтэрнэ үү.");
      if (authView?.classList.contains("hidden")) openAuthModal("login");
    } else {
      showToast(String(error?.message || "QPay invoice үүсгэхэд алдаа гарлаа."));
    }
  } finally {
    checkoutInProgress = false;
    renderCart();
  }
}

function renderBuyerOrdersPanel() {
  if (!buyerOrdersPanel || !buyerOrdersList) return;
  const headingKicker = buyerOrdersPanel.querySelector(".section-kicker");
  const headingTitle = buyerOrdersPanel.querySelector("h4");
  const headingDesc = buyerOrdersPanel.querySelector("p");
  const supplierSideMode = Boolean(
    state.session &&
      state.session.role === "supplier" &&
      homeDiscovery &&
      !homeDiscovery.classList.contains("hidden")
  );

  if (!state.session || (state.session.role !== "buyer" && !supplierSideMode)) {
    buyerOrdersOpen = false;
    buyerOrdersPanel.classList.add("hidden");
    toggleBuyerOrdersBtn?.setAttribute("aria-expanded", "false");
    return;
  }

  if (supplierSideMode) {
    buyerOrdersPanel.classList.remove("hidden");
    toggleBuyerOrdersBtn?.setAttribute("aria-expanded", "false");
    if (headingKicker) headingKicker.textContent = "Захиалга баталгаажуулалт";
    if (headingTitle) headingTitle.textContent = "Ирсэн захиалгууд";
    if (headingDesc) headingDesc.textContent = "Төлбөр баталгаажсан захиалгыг хүлээн авч, хүргэлтэд гаргах үйлдлийг эндээс хийнэ.";

    const orders = state.orders
      .filter((order) => isSameCompany(order.supplierCompany, state.session.company))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (orders.length === 0) {
      buyerOrdersList.innerHTML = renderEmptyState(
        "Танай компанид ирсэн захиалга алга",
        "Шинэ захиалга орж ирэхэд энэ хэсэгт жагсаж харагдана."
      );
      return;
    }

    const normalizedOrders = orders.map((order) => normalizeOrderForUi(order));
    const pendingOrders = normalizedOrders.filter((order) => order.status === "Шинэ");
    const otherOrders = normalizedOrders.filter((order) => order.status !== "Шинэ");

    buyerOrdersList.innerHTML = `
      <section class="supplier-order-group">
        <div class="supplier-order-group-head">
          <h5>Баталгаажуулах захиалга</h5>
          <span class="supplier-order-count">${pendingOrders.length}</span>
        </div>
        ${
          pendingOrders.length
            ? `<div class="stack supplier-order-stack">${pendingOrders.map(renderSupplierOrderCard).join("")}</div>`
            : `<p class="muted">Шинэ захиалга алга.</p>`
        }
      </section>
      <section class="supplier-order-group">
        <div class="supplier-order-group-head">
          <h5>Бусад захиалгын явц</h5>
          <span class="supplier-order-count">${otherOrders.length}</span>
        </div>
        ${
          otherOrders.length
            ? `<div class="stack supplier-order-stack">${otherOrders.map(renderSupplierOrderCard).join("")}</div>`
            : `<p class="muted">Одоогоор бусад явцын захиалга алга.</p>`
        }
      </section>
    `;
    return;
  }

  if (headingKicker) headingKicker.textContent = "Захиалга удирдлага";
  if (headingTitle) headingTitle.textContent = "Идэвхтэй захиалгууд";
  if (headingDesc) headingDesc.textContent = "Төлөх, засах, мөн хүргэлт ирснийг баталгаажуулах үйлдлийг эндээс хийнэ.";

  const panelVisible = true;
  buyerOrdersOpen = panelVisible;
  buyerOrdersPanel.classList.toggle("hidden", !panelVisible);
  toggleBuyerOrdersBtn?.setAttribute("aria-expanded", panelVisible ? "true" : "false");

  const orders = state.orders
    .filter((order) => isSameCompany(order.buyerCompany, state.session.company))
    .filter((order) => !isBuyerOrderArchived(order))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (orders.length === 0) {
    buyerOrdersList.innerHTML = renderEmptyState(
      "Идэвхтэй захиалга алга",
      "Сагсаа бүрдүүлээд шинэ захиалга үүсгэвэл энэ хэсэгт удирдлага нь гарч ирнэ.",
      "Бараа үзэх",
      "scroll-products"
    );
    return;
  }

  buyerOrdersList.innerHTML = orders.map(renderOrderCard).join("");
}

function renderOrderRewardBreakdown(order) {
  const normalizedOrder = normalizeOrderForUi(order);
  const parts = [];

  if (normalizedOrder.appliedCouponCode) {
    parts.push(`Купон: ${escapeHtml(normalizedOrder.appliedCouponCode)}`);
  }
  if (Number(normalizedOrder.discountAmount || 0) > 0) {
    parts.push(`Хөнгөлөлт: -${formatMoney(Number(normalizedOrder.discountAmount || 0))}`);
  }
  if (Number(normalizedOrder.usedPoints || 0) > 0) {
    parts.push(`Бонус ашигласан: -${formatMoney(Number(normalizedOrder.usedPoints || 0))}`);
  }
  if (Number(normalizedOrder.earnedPoints || 0) > 0) {
    const label = normalizedOrder.rewardStatus === "earned" ? "Олгосон бонус" : "Цуглах бонус";
    parts.push(`${label}: +${Math.max(0, Number(normalizedOrder.earnedPoints || 0)).toLocaleString("mn-MN")} оноо`);
  }

  return parts.length
    ? `<div class="order-meta-row order-meta-row--reward">${parts.map((text) => `<span class="muted">${text}</span>`).join("")}</div>`
    : "";
}

function formatPickupDateLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString("mn-MN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function renderOrderFulfillmentMeta(order) {
  const normalizedOrder = normalizeOrderForUi(order);
  const hasDetails = Boolean(
    normalizedOrder.pickupDate ||
      normalizedOrder.pickupTimeSlot ||
      normalizedOrder.pickupNote ||
      normalizedOrder.deliveryAddress ||
      normalizedOrder.locationNote ||
      normalizedOrder.contactPhone ||
      normalizedOrder.mapUrl
  );
  if (!hasDetails) return "";

  const infoItems = [
    ["Хүлээн авах огноо", formatPickupDateLabel(normalizedOrder.pickupDate) || "-"],
    ["Хүлээн авах цагийн интервал", normalizedOrder.pickupTimeSlot || "-"],
    ["Холбоо барих утас", normalizedOrder.contactPhone || "-"],
    ["Хаяг", normalizedOrder.deliveryAddress || "-"],
  ];

  const noteBlocks = [];
  if (normalizedOrder.pickupNote) {
    noteBlocks.push(`
      <div class="order-note-block">
        <span class="detail-label">Нэмэлт тайлбар</span>
        <div class="order-note-text">${escapeHtml(normalizedOrder.pickupNote)}</div>
      </div>
    `);
  }
  if (normalizedOrder.locationNote) {
    noteBlocks.push(`
      <div class="order-note-block">
        <span class="detail-label">Байршлын тайлбар</span>
        <div class="order-note-text">${escapeHtml(normalizedOrder.locationNote)}</div>
      </div>
    `);
  }
  if (normalizedOrder.mapUrl) {
    noteBlocks.push(`
      <div class="order-note-block">
        <span class="detail-label">Газрын зураг</span>
        <div><a class="order-map-link" href="${escapeAttr(normalizedOrder.mapUrl)}" target="_blank" rel="noopener noreferrer">Газрын зураг дээр харах</a></div>
      </div>
    `);
  }

  return `
    <div class="order-info-grid">
      ${infoItems
        .map(
          ([label, value]) => `
            <div class="order-detail-item">
              <span class="detail-label">${label}</span>
              <span class="detail-value">${escapeHtml(value)}</span>
            </div>
          `
        )
        .join("")}
    </div>
    ${noteBlocks.length ? `<div class="order-note-stack">${noteBlocks.join("")}</div>` : ""}
  `;
}

function renderOrderCard(order) {
  const dateLabel = formatOrderDate(order.createdAt);
  const statusClass = getStatusClass(order.status);
  const productText = order.items.map((item) => `${escapeHtml(item.name)} x${item.qty}`).join(", ");
  return `
    <article class="order-card order-card--buyer">
      <div class="row">
        <strong>Захиалга #${order.id}</strong>
        <span class="status status--${statusClass}">${escapeHtml(order.status)}</span>
      </div>
      <div class="muted">Нийлүүлэгч: ${escapeHtml(order.supplierCompany)}</div>
      <div class="muted order-items">${productText}</div>
      ${renderOrderProgress(order)}
      ${renderOrderPaymentMeta(order, true)}
      <div class="row">
        <strong>${formatMoney(getOrderPayableAmountClient(order))}</strong>
        <span class="muted">${dateLabel}</span>
      </div>
    </article>
  `;
}

function renderSupplierOrderCard(order) {
  const dateLabel = formatOrderDate(order.createdAt);
  const statusClass = getStatusClass(order.status);
  const productText = order.items.map((item) => `${escapeHtml(item.name)} x${item.qty}`).join(", ");
  const nextAction = getSupplierPrimaryAction(order);
  const actionButton = nextAction
    ? `<button class="btn ${nextAction.action === "order-pay" ? "btn-light" : "btn-primary"}" type="button" data-action="${nextAction.action}" data-order-id="${order.id}">${nextAction.label}</button>`
    : `<span class="muted">Дараагийн үйлдэл байхгүй.</span>`;

  return `
    <article class="order-card order-card--supplier">
      <div class="row">
        <strong>Захиалга #${order.id}</strong>
        <span class="status status--${statusClass}">${escapeHtml(order.status)}</span>
      </div>
      <div class="muted">Худалдан авагч: ${escapeHtml(order.buyerCompany)}</div>
      <div class="muted order-items">${productText}</div>
      ${renderOrderProgress(order)}
      ${renderOrderPaymentMeta(order, true)}
      <div class="row">
        <strong>${formatMoney(getOrderPayableAmountClient(order))}</strong>
        <span class="muted">${dateLabel}</span>
      </div>
      <div class="table-actions table-actions--single">
        ${actionButton}
      </div>
    </article>
  `;
}

function renderOrderProgress(order) {
  const activeStepIndex = getOrderStepIndex(order.status);
  return `
    <ol class="order-progress" aria-label="Захиалгын төлөв">
      ${ORDER_STEP_FLOW.map((step, index) => {
        const stepClass = index < activeStepIndex ? "is-done" : index === activeStepIndex ? "is-active" : "";
        return `<li class="${stepClass}"><span>${escapeHtml(step.label)}</span></li>`;
      }).join("")}
    </ol>
  `;
}

function renderOrderPaymentMeta(order, withDemoHint = false) {
  const isPaid = order.paymentStatus === "Төлөгдсөн";
  const paymentClass = isPaid ? "is-paid" : "is-unpaid";
  const paymentText = isPaid ? "Төлбөр баталгаажсан" : "Төлбөр хүлээгдэж байна";
  const rewardMeta = rewardTextParts.length
    ? `<div class="order-meta-row order-meta-row--reward">${rewardTextParts.map((text) => `<span class="muted">${text}</span>`).join("")}</div>`
    : "";
  const demoNote =
    withDemoHint && !isPaid
      ? `<p class="muted payment-demo-note">Төлбөрийн урсгал демо горимоор ажиллаж байна. Нийлүүлэгч баталгаажуулна.</p>`
      : "";

  return `
    <div class="order-meta-row">
      <span class="payment-pill ${paymentClass}">${paymentText}</span>
      <span class="muted">Хүргэлт: ${escapeHtml(order.deliveryStatus)}</span>
    </div>
    ${rewardMeta}
    ${demoNote}
  `;
}

function getSupplierPrimaryAction(order) {
  if (order.status === "Шинэ") {
    return { action: "order-confirm", label: "Захиалга батлах" };
  }
  if (order.status === "Баталгаажсан") {
    return { action: "order-ship", label: "Хүргэлт эхлүүлэх" };
  }
  if (order.status === "Замд") {
    return { action: "order-deliver", label: "Хүргэгдсэн болгох" };
  }
  if (order.status === "Хүргэгдсэн" && order.paymentStatus !== "Төлөгдсөн") {
    return { action: "order-pay", label: "Демо төлбөр батлах" };
  }
  return null;
}

function formatOrderDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Огноо тодорхойгүй";
  return parsed.toLocaleString("mn-MN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderEmptyState(title, description, actionLabel = "", action = "") {
  const safeTitle = repairMojibakeString(String(title || ""));
  const safeDescription = repairMojibakeString(String(description || ""));
  const safeActionLabel = repairMojibakeString(String(actionLabel || ""));
  const actionButton =
    safeActionLabel && action
      ? `<button class="btn btn-light" type="button" data-action="${escapeAttr(action)}">${escapeHtml(safeActionLabel)}</button>`
      : "";

  return `
    <article class="empty-state-card">
      <h5>${escapeHtml(safeTitle)}</h5>
      <p>${escapeHtml(safeDescription)}</p>
      ${actionButton}
    </article>
  `;
}

function renderAdminPanel() {
  if (!adminSessionLabel || !state.session) return;
  adminSessionLabel.textContent = `Админ: ${state.session.company}`;
  renderAdminStats();
  renderAdminNotices();
  void renderAdminSupplierVerificationPanel();
  void renderAdminCoupons();
  renderAdminUsers();
  renderAdminOrders();
  renderAdminCharts();
}

function renderAdminStats() {
  const users = Array.isArray(state.users) ? state.users : [];
  const suppliers = users.filter((row) => String(row.role || "").toLowerCase() === "supplier");
  const pendingSuppliers = suppliers.filter(
    (row) => normalizeSupplierVerificationStatusClient(row.verificationStatus, "pending") === "pending"
  );
  if (adminStatUsers) adminStatUsers.textContent = String(users.length);
  if (adminStatSuppliers) adminStatSuppliers.textContent = String(suppliers.length);
  if (adminStatOrders) adminStatOrders.textContent = String(state.orders.length);
  if (adminStatPending) adminStatPending.textContent = String(pendingSuppliers.length);
}

function renderAdminNotices() {
  if (!adminNoticeList) return;
  const notices = [...(state.announcements || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (notices.length === 0) {
    adminNoticeList.innerHTML = `<p class="muted">Одоогоор зар мэдээлэл алга.</p>`;
    return;
  }
  adminNoticeList.innerHTML = notices
    .map((notice) => {
      const date = new Date(notice.createdAt).toLocaleString("mn-MN");
      return `
        <article class="order-card">
          <div class="row">
            <strong>Зар #${notice.id}</strong>
            <span class="muted">${date}</span>
          </div>
          <div>${escapeHtml(notice.text)}</div>
        </article>
      `;
    })
    .join("");
}

async function renderAdminSupplierVerificationPanel() {
  if (!adminSupplierVerificationRows) return;
  let response = null;
  try {
    response = await apiListAdminSuppliers("all");
  } catch {
    response = null;
  }

  const sourceSuppliers = Array.isArray(response?.suppliers) && response.suppliers.length > 0
    ? response.suppliers
    : (state.users || []).filter((user) => String(user.role || "").toLowerCase() === "supplier");

  const suppliers = sourceSuppliers
    .map((user) => ({
      ...user,
      verificationStatus: normalizeSupplierVerificationStatusClient(user.verificationStatus, "pending"),
    }))
    .sort((left, right) => {
      const priority = {
        pending: 0,
        rejected: 1,
        suspended: 2,
        verified: 3,
      };
      const statusGap = (priority[left.verificationStatus] || 99) - (priority[right.verificationStatus] || 99);
      if (statusGap !== 0) return statusGap;
      const leftTime = new Date(left.createdAt || 0).getTime();
      const rightTime = new Date(right.createdAt || 0).getTime();
      return rightTime - leftTime;
    });

  const pendingCount = Number(response?.summary?.pending || suppliers.filter((supplier) => supplier.verificationStatus === "pending").length);
  if (adminSupplierVerificationSummary) {
    adminSupplierVerificationSummary.textContent = `${pendingCount} хүлээгдэж байна / ${suppliers.length} нийлүүлэгч`;
  }

  if (suppliers.length === 0) {
    adminSupplierVerificationRows.innerHTML = `
      <tr>
        <td colspan="11" class="muted">Нийлүүлэгчийн бүртгэл одоогоор алга.</td>
      </tr>
    `;
    return;
  }

  adminSupplierVerificationRows.innerHTML = suppliers
    .map((supplier) => {
      const bankNumber = String(supplier.bankAccountNumber || supplier.bankAccountMasked || "").trim() || "-";
      const statusLabel = getSupplierVerificationLabel(supplier.verificationStatus);
      return `
        <tr>
          <td>${escapeHtml(supplier.companyName || supplier.company || "-")}</td>
          <td>${escapeHtml(supplier.registerNumber || "-")}</td>
          <td>${escapeHtml(getSupplierBusinessTypeLabel(supplier.businessType))}</td>
          <td>${escapeHtml(supplier.contactPersonName || supplier.contactName || "-")}</td>
          <td>${escapeHtml(supplier.contactPersonPhone || supplier.phone || "-")}</td>
          <td>${escapeHtml(supplier.contactPersonEmail || supplier.email || "-")}</td>
          <td>${escapeHtml(supplier.bankAccountName || "-")}</td>
          <td>${escapeHtml(bankNumber)}</td>
          <td>${escapeHtml(supplier.qpayReceiverCode || "-")}</td>
          <td><span class="verification-badge ${getSupplierVerificationBadgeClass(supplier.verificationStatus)}">${escapeHtml(statusLabel)}</span></td>
          <td>
            <div class="table-actions table-actions--compact">
              <button class="btn btn-light" type="button" data-action="supplier-view" data-supplier-id="${supplier.id}">Харах</button>
              <button class="btn btn-primary" type="button" data-action="supplier-verify" data-supplier-id="${supplier.id}">Баталгаажуулах</button>
              <button class="btn btn-light" type="button" data-action="supplier-reject" data-supplier-id="${supplier.id}">Татгалзах</button>
              <button class="btn btn-light" type="button" data-action="supplier-suspend" data-supplier-id="${supplier.id}">Түр түдгэлзүүлэх</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function renderAdminCoupons() {
  if (!adminCouponRows) return;

  let response = null;
  try {
    response = await apiListAdminCoupons();
  } catch {
    response = null;
  }

  const coupons = (Array.isArray(response?.coupons) ? response.coupons : state.coupons || [])
    .map((coupon, index) => normalizeCouponRecordClient(coupon, Number(coupon.id || index + 1)))
    .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());

  const activeCount = coupons.filter((coupon) => coupon.isActive).length;
  const usedCount = coupons.reduce((sum, coupon) => sum + Math.max(0, Number(coupon.usedCount || 0)), 0);
  if (adminCouponSummary) {
    adminCouponSummary.textContent = `${activeCount} идэвхтэй / ${usedCount} ашигласан`;
  }

  if (coupons.length === 0) {
    adminCouponRows.innerHTML = `
      <tr>
        <td colspan="8" class="muted">Coupon бүртгэл одоогоор алга.</td>
      </tr>
    `;
    return;
  }

  adminCouponRows.innerHTML = coupons
    .map((coupon) => {
      const discountLabel =
        coupon.discountType === "percent"
          ? `${Number(coupon.discountValue || 0)}%`
          : formatMoney(Number(coupon.discountValue || 0));
      const validityLabel = coupon.validTo ? formatDateTimeText(coupon.validTo) : "Хугацаагүй";
      const badgeClass = coupon.isActive
        ? "supplier-verification-badge--verified"
        : "supplier-verification-badge--suspended";
      const badgeText = coupon.isActive ? "Идэвхтэй" : "Идэвхгүй";

      return `
        <tr>
          <td><strong>${escapeHtml(coupon.code)}</strong></td>
          <td>${escapeHtml(discountLabel)}</td>
          <td>${formatMoney(Number(coupon.minOrderAmount || 0))}</td>
          <td>${Number(coupon.usageLimit || 0) > 0 ? `${Number(coupon.usedCount || 0)} / ${Number(coupon.usageLimit || 0)}` : `${Number(coupon.usedCount || 0)} / Хязгааргүй`}</td>
          <td>${escapeHtml(validityLabel)}</td>
          <td><span class="verification-badge ${badgeClass}">${escapeHtml(badgeText)}</span></td>
          <td>${escapeHtml(coupon.createdBy || "-")}</td>
          <td>
            <div class="table-actions table-actions--compact">
              <button class="btn btn-light" type="button" data-action="coupon-deactivate" data-coupon-id="${coupon.id}" ${coupon.isActive ? "" : "disabled"}>Идэвхгүй болгох</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function onAdminCouponSubmit(event) {
  event.preventDefault();
  if (!state.session || state.session.role !== "admin") {
    showToast("Зөвхөн админ coupon үүсгэнэ.");
    return;
  }

  const payload = {
    code: String(adminCouponCodeInput?.value || "").trim(),
    discountType: String(adminCouponDiscountTypeInput?.value || "fixed").trim(),
    discountValue: Number(adminCouponDiscountValueInput?.value || 0),
    minOrderAmount: Number(adminCouponMinOrderInput?.value || 0),
    maxDiscountAmount: Number(adminCouponMaxDiscountInput?.value || 0),
    usageLimit: Number(adminCouponUsageLimitInput?.value || 0),
    validFrom: String(adminCouponValidFromInput?.value || "").trim(),
    validTo: String(adminCouponValidToInput?.value || "").trim(),
    isActive: true,
  };

  try {
    await apiCreateAdminCoupon(payload);
    await refreshStateFromRemote();
    adminCouponForm?.reset();
    showToast("Coupon амжилттай үүслээ.");
  } catch (error) {
    showToast(String(error?.message || "Coupon үүсгэхэд алдаа гарлаа."));
  }
}

async function deactivateAdminCoupon(couponId) {
  if (!couponId) return;
  if (!window.confirm("Энэ coupon-ийг идэвхгүй болгох уу?")) return;

  try {
    await apiDeactivateAdminCoupon(couponId);
    await refreshStateFromRemote();
    showToast("Coupon идэвхгүй боллоо.");
  } catch (error) {
    showToast(String(error?.message || "Coupon идэвхгүй болгоход алдаа гарлаа."));
  }
}

function closeSupplierVerificationModal() {
  setElementHidden(supplierVerificationModal, true);
}

function renderSupplierVerificationModal(supplier) {
  if (!supplierVerificationModalBody) return;
  if (supplierVerificationModalTitle) {
    supplierVerificationModalTitle.textContent = supplier
      ? `${supplier.companyName || supplier.company || "Нийлүүлэгч"}`
      : "Нийлүүлэгчийн дэлгэрэнгүй";
  }

  if (!supplier) {
    supplierVerificationModalBody.innerHTML = `<p class="muted">Мэдээлэл олдсонгүй.</p>`;
    return;
  }

  const statusLabel = getSupplierVerificationLabel(supplier.verificationStatus);
  const verificationHistory = Array.isArray(supplier.verificationHistory) ? supplier.verificationHistory.slice().reverse() : [];
  const historyMarkup = verificationHistory.length
    ? `
      <div class="supplier-detail-list">
        ${verificationHistory
          .map(
            (entry) => `
              <div>
                <span>${escapeHtml(getSupplierVerificationLabel(entry.status || "pending"))}</span>
                <strong>${escapeHtml(formatDateTimeText(entry.changedAt || supplier.createdAt))} | ${escapeHtml(
                  entry.changedBy || "-"
                )}${entry.note ? ` | ${escapeHtml(entry.note)}` : ""}</strong>
              </div>
            `
          )
          .join("")}
      </div>
    `
    : `<p class="muted">Audit түүх бүртгэгдээгүй байна.</p>`;
  supplierVerificationModalBody.innerHTML = `
    <div class="supplier-detail-grid">
      <article class="supplier-detail-card">
        <span>Байгууллага</span>
        <strong>${escapeHtml(supplier.companyName || supplier.company || "-")}</strong>
      </article>
      <article class="supplier-detail-card">
        <span>Регистр</span>
        <strong>${escapeHtml(supplier.registerNumber || "-")}</strong>
      </article>
      <article class="supplier-detail-card">
        <span>Төрөл</span>
        <strong>${escapeHtml(getSupplierBusinessTypeLabel(supplier.businessType))}</strong>
      </article>
      <article class="supplier-detail-card">
        <span>Төлөв</span>
        <strong><span class="verification-badge ${getSupplierVerificationBadgeClass(supplier.verificationStatus)}">${escapeHtml(statusLabel)}</span></strong>
      </article>
    </div>
    <div class="supplier-detail-list">
      <div><span>Холбоо барих хүн</span><strong>${escapeHtml(supplier.contactPersonName || supplier.contactName || "-")}</strong></div>
      <div><span>Холбоо барих утас</span><strong>${escapeHtml(supplier.contactPersonPhone || supplier.phone || "-")}</strong></div>
      <div><span>Холбоо барих и-мэйл</span><strong>${escapeHtml(supplier.contactPersonEmail || supplier.email || "-")}</strong></div>
      <div><span>Хаяг</span><strong>${escapeHtml(supplier.address || "-")}</strong></div>
      <div><span>Банкны нэр</span><strong>${escapeHtml(supplier.bankName || "-")}</strong></div>
      <div><span>Данс эзэмшигч</span><strong>${escapeHtml(supplier.bankAccountName || "-")}</strong></div>
      <div><span>Дансны дугаар</span><strong>${escapeHtml(supplier.bankAccountNumber || supplier.bankAccountMasked || "-")}</strong></div>
      <div><span>QPay код</span><strong>${escapeHtml(supplier.qpayReceiverCode || "-")}</strong></div>
      <div><span>Хяналтын тэмдэглэл</span><strong>${escapeHtml(supplier.verificationNote || "-")}</strong></div>
      <div><span>Баталгаажуулсан</span><strong>${escapeHtml(supplier.verifiedAt ? formatDateTimeText(supplier.verifiedAt) : "-")}</strong></div>
      <div><span>Баталгаажуулсан хүн</span><strong>${escapeHtml(supplier.verifiedBy || "-")}</strong></div>
      <div><span>Бүртгэсэн огноо</span><strong>${escapeHtml(formatDateTimeText(supplier.createdAt))}</strong></div>
    </div>
    <div class="stack">
      <strong>Баталгаажуулалтын түүх</strong>
      ${historyMarkup}
    </div>
  `;
}

async function openSupplierVerificationDetail(supplierId) {
  const current = (state.users || []).find((user) => Number(user.id || 0) === Number(supplierId || 0));
  try {
    const response = await apiGetAdminSupplier(supplierId);
    const supplier = response?.supplier || current;
    renderSupplierVerificationModal(supplier);
    setElementHidden(supplierVerificationModal, false);
    repairDomMojibake(supplierVerificationModal || document.body);
  } catch (error) {
    if (current) {
      renderSupplierVerificationModal(current);
      setElementHidden(supplierVerificationModal, false);
      repairDomMojibake(supplierVerificationModal || document.body);
      return;
    }
    showToast(String(error?.message || "Нийлүүлэгчийн мэдээлэл олдсонгүй."));
  }
}

async function changeSupplierVerificationStatus(supplierId, action) {
  const statusAction = String(action || "").toLowerCase();
  const supplier = (state.users || []).find((user) => Number(user.id || 0) === Number(supplierId || 0));
  if (!supplier) {
    showToast("Нийлүүлэгч олдсонгүй.");
    return;
  }

  let note = "";
  if (statusAction === "reject") {
    note = String(window.prompt("Татгалзах шалтгаан бичнэ үү.") || "").trim();
    if (!note) return;
  }
  if (statusAction === "suspend") {
    note = String(window.prompt("Түр түдгэлзүүлэх шалтгаан бичнэ үү.") || "").trim();
    if (!note) return;
  }

  try {
    const response = await apiChangeAdminSupplierVerification(supplierId, statusAction, note);
    if (response?.supplier) {
      renderSupplierVerificationModal(response.supplier);
    }
    await refreshStateFromRemote();
    showToast(
      statusAction === "verify"
        ? "Нийлүүлэгч баталгаажлаа."
        : statusAction === "reject"
          ? "Нийлүүлэгч татгалзагдлаа."
          : "Нийлүүлэгч түр түдгэлзлээ."
    );
  } catch (error) {
    showToast(String(error?.message || "Нийлүүлэгчийн төлөв шинэчлэхэд алдаа гарлаа."));
  }
}

function onAddNotice(event) {
  event.preventDefault();
  const text = String(adminNoticeInput?.value || "").trim();
  if (!text) {
    showToast("Зарын текст оруулна уу.");
    return;
  }
  state.announcements.push({
    id: state.nextNoticeId++,
    text,
    createdAt: new Date().toISOString(),
  });
  saveState();
  if (adminNoticeInput) adminNoticeInput.value = "";
  renderAdminNotices();
  showToast("Зар амжилттай нэмэгдлээ.");
}

function buildUsersSummary() {
  const userMap = new Map();
  state.orders.forEach((order) => {
    const buyerKey = `buyer:${order.buyerCompany}`;
    const supplierKey = `supplier:${order.supplierCompany}`;
    if (!userMap.has(buyerKey)) userMap.set(buyerKey, { company: order.buyerCompany, role: "buyer", orders: 0, total: 0 });
    if (!userMap.has(supplierKey)) userMap.set(supplierKey, { company: order.supplierCompany, role: "supplier", orders: 0, total: 0 });
    userMap.get(buyerKey).orders += 1;
    userMap.get(buyerKey).total += getOrderPayableAmountClient(order);
    userMap.get(supplierKey).orders += 1;
    userMap.get(supplierKey).total += getOrderPayableAmountClient(order);
  });
  state.products.forEach((product) => {
    const supplierKey = `supplier:${product.supplierCompany}`;
    if (!userMap.has(supplierKey)) userMap.set(supplierKey, { company: product.supplierCompany, role: "supplier", orders: 0, total: 0 });
  });
  if (state.session?.role === "admin") {
    userMap.set(`admin:${state.session.company}`, { company: state.session.company, role: "admin", orders: 0, total: 0 });
  }
  return Array.from(userMap.values());
}

function renderAdminUsers() {
  if (!adminUserRows) return;
  const users = buildUsersSummary();
  if (users.length === 0) {
    adminUserRows.innerHTML = `<tr><td colspan="4" class="muted">Хэрэглэгчийн өгөгдөл алга.</td></tr>`;
    return;
  }
  adminUserRows.innerHTML = users
    .map((user) => {
      const roleLabel = user.role === "supplier" ? "Нийлүүлэгч" : user.role === "buyer" ? "ЖДБ" : "Админ";
      return `
        <tr>
          <td>${escapeHtml(user.company)}</td>
          <td>${roleLabel}</td>
          <td>${user.orders}</td>
          <td>${formatMoney(user.total)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderAdminOrders() {
  if (!adminOrderRows) return;
  const orders = [...(state.orders || [])]
    .map((order) => normalizeOrderForUi(order))
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .slice(0, 6);

  if (orders.length === 0) {
    adminOrderRows.innerHTML = `<p class="muted">Захиалгын мэдээлэл алга.</p>`;
    return;
  }

  adminOrderRows.innerHTML = orders.map(renderAdminOrderCard).join("");
}

function renderAdminOrderCard(order) {
  const normalizedOrder = normalizeOrderForUi(order);
  const dateLabel = formatOrderDate(normalizedOrder.createdAt);
  const statusClass = getStatusClass(normalizedOrder.status);
  const productText = normalizedOrder.items.map((item) => `${escapeHtml(item.name)} x${item.qty}`).join(", ");

  return `
    <article class="order-card order-card--supplier order-card--admin">
      <div class="order-card-header">
        <div class="order-card-title-row">
          <strong class="order-id">Захиалга #${normalizedOrder.id}</strong>
          <span class="status status--${statusClass}">${escapeHtml(normalizedOrder.status)}</span>
        </div>
        <div class="order-card-date">${dateLabel}</div>
      </div>
      <div class="order-card-body">
        <div class="order-details-row">
          <div class="order-detail-item">
            <span class="detail-label">Худалдан авагч</span>
            <span class="detail-value">${escapeHtml(normalizedOrder.buyerCompany)}</span>
          </div>
          <div class="order-detail-item">
            <span class="detail-label">Нийлүүлэгч</span>
            <span class="detail-value">${escapeHtml(normalizedOrder.supplierCompany)}</span>
          </div>
        </div>
        <div class="order-details-row">
          <div class="order-detail-item">
            <span class="detail-label">Үнийн дүн</span>
            <span class="detail-value price-highlight">${formatMoney(normalizedOrder.finalAmount)}</span>
          </div>
          <div class="order-detail-item">
            <span class="detail-label">Төлбөр</span>
            <span class="detail-value">${escapeHtml(normalizedOrder.paymentStatus)}</span>
          </div>
        </div>
        <div class="order-items-section">
          <span class="detail-label">Бараа</span>
          <div class="order-items-text">${productText}</div>
        </div>
        ${renderOrderFulfillmentMeta(normalizedOrder)}
        ${renderOrderProgress(normalizedOrder)}
        ${renderOrderRewardBreakdown(normalizedOrder)}
      </div>
    </article>
  `;
}

function renderAdminCharts() {
  if (!adminOrderChart || !adminSupplierChart) return;

  const statusCounts = {
    "Шинэ": 0,
    "Нийлүүлэгч хүлээн авсан": 0,
    "Хүргэлтэд гарсан": 0,
    "Худалдан авагч хүлээн авсан": 0,
  };

  state.orders.forEach((order) => {
    const key = normalizeOrderStatus(order.status);
    if (Object.prototype.hasOwnProperty.call(statusCounts, key)) {
      statusCounts[key] += 1;
    }
  });

  const supplierTotals = {};
  state.orders.forEach((order) => {
    if (!supplierTotals[order.supplierCompany]) supplierTotals[order.supplierCompany] = 0;
    supplierTotals[order.supplierCompany] += getOrderPayableAmountClient(order);
  });
  const supplierRows = Object.entries(supplierTotals).sort((a, b) => b[1] - a[1]).slice(0, 6);

  adminOrderChart.innerHTML = renderBars(
    Object.entries(statusCounts).map(([label, value]) => ({ label, value })),
    (v) => `${v}`
  );
  adminSupplierChart.innerHTML = renderBars(
    supplierRows.map(([label, value]) => ({ label, value })),
    (v) => formatMoney(v)
  );
}

function renderBars(rows, formatter) {
  if (!rows.length) return `<p class="muted">Графикийн өгөгдөл алга.</p>`;
  const maxValue = Math.max(...rows.map((row) => row.value), 1);
  return rows
    .map((row) => {
      const percent = Math.round((row.value / maxValue) * 100);
      return `
        <div class="chart-bar">
          <div class="chart-label">
            <span>${escapeHtml(row.label)}</span>
            <strong>${formatter(row.value)}</strong>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${percent}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function updateSupplierStock(productId, delta) {
  const session = state.session;
  if (!session || session.role !== "supplier") return;
  if (!ensureVerifiedSupplierAccess("Барааны нөөц шинэчлэх")) return;
  const product = state.products.find((item) => item.id === productId);
  if (!product || !isSameCompany(product.supplierCompany, session.company)) return;

  product.stock = Math.max(0, product.stock + delta);
  saveState();
  renderApp();
}

function deleteSupplierProduct(productId) {
  const session = state.session;
  if (!session || session.role !== "supplier") return;
  if (!ensureVerifiedSupplierAccess("Бараа устгах")) return;
  const product = state.products.find((item) => item.id === productId);
  if (!product || !isSameCompany(product.supplierCompany, session.company)) return;
  if (!window.confirm(`"${product.name}" барааг устгах уу?`)) return;

  state.products = state.products.filter((item) => item.id !== productId);
  Object.keys(state.carts).forEach((company) => {
    state.carts[company] = (state.carts[company] || []).filter((line) => line.productId !== productId);
  });
  saveState();
  renderApp();
  showToast("Бараа устгалаа.");
}

function updateOrderStatus(orderId, status, deliveryStatus) {
  const session = state.session;
  if (!session || session.role !== "supplier") return;
  if (!ensureVerifiedSupplierAccess("Захиалгын төлөв шинэчлэх")) return;
  const order = state.orders.find((item) => item.id === orderId);
  if (!order || !isSameCompany(order.supplierCompany, session.company)) return;

  const normalizedCurrentStatus = normalizeOrderStatus(order.status);
  const normalizedPaymentStatus = normalizePaymentStatus(order.paymentStatus);

  if (normalizedCurrentStatus === "Шинэ" && !isPaymentCompleted(normalizedPaymentStatus)) {
    showToast("Энэ захиалгын төлбөр баталгаажаагүй байна.");
    return;
  }

  const nowIso = new Date().toISOString();
  order.status = status;
  order.deliveryStatus = deliveryStatus;
  order.statusUpdatedAt = nowIso;
  if (status === "Нийлүүлэгч хүлээн авсан") {
    order.supplierAcceptedAt = nowIso;
  }
  if (status === "Хүргэлтэд гарсан") {
    order.shippedAt = nowIso;
  }
  const payoutTransferred = transferSupplierPayout(order);
  saveState();
  renderApp();
  if (payoutTransferred) {
    showToast("Хүлээн авалт баталгаажлаа. Шимтгэл суутгаад нийлүүлэгч рүү шилжүүллээ.");
  } else {
    if (status === "Нийлүүлэгч хүлээн авсан") {
      showToast("Захиалгыг нийлүүлэгч хүлээн авлаа.");
      return;
    }
    if (status === "Хүргэлтэд гарсан") {
      showToast("Захиалгыг хүргэлтэд гаргалаа.");
      return;
    }
    showToast("Захиалгын төлөв шинэчлэгдлээ.");
  }
}

function transferSupplierPayout(order) {
  if (!order || typeof order !== "object") return false;
  if (!isOrderDelivered(order.status)) return false;
  if (!isPaymentCompleted(order.paymentStatus)) return false;
  if (isPayoutTransferred(order.payoutStatus)) return false;

  order.payoutStatus = "Шилжүүлсэн";
  order.payoutTransferredAt = new Date().toISOString();
  order.paymentStatus = "Нийлүүлэгчид шилжүүлсэн";
  return true;
}

function markOrderPaid(orderId) {
  const session = state.session;
  if (!session || session.role !== "supplier") return;
  if (!ensureVerifiedSupplierAccess("Төлбөр баталгаажуулах")) return;
  const order = state.orders.find((item) => item.id === orderId);
  if (!order || !isSameCompany(order.supplierCompany, session.company)) return;
  order.paymentStatus = "Эскроу төлөгдсөн";
  transferSupplierPayout(order);
  saveState();
  renderApp();
  showToast("Төлбөрийн төлөв шинэчлэгдлээ.");
}

function transferOrderPayout(orderId) {
  const session = state.session;
  if (!session || session.role !== "supplier") return;
  if (!ensureVerifiedSupplierAccess("Шилжүүлэг хийх")) return;

  const order = state.orders.find((item) => item.id === orderId);
  if (!order || !isSameCompany(order.supplierCompany, session.company)) return;

  if (!isOrderDelivered(order.status)) {
    showToast("Хүргэлт дууссаны дараа шилжүүлэг хийгдэнэ.");
    return;
  }
  if (!isPaymentCompleted(order.paymentStatus)) {
    showToast("Эхлээд төлбөр эскроу дээр орсон байх ёстой.");
    return;
  }
  if (!transferSupplierPayout(order)) {
    showToast("Шилжүүлэг аль хэдийн хийгдсэн байна.");
    return;
  }

  saveState();
  renderApp();
  showToast("Нийлүүлэгч рүү шилжүүлэг амжилттай хийгдлээ.");
}

function isOrderDelivered(status) {
  const normalized = String(normalizeOrderStatus(status) || "").trim().toLowerCase();
  return (
    normalized === "худалдан авагч хүлээн авсан" ||
    normalized === "����������" ||
    normalized === "delivered" ||
    normalized === "completed"
  );
}

function isPaymentCompleted(status) {
  return normalizePaymentStatus(status) !== "Төлөгдөөгүй";
}

function isPayoutTransferred(status) {
  return normalizePayoutStatus(status) === "Шилжүүлсэн";
}

function markOrderReceivedByBuyer(orderId) {
  const session = state.session;
  if (!session || session.role !== "buyer") return;

  const order = state.orders.find((item) => item.id === orderId);
  const rewardUser = getCurrentBuyerRewardUser();
  if (!order || !isSameCompany(order.buyerCompany, session.company)) return;

  if (normalizeOrderStatus(order.status) !== "Хүргэлтэд гарсан") {
    showToast("Хүргэлтэд гарсны дараа хүлээн авалтаа баталгаажуулна.");
    return;
  }
  if (!isPaymentCompleted(order.paymentStatus)) {
    showToast("Энэ захиалгын төлбөр баталгаажаагүй байна.");
    return;
  }

  const nowIso = new Date().toISOString();
  let awardedPoints = 0;
  order.status = "Худалдан авагч хүлээн авсан";
  order.deliveryStatus = "Хүлээн авсан";
  order.statusUpdatedAt = nowIso;
  order.receivedAt = nowIso;
  if (normalizeRewardStatusClient(order.rewardStatus, "pending") !== "earned" && rewardUser) {
    const earnedPoints = Math.max(0, Number(order.earnedPoints || calculateEarnedPointsClient(getOrderPayableAmountClient(order))));
    rewardUser.rewardPoints = Math.max(0, Number(rewardUser.rewardPoints || 0) + earnedPoints);
    rewardUser.totalEarnedPoints = Math.max(0, Number(rewardUser.totalEarnedPoints || 0) + earnedPoints);
    order.rewardStatus = "earned";
    order.earnedPoints = earnedPoints;
    awardedPoints = earnedPoints;
  }
  const payoutTransferred = transferSupplierPayout(order);
  saveState();
  renderApp();
  if (awardedPoints > 0) {
    showToast(`Таны захиалга амжилттай. ${awardedPoints.toLocaleString("mn-MN")} бонус оноо нэмэгдлээ.`, "success");
    return;
  }
  if (payoutTransferred) {
    showToast("Хүлээн авалт баталгаажлаа. Захиалга амжилттай дууслаа.");
    return;
  }
  showToast("Хүлээн авалт баталгаажлаа.");
}

async function onAddProduct(event) {
  event.preventDefault();
  const session = state.session;
  if (!session || session.role !== "supplier") return;
  if (!ensureVerifiedSupplierAccess("Бараа нэмэх")) return;

  const name = String(document.getElementById("productName")?.value || "").trim();
  const categoryInput = String(productCategoryInput?.value || "").trim();
  const price = Number(document.getElementById("productPrice")?.value || 0);
  const unit = String(document.getElementById("productUnit")?.value || "").trim();
  const minOrder = Number(document.getElementById("productMinOrder")?.value || 0);
  const stock = Number(document.getElementById("productStock")?.value || 0);

  if (!name || !categoryInput || price <= 0 || !unit || minOrder <= 0 || stock < 0) {
    showToast("Барааны мэдээллийг зөв бөглөнө үү.");
    return;
  }

  const category = normalizeCategory(categoryInput);
  let image;
  try {
    image = await resolveProductImage(category);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Зураг боловсруулахад алдаа гарлаа.");
    return;
  }

  state.products.push({
    id: state.nextProductId++,
    name,
    category,
    price,
    unit,
    minOrder,
    stock,
    supplierCompany: session.company,
    image,
  });

  saveState();
  productForm?.reset();
  populateProductCategoryOptions();
  setProductImagePreview("");
  if (productImageFileInput) productImageFileInput.value = "";
  closeAddProductModal();
  renderApp();
  showToast("Шинэ бараа нэмэгдлээ.");
}

function normalizeCategory(value) {
  const clean = String(value || "").toLowerCase().trim();
  if (!clean) return "vegetables";
  if (CATEGORY_LABELS[clean]) return clean;

  if (clean.includes("vegetable") || clean.includes("fruit") || clean.includes("\u043d\u043e\u0433\u043e\u043e") || clean.includes("\u0436\u0438\u043c\u0441")) return "vegetables";
  if (clean.includes("meat") || clean.includes("beef") || clean.includes("chicken") || clean.includes("\u043c\u0430\u0445")) return "meat";
  if (clean.includes("dairy") || clean.includes("milk") || clean.includes("cheese") || clean.includes("yogurt") || clean.includes("\u0441\u04af\u04af") || clean.includes("\u0446\u0430\u0433\u0430\u0430\u043d")) return "dairy";
  if (clean.includes("bakery") || clean.includes("bread") || clean.includes("flour") || clean.includes("pastry") || clean.includes("\u0442\u0430\u043b\u0445") || clean.includes("\u0433\u0443\u0440\u0438\u043b")) return "bakery";
  if (clean.includes("beverage") || clean.includes("drink") || clean.includes("juice") || clean.includes("water") || clean.includes("soda") || clean.includes("\u0443\u043d\u0434\u0430\u0430") || clean.includes("\u0448\u04af\u04af\u0441")) return "beverages";
  if (clean.includes("confection") || clean.includes("candy") || clean.includes("sweet") || clean.includes("choco") || clean.includes("\u0447\u0438\u0445\u044d\u0440") || clean.includes("\u0448\u043e\u043a\u043e\u043b\u0430\u0434") || clean.includes("\u0430\u043c\u0442\u0442\u0430\u043d")) return "confectionery";
  if (clean.includes("ice cream") || clean.includes("icecream") || clean.includes("frozen") || clean.includes("gelato") || clean.includes("\u0437\u0430\u0439\u0440\u043c\u0430\u0433") || clean.includes("\u0445\u04e9\u043b\u0434\u04e9\u04e9\u0441\u04e9\u043d")) return "frozen";

  return clean.replace(/\s+/g, "-");
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString("mn-MN")} ₮`;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(text) {
  return escapeHtml(text).replaceAll("`", "&#96;");
}

let toastTimer;
function showToast(message, tone = "info") {
  if (!toast) return;
  toast.textContent = repairMojibakeString(String(message || ""));
  repairDomMojibake(toast);
  toast.classList.remove("toast--success", "toast--warning", "toast--error", "toast--info");
  if (tone) {
    toast.classList.add(`toast--${tone}`);
  }
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 1800);
}

function normalizeOrderStatus(status) {
  const original = String(status || "").trim();
  if (!original) return "Шинэ";

  const repaired = repairMojibakeString(original).toLowerCase();
  const raw = original.toLowerCase();
  const combined = `${repaired} ${raw}`;

  if (repaired === "шинэ" || combined.includes("шинэ") || /\bnew\b/.test(combined)) return "Шинэ";
  if (
    repaired === "нийлүүлэгч хүлээн авсан" ||
    combined.includes("нийлүүлэгч хүлээн авсан") ||
    combined.includes("баталгаажсан") ||
    combined.includes("confirmed") ||
    combined.includes("бэлтгэж байна") ||
    combined.includes("processing")
  ) {
    return "Нийлүүлэгч хүлээн авсан";
  }
  if (
    repaired === "хүргэлтэд гарсан" ||
    combined.includes("хүргэлтэд гарсан") ||
    combined.includes("замд") ||
    combined.includes("in-transit") ||
    combined.includes("shipped")
  ) {
    return "Хүргэлтэд гарсан";
  }
  if (
    repaired === "худалдан авагч хүлээн авсан" ||
    combined.includes("худалдан авагч хүлээн авсан") ||
    combined.includes("хүргэгдсэн") ||
    combined.includes("delivered") ||
    combined.includes("completed") ||
    combined.includes("хүлээн авсан")
  ) {
    return "Худалдан авагч хүлээн авсан";
  }

  return "Шинэ";
}

function normalizePaymentStatus(status) {
  const original = String(status || "").trim();
  if (!original) return "Төлөгдөөгүй";

  const repaired = repairMojibakeString(original).toLowerCase();
  const raw = original.toLowerCase();
  const combined = `${repaired} ${raw}`;

  const isTransferred =
    repaired === "нийлүүлэгчид шилжүүлсэн" ||
    combined.includes("нийлүүлэгчид шилжүүлсэн") ||
    combined.includes("шилжүүлсэн") ||
    /\btransferred\b/.test(combined) ||
    /\bpayouted\b/.test(combined);

  if (isTransferred) return "Нийлүүлэгчид шилжүүлсэн";

  const isUnpaid =
    repaired === "төлөгдөөгүй" ||
    combined.includes("төлөгдөөгүй") ||
    combined.includes("������") ||
    combined.includes("дөөгүй".toLowerCase()) ||
    /\bunpaid\b/.test(combined) ||
    /\bpending\b/.test(combined);

  if (isUnpaid) return "Төлөгдөөгүй";

  const isEscrowPaid =
    repaired === "эскроу төлөгдсөн" ||
    combined.includes("эскроу төлөгдсөн") ||
    combined.includes("escrow") ||
    combined.includes("веб сайт дээр төлөгдсөн");

  if (isEscrowPaid) return "Эскроу төлөгдсөн";

  const isPaidDirect =
    repaired === "төлөгдсөн" ||
    combined.includes("төлөгдсөн") ||
    combined.includes("����") ||
    combined.includes("дсөн".toLowerCase()) ||
    /\bpaid\b/.test(combined);

  if (isPaidDirect) return "Төлөгдсөн";

  return "Төлөгдөөгүй";
}

function normalizePayoutStatus(status) {
  const original = String(status || "").trim();
  if (!original) return "Хүлээгдэж байна";

  const repaired = repairMojibakeString(original).toLowerCase();
  const raw = original.toLowerCase();
  const combined = `${repaired} ${raw}`;

  if (
    repaired === "шилжүүлсэн" ||
    combined.includes("шилжүүлсэн") ||
    /\btransferred\b/.test(combined)
  ) {
    return "Шилжүүлсэн";
  }

  return "Хүлээгдэж байна";
}

function normalizeDeliveryStatus(status, normalizedOrderStatus = "Шинэ", normalizedPaymentStatus = "Төлөгдөөгүй") {
  const original = String(status || "").trim();
  const repaired = repairMojibakeString(original).toLowerCase();
  const raw = original.toLowerCase();
  const combined = `${repaired} ${raw}`;

  if (
    normalizedOrderStatus === "Худалдан авагч хүлээн авсан" ||
    combined.includes("хүлээн авсан") ||
    combined.includes("хүргэгдсэн") ||
    combined.includes("delivered")
  ) {
    return "Хүлээн авсан";
  }

  if (
    normalizedOrderStatus === "Хүргэлтэд гарсан" ||
    combined.includes("замд") ||
    combined.includes("хүргэлтэд гарсан") ||
    combined.includes("in-transit") ||
    combined.includes("shipped")
  ) {
    return "Замд";
  }

  if (
    normalizedOrderStatus === "Нийлүүлэгч хүлээн авсан" ||
    combined.includes("бэлтгэж байна") ||
    combined.includes("processing")
  ) {
    return "Бэлтгэж байна";
  }

  if (normalizedPaymentStatus !== "Төлөгдөөгүй") {
    return "Нийлүүлэгч хүлээн авахыг хүлээж байна";
  }

  return "Төлбөр хүлээгдэж байна";
}

function normalizeOrderForUi(order) {
  const normalizedStatus = normalizeOrderStatus(order?.status);
  const normalizedPaymentStatus = normalizePaymentStatus(order?.paymentStatus);
  const platformFeeAmount = Math.max(0, Number(order?.platformFeeAmount || 0));
  const supplierPayoutAmount = Math.max(0, Number(order?.supplierPayoutAmount || Number(order?.total || 0) - platformFeeAmount));
  return {
    ...order,
    status: normalizedStatus,
    paymentStatus: normalizedPaymentStatus,
    subtotal: Math.max(0, Number(order?.subtotal ?? order?.total ?? 0)),
    discountAmount: Math.max(0, Number(order?.discountAmount || 0)),
    usedPoints: Math.max(0, Number(order?.usedPoints || 0)),
    earnedPoints: Math.max(0, Number(order?.earnedPoints || 0)),
    finalAmount: getOrderPayableAmountClient(order),
    rewardStatus: normalizeRewardStatusClient(order?.rewardStatus, "pending"),
    appliedCouponCode: normalizeCouponCodeClient(order?.appliedCouponCode || ""),
    pickupDate: String(order?.pickupDate || ""),
    pickupTimeSlot: String(order?.pickupTimeSlot || ""),
    pickupNote: String(order?.pickupNote || ""),
    deliveryAddress: String(order?.deliveryAddress || ""),
    locationNote: String(order?.locationNote || ""),
    contactPhone: String(order?.contactPhone || ""),
    latitude: Number.isFinite(Number(order?.latitude)) ? Number(order.latitude) : null,
    longitude: Number.isFinite(Number(order?.longitude)) ? Number(order.longitude) : null,
    mapUrl: normalizeExternalLinkValue(order?.mapUrl || ""),
    deliveryStatus: normalizeDeliveryStatus(order?.deliveryStatus, normalizedStatus, normalizedPaymentStatus),
    platformFeeRate: Number(order?.platformFeeRate || PLATFORM_COMMISSION_RATE),
    platformFeeAmount,
    supplierPayoutAmount,
    payoutStatus: normalizePayoutStatus(order?.payoutStatus),
    payoutTransferredAt: String(order?.payoutTransferredAt || ""),
    paymentMethod: String(order?.paymentMethod || "supplier_qpay"),
    paymentRequestedAt: String(order?.paymentRequestedAt || ""),
    paymentConfirmedAt: String(order?.paymentConfirmedAt || ""),
    statusUpdatedAt: String(order?.statusUpdatedAt || ""),
    supplierAcceptedAt: String(order?.supplierAcceptedAt || ""),
    shippedAt: String(order?.shippedAt || ""),
    receivedAt: String(order?.receivedAt || ""),
    qpayInvoiceId: String(order?.qpayInvoiceId || ""),
    qpayInvoiceNo: String(order?.qpayInvoiceNo || ""),
    qpayQrText: String(order?.qpayQrText || ""),
    qpayQrImage: String(order?.qpayQrImage || ""),
    qpayDeepLink: String(order?.qpayDeepLink || ""),
    qpayWebUrl: String(order?.qpayWebUrl || ""),
    qpayReceiverCode: String(order?.qpayReceiverCode || ""),
    qpayStatus: String(order?.qpayStatus || "NOT_REQUESTED"),
    qpayMode: String(order?.qpayMode || "mock"),
    qpayPaidAt: String(order?.qpayPaidAt || ""),
  };
}

function getStatusClass(status) {
  const normalizedStatus = normalizeOrderStatus(status);
  if (normalizedStatus === "Шинэ") return "s-new";
  if (normalizedStatus === "Худалдан авагч хүлээн авсан") return "s-done";
  return "s-proc";
}

function getOrderStepIndex(status) {
  const normalizedStatus = normalizeOrderStatus(status);
  const index = ORDER_STEP_FLOW.findIndex((step) => step.key === normalizedStatus);
  return index >= 0 ? index : 0;
}

function getSupplierPrimaryAction(order) {
  if (!isSupplierVerifiedUser()) {
    return null;
  }
  const normalizedStatus = normalizeOrderStatus(order.status);
  const normalizedPaymentStatus = normalizePaymentStatus(order.paymentStatus);

  if (normalizedStatus === "Шинэ" && normalizedPaymentStatus !== "Төлөгдөөгүй") {
    return { action: "order-confirm", label: "Хүлээн авах" };
  }
  if (normalizedStatus === "Нийлүүлэгч хүлээн авсан") {
    return { action: "order-ship", label: "Хүргэлтэд гаргах" };
  }

  return null;
}

function renderOrderProgress(order) {
  const activeStepIndex = getOrderStepIndex(order.status);
  return `
    <ol class="order-progress" aria-label="Захиалгын төлөв">
      ${ORDER_STEP_FLOW.map((step, index) => {
        const stepClass = index < activeStepIndex ? "is-done" : index === activeStepIndex ? "is-active" : "";
        return `<li class="${stepClass}"><span>${escapeHtml(step.label)}</span></li>`;
      }).join("")}
    </ol>
  `;
}

function renderOrderPaymentMeta(order, withDemoHint = false) {
  const normalizedPaymentStatus = normalizePaymentStatus(order.paymentStatus);
  const normalizedOrderStatus = normalizeOrderStatus(order.status);
  const normalizedDeliveryStatus = normalizeDeliveryStatus(
    order.deliveryStatus,
    normalizedOrderStatus,
    normalizedPaymentStatus
  );
  const isPaid = normalizedPaymentStatus !== "Төлөгдөөгүй";
  const paymentClass = isPaid ? "is-paid" : "is-unpaid";
  const paymentText =
    normalizedPaymentStatus === "Төлөгдсөн"
      ? "Төлбөр баталгаажсан"
      : normalizedPaymentStatus === "Нийлүүлэгчид шилжүүлсэн"
        ? "Нийлүүлэгчид шилжсэн"
        : normalizedPaymentStatus === "Эскроу төлөгдсөн"
          ? "Төлбөр баталгаажсан"
          : "QPay төлбөр хүлээгдэж байна";
  const fee = formatMoney(Number(order.platformFeeAmount || 0));
  const payout = formatMoney(Number(order.supplierPayoutAmount || 0));
  const rewardTextParts = [];
  if (Number(order.discountAmount || 0) > 0) {
    rewardTextParts.push(`Хөнгөлөлт: -${formatMoney(Number(order.discountAmount || 0))}`);
  }
  if (Number(order.usedPoints || 0) > 0) {
    rewardTextParts.push(`Бонус ашигласан: -${formatMoney(Number(order.usedPoints || 0))}`);
  }
  if (Number(order.earnedPoints || 0) > 0) {
    const rewardLabel =
      normalizeRewardStatusClient(order.rewardStatus, "pending") === "earned"
        ? "Олгосон бонус"
        : "Цуглах бонус";
    rewardTextParts.push(`${rewardLabel}: +${Math.max(0, Number(order.earnedPoints || 0)).toLocaleString("mn-MN")} оноо`);
  }
  if (order.appliedCouponCode) {
    rewardTextParts.push(`Купон: ${escapeHtml(order.appliedCouponCode)}`);
  }
  const payoutText = safeUiText(order.payoutStatus, "Шууд нийлүүлэгч рүү");
  const demoNote =
    withDemoHint
      ? `<p class="muted payment-demo-note">Урсгал: ЖДБ төлбөрөө баталгаажуулна, нийлүүлэгч захиалгыг хүлээн авч хүргэлтэд гаргана, дараа нь ЖДБ хүлээн авалтаа баталгаажуулна.</p>`
      : "";

  return `
    <div class="order-meta-row">
      <span class="payment-pill ${paymentClass}">${paymentText}</span>
      <span class="muted">Хүргэлт: ${escapeHtml(normalizedDeliveryStatus)}</span>
    </div>
    <div class="order-meta-row">
      <span class="muted">Шимтгэл: ${fee}</span>
      <span class="muted">Нийлүүлэгчид: ${payout}</span>
      <span class="muted">Шилжүүлэг: ${payoutText}</span>
    </div>
    ${demoNote}
  `;
}

function formatOrderDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Огноо тодорхойгүй";
  return parsed.toLocaleString("mn-MN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isBuyerOrderArchived(order) {
  const normalizedOrder = normalizeOrderForUi(order);
  return isOrderDelivered(normalizedOrder.status) && isPaymentCompleted(normalizedOrder.paymentStatus);
}

function canBuyerEditOrder(order) {
  const normalizedOrder = normalizeOrderForUi(order);
  return normalizeOrderStatus(normalizedOrder.status) === "Шинэ" && !isPaymentCompleted(normalizedOrder.paymentStatus);
}

function canBuyerDeleteOrder(order) {
  return canBuyerEditOrder(order);
}

function canBuyerConfirmReceipt(order) {
  const normalizedOrder = normalizeOrderForUi(order);
  return (
    normalizeOrderStatus(normalizedOrder.status) === "Хүргэлтэд гарсан" &&
    isPaymentCompleted(normalizedOrder.paymentStatus)
  );
}

function renderBuyerOrderActions(order) {
  const normalizedOrder = normalizeOrderForUi(order);
  const actions = [];
  let passiveNote = "";

  if (!isPaymentCompleted(normalizedOrder.paymentStatus)) {
    const payLabel = normalizedOrder.qpayInvoiceId ? "QPay үргэлжлүүлэх" : "QPay төлөх";
    actions.push(
      `<button class="btn btn-primary" type="button" data-action="order-pay-buyer" data-order-id="${normalizedOrder.id}">${payLabel}</button>`
    );
  }

  if (canBuyerEditOrder(normalizedOrder)) {
    actions.push(
      `<button class="btn btn-light" type="button" data-action="order-edit-buyer" data-order-id="${normalizedOrder.id}">Засах</button>`
    );
  }

  if (canBuyerDeleteOrder(normalizedOrder)) {
    actions.push(
      `<button class="btn btn-light order-danger-btn" type="button" data-action="order-delete-buyer" data-order-id="${normalizedOrder.id}">Устгах</button>`
    );
  }

  if (canBuyerConfirmReceipt(normalizedOrder)) {
    actions.push(
      `<button class="btn btn-primary" type="button" data-action="order-receive-buyer" data-order-id="${normalizedOrder.id}">Хүлээн авлаа</button>`
    );
  }

  if (!actions.length) {
    const normalizedStatus = normalizeOrderStatus(normalizedOrder.status);
    if (!isPaymentCompleted(normalizedOrder.paymentStatus)) {
      passiveNote = "QPay төлбөр баталгаажмагц нийлүүлэгчид харагдана.";
    } else if (normalizedStatus === "Шинэ") {
      passiveNote = "Нийлүүлэгч захиалгыг хүлээн авахыг хүлээж байна.";
    } else if (normalizedStatus === "Нийлүүлэгч хүлээн авсан") {
      passiveNote = "Нийлүүлэгч барааг бэлдэж байна.";
    } else if (normalizedStatus === "Худалдан авагч хүлээн авсан") {
      passiveNote = "Захиалга амжилттай дууссан.";
    }
    return `<div class="muted buyer-order-note">${escapeHtml(passiveNote || "Энэ захиалга одоо зөвхөн хянах төлөвтэй байна.")}</div>`;
  }

  return `<div class="table-actions order-management-actions">${actions.join("")}</div>`;
}

function restoreOrderStock(order) {
  (order?.items || []).forEach((item) => {
    const product = state.products.find((row) => row.id === Number(item.productId || 0));
    if (!product) return;
    product.stock = Math.max(0, Number(product.stock || 0) + Math.max(1, Number(item.qty || 0)));
  });
}

function mergeOrderItemsIntoCart(order) {
  const cart = getCurrentCart();
  (order?.items || []).forEach((item) => {
    const productId = Number(item.productId || 0);
    if (!productId) return;
    const existing = cart.find((line) => Number(line.productId || 0) === productId);
    const qty = Math.max(1, Number(item.qty || 0));
    if (existing) existing.qty += qty;
    else cart.push({ productId, qty });
  });
}

function getBuyerOwnedOrder(orderId) {
  const session = state.session;
  if (!session || session.role !== "buyer") return null;
  const order = state.orders.find((item) => item.id === orderId);
  if (!order || !isSameCompany(order.buyerCompany, session.company)) return null;
  return order;
}

function editBuyerOrder(orderId) {
  const order = getBuyerOwnedOrder(orderId);
  if (!order) return;
  if (!canBuyerEditOrder(order)) {
    showToast("Энэ захиалгыг засах боломжгүй байна.");
    return;
  }
  if (!window.confirm(`Захиалга #${order.id}-г сагс руу буцааж засах уу?`)) return;

  activeQPayOrderQueue = activeQPayOrderQueue.filter((id) => id !== order.id);
  if (activeQPayOrderId === order.id) closeQPayModal();
  restoreOrderStock(order);
  restoreRewardUsageFromOrder(order);
  restoreCouponUsageFromOrder(order);
  activeCartCouponCode = normalizeCouponCodeClient(order.appliedCouponCode || "");
  activeCartCouponMessage = activeCartCouponCode ? `${activeCartCouponCode} купон сэргээгдлээ.` : "";
  if (cartCouponInput) cartCouponInput.value = activeCartCouponCode;
  if (cartPointsInput) {
    cartPointsInput.value = Number(order.usedPoints || 0) > 0 ? String(Math.max(0, Number(order.usedPoints || 0))) : "";
  }
  restoreCheckoutFieldsFromOrder(order);
  mergeOrderItemsIntoCart(order);
  state.orders = state.orders.filter((item) => item.id !== order.id);
  saveState();
  renderApp();
  openCartDrawer();
  showToast("Захиалгыг сагс руу буцаалаа. Одоо засварлаж болно.");
}

function deleteBuyerOrder(orderId) {
  const order = getBuyerOwnedOrder(orderId);
  if (!order) return;
  if (!canBuyerDeleteOrder(order)) {
    showToast("Энэ захиалгыг устгах боломжгүй байна.");
    return;
  }
  if (!window.confirm(`Захиалга #${order.id}-г устгах уу?`)) return;

  activeQPayOrderQueue = activeQPayOrderQueue.filter((id) => id !== order.id);
  if (activeQPayOrderId === order.id) closeQPayModal();
  restoreOrderStock(order);
  restoreRewardUsageFromOrder(order);
  restoreCouponUsageFromOrder(order);
  state.orders = state.orders.filter((item) => item.id !== order.id);
  saveState();
  renderApp();
  showToast("Захиалга устгагдлаа.");
}

function renderOrderCard(order) {
  const normalizedOrder = normalizeOrderForUi(order);
  const dateLabel = formatOrderDate(normalizedOrder.createdAt);
  const statusClass = getStatusClass(normalizedOrder.status);
  const productText = normalizedOrder.items.map((item) => `${escapeHtml(item.name)} x${item.qty}`).join(", ");

  return `
    <article class="order-card order-card--buyer">
      <div class="row">
        <strong>Захиалга #${normalizedOrder.id}</strong>
        <span class="status status--${statusClass}">${escapeHtml(normalizedOrder.status)}</span>
      </div>
      <div class="muted">Нийлүүлэгч: ${escapeHtml(normalizedOrder.supplierCompany)}</div>
      <div class="muted order-items">${productText}</div>
      ${renderOrderProgress(normalizedOrder)}
      ${renderOrderPaymentMeta(normalizedOrder, true)}
      ${renderOrderRewardBreakdown(normalizedOrder)}
      <div class="row">
        <strong>${formatMoney(normalizedOrder.finalAmount)}</strong>
        <span class="muted">${dateLabel}</span>
      </div>
      ${renderBuyerOrderActions(normalizedOrder)}
    </article>
  `;
}

function renderSupplierOrderCard(order) {
  const normalizedOrder = normalizeOrderForUi(order);
  const dateLabel = formatOrderDate(normalizedOrder.createdAt);
  const statusClass = getStatusClass(normalizedOrder.status);
  const productText = normalizedOrder.items.map((item) => `${escapeHtml(item.name)} x${item.qty}`).join(", ");
  const nextAction = getSupplierPrimaryAction(normalizedOrder);
  const canManageSupplier = isSupplierVerifiedUser();
  const isPaid = normalizedOrder.paymentStatus === "Төлөгдсөн";
  const paymentStatusBadgeClass = isPaid ? "payment-badge--paid" : "payment-badge--pending";
  const paymentStatusLabel = isPaid ? "✓ Төлөгдсөн" : "⏱ Хүлээгдэж байна";
  
  let actionButton = canManageSupplier
    ? `<span class="muted">Дараагийн үйлдэл байхгүй.</span>`
    : `<span class="muted">Нийлүүлэгчийн бүртгэл баталгаажаагүй байна.</span>`;

  if (canManageSupplier && nextAction) {
    actionButton = `<button class="btn btn-primary btn-action" type="button" data-action="${nextAction.action}" data-order-id="${normalizedOrder.id}">${nextAction.label}</button>`;
  } else if (canManageSupplier && !isPaymentCompleted(normalizedOrder.paymentStatus) && normalizeOrderStatus(normalizedOrder.status) === "Шинэ") {
    actionButton = `<span class="muted">ЖДБ төлбөрөө баталгаажуулахыг хүлээж байна.</span>`;
  } else if (canManageSupplier && normalizeOrderStatus(normalizedOrder.status) === "Хүргэлтэд гарсан") {
    actionButton = `<span class="muted">Худалдан авагч хүлээн авалтаа баталгаажуулахыг хүлээж байна.</span>`;
  }

  return `
    <article class="order-card order-card--supplier">
      <div class="order-card-header">
        <div class="order-card-title-row">
          <strong class="order-id">Захиалга #${normalizedOrder.id}</strong>
          <span class="status status--${statusClass}">${escapeHtml(normalizedOrder.status)}</span>
        </div>
        <div class="order-card-date">${dateLabel}</div>
      </div>
      
      <div class="order-card-body">
        <div class="order-details-row">
          <div class="order-detail-item">
            <span class="detail-label">Худалдан авагч</span>
            <span class="detail-value">${escapeHtml(normalizedOrder.buyerCompany)}</span>
          </div>
          <div class="order-detail-item">
            <span class="detail-label">Үнийн дүн</span>
            <span class="detail-value price-highlight">${formatMoney(normalizedOrder.finalAmount)}</span>
          </div>
        </div>
        
        <div class="order-items-section">
          <span class="detail-label">Бараа</span>
          <div class="order-items-text">${productText}</div>
        </div>
        ${renderOrderFulfillmentMeta(normalizedOrder)}
        ${renderOrderProgress(normalizedOrder)}
        ${renderOrderRewardBreakdown(normalizedOrder)}

        <div class="order-payment-section">
          <span class="payment-badge ${paymentStatusBadgeClass}">${paymentStatusLabel}</span>
          <span class="delivery-status">Хүргэлт: ${escapeHtml(normalizedOrder.deliveryStatus)}</span>
        </div>
      </div>
      
      <div class="order-card-footer">
        <div class="table-actions table-actions--single">
          ${actionButton}
        </div>
      </div>
    </article>
  `;
}
