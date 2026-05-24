async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}.`);
  }

  return data;
}

function getSimulatorResponse(prompt, tripDraft, driverCount) {
  const missing = [];
  if (!tripDraft.country) missing.push("country");
  if (!tripDraft.pickup) missing.push("pickup location");
  if (!tripDraft.destination) missing.push("destination");
  if (!tripDraft.arrivalTime) missing.push("arrival time");
  if (!tripDraft.vehiclePreference) missing.push("vehicle preference");

  const followUp =
    missing.length > 0
      ? `Before I dispatch your mission, I still need your ${missing.slice(0, 2).join(" and ")}.`
      : `I have enough routing detail to shortlist ${driverCount} verified driver option(s) and prepare the settlement flow after arrival.`;

  return [
    "Mission Summary",
    `Farad Fleet AI received: "${prompt}" and is coordinating a safer, fuel-aware trip plan.`,
    "",
    "Clarifying Questions",
    `- ${followUp}`,
    "- Do you have fragile cargo or passengers needing an SUV or truck instead of a standard car?",
    "",
    "Route Logic",
    "- Prioritize low-friction corridors and reduce idle time around dense market clusters.",
    "- Keep one fallback path ready in case of congestion spikes or vehicle reassignment.",
    "",
    "Dispatch Readiness",
    missing.length > 0
      ? "- Marketplace matching will unlock automatically as soon as the required trip details are complete."
      : "- Marketplace driver bids are ready to compare below.",
    "",
    "Fleet Note",
    "- Payment to drivers is locked to USD and opens only after trip arrival is confirmed."
  ].join("\n");
}

export async function runFleetConversation({ prompt, history, tripDraft, drivers }) {
  try {
    const result = await postJson("/api/ai/command", {
      prompt,
      history,
      tripDraft,
      drivers
    });

    return {
      text: result.text || getSimulatorResponse(prompt, tripDraft, drivers.length),
      source: result.source || "gemini"
    };
  } catch {
    return {
      text: getSimulatorResponse(prompt, tripDraft, drivers.length),
      source: "simulator"
    };
  }
}

export async function auditVehicleImage({ fileBase64, mimeType, claimedVehicleType }) {
  return postJson("/api/ai/vehicle-audit", {
    fileBase64,
    mimeType,
    claimedVehicleType
  });
}

export async function geocodePlace(place) {
  if (!place) {
    return null;
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", place);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  return {
    lat: Number(data[0].lat),
    lng: Number(data[0].lon),
    label: data[0].display_name
  };
}
