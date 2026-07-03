// =====================================================================
// api.js – Data layer
//
// Current: mock mode. Data is loaded once from kunden.json and then
// only modified in memory (changes are lost on page reload – fine
// for testing).
//
// Later: set USE_MOCK to false and adjust API_BASE. The REST calls
// below are already prepared and expect these endpoints:
//
//   GET    /kunden                          → list all customers
//   POST   /kunden                          → create customer
//   DELETE /kunden/:id                      → delete customer
//   POST   /kunden/:id/domains              → assign domain { "domain": "..." }
//   DELETE /kunden/:id/domains/:domain      → remove domain
//
// script.js only calls these functions and does not need to be
// touched when switching to the real API.
// =====================================================================

const USE_MOCK = true;
const API_BASE = "http://localhost:3000/api"; // adjust later

// ---------------------------------------------------------------------
// Mock mode: load kunden.json, keep changes in memory
// ---------------------------------------------------------------------

let _mockData = null;

async function _loadMockData() {
  if (_mockData === null) {
    const response = await fetch("kunden.json");
    if (!response.ok) throw new Error("kunden.json konnte nicht geladen werden (" + response.status + ")");
    const json = await response.json();
    // Ensure every customer has a tags array
    _mockData = json.kunden.map(c => ({ tags: [], ...c }));
  }
  return _mockData;
}

const mockApi = {
  async getCustomers() {
    return structuredClone(await _loadMockData());
  },

  async createCustomer(name, contact, tags) {
    const data = await _loadMockData();
    const customer = { id: Date.now(), name, kontakt: contact, tags, domains: [] };
    data.push(customer);
    return structuredClone(customer);
  },

  async deleteCustomer(id) {
    const data = await _loadMockData();
    _mockData = data.filter(c => c.id !== id);
  },

  async addDomain(customerId, domain) {
    const data = await _loadMockData();
    const customer = data.find(c => c.id === customerId);
    if (!customer) throw new Error("Kunde nicht gefunden.");
    customer.domains.push(domain);
    return structuredClone(customer);
  },

  async removeDomain(customerId, domain) {
    const data = await _loadMockData();
    const customer = data.find(c => c.id === customerId);
    if (!customer) throw new Error("Kunde nicht gefunden.");
    customer.domains = customer.domains.filter(d => d !== domain);
    return structuredClone(customer);
  },
};

// ---------------------------------------------------------------------
// REST mode: ready-made calls for the future API
// ---------------------------------------------------------------------

async function _request(path, options = {}) {
  const response = await fetch(API_BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    throw new Error("API-Fehler " + response.status + " bei " + path);
  }
  // DELETE responses often have no body
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const restApi = {
  getCustomers: () =>
    _request("/kunden"),

  createCustomer: (name, contact, tags) =>
    _request("/kunden", {
      method: "POST",
      body: JSON.stringify({ name, kontakt: contact, tags }),
    }),

  deleteCustomer: (id) =>
    _request("/kunden/" + id, { method: "DELETE" }),

  addDomain: (customerId, domain) =>
    _request("/kunden/" + customerId + "/domains", {
      method: "POST",
      body: JSON.stringify({ domain }),
    }),

  removeDomain: (customerId, domain) =>
    _request("/kunden/" + customerId + "/domains/" + encodeURIComponent(domain), {
      method: "DELETE",
    }),
};

// ---------------------------------------------------------------------

const api = USE_MOCK ? mockApi : restApi;
