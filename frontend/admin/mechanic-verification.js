// Access check
if (localStorage.getItem("admin") !== "true") {
    window.location.href = "./admin-login.html";
}

const container = document.getElementById("mechanicsContainer");
const message = document.getElementById("message");

// Navbar
document.getElementById("logo").onclick = () => {
    window.location.href = "./admin-dashboard.html";
};

document.getElementById("dashboardBtn").onclick = () => {
    window.location.href = "./admin-dashboard.html";
};

document.getElementById("logoutBtn").onclick = () => {
    localStorage.removeItem("admin");
    window.location.href = "../index.html";
};

// Load pending mechanics
async function loadPendingMechanics() {
    try {
        const data = await apiRequest("/admin/mechanics/pending", "GET");

        container.innerHTML = "";

        if (!data.pending_mechanics || data.pending_mechanics.length === 0) {
            message.textContent = "No pending mechanics.";
            return;
        }

        data.pending_mechanics.forEach(mech => {
            const div = document.createElement("div");
            div.className = "mechanic-card";

            div.innerHTML = `
                <p><strong>Name:</strong> ${mech.name}</p>
                <p><strong>Phone:</strong> ${mech.phone}</p>
                <p><strong>Registered At:</strong> ${mech.created_at}</p>
                <button onclick="verifyMechanic('${mech.phone}')">
                    Verify
                </button>
                <button onclick="rejectMechanic('${mech.phone}')">
                    Reject
                </button>
            `;

            container.appendChild(div);
        });

    } catch (err) {
        message.textContent = "Failed to load pending mechanics";
    }
}

// Verify mechanic
async function verifyMechanic(phone) {
    if (!confirm("Verify this mechanic?")) return;

    try {
        await apiRequest(`/admin/verify-mechanic/${phone}`, "POST");
        loadPendingMechanics();
    } catch (err) {
        alert("Failed to verify mechanic");
    }
}

// Reject mechanic
async function rejectMechanic(phone) {
    if (!confirm("Reject and remove this mechanic?")) return;

    try {
        await apiRequest(`/admin/reject-mechanic/${phone}`, "POST");
        loadPendingMechanics();
    } catch (err) {
        alert("Failed to reject mechanic");
    }
}

loadPendingMechanics();
