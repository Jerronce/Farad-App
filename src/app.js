import "./styles.css";
import { captureAppError, initProductionMonitoring, setMonitoringUser } from "./services/monitoring.js";
import {
  firebaseReady,
  ROOT_ADMIN_EMAILS,
  db,
  firebaseHelpers,
  signUpAccount,
  signInAccount,
  signInWithGoogleFlow,
  ensureGoogleAccountRecord,
  readPreferredRole,
  rememberPreferredRole,
  resolveGoogleRedirectFlow,
  loadAccountRecord,
  loadAccessApprovalByEmail,
  requestPasswordReset,
  subscribeToAuth,
  logout,
  updateAccountRecord,
  ensureAuthPersistence,
  waitForCurrentAuthUser
} from "./config/firebase.js";
import { geocodePlace, runFleetConversation } from "./services/gemini.js";
import {
  fetchAvailableDrivers,
  saveDriverOnboarding,
  createMarketplaceTrip,
  getTripRecord,
  updateTripLifecycle
} from "./services/driver.js";
import {
  ECOSYSTEM_PLAN_USD,
  ECOSYSTEM_TIER,
  MONTHLY_PLAN_USD,
  PLAN_NAME,
  PRODUCT_TIER,
  buildSubscriptionRecord,
  hasActivePremium,
  openSubscriptionCheckout,
  openTripSettlementCheckout
} from "./services/billing.js";

initProductionMonitoring({
  app: "farad",
  release: "farad-fleet-ai@2.1.0"
});

const { collection, query, where, getDocs, limit, onSnapshot } = firebaseHelpers;
const { addDoc, doc, setDoc, updateDoc, serverTimestamp } = firebaseHelpers;

const app = document.querySelector("#app");
const landingPage = () => window.location.hash.replace("#", "") || "home";

const tripQuestions = [
  { key: "country", label: "Country", prompt: "Which country should Farad AI operate in for this trip?", placeholder: "Enter country" },
  { key: "pickup", label: "Pickup Location", prompt: "Where should the journey begin?", placeholder: "Pickup address or landmark" },
  { key: "destination", label: "Destination", prompt: "Where should Farad deliver or drop you safely?", placeholder: "Destination address or landmark" },
  { key: "extraStop", label: "Extra Stop", prompt: "Do you have an optional intermediate stop or collection point?", placeholder: "Optional stop" },
  { key: "departureTime", label: "Start Time", prompt: "What exact time should the trip start or should the driver arrive for pickup?", placeholder: "Example: 2:15 PM" },
  { key: "arrivalTime", label: "Arrival Deadline", prompt: "What exact time do you need to arrive at the key stop or final destination?", placeholder: "Example: 4:30 PM" },
  { key: "vehiclePreference", label: "Vehicle Preference", prompt: "Would you prefer a car, SUV, or truck for this trip?", placeholder: "Car, SUV, or Truck" },
  { key: "cargoNotes", label: "Cargo Notes", prompt: "Any fragile cargo, family passengers, or special movement notes Farad should know?", placeholder: "Fragile cargo, child seat, market bags, and so on" },
  { key: "paymentPreference", label: "Payment Preference", prompt: "How would you like to settle in USD after arrival: card or bank transfer?", placeholder: "Card or bank transfer" }
];

const driverQuestions = [
  { key: "fullName", label: "Full Name", prompt: "Driver portal check-in: what is your verified full name?", placeholder: "Full legal name" },
  { key: "phone", label: "Phone Number", prompt: "What active phone number should riders use to reach you?", placeholder: "Phone number" },
  { key: "countryCode", label: "Country Code", prompt: "What is your phone country code for direct rider calling?", placeholder: "+1, +234, +44" },
  { key: "country", label: "Country", prompt: "Which country are you operating and receiving trip requests in?", placeholder: "Country" },
  { key: "vehicleType", label: "Vehicle Type", prompt: "Which vehicle class are you registering: Car, SUV, or Truck?", placeholder: "Car, SUV, or Truck" },
  { key: "brandModel", label: "Brand and Model", prompt: "State the exact manufacturer and model for AI verification.", placeholder: "Example: Toyota Highlander" },
  { key: "modelYear", label: "Model Year", prompt: "What model year is the vehicle? It must be 2020 or newer.", placeholder: "2020 or newer" },
  { key: "baseFeeUsd", label: "Starting Fee (USD)", prompt: "Set your global starting fee in USD.", placeholder: "Example: 18" },
  { key: "perKmUsd", label: "Per KM Fee (USD)", prompt: "Set your per-kilometer rate in USD.", placeholder: "Example: 2.5" },
  { key: "payoutMethod", label: "Payout Method", prompt: "How would you like to receive driver settlement: bank transfer or card wallet?", placeholder: "Bank transfer or wallet" }
];

const state = {
  authUser: null,
  account: null,
  roleView: "user-login",
  alert: null,
  loading: true,
  authForms: {
    "user-login": { email: "", password: "" },
    "user-signup": { fullName: "", email: "", phone: "", password: "", confirmPassword: "" },
    "driver-login": { email: "", password: "" },
    "driver-signup": { fullName: "", email: "", phone: "", password: "", confirmPassword: "" }
  },
  authVisibility: {
    "user-login": { password: false },
    "user-signup": { password: false, confirmPassword: false },
    "driver-login": { password: false },
    "driver-signup": { password: false, confirmPassword: false }
  },
  activationRequest: {
    fullName: "",
    email: "",
    portal: "user",
    txRef: "",
    note: ""
  },
  userWorkspaceTab: "integrations",
  integrations: {
    chatgpt: {
      enabled: false,
      status: "not_connected",
      connectedAccount: ""
    },
    calendar: {
      enabled: false,
      status: "not_connected",
      connectedAccount: ""
    },
    slack: {
      enabled: false,
      status: "not_connected",
      connectedAccount: ""
    }
  },
  developerSettings: {
    apiToken: "",
    tokenCreatedAt: ""
  },
  tripDraft: {
    country: "",
    pickup: "",
    destination: "",
    extraStop: "",
    departureTime: "",
    arrivalTime: "",
    vehiclePreference: "",
    cargoNotes: "",
    paymentPreference: ""
  },
  tripStep: 0,
  driverForm: {
    fullName: "",
    phone: "",
    countryCode: "",
    country: "",
    vehicleType: "",
    brandModel: "",
    modelYear: "",
    baseFeeUsd: "",
    perKmUsd: "",
    payoutMethod: "",
    vehicleImageFile: null,
    vehicleImageBase64: "",
    vehicleImageName: ""
  },
  driverStep: 0,
  commandInput: "",
  conversation: [
    {
      role: "ai",
      content:
        "Mission Summary\nFarad AI is online.\n\nClarifying Questions\n- Tell me your movement goal and I will guide the route intake.\n\nRoute Logic\n- Every trip is optimized for lower fuel waste and better timing.\n\nDispatch Readiness\n- Once your details are complete, verified driver bids will appear in USD.\n\nFleet Note\n- Driver settlement opens only after arrival is confirmed.",
      source: "system",
      time: new Date()
    }
  ],
  availableDrivers: [],
  selectedDriverId: "",
  currentTripId: "",
  currentTrip: null,
  trips: [],
  pendingInterviewRoutes: [],
  activationRequests: [],
  mapEmbedUrl: "",
  routeMap: {
    pickupCoords: null,
    destinationCoords: null,
    userCoords: null,
    driverCoords: null,
    status: "idle",
    message: "Add pickup and destination details, then refresh the route preview.",
    permission: "prompt"
  },
  menuOpen: false,
  busy: {
    auth: false,
    tripAi: false,
    drivers: false,
    driverSave: false,
    payment: false,
    activationReview: false
  },
  unsubTrips: null
};

const LOCAL_ACCESS_KEY = "farad_local_access";
const USAGE_LIMIT_KEY = "farad_usage_limits";
const PENDING_PAYMENT_KEY = "farad_pending_payment";
const PENDING_INTEGRATION_KEY = "farad_pending_integration";
const PENDING_PRAEHIRE_TRANSIT_KEY = "farad_pending_praehire_transit";
let authSessionRun = 0;
let activeLeafletMap = null;

const FARAD_USAGE_LIMITS = {
  free: {
    aiCommands: 10,
    driverSearches: 6,
    dispatches: 2
  },
  pro: {
    aiCommands: 300,
    driverSearches: 150,
    dispatches: 60
  }
};

function usageMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function usageIdentity() {
  return String(state.authUser?.email || state.account?.email || "guest").trim().toLowerCase();
}

function readUsageStore() {
  try {
    return JSON.parse(window.localStorage.getItem(USAGE_LIMIT_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeUsageStore(store) {
  window.localStorage.setItem(USAGE_LIMIT_KEY, JSON.stringify(store));
}

function usagePlanKey() {
  return isPremiumUnlocked() ? "pro" : "free";
}

function getUsageBucket() {
  const store = readUsageStore();
  const key = `${usageIdentity()}:${usageMonthKey()}`;
  return {
    store,
    key,
    bucket: store[key] || { aiCommands: 0, driverSearches: 0, dispatches: 0 }
  };
}

function usageLabel(type) {
  return {
    aiCommands: "AI trip commands",
    driverSearches: "driver marketplace searches",
    dispatches: "dispatch creations"
  }[type] || "actions";
}

function checkAndIncrementUsage(type) {
  if (isAdminAccount()) {
    return { ok: true, remaining: "admin" };
  }

  const plan = usagePlanKey();
  const limitValue = FARAD_USAGE_LIMITS[plan][type];
  const { store, key, bucket } = getUsageBucket();
  const current = Number(bucket[type] || 0);

  if (current >= limitValue) {
    return {
      ok: false,
      message: `${plan === "pro" ? PLAN_NAME : "Free"} monthly limit reached for ${usageLabel(type)}. Farad will keep your account open; try again next month or choose an optional monthly upgrade.`
    };
  }

  bucket[type] = current + 1;
  store[key] = bucket;
  writeUsageStore(store);
  return { ok: true, remaining: limitValue - bucket[type] };
}

function renderUsageSummary() {
  if (!state.authUser || isDriver()) return "";
  const plan = usagePlanKey();
  const limits = FARAD_USAGE_LIMITS[plan];
  const { bucket } = getUsageBucket();

  return `
    <section class="panel-block success-soft">
      <div class="section-heading">
        <h3>${isAdminAccount() ? "Admin Access" : plan === "pro" ? PLAN_NAME : "Free Farad Access"}</h3>
        <p>${
          isAdminAccount()
            ? "Root admin bypass is active for jerronce101@gmail.com."
            : plan === "pro"
              ? `${PLAN_NAME} or Prae Ecosystem Pass access is recognized with high monthly limits. No unlimited usage, so the platform stays protected.`
              : "Farad stays open on free monthly limits. No subscription is required to sign in or use the core trip tools."
        }</p>
      </div>
      ${
        isAdminAccount()
          ? ""
          : `<ul>
              <li>AI trip commands: ${Number(bucket.aiCommands || 0)}/${limits.aiCommands}</li>
              <li>Driver searches: ${Number(bucket.driverSearches || 0)}/${limits.driverSearches}</li>
              <li>Dispatch creations: ${Number(bucket.dispatches || 0)}/${limits.dispatches}</li>
            </ul>`
      }
    </section>
  `;
}

function readLocalAccessStore() {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_ACCESS_KEY) || "{}");
  } catch {
    return {};
  }
}

function getLocalAccess(email) {
  const emailLower = String(email || "").trim().toLowerCase();
  if (!emailLower) {
    return null;
  }

  return readLocalAccessStore()[emailLower] || null;
}

function saveLocalAccess(email, payload) {
  const emailLower = String(email || "").trim().toLowerCase();
  if (!emailLower) {
    return;
  }

  const current = readLocalAccessStore();
  current[emailLower] = {
    ...(current[emailLower] || {}),
    ...payload,
    emailLower,
    savedAt: new Date().toISOString()
  };
  window.localStorage.setItem(LOCAL_ACCESS_KEY, JSON.stringify(current));
}

function savePendingPayment(payload) {
  try {
    window.localStorage.setItem(
      PENDING_PAYMENT_KEY,
      JSON.stringify({
        ...payload,
        savedAt: new Date().toISOString()
      })
    );
  } catch (error) {
    console.warn("Farad could not save pending payment context.", error);
  }
}

function readPendingPayment() {
  try {
    return JSON.parse(window.localStorage.getItem(PENDING_PAYMENT_KEY) || "null");
  } catch {
    return null;
  }
}

function clearPendingPayment() {
  try {
    window.localStorage.removeItem(PENDING_PAYMENT_KEY);
  } catch (error) {
    console.warn("Farad could not clear pending payment context.", error);
  }
}

function savePendingIntegration(provider) {
  try {
    window.localStorage.setItem(
      PENDING_INTEGRATION_KEY,
      JSON.stringify({
        provider,
        savedAt: new Date().toISOString()
      })
    );
  } catch (error) {
    console.warn("Farad could not save pending integration context.", error);
  }
}

function readPendingIntegration() {
  try {
    return JSON.parse(window.localStorage.getItem(PENDING_INTEGRATION_KEY) || "null");
  } catch {
    return null;
  }
}

function clearPendingIntegration() {
  try {
    window.localStorage.removeItem(PENDING_INTEGRATION_KEY);
  } catch (error) {
    console.warn("Farad could not clear pending integration context.", error);
  }
}

function savePendingPraeHireTransit(payload) {
  try {
    window.localStorage.setItem(
      PENDING_PRAEHIRE_TRANSIT_KEY,
      JSON.stringify({
        ...payload,
        savedAt: new Date().toISOString()
      })
    );
  } catch (error) {
    console.warn("Farad could not save PraeHire transit context.", error);
  }
}

function readPendingPraeHireTransit() {
  try {
    return JSON.parse(window.localStorage.getItem(PENDING_PRAEHIRE_TRANSIT_KEY) || "null");
  } catch {
    return null;
  }
}

function clearPendingPraeHireTransit() {
  try {
    window.localStorage.removeItem(PENDING_PRAEHIRE_TRANSIT_KEY);
  } catch (error) {
    console.warn("Farad could not clear PraeHire transit context.", error);
  }
}

function withUiTimeout(promise, message = "Farad is taking too long to load this step. Please try again.") {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), 12000);
    })
  ]);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setAlert(type, message) {
  state.alert = { type, message };
  render();
}

