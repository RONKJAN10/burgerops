const STORAGE_KEY = "matarina-burger-state-v1";
const SESSION_KEY = "burgerops-session-v1";
const SUPABASE_CONFIG_KEY = "matarina-burger-supabase-v1";
const CLOUD_ROW_ID = "matarina-burger";

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
let isSyncingCloud = false;

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

window.addEventListener("DOMContentLoaded", () => {

  registerMobileApp();

  bindAuth();

  bindNavigation();

  bindForms();

  loadState();

  bootApp();

});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  document.getElementById("installApp")?.removeAttribute("hidden");
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  document.getElementById("installApp")?.setAttribute("hidden", "");
  showToast("MATARINA BURGER instalado en tu celular.");
});

function registerMobileApp() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      showToast("Modo offline no disponible en este navegador.");
    });
  }
}

function bindNavigation() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  document.getElementById("quickSale").addEventListener("click", () => showView("ventas"));
  document.getElementById("installApp").addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      showToast("Usa el menu del navegador y elige Agregar a pantalla de inicio.");
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById("installApp").setAttribute("hidden", "");
  });
  document.getElementById("logoutButton").addEventListener("click", () => {
    localStorage.removeItem(SESSION_KEY);
    currentUserId = null;
    bootApp();
  });
  document.getElementById("clearBusinessData").addEventListener("click", () => {
    const confirmed = window.confirm("Esto borrara insumos, compras, productos, ventas, caja y gastos. Los usuarios y el logo se conservaran. Deseas continuar?");
    if (!confirmed) {
      return;
    }
    state.ingredients = [];
    state.products = [];
    state.purchases = [];
    state.sales = [];
    state.expenses = [];
    state.shifts = [];
    saveState();
    renderAll();
    showToast("Datos del negocio limpiados.");
  });
}

function bindAuth() {
  document.getElementById("setupForm").addEventListener("submit", async (event) => {
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
    saveState();
    loginAs(user.id);
    form.reset();
    showToast("Administrador creado.");
  });

  document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const user = state.users.find((item) => item.id === data.userId && item.active);
    if (!user || user.pin !== data.pin.trim()) {
      showToast("Usuario o PIN incorrecto.");
      return;
    }
    loginAs(user.id);
    form.reset();
  });

  document.getElementById("authSupabaseForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    saveSupabaseConfig(form.url.value, form.key.value);
    await pullFromSupabase({ statusId: "authCloudStatus" });
    form.reset();
    bootApp();
  });
}

function bootApp() {
  state = normalizeState(state);
  const hasUsers = state.users.length > 0;
  const currentUser = getCurrentUser();
  document.getElementById("setupForm").hidden = hasUsers;
  document.getElementById("loginForm").hidden = !hasUsers;
  document.getElementById("authScreen").classList.toggle("hidden", Boolean(currentUser));
  document.querySelector(".app-shell").classList.toggle("locked", !currentUser);
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

function bindForms() {
  document.getElementById("ingredientForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    state.ingredients.push({
      id: makeId("ing"),
      date: data.date || todayISO(),
      name: data.name.trim(),
      unit: data.unit,
      stock: Number(data.stock),
      minStock: Number(data.minStock),
      cost: Number(data.cost)
    });
    form.reset();
    persistAndRender("Insumo registrado.");
  });

  document.getElementById("purchaseForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const ingredient = findIngredient(data.ingredientId);
    if (!ingredient) {
      showToast("Primero registra un insumo.");
      return;
    }
    const quantity = Number(data.quantity);
    const total = Number(data.total || 0);
    ingredient.stock += quantity;
    ingredient.cost = total / quantity;
    state.purchases.unshift({
      id: makeId("pur"),
      date: data.date || todayISO(),
      supplier: data.supplier.trim(),
      ingredientId: data.ingredientId,
      quantity,
      total
    });
    form.reset();
    persistAndRender("Compra registrada y stock actualizado.");
  });

  document.getElementById("purchaseIngredient").addEventListener("change", updatePurchasePrice);
  document.getElementById("purchaseForm").quantity.addEventListener("input", updatePurchaseTotal);
  document.getElementById("purchaseForm").unitPrice.addEventListener("input", updatePurchaseTotal);

  document.getElementById("recipeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    state.products.push({
      id: makeId("prod"),
      date: data.date || todayISO(),
      name: data.name.trim(),
      price: Number(data.price),
      recipe: []
    });
    form.reset();
    persistAndRender("Producto guardado.");
  });

  document.getElementById("recipeLineForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const product = findProduct(data.productId);
    const ingredient = findIngredient(data.ingredientId);
    if (!product || !ingredient) {
      showToast("Registra productos e insumos antes de crear recetas.");
      return;
    }
    product.recipe = Array.isArray(product.recipe) ? product.recipe : [];
    const existing = product.recipe.find((line) => line.ingredientId === ingredient.id);
    if (existing) {
      existing.quantity = Number(data.quantity);
    } else {
      product.recipe.push({ ingredientId: ingredient.id, quantity: Number(data.quantity) });
    }
    form.reset();
    persistAndRender("Receta actualizada.");
  });

  document.getElementById("saleForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const product = findProduct(data.productId);
    if (!product) {
      showToast("Primero crea un producto.");
      return;
    }
    const activeShift = getActiveShift();
    if (!activeShift) {
      showToast("Abre caja antes de registrar ventas.");
      showView("caja");
      return;
    }
    const quantity = Number(data.quantity);
    const availability = checkRecipeAvailability(product, quantity);
    if (!availability.ok) {
      showToast(`Stock insuficiente: ${availability.name}.`);
      return;
    }
    const unitCost = productCost(product);
    consumeRecipe(product, quantity);
    const saleTotal = calculateSaleTotal();
    const amountReceived = Number(data.amountReceived || 0);
    state.sales.unshift({
      id: makeId("sale"),
      date: data.date || todayISO(),
      productId: product.id,
      quantity,
      channel: data.channel,
      total: saleTotal,
      cost: unitCost * quantity,
      amountReceived,
      changeDue: Math.max(0, amountReceived - saleTotal),
      notes: data.notes.trim(),
      shiftId: activeShift.id,
      userId: currentUserId
    });

    form.reset();
    form.quantity.value = 1;
    setDefaultDates();
    updateSaleTotals();
    persistAndRender("Venta registrada.");
  });

  document.getElementById("saleProduct").addEventListener("change", updateSaleTotals);
  document.getElementById("saleForm").quantity.addEventListener("input", updateSaleTotals);
  document.getElementById("saleForm").amountReceived.addEventListener("input", updateSaleTotals);
  document.getElementById("printLastTicket").addEventListener("click", () => printTicket(state.sales[0]));

  document.getElementById("shiftForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const activeShift = getActiveShift();
    if (activeShift) {
      activeShift.closedAt = makeLocalDateTime(data.date || todayISO());
      activeShift.closingCash = Number(data.closingCash || 0);
      activeShift.notes = data.notes.trim();
      saveState();
      form.reset();
      renderAll();
      showToast("Turno cerrado.");
      return;
    }
    state.shifts.unshift({
      id: makeId("shift"),
      openedAt: makeLocalDateTime(data.date || todayISO()),
      closedAt: "",
      openingCash: Number(data.openingCash || 0),
      closingCash: 0,
      notes: data.notes.trim(),
      userId: currentUserId
    });
    saveState();
    form.reset();
    renderAll();
    showToast("Caja abierta.");
  });

  document.getElementById("expenseForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const activeShift = getActiveShift();
    if (!activeShift) {
      showToast("Abre caja antes de registrar gastos.");
      showView("caja");
      return;
    }
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    state.expenses.unshift({
      id: makeId("exp"),
      date: data.date || todayISO(),
      createdAt: makeLocalDateTime(data.date || todayISO()),
      concept: data.concept.trim(),
      category: data.category,
      amount: Number(data.amount),
      shiftId: activeShift.id,
      userId: currentUserId
    });
    form.reset();
    persistAndRender("Gasto registrado.");
  });

  document.getElementById("exportSales").addEventListener("click", () => exportSales());
  document.getElementById("exportInventory").addEventListener("click", () => exportInventory());
  document.getElementById("exportExpenses").addEventListener("click", () => exportExpenses());
  document.getElementById("exportClosings").addEventListener("click", () => exportClosings());
  document.getElementById("exportXlsx").addEventListener("click", () => exportReportsXLSX());
  document.getElementById("exportXml").addEventListener("click", () => exportReportsXML());

  document.getElementById("supabaseForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    saveSupabaseConfig(form.url.value, form.key.value);
    renderCloudStatus("Conexion guardada. Ahora puedes subir o descargar datos.");
    form.reset();
  });
  document.getElementById("uploadCloud").addEventListener("click", async () => {
    await pushToSupabase({ statusId: "cloudStatus", force: true });
  });
  document.getElementById("downloadCloud").addEventListener("click", async () => {
    await pullFromSupabase({ statusId: "cloudStatus" });
    renderAll();
  });

  document.getElementById("brandForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (getCurrentUser()?.role !== "admin") {
      showToast("Solo un administrador puede cambiar el logo.");
      return;
    }
    const file = event.currentTarget.logo.files[0];
    if (!file) {
      showToast("Selecciona una imagen para el logo.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      showToast("El archivo debe ser una imagen.");
      return;
    }
    state.settings.logo = await fileToDataURL(file);
    saveState();
    renderBrand();
    event.currentTarget.reset();
    showToast("Logo actualizado.");
  });

  document.getElementById("removeLogo").addEventListener("click", () => {
    if (getCurrentUser()?.role !== "admin") {
      showToast("Solo un administrador puede cambiar el logo.");
      return;
    }
    state.settings.logo = "";
    saveState();
    renderBrand();
    showToast("Logo retirado.");
  });

  document.getElementById("userForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (getCurrentUser()?.role !== "admin") {
      showToast("Solo un administrador puede crear usuarios.");
      return;
    }
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    state.users.push({
      id: makeId("usr"),
      name: data.name.trim(),
      role: data.role,
      pin: data.pin.trim(),
      active: true
    });
    form.reset();
    persistAndRender("Usuario creado.");
  });
}

