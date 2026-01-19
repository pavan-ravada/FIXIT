import { apiPost } from "../js/api.js";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("registerForm");
    const message = document.getElementById("message");

    if (!form) {
        console.error("❌ registerForm not found");
        return;
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault(); // ⛔ STOP PAGE RELOAD

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

        message.textContent = "";
        message.style.color = "red";

        /* ---------- VALIDATIONS ---------- */
        if (!name || !phone || !password || !confirmPassword) {
            message.textContent = "All fields are required";
            return;
        }

        if (!/^[0-9]{10}$/.test(phone)) {
            message.textContent = "Phone number must be exactly 10 digits";
            return;
        }

        if (password !== confirmPassword) {
            message.textContent = "Passwords do not match";
            return;
        }

        if (vehicleTypes.length === 0 || serviceTypes.length === 0) {
            message.textContent = "Select at least one vehicle and service type";
            return;
        }

        /* ---------- API CALL ---------- */
        try {
            await apiPost("/mechanic/register", {
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
            message.textContent = err.message || "Registration failed";
        }
    });
});