let state = {
  currentUser: null,
  users: [],
  items: [],
  audit: [],
};

const FALLBACK_STORAGE_KEY = "inventory-control-fallback";
let usingFallbackStorage = false;
let authMode = "login";
let selectedPhoto = "";

const authPanel = document.querySelector("#authPanel");
const dashboard = document.querySelector("#dashboard");
const authForm = document.querySelector("#authForm");
const loginTab = document.querySelector("#loginTab");
const signupTab = document.querySelector("#signupTab");
const authSubmit = document.querySelector("#authSubmit");
const authNote = document.querySelector("#authNote");
const nameField = document.querySelector("#nameField");
const nameInput = document.querySelector("#nameInput");
const emailInput = document.querySelector("#emailInput");
const passwordInput = document.querySelector("#passwordInput");
const signOutButton = document.querySelector("#signOutButton");
const inventoryForm = document.querySelector("#inventoryForm");
const photoInput = document.querySelector("#photoInput");
const photoPreview = document.querySelector("#photoPreview");
const inventoryList = document.querySelector("#inventoryList");
const auditList = document.querySelector("#auditList");
const userList = document.querySelector("#userList");
const inventoryCount = document.querySelector("#inventoryCount");
const welcomeTitle = document.querySelector("#welcomeTitle");
const roleLabel = document.querySelector("#roleLabel");
const toast = document.querySelector("#toast");

function currentUser() {
  return state.currentUser;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2600);
}

async function apiRequest(path, options = {}) {
  if (usingFallbackStorage) {
    return fallbackRequest(path, options);
  }

  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (String(payload.error || "").includes("missing_connection_string")) {
      usingFallbackStorage = true;
      showToast("Database is not connected. Using browser storage for now.");
      return fallbackRequest(path, options);
    }

    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadFallbackState() {
  const saved = localStorage.getItem(FALLBACK_STORAGE_KEY);
  if (saved) {
    return JSON.parse(saved);
  }

  return {
    users: [
      {
        id: "admin",
        name: "Admin User",
        email: "admin@inventory.local",
        password: "admin123",
        role: "admin",
        approved: true,
        createdAt: new Date().toISOString(),
      },
    ],
    items: [],
    audit: [],
  };
}

function saveFallbackState(data) {
  localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(data));
}

function publicFallbackUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    approved: user.approved,
    createdAt: user.createdAt,
  };
}

function addFallbackAudit(data, action, details, user) {
  data.audit.unshift({
    id: createId(),
    action,
    details,
    userId: user.id,
    userName: user.name,
    timestamp: new Date().toISOString(),
  });
}

async function fallbackRequest(path, options = {}) {
  const data = loadFallbackState();
  const body = options.body ? JSON.parse(options.body) : {};

  if (path === "/api/state") {
    return {
      users: data.users.map(publicFallbackUser),
      items: data.items,
      audit: data.audit,
    };
  }

  if (path === "/api/signup") {
    if (data.users.some((user) => user.email === body.email)) {
      throw new Error("An account with this email already exists.");
    }

    data.users.push({
      id: createId(),
      name: body.name,
      email: body.email,
      password: body.password,
      role: "user",
      approved: false,
      createdAt: new Date().toISOString(),
    });
    saveFallbackState(data);
    return { ok: true };
  }

  if (path === "/api/login") {
    const user = data.users.find((item) => item.email === body.email && item.password === body.password);
    if (!user) throw new Error("Sign in failed. Check email and password.");
    if (!user.approved) throw new Error("Your account is waiting for admin approval.");

    addFallbackAudit(data, "User signed in", `${user.name} signed in`, user);
    saveFallbackState(data);
    return { user: publicFallbackUser(user) };
  }

  if (path === "/api/items") {
    const user = data.users.find((item) => item.id === body.updatedById && item.approved);
    if (!user) throw new Error("Approved user is required.");

    const now = new Date().toISOString();
    const item = {
      id: createId(),
      sku: body.sku,
      name: body.name,
      quantity: Number(body.quantity),
      photo: body.photo,
      location: body.location,
      updatedById: user.id,
      updatedByName: user.name,
      updatedAt: now,
      createdAt: now,
    };

    data.items.unshift(item);
    addFallbackAudit(data, "Inventory item added", `${item.name} (${item.sku}), quantity ${item.quantity}, location ${item.location}`, user);
    saveFallbackState(data);
    return { ok: true };
  }

  if (path === "/api/approve-user") {
    const admin = data.users.find((item) => item.id === body.adminId && item.role === "admin" && item.approved);
    const user = data.users.find((item) => item.id === body.userId);
    if (!admin) throw new Error("Admin permission is required.");
    if (!user) throw new Error("User was not found.");

    user.approved = true;
    addFallbackAudit(data, "User approved", `${user.name} (${user.email})`, admin);
    saveFallbackState(data);
    return { ok: true };
  }

  throw new Error("Request failed.");
}

