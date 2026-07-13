const DOMAIN_RE = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z0-9-]{1,63})*\.[a-zA-Z]{2,}$/;

// ------------------------------------------------------------------
// State – filled via the data layer (api.js)
// ------------------------------------------------------------------
let customers = [];          // customer.Customer[]
let accountsByCustomer = {}; // customerID → account.Account[]
let monitorsByCustomer = {}; // customerID → monitor.Monitor[]

// UI state that must survive re-rendering
const domainInputs = {};     // customerID → domain input value
const domainPeriods = {};    // customerID → { open, start, end }
const errorMessages = {};    // customerID → error text
let editingCustomerId = null;
let openAccountId = null;    // account whose detail panel is open
const monitorsOpen = {};     // customerID → bool (section expanded)
const monitorInputs = {};    // customerID → { displayName, endpoint, jobType }
const revealedPasswords = {};// accountID → password returned by reset

function esc(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}

function accountsOf(customerId) { return accountsByCustomer[customerId] || []; }
function monitorsOf(customerId) { return monitorsByCustomer[customerId] || []; }

// Converts a yyyy-mm-dd date input value to an RFC3339 timestamp.
// Adjust here if your API expects a different format.
function toApiDate(value) {
  return value ? value + "T00:00:00Z" : null;
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  return isNaN(d) ? value : d.toLocaleDateString("de-DE");
}

// ------------------------------------------------------------------
// Create / edit / delete customer
// ------------------------------------------------------------------

function toggleCreateForm() {
  const form = document.getElementById("createForm");
  form.classList.toggle("offen");
  if (form.classList.contains("offen")) {
    document.getElementById("newName").focus();
  }
}

function validateCreateForm() {
  document.getElementById("btnSave").disabled =
    document.getElementById("newName").value.trim() === "";
}

function parseErpId(raw) {
  if (raw.trim() === "") return { ok: true, value: null };
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? { ok: false } : { ok: true, value: n };
}

async function createCustomer() {
  const name = document.getElementById("newName").value.trim();
  if (!name) return;
  const erp = parseErpId(document.getElementById("newErpId").value);
  if (!erp.ok) { showGlobalError("Die ERP-ID muss eine Zahl sein."); return; }
  try {
    const newCustomer = await api.createCustomer(name, erp.value);
    customers.push(newCustomer);
    document.getElementById("newName").value = "";
    document.getElementById("newErpId").value = "";
    document.getElementById("createForm").classList.remove("offen");
    validateCreateForm();
    render();
  } catch (error) {
    showGlobalError("Kunde konnte nicht angelegt werden: " + error.message);
  }
}

function startEditCustomer(id) {
  editingCustomerId = id;
  render();
  document.getElementById("editName-" + CSS.escape(id))?.focus();
}

function cancelEditCustomer() {
  editingCustomerId = null;
  render();
}

async function saveCustomer(id) {
  const name = document.getElementById("editName-" + CSS.escape(id)).value.trim();
  if (!name) { errorMessages[id] = "Der Name darf nicht leer sein."; render(); return; }
  const erp = parseErpId(document.getElementById("editErpId-" + CSS.escape(id)).value);
  if (!erp.ok) { errorMessages[id] = "Die ERP-ID muss eine Zahl sein."; render(); return; }
  try {
    const updated = await api.updateCustomer(id, name, erp.value);
    customers = customers.map(c => (c.id === id ? updated : c));
    editingCustomerId = null;
    errorMessages[id] = "";
    render();
  } catch (error) {
    errorMessages[id] = "Speichern fehlgeschlagen: " + error.message;
    render();
  }
}

async function deleteCustomer(id) {
  const customer = customers.find(c => c.id === id);
  if (!confirm(`Kunden „${customer?.name}" wirklich löschen?`)) return;
  try {
    await api.deleteCustomer(id);
    customers = customers.filter(c => c.id !== id);
    delete accountsByCustomer[id];
    delete monitorsByCustomer[id];
    delete domainInputs[id];
    delete errorMessages[id];
    render();
  } catch (error) {
    showGlobalError("Kunde konnte nicht gelöscht werden: " + error.message);
  }
}