function showView(viewName) {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.getElementById(viewName).classList.add("active");
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === viewName);
  });
  document.getElementById("viewTitle").textContent = views[viewName];
}

function renderAll() {
  renderBrand();
  renderSession();
  setDefaultDates();
  renderSelectors();
  renderMetrics();
  renderDashboard();
  renderIngredients();
  renderPurchases();
  renderProducts();
  renderSales();
  renderShifts();
  renderExpenses();
  renderReports();
  renderUsers();
  renderSaleHint();
}

function renderBrand() {
  const name = state.settings.businessName || "MATARINA BURGER";
  document.title = `${name} | Gestion de hamburgueseria`;
  document.querySelectorAll("[data-brand-name]").forEach((item) => {
    item.textContent = name;
  });
  document.querySelectorAll(".brand-logo").forEach((image) => {
    image.hidden = !state.settings.logo;
    image.src = state.settings.logo || "";
  });
  document.querySelectorAll(".brand-mark span").forEach((span) => {
    span.hidden = Boolean(state.settings.logo);
  });
}

function renderSession() {
  const user = getCurrentUser();
  document.getElementById("logoutButton").textContent = user ? `Salir: ${user.name}` : "Salir";
  const canAdmin = user?.role === "admin";
  document.getElementById("clearBusinessData").hidden = !canAdmin;
  document.getElementById("brandForm").hidden = !canAdmin;
  document.getElementById("supabaseForm").hidden = !canAdmin;
  document.getElementById("restorePanel").hidden = !canAdmin;
  document.querySelector('[data-view="usuarios"]').hidden = !canAdmin;
  renderCloudStatus(getSupabaseConfig() ? "Supabase conectado en este dispositivo." : "Supabase no configurado.");
}

function renderSelectors() {
  const ingredientOptions = state.ingredients
    .map((ingredient) => `<option value="${ingredient.id}">${escapeHTML(ingredient.name)} (${ingredient.unit})</option>`)
    .join("");
  document.getElementById("purchaseIngredient").innerHTML = ingredientOptions || `<option value="">Sin insumos</option>`;
  document.getElementById("purchaseIngredient").disabled = !state.ingredients.length;
  document.getElementById("recipeIngredient").innerHTML = ingredientOptions || `<option value="">Sin insumos</option>`;
  document.getElementById("recipeIngredient").disabled = !state.ingredients.length;
  updatePurchasePrice();

  const productOptions = state.products
    .map((product) => `<option value="${product.id}">${escapeHTML(product.name)} - ${money(product.price)}</option>`)
    .join("");
  document.getElementById("saleProduct").innerHTML = productOptions || `<option value="">Sin productos</option>`;
  document.getElementById("saleProduct").disabled = !state.products.length;
  document.getElementById("recipeProduct").innerHTML = productOptions || `<option value="">Sin productos</option>`;
  document.getElementById("recipeProduct").disabled = !state.products.length;
  updateSaleTotals();
}

function updatePurchasePrice() {
  const form = document.getElementById("purchaseForm");
  const ingredient = findIngredient(form.ingredientId.value);
  if (!ingredient) {
    form.unitPrice.value = "";
    form.total.value = "";
    return;
  }
  const lastPurchase = state.purchases.find((purchase) => purchase.ingredientId === ingredient.id && purchase.quantity > 0);
  const lastPrice = lastPurchase ? lastPurchase.total / lastPurchase.quantity : ingredient.cost;
  form.unitPrice.value = roundInput(lastPrice);
  updatePurchaseTotal();
}

function updatePurchaseTotal() {
  const form = document.getElementById("purchaseForm");
  const quantity = Number(form.quantity.value || 0);
  const unitPrice = Number(form.unitPrice.value || 0);
  form.total.value = quantity && unitPrice ? roundInput(quantity * unitPrice) : "";
}

function calculateSaleTotal() {
  const form = document.getElementById("saleForm");
  const product = findProduct(form.productId.value);
  const quantity = Number(form.quantity.value || 0);
  return product ? product.price * quantity : 0;
}

function updateSaleTotals() {
  const form = document.getElementById("saleForm");
  const total = calculateSaleTotal();
  const received = Number(form.amountReceived.value || 0);
  form.saleTotal.value = roundInput(total);
  form.changeDue.value = roundInput(Math.max(0, received - total));
  renderSaleHint();
}

