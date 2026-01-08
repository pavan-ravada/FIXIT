import { apiGet, apiPost } from "../js/api.js";

let googleMapsReady = false;
const DEMO_MODE = true; // 🔥 set false on phone / real GPS

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


function drawRoute(fromLat, fromLng, toLat, toLng) {
    if (!directionsService || !directionsRenderer) return;

    directionsService.route(
        {
            origin: { lat: fromLat, lng: fromLng },
            destination: { lat: toLat, lng: toLng },
            travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
            if (status === "OK") {
                directionsRenderer.setDirections(result);
            }
        }
    );
}


function updateMechanicMarker(lat, lng) {
    if (mechanicMarker) {
        mechanicMarker.setPosition({ lat, lng });
    }
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
                        // fallback: center on owner
                        initMap(
                            data.ownerLocation.lat,
                            data.ownerLocation.lng,
                            data.ownerLocation.lat,
                            data.ownerLocation.lng
                        );
                    }
                );
            }

            if (data.mechanicLocation) {
                updateMechanicMarker(
                    data.mechanicLocation.lat,
                    data.mechanicLocation.lng
                );

                if (data.status === "ON_THE_WAY") {
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

function startLiveTracking() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
        pos => {
            demoLat = pos.coords.latitude;
            demoLng = pos.coords.longitude;
        },
        () => {
            // fallback (Hyderabad)
            demoLat = 17.3850;
            demoLng = 78.4867;
        }
    );

    locationInterval = setInterval(async () => {

        if (DEMO_MODE) {
            // 🔥 SIMULATE MOVEMENT
            demoLat += 0.0003;
            demoLng += 0.0003;

            await apiPost("/mechanic/update-location", {
                request_id: requestId,
                mechanic_phone: mechanic.phone,
                lat: demoLat,
                lng: demoLng
            });

        } else {
            // ✅ REAL GPS (PHONE)
            navigator.geolocation.getCurrentPosition(
                async pos => {
                    await apiPost("/mechanic/update-location", {
                        request_id: requestId,
                        mechanic_phone: mechanic.phone,
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude
                    });
                }
            );
        }

    }, 5000);
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


/* ================= INIT ================= */
fetchJob();
setInterval(fetchJob, 5000);
startLiveTracking();