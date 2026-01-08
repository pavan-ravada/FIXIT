import { apiGet, apiPost } from "../js/api.js";

document.addEventListener("DOMContentLoaded", () => {

  const ownerRaw = localStorage.getItem("owner");
  const requestId = localStorage.getItem("activeRequestId");

  if (!ownerRaw || !requestId) {
    console.warn("request-status loaded without required state");
    return;
  }

  const owner = JSON.parse(ownerRaw);

  let map = null;
  let mechanicMarker = null;
  let statusInterval = null;
  let isNavigatingAway = false;   // 🔥 HARD LOCK

  /* ================= NAVBAR ================= */
  document.getElementById("logo")?.addEventListener("click", () => {
    if (isNavigatingAway) return;
    window.location.href = "./owner-dashboard.html";
  });

  document.getElementById("historyBtn")?.addEventListener("click", () => {
    if (isNavigatingAway) return;
    window.location.href = "./owner-history.html";
  });

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
      if (isNavigatingAway) return;
      isNavigatingAway = true;

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


  /* ================= MAP ================= */
  function initMap(lat, lng) {
    if (typeof google === "undefined" || !google.maps) return;
    if (map) return;

    map = new google.maps.Map(document.getElementById("map"), {
      center: { lat, lng },
      zoom: 15
    });
  }

  function updateMechanicLocation(loc) {
    if (!map || isNavigatingAway) return;

    if (!mechanicMarker) {
      mechanicMarker = new google.maps.Marker({
        position: loc,
        map,
        icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
      });
    } else {
      mechanicMarker.setPosition(loc);
    }
  }

  /* ================= FETCH STATUS ================= */
  async function fetchStatus() {
    if (isNavigatingAway) return;   // 🔥 STOP EVERYTHING

    try {
      const data = await apiGet(`/owner/request/${requestId}`);

      document.getElementById("statusText").innerText = data.status;

      if (!map && data.ownerLocation) {
        initMap(data.ownerLocation.lat, data.ownerLocation.lng);
      }

      if (data.mechanic) {
        document.getElementById("mechanicInfo").innerText =
          `Mechanic: ${data.mechanic.name} (${data.mechanic.phone})`;
      }

      if (data.mechanicLocation) {
        updateMechanicLocation(data.mechanicLocation);
      }

      const otpSection = document.getElementById("otpSection");
      const cancelBtn = document.getElementById("cancelBtn");
      const completeBtn = document.getElementById("completeBtn");

      otpSection.style.display = "none";
      cancelBtn.style.display = "none";
      completeBtn.style.display = "none";

      if (data.status === "SEARCHING") {
        cancelBtn.style.display = "block";
      }

      if (data.status === "ACCEPTED") {
        otpSection.style.display = "block";
        cancelBtn.style.display = "block";
      }

      if (data.status === "IN_PROGRESS") {
        completeBtn.style.display = "block";
      }

    } catch (err) {
      console.error("Status fetch failed:", err);
    }
  }
  /* ================= OTP VERIFY ================= */
  document.getElementById("verifyOtpBtn")?.addEventListener("click", async () => {
    if (isNavigatingAway) return;

    const otpInput = document.getElementById("otpInput");
    const otp = otpInput.value.trim();

    if (!otp) {
      alert("Please enter OTP");
      return;
    }

    try {
      await apiPost(`/owner/verify-otp/${requestId}`, {
        phone: owner.phone,
        otp
      });

      // 🔥 Clear input
      otpInput.value = "";

      // 🔥 Force state re-sync (backend is source of truth)
      await fetchStatus();

      alert("OTP verified successfully");

    } catch (err) {
      console.error("OTP verification failed:", err);
      alert(err.message || "Invalid OTP");
    }
  });

  /* ================= CANCEL REQUEST ================= */
document.getElementById("cancelBtn")?.addEventListener("click", async () => {
    if (isNavigatingAway) return;

    const confirmCancel = confirm(
      "Are you sure you want to cancel this request?"
    );
    if (!confirmCancel) return;

    isNavigatingAway = true;          // 🔒 LOCK PAGE
    clearInterval(statusInterval);    // 🔒 STOP POLLING

    try {
      await apiPost(`/owner/request/cancel/${requestId}`, {
        phone: owner.phone            // ✅ BACKEND EXPECTS THIS
      });

      // 🔒 CLEAN LOCAL STATE
      localStorage.removeItem("activeRequestId");

      // ➡️ BACK TO DASHBOARD
      window.location.replace("./owner-dashboard.html");

    } catch (err) {
      isNavigatingAway = false;
      console.error("Cancel failed:", err);
      alert(err.message || "Failed to cancel request");
    }
  });



  /* ================= COMPLETE JOB ================= */
  document.getElementById("completeBtn")?.addEventListener("click", async () => {
    if (isNavigatingAway) return;

    isNavigatingAway = true;        // 🔥 LOCK PAGE
    clearInterval(statusInterval); // 🔥 STOP POLLING

    try {
      await apiPost(`/owner/complete/${requestId}`, {
        owner_phone: owner.phone
      });

      localStorage.removeItem("activeRequestId");
      localStorage.setItem("completedRequestId", requestId);

      console.log("✅ COMPLETE CLICKED");
      console.log("owner =", localStorage.getItem("owner"));
      console.log("completedRequestId =", localStorage.getItem("completedRequestId"));


      // 🔥 FORCE NAVIGATION
      window.location.href = "rating.html";


    } catch (err) {
      isNavigatingAway = false;
      console.error("Complete job failed:", err);
      alert("Failed to complete job");
    }
  });

  /* ================= START ================= */
  fetchStatus();
  statusInterval = setInterval(fetchStatus, 5000);
});
