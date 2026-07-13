const DOMAIN_RE = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z0-9-]{1,63})*\.[a-zA-Z]{2,}$/;

// Local state – filled via the data layer (api.js)
let customers = [];          // customer.Customer[]
let accountsByCustomer = {}; // customerID → account.Account[]

// Remembers per-customer inputs & errors so they survive re-rendering
const domainInputs = {};
const errorMessages = {};

function esc(text) {
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

function accountsOf(customerId) {
  return accountsByCustomer[customerId] || [];
}

// ------------------------------------------------------------------
// Create / delete customer
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

async function createCustomer() {
  const name = document.getElementById("newName").value.trim();
  if (!name) return;
  const erpRaw = document.getElementById("newErpId").value.trim();
  const erpID = erpRaw === "" ? null : parseInt(erpRaw, 10);
  if (erpRaw !== "" && Number.isNaN(erpID)) {
    showGlobalError("Die ERP-ID muss eine Zahl sein.");
    return;
  }
  try {
    const newCustomer = await api.createCustomer(name, erpID);
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

async function deleteCustomer(id) {
  try {
    await api.deleteCustomer(id);
    customers = customers.filter(c => c.id !== id);
    delete accountsByCustomer[id];
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

  try {
    const account = await api.createAccount(customerId, raw);
    accountsByCustomer[customerId] = [...accountsOf(customerId), account];
    domainInputs[customerId] = "";
    errorMessages[customerId] = "";
    render();
    document.getElementById("domainInput-" + CSS.escape(customerId)).focus();
  } catch (error) {
    errorMessages[customerId] = "Zuweisung fehlgeschlagen: " + error.message;
    domainInputs[customerId] = field.value;
    render();
  }
}

async function removeAccount(customerId, accountId) {
  try {
    await api.deleteAccount(accountId);
    accountsByCustomer[customerId] = accountsOf(customerId).filter(a => a.id !== accountId);
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

function render() {
  const query = document.getElementById("search").value.trim().toLowerCase();
  document.getElementById("clearSearch").style.display = query ? "block" : "none";

  const filtered = !query ? customers : customers.filter(c =>
    c.name.toLowerCase().includes(query) ||
    String(c.erpID ?? "").includes(query) ||
    accountsOf(c.id).some(a => a.commonName.includes(query))
  );

  const totalDomains = Object.values(accountsByCustomer).reduce((sum, list) => sum + list.length, 0);
  document.getElementById("stats").textContent =
    `${customers.length} Kunden · ${totalDomains} Domains zugewiesen`;

  const list = document.getElementById("customerList");

  if (filtered.length === 0) {
    list.innerHTML = `<div class="karte leer-hinweis">${
      customers.length === 0
        ? "Noch keine Kunden. Lege oben den ersten Kunden an."
        : "Keine Treffer für diese Suche."
    }</div>`;
    return;
  }

  list.innerHTML = filtered.map(c => `
    <div class="karte kunde-karte">
      <div class="kunde-kopf">
        <div>
          <h3>${esc(c.name)}</h3>
          ${c.erpID != null ? `<p class="kunde-kontakt">ERP-ID: ${esc(c.erpID)}</p>` : ""}
        </div>
        <button class="btn-loeschen" title="Kunden löschen" onclick="deleteCustomer('${esc(c.id)}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
        </button>
      </div>
      <div class="domain-liste">
        ${accountsOf(c.id).length === 0
          ? `<span class="keine-domains">Keine Domains zugewiesen</span>`
          : accountsOf(c.id).map(a => `
            <span class="domain-chip" title="${a.dnsSubdomain ? "DNS-Subdomain: " + esc(a.dnsSubdomain) : ""}">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/></svg>
              ${esc(a.commonName)}
              <button title="Domain entfernen" onclick="removeAccount('${esc(c.id)}', '${esc(a.id)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </span>`).join("")}
      </div>
      <div class="zuweisen-bereich">
        <div class="zuweisen-zeile">
          <input type="text" id="domainInput-${esc(c.id)}"
            placeholder="Domain zuweisen, z. B. beispiel.de"
            value="${esc(domainInputs[c.id] || "")}"
            oninput="onDomainInputChanged('${esc(c.id)}', this.value)"
            onkeydown="if(event.key==='Enter')assignDomain('${esc(c.id)}')">
          <button class="btn-zuweisen" onclick="assignDomain('${esc(c.id)}')">Zuweisen</button>
        </div>
        <p class="fehler" id="error-${esc(c.id)}">${
          errorMessages[c.id]
            ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg> ${esc(errorMessages[c.id])}`
            : ""
        }</p>
      </div>
    </div>
  `).join("");
}

// ------------------------------------------------------------------
// Startup: load customers and accounts in parallel, group, render
// ------------------------------------------------------------------

async function init() {
  const list = document.getElementById("customerList");
  list.innerHTML = `<div class="karte leer-hinweis">Lade Kunden …</div>`;
  try {
    const [customerList, accountList] = await Promise.all([
      api.getCustomers(),
      api.getAccounts(),
    ]);
    customers = customerList;
    accountsByCustomer = {};
    for (const account of accountList) {
      (accountsByCustomer[account.customerID] ||= []).push(account);
    }
    render();
  } catch (error) {
    list.innerHTML = `<div class="karte leer-hinweis" style="color:#dc2626">
      Daten konnten nicht geladen werden: ${esc(error.message)}<br><br>
      Hinweis: Im Testmodus muss die Seite über einen lokalen Server laufen
      (z. B. <code>python -m http.server</code>). Im API-Modus prüfe API_BASE in api.js
      und ob der Dienst CORS für diese Seite erlaubt.
    </div>`;
  }
}

init();
