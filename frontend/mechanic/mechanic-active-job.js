import { apiGet, apiPost } from "../js/api.js";

/* ================= CONFIG ================= */
const MIN_MOVE_METERS = 5;
const ROUTE_RECALC_METERS = 60;

const DEMO_MODE = false;

const MOCK_MECH_LOCATION = {
  lat: 12.9716,   // Bengaluru
  lng: 77.5946
};

/* ================= SESSION ================= */
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
const openGoogleMapsBtn = document.getElementById("openGoogleMapsBtn");
const historyBtn = document.getElementById("historyBtn");
const logoutBtn = document.getElementById("logoutBtn");

/* ================= MAP STATE ================= */
let map = null;
let ownerMarker = null;
let mechanicMarker = null;
let directionsService = null;
let directionsRenderer = null;

let ownerLoc = null;
let mechLoc = null;
let lastSentLoc = null;

let mapInitStarted = false;
let trackingStarted = false;
let routeDrawn = false;

/* ================= OPEN IN GOOGLE MAPS ================= */
openGoogleMapsBtn?.addEventListener("click", () => {
  if (!ownerLoc || !mechLoc) return;

  window.location.href =
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${mechLoc.lat},${mechLoc.lng}` +
    `&destination=${ownerLoc.lat},${ownerLoc.lng}` +
    `&travelmode=driving`;
});

/* ================= MAP INIT ================= */
function initMap(ownerLat, ownerLng, mechLat, mechLng) {
  if (!window.google || map) return;

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
    title: "Owner",
    icon: "https://maps.google.com/mapfiles/ms/icons/red-dot.png"
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
  routeDrawn = true;
}

/* ================= ROUTE ================= */
function drawRoute(mlat, mlng, olat, olng) {
  if (!directionsService || !directionsRenderer) return;

  directionsService.route(
    {
      origin: { lat: mlat, lng: mlng },
      destination: { lat: olat, lng: olng },
      travelMode: "DRIVING"
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
  if (!map || !mechanicMarker) return;
  mechanicMarker.setPosition({ lat, lng });
  map.panTo({ lat, lng });
}

/* ================= FETCH JOB ================= */
async function fetchJob() {
  const data = await apiGet(
    `/mechanic/request/${requestId}?phone=${mechanic.phone}`
  );

  /* 🔴 JOB FINISHED STATES */
  if (data.status === "COMPLETED") {
    localStorage.removeItem("activeRequestId");
    localStorage.removeItem("activeOtp");
    window.location.replace("./mechanic-dashboard.html");
    return;
  }

  if (data.status === "CANCELLED" || data.status === "TIMEOUT") {
    localStorage.removeItem("activeRequestId");
    localStorage.removeItem("activeOtp");
    alert("Job ended");
    window.location.replace("./mechanic-dashboard.html");
    return;
  }

  statusText.innerText = data.status;

  if (data.owner) {
    ownerInfo.innerText =
      `Owner: ${data.owner.name} (${data.owner.phone})`;
  }

  if (data.status === "ACCEPTED" && !data.otp_verified) {
    otpBox.style.display = "block";
    otpValue.innerText = data.otp;
  } else {
    otpBox.style.display = "none";
  }

  ownerLoc = data.ownerLocation || ownerLoc;

  /* ✅ MAP INIT USING BROWSER GPS (NOT FIRESTORE) */
  if (ownerLoc && !mapInitStarted) {
    mapInitStarted = true;

    if (DEMO_MODE) {
      // 🧪 DEMO LOCATION (NO GPS)
      mechLoc = { ...MOCK_MECH_LOCATION };

      initMap(
        ownerLoc.lat,
        ownerLoc.lng,
        mechLoc.lat,
        mechLoc.lng
      );

      // Send initial demo location to backend
      sendMechanicLocation(mechLoc.lat, mechLoc.lng);

    } else {
      // 📍 REAL GPS MODE
      navigator.geolocation.getCurrentPosition(
        pos => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;

          mechLoc = { lat, lng };

          initMap(
            ownerLoc.lat,
            ownerLoc.lng,
            lat,
            lng
          );
        },
        err => {
          console.error("GPS error", err);
          alert("Enable GPS to continue");
        },
        { enableHighAccuracy: true }
      );
    }
  }

  /* 🔁 UPDATE FROM FIRESTORE IF AVAILABLE */
  if (data.mechanicLocation && map) {
    mechLoc = data.mechanicLocation;
    updateMechanicMarker(
      mechLoc.lat,
      mechLoc.lng
    );
  }
}

/* ================= LIVE GPS ================= */
function sendMechanicLocation(lat, lng) {
  return apiPost("/mechanic/update-location", {
    request_id: requestId,
    phone: mechanic.phone,
    lat,
    lng
  });
}

function startLiveTracking() {
  if (trackingStarted) return;
  trackingStarted = true;

  if (DEMO_MODE) {
    // 🔁 Simulate movement every 3 seconds
    setInterval(() => {
      mechLoc.lat += 0.00005;
      mechLoc.lng += 0.00005;

      sendMechanicLocation(mechLoc.lat, mechLoc.lng);
      updateMechanicMarker(mechLoc.lat, mechLoc.lng);

      if (routeDrawn && ownerLoc) {
        drawRoute(mechLoc.lat, mechLoc.lng, ownerLoc.lat, ownerLoc.lng);
      }
    }, 3000);

    return;
  }

  // 🔴 REAL GPS MODE
  navigator.geolocation.watchPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      sendMechanicLocation(lat, lng);
      updateMechanicMarker(lat, lng);

      if (routeDrawn && ownerLoc) {
        drawRoute(lat, lng, ownerLoc.lat, ownerLoc.lng);
      }
    },
    () => alert("Enable GPS"),
    { enableHighAccuracy: true }
  );
}

/* ================= INIT ================= */
fetchJob();
setInterval(fetchJob, 5000);

const wait = setInterval(() => {
  if (map && ownerMarker) {
    startLiveTracking();
    clearInterval(wait);
  }
}, 500);

/* ================= NAVBAR ================= */
historyBtn?.addEventListener("click", () => {
  window.location.href = "./mechanic-history.html";
});

logoutBtn?.addEventListener("click", () => {
  alert("Finish or cancel the active job before logging out.");
});