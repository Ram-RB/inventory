let state = {
  currentUser: null,
  users: [],
  items: [],
  audit: [],
};

const SESSION_STORAGE_KEY = "inventory-control-current-user";
const VIEW_STORAGE_KEY = "inventory-control-active-view";
const AUDIT_SORT_STORAGE_KEY = "inventory-control-audit-sort";
const REFRESH_INTERVAL_MS = 5000;
let activeViewId = localStorage.getItem(VIEW_STORAGE_KEY) || "inventoryView";
let auditSortMode = localStorage.getItem(AUDIT_SORT_STORAGE_KEY) || "timestamp-desc";
let selectedPhoto = "";
let refreshTimer = null;
let inventorySearchTerm = "";
let auditSearchTerm = "";
let editingItemId = null;

const authPanel = document.querySelector("#authPanel");
const dashboard = document.querySelector("#dashboard");
const loginForm = document.querySelector("#loginForm");
const signupForm = document.querySelector("#signupForm");
const loginSubmit = document.querySelector("#loginSubmit");
const signupSubmit = document.querySelector("#signupSubmit");
const emailInput = document.querySelector("#emailInput");
const passwordInput = document.querySelector("#passwordInput");
const signupNameInput = document.querySelector("#signupNameInput");
const signupEmailInput = document.querySelector("#signupEmailInput");
const signupPasswordInput = document.querySelector("#signupPasswordInput");
const signOutButton = document.querySelector("#signOutButton");
const inventoryForm = document.querySelector("#inventoryForm");
const photoInput = document.querySelector("#photoInput");
const photoPreview = document.querySelector("#photoPreview");
const inventorySearchInput = document.querySelector("#inventorySearchInput");
const inventorySuggestions = document.querySelector("#inventorySuggestions");
const inventoryList = document.querySelector("#inventoryList");
const auditList = document.querySelector("#auditList");
const auditSearchInput = document.querySelector("#auditSearchInput");
const auditSuggestions = document.querySelector("#auditSuggestions");
const auditSortSelect = document.querySelector("#auditSortSelect");
const userList = document.querySelector("#userList");
const inventoryCount = document.querySelector("#inventoryCount");
const welcomeTitle = document.querySelector("#welcomeTitle");
const roleLabel = document.querySelector("#roleLabel");
const loadingOverlay = document.querySelector("#loadingOverlay");
const loadingText = document.querySelector("#loadingText");
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

function setLoading(isLoading, message = "Loading inventory...") {
  loadingText.textContent = message;
  loadingOverlay.classList.toggle("hidden", !isLoading);
}

function setButtonBusy(button, isBusy, busyText) {
  if (!button) return;
  if (isBusy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    delete button.dataset.originalText;
  }
  button.disabled = isBusy;
}

function saveSession(user) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
}