function renderMetrics() {
  const salesToday = state.sales.filter((sale) => sale.date === todayISO());
  const revenueToday = sum(salesToday, "total");
  const revenueTotal = sum(state.sales, "total");
  const expensesToday = sum(state.expenses.filter((expense) => expense.date === todayISO()), "amount");
  const costToday = sum(salesToday, "cost");
  const grossMargin = revenueTotal ? ((revenueTotal - sum(state.sales, "cost")) / revenueTotal) * 100 : 0;
  const inventoryValue = state.ingredients.reduce((total, item) => total + item.stock * item.cost, 0);
  const critical = state.ingredients.filter((item) => item.stock <= item.minStock).length;
  const averageTicket = salesToday.length ? revenueToday / salesToday.length : 0;

  document.getElementById("sidebarInventory").textContent = money(inventoryValue);
  document.getElementById("metricsGrid").innerHTML = [
    metric("Ventas hoy", money(revenueToday), `${sum(salesToday, "quantity")} productos vendidos`, revenueToday > 0 ? "ok" : "neutral"),
    metric("Caja neta hoy", money(revenueToday - expensesToday), `Gastos ${money(expensesToday)}`, revenueToday - expensesToday > 0 ? "ok" : "neutral"),
    metric("Ticket promedio", money(averageTicket), "Promedio del dia", averageTicket > 0 ? "info" : "neutral"),
    metric("Stock critico", critical, critical === 1 ? "1 insumo por reponer" : `${critical} insumos por reponer`, critical > 0 ? "bad" : "ok")
  ].join("");
}

function renderDashboard() {
  const days = [...Array(7)].map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return date.toISOString().slice(0, 10);
  });
  const daily = days.map((date) => ({
    date,
    total: sum(state.sales.filter((sale) => sale.date === date), "total")
  }));
  const max = Math.max(...daily.map((day) => day.total), 1);
  document.getElementById("weekRange").textContent = `${formatDate(days[0])} - ${formatDate(days[6])}`;
  document.getElementById("salesChart").innerHTML = daily.map((day) => {
    const height = Math.max(8, (day.total / max) * 190);
    return `<div class="bar-item"><div class="bar" style="height:${height}px"></div><strong>${shortDay(day.date)}</strong><span>${money(day.total)}</span></div>`;
  }).join("");

  const critical = state.ingredients
    .filter((item) => item.stock <= item.minStock)
    .sort((a, b) => a.stock / a.minStock - b.stock / b.minStock);
  document.getElementById("criticalStock").innerHTML = critical.length
    ? critical.map((item) => listRow(item.name, `${round(item.stock)} ${item.unit} disponibles`, "Reponer", "bad")).join("")
    : emptyRow("Sin alertas de stock", "Los insumos estan por encima del minimo.");

  const productTotals = state.products.map((product) => ({
    name: product.name,
    quantity: sum(state.sales.filter((sale) => sale.productId === product.id), "quantity"),
    revenue: sum(state.sales.filter((sale) => sale.productId === product.id), "total")
  })).sort((a, b) => b.quantity - a.quantity);
  document.getElementById("topProducts").innerHTML = productTotals
    .filter((item) => item.quantity > 0)
    .slice(0, 4)
    .map((item) => listRow(item.name, `${item.quantity} vendidos`, money(item.revenue), "ok"))
    .join("") || emptyRow("Aun no hay ventas", "Registra ventas para ver el ranking.");

  renderTodaySummary();
  renderChannelMix();
  renderNextActions(critical);
}

function renderTodaySummary() {
  const salesToday = state.sales.filter((sale) => sale.date === todayISO());
  const revenue = sum(salesToday, "total");
  const cost = sum(salesToday, "cost");
  const expenses = sum(state.expenses.filter((expense) => expense.date === todayISO()), "amount");
  const units = sum(salesToday, "quantity");
  const margin = revenue ? ((revenue - cost) / revenue) * 100 : 0;
  const lastSale = salesToday[0];
  const lastProduct = lastSale ? findProduct(lastSale.productId)?.name : "Sin ventas aun";

  document.getElementById("todaySummary").innerHTML = [
    listRow("Ingresos", `${units} unidades vendidas`, money(revenue), revenue > 0 ? "ok" : "warn"),
    listRow("Gastos", "Egresos del dia", money(expenses), expenses > 0 ? "warn" : "ok"),
    listRow("Margen del dia", `${margin.toFixed(1)}% sobre ventas`, money(revenue - cost), margin >= 45 ? "ok" : margin > 0 ? "warn" : "bad"),
    listRow("Ultima venta", lastProduct, lastSale ? money(lastSale.total) : "Pendiente", lastSale ? "info" : "warn")
  ].join("");
}

function renderChannelMix() {
  const totals = ["Salon", "Delivery", "Recojo"].map((channel) => ({
    channel,
    total: sum(state.sales.filter((sale) => sale.channel === channel), "total")
  }));
  const max = Math.max(...totals.map((item) => item.total), 1);

  document.getElementById("channelMix").innerHTML = totals.map((item) => {
    const width = Math.max(4, (item.total / max) * 100);
    return `
      <div class="channel-row">
        <div>
          <strong>${item.channel}</strong>
          <span>${money(item.total)}</span>
        </div>
        <div class="progress-track" aria-hidden="true"><span style="width:${width}%"></span></div>
      </div>
    `;
  }).join("");
}

function renderNextActions(critical) {
  const actions = [];
  if (!state.ingredients.length) {
    actions.push(actionCard("Registrar insumos", "Empieza por carne, pan, queso, salsas y empaques.", "insumos", "bad"));
  }
  if (!state.products.length) {
    actions.push(actionCard("Crear productos", "Agrega los nombres y precios de tu carta.", "recetas", "warn"));
  }
  if (state.products.length && !state.sales.length) {
    actions.push(actionCard("Abrir caja", "Inicia un turno antes de vender.", "caja", "info"));
  }
  if (getActiveShift()) {
    actions.push(actionCard("Cerrar turno", "Cuenta efectivo y registra cierre de caja.", "caja", "warn"));
  }
  if (critical.length) {
    actions.push(actionCard("Reponer stock critico", `${critical.length} insumo(s) estan bajo el minimo.`, "compras", "bad"));
  }
  if (!state.users.length || state.users.length === 1) {
    actions.push(actionCard("Agregar equipo", "Crea usuarios para caja u operacion.", "usuarios", "info"));
  }
  if (!actions.length) {
    actions.push(actionCard("Operacion lista", "Tu dashboard no muestra pendientes urgentes.", "dashboard", "ok"));
  }

  document.getElementById("nextActions").innerHTML = actions.slice(0, 4).join("");
  document.querySelectorAll("[data-action-view]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.actionView));
  });
}

function renderIngredients() {
  document.getElementById("ingredientsTable").innerHTML = state.ingredients.length ? state.ingredients.map((item) => {
    const status = item.stock <= item.minStock ? ["Critico", "bad"] : item.stock <= item.minStock * 1.5 ? ["Vigilar", "warn"] : ["Ok", "ok"];
    return `
      <tr>
        <td data-label="Insumo"><strong>${escapeHTML(item.name)}</strong></td>
        <td data-label="Stock">${round(item.stock)} ${item.unit}</td>
        <td data-label="Minimo">${round(item.minStock)} ${item.unit}</td>
        <td data-label="Costo">${money(item.cost)}</td>
        <td data-label="Estado"><span class="pill ${status[1]}">${status[0]}</span></td>
        <td data-label="Acciones"><div class="row-actions"><button class="ghost-button small-button" type="button" onclick="editIngredient('${item.id}')">Editar</button><button class="ghost-button small-button danger-button" type="button" onclick="deleteIngredient('${item.id}')">Eliminar</button></div></td>
      </tr>
    `;
  }).join("") : `<tr><td data-label="Insumo"><strong>Sin insumos registrados</strong></td><td data-label="Siguiente paso">Agrega tus primeros insumos.</td></tr>`;
}

