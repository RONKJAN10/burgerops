const STORAGE_KEY = "burgerops-state-v1";

const demoState = {
  ingredients: [
    { id: "ing-1", name: "Carne premium", unit: "kg", stock: 18, minStock: 6, cost: 28 },
    { id: "ing-2", name: "Pan brioche", unit: "unidad", stock: 96, minStock: 30, cost: 1.2 },
    { id: "ing-3", name: "Queso cheddar", unit: "unidad", stock: 84, minStock: 28, cost: 0.9 },
    { id: "ing-4", name: "Tocino ahumado", unit: "kg", stock: 4.8, minStock: 2, cost: 36 },
    { id: "ing-5", name: "Papas congeladas", unit: "kg", stock: 22, minStock: 8, cost: 7.5 },
    { id: "ing-6", name: "Salsa de casa", unit: "litro", stock: 5, minStock: 2, cost: 10 }
  ],
  products: [
    {
      id: "prod-1",
      name: "Cheeseburger clasica",
      price: 18,
      recipe: [
        { ingredientId: "ing-1", quantity: 0.15 },
        { ingredientId: "ing-2", quantity: 1 },
        { ingredientId: "ing-3", quantity: 1 },
        { ingredientId: "ing-6", quantity: 0.03 }
      ]
    },
    {
      id: "prod-2",
      name: "Bacon burger",
      price: 24,
      recipe: [
        { ingredientId: "ing-1", quantity: 0.18 },
        { ingredientId: "ing-2", quantity: 1 },
        { ingredientId: "ing-3", quantity: 1 },
        { ingredientId: "ing-4", quantity: 0.06 },
        { ingredientId: "ing-6", quantity: 0.03 }
      ]
    },
    {
      id: "prod-3",
      name: "Combo burger papas",
      price: 28,
      recipe: [
        { ingredientId: "ing-1", quantity: 0.15 },
        { ingredientId: "ing-2", quantity: 1 },
        { ingredientId: "ing-3", quantity: 1 },
        { ingredientId: "ing-5", quantity: 0.22 },
        { ingredientId: "ing-6", quantity: 0.03 }
      ]
    }
  ],
  purchases: [
    { id: "pur-1", date: daysAgo(4), supplier: "Distribuidora Central", ingredientId: "ing-1", quantity: 10, total: 280 },
    { id: "pur-2", date: daysAgo(2), supplier: "Panaderia Norte", ingredientId: "ing-2", quantity: 80, total: 96 }
  ],
  sales: [
    { id: "sale-1", date: daysAgo(6), productId: "prod-1", quantity: 9, channel: "Salon", total: 162, cost: 48.33 },
    { id: "sale-2", date: daysAgo(5), productId: "prod-2", quantity: 7, channel: "Delivery", total: 168, cost: 65.24 },
    { id: "sale-3", date: daysAgo(4), productId: "prod-3", quantity: 10, channel: "Salon", total: 280, cost: 78.5 },
    { id: "sale-4", date: daysAgo(2), productId: "prod-1", quantity: 14, channel: "Recojo", total: 252, cost: 75.18 },
    { id: "sale-5", date: daysAgo(1), productId: "prod-2", quantity: 8, channel: "Salon", total: 192, cost: 74.56 },
    { id: "sale-6", date: todayISO(), productId: "prod-3", quantity: 12, channel: "Delivery", total: 336, cost: 94.2 }
  ]
};

let state = loadState();
let deferredInstallPrompt = null;

const views = {
  dashboard: "Dashboard",
  insumos: "Insumos",
  compras: "Compras",
  recetas: "Recetas",
  ventas: "Ventas",
  reportes: "Reportes"
};

document.addEventListener("DOMContentLoaded", () => {
  registerMobileApp();
  bindNavigation();
  bindForms();
  renderAll();
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  document.getElementById("installApp")?.removeAttribute("hidden");
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  document.getElementById("installApp")?.setAttribute("hidden", "");
  showToast("BurgerOps instalado en tu celular.");
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
  document.getElementById("resetDemo").addEventListener("click", () => {
    state = structuredClone(demoState);
    saveState();
    renderAll();
    showToast("Datos demo restaurados.");
  });
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
      cost: unitCost * quantity
    });

    form.reset();
    form.quantity.value = 1;
    persistAndRender("Venta registrada y stock descontado.");
  });

  document.getElementById("saleProduct").addEventListener("change", renderSaleHint);
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
  renderSelectors();
  renderMetrics();
  renderDashboard();
  renderIngredients();
  renderPurchases();
  renderRecipeBuilder();
  renderProducts();
  renderSales();
  renderReports();
  renderSaleHint();
}