function loadSession() {
  const saved = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!saved) return null;

  try {
    return JSON.parse(saved);
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

async function refreshState({ silent = false } = {}) {
  try {
    const data = await apiRequest("/api/state");
    state.users = data.users || [];
    state.items = data.items || [];
    state.audit = data.audit || [];
    return true;
  } catch (error) {
    if (!silent) {
      showToast(error.message || "Could not load inventory data.");
    }
    return false;
  }
}

function startRealtimeRefresh() {
  window.clearInterval(refreshTimer);
  refreshTimer = window.setInterval(async () => {
    if (!currentUser() || document.hidden) return;
    const loaded = await refreshState({ silent: true });
    if (!loaded) return;

    const freshUser = state.users.find((user) => user.id === currentUser().id);
    if (freshUser) {
      state.currentUser = freshUser;
      saveSession(freshUser);
    }

    renderApp();
  }, REFRESH_INTERVAL_MS);
}

function stopRealtimeRefresh() {
  window.clearInterval(refreshTimer);
  refreshTimer = null;
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
  renderUsers(isAdmin);
  renderAudit(isAdmin);
  setMobileView(activeViewId);
}

function renderInventory() {
  const filteredItems = filterInventoryItems();
  const hasSearch = Boolean(inventorySearchTerm);
  inventoryCount.textContent = hasSearch
    ? `${filteredItems.length} of ${state.items.length} ${state.items.length === 1 ? "item" : "items"}`
    : `${state.items.length} ${state.items.length === 1 ? "item" : "items"}`;

  if (!state.items.length) {
    inventoryList.innerHTML = '<p class="empty-state">No inventory has been added yet.</p>';
    renderSuggestions();
    return;
  }

  if (!filteredItems.length) {
    inventoryList.innerHTML = '<p class="empty-state">No inventory matches your search.</p>';
    renderSuggestions();
    return;
  }

  inventoryList.innerHTML = filteredItems
    .map(
      (item) => {
        const isEditing = item.id === editingItemId;
        const isAdmin = currentUser()?.role === "admin";

        return `
        <article class="item-card" data-item-id="${item.id}">
          <img src="${item.photo}" alt="${escapeHtml(item.name)} photo" />
          ${
            isEditing
              ? `
                <form class="item-edit-form" data-edit-form="${item.id}">
                  <div class="form-row">
                    <label>
                      SKU
                      <input name="sku" value="${escapeHtml(item.sku)}" required />
                    </label>
                    <label>
                      Quantity
                      <input name="quantity" type="number" min="0" step="1" value="${item.quantity}" required />
                    </label>
                  </div>
                  <label>
                    Item name
                    <input name="name" value="${escapeHtml(item.name)}" required />
                  </label>
                  <label>
                    Stored location
                    <input name="location" value="${escapeHtml(item.location)}" required />
                  </label>
                  <div class="item-actions">
                    <button class="approve-button" type="submit">Save</button>
                    <button class="ghost-small-button" type="button" data-cancel-edit>Cancel</button>
                  </div>
                </form>
              `
              : `
                <div class="item-content">
                  <div class="item-headline">
                    <strong>${escapeHtml(item.name)}</strong>
                    <span class="pill">Qty ${item.quantity}</span>
                  </div>
                  <div class="item-primary">
                    <span><b>SKU</b>${escapeHtml(item.sku)}</span>
                    <span><b>Location</b>${escapeHtml(item.location)}</span>
                  </div>
                  <div class="item-footer">
                    <span>Updated by ${escapeHtml(item.updatedByName)}</span>
                    <span>${formatDate(item.updatedAt)}</span>
                  </div>
                  ${
                    isAdmin
                      ? `
                        <div class="item-actions">
                          <button class="ghost-small-button" type="button" data-edit-item="${item.id}">Edit</button>
                          <button class="danger-button" type="button" data-delete-item="${item.id}">Remove</button>
                        </div>
                      `
                      : ""
                  }
                </div>
              `
          }
        </article>
      `;
      },
    )
    .join("");
  renderSuggestions();
}

function filterInventoryItems() {
  const term = inventorySearchTerm.trim().toLowerCase();
  if (!term) return state.items;

  return state.items.filter((item) =>
    [item.name, item.sku, item.location, item.updatedByName]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term)),
  );
}

function getInventorySuggestions() {
  const term = inventorySearchTerm.trim().toLowerCase();
  if (!term) return [];

  const suggestions = [];
  const seen = new Set();

  state.items.forEach((item) => {
    [
      { label: item.name, detail: `SKU ${item.sku}` },
      { label: item.sku, detail: item.name },
      { label: item.location, detail: "Location" },
    ].forEach((candidate) => {
      if (!candidate.label) return;
      const key = String(candidate.label).toLowerCase();
      if (seen.has(key) || !key.includes(term)) return;
      seen.add(key);
      suggestions.push(candidate);
    });
  });

  return suggestions.slice(0, 6);
}

