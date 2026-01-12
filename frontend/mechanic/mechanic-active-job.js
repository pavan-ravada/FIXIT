import { apiGet, apiPost } from "../js/api.js";

let googleMapsReady = false;
const DEMO_MODE = false; // 🔥 set false on phone / real GPS

const DEMO_MECH_LAT = 12.9716;   // Bangalore
const DEMO_MECH_LNG = 77.5946;

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

/* ================= MAP + ROUTE ================= */
let map = null;
let ownerMarker = null;
let mechanicMarker = null;
let directionsService = null;
let directionsRenderer = null;
let locationInterval = null;


function initMap(ownerLat, ownerLng, mechLat, mechLng) {
  if (!googleMapsReady) {
    console.warn("⏳ Maps not ready yet, retrying...");
    setTimeout(() => initMap(ownerLat, ownerLng, mechLat, mechLng), 300);
    return;
  }

  if (map) return;

  console.log("🟢 INITIALIZING MAP", ownerLat, ownerLng, mechLat, mechLng);

  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: ownerLat, lng: ownerLng },
    zoom: 14
  });

  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map,
    suppressMarkers: true
  });

  ownerMarker = new google.maps.Marker({
    position: { lat: ownerLat, lng: ownerLng },
    map,
    title: "Owner Location"
  });

  mechanicMarker = new google.maps.Marker({
    position: { lat: mechLat, lng: mechLng },
    map,
    icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
    title: "Your Location"
  });

  drawRoute(mechLat, mechLng, ownerLat, ownerLng);
}

function drawRoute(mechLat, mechLng, ownerLat, ownerLng) {
  if (!directionsService || !directionsRenderer) return;

  const routeRequest = () => {
    directionsService.route(
      {
        origin: { lat: mechLat, lng: mechLng },
        destination: { lat: ownerLat, lng: ownerLng },
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status !== "OK") {
          console.error("❌ Route error:", status);
          return;
        }

        directionsRenderer.setDirections(result);

        const leg = result.routes[0].legs[0];

        // 📏 Distance
        document.getElementById("routeDistance").innerText =
          `Distance: ${leg.distance.text}`;

        // ⏱ ETA
        document.getElementById("routeDuration").innerText =
          `ETA: ${leg.duration.text}`;

        // 🌍 Open in Google Maps
        document.getElementById("openGoogleMapsBtn").onclick = () => {
          const url =
            `https://www.google.com/maps/dir/?api=1` +
            `&origin=${mechLat},${mechLng}` +
            `&destination=${ownerLat},${ownerLng}` +
            `&travelmode=driving`;
          window.open(url, "_blank");
        };
      }
    );
  };

  // 🔁 INITIAL DRAW
  routeRequest();

  // 🔄 LIVE UPDATE EVERY 5 SECONDS
  if (window.liveRouteInterval) {
    clearInterval(window.liveRouteInterval);
  }

  window.liveRouteInterval = setInterval(() => {
    if (!mechanicMarker) return;

    const pos = mechanicMarker.getPosition();
    mechLat = pos.lat();
    mechLng = pos.lng();

    routeRequest();
  }, 5000);
}

let lastLat = null;
let lastLng = null;

function updateMechanicMarker(lat, lng) {
  if (!mechanicMarker) return;

  if (lastLat !== null && lastLng !== null) {
    rotateMarker(mechanicMarker, lastLat, lastLng, lat, lng);
  }

  smoothMoveMarker(mechanicMarker, lat, lng);

  lastLat = lat;
  lastLng = lng;
}


