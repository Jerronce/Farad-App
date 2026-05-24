import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const runtimeEnv = typeof window !== "undefined" && window.env ? window.env : {};

const readEnv = (key, fallback = "") => {
  if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  return runtimeEnv[key] || fallback;
};

export const ROOT_ADMIN_EMAILS = new Set([
  "jerronce101@gmail.com",
  "jerronc101@gmail.com"
]);

export const firebaseConfig = {
  apiKey: readEnv("VITE_FIREBASE_API_KEY", "AIzaSyD_sta6wEcwnynCwU-PoWCCywBQJdnV1VY"),
  authDomain: readEnv("VITE_FIREBASE_AUTH_DOMAIN", "farad-5bc61.firebaseapp.com"),
  projectId: readEnv("VITE_FIREBASE_PROJECT_ID", "farad-5bc61"),
  storageBucket: readEnv("VITE_FIREBASE_STORAGE_BUCKET", "farad-5bc61.firebasestorage.app"),
  messagingSenderId: readEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", "541862121948"),
  appId: readEnv("VITE_FIREBASE_APP_ID", "1:541862121948:web:5f67b6a8899696e714ff19"),
  measurementId: readEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-E2NCYPPT1M")
};

export const firebaseReady = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
);

export const firebaseApp = firebaseReady ? initializeApp(firebaseConfig) : null;
export const auth = firebaseReady ? getAuth(firebaseApp) : null;
export const db = firebaseReady ? getFirestore(firebaseApp) : null;
export const storage = firebaseReady ? getStorage(firebaseApp) : null;
const googleProvider = firebaseReady ? new GoogleAuthProvider() : null;

if (auth) {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
}

export async function signUpAccount({ role, fullName, email, phone, password }) {
  if (!auth || !db) {
    throw new Error("Firebase is not configured yet.");
  }

  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: fullName });

  const emailLower = email.trim().toLowerCase();
  const baseRecord = {
    uid: credential.user.uid,
    role,
    fullName,
    email,
    emailLower,
    phone,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isAdmin: ROOT_ADMIN_EMAILS.has(emailLower)
  };

  if (role === "driver") {
    await setDoc(doc(db, "drivers", credential.user.uid), {
      ...baseRecord,
      status: "pending_profile",
      verification: {
        state: "not_started",
        message: "Driver profile is waiting for vehicle onboarding."
      },
      pricing: {
        currency: "USD",
        baseFeeUsd: 0,
        perKmUsd: 0
      },
      contact: {
        phone,
        countryCode: "",
        country: ""
      }
    });
  } else {
    await setDoc(doc(db, "users", credential.user.uid), {
      ...baseRecord,
      subscription_status: "inactive",
      premium_access: {
        farad: false,
        praehire: false
      },
      root_admin: ROOT_ADMIN_EMAILS.has(emailLower)
    });
  }

  return credential.user;
}

export async function ensureAccountExistsBeforeLogin(role, email) {
  if (!db) {
    throw new Error("Firebase is not configured yet.");
  }

  const emailLower = email.trim().toLowerCase();
  const targetCollection = role === "driver" ? "drivers" : "users";
  const snapshot = await getDocs(query(collection(db, targetCollection), where("emailLower", "==", emailLower), limit(1)));

  if (snapshot.empty) {
    throw new Error("No verified account record was found for this email. Please complete sign-up first.");
  }

  return snapshot.docs[0].data();
}

async function findAccountRecordByRole(role, email) {
  if (!db) {
    throw new Error("Firebase is not configured yet.");
  }

  const emailLower = email.trim().toLowerCase();
  const targetCollection = role === "driver" ? "drivers" : "users";
  const snapshot = await getDocs(query(collection(db, targetCollection), where("emailLower", "==", emailLower), limit(1)));

  if (snapshot.empty) {
    return null;
  }

  return {
    id: snapshot.docs[0].id,
    ...snapshot.docs[0].data()
  };
}

