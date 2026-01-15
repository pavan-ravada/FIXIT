import { apiGet, apiPost } from "../js/api.js";

/* ================= SESSION ================= */
const mechanicRaw = localStorage.getItem("mechanic");
if (!mechanicRaw) {
  window.location.href = "./mechanic-login.html";
}
const mechanic = JSON.parse(mechanicRaw);

// 🔧 DEMO MODE (false in real GPS)
const DEMO_MODE = false;

/* ================= ELEMENTS (SAFE) ================= */
const availabilityBtn = document.getElementById("availabilityBtn");
const activeJobBtn = document.getElementById("activeJobBtn");
const requestsList = document.getElementById("requestsList");
const message = document.getElementById("message");

const availabilitySection = document.querySelector(".availability");
const nearbyTitle = document.querySelector("h3"); // "Nearby Requests"

/* ================= STATE ================= */
let pollInterval = null;
let syncInterval = null;
let isOnline = false;

/* ================= NAVBAR ================= */
document.getElementById("logo")?.addEventListener("click", () => {
  window.location.href = "./mechanic-dashboard.html";
});

document.getElementById("configureBtn")?.addEventListener("click", () => {
  window.location.href = "./mechanic-config.html";
});

document.getElementById("historyBtn")?.addEventListener("click", () => {
  window.location.href = "./mechanic-history.html";
});

document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  try {
    await apiPost("/mechanic/logout", { phone: mechanic.phone });
  } catch {}

  stopPolling();
  clearInterval(syncInterval);
  localStorage.clear();
  window.location.href = "../index.html";
});

/* =====================================================
   🔥 DATABASE = SINGLE SOURCE OF TRUTH
   ===================================================== */
async function syncMechanicStateFromDB() {
  try {
    const res = await apiGet(`/mechanic/profile?phone=${mechanic.phone}`);

    /* ===== ACTIVE JOB GUARD ===== */
    if (res.active_request_id) {
    localStorage.setItem("activeRequestId", res.active_request_id);

    availabilityBtn.style.display = "none";

    document.querySelector(".availability").style.display = "none";

    document.querySelector(".active-job-wrapper").style.display = "flex";

    activeJobBtn.onclick = () => {
      window.location.href = "./mechanic-active-job.html";
    };

    stopPolling();
    return;
  }

    /* ===== NO ACTIVE JOB ===== */
    localStorage.removeItem("activeRequestId");

    activeJobBtn.style.display = "none";

    availabilitySection.style.display = "flex";
    availabilityBtn.style.display = "block";
    requestsList.style.display = "block";
    nearbyTitle.style.display = "block";

    isOnline = res.is_available === true;

    availabilityBtn.textContent = isOnline ? "Go Offline" : "Go Online";
    availabilityBtn.classList.toggle("online", isOnline);

    if (isOnline) {
      startPolling();
    } else {
      stopPolling();
      requestsList.innerHTML = "<p>No nearby requests</p>";
    }

  } catch (err) {
    console.error("DB sync failed:", err);
  }
}

/* ================= GPS ================= */
function getCurrentLocation() {
  return new Promise((resolve, reject) => {

    if (DEMO_MODE === true) {
      return resolve({ lat: 12.9716, lng: 77.5946 });
    }

    if (!navigator.geolocation) {
      alert("Geolocation not supported");
      return reject();
    }

    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      }),
      err => {
        alert("Enable GPS / Location permission");
        reject(err);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

/* ================= TOGGLE AVAILABILITY ================= */
availabilityBtn?.addEventListener("click", async () => {
  message.textContent = "";

  try {
    availabilityBtn.disabled = true;

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

    await syncMechanicStateFromDB();

  } catch (err) {
    message.textContent = err.message || "Failed to update availability";
  } finally {
    availabilityBtn.disabled = false;
  }
});

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
      const card = document.createElement("div");
      card.className = "request-card";

      card.innerHTML = `
        <p><strong>Vehicle:</strong> ${req.vehicle_type}</p>
        <p><strong>Service:</strong> ${req.service_type}</p>
        <p><strong>Distance:</strong> ${req.distance_km} km</p>
        <button class="accept-btn">Accept</button>
      `;

      card.querySelector(".accept-btn").onclick =
        () => acceptRequest(req.request_id);

      requestsList.appendChild(card);
    });

  } catch (err) {
    console.error("Fetch requests failed:", err);
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

/* 🔁 Background DB sync every 8s */
syncInterval = setInterval(syncMechanicStateFromDB, 8000);