/* ================= FETCH ACTIVE JOB ================= */
async function fetchJob() {
    try {
        const data = await apiGet(
            `/mechanic/request/${requestId}?phone=${mechanic.phone}`
        );

        /* -------- STATUS -------- */
        statusText.innerText = data.status;

        /* -------- OWNER INFO -------- */
        if (data.owner) {
            ownerInfo.innerText =
                `Owner: ${data.owner.name} (${data.owner.phone})`;
        }

        /* -------- OTP -------- */
        if (data.otp && !data.otp_verified) {
            otpBox.style.display = "block";
            otpValue.innerText = data.otp;
        } else {
            otpBox.style.display = "none";
        }

        /* =================================================
           ✅ MAP + ROUTE (FIXED FIELD NAMES)
           ================================================= */
        if (data.ownerLocation) {

            if (!map) {
                if (DEMO_MODE === true) {
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


            if (data.mechanicLocation) {
                updateMechanicMarker(
                    data.mechanicLocation.lat,
                    data.mechanicLocation.lng
                );

                if (["ACCEPTED", "IN_PROGRESS"].includes(data.status)) {
                    drawRoute(
                        data.mechanicLocation.lat,
                        data.mechanicLocation.lng,
                        data.ownerLocation.lat,
                        data.ownerLocation.lng
                    );
                }
            }
        }

        /* -------- STATUS -------- */
        if (data.status === "IN_PROGRESS") {
            message.innerText = "OTP verified. Proceed with service.";
        }

        /* -------- TERMINAL STATES -------- */
        if (data.status === "CANCELLED") {
            if (data.cancelled_by === "OWNER") {
                alert("❌ Owner cancelled the request");
            } else {
                alert("❌ Request was cancelled");
            }
            cleanupAndExit();
            return;
        }

        if (data.status === "COMPLETED") {
            alert("✅ Job completed. Check your history for rating & feedback.");
            cleanupAndExit(true);   // 🔥 redirect to history
            return;
        }


        if (data.status === "TIMEOUT") {
            alert("⏰ Request timed out");
            cleanupAndExit();
            return;
        }


    } catch (err) {
        console.error("Failed to fetch active job:", err);
        message.innerText = "Unable to load active job";
    }
}

/* ================= LIVE LOCATION UPDATE ================= */
let demoLat = null;
let demoLng = null;

function sendMechanicLocation(lat, lng) {
    return apiPost("/mechanic/update-location", {
        request_id: requestId,
        mechanic_phone: mechanic.phone,
        lat,
        lng
    });
}

function startLiveTracking() {

  /* ================= DEMO MODE ================= */
  if (DEMO_MODE === true) {
    let mechLat = DEMO_MECH_LAT;
    let mechLng = DEMO_MECH_LNG;

    const STEP = 0.0003;

    locationInterval = setInterval(async () => {
      const ownerPos = ownerMarker?.getPosition();
      if (!ownerPos) return;

      const ownerLat = ownerPos.lat();
      const ownerLng = ownerPos.lng();

      mechLat += (ownerLat - mechLat) * STEP;
      mechLng += (ownerLng - mechLng) * STEP;

      await sendMechanicLocation(mechLat, mechLng);
      updateMechanicMarker(mechLat, mechLng);

    }, 3000);

    return;
  }

  /* ================= REAL GPS MODE ================= */
  if (!("geolocation" in navigator)) {
    alert("GPS not supported on this device");
    return;
  }

  navigator.geolocation.watchPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      console.log("📡 GPS:", lat, lng);

      await sendMechanicLocation(lat, lng);
      updateMechanicMarker(lat, lng);
    },
    (err) => {
      console.error("❌ GPS ERROR:", err);
      alert("Enable GPS / Location permission");
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000
    }
  );
}


/* ================= CLEANUP ================= */
function cleanupAndExit(redirectToHistory = false) {
    localStorage.removeItem("activeRequestId");
    localStorage.removeItem("activeOtp");

    if (locationInterval) clearInterval(locationInterval);

    if (redirectToHistory) {
        window.location.replace("./mechanic-history.html");
    } else {
        window.location.replace("./mechanic-dashboard.html");
    }
}


function smoothMoveMarker(marker, newLat, newLng, duration = 1000) {
  const startPos = marker.getPosition();
  const startLat = startPos.lat();
  const startLng = startPos.lng();

  const startTime = performance.now();

  function animate(now) {
    const progress = Math.min((now - startTime) / duration, 1);

    const lat = startLat + (newLat - startLat) * progress;
    const lng = startLng + (newLng - startLng) * progress;

    marker.setPosition({ lat, lng });

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }

  requestAnimationFrame(animate);
}

function rotateMarker(marker, fromLat, fromLng, toLat, toLng) {
  if (!google.maps.geometry) return;

  const heading = google.maps.geometry.spherical.computeHeading(
    { lat: fromLat, lng: fromLng },
    { lat: toLat, lng: toLng }
  );

  marker.setIcon({
    path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
    scale: 5,
    rotation: heading,
    fillColor: "#1A73E8",
    fillOpacity: 1,
    strokeWeight: 2,
  });
}



let trackingStarted = false;

fetchJob();
setInterval(fetchJob, 5000);

const waitForMap = setInterval(() => {
  if (map && ownerMarker && !trackingStarted) {
    trackingStarted = true;
    startLiveTracking();
    clearInterval(waitForMap);
  }
}, 500);