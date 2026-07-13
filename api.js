// =====================================================================
// api.js – Data layer for the ACME DNS Manager API Service
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
//
// USE_MOCK = true  → loads kunden.json, keeps changes in memory (testing)
// USE_MOCK = false → talks to the real API at API_BASE
//
// script.js only calls the functions of the `api` object and does not
// need to change when switching modes.
// =====================================================================

const USE_MOCK = true;
const API_BASE = "http://localhost:8080/api/v1"; // adjust host/port to your service

// ---------------------------------------------------------------------
// Mock mode: load kunden.json, keep changes in memory
// ---------------------------------------------------------------------

let _mockData = null;

async function _loadMockData() {
  if (_mockData === null) {
    const response = await fetch("kunden.json");
    if (!response.ok) throw new Error("kunden.json konnte nicht geladen werden (" + response.status + ")");
    _mockData = await response.json();
  }
  return _mockData;
}

function _randomHex(length) {
  return [...crypto.getRandomValues(new Uint8Array(length))]
    .map(b => b.toString(16).padStart(2, "0")).join("").slice(0, length);
}

const mockApi = {
  async getCustomers() {
    const data = await _loadMockData();
    return structuredClone(data.customers);
  },

  async getAccounts() {
    const data = await _loadMockData();
    return structuredClone(data.accounts);
  },

  async createCustomer(name, erpID) {
    const data = await _loadMockData();
    const now = new Date().toISOString();
    const customer = {
      id: "c" + Date.now(),
      name,
      ...(erpID !== null ? { erpID } : {}),
      createdAt: now,
      updatedAt: now,
    };
    data.customers.push(customer);
    return structuredClone(customer);
  },

  async deleteCustomer(id) {
    const data = await _loadMockData();
    data.customers = data.customers.filter(c => c.id !== id);
    data.accounts = data.accounts.filter(a => a.customerID !== id);
  },

  async createAccount(customerId, commonName) {
    const data = await _loadMockData();
    const now = new Date().toISOString();
    const account = {
      id: "a" + Date.now(),
      customerID: customerId,
      commonName,
      dnsSubdomain: _randomHex(6) + ".acme-dns.example.com",
      dnsUsername: "u-" + _randomHex(6),
      createdAt: now,
      updatedAt: now,
    };
    data.accounts.push(account);
    return structuredClone(account);
  },

  async deleteAccount(id) {
    const data = await _loadMockData();
    data.accounts = data.accounts.filter(a => a.id !== id);
  },
};

// ---------------------------------------------------------------------
// REST mode: calls against the ACME DNS Manager API
// ---------------------------------------------------------------------

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

const restApi = {
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

// ---------------------------------------------------------------------

const api = USE_MOCK ? mockApi : restApi;
