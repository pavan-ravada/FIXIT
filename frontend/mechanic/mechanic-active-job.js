import { apiGet, apiPost } from "../js/api.js";

/* ================= CONFIG ================= */
const MIN_MOVE_METERS = 8;

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

const MIN_ROTATION_DELTA = 4; // degrees (sweet spot)

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

const HEADING_SMOOTH_FACTOR = 0.10; // lower = smoother
const ROTATION_ANIMATION_MS = 60;


let map = null;
let ownerMarker = null;
let mechanicMarker = null;
let directionsService = null;
let directionsRenderer = null;

let ownerLoc = null;
let mechLoc = null;
let trackingStarted = false;
let routeDrawn = false;

let trackingInterval = null;
let geoWatchId = null;

let lastHeading = null;
let lastMechLoc = null;

let previousHeading = null;

let routePath = null; // ⭐ holds road polyline

let cameraHeading = 0;
let navigationCameraStarted = false;

/* ================= NEW STATE ================= */
let navigationHeading = null; // ✅ single source of truth
let lastRouteHeading = null;

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

function shouldUpdateHeading(prev, next, threshold = 3) {
  if (prev === null) return true;
  return Math.abs(next - prev) > threshold;
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
    zoom: 18,
    heading: 0,
    tilt: 45,                 // 🔥 Google Maps camera tilt
    disableDefaultUI: true,
    gestureHandling: "greedy"
  });

  /* ================= DIRECTIONS ================= */
  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map: map,
    suppressMarkers: true,
    preserveViewport: true,
    polylineOptions: {
      strokeColor: "#4285F4",
      strokeOpacity: 1.0,
      strokeWeight: 6
    }
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
    position: map.getCenter(), // 🔥 LOCK TO CENTER
    map,
    title: "You",
    icon: {
      path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
      scale: 6,
      rotation: 0,
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
  }, 300);
}

function smoothHeading(prev, next, factor = HEADING_SMOOTH_FACTOR) {
  if (prev === null) return next;

  let delta = next - prev;

  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;

  return (prev + delta * factor + 360) % 360;
}


function getRouteHeading(routePath, currentLatLng) {
  if (!routePath || routePath.length < 2) return null;

  for (let i = 0; i < routePath.length - 1; i++) {
    const p1 = routePath[i];
    const p2 = routePath[i + 1];

    const dist = google.maps.geometry.spherical.computeDistanceBetween(
      currentLatLng,
      p1
    );

    if (dist < 25) { // look ahead ~25m
      return google.maps.geometry.spherical.computeHeading(p1, p2);
    }
  }
  return null;
}

/* ================= ROUTE ================= */
function drawRoute(mlat, mlng, olat, olng) {
  if (!directionsService || !directionsRenderer) return;

  // 🔥 HARD RESET OLD ROUTE (REMOVES STALE / BLACK ROUTES)
  directionsRenderer.setDirections({ routes: [] });

  directionsService.route(
    {
      origin: { lat: mlat, lng: mlng },
      destination: { lat: olat, lng: olng },
      travelMode: "DRIVING",
      provideRouteAlternatives: false
    },
    (res, status) => {
      if (status !== "OK") return;

      // ✅ DRAW NEW ROUTE
      directionsRenderer.setDirections(res);
      routePath = res.routes[0].overview_path;

      const leg = res.routes[0].legs[0];

      document.getElementById("routeDistance").innerText =
        `Distance: ${leg.distance.text}`;

      document.getElementById("routeDuration").innerText =
        `ETA: ${leg.duration.text}`;

      // ✅ ENABLE OPEN IN GOOGLE MAPS BUTTON
      openGoogleMapsBtn.classList.remove("disabled");
      openGoogleMapsBtn.style.pointerEvents = "auto";
      openGoogleMapsBtn.style.opacity = "1";
    }
  );
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
        sendMechanicLocation(mechLoc.lat, mechLoc.lng);
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
}