function clearAlert() {
  state.alert = null;
}

function withRoutingTimeout(promise, fallbackValue, label) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      window.setTimeout(() => {
        console.warn(`${label} timed out after 5 seconds; continuing with fallback state.`);
        resolve(fallbackValue);
      }, 5000);
    })
  ]);
}

function normalizeAccountRole(account) {
  const role = account?.role === "driver" ? "driver" : "user";
  return {
    ...account,
    role
  };
}

function toggleAuthVisibility(mode, key) {
  state.authVisibility[mode][key] = !state.authVisibility[mode][key];
  render();
}

function updateIntegrationStatus(provider, payload) {
  if (!state.integrations[provider]) {
    return;
  }

  state.integrations[provider] = {
    ...state.integrations[provider],
    ...payload
  };
}

function integrationConnectUrl(provider) {
  const env = window.env || {};
  const redirectUri = encodeURIComponent(`${window.location.origin}${window.location.pathname}?integration=${provider}`);
  const urls = {
    chatgpt:
      env.FARAD_CHATGPT_CONNECT_URL ||
      env.VITE_FARAD_CHATGPT_CONNECT_URL ||
      `https://chatgpt.com/auth/login?redirect_uri=${redirectUri}`,
    calendar:
      env.FARAD_GOOGLE_CALENDAR_CONNECT_URL ||
      env.VITE_FARAD_GOOGLE_CALENDAR_CONNECT_URL ||
      `https://accounts.google.com/o/oauth2/v2/auth?scope=${encodeURIComponent("https://www.googleapis.com/auth/calendar.events")}&response_type=code&redirect_uri=${redirectUri}`,
    slack:
      env.FARAD_SLACK_CONNECT_URL ||
      env.VITE_FARAD_SLACK_CONNECT_URL ||
      `https://slack.com/signin?redir=${redirectUri}`
  };

  return urls[provider] || "";
}

function connectIntegration(provider) {
  const integration = state.integrations[provider];
  if (!integration) {
    return;
  }

  savePendingIntegration(provider);
  window.location.href = integrationConnectUrl(provider);
  updateIntegrationStatus(provider, {
    enabled: false,
    status: "pending"
  });
}

function disconnectIntegration(provider) {
  updateIntegrationStatus(provider, {
    enabled: false,
    status: "not_connected",
    connectedAccount: ""
  });
  render();
}

function resolveIntegrationCallback() {
  const params = new URLSearchParams(window.location.search);
  const provider = params.get("integration") || params.get("provider") || readPendingIntegration()?.provider || "";

  if (!provider || !state.integrations[provider]) {
    return;
  }

  const success = params.get("connected") === "true" || params.get("status") === "success" || params.has("code");
  const denied = params.has("error") || params.get("connected") === "false" || params.get("status") === "denied";

  if (success) {
    updateIntegrationStatus(provider, {
      enabled: true,
      status: "connected"
    });
    clearPendingIntegration();
  } else if (denied) {
    updateIntegrationStatus(provider, {
      enabled: false,
      status: "not_connected"
    });
    clearPendingIntegration();
  } else {
    updateIntegrationStatus(provider, {
      enabled: false,
      status: "pending"
    });
  }

  if (params.has("integration") || params.has("provider") || params.has("code") || params.has("error")) {
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash || ""}`);
  }
}

function generateApiToken() {
  const bytes = new Uint8Array(24);
  window.crypto?.getRandomValues?.(bytes);
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  state.developerSettings.apiToken = `farad_live_${token || Date.now().toString(36)}`;
  state.developerSettings.tokenCreatedAt = new Date().toISOString();
  render();
}

function revokeApiToken() {
  state.developerSettings.apiToken = "";
  state.developerSettings.tokenCreatedAt = "";
  render();
}

function renderPasswordField({ mode, key, label, placeholder }) {
  const visible = state.authVisibility[mode]?.[key] === true;
  const value = state.authForms[mode]?.[key] || "";

  return `
    <label>
      <span>${label}</span>
      <div class="password-field">
        <input type="${visible ? "text" : "password"}" data-auth-key="${key}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" required>
        <button class="password-toggle" type="button" data-toggle-secret="${key}">${visible ? "Hide" : "Show"}</button>
      </div>
    </label>
  `;
}

function friendlyAuthError(error) {
  const message = String(error?.message || "");

  if (message.includes("Account setup is taking too long")) {
    return "Your account is taking longer than expected to finish setting up. Please try again shortly.";
  }

  if (message.includes("Sign-up is taking too long")) {
    return "Sign-up is taking longer than expected. Please try again.";
  }

  if (message.includes("Login is taking too long")) {
    return "Login is taking longer than expected. Please try again.";
  }

  if (message.includes("auth/email-already-in-use")) {
    return "That email already has an account. Please log in instead, or use Forgot Password if you need help getting back in.";
  }

  if (message.includes("auth/unauthorized-domain")) {
    return "Google sign-in is being finalized for this web address. Please use email sign-in for now while the instant access route finishes syncing.";
  }

  if (message.includes("auth/popup-closed-by-user")) {
    return "Google sign-in was closed before it finished. Please try again.";
  }

  if (message.includes("auth/popup-blocked")) {
    return "Your browser blocked the Google sign-in window. Please allow popups for Farad and try again.";
  }

  if (message.includes("auth/invalid-credential") || message.includes("auth/invalid-login-credentials")) {
    return "That login was not accepted. Please check your details or sign up first.";
  }

  if (message.includes("auth/")) {
    return "That sign-in step could not be completed right now. Please check your details and try again.";
  }

  if (
    message.toLowerCase().includes("client is offline") ||
    message.toLowerCase().includes("failed to get document") ||
    message.toLowerCase().includes("network request failed") ||
    message.toLowerCase().includes("offline")
  ) {
    return "Farad could not confirm your secure access right now. Please check your connection and, if your payment is already complete, chat with Mexty for help.";
  }

  return message || "That step could not be completed right now.";
}

function isAdminAccount() {
  const emailLower = state.account?.emailLower || state.authUser?.email?.toLowerCase() || "";
  return ROOT_ADMIN_EMAILS.has(emailLower) || state.account?.isAdmin === true || state.account?.root_admin === true;
}

function isDriver() {
  return state.account?.role === "driver";
}

function isPremiumUnlocked() {
  const email = state.account?.emailLower || state.authUser?.email || "";
  const localAccess = getLocalAccess(email);
  return Boolean(
    isAdminAccount() ||
      hasActivePremium(state.account) ||
      localAccess?.status === "active" ||
      localAccess?.subscription_status === "active" ||
      localAccess?.premium_access?.farad === true ||
      localAccess?.premium_access?.praehire === true
  );
}

function isAdminEmail(email) {
  return ROOT_ADMIN_EMAILS.has(String(email || "").trim().toLowerCase());
}

async function findAccountByEmailInCollection(collectionName, emailLower) {
  if (!db || !emailLower) {
    return null;
  }

  const snapshot = await getDocs(
    query(collection(db, collectionName), where("emailLower", "==", emailLower), limit(1))
  );

  if (snapshot.empty) {
    return null;
  }

  return {
    id: snapshot.docs[0].id,
    ...snapshot.docs[0].data()
  };
}

async function hasApprovedAccess(email) {
  const emailLower = String(email || "").trim().toLowerCase();

  if (!emailLower) {
    return false;
  }

  if (isAdminEmail(email)) {
    return true;
  }

  const localAccess = getLocalAccess(email);
  if (localAccess?.status === "active" || localAccess?.premium_access?.farad === true || localAccess?.premium_access?.praehire === true) {
    return true;
  }

  const approval = await loadAccessApprovalByEmail(email);
  if (approval?.status === "active" || approval?.premium_access?.farad === true || approval?.premium_access?.praehire === true) {
    return true;
  }

  const [userRecord, driverRecord] = await Promise.all([
    findAccountByEmailInCollection("users", emailLower),
    findAccountByEmailInCollection("drivers", emailLower)
  ]);

  return Boolean(userRecord || driverRecord);
}

async function hasActivatedAccess(email) {
  const emailLower = String(email || "").trim().toLowerCase();

  if (!emailLower) {
    return false;
  }

  if (isAdminEmail(emailLower)) {
    return true;
  }

  const localAccess = getLocalAccess(emailLower);
  if (
    localAccess?.status === "active" ||
    localAccess?.subscription_status === "active" ||
    localAccess?.premium_access?.farad === true ||
    localAccess?.premium_access?.praehire === true
  ) {
    return true;
  }

  const approval = await loadAccessApprovalByEmail(emailLower);
  if (
    approval?.status === "active" ||
    approval?.subscription_status === "active" ||
    approval?.premium_access?.farad === true ||
    approval?.premium_access?.praehire === true
  ) {
    return true;
  }

  const [userRecord, driverRecord] = await Promise.all([
    findAccountByEmailInCollection("users", emailLower),
    findAccountByEmailInCollection("drivers", emailLower)
  ]);

  return Boolean(
    userRecord?.subscription_status === "active" ||
      userRecord?.premium_access?.farad === true ||
      userRecord?.premium_access?.praehire === true ||
      driverRecord?.subscription_status === "active" ||
      driverRecord?.premium_access?.farad === true ||
      driverRecord?.premium_access?.praehire === true
  );
}

async function safelyHasActivatedAccess(email) {
  if (isAdminEmail(email)) {
    return true;
  }

  const localAccess = getLocalAccess(email);
  if (
    localAccess?.status === "active" ||
    localAccess?.subscription_status === "active" ||
    localAccess?.premium_access?.farad === true ||
    localAccess?.premium_access?.praehire === true
  ) {
    return true;
  }

  try {
    return await withRoutingTimeout(
      hasActivatedAccess(email),
      false,
      "Subscription/payment verification"
    );
  } catch (error) {
    console.warn("Farad activation check did not complete.", error);
    return false;
  }
}

function currentTripQuestion() {
  return tripQuestions[state.tripStep];
}

function currentDriverQuestion() {
  return driverQuestions[state.driverStep];
}

function formatCurrency(amount) {
  return `USD ${Number(amount || 0).toFixed(2)}`;
}

function formatDateTime(value) {
  if (!value) {
    return "Now";
  }
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function createFallbackAccount(user, preferredRole = "user") {
  const email = (user?.email || "").trim();
  const emailLower = email.toLowerCase();
  const role = preferredRole === "driver" ? "driver" : "user";
  const admin = ROOT_ADMIN_EMAILS.has(emailLower);

  if (role === "driver") {
    return {
      uid: user.uid,
      role: "driver",
      fullName: user.displayName || email.split("@")[0] || "Farad Driver",
      email,
      emailLower,
      phone: user.phoneNumber || "",
      isAdmin: admin,
      status: admin ? "verified" : "pending_profile",
      verification: {
        approved: admin,
        state: admin ? "approved_fallback" : "pending_fallback",
        message: admin
          ? "Root driver access opened through direct secure entry."
          : "Profile opened while cloud verification finishes syncing."
      },
      pricing: {
        currency: "USD",
        baseFeeUsd: 0,
        perKmUsd: 0
      },
      contact: {
        phone: user.phoneNumber || "",
        countryCode: "",
        country: ""
      },
      fallbackSession: true
    };
  }

  return {
    uid: user.uid,
    role: "user",
    fullName: user.displayName || email.split("@")[0] || "Farad User",
    email,
    emailLower,
    phone: user.phoneNumber || "",
    isAdmin: admin,
    root_admin: admin,
    subscription_status: admin ? "active" : "inactive",
    premium_access: {
      farad: admin,
      praehire: admin
    },
    fallbackSession: true
  };
}

function computeMapUrl(origin, destination) {
  if (!origin || !destination) {
    return "";
  }

  const minLat = Math.min(origin.lat, destination.lat) - 0.2;
  const maxLat = Math.max(origin.lat, destination.lat) + 0.2;
  const minLng = Math.min(origin.lng, destination.lng) - 0.2;
  const maxLng = Math.max(origin.lng, destination.lng) + 0.2;

  return `https://www.openstreetmap.org/export/embed.html?bbox=${minLng}%2C${minLat}%2C${maxLng}%2C${maxLat}&layer=mapnik&marker=${origin.lat}%2C${origin.lng}`;
}

