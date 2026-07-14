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

const API_BASE = "http://localhost:8080/api/v1"; // adjust host/port to your service

async function _request(path, options = {}) {
  const response = await fetch(API_BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    // Echo returns errors as { "message": "..." } – surface that detail
    let detail = "";
    try { detail = (await response.json())?.message || ""; } catch {}
    throw new Error("API-Fehler " + response.status + " bei " + path +
      (detail ? ": " + detail : ""));
  }
  // 204 No Content and empty bodies
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// ---------------------------------------------------------------------
// Normalization: the Go structs have no json tags, so the backend
// serializes fields with their Go names (ID, Name, ErpID, CommonName…).
// These helpers map responses to the lowercase shape the frontend uses.
// Requests are unaffected: Go's json unmarshalling matches keys
// case-insensitively, so sending { "name": … } works fine.
// ---------------------------------------------------------------------

function _normCustomer(c) {
  if (!c) return c;
  return {
    id: c.ID ?? c.id,
    name: c.Name ?? c.name,
    erpID: c.ErpID ?? c.erpID,
    createdAt: c.CreatedAt ?? c.createdAt,
    updatedAt: c.UpdatedAt ?? c.updatedAt,
  };
}

function _normAccount(a) {
  if (!a) return a;
  return {
    id: a.ID ?? a.id,
    customerID: a.CustomerID ?? a.customerID,
    commonName: a.CommonName ?? a.commonName,
    start: a.Start ?? a.start,
    end: a.End ?? a.end,
    dnsSubdomain: a.DnsSubdomain ?? a.dnsSubdomain,
    dnsUsername: a.DnsUsername ?? a.dnsUsername,
    dnsPassword: a.DnsPassword ?? a.dnsPassword,
    createdAt: a.CreatedAt ?? a.createdAt,
    updatedAt: a.UpdatedAt ?? a.updatedAt,
  };
}

function _normMonitor(m) {
  if (!m) return m;
  return {
    id: m.ID ?? m.id,
    customerID: m.CustomerID ?? m.customerID,
    displayName: m.DisplayName ?? m.displayName,
    endpoint: m.Endpoint ?? m.endpoint,
    jobType: m.JobType ?? m.jobType,
    enabled: m.Enabled ?? m.enabled,
    createdAt: m.CreatedAt ?? m.createdAt,
    updatedAt: m.UpdatedAt ?? m.updatedAt,
  };
}

function _normList(list, norm) {
  return (list || []).map(norm);
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
    _request("/customers").then(list => _normList(list, _normCustomer)),

  createCustomer: (name, erpID) =>
    _request("/customers", {
      method: "POST",
      body: JSON.stringify(_compact({ name, erpID })),
    }).then(_normCustomer),

  updateCustomer: (id, name, erpID) =>
    _request("/customers/" + encodeURIComponent(id), {
      method: "PATCH",
      body: JSON.stringify(_compact({ name, erpID })),
    }).then(_normCustomer),

  deleteCustomer: (id) =>
    _request("/customers/" + encodeURIComponent(id), { method: "DELETE" }),

  // ----- Accounts (domains) -----
  getAccounts: () =>
    _request("/accounts").then(list => _normList(list, _normAccount)),

  createAccount: (customerId, commonName, start, end) =>
    _request("/customers/" + encodeURIComponent(customerId) + "/accounts", {
      method: "POST",
      body: JSON.stringify(_compact({ commonName, start, end })),
    }).then(_normAccount),

  updateAccount: (id, commonName, start, end) =>
    _request("/accounts/" + encodeURIComponent(id), {
      method: "PATCH",
      body: JSON.stringify(_compact({ commonName, start, end })),
    }).then(_normAccount),

  resetAccountPassword: (id) =>
    _request("/accounts/" + encodeURIComponent(id) + "/reset", { method: "POST" })
      .then(_normAccount),

  deleteAccount: (id) =>
    _request("/accounts/" + encodeURIComponent(id), { method: "DELETE" }),

  // ----- Monitors -----
  getMonitors: () =>
    _request("/monitors").then(list => _normList(list, _normMonitor)),

  createMonitor: (customerId, displayName, endpoint, jobType, enabled) =>
    _request("/customers/" + encodeURIComponent(customerId) + "/monitors", {
      method: "POST",
      body: JSON.stringify({ ..._compact({ displayName, endpoint, jobType }), enabled }),
    }).then(_normMonitor),

  updateMonitor: (id, displayName, endpoint, jobType, enabled) =>
    _request("/monitors/" + encodeURIComponent(id), {
      method: "PATCH",
      body: JSON.stringify({ ..._compact({ displayName, endpoint, jobType }), enabled }),
    }).then(_normMonitor),

  deleteMonitor: (id) =>
    _request("/monitors/" + encodeURIComponent(id), { method: "DELETE" }),
};