async function createGoogleAccountRecord({ role, user }) {
  const email = user.email || "";
  const emailLower = email.trim().toLowerCase();
  const fullName = user.displayName || email.split("@")[0] || "Farad User";
  const phone = user.phoneNumber || "";
  const baseRecord = {
    uid: user.uid,
    role,
    fullName,
    email,
    emailLower,
    phone,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isAdmin: ROOT_ADMIN_EMAILS.has(emailLower),
    authProvider: "google"
  };

  if (role === "driver") {
    await setDoc(doc(db, "drivers", user.uid), {
      ...baseRecord,
      status: "pending_profile",
      verification: {
        state: "not_started",
        message: "Driver profile is waiting for vehicle onboarding."
      },
      pricing: {
        currency: "USD",
        baseFeeUsd: 0,
        perKmUsd: 0
      },
      contact: {
        phone,
        countryCode: "",
        country: ""
      }
    });
  } else {
    await setDoc(doc(db, "users", user.uid), {
      ...baseRecord,
      subscription_status: "inactive",
      premium_access: {
        farad: false,
        praehire: false
      },
      root_admin: ROOT_ADMIN_EMAILS.has(emailLower)
    });
  }
}

export async function signInAccount({ role, email, password }) {
  if (!auth) {
    throw new Error("Firebase is not configured yet.");
  }

  await ensureAccountExistsBeforeLogin(role, email);
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signInWithGoogleFlow({ role, intent }) {
  if (!auth || !db || !googleProvider) {
    throw new Error("Firebase is not configured yet.");
  }

  const credential = await signInWithPopup(auth, googleProvider);
  const user = credential.user;
  const email = user.email || "";

  if (!email) {
    await signOut(auth);
    throw new Error("Google account did not return a valid email.");
  }

  const existing = await findAccountRecordByRole(role, email);

  if (intent === "signup") {
    if (!existing) {
      await createGoogleAccountRecord({ role, user });
    }
    return user;
  }

  if (!existing) {
    await signOut(auth);
    throw new Error("No verified account record was found for this Google email in the selected portal. Please sign up first.");
  }

  return user;
}

export async function loadAccountRecord(uid) {
  if (!db) {
    return null;
  }

  const userDoc = await getDoc(doc(db, "users", uid));
  if (userDoc.exists()) {
    return { id: userDoc.id, ...userDoc.data() };
  }

  const driverDoc = await getDoc(doc(db, "drivers", uid));
  if (driverDoc.exists()) {
    return { id: driverDoc.id, ...driverDoc.data() };
  }

  return null;
}

export async function updateAccountRecord(collectionName, uid, payload) {
  if (!db) {
    throw new Error("Firebase is not configured yet.");
  }

  await updateDoc(doc(db, collectionName, uid), {
    ...payload,
    updatedAt: serverTimestamp()
  });
}

export async function createTripRecord(payload) {
  if (!db) {
    throw new Error("Firebase is not configured yet.");
  }

  const tripRef = await addDoc(collection(db, "trips"), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return tripRef.id;
}

export async function uploadVehicleImage(uid, file) {
  if (!storage) {
    throw new Error("Firebase Storage is not configured yet.");
  }

  const imageRef = ref(storage, `driver_vehicles/${uid}/${Date.now()}-${file.name}`);
  await uploadBytes(imageRef, file);
  return getDownloadURL(imageRef);
}

export async function requestPasswordReset(email) {
  if (!auth) {
    throw new Error("Firebase is not configured yet.");
  }

  await sendPasswordResetEmail(auth, email);
}

export function subscribeToAuth(callback) {
  if (!auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, callback);
}

export async function logout() {
  if (!auth) {
    return;
  }

  await signOut(auth);
}

export const firebaseHelpers = {
  collection,
  query,
  where,
  limit,
  getDocs,
  doc,
  updateDoc,
  getDoc,
  serverTimestamp,
  onSnapshot
};
