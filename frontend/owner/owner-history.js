import { apiGet, apiPost } from "../js/api.js";

/* ---------------- SESSION CHECK ---------------- */
const ownerRaw = localStorage.getItem("owner");

if (!ownerRaw) {
    window.location.replace("./owner-login.html");
} else {
    const owner = JSON.parse(ownerRaw);
    init(owner);
}

/* ---------------- MAIN ---------------- */
function init(owner) {

    /* ---------------- NAVBAR ---------------- */
    /* ---------------- NAVBAR ---------------- */
    document.getElementById("logo")?.addEventListener("click", () => {
        window.location.href = "./owner-dashboard.html";
    });

    document.getElementById("dashboardBtn")?.addEventListener("click", (e) => {
        e.preventDefault(); // 🔥 important if <a> tag
        window.location.href = "./owner-dashboard.html";
    });

    document.getElementById("logoutBtn")?.addEventListener("click", async () => {
        try {
            if (owner?.phone) {
                await apiPost("/owner/logout", { phone: owner.phone });
            }
        } catch {}

        localStorage.removeItem("owner");
        localStorage.removeItem("activeRequestId");
        localStorage.removeItem("completedRequestId");

        window.location.replace("../index.html");
    });


    /* ---------------- LOAD HISTORY ---------------- */
    loadHistory(owner);
}

/* ---------------- LOAD HISTORY ---------------- */
async function loadHistory(owner) {
    const container = document.getElementById("historyList");
    container.innerHTML = "Loading...";

    try {
        const res = await apiGet(
            `/owner/requests/history?phone=${owner.phone}`
        );

        const history = res.history;

        if (!history || history.length === 0) {
            container.innerHTML = "<p>No service history found.</p>";
            return;
        }

        container.innerHTML = "";

        history.forEach(req => {
            const div = document.createElement("div");
            div.className = "history-card";

            div.innerHTML = `
                <p><strong>Vehicle:</strong> ${req.vehicle_type}</p>
                <p><strong>Service:</strong> ${req.service_type}</p>
                <p><strong>Status:</strong> ${req.status}</p>
                ${req.rating ? `<p><strong>Rating:</strong> ${req.rating}</p>` : ""}
                ${req.feedback ? `<p><strong>Feedback:</strong> ${req.feedback}</p>` : ""}
                <hr/>
            `;

            container.appendChild(div);
        });

    } catch (err) {
        console.error(err);
        container.innerHTML = "<p>Failed to load history.</p>";
    }
}
