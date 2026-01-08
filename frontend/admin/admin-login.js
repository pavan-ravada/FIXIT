import { apiPost } from "../js/api.js";

document.addEventListener("DOMContentLoaded", () => {

    const form = document.getElementById("adminLoginForm");
    const message = document.getElementById("message");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const phone = document.getElementById("phone").value.trim();
        const password = document.getElementById("password").value;

        message.textContent = "";

        if (!phone || !password) {
            message.textContent = "Phone and password are required";
            return;
        }

        try {
            const res = await apiPost("/admin/login", {
                phone,
                password
            });

            // 🔒 CLEAR ANY OLD SESSIONS
            localStorage.removeItem("owner");
            localStorage.removeItem("mechanic");
            localStorage.removeItem("activeRequestId");
            localStorage.removeItem("completedRequestId");

            // ✅ STORE ADMIN SESSION
            localStorage.setItem(
                "admin",
                JSON.stringify({ phone: res.admin_phone })
            );

            // ➡️ GO TO ADMIN DASHBOARD
            window.location.replace("./admin-dashboard.html");

        } catch (err) {
            console.error(err);
            message.textContent = err.message || "Admin login failed";
        }
    });

});