// ------------------------------------------------------------------
// Domains (= accounts in the API, domain lives in commonName)
// ------------------------------------------------------------------

function findDomainOwner(domain) {
  for (const c of customers) {
    if (accountsOf(c.id).some(a => a.commonName === domain)) return c.name;
  }
  return null;
}

function togglePeriod(customerId) {
  const p = (domainPeriods[customerId] ||= { open: false, start: "", end: "" });
  p.open = !p.open;
  render();
}

function onPeriodChanged(customerId, field, value) {
  (domainPeriods[customerId] ||= { open: true, start: "", end: "" })[field] = value;
}

async function assignDomain(customerId) {
  const field = document.getElementById("domainInput-" + CSS.escape(customerId));
  const raw = field.value.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!raw) return;

  if (!DOMAIN_RE.test(raw)) {
    errorMessages[customerId] = `„${raw}" ist keine gültige Domain.`;
    domainInputs[customerId] = field.value;
    render();
    return;
  }
  const owner = findDomainOwner(raw);
  if (owner) {
    errorMessages[customerId] = `${raw} ist bereits ${owner} zugewiesen.`;
    domainInputs[customerId] = field.value;
    render();
    return;
  }

  const period = domainPeriods[customerId] || {};
  try {
    const account = await api.createAccount(
      customerId, raw,
      period.open ? toApiDate(period.start) : null,
      period.open ? toApiDate(period.end) : null
    );
    accountsByCustomer[customerId] = [...accountsOf(customerId), account];
    domainInputs[customerId] = "";
    domainPeriods[customerId] = { open: false, start: "", end: "" };
    errorMessages[customerId] = "";
    render();
    document.getElementById("domainInput-" + CSS.escape(customerId)).focus();
  } catch (error) {
    errorMessages[customerId] = "Zuweisung fehlgeschlagen: " + error.message;
    domainInputs[customerId] = field.value;
    render();
  }
}

function toggleAccountDetail(accountId) {
  openAccountId = openAccountId === accountId ? null : accountId;
  render();
}

async function resetAccountPassword(customerId, accountId) {
  try {
    const updated = await api.resetAccountPassword(accountId);
    accountsByCustomer[customerId] = accountsOf(customerId)
      .map(a => (a.id === accountId ? updated : a));
    if (updated.dnsPassword) revealedPasswords[accountId] = updated.dnsPassword;
    errorMessages[customerId] = "";
    render();
  } catch (error) {
    errorMessages[customerId] = "Passwort-Reset fehlgeschlagen: " + error.message;
    render();
  }
}

async function removeAccount(customerId, accountId) {
  const account = accountsOf(customerId).find(a => a.id === accountId);
  if (!confirm(`Domain „${account?.commonName}" wirklich entfernen?`)) return;
  try {
    await api.deleteAccount(accountId);
    accountsByCustomer[customerId] = accountsOf(customerId).filter(a => a.id !== accountId);
    delete revealedPasswords[accountId];
    if (openAccountId === accountId) openAccountId = null;
    render();
  } catch (error) {
    errorMessages[customerId] = "Entfernen fehlgeschlagen: " + error.message;
    render();
  }
}

function onDomainInputChanged(customerId, value) {
  domainInputs[customerId] = value;
  if (errorMessages[customerId]) {
    errorMessages[customerId] = "";
    const el = document.getElementById("error-" + CSS.escape(customerId));
    if (el) el.textContent = "";
  }
}

// ------------------------------------------------------------------
// Monitors
// ------------------------------------------------------------------

function toggleMonitors(customerId) {
  monitorsOpen[customerId] = !monitorsOpen[customerId];
  render();
}

function onMonitorInputChanged(customerId, field, value) {
  (monitorInputs[customerId] ||= {})[field] = value;
}

