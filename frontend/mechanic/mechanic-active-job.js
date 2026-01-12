import { apiGet, apiPost } from "../js/api.js";

/* ================= CONFIG ================= */
const DEMO_MODE = false; // 🔥 true for demo, false for real GPS

const DEMO_MECH_LAT = 12.9716;
const DEMO_MECH_LNG = 77.5946;

/* ================= GOOGLE MAPS READY ================= */
let googleMapsReady = false;
window.onGoogleMapsReady = function () {
  console.log("🟢 Google Maps READY");
  googleMapsReady = true;
};

/* ================= SESSION GUARD ================= */
const mechanic = JSON.parse(localStorage.getItem("mechanic"));
const requestId = localStorage.getItem("activeRequestId");

if (!mechanic || !requestId) {
  window.location.replace("./mechanic-dashboard.html");
}

/* ================= ELEMENTS ================= */
const statusText = document.getElementById("statusText");
const ownerInfo = document.getElementById("ownerInfo");
const otpBox = document.getElementById("otpBox");
const otpValue = document.getElementById("otpValue");
const message = document.getElementById("message");

/* ================= NAVBAR ================= */
document.getElementById("logo")?.addEventListener("click", () => {
  window.location.href = "./mechanic-dashboard.html";
});
document.getElementById("historyBtn")?.addEventListener("click", () => {
  window.location.href = "./mechanic-history.html";
});
document.getElementById("logoutBtn")?.addEventListener("click", () => {
  alert("You cannot logout during an active job");
});

/* ================= MAP STATE ================= */
let map = null;
let ownerMarker = null;
let mechanicMarker = null;
let directionsService = null;
let directionsRenderer = null;

/* ======= HARD GUARDS (CRITICAL) ======= */
let mapInitStarted = false;
let trackingStarted = false;
let mapRetryCount = 0;
const MAX_MAP_RETRIES = 20;

/* ================= MAP INIT ================= */
function initMap(ownerLat, ownerLng, mechLat, mechLng) {
  if (!googleMapsReady) {
    if (mapRetryCount >= MAX_MAP_RETRIES) {
      console.error("❌ Google Maps failed to load");
      return;
    }
    mapRetryCount++;
    setTimeout(() => initMap(ownerLat, ownerLng, mechLat, mechLng), 300);
    return;
  }

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
    title: "Owner",
  });

  mechanicMarker = new google.maps.Marker({
    position: { lat: mechLat, lng: mechLng },
    map,
    icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
    title: "You",
  });

  drawRoute(mechLat, mechLng, ownerLat, ownerLng);
}

/* ================= ROUTE ================= */
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

      document.getElementById("routeDistance").innerText =
        `Distance: ${leg.distance.text}`;
      document.getElementById("routeDuration").innerText =
        `ETA: ${leg.duration.text}`;
    }
  );
}

/* ================= MARKER UPDATE ================= */
let lastLat = null;
let lastLng = null;

function updateMechanicMarker(lat, lng) {
  if (!mechanicMarker) return;

  if (lastLat !== null && lastLng !== null && google.maps.geometry) {
    const heading = google.maps.geometry.spherical.computeHeading(
      { lat: lastLat, lng: lastLng },
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

  mechanicMarker.setPosition({ lat, lng });
  lastLat = lat;
  lastLng = lng;
}

/* ================= FETCH JOB ================= */
async function fetchJob() {
  try {
    const data = await apiGet(
      `/mechanic/request/${requestId}?phone=${mechanic.phone}`
    );

    statusText.innerText = data.status;

    if (data.owner) {
      ownerInfo.innerText =
        `Owner: ${data.owner.name} (${data.owner.phone})`;
    }

    if (data.otp && !data.otp_verified) {
      otpBox.style.display = "block";
      otpValue.innerText = data.otp;
    } else {
      otpBox.style.display = "none";
    }

    if (data.ownerLocation && !mapInitStarted) {
      mapInitStarted = true;

      if (DEMO_MODE) {
        initMap(
          data.ownerLocation.lat,
          data.ownerLocation.lng,
          DEMO_MECH_LAT,
          DEMO_MECH_LNG
        );
      } else {
        navigator.geolocation.getCurrentPosition(
          pos => {
            initMap(
              data.ownerLocation.lat,
              data.ownerLocation.lng,
              pos.coords.latitude,
              pos.coords.longitude
            );
          },
          () => {
            initMap(
              data.ownerLocation.lat,
              data.ownerLocation.lng,
              data.ownerLocation.lat,
              data.ownerLocation.lng
            );
          }
        );
      }
    }

    if (data.mechanicLocation && map) {
      updateMechanicMarker(
        data.mechanicLocation.lat,
        data.mechanicLocation.lng
      );
      drawRoute(
        data.mechanicLocation.lat,
        data.mechanicLocation.lng,
        data.ownerLocation.lat,
        data.ownerLocation.lng
      );
    }

    if (data.status === "IN_PROGRESS") {
      message.innerText = "OTP verified. Proceed with service.";
    }

    if (["CANCELLED", "COMPLETED", "TIMEOUT"].includes(data.status)) {
      cleanupAndExit(data.status === "COMPLETED");
    }

  } catch (err) {
    console.error("Fetch job failed", err);
  }
}

/* ================= LIVE TRACKING ================= */
function sendMechanicLocation(lat, lng) {
  return apiPost("/mechanic/update-location", {
    request_id: requestId,
    mechanic_phone: mechanic.phone,
    lat,
    lng,
  });
}

function startLiveTracking() {
  if (trackingStarted) return;
  trackingStarted = true;

  if (DEMO_MODE) {
    let lat = DEMO_MECH_LAT;
    let lng = DEMO_MECH_LNG;

    setInterval(async () => {
      if (!ownerMarker) return;

      const o = ownerMarker.getPosition();
      lat += (o.lat() - lat) * 0.0003;
      lng += (o.lng() - lng) * 0.0003;

      await sendMechanicLocation(lat, lng);
      updateMechanicMarker(lat, lng);
    }, 3000);

    return;
  }

  if (!navigator.geolocation) {
    alert("GPS not supported");
    return;
  }

  navigator.geolocation.watchPosition(
    async pos => {
      await sendMechanicLocation(
        pos.coords.latitude,
        pos.coords.longitude
      );
      updateMechanicMarker(
        pos.coords.latitude,
        pos.coords.longitude
      );
    },
    () => alert("Enable GPS / Location permission"),
    { enableHighAccuracy: true }
  );
}

/* ================= CLEANUP ================= */
function cleanupAndExit(toHistory = false) {
  localStorage.removeItem("activeRequestId");
  localStorage.removeItem("activeOtp");
  window.location.replace(
    toHistory ? "./mechanic-history.html" : "./mechanic-dashboard.html"
  );
}

/* ================= INIT ================= */
fetchJob();
setInterval(fetchJob, 5000);

const waitForMap = setInterval(() => {
  if (map && ownerMarker) {
    startLiveTracking();
    clearInterval(waitForMap);
  }
}, 500);