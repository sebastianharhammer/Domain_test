const DOMAIN_RE = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z0-9-]{1,63})*\.[a-zA-Z]{2,}$/;

// Available tags – extend this list as needed. The checkboxes in the
// create form and the filter bar are generated from it automatically.
const AVAILABLE_TAGS = ["Hosting", "E-Mail", "Webdesign", "Wartung", "SEO"];

// Local copy of the data – filled via the data layer (api.js)
let customers = [];

// Active tag filters (customer must have ALL selected tags)
let activeTagFilters = [];

// Remembers per-customer inputs & errors so they survive re-rendering
const domainInputs = {};
const errorMessages = {};

function esc(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ------------------------------------------------------------------
// Create customer
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

function getSelectedTags() {
  return [...document.querySelectorAll("#createForm .tag-checkbox input:checked")]
    .map(cb => cb.value);
}

async function createCustomer() {
  const name = document.getElementById("newName").value.trim();
  if (!name) return;
  const contact = document.getElementById("newContact").value.trim();
  const tags = getSelectedTags();
  try {
    const newCustomer = await api.createCustomer(name, contact, tags);
    customers.push(newCustomer);
    document.getElementById("newName").value = "";
    document.getElementById("newContact").value = "";
    document.querySelectorAll("#createForm .tag-checkbox input").forEach(cb => (cb.checked = false));
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
    delete domainInputs[id];
    delete errorMessages[id];
    render();
  } catch (error) {
    showGlobalError("Kunde konnte nicht gelöscht werden: " + error.message);
  }
}

// ------------------------------------------------------------------
// Domains
// ------------------------------------------------------------------

function findDomainOwner(domain) {
  for (const c of customers) {
    if (c.domains.includes(domain)) return c.name;
  }
  return null;
}

async function assignDomain(customerId) {
  const field = document.getElementById("domainInput-" + customerId);
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
    const updated = await api.addDomain(customerId, raw);
    customers = customers.map(c => (c.id === customerId ? updated : c));
    domainInputs[customerId] = "";
    errorMessages[customerId] = "";
    render();
    document.getElementById("domainInput-" + customerId).focus();
  } catch (error) {
    errorMessages[customerId] = "Zuweisung fehlgeschlagen: " + error.message;
    domainInputs[customerId] = field.value;
    render();
  }
}

async function removeDomain(customerId, domain) {
  try {
    const updated = await api.removeDomain(customerId, domain);
    customers = customers.map(c => (c.id === customerId ? updated : c));
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
    document.getElementById("error-" + customerId).textContent = "";
  }
}

// ------------------------------------------------------------------
// Search & tag filter
// ------------------------------------------------------------------

function clearSearch() {
  document.getElementById("search").value = "";
  render();
}

function toggleTagFilter(tag) {
  if (activeTagFilters.includes(tag)) {
    activeTagFilters = activeTagFilters.filter(t => t !== tag);
  } else {
    activeTagFilters.push(tag);
  }
  render();
}

function renderTagFilterBar() {
  document.getElementById("tagFilterBar").innerHTML =
    `<span class="filter-label">Filter:</span>` +
    AVAILABLE_TAGS.map(tag => `
      <button
        class="tag-filter ${activeTagFilters.includes(tag) ? "aktiv" : ""}"
        onclick="toggleTagFilter('${esc(tag)}')"
      >${esc(tag)}</button>
    `).join("") +
    (activeTagFilters.length
      ? `<button class="tag-filter-reset" onclick="activeTagFilters=[];render()">Zurücksetzen</button>`
      : "");
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

  renderTagFilterBar();

  let filtered = customers;

  if (query) {
    filtered = filtered.filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.kontakt.toLowerCase().includes(query) ||
      c.domains.some(d => d.includes(query))
    );
  }

  if (activeTagFilters.length) {
    filtered = filtered.filter(c =>
      activeTagFilters.every(tag => (c.tags || []).includes(tag))
    );
  }

  const totalDomains = customers.reduce((sum, c) => sum + c.domains.length, 0);
  document.getElementById("stats").textContent =
    `${customers.length} Kunden · ${totalDomains} Domains zugewiesen`;

  const list = document.getElementById("customerList");

  if (filtered.length === 0) {
    list.innerHTML = `<div class="karte leer-hinweis">${
      customers.length === 0
        ? "Noch keine Kunden. Lege oben den ersten Kunden an."
        : "Keine Treffer für diese Suche bzw. diesen Filter."
    }</div>`;
    return;
  }

  list.innerHTML = filtered.map(c => `
    <div class="karte kunde-karte">
      <div class="kunde-kopf">
        <div>
          <h3>${esc(c.name)}</h3>
          ${c.kontakt ? `<p class="kunde-kontakt">${esc(c.kontakt)}</p>` : ""}
          ${(c.tags || []).length ? `
            <div class="tag-liste">
              ${c.tags.map(t => `<span class="tag-chip">${esc(t)}</span>`).join("")}
            </div>` : ""}
        </div>
        <button class="btn-loeschen" title="Kunden löschen" onclick="deleteCustomer(${c.id})">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
        </button>
      </div>
      <div class="domain-liste">
        ${c.domains.length === 0
          ? `<span class="keine-domains">Keine Domains zugewiesen</span>`
          : c.domains.map(d => `
            <span class="domain-chip">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/></svg>
              ${esc(d)}
              <button title="Domain entfernen" onclick="removeDomain(${c.id}, '${esc(d)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </span>`).join("")}
      </div>
      <div class="zuweisen-bereich">
        <div class="zuweisen-zeile">
          <input type="text" id="domainInput-${c.id}"
            placeholder="Domain zuweisen, z. B. beispiel.de"
            value="${esc(domainInputs[c.id] || "")}"
            oninput="onDomainInputChanged(${c.id}, this.value)"
            onkeydown="if(event.key==='Enter')assignDomain(${c.id})">
          <button class="btn-zuweisen" onclick="assignDomain(${c.id})">Zuweisen</button>
        </div>
        <p class="fehler" id="error-${c.id}">${
          errorMessages[c.id]
            ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg> ${esc(errorMessages[c.id])}`
            : ""
        }</p>
      </div>
    </div>
  `).join("");
}

// ------------------------------------------------------------------
// Startup: build tag checkboxes, load data via the data layer, render
// ------------------------------------------------------------------

function buildTagCheckboxes() {
  document.getElementById("tagCheckboxes").innerHTML = AVAILABLE_TAGS.map(tag => `
    <label class="tag-checkbox">
      <input type="checkbox" value="${esc(tag)}"> ${esc(tag)}
    </label>
  `).join("");
}

async function init() {
  buildTagCheckboxes();
  const list = document.getElementById("customerList");
  list.innerHTML = `<div class="karte leer-hinweis">Lade Kunden …</div>`;
  try {
    customers = await api.getCustomers();
    render();
  } catch (error) {
    list.innerHTML = `<div class="karte leer-hinweis" style="color:#dc2626">
      Daten konnten nicht geladen werden: ${esc(error.message)}<br><br>
      Hinweis: Die Seite muss über einen lokalen Server laufen (nicht per Doppelklick öffnen),
      z. B. mit <code>python -m http.server</code> im Projektordner.
    </div>`;
  }
}

init();