function estimateDistanceKm(origin, destination) {
  if (!origin || !destination) {
    return 18;
  }

  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(destination.lat - origin.lat);
  const dLng = toRad(destination.lng - origin.lng);
  const lat1 = toRad(origin.lat);
  const lat2 = toRad(destination.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((earthRadiusKm * c).toFixed(1));
}

function normalizeCoords(coords) {
  if (!coords) {
    return null;
  }

  const lat = Number(coords.lat ?? coords.latitude);
  const lng = Number(coords.lng ?? coords.lon ?? coords.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function getSelectedDriver() {
  return state.availableDrivers.find((driver) => driver.id === state.selectedDriverId) || null;
}

function estimateDriverCoords(origin, destination) {
  const selectedDriver = getSelectedDriver();
  const storedLocation = normalizeCoords(selectedDriver?.location || selectedDriver?.coordinates || selectedDriver?.vehicle?.location);
  if (storedLocation) {
    return storedLocation;
  }

  if (origin && destination && selectedDriver) {
    const driverIndex = Math.max(0, state.availableDrivers.findIndex((driver) => driver.id === selectedDriver.id));
    const offset = (driverIndex + 1) * 0.006;
    return {
      lat: Number(((origin.lat * 0.72 + destination.lat * 0.28) + offset).toFixed(6)),
      lng: Number(((origin.lng * 0.72 + destination.lng * 0.28) - offset).toFixed(6))
    };
  }

  return null;
}

function setRouteMapState(status, message, patch = {}) {
  state.routeMap = {
    ...state.routeMap,
    ...patch,
    status,
    message
  };
}

async function syncRoutePreview({ renderAfter = true } = {}) {
  const pickup = state.tripDraft.pickup?.trim();
  const destination = state.tripDraft.destination?.trim();

  if (!pickup || !destination) {
    setRouteMapState("idle", "Add pickup and destination details, then refresh the route preview.", {
      pickupCoords: null,
      destinationCoords: null,
      driverCoords: null
    });
    state.mapEmbedUrl = "";
    if (renderAfter) {
      render();
    }
    return { origin: null, destination: null, estimatedKm: estimateDistanceKm(null, null) };
  }

  setRouteMapState("loading", "Checking pickup, destination, driver, and route visibility...");
  if (renderAfter) {
    render();
  }

  try {
    const [origin, dropoff] = await Promise.all([
      geocodePlace(pickup),
      geocodePlace(destination)
    ]);
    const driverCoords = estimateDriverCoords(origin, dropoff);
    const estimatedKm = estimateDistanceKm(origin, dropoff);
    state.mapEmbedUrl = origin && dropoff ? computeMapUrl(origin, dropoff) : "";

    setRouteMapState(
      origin && dropoff ? "ready" : "partial",
      origin && dropoff
        ? "Route preview ready. Driver position is shown when a driver is selected or has shared a location."
        : "Farad could not locate one of those addresses. You can still continue with manual route details.",
      {
        pickupCoords: origin,
        destinationCoords: dropoff,
        driverCoords
      }
    );

    if (renderAfter) {
      render();
    }
    return { origin, destination: dropoff, estimatedKm };
  } catch (error) {
    captureAppError(error, { area: "maps", action: "route-preview" });
    setRouteMapState("error", "Map lookup failed. Manual pickup and destination fields are still available.", {
      pickupCoords: null,
      destinationCoords: null,
      driverCoords: null
    });
    state.mapEmbedUrl = "";
    if (renderAfter) {
      render();
    }
    return { origin: null, destination: null, estimatedKm: estimateDistanceKm(null, null) };
  }
}

function requestCurrentLocation() {
  if (!("geolocation" in navigator)) {
    setRouteMapState("unavailable", "This browser does not support location sharing. Use the manual pickup field instead.", {
      permission: "unavailable"
    });
    render();
    return;
  }

  setRouteMapState("loading", "Waiting for your browser location permission...", {
    permission: "prompt"
  });
  render();

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const userCoords = {
        lat: Number(position.coords.latitude.toFixed(6)),
        lng: Number(position.coords.longitude.toFixed(6))
      };
      setRouteMapState("ready", "Location added to the route map. You can still type a pickup address manually.", {
        userCoords,
        permission: "granted"
      });
      render();
    },
    (error) => {
      const denied = error.code === error.PERMISSION_DENIED;
      setRouteMapState(
        denied ? "denied" : "unavailable",
        denied
          ? "Location permission was denied. Type the pickup and destination manually to continue."
          : "Your device could not provide a reliable location. Manual address entry is still available.",
        { permission: denied ? "denied" : "unavailable" }
      );
      render();
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }
  );
}

function mountRouteMap() {
  const mapNode = document.querySelector("#route-map");
  if (!mapNode) {
    return;
  }

  if (activeLeafletMap) {
    activeLeafletMap.remove();
    activeLeafletMap = null;
  }

  const L = window.L;
  if (!L) {
    mapNode.innerHTML = `<div class="map-placeholder compact-empty">Interactive map assets are still loading. Pickup and destination fields remain available.</div>`;
    return;
  }

  const points = [
    { label: "Pickup", coords: normalizeCoords(state.routeMap.pickupCoords) },
    { label: "Destination", coords: normalizeCoords(state.routeMap.destinationCoords) },
    { label: "Your location", coords: normalizeCoords(state.routeMap.userCoords) },
    { label: "Driver or truck", coords: normalizeCoords(state.routeMap.driverCoords) }
  ].filter((point) => point.coords);

  activeLeafletMap = L.map(mapNode, {
    scrollWheelZoom: false,
    worldCopyJump: true
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(activeLeafletMap);

  if (points.length === 0) {
    activeLeafletMap.setView([9.082, 8.6753], 5);
    return;
  }

  const bounds = [];
  points.forEach((point) => {
    const latLng = [point.coords.lat, point.coords.lng];
    bounds.push(latLng);
    L.marker(latLng).addTo(activeLeafletMap).bindPopup(point.label);
  });

  if (state.routeMap.pickupCoords && state.routeMap.destinationCoords) {
    L.polyline(
      [
        [state.routeMap.pickupCoords.lat, state.routeMap.pickupCoords.lng],
        [state.routeMap.destinationCoords.lat, state.routeMap.destinationCoords.lng]
      ],
      { color: "#35c7ff", weight: 5, opacity: 0.85 }
    ).addTo(activeLeafletMap);
  }

  activeLeafletMap.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
}

async function loadTripsForCurrentUser() {
  if (!db || !state.authUser || !state.account) {
    state.trips = [];
    state.currentTrip = null;
    render();
    return;
  }

  const field = isDriver() ? "driverUid" : "riderUid";
  const snapshot = await getDocs(query(collection(db, "trips"), where(field, "==", state.authUser.uid), limit(12)));
  state.trips = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  state.currentTrip = state.currentTripId ? state.trips.find((trip) => trip.id === state.currentTripId) || null : state.trips[0] || null;
  render();
}

function stopTripSubscription() {
  if (typeof state.unsubTrips === "function") {
    state.unsubTrips();
    state.unsubTrips = null;
  }
}

function subscribeToTrips() {
  stopTripSubscription();

  if (!db || !state.authUser || !state.account) {
    return;
  }

  const field = isDriver() ? "driverUid" : "riderUid";
  state.unsubTrips = onSnapshot(
    query(collection(db, "trips"), where(field, "==", state.authUser.uid), limit(20)),
    (snapshot) => {
      state.trips = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      if (state.currentTripId) {
        state.currentTrip = state.trips.find((trip) => trip.id === state.currentTripId) || state.currentTrip;
      } else {
        state.currentTrip = state.trips[0] || null;
      }
      render();
    },
    (error) => {
      console.warn("Farad trip subscription did not start.", error);
      state.trips = [];
      state.currentTrip = null;
      render();
    }
  );
}

function slugRouteId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function capturePraeHireTransitFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("praehireTransit") !== "1") {
    return;
  }

  const payload = {
    source: "praehire",
    uid: params.get("uid") || "",
    email: params.get("email") || "",
    fullName: params.get("fullName") || "",
    opportunityId: params.get("opportunityId") || "",
    company: params.get("company") || "",
    role: params.get("role") || "",
    destination: params.get("destination") || "",
    scheduledAt: params.get("scheduledAt") || ""
  };

  savePendingPraeHireTransit(payload);
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash || ""}`);
}

async function createPendingInterviewRouteForUser(user, account) {
  if (!db || !user?.uid) {
    return null;
  }

  const pending = readPendingPraeHireTransit();
  if (!pending?.destination || !pending?.scheduledAt) {
    return null;
  }

  const interviewAt = new Date(pending.scheduledAt);
  if (Number.isNaN(interviewAt.getTime())) {
    clearPendingPraeHireTransit();
    setAlert("error", "PraeHire sent an interview route without a valid schedule.");
    return null;
  }

  const routeId =
    slugRouteId(`praehire-${pending.opportunityId}-${pending.destination}-${pending.scheduledAt}`) ||
    `praehire-${Date.now()}`;
  const routeRef = doc(db, "users", user.uid, "pendingInterviewRoutes", routeId);
  const routeDoc = {
    id: routeId,
    source: "praehire",
    status: "pending_confirmation",
    routeType: "interview_day_transit",
    user: {
      uid: user.uid,
      email: user.email || account?.email || "",
      fullName: account?.fullName || user.displayName || pending.fullName || ""
    },
    praeHireAccount: {
      uid: pending.uid || "",
      email: pending.email || "",
      fullName: pending.fullName || ""
    },
    interview: {
      destination: pending.destination,
      scheduledTimestamp: pending.scheduledAt,
      scheduledAt: interviewAt.toISOString(),
      opportunityId: pending.opportunityId || "",
      company: pending.company || "",
      role: pending.role || ""
    },
    dispatch: {
      title: "Pending Interview Route",
      paymentStatus: "not_started",
      currency: "USD",
      driverConfirmationRequired: true
    },
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  };

  await setDoc(routeRef, routeDoc, { merge: true });
  await setDoc(doc(db, "interview_routes", routeId), {
    ...routeDoc,
    userRoutePath: `users/${user.uid}/pendingInterviewRoutes/${routeId}`
  }, { merge: true });

  clearPendingPraeHireTransit();
  state.pendingInterviewRoutes = [routeDoc, ...state.pendingInterviewRoutes.filter((route) => route.id !== routeId)];
  setAlert("success", "PraeHire interview route is ready. Confirm it from your Farad dashboard.");
  return routeDoc;
}

async function loadPendingInterviewRoutes() {
  if (!db || !state.authUser?.uid || state.account?.role !== "user") {
    state.pendingInterviewRoutes = [];
    return;
  }

  const snapshot = await getDocs(collection(db, "users", state.authUser.uid, "pendingInterviewRoutes"));
  state.pendingInterviewRoutes = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

function applyDriverAccountToForm(account, user) {
  if (account.role !== "driver") {
    return;
  }

  state.driverForm = {
    ...state.driverForm,
    fullName: account.fullName || user.displayName || "",
    phone: account.phone || account.contact?.phone || "",
    countryCode: account.contact?.countryCode || "",
    country: account.contact?.country || "",
    vehicleType: account.vehicle?.type || "",
    brandModel: account.vehicle?.brandModel || "",
    modelYear: account.vehicle?.modelYearClaimed ? String(account.vehicle.modelYearClaimed) : "",
    baseFeeUsd: account.pricing?.baseFeeUsd ? String(account.pricing.baseFeeUsd) : "",
    perKmUsd: account.pricing?.perKmUsd ? String(account.pricing.perKmUsd) : "",
    payoutMethod: account.payout?.payoutMethod || "",
    vehicleImageFile: null,
    vehicleImageBase64: "",
    vehicleImageName: account.vehicle?.imageUrl ? "Uploaded image" : ""
  };
}

function mergeLocalAccessIntoAccount(account, user) {
  const localAccess = getLocalAccess(user.email);
  if (
    localAccess?.status !== "active" &&
    localAccess?.premium_access?.farad !== true &&
    localAccess?.premium_access?.praehire !== true
  ) {
    return account;
  }

  updateAccountRecord(account.role === "driver" ? "drivers" : "users", account.uid, {
    subscription_status: "active",
    premium_access: {
      farad: true,
      praehire: true
    }
  }).catch((error) => {
    console.warn("Farad local access account update failed.", error);
  });

  setDoc(
    doc(db, "access_approvals", String(user.email || "").trim().toLowerCase()),
    {
      email: user.email || "",
      emailLower: String(user.email || "").trim().toLowerCase(),
      portal: account.role || "user",
      status: "active",
      lastTxRef: localAccess.lastTxRef || "",
      subscription_status: "active",
      premium_access: {
        farad: true,
        praehire: true
      },
      approvedAt: serverTimestamp()
    },
    { merge: true }
  ).catch((error) => {
    console.warn("Farad access approval sync failed.", error);
  });

  return {
    ...account,
    subscription_status: "active",
    premium_access: {
      ...(account.premium_access || {}),
      farad: true,
      praehire: true
    }
  };
}

function openAuthenticatedDashboard(user, account, runId, message = "") {
  try {
    if (runId !== authSessionRun) {
      return;
    }

    state.authUser = user;
    state.account = normalizeAccountRole(mergeLocalAccessIntoAccount(account, user));
    state.loading = false;
    state.busy.auth = false;
    if (message) {
      state.alert = {
        type: "success",
        message
      };
    }
    applyDriverAccountToForm(state.account, user);
    subscribeToTrips();
    if (state.account.role === "user") {
      createPendingInterviewRouteForUser(user, state.account)
        .then(loadPendingInterviewRoutes)
        .then(render)
        .catch((error) => {
          console.warn("Farad could not hydrate the PraeHire interview route.", error);
        });
    }
    render();
  } catch (error) {
    captureAppError(error, { area: "auth", action: "hydrate-or-create-fallback-account" });
    state.loading = false;
    state.account = normalizeAccountRole(createFallbackAccount(user, readPreferredRole()));
    setAlert("error", friendlyAuthError(error));
  }
}

async function hydrateSession(user) {
  const runId = ++authSessionRun;
  setMonitoringUser(user);
  state.authUser = user;

  try {
    if (!user) {
      const recoveredUser = await waitForCurrentAuthUser(5000);

      if (recoveredUser?.uid) {
        await hydrateSession(recoveredUser);
        return;
      }

      stopTripSubscription();
      state.account = null;
      state.loading = false;
      render();
      return;
    }

    const preferredRole = readPreferredRole();
    const emailLower = String(user.email || "").trim().toLowerCase();
    const driverRecord =
      preferredRole === "driver"
        ? null
        : await withRoutingTimeout(
            findAccountByEmailInCollection("drivers", emailLower),
            null,
            "Driver role lookup"
          );
    const driverAccess = preferredRole === "driver" || Boolean(driverRecord);

    const fallbackAccount = driverRecord
      ? {
          ...createFallbackAccount(user, "driver"),
          ...driverRecord,
          role: "driver"
        }
      : createFallbackAccount(user, driverAccess ? "driver" : preferredRole);

    const isGoogleUser =
      Array.isArray(user.providerData) && user.providerData.some((provider) => provider.providerId === "google.com");
    if (isGoogleUser) {
      ensureGoogleAccountRecord(user).catch((error) => {
        console.warn("Farad Google account record sync failed.", error);
      });
    }

    openAuthenticatedDashboard(
      user,
      fallbackAccount,
      runId,
      isAdminEmail(user.email)
        ? "Admin access opened immediately. Farad will sync cloud records in the background."
        : "Farad opened your dashboard while account details sync in the background."
    );

    withRoutingTimeout(loadAccountRecord(user.uid), null, "Database profile check")
      .then((cloudAccount) => {
        if (runId !== authSessionRun || !cloudAccount) {
          return;
        }

        const mergedAccount = isAdminEmail(user.email)
          ? {
              ...fallbackAccount,
              ...cloudAccount,
              isAdmin: true,
              root_admin: true,
              subscription_status: "active",
              premium_access: {
                ...(cloudAccount.premium_access || {}),
                farad: true,
                praehire: true
              }
            }
          : {
              ...fallbackAccount,
              ...cloudAccount
            };

        openAuthenticatedDashboard(user, mergedAccount, runId);
        loadTripsForCurrentUser().catch((error) => {
          console.warn("Farad trip refresh after profile sync failed.", error);
        });
      })
      .catch((error) => {
        console.warn("Farad cloud profile sync failed.", error);
      });

    if (isAdminAccount()) {
      withRoutingTimeout(loadActivationRequests(), null, "Admin activation request check")
        .then(() => {
          if (runId === authSessionRun) {
            render();
          }
        })
        .catch((error) => {
          console.warn("Farad admin activation request sync failed.", error);
        });
    }

    withRoutingTimeout(loadTripsForCurrentUser(), null, "Trip database check").catch((error) => {
      console.warn("Farad initial trip load failed.", error);
    });
  } catch (error) {
    if (runId !== authSessionRun) {
      return;
    }

    captureAppError(error, { area: "auth", action: "hydrate-session" });
    state.loading = false;
    state.account = null;
    setAlert("error", friendlyAuthError(error));
    render();
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  clearAlert();
  state.busy.auth = true;
  render();

  try {
    const mode = state.roleView;
    const data = state.authForms[mode];
    const role = mode.startsWith("driver") ? "driver" : "user";
    rememberPreferredRole(role);
    await ensureAuthPersistence();

    if (mode === "user-login") {
      const user = await signInAccount({ role: "user", email: data.email, password: data.password });
      hydrateSession(user).catch((error) => {
        setAlert("error", friendlyAuthError(error));
      });
    } else {
      const user = await signInAccount({ role: "driver", email: data.email, password: data.password });
      hydrateSession(user).catch((error) => {
        setAlert("error", friendlyAuthError(error));
      });
    }
  } catch (error) {
    captureAppError(error, { area: "auth", action: "email-login" });
    setAlert("error", friendlyAuthError(error));
  } finally {
    state.busy.auth = false;
    render();
  }
}

async function handleActivationSubmit(event) {
  event.preventDefault();
  clearAlert();
  state.busy.auth = true;
  render();

  try {
    const role = state.roleView.startsWith("driver") ? "driver" : "user";
    const mode = role === "driver" ? "driver-signup" : "user-signup";
    const data = state.authForms[mode];

    rememberPreferredRole(role);

    if (data.password !== data.confirmPassword) {
      throw new Error("Your passwords do not match. Please make sure both password fields are the same.");
    }

    if (!data.fullName.trim() || !data.email.trim() || !data.phone.trim() || !data.password.trim()) {
      throw new Error("Complete your full name, email, phone number, and password before activating your account.");
    }

    try {
      await signUpAccount({ role, ...data });
    } catch (error) {
      const message = String(error?.message || "");
      if (!message.includes("auth/email-already-in-use")) {
        throw error;
      }
    }

    state.authForms[state.roleView].email = data.email;
    state.authForms[state.roleView].password = data.password;

    if (isAdminEmail(data.email)) {
      setAlert("success", "Your account is ready. Continue with login or Google access.");
      return;
    }

    if (role === "driver") {
      setAlert("success", "Driver account created. Sign in to complete free driver onboarding and start receiving tasks.");
      return;
    }

    setAlert("success", "Free Farad account created. Sign in to start with monthly limits. No subscription is required for core Farad access.");
  } catch (error) {
    captureAppError(error, { area: "auth", action: "signup" });
    setAlert("error", friendlyAuthError(error));
  } finally {
    state.busy.auth = false;
    render();
  }
}

async function handleForgotPassword() {
  const email = state.authForms[state.roleView]?.email?.trim();
  if (!email) {
    setAlert("error", "Enter your email first, then click Forgot Password.");
    return;
  }

  try {
    await requestPasswordReset(email);
    setAlert("success", "Password reset email sent. Check your inbox.");
  } catch (error) {
    captureAppError(error, { area: "auth", action: "password-reset" });
    setAlert("error", friendlyAuthError(error));
  }
}

async function handleGoogleAuth() {
  clearAlert();
  state.busy.auth = true;
  render();

  try {
    const mode = state.roleView;
    const role = mode.startsWith("driver") ? "driver" : "user";
    const intent = "login";
    const activationMode = role === "driver" ? "driver-signup" : "user-signup";
    const email = state.authForms[mode]?.email?.trim() || state.authForms[activationMode]?.email?.trim() || "";
    rememberPreferredRole(role);
    await ensureAuthPersistence();

    const googleResult = await signInWithGoogleFlow({ role, intent, email });
    if (googleResult?.user) {
      await hydrateSession(googleResult.user);
      setAlert("success", "Google secure access completed.");
      return;
    }

    setAlert("success", "Redirecting to Google secure access...");
  } catch (error) {
    captureAppError(error, { area: "auth", action: "google-signin" });
    setAlert("error", friendlyAuthError(error));
  } finally {
    state.busy.auth = false;
    render();
  }
}

function updateAuthField(mode, key, value) {
  state.authForms[mode][key] = value;
}

function updateActivationAuthField(roleMode, key, value) {
  const targetMode = roleMode.startsWith("driver") ? "driver-signup" : "user-signup";
  state.authForms[targetMode][key] = value;
}

function updateTripField(key, value) {
  state.tripDraft[key] = value;
}

function updateDriverField(key, value) {
  state.driverForm[key] = value;
}

function renderAlert() {
  if (!state.alert) {
    return "";
  }

  return `<div class="alert ${escapeHtml(state.alert.type)}">${escapeHtml(state.alert.message)}</div>`;
}

function renderAuthAlert() {
  if (!state.alert || state.authUser) {
    return "";
  }

  return `<div class="alert ${escapeHtml(state.alert.type)} inline-auth-alert">${escapeHtml(state.alert.message)}</div>`;
}

function praeHireLink(label = "PraeHire") {
  return `<a href="https://praehire.com" target="_blank" rel="noreferrer">${label}</a>`;
}

function updateActivationRequestField(key, value) {
  state.activationRequest[key] = value;
}

function updateActivationLookupField(key, value) {
  state.activationLookup[key] = value;
}

function renderLanding() {
  return `
    <section class="hero-card">
      <div class="hero-copy-shell">
        <p class="eyebrow">Prae Technologies Intelligent Mobility Stack</p>
        <h1>Automate Your Trips, Errands, and Movements with Farad AI. A Sweeter, Smarter Way to Move Everywhere on Earth.</h1>
        <p class="lead">
          Farad uses elite geographic computing, real-time AI modeling, and a verified driver marketplace to schedule,
          coordinate, and execute journeys while cutting fuel waste across personal movement, errand runs, and logistics missions.
        </p>
        <div class="hero-pills">
          <span>Autonomous dispatch intelligence</span>
          <span>Verified driver compliance</span>
          <span>Optional monthly upgrades with ${praeHireLink("PraeHire")}</span>
        </div>
      </div>
      <div class="pricing-card" id="pricing">
        <div class="pricing-label">Farad Core Access</div>
        <div class="pricing-value">Free<span>/monthly limits</span></div>
        <p>
          Farad AI keeps rider and driver onboarding open with fair monthly limits. Upgrade only when you want higher Farad or Prae ecosystem limits.
        </p>
        <ul>
          <li>Free: ${FARAD_USAGE_LIMITS.free.aiCommands} AI trip commands, ${FARAD_USAGE_LIMITS.free.driverSearches} driver searches, ${FARAD_USAGE_LIMITS.free.dispatches} dispatches monthly</li>
          <li>${PLAN_NAME}: USD ${MONTHLY_PLAN_USD}/month for higher Farad AI limits</li>
          <li>Prae Ecosystem Pass: USD ${ECOSYSTEM_PLAN_USD}/month unlocks PraeHire, Farad AI, and PraChat premium features</li>
          <li>Drivers onboard free and publish exact USD rates</li>
        </ul>
      </div>
    </section>
  `;
}

function renderAuth() {
  const mode = state.roleView;
  const form = state.authForms[mode];
  const isDriverPortal = mode.startsWith("driver");
  const activationMode = isDriverPortal ? "driver-signup" : "user-signup";
  const activationForm = state.authForms[activationMode];

  return `
    <section class="auth-grid" id="home">
      <article class="auth-panel">
        <div class="section-heading">
          <h2>Access Farad AI</h2>
          <p>Choose the right portal. Users start free with monthly limits and can upgrade when they choose. Drivers stay 100% free.</p>
        </div>
        ${renderAuthAlert()}
        <div class="tab-row">
          ${[
            ["user-login", "User Login"],
            ["driver-login", "Driver Login"]
          ]
            .map(
              ([value, label]) =>
                `<button class="tab ${mode === value ? "active" : ""}" data-mode="${value}" type="button">${label}</button>`
            )
            .join("")}
        </div>
        <form id="auth-form" class="stack-form">
          <label><span>Active Email</span><input type="email" data-auth-key="email" value="${escapeHtml(form.email || "")}" placeholder="name@example.com" required></label>
          ${renderPasswordField({ mode, key: "password", label: "Secure Password", placeholder: "Secure password" })}
          <div class="form-foot">
            <button class="button primary" type="submit" ${state.busy.auth ? "disabled" : ""}>${state.busy.auth ? "Please wait..." : "Login"}</button>
            <button class="text-link" id="forgot-password" type="button">Forgot Password?</button>
          </div>
        </form>
        <div class="oauth-box">
          <div class="muted">${
            isDriverPortal
              ? "Drivers join Farad free. Continue with Google or email login to open the driver portal, complete verification, and receive rider tasks."
              : `Start free with monthly limits. Upgrade to ${PLAN_NAME} or Prae Ecosystem Pass only when you want higher limits.`
          }</div>
          <div class="form-foot">
            <button class="button secondary" id="google-auth-button" type="button" ${state.busy.auth ? "disabled" : ""}>
              Continue with Google for ${isDriverPortal ? "Driver Login" : "User Login"}
            </button>
          </div>
        </div>
        <form id="activation-form" class="stack-form compact">
          <div class="section-heading">
            <h3>${isDriverPortal ? "Create Free Driver Account" : "Create Free User Account"}</h3>
            <p>${
              isDriverPortal
                ? "Driver onboarding is 100% free. Create your driver account, then complete verification and set your own USD trip rates."
                : `Create a free Farad account first. You can upgrade to ${PLAN_NAME} or Prae Ecosystem Pass later if you want higher limits.`
            }</p>
          </div>
          <label><span>Full Name</span><input data-activation-auth-key="fullName" value="${escapeHtml(activationForm.fullName || "")}" placeholder="Your full name" required></label>
          <label><span>Active Email</span><input type="email" data-activation-auth-key="email" value="${escapeHtml(activationForm.email || form.email || "")}" placeholder="name@example.com" required></label>
          <label><span>Phone Number</span><input data-activation-auth-key="phone" value="${escapeHtml(activationForm.phone || "")}" placeholder="Active phone number" required></label>
          ${renderPasswordField({ mode: activationMode, key: "password", label: "Secure Password", placeholder: "Create a secure password" })}
          ${renderPasswordField({ mode: activationMode, key: "confirmPassword", label: "Confirm Password", placeholder: "Repeat your secure password" })}
          <div class="form-foot">
            <button class="button primary" id="activate-account-submit" type="submit" ${state.busy.auth ? "disabled" : ""}>${state.busy.auth ? "Please wait..." : isDriverPortal ? "Create Free Driver Account" : "Create Free Account"}</button>
            <button class="button secondary" id="google-signup-button" type="button" ${state.busy.auth ? "disabled" : ""}>
              ${isDriverPortal ? "Continue with Google Free" : "Continue with Google Free"}
            </button>
          </div>
        </form>
        <div class="detail-card success-soft">
          <strong>${isDriverPortal ? "Driver access is free" : "Free access is open"}</strong>
          <p>${
            isDriverPortal
              ? "Farad does not charge drivers a subscription fee. If onboarding does not open, chat with Mexty for direct help."
              : `Free users can use Farad monthly limits without a subscription. Upgrade is optional. If anything gets stuck, chat with <a href="https://mexty.web.app" target="_blank" rel="noreferrer">Mexty</a>.`
          }</p>
        </div>
      </article>
      <article class="auth-side panel-soft">
        <div class="section-heading">
          <h2>${isDriverPortal ? "Driver Portal" : "User Command Access"}</h2>
          <p>${isDriverPortal ? "Drivers must pass AI vehicle verification, publish their own USD pricing, and manage live rider requests." : "Users can command trips in natural language, compare exact USD driver bids, and settle only after arrival."}</p>
        </div>
        <div class="detail-card danger-soft">
          <strong>Access requirements</strong>
          <p>${isDriverPortal ? "Drivers are 100% free on Farad. No subscription, no Flutterwave payment, and no premium activation is required to onboard, verify a vehicle, publish USD rates, and receive rider tasks." : `${PLAN_NAME} and Prae Ecosystem Pass are optional monthly upgrades. Free users can still use normal Farad features with limits.`}</p>
        </div>
        <div class="detail-card">
          <strong>Protected Operations</strong>
          <p>Core infrastructure controls are privately protected in the background so the experience stays clean and safe for everyone else.</p>
        </div>
      </article>
    </section>
  `;
}

function renderTripWizard() {
  const question = currentTripQuestion();
  const value = state.tripDraft[question.key] || "";
  const completed = tripQuestions.filter((item) => state.tripDraft[item.key]).length;

  return `
    <section class="panel-block">
      <div class="section-heading">
        <h3>Autonomous Trip Intake</h3>
        <p>Farad asks one operational question at a time. You can move backward if anything changes.</p>
      </div>
      <div class="wizard-shell">
        <div class="wizard-meta">Question ${state.tripStep + 1} of ${tripQuestions.length} • Completed ${completed}/${tripQuestions.length}</div>
        <div class="wizard-prompt">${escapeHtml(question.prompt)}</div>
        <label class="wizard-field">
          <span>${escapeHtml(question.label)}</span>
          <input id="trip-question-input" data-trip-key="${question.key}" value="${escapeHtml(value)}" placeholder="${escapeHtml(question.placeholder)}">
        </label>
        <div class="wizard-actions">
          <button class="button secondary" type="button" id="trip-prev" ${state.tripStep === 0 ? "disabled" : ""}>Previous Question</button>
          <button class="button secondary" type="button" id="trip-next">${state.tripStep === tripQuestions.length - 1 ? "Stay on Review" : "Next Question"}</button>
        </div>
      </div>
    </section>
  `;
}

function renderConversation() {
  return `
    <section class="panel-block">
      <div class="section-heading">
        <h3>Interactive AI Trip Control Matrix</h3>
        <p>Type naturally and Farad AI will refine the trip, ask clarifying questions, and prepare the marketplace.</p>
      </div>
      <div class="conversation-stream">
        ${state.conversation
          .map(
            (item) => `
              <article class="bubble ${item.role}">
                <div class="bubble-head"><span>${item.role === "ai" ? "Farad AI" : "You"}</span><span>${escapeHtml(formatDateTime(item.time))}</span></div>
                <div class="bubble-body">${escapeHtml(item.content)}</div>
              </article>
            `
          )
          .join("")}
      </div>
      <form id="ai-form" class="stack-form compact">
        <label>
          <span>Command Farad AI... (e.g., Optimize drone routes for incoming cargo)</span>
          <textarea id="command-input" rows="4" placeholder="Farad, coordinate my market run, multi-stop deliveries, and get me home safely avoiding the afternoon bottleneck.">${escapeHtml(state.commandInput)}</textarea>
        </label>
        <div class="form-foot">
          <button class="button secondary" id="sync-marketplace" type="button" ${state.busy.drivers ? "disabled" : ""}>Refresh Driver Marketplace</button>
          <button class="button primary" type="submit" ${state.busy.tripAi ? "disabled" : ""}>${state.busy.tripAi ? "Thinking..." : "Run AI Planning"}</button>
        </div>
      </form>
    </section>
  `;
}

function renderMarketplace() {
  const tripReady = state.availableDrivers.length > 0;
  const selectedDriver = state.availableDrivers.find((driver) => driver.id === state.selectedDriverId);

  return `
    <section class="panel-block">
      <div class="section-heading">
        <h3>Live Marketplace Dispatch</h3>
        <p>Driver bids are calculated from each driver's own USD base fee and per-kilometer rate. No random pricing is injected.</p>
      </div>
      <div class="driver-list">
        ${tripReady
          ? state.availableDrivers
              .map(
                (driver) => `
                  <article class="driver-card ${driver.id === state.selectedDriverId ? "selected" : ""}">
                    <div class="driver-top">
                      <div>
                        <strong>${escapeHtml(driver.fullName)}</strong>
                        <div class="muted">${escapeHtml(driver.vehicle?.type || "Vehicle pending")} • ${escapeHtml(driver.vehicle?.brandModel || "")}</div>
                      </div>
                      <div class="price-pill">${escapeHtml(formatCurrency(driver.quote.totalUsd))}</div>
                    </div>
                    <div class="muted">Base ${escapeHtml(formatCurrency(driver.quote.baseFeeUsd))} + ${escapeHtml(formatCurrency(driver.quote.perKmUsd))}/km • ${escapeHtml(driver.contact?.country || "Global")}</div>
                    <div class="driver-actions">
                      <button class="button secondary select-driver" data-driver-id="${driver.id}" type="button">Choose Driver</button>
                      ${driver.contact?.countryCode && driver.contact?.phone ? `<a class="text-link" href="tel:${escapeHtml(`${driver.contact.countryCode}${driver.contact.phone}`)}">Call Driver</a>` : ""}
                    </div>
                  </article>
                `
              )
              .join("")
          : `<div class="empty-state">No verified drivers have been matched yet. Complete the trip intake and refresh marketplace search.</div>`}
      </div>
      ${selectedDriver ? `<div class="detail-card success-soft"><strong>Selected Driver</strong><p>${escapeHtml(selectedDriver.fullName)} has been chosen at an exact fare of ${escapeHtml(formatCurrency(selectedDriver.quote.totalUsd))}. Payment remains locked until arrival is confirmed.</p><button class="button primary" type="button" id="create-trip-button">Create Dispatch</button></div>` : ""}
    </section>
  `;
}

function renderPendingInterviewRoutes() {
  if (state.account?.role !== "user" || state.pendingInterviewRoutes.length === 0) {
    return "";
  }

  return `
    <section class="panel-block success-soft">
      <div class="section-heading">
        <h3>Pending Interview Routes</h3>
        <p>PraeHire interview transit is ready for Farad driver confirmation.</p>
      </div>
      <div class="driver-list">
        ${state.pendingInterviewRoutes
          .map((route) => `
            <article class="driver-card">
              <div class="driver-top">
                <div>
                  <strong>${escapeHtml(route.interview?.company || "Interview Route")}</strong>
                  <div class="muted">${escapeHtml(route.interview?.role || "Interview")} at ${escapeHtml(route.interview?.destination || "destination pending")}</div>
                </div>
                <div class="price-pill">${escapeHtml(route.status || "pending_confirmation")}</div>
              </div>
              <div class="muted">Scheduled: ${escapeHtml(formatDateTime(route.interview?.scheduledAt || route.interview?.scheduledTimestamp || ""))}</div>
              <div class="driver-actions">
                <button class="button primary use-interview-route" data-route-id="${escapeHtml(route.id)}" type="button">Use This Route</button>
              </div>
            </article>
          `)
          .join("")}
      </div>
    </section>
  `;
}

function renderMapPanel() {
  const statusClass = `map-status ${escapeHtml(state.routeMap.status)}`;
  return `
    <section class="panel-block">
      <div class="section-heading">
        <h3>Map and Route Visibility</h3>
        <p>Pickup, destination, driver or truck movement, and route preview stay attached to the autonomous trip timeline.</p>
      </div>
      <div class="map-input-grid">
        <label>
          <span>Pickup Location</span>
          <input id="map-pickup-input" type="text" value="${escapeHtml(state.tripDraft.pickup)}" placeholder="Type pickup address or landmark">
        </label>
        <label>
          <span>Destination / Dropoff</span>
          <input id="map-destination-input" type="text" value="${escapeHtml(state.tripDraft.destination)}" placeholder="Type destination address or landmark">
        </label>
      </div>
      <div class="map-controls">
        <button class="button secondary" id="use-current-location" type="button">Use My Current Location</button>
        <button class="button primary" id="refresh-route-preview" type="button">Refresh Route Preview</button>
      </div>
      <p class="${statusClass}" id="route-map-status">${escapeHtml(state.routeMap.message)}</p>
      <div id="route-map" class="leaflet-route-map" aria-label="Interactive pickup, destination, driver, and route preview map"></div>
      <p class="privacy-note">Location sharing is optional and only runs after you press the location button. Manual address entry always works.</p>
    </section>
  `;
}

function renderSubscriptionGate() {
  const unlocked = isPremiumUnlocked();
  return `
    <section class="panel-block ${unlocked ? "success-soft" : "panel-soft"}">
      <div class="section-heading">
        <h3>Farad Access Status</h3>
        <p>Farad core tools stay open with free monthly limits. Upgrade is optional and never blocks normal sign-in.</p>
      </div>
      <div class="gate-row">
        <div>
          <strong>${unlocked ? `${PLAN_NAME} active` : "Free access active"}</strong>
          <p>${unlocked ? "Your higher monthly limits are active." : `Free usage is open with monthly limits. Choose a USD monthly upgrade only when you want higher limits.`}</p>
        </div>
        ${
          unlocked
            ? ""
            : `<div class="form-foot">
                <button class="button primary" data-subscribe-tier="${PRODUCT_TIER}" type="button">${PLAN_NAME} - USD ${MONTHLY_PLAN_USD}/month</button>
                <button class="button secondary" data-subscribe-tier="${ECOSYSTEM_TIER}" type="button">Prae Ecosystem Pass - USD ${ECOSYSTEM_PLAN_USD}/month</button>
              </div>`
        }
      </div>
    </section>
  `;
}

function renderAccessSetup() {
  const isDriverPortal = state.account?.role === "driver";

  return `
    <section class="dashboard-shell">
      <div class="dashboard-top">
        <div>
          <p class="eyebrow">${isDriverPortal ? "Driver Access Setup" : "Access Setup"}</p>
          <h2>Welcome, ${escapeHtml(state.account?.fullName || state.authUser?.displayName || state.authUser?.email || "Operator")}</h2>
          <p class="lead small">Your account is ready. Complete activation to open the full Farad AI command workspace instantly.</p>
        </div>
        <div class="top-actions">
          <button class="button secondary" id="logout-button" type="button">Sign Out</button>
        </div>
      </div>
      <section class="panel-block">
        <div class="section-heading">
          <h3>Activation in progress</h3>
          <p>If you already completed payment, Farad will open your dashboard as soon as the secure access check finishes. If it does not, chat with <a href="https://mexty.web.app" target="_blank" rel="noreferrer">Mexty</a>.</p>
        </div>
      </section>
    </section>
  `;
}

function renderTripStatus() {
  if (!state.currentTrip) {
    return "";
  }

  const driverPhone = state.currentTrip.driverPhone;
  const canPay = state.currentTrip.status === "arrived" && state.currentTrip.paymentStatus !== "paid";

  return `
    <section class="panel-block">
      <div class="section-heading">
        <h3>Current Dispatch Status</h3>
        <p>Arrival unlocks the final USD settlement gate and keeps the driver and rider synced.</p>
      </div>
      <div class="detail-grid">
        <div class="detail-card">
          <strong>Status</strong>
          <p>${escapeHtml(state.currentTrip.status || "pending")}</p>
        </div>
        <div class="detail-card">
          <strong>Exact Fare</strong>
          <p>${escapeHtml(formatCurrency(state.currentTrip.quote?.totalUsd || 0))}</p>
        </div>
        <div class="detail-card">
          <strong>Payment Preference</strong>
          <p>${escapeHtml(state.currentTrip.paymentPreference || state.tripDraft.paymentPreference || "Card")}</p>
        </div>
      </div>
      <div class="driver-actions">
        <button class="button secondary" id="refresh-trip" type="button">Refresh Trip</button>
        ${driverPhone ? `<a class="button secondary link-button" href="tel:${escapeHtml(driverPhone)}">Call Driver</a>` : ""}
        ${canPay ? `<button class="button primary" id="pay-driver-button" type="button" ${state.busy.payment ? "disabled" : ""}>${state.busy.payment ? "Opening checkout..." : "Pay Driver Now"}</button>` : ""}
      </div>
    </section>
  `;
}

function renderDriverOnboarding() {
  const question = currentDriverQuestion();
  const value = state.driverForm[question.key] || "";
  const verificationState = state.account?.verification?.state || "not_started";
  const verificationMessage = state.account?.verification?.message || "Complete the driver onboarding wizard and upload a clear vehicle image.";
  const rejected = verificationState === "rejected" || verificationState === "locked" || state.account?.status === "locked";

  return `
    <section class="panel-block" id="driver-portal">
      <div class="section-heading">
        <h3>Verified Driver Portal</h3>
        <p>Farad AI collects your driver details one step at a time, then runs a real vehicle inspection gate.</p>
      </div>
      ${rejected ? `<div class="detail-card danger-soft"><strong>Vehicle inspection verification failed.</strong><p>${escapeHtml(verificationMessage)} To appeal your model year status or complete manual verification, please talk directly to <a href="https://mexty.web.app" target="_blank" rel="noreferrer">Mexty</a>.</p></div>` : `<div class="detail-card"><strong>Verification status</strong><p>${escapeHtml(verificationState)} • ${escapeHtml(verificationMessage)}</p></div>`}
      <div class="wizard-shell">
        <div class="wizard-meta">Question ${state.driverStep + 1} of ${driverQuestions.length}</div>
        <div class="wizard-prompt">${escapeHtml(question.prompt)}</div>
        <label class="wizard-field">
          <span>${escapeHtml(question.label)}</span>
          <input id="driver-question-input" data-driver-key="${question.key}" value="${escapeHtml(value)}" placeholder="${escapeHtml(question.placeholder)}">
        </label>
        <div class="wizard-actions">
          <button class="button secondary" type="button" id="driver-prev" ${state.driverStep === 0 ? "disabled" : ""}>Previous Question</button>
          <button class="button secondary" type="button" id="driver-next">${state.driverStep === driverQuestions.length - 1 ? "Stay on Review" : "Next Question"}</button>
        </div>
      </div>
      <form id="driver-onboarding-form" class="stack-form compact">
        <label>
          <span>Vehicle Image for AI Verification</span>
          <input id="driver-image" type="file" accept="image/*">
        </label>
        <div class="muted">Farad AI checks that the uploaded vehicle is real, clear, and model year 2020 or newer.</div>
        <button class="button primary" type="submit" ${state.busy.driverSave ? "disabled" : ""}>${state.busy.driverSave ? "Verifying vehicle..." : "Submit Driver Verification"}</button>
      </form>
    </section>
  `;
}

function renderDriverTrips() {
  return `
    <section class="panel-block">
      <div class="section-heading">
        <h3>Driver Dispatch Board</h3>
        <p>When riders create dispatches, Farad notifies you here and you can accept, cancel, or mark arrival.</p>
      </div>
      <div class="driver-list">
        ${state.trips.length === 0 ? `<div class="empty-state">No rider dispatches are assigned yet.</div>` : state.trips.map((trip) => `
          <article class="driver-card">
            <div class="driver-top">
              <div>
                <strong>${escapeHtml(trip.riderName || trip.riderEmail)}</strong>
                <div class="muted">${escapeHtml(trip.pickup)} to ${escapeHtml(trip.destination)}</div>
              </div>
              <div class="price-pill">${escapeHtml(formatCurrency(trip.quote?.totalUsd || 0))}</div>
            </div>
            <div class="muted">Status: ${escapeHtml(trip.status || "awaiting_driver_response")}</div>
            <div class="driver-actions">
              <button class="button secondary trip-status" data-trip-id="${trip.id}" data-status="accepted" type="button">Accept</button>
              <button class="button secondary trip-status" data-trip-id="${trip.id}" data-status="en_route" type="button">En Route</button>
              <button class="button secondary trip-status" data-trip-id="${trip.id}" data-status="arrived" type="button">Arrived</button>
              <button class="button secondary trip-status" data-trip-id="${trip.id}" data-status="cancelled" type="button">Cancel</button>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderAdminCard() {
  if (!isAdminAccount()) {
    return "";
  }

  return `
    <section class="panel-block success-soft">
      <div class="section-heading">
        <h3>Operations Console</h3>
        <p>Your account has expanded operational controls for Farad system management and premium network oversight.</p>
      </div>
    </section>
  `;
}

function renderIntegrationCard(provider, label) {
  const integration = state.integrations[provider];
  const status = integration.status || "not_connected";

  return `
    <article class="integration-card">
      <div class="integration-top">
        <strong>${escapeHtml(label)}</strong>
      </div>
      <div class="form-foot">
        <button class="button primary connect-integration" data-integration-connect="${provider}" type="button" ${status === "pending" ? "disabled" : ""}>
          ${status === "connected" ? "Connected" : status === "pending" ? "Waiting" : "Connect"}
        </button>
      </div>
    </article>
  `;
}

function renderIntegrationsMarketplacePanel() {
  return `
    <section class="panel-block">
      <div class="section-heading">
        <h3>Integrations Marketplace</h3>
      </div>
      <div class="integration-grid">
        ${renderIntegrationCard("chatgpt", "ChatGPT")}
        ${renderIntegrationCard("calendar", "Google Calendar")}
        ${renderIntegrationCard("slack", "Slack")}
      </div>
    </section>
  `;
}

function renderDeveloperSettingsPanel() {
  const token = state.developerSettings.apiToken;
  const created = state.developerSettings.tokenCreatedAt
    ? formatDateTime(state.developerSettings.tokenCreatedAt)
    : "No active token";

  return `
    <section class="panel-block">
      <div class="section-heading">
        <h3>Developer Settings</h3>
        <p>Manage a mocked Farad API token for future automations, partner dispatches, and secure account extensions.</p>
      </div>
      <div class="developer-token-box">
        <div>
          <span class="muted">Current API Token</span>
          <code>${token ? escapeHtml(token) : "No token generated yet"}</code>
        </div>
        <div>
          <span class="muted">Created</span>
          <strong>${escapeHtml(created)}</strong>
        </div>
      </div>
      <div class="form-foot">
        <button class="button primary" id="generate-api-token" type="button">${token ? "Regenerate Token" : "Generate Token"}</button>
        <button class="button secondary" id="revoke-api-token" type="button" ${token ? "" : "disabled"}>Revoke Token</button>
      </div>
    </section>
  `;
}

function renderUserPremiumWorkspace() {
  if (state.account?.role !== "user") {
    return "";
  }

  return `
    <section class="premium-workspace">
      <div class="tab-row workspace-tabs">
        <button class="tab ${state.userWorkspaceTab === "integrations" ? "active" : ""}" data-user-workspace-tab="integrations" type="button">Integrations Marketplace</button>
        <button class="tab ${state.userWorkspaceTab === "developer" ? "active" : ""}" data-user-workspace-tab="developer" type="button">Developer Settings</button>
      </div>
      ${state.userWorkspaceTab === "developer" ? renderDeveloperSettingsPanel() : renderIntegrationsMarketplacePanel()}
    </section>
  `;
}

function renderFounderAndPolicies() {
  const page = landingPage();

  if (page === "founder") {
    return `
      <section class="page-shell" id="founder">
        <div class="founder-hero">
          <div class="founder-mark">
            <img src="/logo.png" alt="Farad AI logo">
          </div>
          <h1 class="founder-title">The Mind Behind Farad AI</h1>
        </div>
        <article class="panel-block page-panel narrative-card">
          <p class="policy-text">
            I am <strong>Jeremiah Adedurin</strong>, also known as Jerry, the Chief Technology Officer and Founder of Prae Technologies, and the architect behind Farad AI.
          </p>
          <p class="policy-text">
            My journey into technology was built on persistence, reinvention, and an obsession with designing systems that solve real human problems at scale. I taught myself to master complex tools, sharpened my engineering mindset through years of deep practice, and kept building until difficult ideas became usable products.
          </p>
          <p class="policy-text">
            Farad AI exists because movement, logistics, and delivery should feel smarter, calmer, and more coordinated. I built it to turn modern automation into something practical people can trust every day.
          </p>
        </article>
        <article class="panel-block page-panel narrative-card">
          <div class="section-heading">
            <h3>Why Farad AI?</h3>
          </div>
          <p class="policy-text">
            I built Farad AI because transportation and delivery should not feel chaotic, wasteful, or guess-heavy. Whether someone is moving across town, dispatching a driver, or managing premium logistics, the experience should be smooth, exact, and intelligent from start to finish.
          </p>
        </article>
      </section>
    `;
  }

  if (page === "policies") {
    return `
      <section class="page-shell" id="policies">
        <article class="panel-block page-panel legal-panel">
          <div class="section-heading">
            <h2>Privacy Policy</h2>
            <p>Last updated: May 25, 2026</p>
          </div>
          <p class="policy-text"><strong>1. Information We Collect</strong></p>
          <p class="policy-text">Farad AI collects account details, trip and delivery information, driver onboarding records, vehicle verification images, payment-related access references, and service preferences required to operate the platform smoothly.</p>
          <p class="policy-text"><strong>2. How We Use Your Information</strong></p>
          <p class="policy-text">We use this information to deliver logistics services, coordinate drivers and riders, verify access, improve trip planning, process account reviews, and maintain platform security.</p>
          <p class="policy-text"><strong>3. Data Security</strong></p>
          <p class="policy-text">Farad keeps user movement data, credentials, uploaded driver vehicle images, and trip history securely isolated inside protected private records and never sells them to third-party brokers.</p>
          <p class="policy-text"><strong>4. Refund Policy</strong></p>
          <p class="policy-text">Because Farad AI activates premium AI planning, vehicle vision assessments, and live orchestration workloads as soon as access is granted, refund requests pass through internal Prae Technologies review via support lines.</p>
          <p class="policy-text"><strong>5. Support</strong></p>
          <p class="policy-text">For urgent verification or account review support, contact <a href="https://mexty.web.app" target="_blank" rel="noreferrer">Mexty</a>.</p>
        </article>
      </section>
    `;
  }

  return `
    <section class="page-shell compact-empty"></section>
  `;
}

function renderUserDashboard() {
  return `
    <section class="dashboard-shell">
      <div class="dashboard-top">
        <div>
          <p class="eyebrow">Farad AI Control Center</p>
          <h2>Welcome, ${escapeHtml(state.account?.fullName || state.authUser?.displayName || state.authUser?.email || "Operator")}</h2>
          <p class="lead small">Autonomous trip intelligence, premium billing, driver marketplace, and exact USD settlement live in one control surface.</p>
        </div>
        <div class="top-actions">
          ${isAdminAccount() ? `<span class="badge">Operations</span>` : ""}
          <button class="button secondary" id="logout-button" type="button">Sign Out</button>
        </div>
      </div>
      ${renderAdminCard()}
      <div class="dashboard-grid">
        <div class="dashboard-main">
          ${renderUsageSummary()}
          ${renderSubscriptionGate()}
          ${renderUserPremiumWorkspace()}
          ${renderTripWizard()}
          ${renderConversation()}
          ${renderPendingInterviewRoutes()}
          ${renderMarketplace()}
          ${renderTripStatus()}
        </div>
        <aside class="dashboard-side">
          ${renderMapPanel()}
          <section class="panel-block">
            <div class="section-heading">
              <h3>Support Core</h3>
              <p>Need urgent operational assistance or verification review? Chat with our live support core: <a href="https://mexty.web.app" target="_blank" rel="noreferrer">Mexty</a>.</p>
            </div>
          </section>
        </aside>
      </div>
    </section>
  `;
}

function renderDriverDashboard() {
  const verified = state.account?.status === "verified" && state.account?.verification?.approved === true;

  return `
    <section class="dashboard-shell">
      <div class="dashboard-top">
        <div>
          <p class="eyebrow">Farad Driver Command Surface</p>
          <h2>Welcome, ${escapeHtml(state.account?.fullName || state.authUser?.displayName || state.authUser?.email || "Driver")}</h2>
          <p class="lead small">Publish your exact USD rates, complete AI inspection, and manage incoming rider dispatches autonomously.</p>
        </div>
        <div class="top-actions">
          ${isAdminAccount() ? `<span class="badge">Operations</span>` : ""}
          <button class="button secondary" id="logout-button" type="button">Sign Out</button>
        </div>
      </div>
      ${renderAdminCard()}
      ${renderDriverOnboarding()}
      ${verified ? renderDriverTrips() : ""}
    </section>
  `;
}

function renderApp() {
  const showGlobalAlert = Boolean(state.alert && (state.authUser || !["home", "pricing", "driver-portal"].includes(landingPage())));
  const nav = `
    <header class="topbar">
      <a class="brand" href="#home">
        <img src="/logo.png" alt="Farad logo">
        <div>
          <strong>Farad AI</strong>
          <span>Prae Technologies Autonomous Mobility Stack</span>
        </div>
      </a>
      <button class="menu-button" id="menu-button" type="button" aria-expanded="${state.menuOpen ? "true" : "false"}" aria-controls="site-nav">Menu</button>
      <nav id="site-nav" class="${state.menuOpen ? "open" : ""}">
        <a href="#home">Home</a>
        <a href="#pricing">Global Pricing</a>
        <a href="#driver-portal">Driver Portal</a>
        <a href="#founder">About Founder</a>
        <a href="#policies">Corporate Policies</a>
      </nav>
    </header>
  `;

  const content = state.loading
    ? `<section class="panel-block"><div class="loading">Booting Farad AI...</div></section>`
    : state.authUser && state.account
      ? isDriver()
        ? renderDriverDashboard()
        : renderUserDashboard()
      : landingPage() === "home" || landingPage() === "pricing" || landingPage() === "driver-portal"
        ? `${renderLanding()}${renderAuth()}`
        : renderFounderAndPolicies();

  app.innerHTML = `
    <div class="shell">
      ${nav}
      ${showGlobalAlert ? renderAlert() : ""}
      ${content}
      <footer class="footer">
        <span>© Prae Technologies. All Rights Reserved.</span>
        <span>Need urgent operational assistance or verification review? Chat with our live support core: <a href="https://mexty.web.app" target="_blank" rel="noreferrer">Mexty</a></span>
      </footer>
    </div>
  `;

  wireEvents();
}

function wireEvents() {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.roleView = button.getAttribute("data-mode");
      clearAlert();
      render();
    });
  });

  const authForm = document.querySelector("#auth-form");
  if (authForm) {
    authForm.addEventListener("submit", handleAuthSubmit);
    authForm.querySelectorAll("[data-auth-key]").forEach((input) => {
      input.addEventListener("input", () => {
        updateAuthField(state.roleView, input.getAttribute("data-auth-key"), input.value);
      });
    });
    authForm.querySelectorAll("[data-toggle-secret]").forEach((button) => {
      button.addEventListener("click", () => {
        toggleAuthVisibility(state.roleView, button.getAttribute("data-toggle-secret"));
      });
    });
  }
  const activationForm = document.querySelector("#activation-form");
  if (activationForm) {
    activationForm.addEventListener("submit", handleActivationSubmit);
    activationForm.querySelectorAll("[data-activation-auth-key]").forEach((input) => {
      input.addEventListener("input", () => {
        updateActivationAuthField(state.roleView, input.getAttribute("data-activation-auth-key"), input.value);
      });
    });
    activationForm.querySelectorAll("[data-toggle-secret]").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = state.roleView.startsWith("driver") ? "driver-signup" : "user-signup";
        toggleAuthVisibility(mode, button.getAttribute("data-toggle-secret"));
      });
    });
  }

  document.querySelector("#forgot-password")?.addEventListener("click", handleForgotPassword);
  document.querySelector("#google-auth-button")?.addEventListener("click", handleGoogleAuth);
  document.querySelector("#google-signup-button")?.addEventListener("click", handleGoogleAuth);
  document.querySelector("#menu-button")?.addEventListener("click", () => {
    state.menuOpen = !state.menuOpen;
    render();
  });
  document.querySelectorAll("#site-nav a").forEach((link) => {
    link.addEventListener("click", () => {
      state.menuOpen = false;
      render();
    });
  });
  document.querySelector("#logout-button")?.addEventListener("click", async () => {
    await logout();
  });

  const tripInput = document.querySelector("#trip-question-input");
  tripInput?.addEventListener("input", () => updateTripField(tripInput.getAttribute("data-trip-key"), tripInput.value));
  document.querySelector("#trip-prev")?.addEventListener("click", () => {
    state.tripStep = Math.max(0, state.tripStep - 1);
    render();
  });
  document.querySelector("#trip-next")?.addEventListener("click", () => {
    state.tripStep = Math.min(tripQuestions.length - 1, state.tripStep + 1);
    render();
  });

  const driverInput = document.querySelector("#driver-question-input");
  driverInput?.addEventListener("input", () => updateDriverField(driverInput.getAttribute("data-driver-key"), driverInput.value));
  document.querySelector("#driver-prev")?.addEventListener("click", () => {
    state.driverStep = Math.max(0, state.driverStep - 1);
    render();
  });
  document.querySelector("#driver-next")?.addEventListener("click", () => {
    state.driverStep = Math.min(driverQuestions.length - 1, state.driverStep + 1);
    render();
  });

  const driverImageInput = document.querySelector("#driver-image");
  driverImageInput?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    state.driverForm.vehicleImageFile = file;
    state.driverForm.vehicleImageName = file.name;
    state.driverForm.vehicleImageBase64 = await fileToBase64(file);
  });

  document.querySelector("#driver-onboarding-form")?.addEventListener("submit", handleDriverOnboardingSubmit);

  const aiForm = document.querySelector("#ai-form");
  aiForm?.addEventListener("submit", handleAiSubmit);
  document.querySelector("#command-input")?.addEventListener("input", (event) => {
    state.commandInput = event.target.value;
  });
  document.querySelector("#sync-marketplace")?.addEventListener("click", refreshDriverMarketplace);
  document.querySelector("#map-pickup-input")?.addEventListener("input", (event) => {
    updateTripField("pickup", event.target.value);
  });
  document.querySelector("#map-destination-input")?.addEventListener("input", (event) => {
    updateTripField("destination", event.target.value);
  });
  document.querySelector("#use-current-location")?.addEventListener("click", requestCurrentLocation);
  document.querySelector("#refresh-route-preview")?.addEventListener("click", () => syncRoutePreview());

  document.querySelectorAll(".select-driver").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDriverId = button.getAttribute("data-driver-id");
      state.routeMap.driverCoords = estimateDriverCoords(state.routeMap.pickupCoords, state.routeMap.destinationCoords);
      render();
    });
  });

  document.querySelector("#create-trip-button")?.addEventListener("click", handleCreateTrip);
  document.querySelectorAll("[data-subscribe-tier]").forEach((button) => {
    button.addEventListener("click", () => handleSubscriptionCheckout(button.dataset.subscribeTier));
  });
  document.querySelector("#refresh-trip")?.addEventListener("click", refreshCurrentTrip);
  document.querySelector("#pay-driver-button")?.addEventListener("click", handleTripPayment);
  document.querySelectorAll(".use-interview-route").forEach((button) => {
    button.addEventListener("click", () => {
      const route = state.pendingInterviewRoutes.find((item) => item.id === button.getAttribute("data-route-id"));
      if (!route) {
        return;
      }

      state.tripDraft = {
        ...state.tripDraft,
        destination: route.interview?.destination || state.tripDraft.destination,
        arrivalTime: route.interview?.scheduledTimestamp || route.interview?.scheduledAt || state.tripDraft.arrivalTime
      };
      state.tripStep = 0;
      setAlert("success", "Interview route loaded into Farad trip intake. Add pickup details, then refresh the driver marketplace.");
      render();
    });
  });

  document.querySelectorAll("[data-user-workspace-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.userWorkspaceTab = button.getAttribute("data-user-workspace-tab");
      render();
    });
  });

  document.querySelectorAll("[data-integration-connect]").forEach((button) => {
    button.addEventListener("click", () => {
      connectIntegration(button.getAttribute("data-integration-connect"));
    });
  });

  document.querySelectorAll("[data-integration-disconnect]").forEach((button) => {
    button.addEventListener("click", () => {
      disconnectIntegration(button.getAttribute("data-integration-disconnect"));
    });
  });

  document.querySelector("#generate-api-token")?.addEventListener("click", generateApiToken);
  document.querySelector("#revoke-api-token")?.addEventListener("click", revokeApiToken);

  document.querySelectorAll(".trip-status").forEach((button) => {
    button.addEventListener("click", async () => {
      await updateTripLifecycle(button.getAttribute("data-trip-id"), { status: button.getAttribute("data-status") });
      await loadTripsForCurrentUser();
      if (button.getAttribute("data-status") === "arrived") {
        setAlert("success", "Arrival confirmed. The rider can now settle the exact USD fare.");
      }
    });
  });

  mountRouteMap();
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function buildRouteIntelligence() {
  const { origin, destination } = await syncRoutePreview({ renderAfter: false });
  const estimatedKm = estimateDistanceKm(origin, destination);
  return {
    origin,
    destination,
    estimatedKm
  };
}

async function refreshDriverMarketplace() {
  if (!state.tripDraft.country || !state.tripDraft.pickup || !state.tripDraft.destination) {
    setAlert("error", "Complete the country, pickup, and destination fields first.");
    return;
  }

  const usage = checkAndIncrementUsage("driverSearches");
  if (!usage.ok) {
    setAlert("error", usage.message);
    return;
  }

  state.busy.drivers = true;
  render();

  try {
    const route = await buildRouteIntelligence();
    state.availableDrivers = await fetchAvailableDrivers({
      country: state.tripDraft.country,
      estimatedKm: route.estimatedKm
    });
    setAlert(
      state.availableDrivers.length > 0 ? "success" : "error",
      state.availableDrivers.length > 0
        ? `Matched ${state.availableDrivers.length} verified driver option(s) in USD.`
        : "No verified drivers matched your current country filter yet."
    );
  } catch (error) {
    captureAppError(error, { area: "driver-marketplace", action: "refresh" });
    setAlert("error", error.message || "Could not refresh drivers.");
  } finally {
    state.busy.drivers = false;
    render();
  }
}

async function handleAiSubmit(event) {
  event.preventDefault();
  if (!state.commandInput.trim()) {
    return;
  }

  const usage = checkAndIncrementUsage("aiCommands");
  if (!usage.ok) {
    setAlert("error", usage.message);
    return;
  }

  state.busy.tripAi = true;
  const prompt = state.commandInput.trim();
  state.conversation.push({ role: "user", content: prompt, time: new Date() });
  state.commandInput = "";
  render();

  try {
    if (state.tripDraft.pickup && state.tripDraft.destination) {
      await refreshDriverMarketplace();
    }

    const result = await runFleetConversation({
      prompt,
      history: state.conversation,
      tripDraft: state.tripDraft,
      drivers: state.availableDrivers,
      connectedIntegrations: Object.entries(state.integrations)
        .filter(([, integration]) => integration.enabled)
        .map(([provider]) => provider)
    });

    state.conversation.push({
      role: "ai",
      content: result.text,
      source: result.source,
      time: new Date()
    });
  } catch (error) {
    captureAppError(error, { area: "ai", action: "trip-command" });
    state.conversation.push({
      role: "ai",
      content: `Mission Summary\nFarad AI could not complete the request.\n\nClarifying Questions\n- Please confirm your trip details and try again.\n\nRoute Logic\n- Existing intake data was preserved.\n\nDispatch Readiness\n- Marketplace data was not changed.\n\nFleet Note\n- ${error.message}`,
      source: "error",
      time: new Date()
    });
  } finally {
    state.busy.tripAi = false;
    render();
  }
}

async function handleDriverOnboardingSubmit(event) {
  event.preventDefault();
  if (!state.authUser) {
    return;
  }

  state.busy.driverSave = true;
  render();

  try {
    const verification = await saveDriverOnboarding(state.authUser.uid, state.driverForm);
    state.account = await loadAccountRecord(state.authUser.uid);
    setAlert(
      verification.approved ? "success" : "error",
      verification.approved
        ? "Driver verified successfully. Your dispatch dashboard is unlocked."
        : "Vehicle inspection verification failed. Talk to Mexty for manual review if needed."
    );
    await loadTripsForCurrentUser();
  } catch (error) {
    captureAppError(error, { area: "driver", action: "onboarding-submit" });
    setAlert("error", error.message || "Driver verification failed.");
  } finally {
    state.busy.driverSave = false;
    render();
  }
}

async function handleCreateTrip() {
  if (!state.authUser || !state.selectedDriverId) {
    return;
  }

  const usage = checkAndIncrementUsage("dispatches");
  if (!usage.ok) {
    setAlert("error", usage.message);
    return;
  }

  try {
    const route = await buildRouteIntelligence();
    const selectedDriver = state.availableDrivers.find((driver) => driver.id === state.selectedDriverId);
    const tripId = await createMarketplaceTrip({
      rider: state.authUser,
      driver: selectedDriver,
      tripDraft: state.tripDraft,
      quote: selectedDriver.quote,
      coordinates: route
    });
    state.currentTripId = tripId;
    await refreshCurrentTrip();
    setAlert("success", "Dispatch created. The driver can now accept or cancel from the driver portal.");
  } catch (error) {
    captureAppError(error, { area: "trip", action: "create-dispatch" });
    setAlert("error", error.message || "Could not create dispatch.");
  }
}

async function refreshCurrentTrip() {
  if (!state.currentTripId) {
    await loadTripsForCurrentUser();
    return;
  }

  const trip = await getTripRecord(state.currentTripId);
  state.currentTrip = trip;
  await loadTripsForCurrentUser();
}

async function handleSubscriptionCheckout(productTier = PRODUCT_TIER) {
  if (!state.authUser || !state.account) {
    setAlert("error", "Sign in first, then choose upgrade when you are ready.");
    return;
  }

  const normalizedTier = productTier === ECOSYSTEM_TIER ? ECOSYSTEM_TIER : PRODUCT_TIER;
  const amount = normalizedTier === ECOSYSTEM_TIER ? ECOSYSTEM_PLAN_USD : MONTHLY_PLAN_USD;

  try {
    const idToken = await state.authUser.getIdToken();
    savePendingPayment({
      type: "subscription",
      productTier: normalizedTier,
      app: normalizedTier === ECOSYSTEM_TIER ? "all" : "farad",
      amount,
      email: state.authUser.email || state.account.email || "",
      role: state.account.role || "user",
      state: "pending"
    });

    await openSubscriptionCheckout({
      email: state.authUser.email || state.account.email || "",
      name: state.account.fullName || state.authUser.displayName || state.authUser.email || "Farad Member",
      role: state.account.role || "user",
      productTier: normalizedTier,
      userId: state.authUser.uid,
      idToken
    });
  } catch (error) {
    captureAppError(error, { area: "billing", action: "subscription-checkout" });
    setAlert("error", error.message || "Upgrade checkout could not open. Your free access remains active.");
  }
}

async function handleActivationRequestSubmit(event) {
  event.preventDefault();

  const { fullName, email, portal, txRef, note } = state.activationRequest;
  if (!fullName.trim() || !email.trim() || !txRef.trim()) {
    setAlert("error", "Enter your full name, email, and payment reference before sending your verification request.");
    return;
  }

  if (!db) {
    setAlert("error", "Verification requests are not available right now. Please contact support.");
    return;
  }

  try {
    await addDoc(collection(db, "activation_requests"), {
      fullName: fullName.trim(),
      email: email.trim(),
      emailLower: email.trim().toLowerCase(),
      portal,
      txRef: txRef.trim(),
      note: note.trim(),
      status: "pending",
      source: "farad-web",
      createdAt: serverTimestamp()
    });

    state.activationRequest = {
      fullName: "",
      email: email.trim(),
      portal,
      txRef: "",
      note: ""
    };
    setAlert("success", "Your verification request has been sent. Access will be updated after payment review.");
  } catch (error) {
    captureAppError(error, { area: "activation", action: "request-submit" });
    setAlert("error", "Verification request could not be sent right now. Please contact support with your payment reference.");
  } finally {
    render();
  }
}

async function handleActivationStatusLookup(event) {
  event.preventDefault();

  const email = state.activationLookup.email.trim();
  const txRef = state.activationLookup.txRef.trim();
  if (!email) {
    setAlert("error", "Enter your email first to check your access status.");
    return;
  }

  try {
    const approval = await loadAccessApprovalByEmail(email);
    if (approval?.status === "active") {
      state.activationLookupResult = {
        status: "approved",
        message: "Your access is active. You can now continue with login using this email.",
        reference: txRef || approval.lastTxRef || ""
      };
      render();
      return;
    }

    const requestSnapshot = await getDocs(
      query(collection(db, "activation_requests"), where("emailLower", "==", email.toLowerCase()), limit(10))
    );
    const requests = requestSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    const matched = txRef
      ? requests.find((item) => String(item.txRef || "").trim().toLowerCase() === txRef.toLowerCase())
      : requests[0];

    if (!matched) {
      state.activationLookupResult = {
        status: "not_found",
        message: "No access request was found for this email yet. Activate your subscription and send your payment reference first.",
        reference: txRef
      };
      render();
      return;
    }

    const statusMap = {
      pending: "Your verification request is pending review. Please check back shortly.",
      approved: "Your payment has been approved. You can continue with login using this email.",
      rejected: "Your request was not approved yet. Please contact support with your payment reference."
    };

    state.activationLookupResult = {
      status: matched.status || "pending",
      message: statusMap[matched.status || "pending"] || "Your request is being reviewed.",
      reference: matched.txRef || txRef
    };
  } catch (error) {
    captureAppError(error, { area: "activation", action: "status-lookup" });
    state.activationLookupResult = {
      status: "unavailable",
      message: "Status lookup is not available right now. Please contact support with your payment reference.",
      reference: txRef
    };
  } finally {
    render();
  }
}

async function loadActivationRequests() {
  if (!db || !isAdminAccount()) {
    state.activationRequests = [];
    return;
  }

  const snapshot = await getDocs(query(collection(db, "activation_requests"), where("status", "==", "pending"), limit(20)));
  state.activationRequests = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function handleActivationDecision(requestId, decision) {
  const request = state.activationRequests.find((item) => item.id === requestId);
  if (!request || !db || !state.authUser?.email) {
    return;
  }

  state.busy.activationReview = true;
  render();

  try {
    if (decision === "approve") {
      await setDoc(
        doc(db, "access_approvals", String(request.emailLower || request.email || "").trim().toLowerCase()),
        {
          email: request.email,
          emailLower: String(request.emailLower || request.email || "").trim().toLowerCase(),
          portal: request.portal || "user",
          status: "active",
          premium_access: {
            farad: true,
            praehire: true
          },
          subscription_status: "active",
          approvedAt: serverTimestamp(),
          approvedBy: state.authUser.email
        },
        { merge: true }
      );
    }

    await updateDoc(doc(db, "activation_requests", requestId), {
      status: decision === "approve" ? "approved" : "rejected",
      reviewedAt: serverTimestamp(),
      reviewedBy: state.authUser.email
    });

    state.activationRequests = state.activationRequests.filter((item) => item.id !== requestId);
    setAlert("success", decision === "approve" ? "Access approved successfully." : "Verification request rejected.");
  } catch (error) {
    captureAppError(error, { area: "activation", action: "admin-decision" });
    setAlert("error", "Activation review could not be completed right now.");
  } finally {
    state.busy.activationReview = false;
    render();
  }
}

async function handleTripPayment() {
  if (!state.authUser || !state.currentTrip) {
    return;
  }

  state.busy.payment = true;
  render();

  try {
    const driver = state.availableDrivers.find((item) => item.id === state.currentTrip.driverUid) || {
      fullName: state.currentTrip.driverName,
      contact: { phone: state.currentTrip.driverPhone }
    };

    const amountUsd = Number(state.currentTrip.quote?.totalUsd || 0);
    savePendingPayment({
      type: "trip",
      tripId: state.currentTrip.id,
      amountUsd
    });

    openTripSettlementCheckout({
      user: state.authUser,
      driver,
      amountUsd,
      tripId: state.currentTrip.id
    });
  } catch (error) {
    captureAppError(error, { area: "billing", action: "trip-payment" });
    setAlert("error", error.message || "Could not start driver payment.");
  } finally {
    state.busy.payment = false;
    render();
  }
}

function render() {
  renderApp();
}

window.addEventListener("hashchange", render);

if (!firebaseReady) {
  state.loading = false;
  state.alert = {
    type: "error",
    message:
      "Farad is still connecting its private access systems. Refresh shortly and try again."
  };
}

capturePraeHireTransitFromUrl();

{
  const params = new URLSearchParams(window.location.search);
  const pendingPayment = readPendingPayment();
  const flutterwaveStatus = String(params.get("status") || "").toLowerCase();
  const transactionId = params.get("transaction_id") || params.get("transactionId") || "";
  const paymentState =
    params.get("payment") ||
    (flutterwaveStatus === "successful" || transactionId ? "success" : flutterwaveStatus === "cancelled" || flutterwaveStatus === "failed" ? "failed" : "");
  const paymentVerified = params.get("verified") === "true";
  const paymentType = params.get("type") || pendingPayment?.type || "";
  const paymentTripId = params.get("tripId") || pendingPayment?.tripId || "";
  const paymentEmail = params.get("email") || pendingPayment?.email || "";
  const paymentRole = params.get("role") || pendingPayment?.role || "user";
  const paymentTxRef = params.get("tx_ref") || params.get("txRef") || "";
  const paymentTier = params.get("productTier") || pendingPayment?.productTier || PRODUCT_TIER;
  const paymentApp = params.get("app") || pendingPayment?.app || (paymentTier === ECOSYSTEM_TIER ? "all" : "farad");
  const paymentAmount = Number(params.get("amount") || pendingPayment?.amount || (paymentTier === ECOSYSTEM_TIER ? ECOSYSTEM_PLAN_USD : MONTHLY_PLAN_USD));
  if (paymentState === "success") {
    if (paymentType === "subscription" && paymentEmail && paymentVerified) {
      const subscription = buildSubscriptionRecord({
        userId: state.authUser?.uid || "",
        productTier: paymentTier,
        app: paymentApp,
        amount: paymentAmount,
        status: "active",
        flutterwaveTransactionId: transactionId,
        txRef: paymentTxRef || ""
      });
      saveLocalAccess(paymentEmail, {
        status: "active",
        portal: paymentRole || "user",
        lastTxRef: paymentTxRef || "",
        productTier: paymentTier,
        app: paymentApp,
        amount: paymentAmount,
        currency: "USD",
        billingCycle: "monthly",
        flutterwaveTransactionId: transactionId,
        subscription,
        subscription_status: "active",
        premium_access: {
          farad: true,
          praehire: paymentTier === ECOSYSTEM_TIER,
          prachat: paymentTier === ECOSYSTEM_TIER
        }
      });
    }

    if (paymentType === "trip" && paymentTripId) {
      updateTripLifecycle(paymentTripId, {
        paymentStatus: "paid",
        settledAmountUsd: Number(pendingPayment?.amountUsd || 0),
        settlement: {
          txRef: paymentTxRef,
          transactionId,
          currency: "USD",
          paidAt: new Date().toISOString()
        }
      }).catch((error) => {
        console.warn("Farad trip payment callback update failed.", error);
      });
    }

    clearPendingPayment();
    state.currentTripId = paymentTripId || state.currentTripId;
    state.alert = {
      type: "success",
      message:
        paymentType === "subscription"
          ? `${paymentTier === ECOSYSTEM_TIER ? "Prae Ecosystem Pass" : PLAN_NAME} payment completed successfully. Your monthly access is opening.`
          : "Trip payment verified successfully. The driver settlement is now recorded in USD."
    };
  } else if (paymentState === "failed" || paymentState === "cancelled") {
    state.alert = {
      type: "error",
      message:
        paymentState === "cancelled"
          ? "Upgrade checkout was cancelled. Your free access remains active."
          : "Payment did not complete successfully. You can try again whenever you are ready."
    };
    clearPendingPayment();
  }
}

window.addEventListener("farad-payment-closed", (event) => {
  if (event.detail?.type !== "subscription") return;
  state.alert = {
    type: "error",
    message: "Upgrade checkout was closed or cancelled. Your free access remains active."
  };
  clearPendingPayment();
  render();
});

window.addEventListener("farad-payment-verifying", () => {
  state.alert = {
    type: "success",
    message: "Verifying payment securely. Please keep this page open."
  };
  render();
});

window.addEventListener("farad-payment-verification-failed", (event) => {
  state.alert = {
    type: "error",
    message: event.detail?.message || "Payment verification failed. Your free access remains active."
  };
  clearPendingPayment();
  render();
});

async function bootstrapApp() {
  try {
    resolveIntegrationCallback();
    await ensureAuthPersistence();
    const googleResult = await resolveGoogleRedirectFlow();
    if (googleResult) {
      setAlert(
        "success",
        `Google ${googleResult.intent === "signup" ? "sign-up" : "login"} completed successfully.`
      );
      await hydrateSession(googleResult.user);
    } else {
      const currentUser = await waitForCurrentAuthUser(5000);

      if (currentUser?.uid) {
        await hydrateSession(currentUser);
      }
    }
  } catch (error) {
    captureAppError(error, { area: "bootstrap", action: "initial-auth-routing" });
    state.loading = false;
    setAlert("error", friendlyAuthError(error));
  } finally {
    render();
    subscribeToAuth(hydrateSession);
  }
}

bootstrapApp();