function renderPurchases() {
  document.getElementById("purchasesTable").innerHTML = state.purchases.length ? state.purchases.map((purchase) => {
    const ingredient = findIngredient(purchase.ingredientId);
    return `
      <tr>
        <td data-label="Fecha">${formatDate(purchase.date)}</td>
        <td data-label="Proveedor">${escapeHTML(purchase.supplier)}</td>
        <td data-label="Insumo">${escapeHTML(ingredient?.name || "Insumo eliminado")}</td>
        <td data-label="Cantidad">${round(purchase.quantity)} ${ingredient?.unit || ""}</td>
        <td data-label="Total">${money(purchase.total)}</td>
        <td data-label="Acciones"><div class="row-actions"><button class="ghost-button small-button" type="button" onclick="editPurchase('${purchase.id}')">Modificar</button><button class="ghost-button small-button danger-button" type="button" onclick="deletePurchase('${purchase.id}')">Eliminar</button></div></td>
      </tr>
    `;
  }).join("") : `<tr><td data-label="Fecha"><strong>Sin compras registradas</strong></td><td data-label="Siguiente paso">Registra entradas de inventario.</td></tr>`;
}

function renderProducts() {
  document.getElementById("productsList").innerHTML = state.products.length ? state.products.map((product) => {
    const recipe = Array.isArray(product.recipe) ? product.recipe : [];
    const recipeText = recipe.length
      ? recipe.map((line) => {
        const ingredient = findIngredient(line.ingredientId);
        return `${round(line.quantity)} ${ingredient?.unit || ""} ${ingredient?.name || "Insumo"}`;
      }).join(" / ")
      : "Sin receta asignada";
    return `
      <div class="product-card">
        <div>
          <strong>${escapeHTML(product.name)}</strong>
          <span>${escapeHTML(recipeText)}</span>
        </div>
        <div>
          <strong>${money(product.price)}</strong>
          <span>Costo receta ${money(productCost(product))}</span>
        </div>
        <div class="row-actions">
          <button class="ghost-button small-button" type="button" onclick="editProduct('${product.id}')">Modificar</button>
          <button class="ghost-button small-button danger-button" type="button" onclick="deleteProduct('${product.id}')">Eliminar</button>
        </div>
      </div>
    `;
  }).join("") : emptyRow("Sin productos registrados", "Agrega los nombres y precios de tu carta.");
}

function renderSales() {
  document.getElementById("salesTable").innerHTML = state.sales.length ? state.sales.map((sale) => {
    const product = findProduct(sale.productId);
    return `
      <tr>
        <td data-label="Fecha">${formatDate(sale.date)}</td>
        <td data-label="Producto">${escapeHTML(product?.name || "Producto eliminado")}</td>
        <td data-label="Cantidad">${sale.quantity}</td>
        <td data-label="Canal">${sale.channel}</td>
        <td data-label="Total">${money(sale.total)}</td>
        <td data-label="Margen">${money(sale.total - sale.cost)}</td>
        <td data-label="Obs.">${escapeHTML(sale.notes || "")}</td>
        <td data-label="Acciones"><div class="row-actions"><button class="ghost-button small-button" type="button" onclick="editSale('${sale.id}')">Modificar</button><button class="ghost-button small-button danger-button" type="button" onclick="deleteSale('${sale.id}')">Eliminar</button></div></td>
      </tr>
    `;
  }).join("") : `<tr><td data-label="Fecha"><strong>Sin ventas registradas</strong></td><td data-label="Siguiente paso">Crea productos y registra ventas.</td></tr>`;
}

function renderShifts() {
  const activeShift = getActiveShift();
  const form = document.getElementById("shiftForm");
  document.getElementById("shiftFormTitle").textContent = activeShift ? "Cerrar caja" : "Abrir caja";
  document.getElementById("shiftSubmit").textContent = activeShift ? "Cerrar turno" : "Abrir turno";
  form.openingCash.disabled = Boolean(activeShift);
  form.closingCash.disabled = !activeShift;
  if (activeShift) {
    form.openingCash.value = activeShift.openingCash;
  }
  const activeStats = activeShift ? shiftStats(activeShift.id) : null;
  document.getElementById("shiftSummary").innerHTML = activeShift
    ? [
      listRow("Turno abierto", formatDateTime(activeShift.openedAt), money(activeStats.expectedCash), "info"),
      listRow("Ventas del turno", `${activeStats.salesCount} tickets`, money(activeStats.salesTotal), "ok"),
      listRow("Gastos del turno", "Egresos registrados", money(activeStats.expensesTotal), activeStats.expensesTotal > 0 ? "warn" : "ok")
    ].join("")
    : emptyRow("Sin turno abierto", "Abre caja para vender y registrar gastos.");

  document.getElementById("shiftsTable").innerHTML = state.shifts.length ? state.shifts.map((shift) => {
    const stats = shiftStats(shift.id);
    const user = state.users.find((item) => item.id === shift.userId);
    const status = shift.closedAt ? "Cerrado" : "Abierto";
    return `
      <tr>
        <td data-label="Turno">${formatDateTime(shift.openedAt)}</td>
        <td data-label="Usuario">${escapeHTML(user?.name || "Usuario")}</td>
        <td data-label="Ventas">${money(stats.salesTotal)}</td>
        <td data-label="Gastos">${money(stats.expensesTotal)}</td>
        <td data-label="Esperado">${money(stats.expectedCash)}</td>
        <td data-label="Estado"><span class="pill ${shift.closedAt ? "ok" : "info"}">${status}</span></td>
        <td data-label="Acciones"><div class="row-actions"><button class="ghost-button small-button" type="button" onclick="editShift('${shift.id}')">Modificar</button><button class="ghost-button small-button danger-button" type="button" onclick="deleteShift('${shift.id}')">Eliminar</button></div></td>
      </tr>
    `;
  }).join("") : `<tr><td data-label="Turno"><strong>Sin cierres registrados</strong></td><td data-label="Siguiente paso">Abre tu primer turno.</td></tr>`;
}

function renderExpenses() {
  document.getElementById("expensesTable").innerHTML = state.expenses.length ? state.expenses.map((expense) => {
    const user = state.users.find((item) => item.id === expense.userId);
    return `
      <tr>
        <td data-label="Fecha">${formatDate(expense.date)}</td>
        <td data-label="Concepto"><strong>${escapeHTML(expense.concept)}</strong></td>
        <td data-label="Categoria">${escapeHTML(expense.category)}</td>
        <td data-label="Monto">${money(expense.amount)}</td>
        <td data-label="Usuario">${escapeHTML(user?.name || "Usuario")}</td>
        <td data-label="Acciones"><div class="row-actions"><button class="ghost-button small-button" type="button" onclick="editExpense('${expense.id}')">Modificar</button><button class="ghost-button small-button danger-button" type="button" onclick="deleteExpense('${expense.id}')">Eliminar</button></div></td>
      </tr>
    `;
  }).join("") : `<tr><td data-label="Fecha"><strong>Sin gastos registrados</strong></td><td data-label="Siguiente paso">Registra salidas de caja.</td></tr>`;
}

