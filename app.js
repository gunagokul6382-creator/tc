const products = [
  { id: "a1-milk", name: "A1 பால் / A1 Milk (1L)", price: 65, image: "./assets/a1-milk.png" },
  { id: "a2-milk", name: "A2 பால் / A2 Milk (1L)", price: 85, image: "./assets/a2-milk.png" },
  { id: "ghee", name: "நெய் / Ghee (500ml)", price: 420, image: "./assets/ghee.png" },
  { id: "butter", name: "வெண்ணெய் / Butter (200g)", price: 120, image: "./assets/butter.png" },
];

const OWNER_LOGIN_ID = "gsowner";
const OWNER_PASSWORD = "gsg@owner";
const OWNER_CONTACT_NUMBER = "+91 90000 12345";
const OWNER_BASE_LOCATION = { latitude: 10.7867, longitude: 79.1378 };

const savedProducts = JSON.parse(localStorage.getItem("cholasProducts")) || [];
const mergedProducts =
  savedProducts.length > 0
    ? products.map((defaultProduct) => {
        const saved = savedProducts.find((item) => item.id === defaultProduct.id);
        return saved ? { ...defaultProduct, price: saved.price ?? defaultProduct.price } : defaultProduct;
      })
    : products;

const state = {
  cart: [],
  products: mergedProducts,
  customer: JSON.parse(localStorage.getItem("cholasCustomer")) || null,
  locationWatcher: null,
  lastLocation: JSON.parse(localStorage.getItem("cholasLocation")) || null,
  ownerUnlocked: false,
  orders: JSON.parse(localStorage.getItem("cholasOrders")) || [],
};

localStorage.setItem("cholasProducts", JSON.stringify(state.products));

const productGrid = document.getElementById("productGrid");
const cartItems = document.getElementById("cartItems");
const cartTotal = document.getElementById("cartTotal");
const authStatus = document.getElementById("authStatus");
const deliveryName = document.getElementById("deliveryName");
const deliveryStatus = document.getElementById("deliveryStatus");
const locationStatus = document.getElementById("locationStatus");
const authModal = document.getElementById("authModal");
const ownerModal = document.getElementById("ownerModal");
const ownerControls = document.getElementById("ownerControls");
const ownerPriceList = document.getElementById("ownerPriceList");
const customerDashboardStatus = document.getElementById("customerDashboardStatus");
const customerCurrentOrder = document.getElementById("customerCurrentOrder");
const customerOrderHistory = document.getElementById("customerOrderHistory");
const ownerDashboard = document.getElementById("ownerDashboard");
const ownerOrdersList = document.getElementById("ownerOrdersList");
const openOwnerDashboardBtn = document.getElementById("openOwnerDashboard");
const orderConfirmModal = document.getElementById("orderConfirmModal");
const orderConfirmItems = document.getElementById("orderConfirmItems");
const orderConfirmTotal = document.getElementById("orderConfirmTotal");
const orderConfirmLocationStatus = document.getElementById("orderConfirmLocationStatus");

