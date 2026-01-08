import { apiPost } from "../js/api.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const message = document.getElementById("message");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const phone = document.getElementById("phone").value.trim();
    const password = document.getElementById("password").value;

    message.textContent = "";
    message.style.color = "red";

    if (!phone || !password) {
      message.textContent = "Phone and password are required";
      return;
    }

    try {
      const res = await apiPost("/mechanic/login", {
        phone,
        password
      });

      // 🔐 create session
      localStorage.clear();
      localStorage.setItem(
        "mechanic",
        JSON.stringify({ phone: res.mechanic_phone })
      );

      message.style.color = "green";
      message.textContent = "Login successful. Redirecting...";

      // ✅ ALWAYS GO TO DASHBOARD
      setTimeout(() => {
        window.location.href = "./mechanic-dashboard.html";
      }, 600);

    } catch (err) {
      message.textContent = err.message || "Login failed";
    }
  });
});
