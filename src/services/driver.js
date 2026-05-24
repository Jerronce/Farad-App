import { db, firebaseHelpers, updateAccountRecord, createTripRecord, uploadVehicleImage } from "../config/firebase.js";
import { auditVehicleImage } from "./gemini.js";

const { collection, query, where, getDocs, limit, doc, getDoc } = firebaseHelpers;

export function calculateDriverQuote(driver, estimatedKm) {
  const base = Number(driver?.pricing?.baseFeeUsd || 0);
  const perKm = Number(driver?.pricing?.perKmUsd || 0);
  const total = Number((base + perKm * estimatedKm).toFixed(2));

  return {
    currency: "USD",
    baseFeeUsd: base,
    perKmUsd: perKm,
    estimatedKm,
    totalUsd: total
  };
}

export async function saveDriverOnboarding(uid, payload) {
  const imageUrl = payload.vehicleImageFile ? await uploadVehicleImage(uid, payload.vehicleImageFile) : payload.vehicleImageUrl || "";
  let verification = {
    state: "manual_review",
    message: "Vehicle image is missing. Complete manual review through Mexty.",
    approved: false,
    estimatedYear: null
  };

  if (payload.vehicleImageFile && payload.vehicleImageBase64) {
    const audit = await auditVehicleImage({
      fileBase64: payload.vehicleImageBase64,
      mimeType: payload.vehicleImageFile.type,
      claimedVehicleType: payload.vehicleType
    });

    verification = {
      state: audit.approved ? "verified" : "rejected",
      message: audit.summary,
      approved: audit.approved,
      estimatedYear: audit.year,
      reason: audit.reason
    };
  }

  await updateAccountRecord("drivers", uid, {
    fullName: payload.fullName,
    phone: payload.phone,
    contact: {
      phone: payload.phone,
      countryCode: payload.countryCode,
      country: payload.country
    },
    payout: {
      destinationCountry: payload.country,
      payoutMethod: payload.payoutMethod
    },
    vehicle: {
      type: payload.vehicleType,
      brandModel: payload.brandModel,
      modelYearClaimed: Number(payload.modelYear),
      imageUrl
    },
    pricing: {
      currency: "USD",
      baseFeeUsd: Number(payload.baseFeeUsd),
      perKmUsd: Number(payload.perKmUsd)
    },
    status: verification.approved ? "verified" : "locked",
    verification
  });

  return verification;
}

export async function fetchAvailableDrivers({ country, estimatedKm }) {
  if (!db) {
    return [];
  }

  const snapshot = await getDocs(query(collection(db, "drivers"), where("status", "==", "verified"), limit(20)));
  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((driver) => !country || driver?.contact?.country?.toLowerCase() === country.toLowerCase())
    .map((driver) => ({
      ...driver,
      quote: calculateDriverQuote(driver, estimatedKm)
    }))
    .sort((a, b) => a.quote.totalUsd - b.quote.totalUsd);
}

export async function createMarketplaceTrip({ rider, driver, tripDraft, quote, coordinates }) {
  const tripId = await createTripRecord({
    riderUid: rider.uid,
    riderEmail: rider.email,
    riderName: rider.displayName || rider.email,
    driverUid: driver.id,
    driverEmail: driver.email,
    driverName: driver.fullName,
    driverPhone: `${driver.contact?.countryCode || ""}${driver.contact?.phone || ""}`,
    country: tripDraft.country,
    pickup: tripDraft.pickup,
    destination: tripDraft.destination,
    extraStop: tripDraft.extraStop || "",
    arrivalTime: tripDraft.arrivalTime,
    vehiclePreference: tripDraft.vehiclePreference,
    cargoNotes: tripDraft.cargoNotes,
    paymentPreference: tripDraft.paymentPreference,
    coordinates,
    quote,
    currency: "USD",
    status: "awaiting_driver_response",
    paymentStatus: "pending_arrival",
    notifications: [
      {
        audience: "driver",
        message: `A rider is available for ${tripDraft.pickup} to ${tripDraft.destination}.`,
        createdAt: new Date().toISOString()
      }
    ]
  });

  return tripId;
}

export async function updateTripLifecycle(tripId, payload) {
  await updateAccountRecord("trips", tripId, payload);
}

export async function getTripRecord(tripId) {
  if (!db) {
    return null;
  }

  const snapshot = await getDoc(doc(db, "trips", tripId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}
