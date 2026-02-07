import { apiGet, apiPost } from "../js/api.js";

/* ================= SESSION ================= */
const ownerRaw = localStorage.getItem("owner");
const requestId =
  new URLSearchParams(window.location.search).get("request_id") ||
  localStorage.getItem("activeRequestId");

if (!ownerRaw || !requestId) {
  window.location.replace("./owner-dashboard.html");
}

const owner = JSON.parse(ownerRaw);

/* ================= ELEMENTS ================= */
const itemsList = document.getElementById("itemsList");
const servicesList = document.getElementById("servicesList");

const itemsTotalEl = document.getElementById("itemsTotal");
const servicesTotalEl = document.getElementById("servicesTotal");
const grandTotalEl = document.getElementById("grandTotal");

const confirmBtn = document.getElementById("confirmBillBtn");

/* ================= RENDER ================= */
function renderItems(items = []) {
  itemsList.innerHTML = "";

  if (!items.length) {
    itemsList.innerHTML = "<p>No items added</p>";
    return;
  }

  items.forEach(item => {
    const qty = item.quantity || 1;
    const price = item.price || 0;

    const row = document.createElement("div");
    row.className = "bill-row";
    row.innerHTML = `
      <span class="item-name">${item.name} × ${qty}</span>
      <span>₹${qty * price}</span>
    `;
    itemsList.appendChild(row);
  });
}

function renderServices(services = []) {
  servicesList.innerHTML = "";

  if (!services.length) {
    servicesList.innerHTML = "<p>No service charges</p>";
    return;
  }

  services.forEach(service => {
    const row = document.createElement("div");
    row.className = "bill-row";
    row.innerHTML = `
      <span class="item-name">${service.name}</span>
      <span>₹${service.price || 0}</span>
    `;
    servicesList.appendChild(row);
  });
}

/* ================= FETCH BILL ================= */
async function loadBill() {
  const bill = await apiGet(`/owner/bill/${requestId}`);

  renderItems(bill.items);
  renderServices(bill.services);

  itemsTotalEl.innerText = `₹${bill.items_total}`;
  servicesTotalEl.innerText = `₹${bill.services_total}`;
  grandTotalEl.innerText = `₹${bill.grand_total}`;

  if (bill.status === "CONFIRMED") {
    confirmBtn.disabled = true;
    confirmBtn.innerText = "Bill Confirmed";
  }
}

/* ================= CONFIRM ================= */
confirmBtn.addEventListener("click", async () => {
  if (!confirm("Confirm this bill and complete the job?")) return;

  confirmBtn.disabled = true;
  confirmBtn.innerText = "Confirming...";

  try {
    await apiPost("/owner/bill/confirm", {
      request_id: requestId
    });

    // 🔁 VERIFY BACKEND STATE
    const bill = await apiGet(`/owner/bill/${requestId}`);
    if (bill.status !== "CONFIRMED") {
      throw new Error("Bill confirmation not completed");
    }

    // ✅ CLEAN STATE
    localStorage.removeItem("activeRequestId");
    localStorage.setItem("completedRequestId", requestId);

    // ✅ ONLY NOW → RATING
    window.location.replace("./rating.html");

  } catch (err) {
    confirmBtn.disabled = false;
    confirmBtn.innerText = "Confirm Bill";
    alert(err?.message || "Failed to confirm bill");
  }
});

/* ================= INIT ================= */
loadBill();