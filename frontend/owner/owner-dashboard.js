import { apiGet, apiPost } from "../js/api.js";

/* ======================================================
   AUTH GUARD (🔥 CRITICAL FIX)
   ====================================================== */
const ownerRaw = localStorage.getItem("owner");

if (!ownerRaw) {
    // ❌ No owner session → force login
    window.location.replace("../index.html");
    throw new Error("Unauthorized access to dashboard");
}

const owner = JSON.parse(ownerRaw);

/* ======================================================
   ELEMENTS
   ====================================================== */
const newRequestBtn = document.getElementById("newRequestBtn");
const resumeRequestBtn = document.getElementById("resumeRequestBtn");
const historyBtn = document.getElementById("historyBtn");
const logoutBtn = document.getElementById("logoutBtn");
const logo = document.getElementById("logo");

/* ======================================================
   INITIAL UI STATE
   ====================================================== */
newRequestBtn.style.display = "none";
resumeRequestBtn.style.display = "none";

/* ======================================================
   DASHBOARD STATE RESOLUTION
   ====================================================== */
async function resolveDashboardState() {
    try {
        const res = await apiGet(`/owner/profile?phone=${owner.phone}`);

        const activeRequestId = res.active_request_id;

        if (activeRequestId) {
            // 🔁 Ongoing request
            localStorage.setItem("activeRequestId", activeRequestId);
            resumeRequestBtn.style.display = "inline-block";
            newRequestBtn.style.display = "none";
        } else {
            // 🆕 No active request
            localStorage.removeItem("activeRequestId");
            newRequestBtn.style.display = "inline-block";
            resumeRequestBtn.style.display = "none";
        }

    } catch (err) {
        console.error("Dashboard sync failed:", err);

        // ⚠️ Backend error ≠ logout
        newRequestBtn.style.display = "inline-block";
        resumeRequestBtn.style.display = "none";
    }
}

/* ======================================================
   NAVIGATION
   ====================================================== */
if (newRequestBtn) {
    newRequestBtn.onclick = () => {
        window.location.href = "./request-mechanic.html";
    };
}

if (resumeRequestBtn) {
    resumeRequestBtn.onclick = () => {
        window.location.href = "./request-status.html";
    };
}

if (historyBtn) {
    historyBtn.onclick = () => {
        window.location.href = "./owner-history.html";
    };
}

if (logo) {
    logo.onclick = () => {
        window.location.href = "./owner-dashboard.html";
    };
}

if (logoutBtn) {
    logoutBtn.onclick = async () => {
        try {
            await apiPost("/owner/logout", { phone: owner.phone });
        } catch {}

        localStorage.removeItem("owner");
        localStorage.removeItem("activeRequestId");
        localStorage.removeItem("completedRequestId");

        window.location.replace("../index.html");
    };
}

/* ======================================================
   START
   ====================================================== */
resolveDashboardState();