async function createMonitor(customerId) {
  const input = monitorInputs[customerId] || {};
  const displayName = (input.displayName || "").trim();
  const endpoint = (input.endpoint || "").trim();
  if (!displayName || !endpoint) {
    errorMessages[customerId] = "Monitor braucht einen Namen und einen Endpoint.";
    render();
    return;
  }
  try {
    const monitor = await api.createMonitor(
      customerId, displayName, endpoint, (input.jobType || "").trim() || null, true
    );
    monitorsByCustomer[customerId] = [...monitorsOf(customerId), monitor];
    monitorInputs[customerId] = {};
    errorMessages[customerId] = "";
    render();
  } catch (error) {
    errorMessages[customerId] = "Monitor konnte nicht angelegt werden: " + error.message;
    render();
  }
}

async function toggleMonitorEnabled(customerId, monitorId) {
  const monitor = monitorsOf(customerId).find(m => m.id === monitorId);
  if (!monitor) return;
  try {
    const updated = await api.updateMonitor(
      monitorId, monitor.displayName, monitor.endpoint, monitor.jobType || null, !monitor.enabled
    );
    monitorsByCustomer[customerId] = monitorsOf(customerId)
      .map(m => (m.id === monitorId ? updated : m));
    render();
  } catch (error) {
    errorMessages[customerId] = "Monitor konnte nicht aktualisiert werden: " + error.message;
    render();
  }
}

async function deleteMonitor(customerId, monitorId) {
  const monitor = monitorsOf(customerId).find(m => m.id === monitorId);
  if (!confirm(`Monitor „${monitor?.displayName}" wirklich löschen?`)) return;
  try {
    await api.deleteMonitor(monitorId);
    monitorsByCustomer[customerId] = monitorsOf(customerId).filter(m => m.id !== monitorId);
    render();
  } catch (error) {
    errorMessages[customerId] = "Monitor konnte nicht gelöscht werden: " + error.message;
    render();
  }
}

// ------------------------------------------------------------------
// Search
// ------------------------------------------------------------------

function clearSearch() {
  document.getElementById("search").value = "";
  render();
}

// ------------------------------------------------------------------
// Rendering
// ------------------------------------------------------------------

function showGlobalError(message) {
  document.getElementById("customerList").insertAdjacentHTML(
    "afterbegin",
    `<div class="karte leer-hinweis" style="color:#dc2626">${esc(message)}</div>`
  );
}