function renderUsers() {
  document.getElementById("usersTable").innerHTML = state.users.map((user) => `
    <tr>
      <td data-label="Usuario"><strong>${escapeHTML(user.name)}</strong></td>
      <td data-label="Rol">${roleLabel(user.role)}</td>
      <td data-label="Estado"><span class="pill ${user.active ? "ok" : "bad"}">${user.active ? "Activo" : "Inactivo"}</span></td>
    </tr>
  `).join("");
}

function renderLoginUsers() {
  const select = document.getElementById("loginUser");
  select.innerHTML = state.users
    .filter((user) => user.active)
    .map((user) => `<option value="${user.id}">${escapeHTML(user.name)} - ${roleLabel(user.role)}</option>`)
    .join("");
}

function renderReports() {
  const revenue = sum(state.sales, "total");
  const cost = sum(state.sales, "cost");
  const purchases = sum(state.purchases, "total");
  const expenses = sum(state.expenses, "amount");
  const tickets = state.sales.length;
  const averageTicket = tickets ? revenue / tickets : 0;
  const units = sum(state.sales, "quantity");

  document.getElementById("reportGrid").innerHTML = [
    reportCard("Ventas acumuladas", money(revenue), `${units} unidades`),
    reportCard("Costo vendido", money(cost), "Segun recetas"),
    reportCard("Gastos operativos", money(expenses), "Servicios, alquiler y otros"),
    reportCard("Compras insumos", money(purchases), "Reposicion de inventario"),
    reportCard("Ticket promedio", money(averageTicket), `${tickets} tickets`),
    reportCard("Rentabilidad", money(revenue - cost - expenses), "Ventas - costo vendido - gastos"),
    reportCard("Caja neta", money(revenue - expenses - purchases), "Ventas - gastos - compras")
  ].join("");

  renderCashFlow();
  renderConsumption();

  const suggestions = state.ingredients
    .filter((item) => item.stock <= item.minStock * 1.5)
    .map((item) => {
      const target = item.minStock * 2;
      const quantity = Math.max(0, target - item.stock);
      return listRow(item.name, `Comprar ${round(quantity)} ${item.unit}`, money(quantity * item.cost), item.stock <= item.minStock ? "bad" : "warn");
    });
  document.getElementById("shoppingSuggestions").innerHTML = suggestions.join("") || emptyRow("Sin compras sugeridas", "El stock actual cubre el minimo.");
}

function renderCashFlow() {
  const periods = [
    ["Diario", periodStart("day")],
    ["Semanal", periodStart("week")],
    ["Mensual", periodStart("month")]
  ];
  document.getElementById("cashFlowGrid").innerHTML = periods.map(([label, start]) => {
    const stats = cashFlowSince(start);
    return reportCard(
      `Flujo ${label.toLowerCase()}`,
      money(stats.cash),
      `Ventas ${money(stats.sales)} / Compras ${money(stats.purchases)} / Gastos ${money(stats.expenses)} / Rent. ${money(stats.profit)}`
    );
  }).join("");
}

function renderConsumption() {
  const consumption = ingredientConsumptionSince(periodStart("month"));
  document.getElementById("consumptionList").innerHTML = consumption.length
    ? consumption.map((item) => listRow(item.name, `${round(item.quantity)} ${item.unit} consumidos este mes`, `Stock ${round(item.stock)}`, item.stock <= item.minStock ? "bad" : "info")).join("")
    : emptyRow("Sin consumo registrado", "Asigna recetas y registra ventas para ver consumo.");
}

function renderSaleHint() {
  const select = document.getElementById("saleProduct");
  const hint = document.getElementById("saleHint");
  const product = findProduct(select.value);
  if (!product) {
    hint.textContent = "Configura un producto para empezar a vender.";
    return;
  }
  const recipeCost = productCost(product);
  hint.textContent = `Precio ${money(product.price)} | costo receta ${money(recipeCost)} | margen unitario ${money(product.price - recipeCost)}`;
}

function productCost(product) {
  const recipe = Array.isArray(product?.recipe) ? product.recipe : [];
  return recipe.reduce((total, line) => {
    const ingredient = findIngredient(line.ingredientId);
    return total + (ingredient ? ingredient.cost * Number(line.quantity || 0) : 0);
  }, 0);
}

function maxSellableUnits(product) {
  return 0;
}

function checkRecipeAvailability(product, quantity) {
  const recipe = Array.isArray(product.recipe) ? product.recipe : [];
  for (const line of recipe) {
    const ingredient = findIngredient(line.ingredientId);
    const required = Number(line.quantity || 0) * quantity;
    if (!ingredient || ingredient.stock < required) {
      return { ok: false, name: ingredient?.name || "insumo faltante" };
    }
  }
  return { ok: true };
}

function consumeRecipe(product, quantity) {
  const recipe = Array.isArray(product.recipe) ? product.recipe : [];
  recipe.forEach((line) => {
    const ingredient = findIngredient(line.ingredientId);
    if (ingredient) {
      ingredient.stock -= Number(line.quantity || 0) * quantity;
    }
  });
}

function restoreRecipe(product, quantity) {
  const recipe = Array.isArray(product?.recipe) ? product.recipe : [];
  recipe.forEach((line) => {
    const ingredient = findIngredient(line.ingredientId);
    if (ingredient) {
      ingredient.stock += Number(line.quantity || 0) * quantity;
    }
  });
}

function cashFlowSince(startDate) {
  const sales = sum(state.sales.filter((sale) => sale.date >= startDate), "total");
  const cost = sum(state.sales.filter((sale) => sale.date >= startDate), "cost");
  const purchases = sum(state.purchases.filter((purchase) => purchase.date >= startDate), "total");
  const expenses = sum(state.expenses.filter((expense) => expense.date >= startDate), "amount");
  return {
    sales,
    cost,
    purchases,
    expenses,
    profit: sales - cost - expenses,
    cash: sales - purchases - expenses
  };
}

function ingredientConsumptionSince(startDate) {
  const totals = new Map();
  state.sales.filter((sale) => sale.date >= startDate).forEach((sale) => {
    const product = findProduct(sale.productId);
    const recipe = Array.isArray(product?.recipe) ? product.recipe : [];
    recipe.forEach((line) => {
      const ingredient = findIngredient(line.ingredientId);
      if (!ingredient) return;
      const current = totals.get(ingredient.id) || { name: ingredient.name, unit: ingredient.unit, quantity: 0, stock: ingredient.stock, minStock: ingredient.minStock };
      current.quantity += Number(line.quantity || 0) * Number(sale.quantity || 0);
      current.stock = ingredient.stock;
      totals.set(ingredient.id, current);
    });
  });
  return [...totals.values()].sort((a, b) => b.quantity - a.quantity);
}

function getCurrentUser() {
  return state.users.find((user) => user.id === currentUserId && user.active);
}

function getActiveShift() {
  return state.shifts.find((shift) => !shift.closedAt);
}

function shiftStats(shiftId) {
  const shift = state.shifts.find((item) => item.id === shiftId);
  const sales = state.sales.filter((sale) => sale.shiftId === shiftId);
  const expenses = state.expenses.filter((expense) => expense.shiftId === shiftId);
  const salesTotal = sum(sales, "total");
  const expensesTotal = sum(expenses, "amount");
  return {
    salesCount: sales.length,
    salesTotal,
    expensesTotal,
    expectedCash: Number(shift?.openingCash || 0) + salesTotal - expensesTotal
  };
}

function roleLabel(role) {
  return {
    admin: "Administrador",
    ventas: "Ventas",
    operacion: "Operacion"
  }[role] || role;
}

