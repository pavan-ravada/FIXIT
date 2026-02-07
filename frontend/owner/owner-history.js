import { apiGet, apiPost } from "../js/api.js";

/* ---------------- SESSION CHECK ---------------- */
const ownerRaw = localStorage.getItem("owner");

if (!ownerRaw) {
    window.location.replace("./owner-login.html");
} else {
    const owner = JSON.parse(ownerRaw);
    init(owner);
}

function formatDate(ts) {
    if (!ts) return "-";

    // Firestore timestamp
    if (ts.seconds) {
        return new Date(ts.seconds * 1000).toLocaleDateString();
    }

    // ISO string
    const d = new Date(ts);
    if (!isNaN(d)) return d.toLocaleDateString();

    return "-";
}

/* ---------------- MAIN ---------------- */
function init(owner) {

    /* ---------------- NAVBAR ---------------- */
    document.getElementById("logo")?.addEventListener("click", () => {
        window.location.href = "./owner-dashboard.html";
    });

    document.getElementById("dashboardBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
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

            const dateText = formatDate(req.completed_at);

            div.innerHTML = `
                <p><strong>Vehicle:</strong> ${req.vehicle_type}</p>
                <p><strong>Service:</strong> ${req.service_type}</p>
                <p><strong>Status:</strong> ${req.status}</p>
                <p><strong>Date:</strong> ${dateText}</p>

                <button class="view-btn" data-id="${req.request_id}">
                    View Details
                </button>
            `;

            container.appendChild(div);
        });

    } catch (err) {
        console.error(err);
        container.innerHTML = "<p>Failed to load history.</p>";
    }
}

/* ---------------- MODAL LOGIC ---------------- */
document.addEventListener("click", async (e) => {
    if (!e.target.classList.contains("view-btn")) return;

    const requestId = e.target.dataset.id;
    const modal = document.getElementById("detailsModal");
    const content = document.getElementById("modalContent");

    modal.style.display = "flex";
    content.innerHTML = "Loading details...";

    try {
        const owner = JSON.parse(localStorage.getItem("owner"));

        const data = await apiGet(
        `/owner/request/details/${requestId}?phone=${owner.phone}`
        );

        content.innerHTML = `
        <div class="modal-section">
            <div class="modal-row">
            <strong>Status</strong><span>${data.status}</span>
            </div>
            <div class="modal-row">
            <strong>Vehicle</strong><span>${data.vehicle_type}</span>
            </div>
            <div class="modal-row">
            <strong>Service</strong><span>${data.service_type}</span>
            </div>
        </div>

        <div class="modal-divider"></div>

        <div class="modal-section">
            <h4>Bill Summary</h4>
            <div class="modal-row">
            <strong>Total</strong>
            <span>₹${data.bill?.grand_total ?? "-"}</span>
            </div>

            ${
            data.bill?.items?.length
            ? `<ul class="modal-list">
                ${data.bill.items.map(i =>
                    `<li>${i.name} × ${i.quantity || 1} — ₹${i.price}</li>`
                ).join("")}
                </ul>`
            : ""
            }

            ${
            data.bill?.services?.length
            ? `<ul class="modal-list">
                ${data.bill.services.map(s =>
                    `<li>${s.name} — ₹${s.price}</li>`
                ).join("")}
                </ul>`
            : ""
            }
        </div>

        <div class="modal-divider"></div>

        <div class="modal-section">
            <h4>Feedback</h4>
            <div class="modal-row">
            <strong>Rating</strong><span>${data.rating ?? "-"}</span>
            </div>
            <div class="modal-row">
            <strong>Comment</strong><span>${data.feedback ?? "-"}</span>
            </div>
        </div>
        `;
    } catch (err) {
        console.error(err);
        content.innerHTML = "Failed to load details.";
    }
});

/* ---------------- CLOSE MODAL ---------------- */
document.getElementById("closeModalBtn")?.addEventListener("click", () => {
    document.getElementById("detailsModal").style.display = "none";
});