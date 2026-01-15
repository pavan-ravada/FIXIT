import { apiGet, apiPost } from "../js/api.js";

/* ================= CONFIG ================= */
const DEMO_MODE = false;

const DEMO_MECH_LAT = 12.9716;
const DEMO_MECH_LNG = 77.5946;

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
const openGoogleMapsBtn = document.getElementById("openGoogleMapsBtn");

/* ================= MAP STATE ================= */
let map = null;
let ownerMarker = null;
let mechanicMarker = null;
let directionsService = null;
let directionsRenderer = null;

let ownerLoc = null;
let mechLoc = null;

let lastLat = null;
let lastLng = null;

let mapInitStarted = false;
let trackingStarted = false;

/* ================= GOOGLE MAPS APP ================= */
openGoogleMapsBtn?.addEventListener("click", () => {
  if (!ownerLoc || !mechLoc) return;

  const url =
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${mechLoc.lat},${mechLoc.lng}` +
    `&destination=${ownerLoc.lat},${ownerLoc.lng}` +
    `&travelmode=driving`;

  window.open(url, "_blank");
});

/* ================= MAP INIT ================= */
function initMap(ownerLat, ownerLng, mechLat, mechLng) {
  if (!window.google || !google.maps) return;
  if (map) return;

  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: mechLat, lng: mechLng },
    zoom: 16,
    disableDefaultUI: true
  });

  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map,
    suppressMarkers: true
  });

  ownerMarker = new google.maps.Marker({
    position: { lat: ownerLat, lng: ownerLng },
    map,
    title: "Owner"
  });

  mechanicMarker = new google.maps.Marker({
    position: { lat: mechLat, lng: mechLng },
    map,
    title: "You",
    icon: {
      path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
      scale: 6,
      fillColor: "#1A73E8",
      fillOpacity: 1,
      strokeWeight: 2
    }
  });

  drawRoute(mechLat, mechLng, ownerLat, ownerLng);
}

/* ================= ROUTE ================= */
function drawRoute(mechLat, mechLng, ownerLat, ownerLng) {
  if (!directionsService) return;

  directionsService.route(
    {
      origin: { lat: mechLat, lng: mechLng },
      destination: { lat: ownerLat, lng: ownerLng },
      travelMode: google.maps.TravelMode.DRIVING
    },
    (res, status) => {
      if (status !== "OK") return;
      directionsRenderer.setDirections(res);

      const leg = res.routes[0].legs[0];
      document.getElementById("routeDistance").innerText =
        `Distance: ${leg.distance.text}`;
      document.getElementById("routeDuration").innerText =
        `ETA: ${leg.duration.text}`;
    }
  );
}

/* ================= MARKER UPDATE ================= */
function updateMechanicMarker(lat, lng) {
  if (!mechanicMarker || !map) return;

  if (lastLat !== null && lastLng !== null && google.maps.geometry) {
    const heading = google.maps.geometry.spherical.computeHeading(
      { lat: lastLat, lng: lastLng },
      { lat, lng }
    );

    mechanicMarker.setIcon({
      path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
      scale: 6,
      rotation: heading,
      fillColor: "#1A73E8",
      fillOpacity: 1,
      strokeWeight: 2
    });

    map.setHeading(heading);
  }

  mechanicMarker.setPosition({ lat, lng });
  map.panTo({ lat, lng });

  lastLat = lat;
  lastLng = lng;
}

/* ================= FETCH JOB (🔥 FIX HERE) ================= */
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

    if (data.status === "ACCEPTED" && data.otp && !data.otp_verified) {
      otpBox.style.display = "block";
      otpValue.innerText = data.otp;
    } else {
      otpBox.style.display = "none";
    }

    if (data.ownerLocation) ownerLoc = data.ownerLocation;
    if (data.mechanicLocation) mechLoc = data.mechanicLocation;

    if (ownerLoc && !mapInitStarted) {
      mapInitStarted = true;
      navigator.geolocation.getCurrentPosition(pos => {
        initMap(
          ownerLoc.lat,
          ownerLoc.lng,
          pos.coords.latitude,
          pos.coords.longitude
        );
      });
    }

    /* 🔥 THIS IS THE MISSING PART 🔥 */
    if (data.mechanicLocation && map) {
      updateMechanicMarker(
        data.mechanicLocation.lat,
        data.mechanicLocation.lng
      );

      if (ownerLoc) {
        drawRoute(
          data.mechanicLocation.lat,
          data.mechanicLocation.lng,
          ownerLoc.lat,
          ownerLoc.lng
        );
      }
    }

    if (["CANCELLED", "COMPLETED", "TIMEOUT"].includes(data.status)) {
      cleanupAndExit(data.status === "COMPLETED");
    }

  } catch (err) {
    console.error("Fetch job failed", err);
  }
}

/* ================= LIVE GPS ================= */
function sendMechanicLocation(lat, lng) {
  return apiPost("/mechanic/update-location", { lat, lng });
}

function startLiveTracking() {
  if (trackingStarted) return;
  trackingStarted = true;

  navigator.geolocation.watchPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      // 🔥 MOVE MARKER IMMEDIATELY
      updateMechanicMarker(lat, lng);

      // 🔄 send to backend (do NOT await)
      sendMechanicLocation(lat, lng);

      // optional route refresh
      if (ownerLoc) {
        drawRoute(lat, lng, ownerLoc.lat, ownerLoc.lng);
      }
    },
    err => {
      console.error("GPS error", err);
      alert("Enable GPS permission");
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 5000
    }
  );
}

/* ================= CLEANUP ================= */
function cleanupAndExit(toHistory) {
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