function metric(label, value, help, tone = "neutral") {
  return `<article class="metric metric-${tone}"><span>${label}</span><strong>${value}</strong><small>${help}</small></article>`;
}

function reportCard(label, value, help) {
  return `<div class="report-card"><span>${label}</span><strong>${value}</strong><span>${help}</span></div>`;
}

function listRow(title, detail, badge, tone) {
  return `<div class="list-row"><div><strong>${escapeHTML(title)}</strong><span>${escapeHTML(detail)}</span></div><span class="pill ${tone}">${escapeHTML(String(badge))}</span></div>`;
}

function emptyRow(title, detail) {
  return `<div class="list-row"><div><strong>${title}</strong><span>${detail}</span></div></div>`;
}

function actionCard(title, detail, view, tone) {
  return `
    <button class="action-card action-${tone}" type="button" data-action-view="${view}">
      <strong>${escapeHTML(title)}</strong>
      <span>${escapeHTML(detail)}</span>
    </button>
  `;
}

function requireAdminPin() {
  const pin = window.prompt("Ingresa PIN de administrador para continuar:");
  if (pin === null) {
    return false;
  }
  const ok = state.users.some((user) => user.active && user.role === "admin" && user.pin === pin.trim());
  if (!ok) {
    showToast("PIN de administrador incorrecto.");
  }
  return ok;
}

function editIngredient(id) {
  if (!requireAdminPin()) return;
  const ingredient = findIngredient(id);
  if (!ingredient) return;
  const date = window.prompt("Fecha (YYYY-MM-DD):", ingredient.date || todayISO());
  if (!date) return;
  const name = window.prompt("Nombre del insumo:", ingredient.name);
  if (!name) return;
  const unit = window.prompt("Unidad:", ingredient.unit);
  if (!unit) return;
  const stock = Number(window.prompt("Stock actual:", ingredient.stock));
  const minStock = Number(window.prompt("Stock minimo:", ingredient.minStock));
  const cost = Number(window.prompt("Costo unitario S/:", ingredient.cost));
  if (![stock, minStock, cost].every(Number.isFinite) || stock < 0 || minStock < 0 || cost < 0) {
    showToast("Datos de insumo invalidos.");
    return;
  }
  ingredient.date = date;
  ingredient.name = name.trim();
  ingredient.unit = unit.trim();
  ingredient.stock = stock;
  ingredient.minStock = minStock;
  ingredient.cost = cost;
  persistAndRender("Insumo modificado.");
}

function deleteIngredient(id) {
  if (!requireAdminPin()) return;
  const inUse = state.products.some((product) => Array.isArray(product.recipe) && product.recipe.some((line) => line.ingredientId === id))
    || state.purchases.some((purchase) => purchase.ingredientId === id);
  if (inUse && !window.confirm("Este insumo tiene compras o recetas asociadas. Deseas eliminarlo de todos modos?")) return;
  state.ingredients = state.ingredients.filter((ingredient) => ingredient.id !== id);
  state.products.forEach((product) => {
    product.recipe = Array.isArray(product.recipe) ? product.recipe.filter((line) => line.ingredientId !== id) : [];
  });
  persistAndRender("Insumo eliminado.");
}

function editProduct(id) {
  if (!requireAdminPin()) return;
  const product = findProduct(id);
  if (!product) return;
  const date = window.prompt("Fecha (YYYY-MM-DD):", product.date || todayISO());
  if (!date) return;
  const name = window.prompt("Nombre del producto:", product.name);
  if (!name) return;
  const price = Number(window.prompt("Precio de venta S/:", product.price));
  if (!Number.isFinite(price) || price < 0) {
    showToast("Precio invalido.");
    return;
  }
  product.date = date;
  product.name = name.trim();
  product.price = price;
  state.sales.forEach((sale) => {
    if (sale.productId === product.id) {
      sale.total = product.price * sale.quantity;
    }
  });
  persistAndRender("Producto modificado.");
}

function deleteProduct(id) {
  if (!requireAdminPin()) return;
  if (!window.confirm("Eliminar este producto? Las ventas antiguas conservaran el registro, pero el producto ya no estara disponible.")) return;
  state.products = state.products.filter((product) => product.id !== id);
  persistAndRender("Producto eliminado.");
}

function editPurchase(id) {
  if (!requireAdminPin()) return;
  const purchase = state.purchases.find((item) => item.id === id);
  if (!purchase) return;
  const oldIngredient = findIngredient(purchase.ingredientId);
  const date = window.prompt("Fecha (YYYY-MM-DD):", purchase.date || todayISO());
  if (!date) return;
  const supplier = window.prompt("Proveedor:", purchase.supplier);
  if (!supplier) return;
  const quantity = Number(window.prompt("Cantidad:", purchase.quantity));
  const total = Number(window.prompt("Costo total S/:", purchase.total));
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(total) || total < 0) {
    showToast("Datos de compra invalidos.");
    return;
  }
  if (oldIngredient) {
    oldIngredient.stock -= purchase.quantity;
    oldIngredient.stock += quantity;
    oldIngredient.cost = total / quantity;
  }
  purchase.date = date;
  purchase.supplier = supplier.trim();
  purchase.quantity = quantity;
  purchase.total = total;
  persistAndRender("Compra modificada.");
}

function deletePurchase(id) {
  if (!requireAdminPin()) return;
  const purchase = state.purchases.find((item) => item.id === id);
  if (!purchase) return;
  if (!window.confirm("Eliminar esta compra y descontar su cantidad del stock?")) return;
  const ingredient = findIngredient(purchase.ingredientId);
  if (ingredient) {
    ingredient.stock = Math.max(0, ingredient.stock - purchase.quantity);
  }
  state.purchases = state.purchases.filter((item) => item.id !== id);
  persistAndRender("Compra eliminada.");
}

function editSale(id) {
  if (!requireAdminPin()) return;
  const sale = state.sales.find((item) => item.id === id);
  if (!sale) return;
  const product = findProduct(sale.productId);
  const date = window.prompt("Fecha (YYYY-MM-DD):", sale.date || todayISO());
  if (!date) return;
  const quantity = Number(window.prompt("Cantidad:", sale.quantity));
  if (!Number.isFinite(quantity) || quantity <= 0) {
    showToast("Cantidad invalida.");
    return;
  }
  restoreRecipe(product, sale.quantity);
  const availability = checkRecipeAvailability(product, quantity);
  if (!availability.ok) {
    consumeRecipe(product, sale.quantity);
    showToast(`Stock insuficiente: ${availability.name}.`);
    return;
  }
  consumeRecipe(product, quantity);
  const channel = window.prompt("Canal: Salon, Delivery o Recojo", sale.channel);
  if (!channel) {
    restoreRecipe(product, quantity);
    consumeRecipe(product, sale.quantity);
    return;
  }
  const notes = window.prompt("Observaciones:", sale.notes || "");
  sale.date = date;
  sale.quantity = quantity;
  sale.channel = channel.trim();
  sale.notes = notes || "";
  sale.total = (product?.price || 0) * quantity;
  sale.cost = productCost(product) * quantity;
  persistAndRender("Venta modificada.");
}

function deleteSale(id) {
  if (!requireAdminPin()) return;
  if (!window.confirm("Eliminar esta venta?")) return;
  const sale = state.sales.find((item) => item.id === id);
  const product = findProduct(sale?.productId);
  restoreRecipe(product, sale?.quantity || 0);
  state.sales = state.sales.filter((sale) => sale.id !== id);
  persistAndRender("Venta eliminada.");
}

