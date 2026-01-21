import { apiGet, apiPost } from "../js/api.js";

/* ================= CONFIG ================= */
const MIN_MOVE_METERS = 5;
const ROUTE_RECALC_METERS = 60;

const DEMO_MODE = true;

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

// 🔒 Disable Open in Google Maps initially (MOBILE SAFE)
openGoogleMapsBtn.classList.add("disabled");
openGoogleMapsBtn.style.pointerEvents = "none";
openGoogleMapsBtn.style.opacity = "0.5";

openGoogleMapsBtn.addEventListener("click", () => {
  if (!mechLoc || !ownerLoc) {
    alert("Route not ready yet");
    return;
  }

  const origin = `${mechLoc.lat},${mechLoc.lng}`;
  const destination = `${ownerLoc.lat},${ownerLoc.lng}`;

  const webUrl =
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${origin}` +
    `&destination=${destination}` +
    `&travelmode=driving`;

  const appUrl = `google.navigation:q=${destination}&mode=d`;

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isMobile) {
    // ✅ MUST use same tab for app launch
    window.location.href = appUrl;

    // Fallback if app not installed
    setTimeout(() => {
      window.location.href = webUrl;
    }, 1200);
  } else {
    // ✅ Desktop → new tab works
    window.open(webUrl, "_blank", "noopener,noreferrer");
  }
});

/* ================= MAP STATE ================= */
let map = null;
let ownerMarker = null;
let mechanicMarker = null;
let directionsService = null;
let directionsRenderer = null;

let ownerLoc = null;
let mechLoc = null;
let lastSentLoc = null;
let trackingStarted = false;
let routeDrawn = false;

let googleMapsReady = false;

let trackingInterval = null;
let geoWatchId = null;

let lastMechLocForHeading = null;
let routePath = [];

function stopLiveTracking() {
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }

  if (geoWatchId !== null) {
    navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null;
  }
}

function tryInitMap() {
  if (
    map ||                // already created
    !ownerLoc ||           // owner location not ready
    !mechLoc ||            // mechanic location not ready
    !window.google ||
    !google.maps ||
    typeof google.maps.Map !== "function"
  ) {
    return;
  }

  initMap(
    ownerLoc.lat,
    ownerLoc.lng,
    mechLoc.lat,
    mechLoc.lng
  );
}

/* ================= MAP INIT ================= */
function initMap(ownerLat, ownerLng, mechLat, mechLng) {
  /* ================= HARD SAFETY CHECKS ================= */
  if (
    typeof window.google === "undefined" ||
    typeof google.maps === "undefined" ||
    typeof google.maps.Map !== "function"
  ) {
    console.warn("⏳ Google Maps not ready yet");
    return;
  }

  /* ================= PREVENT DOUBLE INIT ================= */
  if (map) return;

  const mapEl = document.getElementById("map");
  if (!mapEl) {
    console.error("❌ Map container not found");
    return;
  }

  /* ================= CREATE MAP ================= */
  map = new google.maps.Map(mapEl, {
    center: { lat: mechLat, lng: mechLng },
    zoom: 16,
    disableDefaultUI: true
  });

  /* ================= DIRECTIONS ================= */
  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map: map,
    suppressMarkers: true
  });

  /* ================= OWNER MARKER ================= */
  ownerMarker = new google.maps.Marker({
    position: { lat: ownerLat, lng: ownerLng },
    map: map,
    title: "Owner",
    icon: "https://maps.google.com/mapfiles/ms/icons/red-dot.png"
  });

  /* ================= MECHANIC MARKER ================= */
  mechanicMarker = new google.maps.Marker({
    position: { lat: mechLat, lng: mechLng },
    map: map,
    title: "You",
    icon: {
      path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
      scale: 6,
      fillColor: "#1A73E8",
      fillOpacity: 1,
      strokeWeight: 2
    }
  });

  /* ================= INITIAL ROUTE ================= */
  drawRoute(mechLat, mechLng, ownerLat, ownerLng);
  routeDrawn = true;

  /* ================= MOBILE / TAB FIX ================= */
  setTimeout(() => {
    if (!map || !mechanicMarker) return;

    google.maps.event.trigger(map, "resize");
    map.setCenter(mechanicMarker.getPosition());
  }, 300);
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
      routePath = res.routes[0].overview_path.map(p => ({
        lat: p.lat(),
        lng: p.lng()
      }));
      const leg = res.routes[0].legs[0];

      document.getElementById("routeDistance").innerText =
        `Distance: ${leg.distance.text}`;
      document.getElementById("routeDuration").innerText =
        `ETA: ${leg.duration.text}`;

      // 🔥🔥🔥 ONLY PLACE TO ENABLE BUTTON (MOBILE SAFE)
      openGoogleMapsBtn.classList.remove("disabled");
      openGoogleMapsBtn.style.pointerEvents = "auto";
      openGoogleMapsBtn.style.opacity = "1";
    }
  );
}

function computeBearing(from, to) {
  const φ1 = from.lat * Math.PI / 180;
  const φ2 = to.lat * Math.PI / 180;
  const Δλ = (to.lng - from.lng) * Math.PI / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}


/* ================= MARKER UPDATE ================= */
function updateMechanicMarker(lat, lng) {
  if (!map || !mechanicMarker) return;
  mechanicMarker.setPosition({ lat, lng });
  //map.panTo({ lat, lng });
}

function updateNavigation(lat, lng, gpsHeading = null) {
  if (!map || !mechanicMarker) return;

  let heading = gpsHeading;

  // 1️⃣ GPS heading (best)
  if (heading === null && lastMechLocForHeading) {
    heading = computeBearing(lastMechLocForHeading, { lat, lng });
  }

  // 2️⃣ Route fallback
  if (heading === null && routePath.length >= 2) {
    heading = computeBearing(routePath[0], routePath[1]);
  }

  if (heading === null) heading = 0;

  // 🔵 Rotate marker
  mechanicMarker.setIcon({
    ...mechanicMarker.getIcon(),
    rotation: heading
  });

  // 🔵 Rotate & center map
  map.moveCamera({
    center: { lat, lng },
    heading: heading,
    tilt: 60,
    zoom: 17
  });

  lastMechLocForHeading = { lat, lng };
}

/* ================= FETCH JOB ================= */
async function fetchJob() {
  const data = await apiGet(
    `/mechanic/request/${requestId}?phone=${mechanic.phone}`
  );

  /* 🔴 JOB FINISHED STATES */
  if (data.status === "COMPLETED") {
    stopLiveTracking();
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

  /* ================= MAP DATA SETUP ================= */

  // owner location from backend
  if (data.ownerLocation) {
    ownerLoc = data.ownerLocation;
  }

  // mechanic location
  if (DEMO_MODE && !mechLoc) {
    mechLoc = { ...MOCK_MECH_LOCATION };
    sendMechanicLocation(mechLoc.lat, mechLoc.lng);
  }

  if (!DEMO_MODE && !mechLoc) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        mechLoc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };
      },
      err => {
        console.error("GPS error", err);
        alert("Enable GPS to continue");
      },
      { enableHighAccuracy: true }
    );
  }

  // 🔁 SAFE RETRY (KEY LINE)
  tryInitMap();

  /* 🔁 UPDATE FROM FIRESTORE */
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
    trackingInterval = setInterval(() => {
      mechLoc.lat += 0.00005;
      mechLoc.lng += 0.00005;

      sendMechanicLocation(mechLoc.lat, mechLoc.lng);
      updateMechanicMarker(mechLoc.lat, mechLoc.lng);
      updateNavigation(mechLoc.lat, mechLoc.lng);

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
      updateNavigation(lat, lng, pos.coords.heading);

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

/* 🔁 SAFE MAP RETRY (FIXES REFRESH ISSUE) */
const mapRetry = setInterval(() => {
  if (map) {
    clearInterval(mapRetry);
    return;
  }
  tryInitMap();
}, 300);

/* ▶ START TRACKING ONLY AFTER MAP EXISTS */
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