function renderSelectors() {
  const ingredientOptions = state.ingredients
    .map((ingredient) => `<option value="${ingredient.id}">${escapeHTML(ingredient.name)} (${ingredient.unit})</option>`)
    .join("");
  document.getElementById("purchaseIngredient").innerHTML = ingredientOptions;

  const productOptions = state.products
    .map((product) => `<option value="${product.id}">${escapeHTML(product.name)} - ${money(product.price)}</option>`)
    .join("");
  document.getElementById("saleProduct").innerHTML = productOptions;
}

function renderMetrics() {
  const salesToday = state.sales.filter((sale) => sale.date === todayISO());
  const revenueToday = sum(salesToday, "total");
  const revenueTotal = sum(state.sales, "total");
  const grossMargin = revenueTotal ? ((revenueTotal - sum(state.sales, "cost")) / revenueTotal) * 100 : 0;
  const inventoryValue = state.ingredients.reduce((total, item) => total + item.stock * item.cost, 0);
  const critical = state.ingredients.filter((item) => item.stock <= item.minStock).length;

  document.getElementById("sidebarInventory").textContent = money(inventoryValue);
  document.getElementById("metricsGrid").innerHTML = [
    metric("Ventas hoy", money(revenueToday), `${sum(salesToday, "quantity")} productos vendidos`),
    metric("Margen bruto", `${grossMargin.toFixed(1)}%`, "Sobre ventas registradas"),
    metric("Inventario", money(inventoryValue), "Valor estimado en stock"),
    metric("Alertas", critical, "Insumos en nivel critico")
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
}

function renderIngredients() {
  document.getElementById("ingredientsTable").innerHTML = state.ingredients.map((item) => {
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
  }).join("");
}

function renderPurchases() {
  document.getElementById("purchasesTable").innerHTML = state.purchases.map((purchase) => {
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
  }).join("");
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
    <select aria-label="Insumo de receta">${state.ingredients.map((ingredient) => `<option value="${ingredient.id}">${escapeHTML(ingredient.name)}</option>`).join("")}</select>
    <input aria-label="Cantidad por unidad" type="number" min="0.01" step="0.01" placeholder="Cant.">
    <button class="icon-button" type="button" title="Quitar linea">x</button>
  `;
  line.querySelector("button").addEventListener("click", () => line.remove());
  builder.appendChild(line);
}

function renderProducts() {
  document.getElementById("productsList").innerHTML = state.products.map((product) => {
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
  }).join("");
}

function renderSales() {
  document.getElementById("salesTable").innerHTML = state.sales.map((sale) => {
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
  }).join("");
}

function renderReports() {
  const revenue = sum(state.sales, "total");
  const cost = sum(state.sales, "cost");
  const purchases = sum(state.purchases, "total");
  const tickets = state.sales.length;
  const averageTicket = tickets ? revenue / tickets : 0;
  const units = sum(state.sales, "quantity");

  document.getElementById("reportGrid").innerHTML = [
    reportCard("Ventas acumuladas", money(revenue), `${units} unidades`),
    reportCard("Costo vendido", money(cost), "Segun recetas"),
    reportCard("Utilidad bruta", money(revenue - cost), "Antes de gastos fijos"),
    reportCard("Ticket promedio", money(averageTicket), `${tickets} tickets`),
    reportCard("Compras registradas", money(purchases), "Reposicion de insumos"),
    reportCard("Productos activos", state.products.length, "Con receta configurada")
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

function metric(label, value, help) {
  return `<article class="metric"><span>${label}</span><strong>${value}</strong><small>${help}</small></article>`;
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

function persistAndRender(message) {
  saveState();
  renderAll();
  showToast(message);
}

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : structuredClone(demoState);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