function renderAccountDetail(customerId, account) {
  const password = revealedPasswords[account.id];
  return `
    <div class="account-detail">
      <div class="detail-grid">
        ${account.dnsSubdomain ? `<span class="detail-label">DNS-Subdomain</span><code>${esc(account.dnsSubdomain)}</code>` : ""}
        ${account.dnsUsername ? `<span class="detail-label">DNS-Benutzer</span><code>${esc(account.dnsUsername)}</code>` : ""}
        <span class="detail-label">DNS-Passwort</span>
        <span>${password
          ? `<code>${esc(password)}</code> <em class="detail-hinweis">– jetzt notieren, wird nur einmal angezeigt</em>`
          : `<em class="detail-hinweis">verborgen – über „Passwort zurücksetzen" neu erzeugen</em>`}</span>
        ${account.start ? `<span class="detail-label">Gültig ab</span><span>${esc(formatDate(account.start))}</span>` : ""}
        ${account.end ? `<span class="detail-label">Gültig bis</span><span>${esc(formatDate(account.end))}</span>` : ""}
        ${account.createdAt ? `<span class="detail-label">Angelegt</span><span>${esc(formatDate(account.createdAt))}</span>` : ""}
      </div>
      <div class="detail-aktionen">
        <button class="btn-zuweisen" onclick="resetAccountPassword('${esc(customerId)}', '${esc(account.id)}')">Passwort zurücksetzen</button>
        <button class="btn-gefahr" onclick="removeAccount('${esc(customerId)}', '${esc(account.id)}')">Domain entfernen</button>
      </div>
    </div>`;
}

function renderMonitorSection(customer) {
  const monitors = monitorsOf(customer.id);
  const open = monitorsOpen[customer.id];
  const input = monitorInputs[customer.id] || {};
  return `
    <div class="monitor-bereich">
      <button class="monitor-toggle" onclick="toggleMonitors('${esc(customer.id)}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="transform:rotate(${open ? 90 : 0}deg);transition:transform .15s"><path d="m9 18 6-6-6-6"/></svg>
        Monitore (${monitors.length})
      </button>
      ${!open ? "" : `
        <div class="monitor-liste">
          ${monitors.length === 0 ? `<p class="keine-domains">Keine Monitore eingerichtet.</p>` : monitors.map(m => `
            <div class="monitor-zeile">
              <label class="monitor-schalter" title="${m.enabled ? "Aktiv – klicken zum Deaktivieren" : "Inaktiv – klicken zum Aktivieren"}">
                <input type="checkbox" ${m.enabled ? "checked" : ""}
                  onchange="toggleMonitorEnabled('${esc(customer.id)}', '${esc(m.id)}')">
              </label>
              <div class="monitor-info">
                <span class="monitor-name">${esc(m.displayName)}</span>
                <span class="monitor-endpoint">${esc(m.endpoint)}${m.jobType ? ` · ${esc(m.jobType)}` : ""}</span>
              </div>
              <button class="btn-loeschen" title="Monitor löschen" onclick="deleteMonitor('${esc(customer.id)}', '${esc(m.id)}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
              </button>
            </div>`).join("")}
          <div class="monitor-formular">
            <input type="text" placeholder="Name *" value="${esc(input.displayName || "")}"
              oninput="onMonitorInputChanged('${esc(customer.id)}', 'displayName', this.value)">
            <input type="text" placeholder="Endpoint *, z. B. https://…" value="${esc(input.endpoint || "")}"
              oninput="onMonitorInputChanged('${esc(customer.id)}', 'endpoint', this.value)">
            <input type="text" placeholder="Job-Typ (optional)" value="${esc(input.jobType || "")}"
              oninput="onMonitorInputChanged('${esc(customer.id)}', 'jobType', this.value)"
              onkeydown="if(event.key==='Enter')createMonitor('${esc(customer.id)}')">
            <button class="btn-zuweisen" onclick="createMonitor('${esc(customer.id)}')">Anlegen</button>
          </div>
        </div>`}
    </div>`;
}

function render() {
  const query = document.getElementById("search").value.trim().toLowerCase();
  document.getElementById("clearSearch").style.display = query ? "block" : "none";

  const filtered = !query ? customers : customers.filter(c =>
    c.name.toLowerCase().includes(query) ||
    String(c.erpID ?? "").includes(query) ||
    accountsOf(c.id).some(a => a.commonName.includes(query)) ||
    monitorsOf(c.id).some(m =>
      m.displayName.toLowerCase().includes(query) || m.endpoint.toLowerCase().includes(query))
  );

  const totalDomains = Object.values(accountsByCustomer).reduce((s, l) => s + l.length, 0);
  const totalMonitors = Object.values(monitorsByCustomer).reduce((s, l) => s + l.length, 0);
  document.getElementById("stats").textContent =
    `${customers.length} Kunden · ${totalDomains} Domains · ${totalMonitors} Monitore`;

  const list = document.getElementById("customerList");

  if (filtered.length === 0) {
    list.innerHTML = `<div class="karte leer-hinweis">${
      customers.length === 0
        ? "Noch keine Kunden. Lege oben den ersten Kunden an."
        : "Keine Treffer für diese Suche."
    }</div>`;
    return;
  }

  list.innerHTML = filtered.map(c => {
    const period = domainPeriods[c.id] || {};
    const openAccount = accountsOf(c.id).find(a => a.id === openAccountId);
    const isEditing = editingCustomerId === c.id;
    return `
    <div class="karte kunde-karte">
      <div class="kunde-kopf">
        ${isEditing ? `
          <div class="edit-formular">
            <input type="text" id="editName-${esc(c.id)}" value="${esc(c.name)}" placeholder="Firmenname *"
              onkeydown="if(event.key==='Enter')saveCustomer('${esc(c.id)}');if(event.key==='Escape')cancelEditCustomer()">
            <input type="text" id="editErpId-${esc(c.id)}" value="${c.erpID ?? ""}" placeholder="ERP-ID" inputmode="numeric"
              onkeydown="if(event.key==='Enter')saveCustomer('${esc(c.id)}');if(event.key==='Escape')cancelEditCustomer()">
            <button class="btn-dunkel" onclick="saveCustomer('${esc(c.id)}')">Speichern</button>
            <button class="btn-zuweisen" onclick="cancelEditCustomer()">Abbrechen</button>
          </div>` : `
          <div>
            <h3>${esc(c.name)}</h3>
            ${c.erpID != null ? `<p class="kunde-kontakt">ERP-ID: ${esc(c.erpID)}</p>` : ""}
          </div>
          <div class="kopf-aktionen">
            <button class="btn-bearbeiten" title="Kunden bearbeiten" onclick="startEditCustomer('${esc(c.id)}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            </button>
            <button class="btn-loeschen" title="Kunden löschen" onclick="deleteCustomer('${esc(c.id)}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
            </button>
          </div>`}
      </div>
      <div class="domain-liste">
        ${accountsOf(c.id).length === 0
          ? `<span class="keine-domains">Keine Domains zugewiesen</span>`
          : accountsOf(c.id).map(a => `
            <button class="domain-chip ${openAccountId === a.id ? "aktiv" : ""}"
              title="Details anzeigen" onclick="toggleAccountDetail('${esc(a.id)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/></svg>
              ${esc(a.commonName)}
            </button>`).join("")}
      </div>
      ${openAccount ? renderAccountDetail(c.id, openAccount) : ""}
      <div class="zuweisen-bereich">
        <div class="zuweisen-zeile">
          <input type="text" id="domainInput-${esc(c.id)}"
            placeholder="Domain zuweisen, z. B. beispiel.de"
            value="${esc(domainInputs[c.id] || "")}"
            oninput="onDomainInputChanged('${esc(c.id)}', this.value)"
            onkeydown="if(event.key==='Enter')assignDomain('${esc(c.id)}')">
          <button class="btn-zuweisen" onclick="assignDomain('${esc(c.id)}')">Zuweisen</button>
        </div>
        <button class="zeitraum-toggle" onclick="togglePeriod('${esc(c.id)}')">
          ${period.open ? "− Zeitraum ausblenden" : "+ Gültigkeitszeitraum angeben"}
        </button>
        ${period.open ? `
          <div class="zeitraum-zeile">
            <label>Von <input type="date" value="${esc(period.start || "")}"
              onchange="onPeriodChanged('${esc(c.id)}', 'start', this.value)"></label>
            <label>Bis <input type="date" value="${esc(period.end || "")}"
              onchange="onPeriodChanged('${esc(c.id)}', 'end', this.value)"></label>
          </div>` : ""}
        <p class="fehler" id="error-${esc(c.id)}">${
          errorMessages[c.id]
            ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg> ${esc(errorMessages[c.id])}`
            : ""
        }</p>
      </div>
      ${renderMonitorSection(c)}
    </div>`;
  }).join("");
}

