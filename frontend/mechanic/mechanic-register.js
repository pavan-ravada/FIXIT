import { apiPost } from "../js/api.js";

document.getElementById("registerBtn").onclick = async () => {
    const name = document.getElementById("name").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    const vehicleTypes = Array.from(
        document.querySelectorAll(".vehicle:checked")
    ).map(v => v.value);

    const serviceTypes = Array.from(
        document.querySelectorAll(".service:checked")
    ).map(s => s.value);

    const message = document.getElementById("message");
    message.textContent = "";
    message.style.color = "red";

    if (!name || !phone || !password || !confirmPassword) {
        message.textContent = "All fields are required";
        return;
    }

    // ✅ STRICT PHONE VALIDATION
    if (!/^[0-9]{10}$/.test(phone)) {
        message.className = "message error";
        message.textContent = "Phone number must be exactly 10 digits";
        return;
    }

    if (vehicleTypes.length === 0 || serviceTypes.length === 0) {
        message.textContent = "Select at least one vehicle and service type";
        return;
    }

    try {
        const res = await apiPost("/mechanic/register", {
            name,
            phone,
            password,
            confirm_password: confirmPassword,
            vehicle_types: vehicleTypes,
            service_types: serviceTypes
        });

        message.style.color = "green";
        message.textContent =
            "Registered successfully. Awaiting admin verification.";

        setTimeout(() => {
            window.location.href = "./mechanic-login.html";
        }, 1200);

    } catch (err) {
        message.textContent = err.message;
    }
};
