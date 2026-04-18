const products = [
  { id: "a1-milk", name: "A1 பால் / A1 Milk (1L)", price: 65, image: "assets/a1-milk.png" },
  { id: "a2-milk", name: "A2 பால் / A2 Milk (1L)", price: 85, image: "assets/a2-milk.png" },
  { id: "ghee", name: "நெய் / Ghee (500ml)", price: 420, image: "assets/ghee.png" },
  { id: "butter", name: "வெண்ணெய் / Butter (200g)", price: 120, image: "assets/butter.png" },
];

const OWNER_LOGIN_ID = "gsowner";
const OWNER_PASSWORD = "gsg@owner";
let OWNER_CONTACT_NUMBER = localStorage.getItem("cholasOwnerContact") || "+91 90000 12345";
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
  if (status === "completed") return "status-completed";
  if (status === "delivered") return "status-delivered";
  if (status === "cancelled") return "status-cancelled";
  if (status === "accepted") return "status-accepted";
  if (status === "delivering") return "status-delivering";
  return "status-pending";
}

function getStatusLabel(status) {
  if (status === "completed") return "Order Completed";
  if (status === "delivered") return "Delivered";
  if (status === "cancelled") return "Cancelled";
  if (status === "accepted") return "Order Accepted";
  if (status === "delivering") return "Out for delivery";
  return "Order Placed";
}

