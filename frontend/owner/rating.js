import { apiPost } from "../js/api.js";

console.log("✅ rating.js loaded");

// 🔐 AUTH CHECK ONLY
const ownerRaw = localStorage.getItem("owner");
if (!ownerRaw) {
    console.warn("No owner session found");
    // DO NOT REDIRECT AUTOMATICALLY
}

const owner = ownerRaw ? JSON.parse(ownerRaw) : null;

// 🧾 REQUEST ID (NO REDIRECT)
const requestId = localStorage.getItem("completedRequestId");
console.log("completedRequestId =", requestId);

// ⭐ Rating logic
let selectedRating = 0;

document.querySelectorAll("#stars span").forEach(star => {
    star.onclick = () => {
        selectedRating = Number(star.dataset.value);
        document.querySelectorAll("#stars span").forEach(s =>
            s.classList.toggle("active", Number(s.dataset.value) <= selectedRating)
        );
    };
});

window.submitFeedback = async function () {
    if (!owner || !requestId) {
        alert("Missing session or request");
        return;
    }

    await apiPost(`/owner/request/feedback/${requestId}`, {
        phone: owner.phone,
        rating: selectedRating,
        feedback: document.getElementById("feedback").value
    });

    localStorage.removeItem("completedRequestId");
    window.location.href = "./owner-dashboard.html";
};
