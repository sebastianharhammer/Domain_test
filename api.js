// =====================================================================
// api.js – Firebase Realtime Database adapter (for testing)
//
// Temporary replacement for the ACME DNS Manager API. Exposes the same
// `api` object as api-acme.js, so script.js works unchanged. When the
// real API is ready, simply restore api-acme.js as api.js.
//
// Firebase RTDB specifics handled here:
//   - every path must end in ".json"
//   - GET returns an object keyed by push-IDs (or null) → converted to arrays
//   - POST returns only { "name": "<generated-key>" }
//   - there is no backend logic, so dnsSubdomain / dnsUsername /
//     dnsPassword and timestamps are generated CLIENT-SIDE here.
//     The real ACME backend will do this itself later.
//
// Data layout in the database:
//   /customers/{id} → { name, erpID?, createdAt, updatedAt }
//   /accounts/{id}  → { customerID, commonName, dns*, start?, end?, ... }
//   /monitors/{id}  → { customerID, displayName, endpoint, jobType?, enabled, ... }
//
// NOTE: the database rules must allow read/write for this to work
// (Firebase console → Realtime Database → Rules, e.g. test mode).
// =====================================================================

const API_BASE = "https://domain-test-4a08f-default-rtdb.europe-west1.firebasedatabase.app";

async function _fb(path, options = {}) {
  const response = await fetch(API_BASE + path + ".json", {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    let detail = "";
    try { detail = (await response.json())?.error || ""; } catch {}
    throw new Error("Firebase-Fehler " + response.status +
      (detail ? " (" + detail + ")" : "") + " bei " + path);
  }
  return response.json();
}

// Object keyed by id → array of objects with id field
function _toArray(data) {
  return Object.entries(data || {}).map(([id, value]) => ({ id, ...value }));
}

function _randomHex(length) {
  return [...crypto.getRandomValues(new Uint8Array(length))]
    .map(b => b.toString(16).padStart(2, "0")).join("").slice(0, length);
}

function _compact(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== "")
  );
}

const api = {
  // ----- Customers -----
  async getCustomers() {
    return _toArray(await _fb("/customers"));
  },

  async createCustomer(name, erpID) {
    const now = new Date().toISOString();
    const record = _compact({ name, erpID, createdAt: now, updatedAt: now });
    const { name: id } = await _fb("/customers", {
      method: "POST",
      body: JSON.stringify(record),
    });
    return { id, ...record };
  },

  async updateCustomer(id, name, erpID) {
    const patch = { ..._compact({ name }), erpID: erpID ?? null, updatedAt: new Date().toISOString() };
    const updated = await _fb("/customers/" + encodeURIComponent(id), {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return { id, ...updated };
  },

  async deleteCustomer(id) {
    // RTDB has no cascading delete – remove dependent records client-side
    const [accounts, monitors] = await Promise.all([
      this.getAccounts(), this.getMonitors(),
    ]);
    await Promise.all([
      ...accounts.filter(a => a.customerID === id)
        .map(a => _fb("/accounts/" + encodeURIComponent(a.id), { method: "DELETE" })),
      ...monitors.filter(m => m.customerID === id)
        .map(m => _fb("/monitors/" + encodeURIComponent(m.id), { method: "DELETE" })),
      _fb("/customers/" + encodeURIComponent(id), { method: "DELETE" }),
    ]);
  },

  // ----- Accounts (domains) -----
  async getAccounts() {
    return _toArray(await _fb("/accounts"));
  },

  async createAccount(customerId, commonName, start, end) {
    const now = new Date().toISOString();
    const record = _compact({
      customerID: customerId,
      commonName,
      start, end,
      // generated client-side for testing – the real API does this itself
      dnsSubdomain: _randomHex(8) + ".acme-dns.example.com",
      dnsUsername: "u-" + _randomHex(8),
      dnsPassword: _randomHex(24),
      createdAt: now,
      updatedAt: now,
    });
    const { name: id } = await _fb("/accounts", {
      method: "POST",
      body: JSON.stringify(record),
    });
    return { id, ...record };
  },

  async updateAccount(id, commonName, start, end) {
    const patch = { ..._compact({ commonName, start, end }), updatedAt: new Date().toISOString() };
    const updated = await _fb("/accounts/" + encodeURIComponent(id), {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return { id, ...updated };
  },

  async resetAccountPassword(id) {
    const patch = { dnsPassword: _randomHex(24), updatedAt: new Date().toISOString() };
    await _fb("/accounts/" + encodeURIComponent(id), {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    const account = await _fb("/accounts/" + encodeURIComponent(id));
    return { id, ...account };
  },

  async deleteAccount(id) {
    await _fb("/accounts/" + encodeURIComponent(id), { method: "DELETE" });
  },

  // ----- Monitors -----
  async getMonitors() {
    return _toArray(await _fb("/monitors"));
  },

  async createMonitor(customerId, displayName, endpoint, jobType, enabled) {
    const now = new Date().toISOString();
    const record = {
      ..._compact({ customerID: customerId, displayName, endpoint, jobType }),
      enabled,
      createdAt: now,
      updatedAt: now,
    };
    const { name: id } = await _fb("/monitors", {
      method: "POST",
      body: JSON.stringify(record),
    });
    return { id, ...record };
  },

  async updateMonitor(id, displayName, endpoint, jobType, enabled) {
    const patch = {
      ..._compact({ displayName, endpoint, jobType }),
      enabled,
      updatedAt: new Date().toISOString(),
    };
    const updated = await _fb("/monitors/" + encodeURIComponent(id), {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return { id, ...updated };
  },

  async deleteMonitor(id) {
    await _fb("/monitors/" + encodeURIComponent(id), { method: "DELETE" });
  },
};
