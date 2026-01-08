import { apiGet, apiPost } from "../js/api.js";

/* ======================================================
   🔐 ADMIN SESSION GUARD
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
const dashboardBtn = document.getElementById("dashboardBtn");
const logoutBtn = document.getElementById("logoutBtn");

const listContainer = document.getElementById("mechanicsList");

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

dashboardBtn.onclick = () => {
    window.location.href = "./admin-dashboard.html";
};

logoutBtn.onclick = async () => {
    try {
        await apiPost("/admin/logout", { phone: admin.phone });
    } catch {}

    localStorage.removeItem("admin");
    window.location.replace("../index.html");
};

/* ======================================================
   LOAD PENDING MECHANICS
   ====================================================== */
async function loadPendingMechanics() {
    listContainer.innerHTML = "<p>Loading pending mechanics...</p>";

    try {
        const res = await apiGet("/admin/mechanics/pending");
        const list = res.pending_mechanics;

        if (!list || list.length === 0) {
            listContainer.innerHTML = "<p>No pending mechanics.</p>";
            return;
        }

        listContainer.innerHTML = "";

        list.forEach(m => {
            const div = document.createElement("div");
            div.className = "history-card";

            div.innerHTML = `
                <p><strong>Name:</strong> ${m.name || "N/A"}</p>
                <p><strong>Phone:</strong> ${m.phone}</p>
                <p><strong>Created:</strong> ${m.created_at || "—"}</p>

                <button class="verifyBtn" data-phone="${m.phone}">
                    Verify
                </button>

                <button class="rejectBtn" data-phone="${m.phone}">
                    Reject
                </button>

                <hr/>
            `;

            listContainer.appendChild(div);
        });

        bindActions();

    } catch (err) {
        console.error("Failed to load pending mechanics:", err);
        listContainer.innerHTML = "<p>Failed to load mechanics.</p>";
    }
}

/* ======================================================
   VERIFY / REJECT HANDLERS
   ====================================================== */
function bindActions() {
    document.querySelectorAll(".verifyBtn").forEach(btn => {
        btn.onclick = async () => {
            const phone = btn.dataset.phone;

            try {
                await apiPost(`/admin/verify-mechanic/${phone}`);
                loadPendingMechanics();
            } catch (err) {
                alert("Failed to verify mechanic");
            }
        };
    });

    document.querySelectorAll(".rejectBtn").forEach(btn => {
        btn.onclick = async () => {
            const phone = btn.dataset.phone;

            try {
                await apiPost(`/admin/reject-mechanic/${phone}`);
                loadPendingMechanics();
            } catch (err) {
                alert("Failed to reject mechanic");
            }
        };
    });
}

/* ======================================================
   INIT
   ====================================================== */
loadPendingMechanics();
