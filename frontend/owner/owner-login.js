import { apiPost } from "../js/api.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const message = document.getElementById("message");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const phone = document.getElementById("phone").value.trim();
    const password = document.getElementById("password").value;

    message.textContent = "";
    message.classList.remove("error", "success");

    if (!phone || !password) {
      message.textContent = "Phone and password are required";
      return;
    }

    try {
      // ✅ BACKEND RESPONSE
      const res = await apiPost("/owner/login", { phone, password });

      localStorage.removeItem("activeRequestId");
      localStorage.removeItem("completedRequestId");


      // ✅ STORE OWNER SESSION
      localStorage.setItem(
        "owner",
        JSON.stringify({ phone: res.owner_phone })
      );

      // ✅ REDIRECT
      window.location.href = "./owner-dashboard.html";

    } catch (err) {
      console.error(err);

      message.classList.remove("success");
      message.classList.add("error");
      message.textContent = err.message || "Invalid phone or password";
    }
  });
});
