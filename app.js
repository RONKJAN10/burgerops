import {
  db,
  doc,
  setDoc,
  getDoc,
  onSnapshot
} from "./firebase.js";

const BUSINESS_ID = "matarina";
const STORAGE_KEY = "burgerops-state-v2";
const SESSION_KEY = "burgerops-session-v1";

const blankState = {
  settings: {
    businessName: "MATARINA BURGER",
    logo: ""
  },
  users: [],
  ingredients: [],
  products: [],
  purchases: [],
  sales: [],
  expenses: [],
  shifts: []
};

let state = structuredClone(blankState);

let deferredInstallPrompt = null;

let currentUserId = localStorage.getItem(SESSION_KEY);

const views = {
  dashboard: "Dashboard",
  insumos: "Insumos",
  compras: "Compras",
  recetas: "Productos",
  ventas: "Ventas",
  caja: "Caja",
  gastos: "Gastos",
  reportes: "Reportes",
  usuarios: "Usuarios"
};

document.addEventListener("DOMContentLoaded", async () => {

  registerMobileApp();

  await loadState();

  listenRealtime();

  bindAuth();

  bindNavigation();

  bindForms();

  bootApp();

});

function listenRealtime() {

  onSnapshot(
    doc(db, "business", BUSINESS_ID),

    (snapshot) => {

      if (snapshot.exists()) {

        state = normalizeState(snapshot.data());

        renderAll();

      }

    },

    (error) => {

      console.error("Realtime error:", error);

    }
  );
}

window.addEventListener("beforeinstallprompt", (event) => {

  event.preventDefault();

  deferredInstallPrompt = event;

  document.getElementById("installApp")?.removeAttribute("hidden");

});

window.addEventListener("appinstalled", () => {

  deferredInstallPrompt = null;

  document.getElementById("installApp")?.setAttribute("hidden", "");

  showToast("MATARINA BURGER instalado correctamente.");

});

function registerMobileApp() {

  if ("serviceWorker" in navigator) {

    navigator.serviceWorker.register("./sw.js")
      .catch(() => {

        showToast("Modo offline no disponible.");

      });

  }

}

function bindNavigation() {

  document.querySelectorAll(".nav-item").forEach((button) => {

    button.addEventListener("click", () => {

      showView(button.dataset.view);

    });

  });

  document.getElementById("quickSale")
    ?.addEventListener("click", () => {

      showView("ventas");

    });

  document.getElementById("installApp")
    ?.addEventListener("click", async () => {

      if (!deferredInstallPrompt) {

        showToast("Usa el menú del navegador y elige instalar.");

        return;

      }

      deferredInstallPrompt.prompt();

      await deferredInstallPrompt.userChoice;

      deferredInstallPrompt = null;

      document.getElementById("installApp")
        ?.setAttribute("hidden", "");

    });

  document.getElementById("logoutButton")
    ?.addEventListener("click", async () => {

      localStorage.removeItem(SESSION_KEY);

      currentUserId = null;

      await loadState();

      bootApp();

      showToast("Sesión cerrada.");

    });

}

function bindAuth() {

  document.getElementById("setupForm")
    ?.addEventListener("submit", async (event) => {

      event.preventDefault();

      const form = event.currentTarget;

      const data = Object.fromEntries(new FormData(form));

      const user = {
        id: makeId("usr"),
        name: data.name.trim(),
        role: "admin",
        pin: data.pin.trim(),
        active: true
      };

      state.users.push(user);

      await saveState();

      loginAs(user.id);

      form.reset();

      showToast("Administrador creado.");

    });

  document.getElementById("loginForm")
    ?.addEventListener("submit", (event) => {

      event.preventDefault();

      const form = event.currentTarget;

      const data = Object.fromEntries(new FormData(form));

      const user = state.users.find(
        (item) =>
          item.id === data.userId &&
          item.active
      );

      if (!user || user.pin !== data.pin.trim()) {

        showToast("Usuario o PIN incorrecto.");

        return;

      }

      loginAs(user.id);

      form.reset();

    });

}

