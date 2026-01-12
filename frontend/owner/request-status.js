import { apiGet, apiPost } from "../js/api.js";

/* ================= STATE ================= */
let map = null;
let ownerMarker = null;
let mechanicMarker = null;
let directionsService = null;
let directionsRenderer = null;

let lastMechLat = null;
let lastMechLng = null;

let statusInterval = null;
let isNavigatingAway = false;

/* ================= GOOGLE MAP SAFE LOADER ================= */
function waitForGoogleMaps(cb) {
  if (window.google && google.maps) cb();
  else setTimeout(() => waitForGoogleMaps(cb), 200);
}

/* ================= MAP INIT ================= */
function initMap(ownerLat, ownerLng) {
  waitForGoogleMaps(() => {
    if (map) return;

    map = new google.maps.Map(document.getElementById("map"), {
      center: { lat: ownerLat, lng: ownerLng },
      zoom: 14,
    });

    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
    });

    ownerMarker = new google.maps.Marker({
      position: { lat: ownerLat, lng: ownerLng },
      map,
      title: "Your Location",
    });
  });
}

/* ================= MECHANIC MARKER ================= */
function updateMechanicMarker(lat, lng) {
  if (!map) return;

  if (!mechanicMarker) {
    mechanicMarker = new google.maps.Marker({
      position: { lat, lng },
      map,
      icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
      title: "Mechanic",
    });

    lastMechLat = lat;
    lastMechLng = lng;
    return;
  }

  smoothMoveMarker(mechanicMarker, lat, lng);

  lastMechLat = lat;
  lastMechLng = lng;
}

/* ================= SMOOTH MOVEMENT ================= */
function smoothMoveMarker(marker, newLat, newLng, duration = 1000) {
  const start = marker.getPosition();
  const startLat = start.lat();
  const startLng = start.lng();
  const startTime = performance.now();

  function animate(now) {
    const progress = Math.min((now - startTime) / duration, 1);

    const lat = startLat + (newLat - startLat) * progress;
    const lng = startLng + (newLng - startLng) * progress;

    marker.setPosition({ lat, lng });

    if (progress < 1) requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

/* ================= ROUTE + ETA ================= */
function drawRoute(mechLat, mechLng, ownerLat, ownerLng) {
  if (!directionsService || !directionsRenderer) return;

  directionsService.route(
    {
      origin: { lat: mechLat, lng: mechLng },
      destination: { lat: ownerLat, lng: ownerLng },
      travelMode: google.maps.TravelMode.DRIVING,
    },
    (result, status) => {
      if (status !== "OK" || !result.routes.length) return;

      directionsRenderer.setDirections(result);

      const leg = result.routes[0].legs[0];

      document.getElementById("etaText").innerText =
        `⏱ ETA: ${leg.duration.text}`;

      document.getElementById("distanceText").innerText =
        `📏 Remaining: ${leg.distance.text}`;
    }
  );
}

/* ================= RADIUS TIMER ================= */
function updateRadiusUI(radiusKm, timeoutAt, createdAt) {
  const radiusEl = document.getElementById("radiusText");
  const timerEl = document.getElementById("timerText");
  if (!radiusEl || !timerEl) return;

  const createdMs = new Date(createdAt).getTime();
  const timeoutMs = new Date(timeoutAt).getTime();

  if (window.radiusInterval) clearInterval(window.radiusInterval);

  window.radiusInterval = setInterval(() => {
    const now = Date.now();

    const elapsed = Math.max(0, Math.floor((now - createdMs) / 1000));
    const remaining = Math.max(0, Math.floor((timeoutMs - now) / 1000));

    const min = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const sec = String(elapsed % 60).padStart(2, "0");

    const steps = [3, 5, 8, 12];
    const nextRadius = steps[steps.indexOf(radiusKm) + 1] ?? "—";

    radiusEl.innerText = `🔍 Searching within ${radiusKm} km`;
    timerEl.innerText =
      `⏱ Elapsed: ${min}:${sec} | ➡️ Next: ${nextRadius} km in ${remaining}s`;
  }, 1000);
}

/* ================= MAIN ================= */
document.addEventListener("DOMContentLoaded", () => {
  const ownerRaw = localStorage.getItem("owner");
  const requestId = localStorage.getItem("activeRequestId");

  if (!ownerRaw || !requestId) return;
  const owner = JSON.parse(ownerRaw);

  async function fetchStatus() {
    if (isNavigatingAway) return;

    try {
      const data = await apiGet(`/owner/request/${requestId}`);

      document.getElementById("statusText").innerText = data.status;

      if (data.ownerLocation) {
        initMap(data.ownerLocation.lat, data.ownerLocation.lng);
      }

      if (data.mechanic) {
        document.getElementById("mechanicInfo").innerText =
          `Mechanic: ${data.mechanic.name} (${data.mechanic.phone})`;
      }

      if (data.mechanicLocation && data.ownerLocation) {
        const lat = data.mechanicLocation.lat;
        const lng = data.mechanicLocation.lng;

        updateMechanicMarker(lat, lng);

        if (
          lastMechLat === null ||
          Math.abs(lat - lastMechLat) > 0.00001 ||
          Math.abs(lng - lastMechLng) > 0.00001
        ) {
          drawRoute(
            lat,
            lng,
            data.ownerLocation.lat,
            data.ownerLocation.lng
          );
        }
      }

      const radiusBox = document.querySelector(".radius-box");
      if (radiusBox) {
        radiusBox.style.display =
          data.status === "SEARCHING" ? "block" : "none";
      }

      if (data.status === "SEARCHING") {
        updateRadiusUI(
          data.search_radius_km,
          data.timeout_at,
          data.created_at
        );
      } else if (window.radiusInterval) {
        clearInterval(window.radiusInterval);
      }

      const otpSection = document.getElementById("otpSection");
      const cancelBtn = document.getElementById("cancelBtn");
      const completeBtn = document.getElementById("completeBtn");

      otpSection.style.display = "none";
      cancelBtn.style.display = "none";
      completeBtn.style.display = "none";

      if (data.status === "SEARCHING") cancelBtn.style.display = "block";
      if (data.status === "ACCEPTED") {
        otpSection.style.display = "block";
        cancelBtn.style.display = "block";
      }
      if (data.status === "IN_PROGRESS") completeBtn.style.display = "block";

    } catch (err) {
      console.error("Status fetch failed:", err);
    }
  }

  document.getElementById("verifyOtpBtn")?.addEventListener("click", async () => {
    const otp = document.getElementById("otpInput").value.trim();
    if (!otp) return alert("Enter OTP");

    await apiPost(`/owner/verify-otp/${requestId}`, {
      phone: owner.phone,
      otp,
    });

    fetchStatus();
  });

  document.getElementById("cancelBtn")?.addEventListener("click", async () => {
    isNavigatingAway = true;
    clearInterval(statusInterval);

    await apiPost(`/owner/request/cancel/${requestId}`, {
      phone: owner.phone,
    });

    localStorage.removeItem("activeRequestId");
    window.location.replace("./owner-dashboard.html");
  });

  document.getElementById("completeBtn")?.addEventListener("click", async () => {
    isNavigatingAway = true;
    clearInterval(statusInterval);

    await apiPost(`/owner/complete/${requestId}`, {
      owner_phone: owner.phone,
    });

    localStorage.removeItem("activeRequestId");
    localStorage.setItem("completedRequestId", requestId);
    window.location.href = "rating.html";
  });

  fetchStatus();
  statusInterval = setInterval(fetchStatus, 5000);
});