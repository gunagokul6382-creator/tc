const products = [
  {
    id: "a1-milk",
    name: "A1 பால் / A1 Milk (1L)",
    price: 65,
    image: "./assets/a1-milk.png",
  },
  {
    id: "a2-milk",
    name: "A2 பால் / A2 Milk (1L)",
    price: 85,
    image: "./assets/a2-milk.png",
  },
  {
    id: "ghee",
    name: "நெய் / Ghee (500ml)",
    price: 420,
    image: "./assets/ghee.png",
  },
  {
    id: "butter",
    name: "வெண்ணெய் / Butter (200g)",
    price: 120,
    image: "./assets/butter.png",
  },
];

const OWNER_PASSWORD = "gsg@owner";

const savedProducts = JSON.parse(localStorage.getItem("cholasProducts")) || [];
const mergedProducts =
  savedProducts.length > 0
    ? products.map((defaultProduct) => {
        const saved = savedProducts.find((item) => item.id === defaultProduct.id);
        return saved
          ? {
              ...defaultProduct,
              price: saved.price ?? defaultProduct.price,
            }
          : defaultProduct;
      })
    : products;

const state = {
  cart: [],
  products: mergedProducts,
  customer: JSON.parse(localStorage.getItem("cholasCustomer")) || null,
  locationWatcher: null,
  lastLocation: JSON.parse(localStorage.getItem("cholasLocation")) || null,
  ownerUnlocked: false,
  salesHistory: JSON.parse(localStorage.getItem("cholasSalesHistory")) || [],
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

const map = L.map("map").setView([10.7867, 79.1378], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

let locationMarker = L.marker([10.7867, 79.1378]).addTo(map);
locationMarker.bindPopup("Delivery will track customer live location.");

function updateAuthInfo() {
  if (state.customer) {
    authStatus.textContent = `Logged in as ${state.customer.name} (${state.customer.phone})`;
    deliveryName.textContent = state.customer.name;
  } else {
    authStatus.textContent = "You are browsing as a guest.";
    deliveryName.textContent = "Guest Customer";
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
  if (!existing) {
    return;
  }

  if (existing.qty > 1) {
    existing.qty -= 1;
  } else {
    state.cart = state.cart.filter((item) => item.id !== id);
  }

  renderCart();
}

function saveCustomerProfile() {
  const name = document.getElementById("customerName").value.trim();
  const phone = document.getElementById("customerPhone").value.trim();

  if (!name || !phone) {
    alert("Please enter both name and mobile number.");
    return;
  }

  state.customer = { name, phone };
  localStorage.setItem("cholasCustomer", JSON.stringify(state.customer));
  updateAuthInfo();
  authModal.classList.add("hidden");
}

function openAuthModal() {
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
  const enteredPassword = document.getElementById("ownerPassword").value.trim();
  if (enteredPassword !== OWNER_PASSWORD) {
    alert("Wrong owner password.");
    return;
  }

  state.ownerUnlocked = true;
  ownerControls.classList.remove("hidden");
  renderOwnerPrices();
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
    return {
      ...item,
      price: Number.isFinite(newPrice) && newPrice > 0 ? newPrice : item.price,
    };
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
  const todaySales = state.salesHistory.filter((sale) => sale.orderDate === today);

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
      pdf.text(`${idx + 1}. ${sale.customerName} - Rs. ${sale.total}`, 14, y);
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
      deliveryStatus.textContent = "Customer location received. Delivery can start.";
    },
    (error) => {
      locationStatus.textContent = `Location error: ${error.message}`;
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  );
}

function placeOrder() {
  if (!state.cart.length) {
    alert("Please add products to cart.");
    return;
  }

  if (!state.lastLocation) {
    alert("Please share live location before placing order.");
    return;
  }

  const total = state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const customerLabel = state.customer ? state.customer.name : "Guest Customer";
  const orderDate = new Date().toISOString().slice(0, 10);

  state.salesHistory.push({
    orderDate,
    customerName: customerLabel,
    total,
    items: state.cart.map((item) => ({ name: item.name, qty: item.qty })),
  });
  localStorage.setItem("cholasSalesHistory", JSON.stringify(state.salesHistory));

  deliveryStatus.textContent = `Order confirmed for ${customerLabel}. Delivery partner heading to live location.`;
  alert(`Order placed successfully!\nCustomer: ${customerLabel}\nTotal: Rs. ${total}`);
  state.cart = [];
  renderCart();
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
});
document.getElementById("shareLocation").addEventListener("click", startLocationShare);
document.getElementById("placeOrder").addEventListener("click", placeOrder);
document.getElementById("openOwnerMenu").addEventListener("click", openOwnerModal);
document.getElementById("closeOwnerModal").addEventListener("click", closeOwnerModal);
document.getElementById("unlockOwner").addEventListener("click", unlockOwnerAccess);
document.getElementById("savePrices").addEventListener("click", saveOwnerPrices);
document.getElementById("downloadSalesPdf").addEventListener("click", generateOneDaySalesPdf);

window.addToCart = addToCart;
window.removeFromCart = removeFromCart;

renderProducts();
renderCart();
updateAuthInfo();