async function refreshState() {
  try {
    const data = await apiRequest("/api/state");
    state.users = data.users || [];
    state.items = data.items || [];
    state.audit = data.audit || [];
  } catch (error) {
    showToast(error.message || "Could not load inventory data.");
  }
}

function setAuthMode(mode) {
  authMode = mode;
  const isLogin = mode === "login";
  loginTab.classList.toggle("active", isLogin);
  signupTab.classList.toggle("active", !isLogin);
  nameField.classList.toggle("hidden", isLogin);
  nameInput.required = !isLogin;
  nameInput.value = isLogin ? "" : nameInput.value;
  authSubmit.textContent = isLogin ? "Sign in" : "Request access";
  authNote.innerHTML = isLogin
    ? 'Admin: <strong>admin@inventory.local</strong> / <strong>admin123</strong>'
    : "New accounts stay pending until an admin approves them.";
}

function renderApp() {
  const user = currentUser();
  authPanel.classList.toggle("hidden", Boolean(user));
  dashboard.classList.toggle("hidden", !user);

  if (!user) return;

  const isAdmin = user.role === "admin";
  welcomeTitle.textContent = `Welcome, ${user.name}`;
  roleLabel.textContent = isAdmin ? "Admin dashboard" : "Inventory user";

  document.querySelectorAll(".admin-only").forEach((node) => {
    node.classList.toggle("hidden", !isAdmin);
  });

  renderInventory();
  renderAudit(isAdmin);
  renderUsers(isAdmin);
  setMobileView("inventoryView");
}

