// js/navbar.js

function initNavbar(role) {
    // 🛑 HARD GUARD — DO NOTHING IF ROLE IS INVALID
    if (!role || !["owner", "mechanic", "admin"].includes(role)) {
        console.warn("Navbar initialized without valid role. Skipping navbar setup.");
        return;
    }

    const logo = document.getElementById("logo");
    const profileIcon = document.getElementById("profileIcon");
    const profileMenu = document.getElementById("profileMenu");

    if (logo) {
        logo.onclick = () => {
            if (role === "owner") {
                window.location.href = "../owner/owner-dashboard.html";
            }
            if (role === "mechanic") {
                window.location.href = "../mechanic/mechanic-dashboard.html";
            }
            if (role === "admin") {
                window.location.href = "../admin/admin-dashboard.html";
            }
        };
    }

    if (profileIcon && profileMenu) {
        profileIcon.onclick = () => {
            profileMenu.classList.toggle("show");
        };

        document.addEventListener("click", (e) => {
            if (!profileIcon.contains(e.target)) {
                profileMenu.classList.remove("show");
            }
        });
    }
}

// ✅ EXPLICIT EXPORT (IMPORTANT)
export { initNavbar };