function renderSuggestions() {
  const suggestions = getInventorySuggestions();
  if (!suggestions.length || document.activeElement !== inventorySearchInput) {
    inventorySuggestions.classList.add("hidden");
    inventorySuggestions.innerHTML = "";
    return;
  }

  inventorySuggestions.innerHTML = suggestions
    .map(
      (suggestion) => `
        <button class="suggestion-option" type="button" data-suggestion="${escapeHtml(suggestion.label)}">
          <strong>${escapeHtml(suggestion.label)}</strong>
          <span>${escapeHtml(suggestion.detail)}</span>
        </button>
      `,
    )
    .join("");
  inventorySuggestions.classList.remove("hidden");
}

function renderAudit(isAdmin) {
  if (!isAdmin) {
    auditList.innerHTML = '<p class="empty-state">Admin approval is required to view all audit records.</p>';
    return;
  }

  if (!state.audit.length) {
    auditList.innerHTML = '<p class="empty-state">No activity has been recorded yet.</p>';
    renderAuditSuggestions();
    return;
  }

  const sortedAudit = getSortedAudit(filterAuditEntries());

  if (!sortedAudit.length) {
    auditList.innerHTML = '<p class="empty-state">No audit records match your search.</p>';
    renderAuditSuggestions();
    return;
  }

  auditList.innerHTML = sortedAudit
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
  renderAuditSuggestions();
}

function filterAuditEntries() {
  const term = auditSearchTerm.trim().toLowerCase();
  if (!term) return state.audit;

  return state.audit.filter((entry) =>
    [entry.action, entry.details, entry.userName, formatDate(entry.timestamp)]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term)),
  );
}

function getAuditSuggestions() {
  const term = auditSearchTerm.trim().toLowerCase();
  if (!term) return [];

  const suggestions = [];
  const seen = new Set();

  state.audit.forEach((entry) => {
    [
      { label: entry.action, detail: "Action" },
      { label: entry.userName, detail: "User" },
      { label: entry.details, detail: "Details" },
      { label: formatDate(entry.timestamp), detail: "Time" },
    ].forEach((candidate) => {
      if (!candidate.label) return;
      const key = String(candidate.label).toLowerCase();
      if (seen.has(key) || !key.includes(term)) return;
      seen.add(key);
      suggestions.push(candidate);
    });
  });

  return suggestions.slice(0, 6);
}

function renderAuditSuggestions() {
  const suggestions = getAuditSuggestions();
  if (!suggestions.length || document.activeElement !== auditSearchInput) {
    auditSuggestions.classList.add("hidden");
    auditSuggestions.innerHTML = "";
    return;
  }

  auditSuggestions.innerHTML = suggestions
    .map(
      (suggestion) => `
        <button class="suggestion-option" type="button" data-audit-suggestion="${escapeHtml(suggestion.label)}">
          <strong>${escapeHtml(suggestion.label)}</strong>
          <span>${escapeHtml(suggestion.detail)}</span>
        </button>
      `,
    )
    .join("");
  auditSuggestions.classList.remove("hidden");
}

