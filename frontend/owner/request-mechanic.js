import { apiPost } from "../js/api.js";

console.log("🔥 request-mechanic.js loaded");

document.addEventListener("DOMContentLoaded", () => {

  /* ======================================================
     🔐 SESSION GUARDS (STRICT & SAFE)
     ====================================================== */
  const ownerRaw = localStorage.getItem("owner");
  const activeRequestId = localStorage.getItem("activeRequestId");

  if (!ownerRaw) {
    alert("Session expired. Please login again.");
    window.location.replace("./owner-login.html");
    return;
  }

  if (activeRequestId) {
    window.location.replace("./request-status.html");
    return;
  }

  const owner = JSON.parse(ownerRaw);

    /* ================= NAVBAR ================= */
  const profileIcon = document.getElementById("profileIcon");
  const profileMenu = document.getElementById("profileMenu");

  // FIXIT → Dashboard
  document.getElementById("logo")?.addEventListener("click", () => {
    window.location.href = "./owner-dashboard.html";
  });

  // Toggle profile dropdown
  profileIcon?.addEventListener("click", () => {
    profileMenu.classList.toggle("show");
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (
      !profileIcon.contains(e.target) &&
      !profileMenu.contains(e.target)
    ) {
      profileMenu.classList.remove("show");
    }
  });

  // History
  document.getElementById("historyBtn")?.addEventListener("click", () => {
    window.location.href = "./owner-history.html";
  });

  // Logout
  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    try {
      await apiPost("/owner/logout", { phone: owner.phone });
    } catch {}

    localStorage.removeItem("owner");
    localStorage.removeItem("activeRequestId");
    localStorage.removeItem("completedRequestId");

    window.location.replace("../index.html");
  });


  /* ======================================================
     ELEMENTS
     ====================================================== */
  const form = document.getElementById("requestForm");
  const getLocationBtn = document.getElementById("getLocationBtn");

  const vehicleTypeInput = document.getElementById("vehicleType");
  const serviceTypeInput = document.getElementById("serviceType");
  const descriptionInput = document.getElementById("description");

  const latInput = document.getElementById("lat");
  const lngInput = document.getElementById("lng");

  let map = null;
  let marker = null;

  /* ======================================================
     GOOGLE MAPS SAFE LOADER
     ====================================================== */
  function waitForGoogleMaps(cb) {
    if (window.google && google.maps) {
      cb();
    } else {
      setTimeout(() => waitForGoogleMaps(cb), 200);
    }
  }

  function loadMap(lat, lng) {
    waitForGoogleMaps(() => {
      const position = { lat, lng };

      if (!map) {
        map = new google.maps.Map(document.getElementById("map"), {
          center: position,
          zoom: 15,
        });
      } else {
        map.setCenter(position);
      }

      if (!marker) {
        marker = new google.maps.Marker({
          position,
          map,
          title: "Your Location",
        });
      } else {
        marker.setPosition(position);
      }
    });
  }

  /* ======================================================
     📍 GET CURRENT LOCATION (DEV MODE)
     ====================================================== */
  getLocationBtn.addEventListener("click", () => {
    // 🔧 MOCK LOCATION (Hyderabad)
    const mockLat = 17.3850;
    const mockLng = 78.4867;

    latInput.value = mockLat;
    lngInput.value = mockLng;

    loadMap(mockLat, mockLng);

    alert("Using mock location for development");
  });

  /* ======================================================
     🚑 SUBMIT REQUEST
     ====================================================== */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      owner_phone: owner.phone,
      vehicle_type: vehicleTypeInput.value,
      service_type: serviceTypeInput.value,
      description: descriptionInput.value,
      lat: parseFloat(latInput.value),
      lng: parseFloat(lngInput.value),
    };

    if (!payload.vehicle_type || !payload.service_type) {
      alert("Please select vehicle and service type");
      return;
    }

    if (!payload.lat || !payload.lng) {
      alert("Please get your location first");
      return;
    }

    try {
      const res = await apiPost("/owner/request/create", payload);

      // 🔒 ONLY activeRequestId is set here
      localStorage.setItem("activeRequestId", res.request_id);

      window.location.replace("./request-status.html");

    } catch (err) {
      alert(err.message || "Failed to create request");
    }
  });

});