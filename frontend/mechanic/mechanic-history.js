import { apiGet, apiPost } from "../js/api.js";

/* ---------------- SESSION CHECK ---------------- */
const mechanic = JSON.parse(localStorage.getItem("mechanic"));
if (!mechanic) {
    window.location.href = "./mechanic-login.html";
}

/* ---------------- NAVBAR ---------------- */
document.getElementById("logo").onclick = () => {
    window.location.href = "./mechanic-dashboard.html";
};

document.getElementById("dashboardBtn").onclick = () => {
    window.location.href = "./mechanic-dashboard.html";
};

document.getElementById("logoutBtn").onclick = async () => {
    try {
        await apiPost("/mechanic/logout", { phone: mechanic.phone });
    } catch {}
    localStorage.clear();
    window.location.href = "../index.html";
};

/* ---------------- LOAD HISTORY ---------------- */
async function loadHistory() {
    const container = document.getElementById("historyList");

    try {
        const res = await apiGet(
            `/mechanic/jobs/history?phone=${mechanic.phone}`
        );

        const history = res.history;

        if (!history || history.length === 0) {
            container.innerHTML = "<p>No completed jobs yet.</p>";
            return;
        }

        container.innerHTML = "";

        history.forEach(job => {
            const div = document.createElement("div");
            div.className = "history-card";

            div.innerHTML = `
                <p><strong>Vehicle:</strong> ${job.vehicle_type}</p>
                <p><strong>Service:</strong> ${job.service_type}</p>
                <p><strong>Rating:</strong> ${job.rating ?? "Not rated"}</p>
                <p><strong>Feedback:</strong> ${job.feedback ?? "-"}</p>
                <hr/>
            `;

            container.appendChild(div);
        });

    } catch (err) {
        console.error(err);
        container.innerHTML = "<p>Failed to load history</p>";
    }
}

loadHistory();