function getSortedAudit(entries) {
  return [...entries].sort((first, second) => {
    if (auditSortMode === "timestamp-asc") {
      return new Date(first.timestamp) - new Date(second.timestamp);
    }

    if (auditSortMode === "action-asc") {
      return first.action.localeCompare(second.action);
    }

    if (auditSortMode === "user-asc") {
      return first.userName.localeCompare(second.userName);
    }

    return new Date(second.timestamp) - new Date(first.timestamp);
  });
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
              ? `<button class="danger-button" type="button" data-revoke="${user.id}">Revoke</button>`
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
  activeViewId = allowedView;
  localStorage.setItem(VIEW_STORAGE_KEY, allowedView);

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

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  try {
    setButtonBusy(loginSubmit, true, "Signing in...");
    const { user } = await apiRequest("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    state.currentUser = user;
    saveSession(user);
    setLoading(true, "Loading dashboard...");
    await refreshState();
    startRealtimeRefresh();
    renderApp();
  } catch (error) {
    showToast(error.message);
  } finally {
    setButtonBusy(loginSubmit, false);
    setLoading(false);
  }
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = signupNameInput.value.trim();
  const email = signupEmailInput.value.trim().toLowerCase();
  const password = signupPasswordInput.value;

  try {
    setButtonBusy(signupSubmit, true, "Requesting...");
    await apiRequest("/api/signup", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
    signupForm.reset();
    showToast("Access request sent. Admin approval is required.");
  } catch (error) {
    showToast(error.message);
  } finally {
    setButtonBusy(signupSubmit, false);
  }
});

signOutButton.addEventListener("click", () => {
  state.currentUser = null;
  clearSession();
  stopRealtimeRefresh();
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

inventorySearchInput.addEventListener("input", () => {
  inventorySearchTerm = inventorySearchInput.value.trim();
  renderInventory();
});

inventorySearchInput.addEventListener("focus", renderSuggestions);

inventorySearchInput.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  inventorySearchTerm = "";
  inventorySearchInput.value = "";
  inventorySuggestions.classList.add("hidden");
  renderInventory();
});

auditSearchInput.addEventListener("input", () => {
  auditSearchTerm = auditSearchInput.value.trim();
  renderAudit(currentUser()?.role === "admin");
});

auditSearchInput.addEventListener("focus", renderAuditSuggestions);

auditSearchInput.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  auditSearchTerm = "";
  auditSearchInput.value = "";
  auditSuggestions.classList.add("hidden");
  renderAudit(currentUser()?.role === "admin");
});

inventorySuggestions.addEventListener("mousedown", (event) => {
  const option = event.target.closest("[data-suggestion]");
  if (!option) return;
  inventorySearchTerm = option.dataset.suggestion;
  inventorySearchInput.value = inventorySearchTerm;
  inventorySuggestions.classList.add("hidden");
  renderInventory();
});

auditSuggestions.addEventListener("mousedown", (event) => {
  const option = event.target.closest("[data-audit-suggestion]");
  if (!option) return;
  auditSearchTerm = option.dataset.auditSuggestion;
  auditSearchInput.value = auditSearchTerm;
  auditSuggestions.classList.add("hidden");
  renderAudit(currentUser()?.role === "admin");
});

document.addEventListener("click", (event) => {
  if (event.target.closest(".search-box")) return;
  inventorySuggestions.classList.add("hidden");
  auditSuggestions.classList.add("hidden");
});

inventoryList.addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-edit-item]");
  const cancelButton = event.target.closest("[data-cancel-edit]");
  const deleteButton = event.target.closest("[data-delete-item]");

  if (editButton) {
    editingItemId = editButton.dataset.editItem;
    renderInventory();
    return;
  }

  if (cancelButton) {
    editingItemId = null;
    renderInventory();
    return;
  }

  if (!deleteButton) return;

  const itemId = deleteButton.dataset.deleteItem;
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item || currentUser()?.role !== "admin") return;
  if (!window.confirm(`Remove ${item.name} from inventory?`)) return;

  try {
    setButtonBusy(deleteButton, true, "Removing...");
    const result = await apiRequest("/api/items", {
      method: "DELETE",
      body: JSON.stringify({
        itemId,
        adminId: currentUser().id,
      }),
    });

    state.items = state.items.filter((entry) => entry.id !== itemId);
    if (result.audit) {
      state.audit = [result.audit, ...state.audit.filter((entry) => entry.id !== result.audit.id)];
    }
    await refreshState({ silent: true });
    renderApp();
    showToast("Inventory item removed.");
  } catch (error) {
    showToast(error.message);
  } finally {
    setButtonBusy(deleteButton, false);
  }
});

