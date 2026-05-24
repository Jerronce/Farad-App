import "./styles.css";
import {
  firebaseReady,
  ROOT_ADMIN_EMAILS,
  db,
  firebaseHelpers,
  signUpAccount,
  signInAccount,
  signInWithGoogleFlow,
  loadAccountRecord,
  requestPasswordReset,
  subscribeToAuth,
  logout,
  updateAccountRecord
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
  MONTHLY_PLAN_USD,
  hasActivePremium,
  openSubscriptionCheckout,
  openTripSettlementCheckout
} from "./services/billing.js";

const { collection, query, where, getDocs, limit, onSnapshot } = firebaseHelpers;

const app = document.querySelector("#app");
const landingPage = () => window.location.hash.replace("#", "") || "home";

const tripQuestions = [
  { key: "country", label: "Country", prompt: "Which country should Farad Fleet AI operate in for this trip?", placeholder: "Enter country" },
  { key: "pickup", label: "Pickup Location", prompt: "Where should the journey begin?", placeholder: "Pickup address or landmark" },
  { key: "destination", label: "Destination", prompt: "Where should Farad deliver or drop you safely?", placeholder: "Destination address or landmark" },
  { key: "extraStop", label: "Extra Stop", prompt: "Do you have an optional intermediate stop or collection point?", placeholder: "Optional stop" },
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
    "user-signup": { fullName: "", email: "", phone: "", password: "" },
    "driver-login": { email: "", password: "" },
    "driver-signup": { fullName: "", email: "", phone: "", password: "" }
  },
  tripDraft: {
    country: "",
    pickup: "",
    destination: "",
    extraStop: "",
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
        "Mission Summary\nFarad Fleet AI is online.\n\nClarifying Questions\n- Tell me your movement goal and I will guide the route intake.\n\nRoute Logic\n- Every trip is optimized for lower fuel waste and better timing.\n\nDispatch Readiness\n- Once your details are complete, verified driver bids will appear in USD.\n\nFleet Note\n- Driver settlement opens only after arrival is confirmed.",
      source: "system",
      time: new Date()
    }
  ],
  availableDrivers: [],
  selectedDriverId: "",
  currentTripId: "",
  currentTrip: null,
  trips: [],
  mapEmbedUrl: "",
  busy: {
    auth: false,
    tripAi: false,
    drivers: false,
    driverSave: false,
    payment: false
  },
  unsubTrips: null
};

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

function friendlyAuthError(error) {
  const message = String(error?.message || "");

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
  return isAdminAccount() || hasActivePremium(state.account);
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
    }
  );
}

