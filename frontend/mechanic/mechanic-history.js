import { apiGet, apiPost } from "../js/api.js";

/* ---------------- SESSION CHECK ---------------- */
const mechanicRaw = localStorage.getItem("mechanic");
if (!mechanicRaw) {
    window.location.replace("./mechanic-login.html");
}
const mechanic = JSON.parse(mechanicRaw);


function formatDate(value) {
    if (!value) return "-";

    // Firestore Timestamp
    if (value.seconds) {
        return new Date(value.seconds * 1000).toLocaleDateString();
    }

    // Milliseconds number
    if (typeof value === "number") {
        return new Date(value).toLocaleDateString();
    }

    // ISO string or normal string
    if (typeof value === "string") {
        const d = new Date(value);
        return isNaN(d) ? value : d.toLocaleDateString();
    }

    return "-";
}

/* ---------------- NAVBAR ---------------- */
document.getElementById("logo").onclick =
  () => location.href = "./mechanic-dashboard.html";

document.getElementById("dashboardBtn").onclick =
  () => location.href = "./mechanic-dashboard.html";

document.getElementById("logoutBtn").onclick = async () => {
    try {
        await apiPost("/mechanic/logout", { phone: mechanic.phone });
    } catch {}
    localStorage.clear();
    location.href = "../index.html";
};

/* ---------------- LOAD HISTORY ---------------- */
let cachedHistory = [];

async function loadHistory() {
    const container = document.getElementById("historyList");
    container.innerHTML = "Loading...";

    try {
        const res = await apiGet(
            `/mechanic/jobs/history?phone=${mechanic.phone}`
        );

        cachedHistory = res.history || [];

        if (!cachedHistory.length) {
            container.innerHTML = "<p class='empty'>No completed jobs yet.</p>";
            return;
        }

        container.innerHTML = "";

        cachedHistory.forEach(job => {
            const card = document.createElement("div");
            card.className = "history-card";

            card.innerHTML = `
                <p><strong>Vehicle:</strong> ${job.vehicle_type}</p>
                <p><strong>Service:</strong> ${job.service_type}</p>
                <p><strong>Status:</strong> COMPLETED</p>
                <p><strong>Date:</strong> ${formatDate(job.completed_at)}</p>

                <button class="view-btn" data-id="${job.request_id}">
                  View Details
                </button>
            `;

            container.appendChild(card);
        });

    } catch (err) {
        console.error(err);
        container.innerHTML = "<p>Failed to load history.</p>";
    }
}

loadHistory();

/* ---------------- MODAL LOGIC ---------------- */
document.addEventListener("click", async (e) => {
    if (!e.target.classList.contains("view-btn")) return;

    const requestId = e.target.dataset.id;
    const modal = document.getElementById("detailsModal");
    const content = document.getElementById("modalContent");

    modal.style.display = "flex";
    content.innerHTML = "Loading...";

    try {
        // 1️⃣ Get job from cached history (rating + feedback)
        const job = cachedHistory.find(j => j.request_id === requestId);

        // 2️⃣ Get bill
        const bill = await apiGet(`/mechanic/bill/${requestId}`).catch(() => null);

        content.innerHTML = `
          <div class="modal-section">
            <div class="modal-row">
              <span>Status</span>
              <span>COMPLETED</span>
            </div>
            <div class="modal-row">
              <span>Vehicle</span>
              <span>${job.vehicle_type}</span>
            </div>
            <div class="modal-row">
              <span>Service</span>
              <span>${job.service_type}</span>
            </div>
          </div>

          <div class="modal-divider"></div>

          <div class="modal-section">
            <h4>BILL SUMMARY</h4>

            <div class="modal-row">
              <span>Total</span>
              <span>₹${bill?.grand_total ?? "-"}</span>
            </div>

            <ul class="modal-list">
              ${
                bill?.items?.map(i =>
                  `<li>${i.name} × ${i.quantity || 1} — ₹${i.price}</li>`
                ).join("") || ""
              }
              ${
                bill?.services?.map(s =>
                  `<li>${s.name} — ₹${s.price}</li>`
                ).join("") || ""
              }
            </ul>
          </div>

          <div class="modal-divider"></div>

          <div class="modal-section">
            <h4>FEEDBACK</h4>

            <div class="modal-row">
              <span>Rating</span>
              <span>${job.rating ?? "-"}</span>
            </div>

            <div class="modal-row">
              <span>Comment</span>
              <span>${job.feedback ?? "-"}</span>
            </div>
          </div>
        `;

    } catch (err) {
        console.error(err);
        content.innerHTML = "Failed to load details.";
    }
});

/* ---------------- CLOSE MODAL ---------------- */
document.getElementById("closeModalBtn").onclick = () => {
    document.getElementById("detailsModal").style.display = "none";
};