function renderInventory() {
  inventoryCount.textContent = `${state.items.length} ${state.items.length === 1 ? "item" : "items"}`;

  if (!state.items.length) {
    inventoryList.innerHTML = '<p class="empty-state">No inventory has been added yet.</p>';
    return;
  }

  inventoryList.innerHTML = state.items
    .map(
      (item) => `
        <article class="item-card">
          <img src="${item.photo}" alt="${escapeHtml(item.name)} photo" />
          <div>
            <div class="item-title">
              <strong>${escapeHtml(item.name)}</strong>
              <span class="pill">Qty ${item.quantity}</span>
            </div>
            <div class="item-meta">
              <span>SKU: ${escapeHtml(item.sku)}</span>
              <span>Location: ${escapeHtml(item.location)}</span>
              <span>Updated by ${escapeHtml(item.updatedByName)}</span>
              <span>${formatDate(item.updatedAt)}</span>
            </div>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderAudit(isAdmin) {
  if (!isAdmin) {
    auditList.innerHTML = '<p class="empty-state">Admin approval is required to view all audit records.</p>';
    return;
  }

  if (!state.audit.length) {
    auditList.innerHTML = '<p class="empty-state">No activity has been recorded yet.</p>';
    return;
  }

  auditList.innerHTML = state.audit
    .map(
      (entry) => `
        <article class="audit-row">
          <div>
            <strong>${escapeHtml(entry.action)}</strong>
            <div class="audit-meta">
              <span>${escapeHtml(entry.details)}</span>
              <span>By ${escapeHtml(entry.userName)}</span>
              <span>${formatDate(entry.timestamp)}</span>
            </div>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderUsers(isAdmin) {
  if (!isAdmin) return;

  const regularUsers = state.users.filter((user) => user.role !== "admin");

  if (!regularUsers.length) {
    userList.innerHTML = '<p class="empty-state">No user requests yet.</p>';
    return;
  }

  userList.innerHTML = regularUsers
    .map(
      (user) => `
        <article class="user-row">
          <div>
            <strong>${escapeHtml(user.name)}</strong>
            <div class="user-meta">
              <span>${escapeHtml(user.email)}</span>
              <span>${user.approved ? "Approved" : '<span class="pending">Pending approval</span>'}</span>
              <span>Requested ${formatDate(user.createdAt)}</span>
            </div>
          </div>
          ${
            user.approved
              ? '<span class="pill">Active</span>'
              : `<button class="approve-button" type="button" data-approve="${user.id}">Approve</button>`
          }
        </article>
      `,
    )
    .join("");
}

function setMobileView(viewId) {
  const user = currentUser();
  const allowedView = user?.role === "admin" ? viewId : viewId === "usersView" ? "inventoryView" : viewId;

  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("active-view", panel.id === allowedView || (!panel.id && allowedView === "inventoryView"));
  });

  document.querySelectorAll(".mobile-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === allowedView);
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}

loginTab.addEventListener("click", () => setAuthMode("login"));
signupTab.addEventListener("click", () => setAuthMode("signup"));

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = nameInput.value.trim();
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  try {
    if (authMode === "signup") {
      if (!name) {
        showToast("Please enter your full name.");
        return;
      }

      await apiRequest("/api/signup", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      authForm.reset();
      setAuthMode("login");
      showToast("Access request sent. Admin approval is required.");
      return;
    }

    const { user } = await apiRequest("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    state.currentUser = user;
    await refreshState();
    renderApp();
  } catch (error) {
    showToast(error.message);
  }
});

signOutButton.addEventListener("click", () => {
  state.currentUser = null;
  renderApp();
});

photoInput.addEventListener("change", () => {
  const file = photoInput.files?.[0];
  if (!file) {
    selectedPhoto = "";
    photoPreview.innerHTML = "<span>No photo selected</span>";
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    selectedPhoto = reader.result;
    photoPreview.innerHTML = `<img src="${selectedPhoto}" alt="Selected inventory item" />`;
  });
  reader.readAsDataURL(file);
});

inventoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const user = currentUser();

  if (!user) return;
  if (!selectedPhoto) {
    showToast("Please add a photo before saving.");
    return;
  }

  const item = {
    sku: document.querySelector("#skuInput").value.trim(),
    name: document.querySelector("#itemNameInput").value.trim(),
    quantity: Number(document.querySelector("#quantityInput").value),
    photo: selectedPhoto,
    location: document.querySelector("#locationInput").value.trim(),
    updatedById: user.id,
  };

  try {
    await apiRequest("/api/items", {
      method: "POST",
      body: JSON.stringify(item),
    });

    inventoryForm.reset();
    selectedPhoto = "";
    photoPreview.innerHTML = "<span>No photo selected</span>";
    await refreshState();
    renderApp();
    showToast("Inventory item saved.");
  } catch (error) {
    showToast(error.message);
  }
});

userList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-approve]");
  if (!button || !currentUser()) return;

  try {
    await apiRequest("/api/approve-user", {
      method: "POST",
      body: JSON.stringify({
        userId: button.dataset.approve,
        adminId: currentUser().id,
      }),
    });
    await refreshState();
    renderApp();
    showToast("User approved.");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelectorAll(".mobile-tab").forEach((button) => {
  button.addEventListener("click", () => setMobileView(button.dataset.view));
});

setAuthMode("login");
renderApp();
