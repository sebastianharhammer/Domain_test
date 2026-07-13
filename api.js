// =====================================================================
// api.js – Client for the ACME DNS Manager API Service
//
// The API models domains as "accounts": each account belongs to a
// customer and carries the domain in its commonName field. Accounts
// can have an optional validity period (start / end) and their DNS
// password can be reset. Customers can also have monitors.
//
// Endpoints used (basePath /api/v1):
//   GET    /customers                        → list all customers
//   POST   /customers                        → create customer { name, erpID }
//   PATCH  /customers/:id                    → update customer { name, erpID }
//   DELETE /customers/:id                    → delete customer
//
//   GET    /accounts                         → list all accounts
//   POST   /customers/:customerId/accounts   → create account { commonName, start, end }
//   PATCH  /accounts/:id                     → update account { commonName, start, end }
//   POST   /accounts/:id/reset               → reset DNS password, returns account
//   DELETE /accounts/:id                     → delete account
//
//   GET    /monitors                         → list all monitors
//   POST   /customers/:customerId/monitors   → create monitor { displayName, endpoint, enabled, jobType }
//   PATCH  /monitors/:id                     → update monitor
//   DELETE /monitors/:id                     → delete monitor
// =====================================================================

const API_BASE = "https://domain-test-4a08f-default-rtdb.europe-west1.firebasedatabase.app/"; // adjust host/port to your service

async function _request(path, options = {}) {
  const response = await fetch(API_BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    throw new Error("API-Fehler " + response.status + " bei " + path);
  }
  // 204 No Content and empty bodies
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// Removes keys with null/undefined/empty-string values so optional
// fields are simply omitted from the request body.
function _compact(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== "")
  );
}

const api = {
  // ----- Customers -----
  getCustomers: () =>
    _request("/customers"),

  createCustomer: (name, erpID) =>
    _request("/customers", {
      method: "POST",
      body: JSON.stringify(_compact({ name, erpID })),
    }),

  updateCustomer: (id, name, erpID) =>
    _request("/customers/" + encodeURIComponent(id), {
      method: "PATCH",
      body: JSON.stringify(_compact({ name, erpID })),
    }),

  deleteCustomer: (id) =>
    _request("/customers/" + encodeURIComponent(id), { method: "DELETE" }),

  // ----- Accounts (domains) -----
  getAccounts: () =>
    _request("/accounts"),

  createAccount: (customerId, commonName, start, end) =>
    _request("/customers/" + encodeURIComponent(customerId) + "/accounts", {
      method: "POST",
      body: JSON.stringify(_compact({ commonName, start, end })),
    }),

  updateAccount: (id, commonName, start, end) =>
    _request("/accounts/" + encodeURIComponent(id), {
      method: "PATCH",
      body: JSON.stringify(_compact({ commonName, start, end })),
    }),

  resetAccountPassword: (id) =>
    _request("/accounts/" + encodeURIComponent(id) + "/reset", { method: "POST" }),

  deleteAccount: (id) =>
    _request("/accounts/" + encodeURIComponent(id), { method: "DELETE" }),

  // ----- Monitors -----
  getMonitors: () =>
    _request("/monitors"),

  createMonitor: (customerId, displayName, endpoint, jobType, enabled) =>
    _request("/customers/" + encodeURIComponent(customerId) + "/monitors", {
      method: "POST",
      body: JSON.stringify({ ..._compact({ displayName, endpoint, jobType }), enabled }),
    }),

  updateMonitor: (id, displayName, endpoint, jobType, enabled) =>
    _request("/monitors/" + encodeURIComponent(id), {
      method: "PATCH",
      body: JSON.stringify({ ..._compact({ displayName, endpoint, jobType }), enabled }),
    }),

  deleteMonitor: (id) =>
    _request("/monitors/" + encodeURIComponent(id), { method: "DELETE" }),
};