function getCustomerOrders() {
  if (!state.customer?.loginId) return [];
  return state.orders
    .filter((order) => order.customerLoginId === state.customer.loginId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getActiveOrderForCustomer() {
  return getCustomerOrders().find((order) => !["delivered", "cancelled", "completed"].includes(order.status)) || null;
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
        <img class="product-image" src="${item.image}" alt="${item.name}" loading="lazy" onerror="this.src='assets/paddy-field.png'; this.style.border='2px solid red';" />
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
          order.status !== "delivered" && order.status !== "completed" && order.status !== "cancelled"
            ? `<div class="owner-order-actions">
                 ${order.status === "pending" ? `<button class="btn btn-success btn-sm" onclick="acceptOrder('${order.id}')">Accept Order</button>` : ''}
                 ${["accepted", "delivering"].includes(order.status) ? `<button class="btn btn-primary btn-sm" onclick="completeOrder('${order.id}')">Mark Completed</button>` : ''}
                 ${order.status === "accepted" ? `<button class="btn btn-outline btn-sm" onclick="startDelivery('${order.id}')">Start Delivery</button>` : ''}
                 <button class="btn btn-outline btn-sm" onclick="confirmOrder('${order.id}')">Order Confirmed</button>
               </div>`
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

  // Validate phone number (should be digits, at least 10 chars, max 15)
  if (!/^\d{10,15}$/.test(phone.replace(/[-\s]/g, ''))) {
    alert("Please enter a valid mobile number (10-15 digits).");
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
  // Set owner mobile number
  const ownerMobileInput = document.getElementById("ownerMobileNumber");
  if (ownerMobileInput) {
    ownerMobileInput.value = OWNER_CONTACT_NUMBER;
  }
  
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

function saveOwnerSettings() {
  if (!state.ownerUnlocked) {
    alert("Unlock owner access first.");
    return;
  }

  // Save owner mobile number
  const ownerMobileInput = document.getElementById("ownerMobileNumber");
  if (ownerMobileInput) {
    const newMobile = ownerMobileInput.value.trim();
    if (newMobile) {
      OWNER_CONTACT_NUMBER = newMobile;
      localStorage.setItem("cholasOwnerContact", OWNER_CONTACT_NUMBER);
    }
  }

  // Save product prices
  state.products = state.products.map((item) => {
    const input = document.getElementById(`owner-price-${item.id}`);
    const newPrice = Number(input.value);
    return { ...item, price: Number.isFinite(newPrice) && newPrice > 0 ? newPrice : item.price };
  });

  localStorage.setItem("cholasProducts", JSON.stringify(state.products));
  renderProducts();
  renderCart();
  alert("Owner settings updated successfully.");
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
  pdf.text("GS CHOLAS DAIRY - One Day Sales Report", 14, y);
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

function stopLocationShare() {
  if (state.locationWatcher !== null) {
    navigator.geolocation.clearWatch(state.locationWatcher);
    state.locationWatcher = null;
    locationStatus.textContent = "Location sharing stopped.";
  }
}

function startLocationShare() {
  // Wrapper function for the hero section Share Location button
  startLocationShareForOrder();
}

function startLocationShareForOrder() {
  if (!navigator.geolocation) {
    orderConfirmLocationStatus.textContent = "Location not supported on this device.";
    return;
  }

  if (state.locationWatcher !== null) {
    // Location already being shared, just update the modal
    if (state.lastLocation) {
      orderConfirmLocationStatus.textContent = `Location shared: ${state.lastLocation.latitude.toFixed(5)}, ${state.lastLocation.longitude.toFixed(5)}`;
      document.getElementById("orderFinalConfirmBtn").disabled = false;
    }
    return;
  }

  orderConfirmLocationStatus.textContent = "Requesting location access...";
  
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

      // Update modal status and enable confirm button
      if (!orderConfirmModal.classList.contains("hidden")) {
        orderConfirmLocationStatus.textContent = `Location shared: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        document.getElementById("orderFinalConfirmBtn").disabled = false;
      }
    },
    (error) => {
      locationStatus.textContent = `Location error: ${error.message}`;
      if (!orderConfirmModal.classList.contains("hidden")) {
        orderConfirmLocationStatus.textContent = `Location error: ${error.message}`;
      }
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
  
  // Pre-fill mobile number from customer profile
  const phoneInput = document.getElementById("orderCustomerPhone");
  phoneInput.value = state.customer.phone || "";
  
  // Reset location status and disable confirm button
  orderConfirmLocationStatus.textContent = "Getting your location...";
  const confirmBtn = document.getElementById("orderFinalConfirmBtn");
  confirmBtn.disabled = true;
  confirmBtn.textContent = "Confirm Order";
  
  orderConfirmModal.classList.remove("hidden");
  
  // Automatically start location sharing
  startLocationShareForOrder();
}

function closeOrderConfirmModal() {
  orderConfirmModal.classList.add("hidden");
}

function confirmOrderFromModal() {
  if (!state.lastLocation) {
    alert("Please share live location before confirming order.");
    return;
  }

  const phoneInput = document.getElementById("orderCustomerPhone");
  const customerPhone = phoneInput.value.trim();
  
  if (!customerPhone) {
    alert("Please enter your mobile number for delivery updates.");
    return;
  }

  // Validate phone number (should be digits, at least 10 chars, max 15)
  if (!/^\d{10,15}$/.test(customerPhone.replace(/[-\s]/g, ''))) {
    alert("Please enter a valid mobile number (10-15 digits).");
    return;
  }

  const total = state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const nowIso = new Date().toISOString();
  const order = {
    id: `ORD-${Date.now().toString().slice(-6)}`,
    createdAt: nowIso,
    customerLoginId: state.customer.loginId,
    customerName: state.customer.name,
    customerPhone: customerPhone,
    location: { ...state.lastLocation },
    items: state.cart.map((item) => ({ id: item.id, name: item.name, qty: item.qty, price: item.price })),
    total,
    status: "pending", // Changed from "delivering" to "pending"
    deliveredAt: null,
    acceptedAt: null,
    completedAt: null,
  };

  state.orders.push(order);
  saveOrders();

  // Update customer profile with new phone number
  if (customerPhone !== state.customer.phone) {
    state.customer.phone = customerPhone;
    localStorage.setItem("cholasCustomer", JSON.stringify(state.customer));
    updateAuthInfo();
  }

  deliveryStatus.textContent = `Order ${order.id} placed successfully. Waiting for owner confirmation.`;
  
  // Show success message with tick mark
  const confirmBtn = document.getElementById("orderFinalConfirmBtn");
  const originalText = confirmBtn.textContent;
  confirmBtn.innerHTML = '✅ DONE';
  confirmBtn.style.background = '#16a34a';
  confirmBtn.disabled = true;
  
  // Auto close modal after 2 seconds
  setTimeout(() => {
    closeOrderConfirmModal();
    // Reset button after modal closes
    setTimeout(() => {
      confirmBtn.innerHTML = originalText;
      confirmBtn.style.background = '';
      confirmBtn.disabled = false;
    }, 500);
  }, 2000);
  
  // Customer notification for order placement
  showCustomerNotification(`Order placed successfully!\nOrder ID: ${order.id}\nTotal: Rs. ${total}\nStatus: Waiting for confirmation\n\nOwner will contact you at ${OWNER_CONTACT_NUMBER} once order is accepted.`);
  
  // Show notification to owner (in a real app, this would send SMS/email)
  showOwnerNotification(`New order received: ${order.id} from ${order.customerName}`);
  
  state.cart = [];
  renderCart();
  renderCustomerOrders();
  renderOwnerOrders();
}

function confirmOrder(orderId) {
  const order = state.orders.find((entry) => entry.id === orderId);
  if (!order) return;
  
  alert(`Order ${order.id} confirmed! Customer ${order.customerName} has been notified.`);
  // In real app, this would send confirmation SMS to customer
  showCustomerNotification(`Your order ${order.id} has been confirmed!\nWe will start preparing your order.`);
}

function generateSalesReport() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("PDF library not loaded. Please refresh the page.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  // Get today's date
  const today = new Date();
  const dateStr = today.toLocaleDateString();
  
  // Filter today's orders
  const todayOrders = state.orders.filter(order => {
    const orderDate = new Date(order.createdAt).toLocaleDateString();
    return orderDate === dateStr;
  });
  
  // Calculate total sales
  const totalSales = todayOrders.reduce((sum, order) => sum + order.total, 0);
  
  // PDF Header
  doc.setFontSize(20);
  doc.text("GS Cholas Dairy - Daily Sales Report", 20, 30);
  
  doc.setFontSize(12);
  doc.text(`Date: ${dateStr}`, 20, 45);
  doc.text(`Owner Mobile: ${OWNER_CONTACT_NUMBER}`, 20, 55);
  doc.text(`Total Orders: ${todayOrders.length}`, 20, 65);
  doc.text(`Total Sales: Rs. ${totalSales}`, 20, 75);
  
  // Table Header
  doc.setFontSize(14);
  doc.text("Order Details:", 20, 90);
  
  // Table
  const tableStartY = 100;
  const rowHeight = 10;
  
  // Headers
  doc.setFontSize(10);
  doc.text("Order ID", 20, tableStartY);
  doc.text("Time", 60, tableStartY);
  doc.text("Customer", 100, tableStartY);
  doc.text("Items", 140, tableStartY);
  doc.text("Amount", 180, tableStartY);
  
  // Draw header line
  doc.line(20, tableStartY + 2, 190, tableStartY + 2);
  
  // Orders data
  let currentY = tableStartY + rowHeight;
  todayOrders.forEach(order => {
    const time = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const itemsText = order.items.map(item => `${item.name} x${item.qty}`).join(', ');
    
    doc.text(order.id, 20, currentY);
    doc.text(time, 60, currentY);
    doc.text(order.customerName.substring(0, 12), 100, currentY);
    doc.text(itemsText.substring(0, 25), 140, currentY);
    doc.text(`Rs. ${order.total}`, 180, currentY);
    
    currentY += rowHeight;
    
    // Add new page if needed
    if (currentY > 270) {
      doc.addPage();
      currentY = 30;
    }
  });
  
  // Footer
  doc.setFontSize(8);
  doc.text("Generated by GS Cholas Dairy Management System", 20, 280);
  
  // Save PDF
  doc.save(`GS_Cholas_Dairy_Sales_${dateStr.replace(/\//g, '-')}.pdf`);
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

function showOwnerNotification(message) {
  // In a real app, this would send SMS/email to owner
  // For now, we'll show a browser notification if permitted
  if (Notification.permission === "granted") {
    new Notification("GS Cholas Dairy - New Order", {
      body: message,
      icon: "assets/milk-brand.png"
    });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(function (permission) {
      if (permission === "granted") {
        new Notification("GS Cholas Dairy - New Order", {
          body: message,
          icon: "assets/milk-brand.png"
        });
      }
    });
  }
  
  // Also show in console for debugging
  console.log("Owner Notification:", message);
}

function showCustomerNotification(message) {
  // In a real app, this would send SMS/email to customer
  // For now, we'll show a browser notification if permitted
  if (Notification.permission === "granted") {
    new Notification("GS Cholas Dairy - Order Update", {
      body: message,
      icon: "assets/milk-brand.png"
    });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(function (permission) {
      if (permission === "granted") {
        new Notification("GS Cholas Dairy - Order Update", {
          body: message,
          icon: "assets/milk-brand.png"
        });
      }
    });
  }
  
  // Also show in console for debugging
  console.log("Customer Notification:", message);
}

function acceptOrder(orderId) {
  const order = state.orders.find((entry) => entry.id === orderId);
  if (!order) return;
  
  if (order.status !== "pending") {
    alert("Order is not in pending status.");
    return;
  }
  
  const confirmed = window.confirm(`Accept order ${order.id} from ${order.customerName}?`);
  if (!confirmed) {
    return;
  }

  order.status = "accepted";
  order.acceptedAt = new Date().toISOString();
  saveOrders();
  renderOwnerOrders();
  renderCustomerOrders();
  
  // Send SMS to customer (in real app)
  alert(`Order ${order.id} accepted!\nCustomer ${order.customerName} will be notified at ${order.customerPhone}\n\nMessage: "Your order ${order.id} is accepted. Owner contact: ${OWNER_CONTACT_NUMBER}"`);
  
  // Customer notification for order acceptance
  showCustomerNotification(`Your order ${order.id} has been accepted!\nOwner contact: ${OWNER_CONTACT_NUMBER}\n\nDelivery will start soon.`);
  
  if (state.customer?.loginId === order.customerLoginId) {
    deliveryStatus.textContent = `Order ${order.id} accepted by owner. Contact: ${OWNER_CONTACT_NUMBER}`;
  }
}

function completeOrder(orderId) {
  const order = state.orders.find((entry) => entry.id === orderId);
  if (!order) return;
  
  if (!["accepted", "delivering"].includes(order.status)) {
    alert("Order must be accepted or out for delivery to mark as completed.");
    return;
  }
  
  const confirmed = window.confirm(`Mark order ${order.id} as completed?`);
  if (!confirmed) {
    return;
  }

  order.status = "completed";
  order.completedAt = new Date().toISOString();
  saveOrders();
  renderOwnerOrders();
  renderCustomerOrders();
  
  alert(`Order ${order.id} marked as completed!`);
  
  // Customer notification for delivery completion
  showCustomerNotification(`Your order ${order.id} has been delivered successfully!\nThank you for choosing GS Cholas Dairy.`);
  
  if (state.customer?.loginId === order.customerLoginId) {
    deliveryStatus.textContent = `Order ${order.id} completed successfully!`;
  }
}

function startDelivery(orderId) {
  const order = state.orders.find((entry) => entry.id === orderId);
  if (!order) return;
  
  if (order.status !== "accepted") {
    alert("Order must be accepted first.");
    return;
  }
  
  order.status = "delivering";
  saveOrders();
  renderOwnerOrders();
  renderCustomerOrders();
  
  alert(`Delivery started for order ${order.id}!`);
  
  if (state.customer?.loginId === order.customerLoginId) {
    deliveryStatus.textContent = `Order ${order.id} is out for delivery!`;
  }
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
document.getElementById("saveOwnerSettings").addEventListener("click", saveOwnerSettings);
document.getElementById("downloadSalesPdf").addEventListener("click", generateOneDaySalesPdf);
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
window.acceptOrder = acceptOrder;
window.completeOrder = completeOrder;
window.confirmOrder = confirmOrder;
window.generateSalesReport = generateSalesReport;
window.startDelivery = startDelivery;
window.startLocationShare = startLocationShare;
window.stopLocationShare = stopLocationShare;
window.showRouteInApp = showRouteInApp;

renderProducts();
renderCart();
updateAuthInfo();
renderCustomerOrders();
renderOwnerOrders();
