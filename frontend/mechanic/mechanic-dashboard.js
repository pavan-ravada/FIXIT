import { apiGet, apiPost } from "../js/api.js";

/* ================= SESSION ================= */
const mechanicRaw = localStorage.getItem("mechanic");
if (!mechanicRaw) {
  window.location.href = "./mechanic-login.html";
}
const mechanic = JSON.parse(mechanicRaw);

// 🔧 DEMO ONLY (set false in real GPS)
const DEMO_MODE = false;

/* ================= ELEMENTS ================= */
const availabilityBtn = document.getElementById("availabilityBtn");
const activeJobBtn = document.getElementById("activeJobBtn");
const requestsList = document.getElementById("requestsList");
const message = document.getElementById("message");

let pollInterval = null;
let isOnline = false;

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
   🔥 SINGLE SOURCE OF TRUTH → DATABASE
   ===================================================== */
async function syncMechanicStateFromDB() {
  try {
    const res = await apiGet(`/mechanic/profile?phone=${mechanic.phone}`);

    // 🔒 ACTIVE JOB
    if (res.active_request_id) {
      localStorage.setItem("activeRequestId", res.active_request_id);

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
    localStorage.removeItem("activeRequestId");
    activeJobBtn.style.display = "none";
    availabilityBtn.style.display = "block";
    requestsList.style.display = "block";

    // ✅ SYNC AVAILABILITY FROM DB
    isOnline = res.is_available === true;

    availabilityBtn.textContent = isOnline ? "Go Offline" : "Go Online";

    if (isOnline) {
      startPolling();
    } else {
      stopPolling();
      requestsList.innerHTML = "<p>No nearby requests</p>";
    }

  } catch (err) {
    console.error("Failed to sync mechanic state", err);
  }
}

/* ================= GPS ================= */
function getCurrentLocation() {
  return new Promise((resolve, reject) => {

    if (DEMO_MODE === true) {
      return resolve({ lat: 12.9716, lng: 77.5946});
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
        alert("Enable GPS / Location permission");
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

    } else {
      await apiPost("/mechanic/availability", {
        phone: mechanic.phone,
        is_available: false
      });
    }

    // 🔁 RE-SYNC FROM DB (IMPORTANT)
    await syncMechanicStateFromDB();

  } catch (err) {
    message.textContent = err.message || "Failed to update availability";
  }
};

/* ================= FETCH REQUESTS ================= */
async function fetchRequests() {
  if (!isOnline) return;

  try {
    const res = await apiGet(`/mechanic/requests?phone=${mechanic.phone}`);
    const requests = res.requests || [];

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
  stopPolling();
  fetchRequests();
  pollInterval = setInterval(fetchRequests, 5000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

/* ================= INIT ================= */
syncMechanicStateFromDB();
