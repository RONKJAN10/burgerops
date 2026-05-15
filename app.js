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

let state = loadState();
let deferredInstallPrompt = null;
let currentUserId = localStorage.getItem(SESSION_KEY);

const views = {
  dashboard: "Dashboard",
  insumos: "Insumos",
  compras: "Compras",
  recetas: "Recetas",
  ventas: "Ventas",
  caja: "Caja",
  gastos: "Gastos",
  reportes: "Reportes",
  usuarios: "Usuarios"
};

document.addEventListener("DOMContentLoaded", () => {
  registerMobileApp();
  bindAuth();
  bindNavigation();
  bindForms();
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
    const confirmed = window.confirm("Esto borrara insumos, compras, recetas y ventas. Los usuarios y el logo se conservaran. Deseas continuar?");
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
  document.getElementById("setupForm").addEventListener("submit", (event) => {
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

  document.getElementById("loginForm").addEventListener("submit", (event) => {
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
  document.getElementById("ingredientForm").addEventListener("submit", (event) => {
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
    persistAndRender("Insumo registrado.");
  });

  document.getElementById("purchaseForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const ingredient = findIngredient(data.ingredientId);
    if (!ingredient) {
      showToast("Primero registra un insumo.");
      return;
    }
    const quantity = Number(data.quantity);
    const total = Number(data.total);
    ingredient.stock += quantity;
    ingredient.cost = total / quantity;
    state.purchases.unshift({
      id: makeId("pur"),
      date: todayISO(),
      supplier: data.supplier.trim(),
      ingredientId: data.ingredientId,
      quantity,
      total
    });
    form.reset();
    persistAndRender("Compra registrada y stock actualizado.");
  });

  document.getElementById("addRecipeLine").addEventListener("click", () => addRecipeLine());

  document.getElementById("recipeForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!state.ingredients.length) {
      showToast("Primero registra insumos para crear recetas.");
      return;
    }
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const rows = [...document.querySelectorAll(".recipe-line")];
    const recipe = rows
      .map((row) => ({
        ingredientId: row.querySelector("select").value,
        quantity: Number(row.querySelector("input").value)
      }))
      .filter((line) => line.ingredientId && line.quantity > 0);

    if (!recipe.length) {
      showToast("Agrega al menos un insumo a la receta.");
      return;
    }

    state.products.push({
      id: makeId("prod"),
      name: data.name.trim(),
      price: Number(data.price),
      recipe
    });
    form.reset();
    renderRecipeBuilder();
    persistAndRender("Receta guardada.");
  });

  document.getElementById("saleForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const product = findProduct(data.productId);
    if (!product) {
      showToast("Primero crea un producto con receta.");
      return;
    }
    const activeShift = getActiveShift();
    if (!activeShift) {
      showToast("Abre caja antes de registrar ventas.");
      showView("caja");
      return;
    }
    const quantity = Number(data.quantity);
    const availability = checkAvailability(product, quantity);

    if (!availability.ok) {
      showToast(`Stock insuficiente: ${availability.name}.`);
      return;
    }

    product.recipe.forEach((line) => {
      findIngredient(line.ingredientId).stock -= line.quantity * quantity;
    });

    const unitCost = productCost(product);
    state.sales.unshift({
      id: makeId("sale"),
      date: todayISO(),
      productId: product.id,
      quantity,
      channel: data.channel,
      total: product.price * quantity,
      cost: unitCost * quantity,
      shiftId: activeShift.id,
      userId: currentUserId
    });

    form.reset();
    form.quantity.value = 1;
    persistAndRender("Venta registrada y stock descontado.");
  });

  document.getElementById("saleProduct").addEventListener("change", renderSaleHint);
  document.getElementById("printLastTicket").addEventListener("click", () => printTicket(state.sales[0]));

  document.getElementById("shiftForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const activeShift = getActiveShift();
    if (activeShift) {
      activeShift.closedAt = new Date().toISOString();
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
      openedAt: new Date().toISOString(),
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

  document.getElementById("expenseForm").addEventListener("submit", (event) => {
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
      date: todayISO(),
      createdAt: new Date().toISOString(),
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

  document.getElementById("userForm").addEventListener("submit", (event) => {
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
  renderSelectors();
  renderMetrics();
  renderDashboard();
  renderIngredients();
  renderPurchases();
  renderRecipeBuilder();
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
  document.getElementById("restorePanel").hidden = !canAdmin;
  document.querySelector('[data-view="usuarios"]').hidden = !canAdmin;
}

function renderSelectors() {
  const ingredientOptions = state.ingredients
    .map((ingredient) => `<option value="${ingredient.id}">${escapeHTML(ingredient.name)} (${ingredient.unit})</option>`)
    .join("");
  document.getElementById("purchaseIngredient").innerHTML = ingredientOptions || `<option value="">Sin insumos</option>`;
  document.getElementById("purchaseIngredient").disabled = !state.ingredients.length;

  const productOptions = state.products
    .map((product) => `<option value="${product.id}">${escapeHTML(product.name)} - ${money(product.price)}</option>`)
    .join("");
  document.getElementById("saleProduct").innerHTML = productOptions || `<option value="">Sin productos</option>`;
  document.getElementById("saleProduct").disabled = !state.products.length;
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
  if (state.ingredients.length && !state.products.length) {
    actions.push(actionCard("Crear recetas", "Configura productos para poder vender y descontar stock.", "recetas", "warn"));
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
      </tr>
    `;
  }).join("") : `<tr><td data-label="Fecha"><strong>Sin compras registradas</strong></td><td data-label="Siguiente paso">Registra entradas de inventario.</td></tr>`;
}

function renderRecipeBuilder() {
  const builder = document.getElementById("recipeBuilder");
  builder.innerHTML = "";
  addRecipeLine();
}

function addRecipeLine() {
  const builder = document.getElementById("recipeBuilder");
  const line = document.createElement("div");
  line.className = "recipe-line";
  line.innerHTML = `
    <select aria-label="Insumo de receta" ${state.ingredients.length ? "" : "disabled"}>${state.ingredients.map((ingredient) => `<option value="${ingredient.id}">${escapeHTML(ingredient.name)}</option>`).join("") || `<option value="">Sin insumos</option>`}</select>
    <input aria-label="Cantidad por unidad" type="number" min="0.01" step="0.01" placeholder="Cant.">
    <button class="icon-button" type="button" title="Quitar linea">x</button>
  `;
  line.querySelector("button").addEventListener("click", () => line.remove());
  builder.appendChild(line);
}

function renderProducts() {
  document.getElementById("productsList").innerHTML = state.products.length ? state.products.map((product) => {
    const cost = productCost(product);
    const margin = product.price ? ((product.price - cost) / product.price) * 100 : 0;
    const detail = product.recipe.map((line) => {
      const ingredient = findIngredient(line.ingredientId);
      return `${round(line.quantity)} ${ingredient?.unit || ""} ${ingredient?.name || ""}`;
    }).join(" / ");
    return `
      <div class="product-card">
        <div>
          <strong>${escapeHTML(product.name)}</strong>
          <span>${escapeHTML(detail)}</span>
        </div>
        <div>
          <strong>${money(product.price)}</strong>
          <span>Costo ${money(cost)} / margen ${margin.toFixed(1)}%</span>
        </div>
      </div>
    `;
  }).join("") : emptyRow("Sin productos configurados", "Crea recetas cuando tengas insumos registrados.");
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
    reportCard("Utilidad bruta", money(revenue - cost), "Antes de gastos fijos"),
    reportCard("Gastos", money(expenses), "Egresos registrados"),
    reportCard("Ticket promedio", money(averageTicket), `${tickets} tickets`),
    reportCard("Compras registradas", money(purchases), "Reposicion de insumos"),
    reportCard("Caja neta", money(revenue - expenses), "Ventas menos gastos")
  ].join("");

  const suggestions = state.ingredients
    .filter((item) => item.stock <= item.minStock * 1.5)
    .map((item) => {
      const target = item.minStock * 2;
      const quantity = Math.max(0, target - item.stock);
      return listRow(item.name, `Comprar ${round(quantity)} ${item.unit}`, money(quantity * item.cost), item.stock <= item.minStock ? "bad" : "warn");
    });
  document.getElementById("shoppingSuggestions").innerHTML = suggestions.join("") || emptyRow("Sin compras sugeridas", "El stock actual cubre el minimo.");
}

function renderSaleHint() {
  const select = document.getElementById("saleProduct");
  const hint = document.getElementById("saleHint");
  const product = findProduct(select.value);
  if (!product) {
    hint.textContent = "Configura un producto para empezar a vender.";
    return;
  }
  const cost = productCost(product);
  const maxUnits = maxSellableUnits(product);
  hint.textContent = `Precio ${money(product.price)} | costo ${money(cost)} | maximo vendible con stock actual: ${maxUnits}`;
}

function productCost(product) {
  return product.recipe.reduce((total, line) => {
    const ingredient = findIngredient(line.ingredientId);
    return total + (ingredient ? ingredient.cost * line.quantity : 0);
  }, 0);
}

function maxSellableUnits(product) {
  if (!product.recipe.length) {
    return 0;
  }
  return Math.floor(Math.min(...product.recipe.map((line) => {
    const ingredient = findIngredient(line.ingredientId);
    return ingredient ? ingredient.stock / line.quantity : 0;
  })));
}

function checkAvailability(product, quantity) {
  for (const line of product.recipe) {
    const ingredient = findIngredient(line.ingredientId);
    if (!ingredient || ingredient.stock < line.quantity * quantity) {
      return { ok: false, name: ingredient?.name || "insumo faltante" };
    }
  }
  return { ok: true };
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

function persistAndRender(message) {
  saveState();
  renderAll();
  showToast(message);
}

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return normalizeState(stored ? JSON.parse(stored) : structuredClone(blankState));
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
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
    shifts: Array.isArray(value?.shifts) ? value.shifts : []
  };
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
  downloadCSV("ventas.csv", [["fecha", "producto", "cantidad", "canal", "total", "costo", "margen"], ...state.sales.map((sale) => {
    const product = findProduct(sale.productId);
    return [sale.date, product?.name || "", sale.quantity, sale.channel, sale.total, sale.cost, sale.total - sale.cost];
  })]);
}

function exportInventory() {
  downloadCSV("inventario.csv", [["insumo", "unidad", "stock", "minimo", "costo_unitario", "valor"], ...state.ingredients.map((item) => [item.name, item.unit, item.stock, item.minStock, item.cost, item.stock * item.cost])]);
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

function downloadCSV(filename, rows) {
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
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
