import { apiPost } from "../js/api.js";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("registerForm");
    const message = document.getElementById("message");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const name = document.getElementById("name").value.trim();
        const phone = document.getElementById("phone").value.trim();
        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirmPassword").value;

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

        if (password !== confirmPassword) {
            message.textContent = "Passwords do not match";
            return;
        }

        try {
            await apiPost("/owner/register", {
                name,
                phone,
                password,
                confirm_password: confirmPassword
            });

            message.style.color = "green";
            message.textContent = "Registration successful. Redirecting...";

            setTimeout(() => {
                window.location.href = "./owner-login.html";
            }, 800);

        } catch (err) {
            message.className = "Registration failed";
            message.textContent = err.message;
        }
    });
});