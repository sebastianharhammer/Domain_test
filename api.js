// =====================================================================
// api.js – Client for the ACME DNS Manager API Service
//
// The API models domains as "accounts": each account belongs to a
// customer and carries the domain in its commonName field.
//
// Endpoints used (basePath /api/v1):
//   GET    /customers                        → list all customers
//   POST   /customers                        → create customer { name, erpID }
//   DELETE /customers/:id                    → delete customer
//   GET    /accounts                         → list all accounts
//   POST   /customers/:customerId/accounts   → create account { commonName }
//   DELETE /accounts/:id                     → delete account
// =====================================================================

const API_BASE = "http://localhost:8080/api/v1"; // adjust host/port to your service

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

const api = {
  getCustomers: () =>
    _request("/customers"),

  getAccounts: () =>
    _request("/accounts"),

  createCustomer: (name, erpID) =>
    _request("/customers", {
      method: "POST",
      body: JSON.stringify(erpID !== null ? { name, erpID } : { name }),
    }),

  deleteCustomer: (id) =>
    _request("/customers/" + encodeURIComponent(id), { method: "DELETE" }),

  createAccount: (customerId, commonName) =>
    _request("/customers/" + encodeURIComponent(customerId) + "/accounts", {
      method: "POST",
      body: JSON.stringify({ commonName }),
    }),

  deleteAccount: (id) =>
    _request("/accounts/" + encodeURIComponent(id), { method: "DELETE" }),
};