function bindForms() {

  document.getElementById("ingredientForm")
    ?.addEventListener("submit", async (event) => {

      event.preventDefault();

      const form = event.currentTarget;

      const data = Object.fromEntries(new FormData(form));

      state.ingredients.push({
        id: makeId("ing"),
        name: data.name.trim(),
        unit: data.unit,
        stock: Number(data.stock),
        minStock: Number(data.minStock),
        cost: Number(data.cost)
      });

      form.reset();

      await persistAndRender("Insumo registrado.");

    });

  document.getElementById("recipeForm")
    ?.addEventListener("submit", async (event) => {

      event.preventDefault();

      const form = event.currentTarget;

      const data = Object.fromEntries(new FormData(form));

      state.products.push({
        id: makeId("prod"),
        name: data.name.trim(),
        price: Number(data.price)
      });

      form.reset();

      await persistAndRender("Producto guardado.");

    });

  document.getElementById("saleForm")
    ?.addEventListener("submit", async (event) => {

      event.preventDefault();

      const form = event.currentTarget;

      const data = Object.fromEntries(new FormData(form));

      const product = findProduct(data.productId);

      if (!product) {

        showToast("Producto no encontrado.");

        return;

      }

      const quantity = Number(data.quantity || 1);

      const total = product.price * quantity;

      const amountReceived = Number(data.amountReceived || 0);

      state.sales.unshift({
        id: makeId("sale"),
        date: todayISO(),
        productId: product.id,
        quantity,
        channel: data.channel,
        total,
        amountReceived,
        changeDue: Math.max(0, amountReceived - total),
        userId: currentUserId
      });

      form.reset();

      await persistAndRender("Venta registrada.");

    });

  document.getElementById("expenseForm")
    ?.addEventListener("submit", async (event) => {

      event.preventDefault();

      const form = event.currentTarget;

      const data = Object.fromEntries(new FormData(form));

      state.expenses.unshift({
        id: makeId("exp"),
        date: todayISO(),
        concept: data.concept.trim(),
        category: data.category,
        amount: Number(data.amount),
        userId: currentUserId
      });

      form.reset();

      await persistAndRender("Gasto registrado.");

    });

}

function bootApp() {

  state = normalizeState(state);

  const hasUsers = state.users.length > 0;

  const currentUser = getCurrentUser();

  document.getElementById("setupForm").hidden = hasUsers;

  document.getElementById("loginForm").hidden = !hasUsers;

  document.getElementById("authScreen")
    ?.classList.toggle("hidden", Boolean(currentUser));

  document.querySelector(".app-shell")
    ?.classList.toggle("locked", !currentUser);

  renderLoginUsers();

  if (currentUser) {

    renderAll();

  }

}

function loginAs(userId) {

  currentUserId = userId;

  localStorage.setItem(SESSION_KEY, userId);

  bootApp();

}

async function loadState() {

  try {

    const ref = doc(db, "business", BUSINESS_ID);

    const snap = await getDoc(ref);

    if (snap.exists()) {

      state = normalizeState(snap.data());

    } else {

      state = structuredClone(blankState);

      await saveState();

    }

    renderAll();

  } catch (error) {

    console.error(error);

    showToast("Error cargando datos.");

  }

}

async function saveState() {

  try {

    const ref = doc(db, "business", BUSINESS_ID);

    await setDoc(ref, normalizeState(state));

  } catch (error) {

    console.error(error);

    showToast("Error guardando datos.");

  }

}

async function persistAndRender(message) {

  await saveState();

  renderAll();

  showToast(message);

}

function renderAll() {

  renderBrand();

  renderSelectors();

  renderProducts();

  renderSales();

  renderExpenses();

  renderUsers();

}

function renderBrand() {

  const name =
    state.settings.businessName ||
    "MATARINA BURGER";

  document.title = name;

}