inventoryList.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-edit-form]");
  if (!form) return;
  event.preventDefault();

  const itemId = form.dataset.editForm;
  const saveButton = form.querySelector('button[type="submit"]');

  try {
    setButtonBusy(saveButton, true, "Saving...");
    const result = await apiRequest("/api/items", {
      method: "PUT",
      body: JSON.stringify({
        itemId,
        adminId: currentUser().id,
        sku: form.elements.namedItem("sku").value.trim(),
        name: form.elements.namedItem("name").value.trim(),
        quantity: Number(form.elements.namedItem("quantity").value),
        location: form.elements.namedItem("location").value.trim(),
      }),
    });

    if (result.item) {
      state.items = state.items.map((item) => (item.id === result.item.id ? result.item : item));
    }
    if (result.audit) {
      state.audit = [result.audit, ...state.audit.filter((entry) => entry.id !== result.audit.id)];
    }
    editingItemId = null;
    await refreshState({ silent: true });
    renderApp();
    showToast("Inventory item updated.");
  } catch (error) {
    showToast(error.message);
  } finally {
    setButtonBusy(saveButton, false);
  }
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
    const saveButton = inventoryForm.querySelector('button[type="submit"]');
    setButtonBusy(saveButton, true, "Saving...");
    const result = await apiRequest("/api/items", {
      method: "POST",
      body: JSON.stringify(item),
    });

    if (result.item) {
      state.items = [result.item, ...state.items.filter((existing) => existing.id !== result.item.id)];
      if (result.audit) {
        state.audit = [result.audit, ...state.audit.filter((entry) => entry.id !== result.audit.id)];
      }
      renderApp();
    }

    inventoryForm.reset();
    selectedPhoto = "";
    photoPreview.innerHTML = "<span>No photo selected</span>";
    await refreshState({ silent: true });
    renderApp();
    showToast("Inventory item saved.");
  } catch (error) {
    showToast(error.message);
  } finally {
    const saveButton = inventoryForm.querySelector('button[type="submit"]');
    setButtonBusy(saveButton, false);
  }
});

userList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-approve], [data-revoke]");
  if (!button || !currentUser()) return;

  const approving = Boolean(button.dataset.approve);
  const userId = button.dataset.approve || button.dataset.revoke;

  try {
    setButtonBusy(button, true, approving ? "Approving..." : "Revoking...");
    const result = await apiRequest("/api/approve-user", {
      method: "POST",
      body: JSON.stringify({
        userId,
        adminId: currentUser().id,
        approved: approving,
      }),
    });

    if (result.user) {
      state.users = state.users.map((user) => (user.id === result.user.id ? result.user : user));
      if (result.audit) {
        state.audit = [result.audit, ...state.audit.filter((entry) => entry.id !== result.audit.id)];
      }
      renderApp();
    }

    await refreshState({ silent: true });
    renderApp();
    showToast(approving ? "User approved." : "User access revoked.");
  } catch (error) {
    showToast(error.message);
  } finally {
    setButtonBusy(button, false);
  }
});

document.querySelectorAll(".mobile-tab").forEach((button) => {
  button.addEventListener("click", () => setMobileView(button.dataset.view));
});

auditSortSelect.value = auditSortMode;
auditSortSelect.addEventListener("change", () => {
  auditSortMode = auditSortSelect.value;
  localStorage.setItem(AUDIT_SORT_STORAGE_KEY, auditSortMode);
  renderAudit(currentUser()?.role === "admin");
});

async function initializeApp() {
  const savedUser = loadSession();

  if (!savedUser) {
    renderApp();
    return;
  }

  state.currentUser = savedUser;
  setLoading(true, "Restoring your session...");

  try {
    const loaded = await refreshState();
    if (loaded) {
      const freshUser = state.users.find((user) => user.id === savedUser.id);
      if (freshUser) {
        state.currentUser = freshUser;
        saveSession(freshUser);
      }
    }
  } finally {
    if (state.currentUser) {
      startRealtimeRefresh();
    }
    setLoading(false);
    renderApp();
  }
}

initializeApp();
