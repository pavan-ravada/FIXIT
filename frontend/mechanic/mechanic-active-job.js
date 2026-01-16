import { apiGet, apiPost } from "../js/api.js";

/* ================= CONFIG ================= */
const MIN_MOVE_METERS = 5;
const ROUTE_RECALC_METERS = 60;

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

/* ================= MAP STATE ================= */
let map, ownerMarker, mechanicMarker;
let directionsService, directionsRenderer;

let ownerLoc = null;
let mechLoc = null;
let lastSentLoc = null;

let mapInitStarted = false;
let trackingStarted = false;
let routeDrawn = false;

/* ================= GOOGLE MAPS ================= */
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
  mechanicMarker.setPosition({ lat, lng });
  map.panTo({ lat, lng });
}

/* ================= FETCH JOB ================= */
async function fetchJob() {
  const data = await apiGet(
    `/mechanic/request/${requestId}?phone=${mechanic.phone}`
  );

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
  mechLoc = data.mechanicLocation || mechLoc;

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

  if (data.mechanicLocation && map) {
    updateMechanicMarker(
      data.mechanicLocation.lat,
      data.mechanicLocation.lng
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

  navigator.geolocation.watchPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      // ✅ FIRST LOCATION ALWAYS SEND
      if (!lastSentLoc) {
        lastSentLoc = { lat, lng };
        mechLoc = lastSentLoc;
        sendMechanicLocation(lat, lng);
        updateMechanicMarker(lat, lng);
        return;
      }

      const dist = google.maps.geometry.spherical.computeDistanceBetween(
        new google.maps.LatLng(lastSentLoc.lat, lastSentLoc.lng),
        new google.maps.LatLng(lat, lng)
      );

      if (dist >= MIN_MOVE_METERS) {
        lastSentLoc = { lat, lng };
        mechLoc = lastSentLoc;

        sendMechanicLocation(lat, lng);
        updateMechanicMarker(lat, lng);

        if (routeDrawn && ownerLoc && dist > ROUTE_RECALC_METERS) {
          drawRoute(lat, lng, ownerLoc.lat, ownerLoc.lng);
        }
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