// ------------------------------------------------------------------
// Startup: load customers, accounts and monitors in parallel
// ------------------------------------------------------------------

async function init() {
  const list = document.getElementById("customerList");
  list.innerHTML = `<div class="karte leer-hinweis">Lade Daten …</div>`;
  try {
    const [customerList, accountList, monitorList] = await Promise.all([
      api.getCustomers(),
      api.getAccounts(),
      api.getMonitors(),
    ]);
    customers = customerList || [];
    accountsByCustomer = {};
    for (const account of accountList || []) {
      (accountsByCustomer[account.customerID] ||= []).push(account);
    }
    monitorsByCustomer = {};
    for (const monitor of monitorList || []) {
      (monitorsByCustomer[monitor.customerID] ||= []).push(monitor);
    }
    render();
  } catch (error) {
    list.innerHTML = `<div class="karte leer-hinweis" style="color:#dc2626">
      Daten konnten nicht geladen werden: ${esc(error.message)}<br><br>
      Prüfe, ob der API-Dienst läuft, ob API_BASE in api.js stimmt
      (aktuell: <code>${esc(API_BASE)}</code>) und ob der Dienst CORS
      für diese Seite erlaubt.
      <br><br><button class="btn-zuweisen" onclick="init()">Erneut versuchen</button>
    </div>`;
  }
}

init();
