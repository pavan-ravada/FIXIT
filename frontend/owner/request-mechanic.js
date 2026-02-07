import { apiPost } from "../js/api.js";

console.log("🔥 request-mechanic.js loaded");

// 🔧 DEMO MODE
// 👉 Localhost = demo location
// 👉 Production = real GPS
const DEMO_MODE = location.hostname === "localhost";

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
    return;
  }

  const owner = JSON.parse(ownerRaw);

  /* ================= NAVBAR ================= */
  const profileIcon = document.getElementById("profileIcon");
  const profileMenu = document.getElementById("profileMenu");

  document.getElementById("logo")?.addEventListener("click", () => {
    window.location.href = "./owner-dashboard.html";
  });

  profileIcon?.addEventListener("click", () => {
    profileMenu.classList.toggle("show");
  });

  document.addEventListener("click", (e) => {
    if (
      !profileIcon.contains(e.target) &&
      !profileMenu.contains(e.target)
    ) {
      profileMenu.classList.remove("show");
    }
  });

  document.getElementById("historyBtn")?.addEventListener("click", () => {
    window.location.href = "./owner-history.html";
  });

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
     📍 GET CURRENT LOCATION
     ====================================================== */
  getLocationBtn.addEventListener("click", () => {

    if (DEMO_MODE) {
      console.warn("⚠️ DEMO MODE ACTIVE (localhost)");
      const demoLat = 12.9916;
      const demoLng = 77.6146;

      latInput.value = demoLat;
      lngInput.value = demoLng;

      loadMap(demoLat, demoLng);
      alert("Using DEMO owner location (local testing)");
      return;
    }

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;

          latInput.value = lat;
          lngInput.value = lng;

          loadMap(lat, lng);
        },
        (err) => {
          alert("Enable GPS / Location permission");
          console.error(err);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        }
      );
    } else {
      alert("Geolocation not supported");
    }
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

    console.log("🚨 REQUEST LOCATION:", payload.lat, payload.lng);

    if (!payload.vehicle_type || !payload.service_type) {
      alert("Please select vehicle and service type");
      return;
    }

    if (isNaN(payload.lat) || isNaN(payload.lng)) {
      alert("Please get your location first");
      return;
    }

    try {
      const res = await apiPost("/owner/request/create", payload);
      localStorage.setItem("activeRequestId", res.request_id);
      window.location.replace("./request-status.html");
    } catch (err) {
      alert(err.message || "Failed to create request");
    }
  });

});