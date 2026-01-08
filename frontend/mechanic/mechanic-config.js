import { apiPost } from "../js/api.js";

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

/* ---------------- SAVE CONFIG ---------------- */
document.getElementById("saveBtn").onclick = async () => {
    const vehicleTypes = Array.from(
        document.querySelectorAll('input[type="checkbox"][value][value]:checked')
    )
        .filter(cb =>
            ["BIKE", "CAR", "AUTO", "BUS", "LORRY"].includes(cb.value)
        )
        .map(cb => cb.value);

    const serviceTypes = Array.from(
        document.querySelectorAll('input[type="checkbox"][value]:checked')
    )
        .filter(cb =>
            ["PUNCTURE", "BATTERY", "ENGINE", "TRANSMISSION", "LIGHTS", "BRAKE"]
                .includes(cb.value)
        )
        .map(cb => cb.value);

    const message = document.getElementById("message");
    message.textContent = "";
    message.style.color = "red";

    if (vehicleTypes.length === 0 || serviceTypes.length === 0) {
        message.textContent = "Select at least one vehicle and service type";
        return;
    }

    try {
        await apiPost("/mechanic/configure", {
            phone: mechanic.phone,
            vehicle_types: vehicleTypes,
            service_types: serviceTypes
        });

        message.style.color = "green";
        message.textContent = "Configuration saved successfully";

    } catch (err) {
        message.textContent = err.message || "Failed to save configuration";
    }
};