const map = L.map("map").setView([10.7867, 79.1378], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors" }).addTo(map);

let locationMarker = L.marker([10.7867, 79.1378]).addTo(map);
locationMarker.bindPopup("Delivery will track customer live location.");

function saveOrders() {
  localStorage.setItem("cholasOrders", JSON.stringify(state.orders));
}

function formatDateTime(isoValue) {
  const date = new Date(isoValue);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function getStatusClass(status) {
  if (status === "delivered") return "status-delivered";
  if (status === "cancelled") return "status-cancelled";
  if (status === "delivering") return "status-delivering";
  return "status-pending";
}

function getStatusLabel(status) {
  if (status === "delivered") return "Delivered";
  if (status === "cancelled") return "Cancelled";
  if (status === "delivering") return "Out for delivery";
  return "Order confirmed";
}

function getCustomerOrders() {
  if (!state.customer?.loginId) return [];
  return state.orders
    .filter((order) => order.customerLoginId === state.customer.loginId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getActiveOrderForCustomer() {
  return getCustomerOrders().find((order) => order.status !== "delivered" && order.status !== "cancelled") || null;
}

function updateAuthInfo() {
  if (state.customer) {
    authStatus.textContent = `Logged in as ${state.customer.name} (${state.customer.phone}) | ID: ${state.customer.loginId}`;
    deliveryName.textContent = state.customer.name;
    customerDashboardStatus.textContent = `${state.customer.name} (${state.customer.loginId}) order history shown below.`;
  } else {
    authStatus.textContent = "You are browsing as a guest.";
    deliveryName.textContent = "Guest Customer";
    customerDashboardStatus.textContent = "Login செய்து order history பார்க்கலாம்.";
  }
}

function renderProducts() {
  productGrid.innerHTML = state.products
    .map(
      (item) => `
      <article class="card">
        <img class="product-image" src="${item.image}" alt="${item.name}" onerror="this.src='./assets/paddy-field.png'" />
        <h4>${item.name}</h4>
        <p>Rs. ${item.price}</p>
        <button class="btn btn-primary" onclick="addToCart('${item.id}')">Add</button>
      </article>
    `
    )
    .join("");
}

function renderCart() {
  if (!state.cart.length) {
    cartItems.innerHTML = `<p class="small-text">No items added yet.</p>`;
    cartTotal.textContent = "Rs. 0";
    return;
  }

  cartItems.innerHTML = state.cart
    .map(
      (item) => `
      <div class="cart-item">
        <span>${item.name} x ${item.qty}</span>
        <div class="cart-item-actions">
          <span>Rs. ${item.price * item.qty}</span>
          <button class="cancel-btn" onclick="removeFromCart('${item.id}')" aria-label="Remove item">✖</button>
        </div>
      </div>
    `
    )
    .join("");

  const total = state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  cartTotal.textContent = `Rs. ${total}`;
}

function renderCustomerOrders() {
  if (!state.customer?.loginId) {
    customerCurrentOrder.innerHTML = `<p class="small-text">Current order status காண login செய்யவும்.</p>`;
    customerOrderHistory.innerHTML = `<p class="small-text">No orders. Login செய்து order place பண்ணினால் history வரும்.</p>`;
    return;
  }

  const orders = getCustomerOrders();
  const activeOrder = getActiveOrderForCustomer();

  if (!activeOrder) {
    customerCurrentOrder.innerHTML = `<p class="small-text">No active orders right now.</p>`;
    deliveryStatus.textContent = "Waiting for order...";
  } else {
    const cancelButtonHTML = activeOrder.status !== "delivered" 
      ? `<div class="order-card-actions"><button class="btn btn-danger btn-sm" onclick="cancelOrder('${activeOrder.id}')">Cancel Order</button></div>`
      : '';
    customerCurrentOrder.innerHTML = `
      <div class="order-card">
        <p><strong>Order ID:</strong> ${activeOrder.id}</p>
        <p><strong>Status:</strong> <span class="status-pill ${getStatusClass(activeOrder.status)}">${getStatusLabel(activeOrder.status)}</span></p>
        <p><strong>Total:</strong> Rs. ${activeOrder.total}</p>
        <p><strong>Items:</strong> <span class="order-items">${activeOrder.items.map((item) => `${item.name} x ${item.qty}`).join(", ")}</span></p>
        <p><strong>Owner Contact:</strong> ${OWNER_CONTACT_NUMBER}</p>
        <p><strong>Placed:</strong> ${formatDateTime(activeOrder.createdAt)}</p>
        ${cancelButtonHTML}
      </div>
    `;
    deliveryStatus.textContent = `Order ${activeOrder.id} - ${getStatusLabel(activeOrder.status)}`;
  }

  if (!orders.length) {
    customerOrderHistory.innerHTML = `<p class="small-text">No orders yet.</p>`;
    return;
  }

  customerOrderHistory.innerHTML = orders
    .map(
      (order) => `
      <div class="order-card">
        <p><strong>${order.id}</strong> - <span class="status-pill ${getStatusClass(order.status)}">${getStatusLabel(order.status)}</span></p>
        <p><strong>Total:</strong> Rs. ${order.total}</p>
        <p><strong>Items:</strong> <span class="order-items">${order.items.map((item) => `${item.name} x ${item.qty}`).join(", ")}</span></p>
        <p><strong>Date:</strong> ${formatDateTime(order.createdAt)}</p>
      </div>
    `
    )
    .join("");
}

function renderOwnerOrders() {
  if (!state.ownerUnlocked) {
    ownerOrdersList.innerHTML = `<p class="small-text">Unlock owner access to view incoming orders.</p>`;
    return;
  }

  const sortedOrders = [...state.orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!sortedOrders.length) {
    ownerOrdersList.innerHTML = `<p class="small-text">No orders received yet.</p>`;
    return;
  }

  ownerOrdersList.innerHTML = sortedOrders
    .map((order) => {
      const locationText = order.location
        ? `${order.location.latitude.toFixed(5)}, ${order.location.longitude.toFixed(5)}`
        : "Not available";
      const locationMapLink = order.location
        ? `https://www.google.com/maps?q=${order.location.latitude},${order.location.longitude}`
        : "";

      return `
      <div class="order-card">
        <p><strong>${order.id}</strong> - <span class="status-pill ${getStatusClass(order.status)}">${getStatusLabel(order.status)}</span></p>
        <p><strong>Customer:</strong> ${order.customerName} (${order.customerLoginId})</p>
        <p><strong>Phone:</strong> ${order.customerPhone}</p>
        <p><strong>Location:</strong> ${locationText}</p>
        ${
          locationMapLink
            ? `<p><a href="${locationMapLink}" target="_blank" rel="noopener noreferrer">Open live location in map</a></p>
               <div class="owner-order-actions">
                 <button class="btn btn-outline btn-sm" onclick="showRouteInApp('${order.id}')">Show Route In App</button>
               </div>`
            : ""
        }
        <p><strong>Items:</strong> <span class="order-items">${order.items.map((item) => `${item.name} x ${item.qty}`).join(", ")}</span></p>
        <p><strong>Total:</strong> Rs. ${order.total}</p>
        <p><strong>Time:</strong> ${formatDateTime(order.createdAt)}</p>
        ${
          order.status !== "delivered"
            ? `<div class="owner-order-actions"><button class="btn btn-primary btn-sm" onclick="markOrderDelivered('${order.id}')">Mark Delivered</button></div>`
            : ""
        }
      </div>
    `;
    })
    .join("");
}

function addToCart(id) {
  const product = state.products.find((item) => item.id === id);
  const existing = state.cart.find((item) => item.id === id);
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({ ...product, qty: 1 });
  }
  renderCart();
}

function removeFromCart(id) {
  const existing = state.cart.find((item) => item.id === id);
  if (!existing) return;

  if (existing.qty > 1) {
    existing.qty -= 1;
  } else {
    state.cart = state.cart.filter((item) => item.id !== id);
  }
  renderCart();
}

function saveCustomerProfile() {
  const loginId = document.getElementById("customerLoginId").value.trim().toLowerCase();
  const name = document.getElementById("customerName").value.trim();
  const phone = document.getElementById("customerPhone").value.trim();

  if (!loginId || !name || !phone) {
    alert("Please enter login id, name and mobile number.");
    return;
  }

  state.customer = { loginId, name, phone };
  localStorage.setItem("cholasCustomer", JSON.stringify(state.customer));
  updateAuthInfo();
  renderCustomerOrders();
  authModal.classList.add("hidden");
}

function openAuthModal() {
  if (state.customer) {
    document.getElementById("customerLoginId").value = state.customer.loginId;
    document.getElementById("customerName").value = state.customer.name;
    document.getElementById("customerPhone").value = state.customer.phone;
  }
  authModal.classList.remove("hidden");
}

function closeAuthModal() {
  authModal.classList.add("hidden");
}

function openOwnerModal() {
  ownerModal.classList.remove("hidden");
}

function closeOwnerModal() {
  ownerModal.classList.add("hidden");
}

function unlockOwnerAccess() {
  const enteredLoginId = document.getElementById("ownerLoginId").value.trim().toLowerCase();
  const enteredPassword = document.getElementById("ownerPassword").value.trim();
  if (enteredLoginId !== OWNER_LOGIN_ID || enteredPassword !== OWNER_PASSWORD) {
    alert("Wrong owner login id or password.");
    return;
  }

  state.ownerUnlocked = true;
  ownerControls.classList.remove("hidden");
  openOwnerDashboardBtn.classList.remove("hidden");
  ownerDashboard.classList.remove("hidden");
  renderOwnerPrices();
  renderOwnerOrders();
}

function renderOwnerPrices() {
  ownerPriceList.innerHTML = state.products
    .map(
      (item) => `
      <div class="owner-price-row">
        <label for="owner-price-${item.id}">${item.name}</label>
        <input id="owner-price-${item.id}" type="number" min="1" value="${item.price}" />
      </div>
    `
    )
    .join("");
}

function saveOwnerPrices() {
  if (!state.ownerUnlocked) {
    alert("Unlock owner access first.");
    return;
  }

  state.products = state.products.map((item) => {
    const input = document.getElementById(`owner-price-${item.id}`);
    const newPrice = Number(input.value);
    return { ...item, price: Number.isFinite(newPrice) && newPrice > 0 ? newPrice : item.price };
  });

  localStorage.setItem("cholasProducts", JSON.stringify(state.products));
  renderProducts();
  renderCart();
  alert("Prices updated successfully.");
}

function generateOneDaySalesPdf() {
  if (!state.ownerUnlocked) {
    alert("Unlock owner access first.");
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("PDF library not loaded.");
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const todaySales = state.orders.filter((order) => order.createdAt.slice(0, 10) === today);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  let y = 20;

  pdf.setFontSize(16);
  pdf.text("GS CHOLAS DIARY - One Day Sales Report", 14, y);
  y += 10;
  pdf.setFontSize(11);
  pdf.text(`Date: ${today}`, 14, y);
  y += 8;

  if (!todaySales.length) {
    pdf.text("No sales orders for today.", 14, y);
  } else {
    let grandTotal = 0;
    todaySales.forEach((sale, idx) => {
      const itemsText = sale.items.map((it) => `${it.name} x ${it.qty}`).join(", ");
      grandTotal += sale.total;
      pdf.text(`${idx + 1}. ${sale.customerName} (${sale.customerLoginId}) - Rs. ${sale.total}`, 14, y);
      y += 6;
      pdf.text(`   ${itemsText}`, 14, y);
      y += 8;

      if (y > 270) {
        pdf.addPage();
        y = 20;
      }
    });
    pdf.setFontSize(12);
    pdf.text(`Total Sales: Rs. ${grandTotal}`, 14, y + 6);
  }

  pdf.save(`gsg-one-day-sales-${today}.pdf`);
}

function startLocationShare() {
  if (!navigator.geolocation) {
    alert("Geolocation not supported on this device/browser.");
    return;
  }

  if (state.locationWatcher !== null) {
    alert("Live location is already sharing.");
    return;
  }

  locationStatus.textContent = "Requesting location access...";
  state.locationWatcher = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      state.lastLocation = { latitude, longitude };
      localStorage.setItem("cholasLocation", JSON.stringify(state.lastLocation));

      locationMarker.setLatLng([latitude, longitude]);
      map.setView([latitude, longitude], 15);
      locationMarker.bindPopup(`Customer Live Location: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`).openPopup();
      locationStatus.textContent = `Live location active: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

      const activeOrder = getActiveOrderForCustomer();
      if (activeOrder) {
        activeOrder.location = { ...state.lastLocation };
        saveOrders();
        renderOwnerOrders();
      }

      if (!orderConfirmModal.classList.contains("hidden")) {
        orderConfirmLocationStatus.textContent = `Location shared: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      }
    },
    (error) => {
      locationStatus.textContent = `Location error: ${error.message}`;
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  );
}

function openOrderConfirmModal() {
  if (!state.customer?.loginId) {
    alert("Please login/register with login id before placing order.");
    return;
  }

  if (!state.cart.length) {
    alert("Please add products to cart.");
    return;
  }

  const total = state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  orderConfirmItems.innerHTML = state.cart
    .map(
      (item) => `
        <div class="order-confirm-row">
          <span>${item.name} x ${item.qty}</span>
          <span>Rs. ${item.price * item.qty}</span>
        </div>
      `
    )
    .join("");
  orderConfirmTotal.textContent = `Rs. ${total}`;
  orderConfirmLocationStatus.textContent = state.lastLocation
    ? `Location shared: ${state.lastLocation.latitude.toFixed(5)}, ${state.lastLocation.longitude.toFixed(5)}`
    : "Location not shared yet. Please tap Share Location.";
  orderConfirmModal.classList.remove("hidden");
}

function closeOrderConfirmModal() {
  orderConfirmModal.classList.add("hidden");
}

function confirmOrderFromModal() {
  if (!state.lastLocation) {
    alert("Please share live location before confirming order.");
    return;
  }

  const total = state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const nowIso = new Date().toISOString();
  const order = {
    id: `ORD-${Date.now().toString().slice(-6)}`,
    createdAt: nowIso,
    customerLoginId: state.customer.loginId,
    customerName: state.customer.name,
    customerPhone: state.customer.phone,
    location: { ...state.lastLocation },
    items: state.cart.map((item) => ({ id: item.id, name: item.name, qty: item.qty, price: item.price })),
    total,
    status: "delivering",
    deliveredAt: null,
  };

  state.orders.push(order);
  saveOrders();

  deliveryStatus.textContent = `Order ${order.id} confirmed. Delivery partner heading to live location.`;
  alert(
    `Order placed successfully!\nOrder ID: ${order.id}\nTotal: Rs. ${total}\nOwner Contact: ${OWNER_CONTACT_NUMBER}`
  );
  state.cart = [];
  closeOrderConfirmModal();
  renderCart();
  renderCustomerOrders();
  renderOwnerOrders();
}

function markOrderDelivered(orderId) {
  const order = state.orders.find((entry) => entry.id === orderId);
  if (!order) return;
  const confirmed = window.confirm(`Close order ${order.id} as delivered?`);
  if (!confirmed) {
    return;
  }

  order.status = "delivered";
  order.deliveredAt = new Date().toISOString();
  saveOrders();
  renderOwnerOrders();
  renderCustomerOrders();

  if (state.customer?.loginId === order.customerLoginId) {
    deliveryStatus.textContent = `Order ${order.id} delivered successfully.`;
  }
}

function cancelOrder(orderId) {
  const order = state.orders.find((entry) => entry.id === orderId);
  if (!order) return;
  
  if (order.status === "delivered") {
    alert("Cannot cancel a delivered order.");
    return;
  }
  
  const confirmed = window.confirm(`Cancel order ${order.id}? This action cannot be undone.`);
  if (!confirmed) {
    return;
  }

  order.status = "cancelled";
  order.cancelledAt = new Date().toISOString();
  saveOrders();
  renderOwnerOrders();
  renderCustomerOrders();
  
  alert(`Order ${order.id} has been cancelled.`);
  deliveryStatus.textContent = `Order ${order.id} cancelled.`;
}

function showRouteInApp(orderId) {
  const order = state.orders.find((entry) => entry.id === orderId);
  if (!order?.location) {
    alert("Customer location not available for this order.");
    return;
  }

  const from = [OWNER_BASE_LOCATION.latitude, OWNER_BASE_LOCATION.longitude];
  const to = [order.location.latitude, order.location.longitude];

  if (window.ownerRouteLine) {
    map.removeLayer(window.ownerRouteLine);
  }

  window.ownerRouteLine = L.polyline([from, to], {
    color: "#1e90ff",
    weight: 5,
    opacity: 0.85,
    dashArray: "8, 8",
  }).addTo(map);

  L.marker(from).addTo(map).bindPopup("Owner Start Point").openPopup();
  map.fitBounds(window.ownerRouteLine.getBounds(), { padding: [20, 20] });
}

if (state.lastLocation) {
  locationMarker.setLatLng([state.lastLocation.latitude, state.lastLocation.longitude]);
  map.setView([state.lastLocation.latitude, state.lastLocation.longitude], 14);
  locationStatus.textContent = `Last known location: ${state.lastLocation.latitude.toFixed(5)}, ${state.lastLocation.longitude.toFixed(5)}`;
}

document.getElementById("openAuthModal").addEventListener("click", openAuthModal);
document.getElementById("closeModal").addEventListener("click", closeAuthModal);
document.getElementById("saveCustomer").addEventListener("click", saveCustomerProfile);
document.getElementById("continueGuest").addEventListener("click", () => {
  state.customer = null;
  localStorage.removeItem("cholasCustomer");
  updateAuthInfo();
  renderCustomerOrders();
});
document.getElementById("shareLocation").addEventListener("click", startLocationShare);
document.getElementById("placeOrder").addEventListener("click", openOrderConfirmModal);
document.getElementById("openOwnerMenu").addEventListener("click", openOwnerModal);
document.getElementById("closeOwnerModal").addEventListener("click", closeOwnerModal);
document.getElementById("unlockOwner").addEventListener("click", unlockOwnerAccess);
document.getElementById("savePrices").addEventListener("click", saveOwnerPrices);
document.getElementById("downloadSalesPdf").addEventListener("click", generateOneDaySalesPdf);
document.getElementById("orderShareLocationBtn").addEventListener("click", startLocationShare);
document.getElementById("orderFinalConfirmBtn").addEventListener("click", confirmOrderFromModal);
document.getElementById("orderConfirmCloseBtn").addEventListener("click", closeOrderConfirmModal);
openOwnerDashboardBtn.addEventListener("click", () => {
  ownerDashboard.classList.remove("hidden");
  ownerModal.classList.add("hidden");
});

window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.markOrderDelivered = markOrderDelivered;
window.cancelOrder = cancelOrder;
window.showRouteInApp = showRouteInApp;

renderProducts();
renderCart();
updateAuthInfo();
renderCustomerOrders();
renderOwnerOrders();
