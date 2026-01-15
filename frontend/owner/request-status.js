import { apiGet, apiPost } from "../js/api.js";

/* ================= MAP STATE ================= */
let map = null;
let ownerMarker = null;
let mechanicMarker = null;
let directionsService = null;
let directionsRenderer = null;

let lastMechLat = null;
let lastMechLng = null;

let statusInterval = null;
let isNavigatingAway = false;

let routeDrawn = false;
let boundsFitted = false;

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

/* ================= SMOOTH + ROTATED MECHANIC ================= */
function updateMechanicMarker(lat, lng) {
  if (!map) return;

  if (!mechanicMarker) {
    mechanicMarker = new google.maps.Marker({
      position: { lat, lng },
      map,
      icon: {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 5,
        fillColor: "#1A73E8",
        fillOpacity: 1,
        strokeWeight: 2,
      },
      title: "Mechanic",
    });

    lastMechLat = lat;
    lastMechLng = lng;
    return;
  }

  if (google.maps.geometry && lastMechLat !== null) {
    const heading = google.maps.geometry.spherical.computeHeading(
      { lat: lastMechLat, lng: lastMechLng },
      { lat, lng }
    );

    mechanicMarker.setIcon({
      path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
      scale: 5,
      rotation: heading,
      fillColor: "#1A73E8",
      fillOpacity: 1,
      strokeWeight: 2,
    });
  }

  smoothMoveMarker(mechanicMarker, lat, lng);

  // ✅ ADD THIS LINE (VERY IMPORTANT)
  if (!boundsFitted && ownerMarker && mechanicMarker) {
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(ownerMarker.getPosition());
    bounds.extend(mechanicMarker.getPosition());
    map.fitBounds(bounds);
    boundsFitted = true;
  }

  lastMechLat = lat;
  lastMechLng = lng;
}

/* ================= SMOOTH MOVE ================= */
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

/* ================= RADIUS TIMER (SEARCHING ONLY) ================= */
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
  /* ================= NAVBAR ================= */
  const logo = document.getElementById("logo");
  const profileIcon = document.getElementById("profileIcon");
  const profileMenu = document.getElementById("profileMenu");
  const historyBtn = document.getElementById("historyBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  logo?.addEventListener("click", () => {
    // ✅ CORRECT OWNER DASHBOARD
    window.location.href = "./owner-dashboard.html";
  });

  profileIcon?.addEventListener("click", (e) => {
    e.stopPropagation();
    profileMenu.classList.toggle("active");
  });

  document.addEventListener("click", () => {
    profileMenu.classList.remove("active");
  });

  historyBtn?.addEventListener("click", () => {
    window.location.href = "./owner-history.html";
  });

  logoutBtn?.addEventListener("click", () => {
    // ✅ CLEAR OWNER SESSION
    localStorage.removeItem("owner");
    localStorage.removeItem("activeRequestId");
    localStorage.removeItem("completedRequestId");

    window.location.href = "./owner-login.html";
  });
  const ownerRaw = localStorage.getItem("owner");
  const requestId = localStorage.getItem("activeRequestId");
  if (!ownerRaw || !requestId) return;

  const owner = JSON.parse(ownerRaw);

  async function fetchStatus() {
    if (isNavigatingAway) return;

    try {
      const data = await apiGet(`/owner/request/${requestId}`);
      document.getElementById("statusText").innerText = data.status;

      if (data.ownerLocation && !map) {
        initMap(data.ownerLocation.lat, data.ownerLocation.lng);
      }

      if (data.mechanic) {
        document.getElementById("mechanicInfo").innerText =
          `Mechanic: ${data.mechanic.name} (${data.mechanic.phone})`;
      }

      /* ---------- SEARCHING RADIUS ---------- */
      const radiusBox = document.querySelector(".radius-box");

      if (data.status === "SEARCHING") {
        if (radiusBox) radiusBox.style.display = "block";

        updateRadiusUI(
          data.search_radius_km,
          data.timeout_at,
          data.created_at
        );
      } else {
        if (radiusBox) radiusBox.style.display = "none";
        if (window.radiusInterval) clearInterval(window.radiusInterval);
      }

      /* ---------- MECHANIC MOVEMENT ---------- */
      if (data.mechanicLocation && data.ownerLocation) {
        const { lat, lng } = data.mechanicLocation;

        updateMechanicMarker(lat, lng);

        // ✅ DRAW ROUTE ONLY ONCE
        if (!routeDrawn) {
          drawRoute(
            lat,
            lng,
            data.ownerLocation.lat,
            data.ownerLocation.lng
          );
          routeDrawn = true;
        }
      }
      console.log("Mechanic:", data.mechanicLocation);

      /* ---------- BUTTONS ---------- */
      document.getElementById("cancelBtn").style.display =
        data.status === "SEARCHING" || data.status === "ACCEPTED"
          ? "block"
          : "none";

      document.getElementById("completeBtn").style.display =
        data.status === "IN_PROGRESS" ? "block" : "none";

      document.getElementById("otpSection").style.display =
        data.status === "ACCEPTED" ? "block" : "none";

    } catch (err) {
      console.error("Status fetch failed:", err);
    }
  }

  /* ================= OTP ================= */
  document.getElementById("verifyOtpBtn")?.addEventListener("click", async () => {
    const otp = document.getElementById("otpInput").value.trim();
    const messageEl = document.getElementById("message");

    messageEl.textContent = "";
    messageEl.style.background = "none";
    messageEl.style.color = "";

    if (!otp) {
      messageEl.textContent = "Please enter OTP";
      messageEl.style.background = "rgba(239,68,68,0.15)";
      messageEl.style.color = "#fca5a5";
      return;
    }

    try {
      await apiPost(`/owner/verify-otp/${requestId}`, {
        phone: owner.phone,
        otp,
      });

      messageEl.textContent = "OTP verified successfully";
      messageEl.style.background = "rgba(34,197,94,0.2)";
      messageEl.style.color = "#4ade80";

      fetchStatus();

    } catch (err) {
      // 🔥 THIS IS THE IMPORTANT PART
      messageEl.textContent = err.message || "Invalid OTP";
      messageEl.style.background = "rgba(239,68,68,0.15)";
      messageEl.style.color = "#fca5a5";
    }
  });

  /* ================= CANCEL ================= */
  document.getElementById("cancelBtn")?.addEventListener("click", async () => {
    isNavigatingAway = true;
    clearInterval(statusInterval);

    await apiPost(`/owner/request/cancel/${requestId}`, {
      phone: owner.phone,
    });

    localStorage.removeItem("activeRequestId");
    window.location.replace("./owner-dashboard.html");
  });

  /* ================= COMPLETE ================= */
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
  statusInterval = setInterval(fetchStatus, 3000);
});