function editShift(id) {
  if (!requireAdminPin()) return;
  const shift = state.shifts.find((item) => item.id === id);
  if (!shift) return;
  const date = window.prompt("Fecha apertura (YYYY-MM-DD):", shift.openedAt ? shift.openedAt.slice(0, 10) : todayISO());
  if (!date) return;
  const openingCash = Number(window.prompt("Monto inicial S/:", shift.openingCash));
  const closingCash = Number(window.prompt("Monto contado al cierre S/:", shift.closingCash || 0));
  const notes = window.prompt("Notas:", shift.notes || "");
  if (!Number.isFinite(openingCash) || openingCash < 0 || !Number.isFinite(closingCash) || closingCash < 0) {
    showToast("Datos de caja invalidos.");
    return;
  }
  shift.openedAt = makeLocalDateTime(date);
  shift.openingCash = openingCash;
  shift.closingCash = closingCash;
  shift.notes = notes || "";
  persistAndRender("Caja modificada.");
}

function deleteShift(id) {
  if (!requireAdminPin()) return;
  const hasMoves = state.sales.some((sale) => sale.shiftId === id) || state.expenses.some((expense) => expense.shiftId === id);
  if (hasMoves && !window.confirm("Este turno tiene ventas o gastos. Deseas eliminar solo el registro de caja?")) return;
  state.shifts = state.shifts.filter((shift) => shift.id !== id);
  persistAndRender("Caja eliminada.");
}

function editExpense(id) {
  if (!requireAdminPin()) return;
  const expense = state.expenses.find((item) => item.id === id);
  if (!expense) return;
  const date = window.prompt("Fecha (YYYY-MM-DD):", expense.date || todayISO());
  if (!date) return;
  const concept = window.prompt("Concepto:", expense.concept);
  if (!concept) return;
  const category = window.prompt("Categoria:", expense.category);
  if (!category) return;
  const amount = Number(window.prompt("Monto S/:", expense.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    showToast("Monto invalido.");
    return;
  }
  expense.date = date;
  expense.createdAt = makeLocalDateTime(date);
  expense.concept = concept.trim();
  expense.category = category.trim();
  expense.amount = amount;
  persistAndRender("Gasto modificado.");
}

function deleteExpense(id) {
  if (!requireAdminPin()) return;
  if (!window.confirm("Eliminar este gasto?")) return;
  state.expenses = state.expenses.filter((expense) => expense.id !== id);
  persistAndRender("Gasto eliminado.");
}

async function persistAndRender(message) {
  await saveState();
  renderAll();
  showToast(message);
}

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  state = normalizeState(stored ? JSON.parse(stored) : structuredClone(blankState));
  pullFromSupabase({ silent: true }).then((changed) => {
    if (changed) {
      bootApp();
    }
  });
}

async function saveState() {
  const normalized = normalizeState(state);
  normalized.updatedAt = new Date().toISOString();
  state = normalized;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  await pushToSupabase({ silent: true });
}

function normalizeState(value) {
  return {
    settings: {
      businessName: value?.settings?.businessName || "MATARINA BURGER",
      logo: value?.settings?.logo || ""
    },
    users: Array.isArray(value?.users) ? value.users : [],
    ingredients: Array.isArray(value?.ingredients) ? value.ingredients : [],
    products: Array.isArray(value?.products) ? value.products : [],
    purchases: Array.isArray(value?.purchases) ? value.purchases : [],
    sales: Array.isArray(value?.sales) ? value.sales : [],
    expenses: Array.isArray(value?.expenses) ? value.expenses : [],
    shifts: Array.isArray(value?.shifts) ? value.shifts : [],
    updatedAt: value?.updatedAt || ""
  };
}

function saveSupabaseConfig(url, key) {
  const cleanUrl = String(url || "").trim().replace(/\/$/, "");
  const cleanKey = String(key || "").trim();
  if (!cleanUrl || !cleanKey) {
    showToast("Ingresa URL y anon key de Supabase.");
    return false;
  }
  localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify({ url: cleanUrl, key: cleanKey }));
  return true;
}

function getSupabaseConfig() {
  try {
    const value = JSON.parse(localStorage.getItem(SUPABASE_CONFIG_KEY) || "null");
    return value?.url && value?.key ? value : null;
  } catch {
    return null;
  }
}

function supabaseHeaders(config) {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    "Content-Type": "application/json"
  };
}

async function pullFromSupabase(options = {}) {
  const config = getSupabaseConfig();
  if (!config) {
    if (!options.silent) renderCloudStatus("Configura Supabase primero.", options.statusId);
    return false;
  }
  try {
    isSyncingCloud = true;
    const response = await fetch(`${config.url}/rest/v1/app_state?id=eq.${encodeURIComponent(CLOUD_ROW_ID)}&select=data,updated_at`, {
      headers: supabaseHeaders(config)
    });
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json();
    if (!rows.length || !rows[0].data) {
      if (!options.silent) renderCloudStatus("No hay datos en la nube. Usa Subir datos.", options.statusId);
      return false;
    }
    const cloudState = normalizeState(rows[0].data);
    const localTime = Date.parse(state.updatedAt || 0);
    const cloudTime = Date.parse(cloudState.updatedAt || rows[0].updated_at || 0);
    if (options.force || cloudTime >= localTime) {
      state = cloudState;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      if (!options.silent) renderCloudStatus("Datos descargados desde Supabase.", options.statusId);
      return true;
    }
    if (!options.silent) renderCloudStatus("Tus datos locales son mas recientes.", options.statusId);
    return false;
  } catch (error) {
    console.error(error);
    if (!options.silent) renderCloudStatus("No se pudo descargar desde Supabase.", options.statusId);
    return false;
  } finally {
    isSyncingCloud = false;
  }
}