function distanceMeters(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
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

function updateMarkerRotation(heading) {
  if (!mechanicMarker || heading === null) return;

  const icon = mechanicMarker.getIcon();
  icon.rotation = heading;

  mechanicMarker.setIcon(icon);
}

function startLiveTracking() {
  if (trackingStarted) return;
  trackingStarted = true;

  if (DEMO_MODE) {
    // 🔁 Simulate movement every 3 seconds
    trackingInterval = setInterval(() => {
      const newLoc = {
        lat: mechLoc.lat + 0.00005,
        lng: mechLoc.lng + 0.00005
      };

      mechLoc = newLoc;
      sendMechanicLocation(newLoc.lat, newLoc.lng);

      map.moveCamera({
        center: new google.maps.LatLng(newLoc.lat, newLoc.lng),
        heading: navigationHeading ?? map.getHeading(),
        zoom: 18,
        tilt: 45
      });

      lastMechLoc = newLoc;
    }, 3000);

    return;
  }

  // 🔴 REAL GPS MODE
  geoWatchId = navigator.geolocation.watchPosition(
    pos => {
      /* ================= LOCATION ================= */
      const newLoc = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };

      const speed = pos.coords.speed ?? 0;

      // 🔥 SEND LOCATION TO BACKEND
      sendMechanicLocation(newLoc.lat, newLoc.lng);

      /* ================= HEADING ================= */
      let rawHeading = null;

      // ✅ 1️⃣ DEVICE COMPASS (FASTEST & MOST RESPONSIVE)
      if (
        pos.coords.heading !== null &&
        !isNaN(pos.coords.heading) &&
        speed > 1.5
      ) {
        rawHeading = pos.coords.heading;
      }

      // ✅ 2️⃣ MOVEMENT-BASED FALLBACK
      else if (lastMechLoc && speed > 1.5) {
        const from = new google.maps.LatLng(
          lastMechLoc.lat,
          lastMechLoc.lng
        );
        const to = new google.maps.LatLng(
          newLoc.lat,
          newLoc.lng
        );

        rawHeading =
          google.maps.geometry.spherical.computeHeading(from, to);
      }

      // ✅ 3️⃣ ROAD-SNAPPED HEADING (GOOGLE MAPS STYLE)
      const routeHeading = getRouteHeading(
        routePath,
        new google.maps.LatLng(newLoc.lat, newLoc.lng)
      );

      // ✅ Route heading ONLY stabilizes when compass is unstable
      if (
        rawHeading === null ||
        speed < 1.5 ||
        routeHeading !== null && Math.abs(routeHeading - rawHeading) > 45
      ) {
        if (routeHeading !== null) {
          rawHeading = routeHeading;
        }
      }

      /* ================= SMOOTHING ================= */
      if (rawHeading !== null) {
        if (navigationHeading === null) {
          navigationHeading = rawHeading;
        } else {
          const delta = Math.abs(rawHeading - navigationHeading);
          if (delta > MIN_ROTATION_DELTA) {
            navigationHeading = smoothHeading(
              navigationHeading,
              rawHeading,
              0.18
            );
          }
        }
      }

      /* ================= MARKER ================= */
      updateMarkerRotation(navigationHeading);

      /* ================= CAMERA (GOOGLE MAPS STYLE) ================= */
      map.moveCamera({
        center: new google.maps.LatLng(newLoc.lat, newLoc.lng),
        heading: navigationHeading ?? map.getHeading(),
        zoom: 18,
        tilt: 45
      });

      /* ================= ROUTE ================= */
      if (
        routeDrawn &&
        ownerLoc &&
        (!mechLoc || distanceMeters(mechLoc, newLoc) > MIN_MOVE_METERS)
      ) {
        drawRoute(
          newLoc.lat,
          newLoc.lng,
          ownerLoc.lat,
          ownerLoc.lng
        );
      }

      lastMechLoc = newLoc;
      mechLoc = newLoc;
    },
    () => alert("Enable GPS"),
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    }
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

    if (!navigationCameraStarted) {
      navigationCameraStarted = true;
    }

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