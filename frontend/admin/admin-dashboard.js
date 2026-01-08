import { apiGet, apiPost } from "../js/api.js";

/* ======================================================
   🔐 ADMIN SESSION GUARD (STRICT)
   ====================================================== */
const adminRaw = localStorage.getItem("admin");

if (!adminRaw) {
    window.location.replace("./admin-login.html");
    throw new Error("Admin session missing");
}

const admin = JSON.parse(adminRaw);

/* ======================================================
   ELEMENTS
   ====================================================== */
const logo = document.getElementById("logo");
const profileIcon = document.getElementById("profileIcon");
const profileMenu = document.getElementById("profileMenu");

const pendingBtn = document.getElementById("pendingMechanicsBtn");
const requestsBtn = document.getElementById("allRequestsBtn");
const logoutBtn = document.getElementById("logoutBtn");

const adminContent = document.getElementById("adminContent");

const totalEl = document.getElementById("totalRequests");
const activeEl = document.getElementById("activeRequests");
const completedEl = document.getElementById("completedRequests");
const cancelledEl = document.getElementById("cancelledRequests");

/* ======================================================
   NAVBAR
   ====================================================== */
logo.onclick = () => {
    window.location.href = "./admin-dashboard.html";
};

profileIcon.onclick = () => {
    profileMenu.classList.toggle("show");
};

document.addEventListener("click", (e) => {
    if (!profileIcon.contains(e.target) && !profileMenu.contains(e.target)) {
        profileMenu.classList.remove("show");
    }
});

logoutBtn.onclick = async () => {
    try {
        await apiPost("/admin/logout", { phone: admin.phone });
    } catch {}

    localStorage.removeItem("admin");
    window.location.replace("../index.html");
};

/* ======================================================
   LOAD DASHBOARD STATS
   ====================================================== */
async function loadStats() {
    try {
        const res = await apiGet("/admin/requests");

        const requests = res.requests || [];

        totalEl.innerText = requests.length;

        activeEl.innerText = requests.filter(r =>
            ["SEARCHING", "ACCEPTED", "IN_PROGRESS"].includes(r.status)
        ).length;

        completedEl.innerText = requests.filter(
            r => r.status === "COMPLETED"
        ).length;

        cancelledEl.innerText = requests.filter(
            r => r.status === "CANCELLED"
        ).length;

    } catch (err) {
        console.error("Failed to load admin stats:", err);
    }
}

/* ======================================================
   VIEW PENDING MECHANICS
   ====================================================== */
pendingBtn.onclick = async () => {
    adminContent.innerHTML = "<p>Loading pending mechanics...</p>";

    try {
        const res = await apiGet("/admin/mechanics/pending");

        const list = res.pending_mechanics;

        if (!list || list.length === 0) {
            adminContent.innerHTML = "<p>No pending mechanics.</p>";
            return;
        }

        adminContent.innerHTML = "";

        list.forEach(m => {
            const div = document.createElement("div");
            div.className = "history-card";

            div.innerHTML = `
                <p><strong>Name:</strong> ${m.name || "N/A"}</p>
                <p><strong>Phone:</strong> ${m.phone}</p>
                <button data-phone="${m.phone}" class="verifyBtn">Verify</button>
                <button data-phone="${m.phone}" class="rejectBtn">Reject</button>
                <hr/>
            `;

            adminContent.appendChild(div);
        });

        bindMechanicActions();

    } catch (err) {
        console.error(err);
        adminContent.innerHTML = "<p>Failed to load pending mechanics.</p>";
    }
};

/* ======================================================
   VIEW ALL REQUESTS
   ====================================================== */
requestsBtn.onclick = async () => {
    adminContent.innerHTML = "<p>Loading requests...</p>";

    try {
        const res = await apiGet("/admin/requests");
        const list = res.requests;

        if (!list || list.length === 0) {
            adminContent.innerHTML = "<p>No requests found.</p>";
            return;
        }

        adminContent.innerHTML = "";

        list.forEach(r => {
            const div = document.createElement("div");
            div.className = "history-card";

            div.innerHTML = `
                <p><strong>ID:</strong> ${r.request_id}</p>
                <p><strong>Owner:</strong> ${r.owner_phone}</p>
                <p><strong>Mechanic:</strong> ${r.mechanic_phone || "—"}</p>
                <p><strong>Vehicle:</strong> ${r.vehicle_type}</p>
                <p><strong>Service:</strong> ${r.service_type}</p>
                <p><strong>Status:</strong> ${r.status}</p>
                <hr/>
            `;

            adminContent.appendChild(div);
        });

    } catch (err) {
        console.error(err);
        adminContent.innerHTML = "<p>Failed to load requests.</p>";
    }
};

/* ======================================================
   VERIFY / REJECT MECHANIC
   ====================================================== */
function bindMechanicActions() {
    document.querySelectorAll(".verifyBtn").forEach(btn => {
        btn.onclick = async () => {
            const phone = btn.dataset.phone;
            await apiPost(`/admin/verify-mechanic/${phone}`);
            pendingBtn.click(); // refresh
        };
    });

    document.querySelectorAll(".rejectBtn").forEach(btn => {
        btn.onclick = async () => {
            const phone = btn.dataset.phone;
            await apiPost(`/admin/reject-mechanic/${phone}`);
            pendingBtn.click(); // refresh
        };
    });
}

/* ======================================================
   INIT
   ====================================================== */
loadStats();