async function pushToSupabase(options = {}) {
  const config = getSupabaseConfig();
  if (!config || isSyncingCloud) return false;
  try {
    const payload = {
      id: CLOUD_ROW_ID,
      data: normalizeState(state),
      updated_at: new Date().toISOString()
    };
    const response = await fetch(`${config.url}/rest/v1/app_state`, {
      method: "POST",
      headers: {
        ...supabaseHeaders(config),
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(await response.text());
    if (!options.silent) renderCloudStatus("Datos subidos a Supabase.", options.statusId);
    return true;
  } catch (error) {
    console.error(error);
    if (!options.silent) renderCloudStatus("No se pudo subir a Supabase.", options.statusId);
    return false;
  }
}

function renderCloudStatus(message, targetId = "cloudStatus") {
  const target = document.getElementById(targetId);
  if (target) {
    target.textContent = message;
  }
}

function printTicket(sale) {
  if (!sale) {
    showToast("No hay ventas para imprimir.");
    return;
  }
  const product = findProduct(sale.productId);
  const user = state.users.find((item) => item.id === sale.userId);
  const lines = [
    state.settings.businessName,
    "Ticket de venta",
    `Fecha: ${formatDate(sale.date)}`,
    `Producto: ${product?.name || "Producto"}`,
    `Cantidad: ${sale.quantity}`,
    `Canal: ${sale.channel}`,
    `Total: ${money(sale.total)}`,
    `Recibido: ${money(sale.amountReceived || 0)}`,
    `Vuelto: ${money(sale.changeDue || 0)}`,
    `Atendido por: ${user?.name || "Usuario"}`,
    "Gracias por su compra"
  ];
  const win = window.open("", "_blank", "width=320,height=600");
  if (!win) {
    showToast("Permite ventanas emergentes para imprimir.");
    return;
  }
  win.document.write(`<pre style="font:16px monospace;white-space:pre-wrap">${escapeHTML(lines.join("\n"))}</pre>`);
  win.document.close();
  win.print();
}

function exportSales() {
  downloadCSV("ventas.csv", [["fecha", "producto", "cantidad", "canal", "total", "recibido", "vuelto", "costo", "margen", "observaciones"], ...state.sales.map((sale) => {
    const product = findProduct(sale.productId);
    return [sale.date, product?.name || "", sale.quantity, sale.channel, sale.total, sale.amountReceived || 0, sale.changeDue || 0, sale.cost, sale.total - sale.cost, sale.notes || ""];
  })]);
}

function exportInventory() {
  downloadCSV("inventario.csv", [["fecha", "insumo", "unidad", "stock", "minimo", "costo_unitario", "valor"], ...state.ingredients.map((item) => [item.date || "", item.name, item.unit, item.stock, item.minStock, item.cost, item.stock * item.cost])]);
}

function exportExpenses() {
  downloadCSV("gastos.csv", [["fecha", "concepto", "categoria", "monto"], ...state.expenses.map((expense) => [expense.date, expense.concept, expense.category, expense.amount])]);
}

function exportClosings() {
  downloadCSV("cierres-caja.csv", [["apertura", "cierre", "usuario", "inicial", "ventas", "gastos", "esperado", "contado"], ...state.shifts.map((shift) => {
    const stats = shiftStats(shift.id);
    const user = state.users.find((item) => item.id === shift.userId);
    return [shift.openedAt, shift.closedAt, user?.name || "", shift.openingCash, stats.salesTotal, stats.expensesTotal, stats.expectedCash, shift.closingCash];
  })]);
}

function buildReportSheets() {
  return {
    ventas: [["fecha", "producto", "cantidad", "canal", "total", "recibido", "vuelto", "costo", "margen", "observaciones"], ...state.sales.map((sale) => {
      const product = findProduct(sale.productId);
      return [sale.date, product?.name || "", sale.quantity, sale.channel, sale.total, sale.amountReceived || 0, sale.changeDue || 0, sale.cost, sale.total - sale.cost, sale.notes || ""];
    })],
    insumos: [["fecha", "insumo", "unidad", "stock", "minimo", "costo_unitario", "valor"], ...state.ingredients.map((item) => [item.date || "", item.name, item.unit, item.stock, item.minStock, item.cost, item.stock * item.cost])],
    compras: [["fecha", "proveedor", "insumo", "cantidad", "total"], ...state.purchases.map((purchase) => [purchase.date, purchase.supplier, findIngredient(purchase.ingredientId)?.name || "", purchase.quantity, purchase.total])],
    gastos: [["fecha", "concepto", "categoria", "monto"], ...state.expenses.map((expense) => [expense.date, expense.concept, expense.category, expense.amount])],
    caja: [["apertura", "cierre", "usuario", "inicial", "ventas", "gastos", "esperado", "contado"], ...state.shifts.map((shift) => {
      const stats = shiftStats(shift.id);
      const user = state.users.find((item) => item.id === shift.userId);
      return [shift.openedAt, shift.closedAt, user?.name || "", shift.openingCash, stats.salesTotal, stats.expensesTotal, stats.expectedCash, shift.closingCash];
    })]
  };
}

function exportReportsXML() {
  const sheets = buildReportSheets();
  const xml = `<?xml version="1.0" encoding="UTF-8"?><reportes>${Object.entries(sheets).map(([name, rows]) => `<hoja nombre="${xmlEscape(name)}">${rows.slice(1).map((row) => `<registro>${rows[0].map((head, index) => `<${safeXmlTag(head)}>${xmlEscape(row[index] ?? "")}</${safeXmlTag(head)}>`).join("")}</registro>`).join("")}</hoja>`).join("")}</reportes>`;
  downloadBlob("reportes.xml", new Blob([xml], { type: "application/xml;charset=utf-8" }));
}

function exportReportsXLSX() {
  const sheets = buildReportSheets();
  downloadBlob("reportes.xlsx", createXlsxBlob(sheets));
}

function downloadCSV(filename, rows) {
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  downloadBlob(filename, new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
}

function downloadBlob(filename, blob) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function createXlsxBlob(sheets) {
  const sheetNames = Object.keys(sheets);
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetNames.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetNames.map((name, i) => `<sheet name="${xmlEscape(name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetNames.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`
  };
  sheetNames.forEach((name, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sheets[name]);
  });
  return new Blob([zipStore(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function sheetXml(rows) {
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => `<c r="${columnName(c)}${r + 1}" t="inlineStr"><is><t>${xmlEscape(value ?? "")}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
}

function zipStore(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  Object.entries(files).forEach(([name, text]) => {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(text);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    chunks.push(local, data);
    const header = new Uint8Array(46 + nameBytes.length);
    const hview = new DataView(header.buffer);
    hview.setUint32(0, 0x02014b50, true);
    hview.setUint16(4, 20, true);
    hview.setUint16(6, 20, true);
    hview.setUint32(16, crc, true);
    hview.setUint32(20, data.length, true);
    hview.setUint32(24, data.length, true);
    hview.setUint16(28, nameBytes.length, true);
    hview.setUint32(42, offset, true);
    header.set(nameBytes, 46);
    central.push(header);
    offset += local.length + data.length;
  });
  const centralSize = central.reduce((total, item) => total + item.length, 0);
  const end = new Uint8Array(22);
  const eview = new DataView(end.buffer);
  eview.setUint32(0, 0x06054b50, true);
  eview.setUint16(8, central.length, true);
  eview.setUint16(10, central.length, true);
  eview.setUint32(12, centralSize, true);
  eview.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end]);
}

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function columnName(index) {
  let name = "";
  let number = index + 1;
  while (number) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }
  return name;
}

function xmlEscape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function safeXmlTag(value) {
  return String(value).replace(/[^a-zA-Z0-9_]/g, "_").replace(/^[^a-zA-Z_]/, "_$&");
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function findIngredient(id) {
  return state.ingredients.find((ingredient) => ingredient.id === id);
}

function findProduct(id) {
  return state.products.find((product) => product.id === id);
}

function sum(items, field) {
  return items.reduce((total, item) => total + Number(item[field] || 0), 0);
}

function money(value) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Number(value || 0));
}

function round(value) {
  return Number(value).toLocaleString("es-PE", { maximumFractionDigits: 2 });
}

function roundInput(value) {
  return Number(value || 0).toFixed(2);
}

function todayISO() {
  return localISO(new Date());
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localISO(date);
}

function localISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setDefaultDates() {
  document.querySelectorAll('input[type="date"]').forEach((input) => {
    if (!input.value) {
      input.value = todayISO();
    }
  });
}

function makeLocalDateTime(dateValue) {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${dateValue}T${hours}:${minutes}:${seconds}`;
}

function periodStart(type) {
  const date = new Date();
  if (type === "week") {
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1);
  }
  if (type === "month") {
    date.setDate(1);
  }
  date.setHours(0, 0, 0, 0);
  return localISO(date);
}

function makeId(prefix) {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }
  return new Date(value).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function shortDay(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-PE", { weekday: "short" });
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2400);
}
