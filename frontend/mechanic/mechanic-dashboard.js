import { apiGet, apiPost } from "../js/api.js";

/* ================= SESSION ================= */
const mechanic = JSON.parse(localStorage.getItem("mechanic"));
// 🔧 CHANGE THIS ONLY WHEN DEMOING WITHOUT GPS
const DEMO_MODE = false;

if (!mechanic) {
    window.location.href = "./mechanic-login.html";
}

/* ================= ELEMENTS ================= */
const availabilityBtn = document.getElementById("availabilityBtn");
const activeJobBtn = document.getElementById("activeJobBtn");
const requestsList = document.getElementById("requestsList");
const message = document.getElementById("message");

let isOnline = false;
let pollInterval = null;

/* ================= NAVBAR ================= */
document.getElementById("logo").onclick = () => {
    window.location.href = "./mechanic-dashboard.html";
};

document.getElementById("configureBtn").onclick = () => {
    window.location.href = "./mechanic-config.html";
};

document.getElementById("historyBtn").onclick = () => {
    window.location.href = "./mechanic-history.html";
};

document.getElementById("logoutBtn").onclick = async () => {
    try {
        await apiPost("/mechanic/logout", { phone: mechanic.phone });
    } catch {}

    localStorage.clear();
    window.location.href = "../index.html";
};

/* =====================================================
   🔥 BACKEND → FRONTEND STATE SYNC (CORE FIX)
   ===================================================== */
async function syncActiveJobFromBackend() {
    try {
        const res = await apiGet(`/mechanic/profile?phone=${mechanic.phone}`);

        if (res.active_request_id) {
            localStorage.setItem("activeRequestId", res.active_request_id);
            return res.active_request_id;
        } else {
            localStorage.removeItem("activeRequestId");
            return null;
        }
    } catch (err) {
        console.error("Failed to sync mechanic state", err);
        return null;
    }
}

/* ================= INIT DASHBOARD ================= */
async function initDashboard() {
    const activeRequestId = await syncActiveJobFromBackend();

    // 🔒 MECHANIC HAS ACTIVE JOB
    if (activeRequestId) {
        availabilityBtn.style.display = "none";
        requestsList.style.display = "none";

        activeJobBtn.style.display = "block";
        activeJobBtn.onclick = () => {
            window.location.href = "./mechanic-active-job.html";
        };

        stopPolling();
        return;
    }

    // 🟢 NO ACTIVE JOB
    availabilityBtn.style.display = "block";
    activeJobBtn.style.display = "none";
}

initDashboard();

/* ================= GPS (SAFE FALLBACK) ================= */
function getCurrentLocation() {
    return new Promise((resolve, reject) => {

        // 🔧 DEMO MODE ONLY
        if (DEMO_MODE === true) {
            return resolve({ lat: 17.3850, lng: 78.4867 });
        }

        if (!navigator.geolocation) {
            alert("Geolocation not supported");
            return reject();
        }

        navigator.geolocation.getCurrentPosition(
            pos => {
                resolve({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                });
            },
            err => {
                alert("Unable to get location. Enable GPS / Location permission.");
                reject(err);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });
}


/* ================= TOGGLE AVAILABILITY ================= */
availabilityBtn.onclick = async () => {
    message.textContent = "";

    try {
        if (!isOnline) {
            const loc = await getCurrentLocation();

            await apiPost("/mechanic/availability", {
                phone: mechanic.phone,
                is_available: true,
                lat: loc.lat,
                lng: loc.lng
            });

            isOnline = true;
            availabilityBtn.textContent = "Go Offline";
            startPolling();

        } else {
            await apiPost("/mechanic/availability", {
                phone: mechanic.phone,
                is_available: false
            });

            isOnline = false;
            availabilityBtn.textContent = "Go Online";
            stopPolling();
            requestsList.innerHTML = "<p>No nearby requests</p>";
        }
    } catch (err) {
        message.textContent = err.message || "Failed to update availability";
    }
};

/* ================= FETCH REQUESTS ================= */
async function fetchRequests() {
    if (!isOnline) return;

    try {
        const res = await apiGet(`/mechanic/requests?phone=${mechanic.phone}`);
        const requests = res.requests;

        requestsList.innerHTML = "";

        if (!requests.length) {
            requestsList.innerHTML = "<p>No nearby requests</p>";
            return;
        }

        requests.forEach(req => {
            const div = document.createElement("div");
            div.className = "request-card";

            div.innerHTML = `
                <p><strong>Vehicle:</strong> ${req.vehicle_type}</p>
                <p><strong>Service:</strong> ${req.service_type}</p>
                <p><strong>Distance:</strong> ${req.distance_km} km</p>
                <button>Accept</button>
            `;

            div.querySelector("button").onclick =
                () => acceptRequest(req.request_id);

            requestsList.appendChild(div);
        });

    } catch (err) {
        console.error("Fetch requests failed:", err.message);
    }
}

/* ================= ACCEPT REQUEST ================= */
async function acceptRequest(requestId) {
    try {
        const res = await apiPost(`/mechanic/accept/${requestId}`, {
            phone: mechanic.phone
        });

        localStorage.setItem("activeRequestId", requestId);
        localStorage.setItem("activeOtp", res.otp);

        stopPolling();
        window.location.href = "./mechanic-active-job.html";

    } catch (err) {
        alert(err.message || "Failed to accept request");
    }
}

/* ================= POLLING ================= */
function startPolling() {
    fetchRequests();
    pollInterval = setInterval(fetchRequests, 5000);
}

function stopPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}
