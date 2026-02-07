import { apiGet, apiPost } from "../js/api.js";



/* ================= SESSION ================= */
const mechanic = JSON.parse(localStorage.getItem("mechanic"));
const requestId =
  new URLSearchParams(window.location.search).get("request_id") ||
  localStorage.getItem("activeRequestId");

if (!mechanic || !requestId) {
  alert("Invalid session");
  window.location.replace("./mechanic-dashboard.html");
}

/* ================= BILL EXISTENCE GUARD ================= */
(async function checkBillStatus() {
  try {
    const data = await apiGet(`/mechanic/request/${requestId}?phone=${mechanic.phone}`);

    if (data.bill_status === "CREATED" || data.bill_status === "CONFIRMED") {
      alert("Bill already created. Waiting for owner confirmation.");
      window.location.replace("./mechanic-active-job.html");
    }
  } catch (e) {
    console.error("Bill status check failed", e);
  }
})();


/* ================= ELEMENTS ================= */
const itemsContainer = document.getElementById("items");
const servicesContainer = document.getElementById("services");
const itemsTotalEl = document.getElementById("itemsTotal");
const servicesTotalEl = document.getElementById("servicesTotal");
const grandTotalEl = document.getElementById("grandTotal");

/* ================= CALCULATION ================= */
function calculateTotals() {
  let itemsTotal = 0;
  let servicesTotal = 0;

  document.querySelectorAll("#items .row").forEach(row => {
    const qty = Number(row.querySelector(".qty")?.value || 0);
    const price = Number(row.querySelector(".price")?.value || 0);
    itemsTotal += qty * price;
  });

  document.querySelectorAll("#services .row").forEach(row => {
    const price = Number(row.querySelector(".service-price")?.value || 0);
    servicesTotal += price;
  });

  itemsTotalEl.innerText = `₹${itemsTotal}`;
  servicesTotalEl.innerText = `₹${servicesTotal}`;
  grandTotalEl.innerText = `₹${itemsTotal + servicesTotal}`;
}

/* ================= ADD ROWS ================= */
window.addItem = function () {
  const row = document.createElement("div");
  row.className = "row";

  row.innerHTML = `
    <div class="item-header">
      <input class="item-name" placeholder="Item name">
      <button class="remove-btn">➖</button>
    </div>

    <div class="sub-row">
      <input class="qty" type="text" inputmode="numeric" value="1" placeholder="Qty">
      <input class="price" type="text" inputmode="numeric" placeholder="Price">
    </div>
  `;

  row.querySelector(".remove-btn").onclick = () => {
    row.remove();
    calculateTotals();
  };

  row.querySelectorAll("input").forEach(i =>
    i.addEventListener("input", calculateTotals)
  );

  itemsContainer.appendChild(row);
};

window.addService = function () {
  const row = document.createElement("div");
  row.className = "row";

  row.innerHTML = `
    <div class="item-header">
      <input class="service-name" placeholder="Service name">
      <button class="remove-btn">➖</button>
    </div>

    <input
      class="service-price"
      type="text"
      inputmode="numeric"
      placeholder="Price"
    >
  `;

  // ❌ Remove service row
  row.querySelector(".remove-btn").onclick = () => {
    row.remove();
    calculateTotals();
  };

  // 🔢 Recalculate on price change
  row.querySelector(".service-price")
    .addEventListener("input", calculateTotals);

  servicesContainer.appendChild(row);
};

/* ================= COLLECT DATA ================= */
function collectBillData() {
  const items = [];
  const services = [];

  document.querySelectorAll("#items .row").forEach(row => {
    const name = row.querySelector(".item-name")?.value.trim();
    const quantity = Number(row.querySelector(".qty")?.value);
    const price = Number(row.querySelector(".price")?.value);

    if (name && price > 0 && quantity > 0) {
      items.push({ name, quantity, price });
    }
  });

  document.querySelectorAll("#services .row").forEach(row => {
    const name = row.querySelector(".service-name")?.value.trim();
    const price = Number(row.querySelector(".service-price")?.value);

    if (name && price > 0) {
      services.push({ name, price });
    }
  });

  return { items, services };
}

/* ================= CREATE BILL ================= */
window.createBill = async function () {
  const btn = document.querySelector(".btn-primary");
  btn.disabled = true;
  btn.innerText = "Creating bill...";
  const { items, services } = collectBillData();

  if (items.length === 0 && services.length === 0) {
    alert("Add at least one item or service");
    return;
  }

  try {
    await apiPost("/mechanic/bill/create", {
      request_id: requestId,
      items,
      services
    });

    alert("Bill created successfully");

    // 🔁 Redirect mechanic back to active job page
    window.location.replace("./mechanic-active-job.html");

    itemsContainer.innerHTML = "";
    servicesContainer.innerHTML = "";

    } catch (err) {
      btn.disabled = false;
      btn.innerText = "Create Bill";
      console.error(err);
      alert("Failed to create bill");
    }
};

/* ================= INIT ================= */
addItem();     // start with one item row
addService();  // start with one service row
calculateTotals();