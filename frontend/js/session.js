// js/session.js

/* OWNER */
function setOwnerSession(phone) {
    localStorage.setItem("owner", JSON.stringify({ phone }));
}

function getOwnerSession() {
    return JSON.parse(localStorage.getItem("owner"));
}

function clearOwnerSession() {
    localStorage.removeItem("owner");
}

/* MECHANIC */
function setMechanicSession(phone) {
    localStorage.setItem("mechanic", JSON.stringify({ phone }));
}

function getMechanicSession() {
    return JSON.parse(localStorage.getItem("mechanic"));
}

function clearMechanicSession() {
    localStorage.removeItem("mechanic");
}

/* ADMIN */
function setAdminSession() {
    localStorage.setItem("admin", "true");
}

function isAdminSession() {
    return localStorage.getItem("admin") === "true";
}

function clearAdminSession() {
    localStorage.removeItem("admin");
}

/* REQUEST */
function setActiveRequest(requestId) {
    localStorage.setItem("activeRequestId", requestId);
}

function getActiveRequest() {
    return localStorage.getItem("activeRequestId");
}

function clearActiveRequest() {
    localStorage.removeItem("activeRequestId");
}

function setCompletedRequest(requestId) {
    localStorage.setItem("completedRequestId", requestId);
}

function getCompletedRequest() {
    return localStorage.getItem("completedRequestId");
}

function clearCompletedRequest() {
    localStorage.removeItem("completedRequestId");
}