function renderSelectors() {

  const productOptions = state.products
    .map((product) => `
      <option value="${product.id}">
        ${product.name}
      </option>
    `)
    .join("");

  const saleProduct =
    document.getElementById("saleProduct");

  if (saleProduct) {

    saleProduct.innerHTML =
      productOptions ||
      `<option value="">Sin productos</option>`;

  }

}

function renderProducts() {

  const container =
    document.getElementById("productsList");

  if (!container) return;

  container.innerHTML = state.products
    .map((product) => `
      <div class="product-card">
        <strong>${escapeHTML(product.name)}</strong>
        <span>${money(product.price)}</span>
      </div>
    `)
    .join("");

}

function renderSales() {

  const table =
    document.getElementById("salesTable");

  if (!table) return;

  table.innerHTML = state.sales
    .map((sale) => {

      const product =
        findProduct(sale.productId);

      return `
        <tr>
          <td>${formatDate(sale.date)}</td>
          <td>${escapeHTML(product?.name || "")}</td>
          <td>${sale.quantity}</td>
          <td>${money(sale.total)}</td>
        </tr>
      `;

    })
    .join("");

}

function renderExpenses() {

  const table =
    document.getElementById("expensesTable");

  if (!table) return;

  table.innerHTML = state.expenses
    .map((expense) => `
      <tr>
        <td>${formatDate(expense.date)}</td>
        <td>${escapeHTML(expense.concept)}</td>
        <td>${money(expense.amount)}</td>
      </tr>
    `)
    .join("");

}

function renderUsers() {

  const table =
    document.getElementById("usersTable");

  if (!table) return;

  table.innerHTML = state.users
    .map((user) => `
      <tr>
        <td>${escapeHTML(user.name)}</td>
        <td>${escapeHTML(user.role)}</td>
      </tr>
    `)
    .join("");

}

function renderLoginUsers() {

  const select =
    document.getElementById("loginUser");

  if (!select) return;

  select.innerHTML = state.users
    .filter((user) => user.active)
    .map((user) => `
      <option value="${user.id}">
        ${escapeHTML(user.name)}
      </option>
    `)
    .join("");

}

function normalizeState(value) {

  return {

    settings: {
      businessName:
        value?.settings?.businessName ||
        "MATARINA BURGER",

      logo:
        value?.settings?.logo || ""
    },

    users:
      Array.isArray(value?.users)
        ? value.users
        : [],

    ingredients:
      Array.isArray(value?.ingredients)
        ? value.ingredients
        : [],

    products:
      Array.isArray(value?.products)
        ? value.products
        : [],

    purchases:
      Array.isArray(value?.purchases)
        ? value.purchases
        : [],

    sales:
      Array.isArray(value?.sales)
        ? value.sales
        : [],

    expenses:
      Array.isArray(value?.expenses)
        ? value.expenses
        : [],

    shifts:
      Array.isArray(value?.shifts)
        ? value.shifts
        : []

  };

}

function getCurrentUser() {

  return state.users.find(
    (user) =>
      user.id === currentUserId &&
      user.active
  );

}

function findProduct(id) {

  return state.products.find(
    (product) =>
      product.id === id
  );

}

function money(value) {

  return new Intl.NumberFormat(
    "es-PE",
    {
      style: "currency",
      currency: "PEN"
    }
  ).format(Number(value || 0));

}

function makeId(prefix) {

  if (window.crypto?.randomUUID) {

    return `${prefix}-${window.crypto.randomUUID()}`;

  }

  return `${prefix}-${Date.now()}`;

}

function todayISO() {

  return new Date()
    .toISOString()
    .slice(0, 10);

}

function formatDate(value) {

  return new Date(`${value}T00:00:00`)
    .toLocaleDateString("es-PE");

}

function escapeHTML(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}

function showView(viewName) {

  document.querySelectorAll(".view")
    .forEach((view) => {

      view.classList.remove("active");

    });

  document.getElementById(viewName)
    ?.classList.add("active");

}

function showToast(message) {

  const toast =
    document.getElementById("toast");

  if (!toast) return;

  toast.textContent = message;

  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {

    toast.classList.remove("show");

  }, 2500);

}