async function hydrateSession(user) {
  state.authUser = user;

  if (!user) {
    stopTripSubscription();
    state.account = null;
    state.loading = false;
    render();
    return;
  }

  const account = await loadAccountRecord(user.uid);
  if (!account) {
    setAlert("error", "No Firestore account record was found for this sign-in. Please sign up correctly first.");
    await logout();
    return;
  }

  state.account = account;
  state.loading = false;

  if (account.role === "driver") {
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

  subscribeToTrips();
  await loadTripsForCurrentUser();
  render();
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  clearAlert();
  state.busy.auth = true;
  render();

  try {
    const mode = state.roleView;
    const data = state.authForms[mode];

    if (mode === "user-signup") {
      await signUpAccount({ role: "user", ...data });
      setAlert("success", "User account created successfully.");
    } else if (mode === "driver-signup") {
      await signUpAccount({ role: "driver", ...data });
      setAlert("success", "Driver account created. Complete vehicle verification next.");
    } else if (mode === "user-login") {
      await signInAccount({ role: "user", email: data.email, password: data.password });
      setAlert("success", "Welcome back to Farad Fleet AI.");
    } else {
      await signInAccount({ role: "driver", email: data.email, password: data.password });
      setAlert("success", "Driver portal opened.");
    }
  } catch (error) {
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
    const intent = mode.includes("signup") ? "signup" : "login";
    await signInWithGoogleFlow({ role, intent });
    setAlert("success", `Google ${intent === "signup" ? "sign-up" : "login"} completed successfully.`);
  } catch (error) {
    setAlert("error", friendlyAuthError(error));
  } finally {
    state.busy.auth = false;
    render();
  }
}

function updateAuthField(mode, key, value) {
  state.authForms[mode][key] = value;
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

function renderLanding() {
  return `
    <section class="hero-card">
      <div class="hero-copy-shell">
        <p class="eyebrow">Prae Technologies Intelligent Mobility Stack</p>
        <h1>Automate Your Trips, Errands, and Movements with Farad Fleet AI. A Sweeter, Smarter Way to Move Everywhere on Earth.</h1>
        <p class="lead">
          Farad uses elite geographic computing, real-time AI modeling, and a verified driver marketplace to schedule,
          coordinate, and execute journeys while cutting fuel waste across personal movement, errand runs, and logistics missions.
        </p>
        <div class="hero-pills">
          <span>Autonomous dispatch intelligence</span>
          <span>Verified driver compliance</span>
          <span>Shared premium with PraeHire</span>
        </div>
      </div>
      <div class="pricing-card" id="pricing">
        <div class="pricing-label">Global Pricing</div>
        <div class="pricing-value">USD 149<span>/month</span></div>
        <p>
          An active Farad Fleet AI subscription grants comprehensive cross-platform premium rights across the entire Prae Technologies software network, including PraeHire and Farad Fleet AI.
        </p>
        <ul>
          <li>AI trip command terminal access</li>
          <li>Driver marketplace dispatch tools</li>
          <li>Cross-platform Prae ecosystem premium rights</li>
        </ul>
      </div>
    </section>
  `;
}

function renderAuth() {
  const mode = state.roleView;
  const form = state.authForms[mode];
  const isSignup = mode.includes("signup");
  const isDriverPortal = mode.startsWith("driver");

  return `
    <section class="auth-grid" id="home">
      <article class="auth-panel">
        <div class="section-heading">
          <h2>Access Farad Fleet AI</h2>
          <p>Choose the right portal, verify your identity, and unlock the autonomous network.</p>
        </div>
        <div class="tab-row">
          ${[
            ["user-login", "User Login"],
            ["user-signup", "User Sign-Up"],
            ["driver-login", "Driver Login"],
            ["driver-signup", "Driver Sign-Up"]
          ]
            .map(
              ([value, label]) =>
                `<button class="tab ${mode === value ? "active" : ""}" data-mode="${value}" type="button">${label}</button>`
            )
            .join("")}
        </div>
        <form id="auth-form" class="stack-form">
          ${isSignup ? `<label><span>Full Name</span><input data-auth-key="fullName" value="${escapeHtml(form.fullName || "")}" placeholder="Full name" required></label>` : ""}
          <label><span>Active Email</span><input type="email" data-auth-key="email" value="${escapeHtml(form.email || "")}" placeholder="name@example.com" required></label>
          ${isSignup ? `<label><span>Phone Number</span><input data-auth-key="phone" value="${escapeHtml(form.phone || "")}" placeholder="Active phone number" required></label>` : ""}
          <label><span>Secure Password</span><input type="password" data-auth-key="password" value="${escapeHtml(form.password || "")}" placeholder="Secure password" required></label>
          <div class="form-foot">
            <button class="button primary" type="submit" ${state.busy.auth ? "disabled" : ""}>${state.busy.auth ? "Please wait..." : isSignup ? "Create Account" : "Login"}</button>
            <button class="text-link" id="forgot-password" type="button">Forgot Password?</button>
          </div>
        </form>
        <div class="oauth-box">
          <div class="muted">Use instant Google access or continue with your email to enter Farad smoothly.</div>
          <button class="button secondary" id="google-auth-button" type="button" ${state.busy.auth ? "disabled" : ""}>
            ${isSignup ? `Continue with Google for ${isDriverPortal ? "Driver Sign-Up" : "User Sign-Up"}` : `Continue with Google for ${isDriverPortal ? "Driver Login" : "User Login"}`}
          </button>
        </div>
      </article>
      <article class="auth-side panel-soft">
        <div class="section-heading">
          <h2>${isDriverPortal ? "Driver Portal" : "User Command Access"}</h2>
          <p>${isDriverPortal ? "Drivers must pass AI vehicle verification, publish their own USD pricing, and manage live rider requests." : "Users can command trips in natural language, compare exact USD driver bids, and settle only after arrival."}</p>
        </div>
        <div class="detail-card danger-soft">
          <strong>Strict gatekeeping</strong>
          <p>If your email does not already exist in the Firestore registry for the selected portal, login is rejected immediately and you are directed to sign up first.</p>
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
        <p>Type naturally and Farad Fleet AI will refine the trip, ask clarifying questions, and prepare the marketplace.</p>
      </div>
      <div class="conversation-stream">
        ${state.conversation
          .map(
            (item) => `
              <article class="bubble ${item.role}">
                <div class="bubble-head"><span>${item.role === "ai" ? "Farad Fleet AI" : "You"}</span><span>${escapeHtml(formatDateTime(item.time))}</span></div>
                <div class="bubble-body">${escapeHtml(item.content)}</div>
              </article>
            `
          )
          .join("")}
      </div>
      <form id="ai-form" class="stack-form compact">
        <label>
          <span>Command Farad Fleet AI... (e.g., Optimize drone routes for incoming cargo)</span>
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
  const locked = !isPremiumUnlocked();
  const tripReady = state.availableDrivers.length > 0;
  const selectedDriver = state.availableDrivers.find((driver) => driver.id === state.selectedDriverId);

  return `
    <section class="panel-block ${locked ? "locked" : ""}">
      ${locked ? `<div class="lock-overlay"><strong>Premium required.</strong><span>Activate the USD 149 Prae Technologies premium plan to open the Farad dispatch canvas.</span></div>` : ""}
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

function renderMapPanel() {
  return `
    <section class="panel-block">
      <div class="section-heading">
        <h3>Map and Route Visibility</h3>
        <p>Pickup, destination, and movement visibility stay attached to the autonomous trip timeline.</p>
      </div>
      ${state.mapEmbedUrl ? `<iframe class="map-frame" src="${escapeHtml(state.mapEmbedUrl)}" loading="lazy" title="Trip map"></iframe>` : `<div class="map-placeholder">Complete pickup and destination details to render the route map.</div>`}
    </section>
  `;
}

function renderSubscriptionGate() {
  if (isDriver()) {
    return "";
  }

  const unlocked = isPremiumUnlocked();
  return `
    <section class="panel-block ${unlocked ? "success-soft" : "danger-soft"}">
      <div class="section-heading">
        <h3>Prae Ecosystem Premium Gate</h3>
        <p>Farad Fleet AI and PraeHire share one premium access layer across the Prae Technologies network.</p>
      </div>
      <div class="gate-row">
        <div>
          <strong>${unlocked ? "Premium access active" : "Premium access locked"}</strong>
          <p>${unlocked ? "Your command terminal is fully open." : `Activate the USD ${MONTHLY_PLAN_USD} monthly plan or carry a valid PraeHire premium token to unlock the full command canvas.`}</p>
        </div>
        ${unlocked ? "" : `<button class="button primary" id="subscribe-button" type="button">Activate Premium</button>`}
      </div>
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
        <p>Farad Fleet AI collects your driver details one step at a time, then runs a real vehicle inspection gate.</p>
      </div>
      ${rejected ? `<div class="detail-card danger-soft"><strong>Vehicle inspection verification failed.</strong><p>${escapeHtml(verificationMessage)} To appeal your model year status or complete manual verification, please talk directly to <a href="https://mexty101.web.app" target="_blank" rel="noreferrer">Mexty</a>.</p></div>` : `<div class="detail-card"><strong>Verification status</strong><p>${escapeHtml(verificationState)} • ${escapeHtml(verificationMessage)}</p></div>`}
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
        <h3>Root Owner Infrastructure Rights</h3>
        <p>The authenticated account matches the Prae Technologies root owner profile and can oversee ecosystem-wide data state, premium tokens, and network governance.</p>
      </div>
    </section>
  `;
}

function renderFounderAndPolicies() {
  const page = landingPage();

  if (page === "founder") {
    return `
      <section class="page-shell" id="founder">
        <article class="panel-block page-panel">
          <div class="section-heading">
            <h2>About Founder</h2>
            <p>Jeremiah Adedurin, also known as Jerry, is the Chief Technology Officer and Founder of Prae Technologies.</p>
          </div>
          <p class="policy-text">
            Jerry is an elite full-stack developer and AI/ML systems architect committed to deploying absolute global automation solutions across hiring intelligence, mobility systems, and autonomous digital infrastructure.
          </p>
        </article>
      </section>
    `;
  }

  if (page === "policies") {
    return `
      <section class="page-shell" id="policies">
        <article class="panel-block page-panel">
          <div class="section-heading">
            <h2>Corporate Policies</h2>
            <p>Refund and privacy standards for Farad Fleet AI.</p>
          </div>
          <p class="policy-text"><strong>Refund Policy:</strong> Because Farad Fleet AI activates premium AI planning, vehicle vision assessments, and live orchestration workloads as soon as access is granted, refund requests pass through strict internal Prae Technologies review via support lines.</p>
          <p class="policy-text"><strong>Privacy Policy:</strong> Farad keeps user movement data, credentials, uploaded driver vehicle images, and trip history securely isolated inside protected private records and never sells them to third-party brokers.</p>
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
          <p class="eyebrow">Farad Fleet AI Control Center</p>
          <h2>Welcome, ${escapeHtml(state.account?.fullName || state.authUser?.displayName || state.authUser?.email || "Operator")}</h2>
          <p class="lead small">Autonomous trip intelligence, premium billing, driver marketplace, and exact USD settlement live in one control surface.</p>
        </div>
        <div class="top-actions">
          ${isAdminAccount() ? `<span class="badge">Root Admin</span>` : ""}
          <button class="button secondary" id="logout-button" type="button">Sign Out</button>
        </div>
      </div>
      ${renderAdminCard()}
      ${renderSubscriptionGate()}
      <div class="dashboard-grid">
        <div class="dashboard-main">
          ${renderTripWizard()}
          ${renderConversation()}
          ${renderMarketplace()}
          ${renderTripStatus()}
        </div>
        <aside class="dashboard-side">
          ${renderMapPanel()}
          <section class="panel-block">
            <div class="section-heading">
              <h3>Support Core</h3>
              <p>Need urgent operational assistance or verification review? Chat with our live support core: <a href="https://mexty101.web.app" target="_blank" rel="noreferrer">Mexty</a>.</p>
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
          ${isAdminAccount() ? `<span class="badge">Root Admin</span>` : ""}
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
  const nav = `
    <header class="topbar">
      <a class="brand" href="#home">
        <img src="/logo.png" alt="Farad logo">
        <div>
          <strong>Farad Fleet AI</strong>
          <span>Prae Technologies Autonomous Mobility Stack</span>
        </div>
      </a>
      <nav>
        <a href="#home">Home</a>
        <a href="#pricing">Global Pricing</a>
        <a href="#driver-portal">Driver Portal</a>
        <a href="#founder">About Founder</a>
        <a href="#policies">Corporate Policies</a>
      </nav>
    </header>
  `;

  const content = state.loading
    ? `<section class="panel-block"><div class="loading">Booting Farad Fleet AI...</div></section>`
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
      ${renderAlert()}
      ${content}
      <footer class="footer">
        <span>© Prae Technologies. All Rights Reserved.</span>
        <span>Need urgent operational assistance or verification review? Chat with our live support core: <a href="https://mexty101.web.app" target="_blank" rel="noreferrer">Mexty</a></span>
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
  }

  document.querySelector("#forgot-password")?.addEventListener("click", handleForgotPassword);
  document.querySelector("#google-auth-button")?.addEventListener("click", handleGoogleAuth);
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

  document.querySelectorAll(".select-driver").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDriverId = button.getAttribute("data-driver-id");
      render();
    });
  });

  document.querySelector("#create-trip-button")?.addEventListener("click", handleCreateTrip);
  document.querySelector("#subscribe-button")?.addEventListener("click", handleSubscriptionCheckout);
  document.querySelector("#refresh-trip")?.addEventListener("click", refreshCurrentTrip);
  document.querySelector("#pay-driver-button")?.addEventListener("click", handleTripPayment);

  document.querySelectorAll(".trip-status").forEach((button) => {
    button.addEventListener("click", async () => {
      await updateTripLifecycle(button.getAttribute("data-trip-id"), { status: button.getAttribute("data-status") });
      await loadTripsForCurrentUser();
      if (button.getAttribute("data-status") === "arrived") {
        setAlert("success", "Arrival confirmed. The rider can now settle the exact USD fare.");
      }
    });
  });
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
  const origin = await geocodePlace(state.tripDraft.pickup);
  const destination = await geocodePlace(state.tripDraft.destination);
  const estimatedKm = estimateDistanceKm(origin, destination);
  state.mapEmbedUrl = origin && destination ? computeMapUrl(origin, destination) : "";
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
      drivers: state.availableDrivers
    });

    state.conversation.push({
      role: "ai",
      content: result.text,
      source: result.source,
      time: new Date()
    });
  } catch (error) {
    state.conversation.push({
      role: "ai",
      content: `Mission Summary\nFarad Fleet AI could not complete the request.\n\nClarifying Questions\n- Please confirm your trip details and try again.\n\nRoute Logic\n- Existing intake data was preserved.\n\nDispatch Readiness\n- Marketplace data was not changed.\n\nFleet Note\n- ${error.message}`,
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

async function handleSubscriptionCheckout() {
  if (!state.authUser || !state.account) {
    return;
  }

  try {
    openSubscriptionCheckout({
      user: state.authUser
    });
  } catch (error) {
    setAlert("error", error.message);
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

    openTripSettlementCheckout({
      user: state.authUser,
      driver,
      amountUsd: state.currentTrip.quote?.totalUsd || 0,
      tripId: state.currentTrip.id
    });
  } catch (error) {
    setAlert("error", error.message || "Could not start driver payment.");
  } finally {
    state.busy.payment = false;
    render();
  }
}

function render() {
  renderApp();
}

subscribeToAuth(hydrateSession);
window.addEventListener("hashchange", render);

if (!firebaseReady) {
  state.loading = false;
  state.alert = {
    type: "error",
    message:
      "Farad is still connecting its private access systems. Refresh shortly and try again."
  };
}

{
  const params = new URLSearchParams(window.location.search);
  const paymentState = params.get("payment");
  const paymentType = params.get("type");
  const paymentTripId = params.get("tripId");

  if (paymentState === "success") {
    state.currentTripId = paymentTripId || state.currentTripId;
    state.alert = {
      type: "success",
      message:
        paymentType === "subscription"
          ? "Premium payment verified successfully. Your Prae Technologies access is opening."
          : "Trip payment verified successfully. The driver settlement is now recorded in USD."
    };
  } else if (paymentState === "failed") {
    state.alert = {
      type: "error",
      message: "Payment did not complete successfully. You can try again whenever you are ready."
    };
  }
}

render();
