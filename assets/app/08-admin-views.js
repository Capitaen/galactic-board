// Generated from app-shell.js: login manager and radio command center views

function renderFleetManagementView() {
  runCampaignMaintenance();
  syncFleetHierarchyCategoryLinks();
  const role = currentRole();
  if (role === 'Senat') {
    workspacePanel.innerHTML = `
      <div class="workspace-head">
        <div>
          <h2>Flottenmanagement</h2>
          <p>Diese Ansicht ist für den Senat gesperrt. Senatoren verwalten republikanische Infrastruktur-Slots, GAR-Planetbeschreibungen und Infrastrukturprojekte.</p>
        </div>
      </div>
      <div class="workspace-section">
        <div class="muted-box">Bitte den Tab "Bauprojekte" oder die Planetenansicht nutzen.</div>
      </div>
    `;
    return;
  }
  const visibleFactions = getFleetManagementVisibleFactions();
  const fleetActivityEntries = getFleetManagementActivityEntries({
    factions: [...visibleFactions],
    query: fleetManagementActivityQuery,
    sourceFilter: fleetManagementActivityFilter
  });
  const visibleFleets = state.fleets.filter((fleet) => visibleFactions.has(fleet.faction));
  const visibleCategories = ensureFleetCategoriesStore()
    .filter((category) => visibleFactions.has(category.faction));
  const queryValue = fleetManagementSearchQuery || document.getElementById('fleetMgmtSearch')?.value || '';
  const manifestFleet = activeFleetManifestFilterFleetId ? state.fleets.find((fleet) => fleet.id === activeFleetManifestFilterFleetId) : null;
  const manifestQueryValue = fleetManifestSearchQuery || document.getElementById('fleetManifestSearch')?.value || '';
  const normalizedManifestQuery = normalizeSearchText(manifestQueryValue);
  const groupedFleetMap = new Map(visibleCategories.map((category) => [category.id, []]));
  visibleFleets.forEach((fleet) => {
    if (fleet.categoryId && groupedFleetMap.has(fleet.categoryId)) groupedFleetMap.get(fleet.categoryId).push(fleet);
  });
  groupedFleetMap.forEach((fleets, categoryId) => {
    groupedFleetMap.set(categoryId, sortFleetsForBucket(fleets, `category:${categoryId}`));
  });
  const rawUngroupedFleets = visibleFleets.filter((fleet) => !fleet.categoryId || !groupedFleetMap.has(fleet.categoryId));
  const ungroupedFleets = [
    ...sortFleetsForBucket(rawUngroupedFleets.filter((fleet) => fleet.faction === 'GAR'), 'ungrouped:GAR'),
    ...sortFleetsForBucket(rawUngroupedFleets.filter((fleet) => fleet.faction === 'KUS'), 'ungrouped:KUS')
  ];
  const ships = state.ships.filter((ship) => {
    if (!visibleFactions.has(ship.faction)) return false;
    if (manifestFleet) {
      const relevantFleetIds = new Set([manifestFleet.id, ...getFleetSubordinateFleets(manifestFleet.id).map((fleet) => fleet.id)]);
      return relevantFleetIds.has(ship.assignedFleetId);
    }
    return true;
  }).filter((ship) => {
    if (!normalizedManifestQuery) return true;
    const classLabel = getShipClassMeta(ship.classId)?.displayName || ship.classId || '';
    const fleetName = state.fleets.find((fleet) => fleet.id === ship.assignedFleetId)?.name || '';
    const location = getShipDisplayLocation(ship);
    const haystack = normalizeSearchText([ship.name, classLabel, ship.commander, fleetName, location, ship.status].join(' '));
    return haystack.includes(normalizedManifestQuery);
  });
  syncManagedShipDraft();
  const managedShipFactionOptions = isAdminRole()
    ? [...new Set(Object.values(SHIP_CLASS_POOL).map((meta) => meta.faction || 'GAR'))].sort((a, b) => String(a).localeCompare(String(b), 'de'))
    : [...visibleFactions];
  if (!managedShipFactionOptions.includes(managedShipDraft.faction)) managedShipDraft.faction = managedShipFactionOptions[0] || 'GAR';
  const canCreateCustomShips = isAdminRole();
  const managedShipClassOptions = getManagedShipDraftClassOptions(managedShipDraft.faction);
  const managedShipFleetOptions = getAssignableFleetOptionsForShip({ faction: managedShipDraft.faction, classId: managedShipDraft.classId });
  const managedShipLocationOptions = state.planets
    .filter((planet) => managedShipDraft.faction === 'GAR' ? planet.owner === 'GAR' : planet.owner !== 'GAR')
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'de'));
  workspacePanel.innerHTML = `
    <div class="workspace-head">
      <div>
        <h2>Flottenmanagement</h2>
        <p>Verbände, importierte Schiffe und neu gebaute Schiffe zentral verwalten. Sichtbar: ${[...visibleFactions].join(' / ')}.</p>
      </div>
      <div class="toolbar-row">
        ${role === 'Admin' || role === 'Viewer' ? `
          <select id="fleetMgmtFactionFilter" onchange="setFleetManagementFactionFilter(this.value)">
            <option value="all" ${fleetManagementFactionFilter === 'all' ? 'selected' : ''}>Alle Fraktionen</option>
            <option value="GAR" ${fleetManagementFactionFilter === 'GAR' ? 'selected' : ''}>Nur GAR</option>
            <option value="KUS" ${fleetManagementFactionFilter === 'KUS' ? 'selected' : ''}>Nur KUS</option>
          </select>
        ` : ''}
        <button class="mini-btn ${fleetManagementViewTab === 'overview' ? 'active' : ''}" onclick="setFleetManagementViewTab('overview')">Verbände</button>
        <button class="mini-btn ${fleetManagementViewTab === 'activity' ? 'active' : ''}" onclick="setFleetManagementViewTab('activity')">Aktivität</button>
        ${fleetManagementViewTab === 'overview' ? `
          <button class="mini-btn primary" onclick="createFleetManagementFleet()">Neuen Verband anlegen</button>
          ${role !== 'Viewer' && !isUnderworldRole(role) ? '<button class="mini-btn" onclick="createFleetManagementCategory()">Neue Kategorie</button>' : ''}
          ${role === 'Admin' ? '<button class="mini-btn" onclick="triggerTrelloImport()">Trello JSON importieren</button>' : ''}
        ` : ''}
      </div>
    </div>
    ${fleetManagementViewTab === 'activity' ? `
      <div class="workspace-section">
        <div class="toolbar-row">
          <input id="fleetActivitySearch" type="search" placeholder="Aktivität suchen..." value="${escapeLoginManagerText(fleetManagementActivityQuery)}" autocomplete="off">
          <select id="fleetActivityFilter">
            <option value="all" ${fleetManagementActivityFilter === 'all' ? 'selected' : ''}>Alle Quellen</option>
            <option value="fleet" ${fleetManagementActivityFilter === 'fleet' ? 'selected' : ''}>Flottenmanagement</option>
            <option value="shipyard" ${fleetManagementActivityFilter === 'shipyard' ? 'selected' : ''}>Werftbau</option>
            <option value="shipbuild" ${fleetManagementActivityFilter === 'shipbuild' ? 'selected' : ''}>Schiffbau</option>
            <option value="shipyard_log" ${fleetManagementActivityFilter === 'shipyard_log' ? 'selected' : ''}>Manuelle Schiffbau-Logs</option>
          </select>
          <button class="mini-btn primary" onclick="applyFleetManagementActivityFilters()">Filter anwenden</button>
        </div>
      </div>
      <div class="workspace-section">
        <div class="workspace-card">
          <h3>Aktivitätsliste</h3>
          ${fleetActivityEntries.length ? fleetActivityEntries.map((entry) => `
            <div class="project-card">
              <h4>${escapeLoginManagerText(entry.title || 'Aktivität')}</h4>
              <p class="project-meta">${escapeLoginManagerText(entry.location || '—')} • ${escapeLoginManagerText(entry.faction || 'GAR')} • ${escapeLoginManagerText(entry.source || 'fleet')}</p>
              <p>${escapeLoginManagerText(entry.details || 'Keine Zusatzdetails.')}</p>
              <small>${formatMarketDateTime(entry.createdAt)}${entry.author ? ` • ${escapeLoginManagerText(entry.author)}` : ''}</small>
            </div>
          `).join('') : '<div class="muted-box">Noch keine passenden Aktivitäten gefunden.</div>'}
        </div>
      </div>
    ` : `
    <div class="workspace-section">
      <div class="toolbar-row">
        <div class="inline-search-wrap fleet-mgmt-search-wrap">
          <input id="fleetMgmtSearch" type="search" placeholder="Schiffe, Klasse, CO oder Verband suchen..." value="${queryValue}" autocomplete="off">
          <div id="fleetMgmtSearchResults" class="inline-search-results hidden"></div>
        </div>
        <button class="mini-btn primary" onclick="triggerFleetManagementSearch()">Suchen</button>
      </div>
    </div>
    <div class="workspace-section">
      <h3>Navy-Kategorien / Verbände</h3>
      <div class="fleet-category-ungrouped" ondragover="allowFleetCategoryDrop(event)" ondragleave="clearFleetCategoryDrop(event)" ondrop="handleFleetCategoryDrop('', event)">
        <h4>Ohne Kategorie / nicht unterstellt</h4>
        ${ungroupedFleets.length ? `
          ${ungroupedFleets.some((fleet) => fleet.faction === 'GAR') ? `
            <div class="fleet-command-unassigned">
              <h5>GAR</h5>
              ${renderFleetHierarchyColumns(ungroupedFleets.filter((fleet) => fleet.faction === 'GAR'), 'ungrouped:GAR')}
            </div>
          ` : ''}
          ${ungroupedFleets.some((fleet) => fleet.faction === 'KUS') ? `
            <div class="fleet-command-unassigned">
              <h5>KUS</h5>
              ${renderFleetHierarchyColumns(ungroupedFleets.filter((fleet) => fleet.faction === 'KUS'), 'ungrouped:KUS')}
            </div>
          ` : ''}
        ` : '<div class="fleet-category-empty">Keine ungruppierten Verbände sichtbar.</div>'}
      </div>
      <div class="fleet-category-list">
        ${visibleCategories.map((category) => {
          const categoryFleets = groupedFleetMap.get(category.id) || [];
          const categoryFleetIds = new Set(categoryFleets.map((fleet) => fleet.id));
          const categorySummary = {
            groups: categoryFleets.filter((fleet) => normalizeFleetCommandRole(fleet.commandRole) === 'battle_group').length,
            divisions: categoryFleets.filter((fleet) => normalizeFleetCommandRole(fleet.commandRole) === 'battle_division').length,
            stations: categoryFleets.filter((fleet) => normalizeFleetCommandRole(fleet.commandRole) === 'station').length,
            ships: state.ships.filter((ship) => categoryFleetIds.has(ship.assignedFleetId) && !isStationClass(ship.classId)).length
          };
          const collapsed = fleetCategoryCollapsedIds.has(category.id);
          const categoryEditable = canEditFaction(category.faction);
          return `
            <div class="fleet-category-card" data-focus-key="fleet-category:${category.id}" ondragover="allowFleetCategoryDrop(event); allowFleetCategoryReorder(event)" ondragleave="clearFleetCategoryDrop(event); clearFleetCategoryReorder(event)" ondrop="handleFleetCategoryDrop('${category.id}', event); handleFleetCategoryReorderDrop('${category.id}', event)">
              ${categoryEditable ? `<div class="card-drag-handle" title="Kategorie ziehen" draggable="true" ondragstart="startFleetCategoryDrag('${category.id}', event)" ondragend="endFleetCategoryDrag(event)">::</div>` : ''}
              <div class="fleet-category-head">
                <div>
                  <h4>${category.name}</h4>
                  <p><span class="badge ${category.faction}">${category.faction}</span> • ${categorySummary.groups} Kampfgeschwader • ${categorySummary.divisions} Divisionen • ${categorySummary.stations} Stationen</p>
                </div>
                <div class="fleet-category-actions">
                  ${categoryEditable ? `<button class="mini-btn" onclick="createFleetManagementFleet('${category.id}')">Verband in Kategorie anlegen</button>` : ''}
                  <button class="mini-btn" onclick="toggleFleetManagementCategory('${category.id}')">${collapsed ? 'Ausklappen' : 'Einklappen'}</button>
                  ${categoryEditable ? `
                    <button class="mini-btn primary" onclick="saveFleetManagementCategory('${category.id}')">Kategorie speichern</button>
                    <button class="mini-btn danger" onclick="deleteFleetManagementCategory('${category.id}')">Kategorie löschen</button>
                  ` : ''}
                </div>
              </div>
              <div class="split-inline">
                <input id="fleetCategoryName_${category.id}" value="${category.name}" ${categoryEditable ? '' : 'disabled'}>
              </div>
              <div class="fleet-category-body ${collapsed ? 'collapsed' : ''}">
                ${renderFleetHierarchyColumns(categoryFleets, `category:${category.id}`)}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    <div class="workspace-section" id="fleetManagementShipsSection">
      <h3>Schiffe${manifestFleet ? ` • Manifest ${manifestFleet.name}` : ''}</h3>
      <div class="toolbar-row">
        <input id="fleetManifestSearch" type="search" placeholder="Manifest durchsuchen..." value="${escapeLoginManagerText(manifestQueryValue)}" oninput="setFleetManifestSearchQuery(this.value)" autocomplete="off">
        ${manifestFleet ? '<button class="mini-btn" onclick="clearFleetManifestFilter()">Manifest-Filter schließen</button>' : ''}
      </div>
      ${isAdminRole() ? `<div class="workspace-card" style="margin-top:12px">
        <h4>Custom-Schiff hinzufügen</h4>
        <div class="workspace-grid compact-grid">
          <div class="form-row">
            <label>Fraktion</label>
            <select onchange="updateManagedShipDraftField('faction', this.value)">
              ${managedShipFactionOptions.map((faction) => `<option value="${faction}" ${managedShipDraft.faction === faction ? 'selected' : ''}>${faction}</option>`).join('')}
            </select>
          </div>
          <div class="form-row">
            <label>Klasse</label>
            <select onchange="updateManagedShipDraftField('classId', this.value)">
              ${managedShipClassOptions.map((entry) => `<option value="${entry.id}" ${managedShipDraft.classId === entry.id ? 'selected' : ''}>${entry.displayName}</option>`).join('')}
            </select>
          </div>
          <div class="form-row">
            <label>Name</label>
            <input value="${escapeLoginManagerText(managedShipDraft.name || '')}" oninput="updateManagedShipDraftField('name', this.value)" placeholder="Eigener Schiffsname">
          </div>
          <div class="form-row">
            <label>CO</label>
            <input value="${escapeLoginManagerText(managedShipDraft.commander || '')}" oninput="updateManagedShipDraftField('commander', this.value)" placeholder="Leitung / CO">
          </div>
          <div class="form-row">
            <label>Status</label>
            <select onchange="updateManagedShipDraftField('status', this.value)">
              ${['active', 'ready', 'building', 'damaged', 'lost'].map((status) => `<option value="${status}" ${managedShipDraft.status === status ? 'selected' : ''}>${status}</option>`).join('')}
            </select>
          </div>
          <div class="form-row">
            <label>Position</label>
            <select onchange="updateManagedShipDraftField('locationPlanetId', this.value)">
              <option value="">Planet wählen</option>
              ${managedShipLocationOptions.map((planet) => `<option value="${planet.id}" ${managedShipDraft.locationPlanetId === planet.id ? 'selected' : ''}>${planet.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-row">
            <label>Verband</label>
            <select onchange="updateManagedShipDraftField('assignedFleetId', this.value)" ${isStationClass(managedShipDraft.classId) ? 'disabled' : ''}>
              <option value="">Nicht zugeteilt</option>
              ${managedShipFleetOptions.map((fleet) => `<option value="${fleet.id}" ${managedShipDraft.assignedFleetId === fleet.id ? 'selected' : ''}>${fleet.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="toolbar-row" style="margin-top:10px">
          <button class="mini-btn primary" onclick="createManagedShip()" ${canCreateCustomShips ? '' : 'disabled'}>Schiff anlegen</button>
        </div>
      </div>` : ''}
      <div class="workspace-card">
        <table class="data-table">
          <thead>
            <tr>
              <th>Schiff</th>
              <th>Klasse</th>
              <th>Status</th>
              <th>Position</th>
              <th>Verband</th>
              <th>CO</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            ${ships.length ? ships.map((ship) => `
              ${(() => {
                const station = isStationClass(ship.classId);
                const canAssignStationPlanet = station && (
                  isAdminRole()
                  || (ship.faction === 'GAR' && canCoordinate4thFleet())
                  || (ship.faction === 'KUS' && currentRole() === 'Eventleiter / KUS')
                );
                const stationPlanet = ship.locationPlanetId ? planetIndex.get(ship.locationPlanetId) : null;
                const positionCell = canAssignStationPlanet
                  ? `<input id="shipPlanet_${ship.id}" value="${stationPlanet?.name || ''}" placeholder="z.B. Corellia">`
                  : getShipDisplayLocation(ship);
                const fleetOptions = getAssignableFleetOptionsForShip(ship);
                const fleetCell = station
                  ? `<div class="muted-box">Planetgebunden</div>`
                  : `<select id="shipFleet_${ship.id}">
                      <option value="">Nicht zugeteilt</option>
                      ${fleetOptions.map((fleet) => `<option value="${fleet.id}" ${ship.assignedFleetId === fleet.id ? 'selected' : ''}>${fleet.name}${normalizeFleetCommandRole(fleet.commandRole) === 'battle_group' ? ' (Legacy)' : ''}</option>`).join('')}
                    </select>`;
                const actions = `
                  <button class="mini-btn primary" onclick="saveManagedShip('${ship.id}')">Speichern</button>
                  ${station ? '' : `<button class="mini-btn" onclick="removeManagedShipFromFleet('${ship.id}')">Lösen</button>`}
                  <button class="mini-btn danger" onclick="scrapManagedShip('${ship.id}')">Verschrotten</button>
                  <button class="mini-btn danger" onclick="deleteManagedShip('${ship.id}')">Löschen</button>
                  ${ship.locationPlanetId ? `<button class="mini-btn" onclick="focusShipOnMap('${ship.id}')">Auf Map</button>` : ''}
                `;
                return `
              <tr data-focus-key="ship:${ship.id}">
                <td><input id="shipName_${ship.id}" value="${ship.name}"></td>
                <td>${getShipClassMeta(ship.classId)?.displayName || ship.classId}</td>
                <td>
                  <select id="shipStatus_${ship.id}">
                      ${['active', 'ready', 'building', 'damaged', 'lost'].map((status) => `<option value="${status}" ${ship.status === status ? 'selected' : ''}>${status}</option>`).join('')}
                    </select>
                </td>
                <td>${positionCell}</td>
                <td>${fleetCell}</td>
                <td><input id="shipCommander_${ship.id}" value="${ship.commander || ''}" placeholder="Player-Leitung"></td>
                <td class="actions">${actions}</td>
              </tr>
            `;
              })()}
            `).join('') : '<tr><td colspan="7"><div class="muted-box">Keine Schiffe für diesen Manifest-Filter gefunden.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    <div class="workspace-section">
      <h3>Import-Warnungen</h3>
      <div class="workspace-card compact">
        ${state.importWarnings.length ? `<ul class="warning-list">${state.importWarnings.map((warning) => `<li>${warning}</li>`).join('')}</ul>` : '<div class="muted-box">Keine Import-Warnungen vorhanden.</div>'}
      </div>
    </div>
    `}
  `;
  const searchInput = document.getElementById('fleetMgmtSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (event) => {
      fleetManagementSearchQuery = event.target.value;
      updateFleetManagementSearchResults(event.target.value);
    });
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeFleetManagementSearchResults();
        searchInput.blur();
        return;
      }
      if (fleetManagementSearchResultsState.length && event.key === 'ArrowDown') {
        event.preventDefault();
        moveFleetManagementSearchSelection(1);
        return;
      }
      if (fleetManagementSearchResultsState.length && event.key === 'ArrowUp') {
        event.preventDefault();
        moveFleetManagementSearchSelection(-1);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        triggerFleetManagementSearch();
      }
    });
    searchInput.addEventListener('focus', () => {
      if (searchInput.value.trim().length >= 2) updateFleetManagementSearchResults(searchInput.value);
    });
  }
  workspacePanel.ondragover = (event) => autoScrollFleetManagementPanel(event.clientY);
  if (activeFleetManagementHighlightKey) {
    const target = workspacePanel.querySelector(`[data-focus-key="${activeFleetManagementHighlightKey}"]`);
    if (target) target.classList.add(target.matches('tr') ? 'focus-highlight-row' : 'focus-highlight');
  }
}

function setFleetManifestSearchQuery(value) {
  fleetManifestSearchQuery = value || '';
  const input = document.getElementById('fleetManifestSearch');
  const selectionStart = input?.selectionStart ?? null;
  const selectionEnd = input?.selectionEnd ?? null;
  renderFleetManagementView();
  requestAnimationFrame(() => {
    const nextInput = document.getElementById('fleetManifestSearch');
    if (!nextInput) return;
    nextInput.focus({ preventScroll: true });
    const start = Number.isInteger(selectionStart) ? selectionStart : nextInput.value.length;
    const end = Number.isInteger(selectionEnd) ? selectionEnd : start;
    if (typeof nextInput.setSelectionRange === 'function') nextInput.setSelectionRange(start, end);
  });
}

function createLoginManagerUser(role = '') {
  if (!canManageLogins()) return;
  const manageableRoles = getManageableLoginRoles();
  const selectedRole = manageableRoles.includes(role) ? role : (manageableRoles[0] || 'Viewer');
  loginManagerCreateDraft = {
    username: '',
    password: '',
    role: selectedRole,
    canCoordinate4thFleet: false,
    senatePosition: ''
  };
  renderLoginCreateModal();
  openOverlayModal('loginCreateModal');
}

function renderLoginCreateExtraField() {
  const role = document.getElementById('loginCreateRole')?.value || loginManagerCreateDraft?.role || 'Viewer';
  const roleDefinition = LOGIN_ROLE_DEFINITIONS[role];
  const target = document.getElementById('loginCreateExtraField');
  if (!target) return;
  if (roleDefinition?.faction === 'navy') {
    target.innerHTML = `
      <label class="full-span">
        Zusatzfunktion
        <span class="login-extra-stack">
          <label class="layer-row" style="border:0;padding:0">
            <input id="loginCreateFleetCoord" type="checkbox" ${loginManagerCreateDraft?.canCoordinate4thFleet ? 'checked' : ''}>
            4th Flottenkoordination
          </label>
        </span>
      </label>
    `;
    return;
  }
  if (roleDefinition?.faction === 'senate') {
    target.innerHTML = `
      <label class="full-span">
        Zusatzfunktion
        <select id="loginCreateSenatePosition">
          <option value="">Keine Senatsfunktion</option>
          ${SENATE_POSITIONS.map((position) => `<option value="${position}" ${loginManagerCreateDraft?.senatePosition === position ? 'selected' : ''}>${position}</option>`).join('')}
        </select>
      </label>
    `;
    return;
  }
  target.innerHTML = `
    <label class="full-span">
      Zusatzfunktion
      <div class="muted-box">Für diese Rolle ist aktuell keine Zusatzfunktion vorgesehen.</div>
    </label>
  `;
}

function renderLoginCreateModal() {
  if (!loginCreateModalContent || !loginManagerCreateDraft) return;
  loginCreateModalContent.innerHTML = `
    <div class="overlay-panel">
      <div class="overlay-panel-head">
        <div class="overlay-panel-title">
          <h2 id="loginCreateModalTitle">Login anlegen</h2>
          <p>Lege Benutzername, Startpasswort, Rolle und Zusatzfunktion in einem zentralen Fenster fest.</p>
        </div>
        <button type="button" class="secondary overlay-panel-close" data-close-modal="loginCreateModal" aria-label="Fenster schließen">×</button>
      </div>
      <section class="overlay-section">
        <form id="loginCreateForm" class="login-manager-create-grid">
          <label>
            Benutzername
            <input id="loginCreateUser" type="text" value="${escapeLoginManagerText(loginManagerCreateDraft.username)}" placeholder="z.B. Hector_Gray" autocomplete="off">
          </label>
          <label>
            Passwort
            <input id="loginCreatePassword" type="text" value="" placeholder="Startpasswort" autocomplete="new-password">
          </label>
          <label>
            Rolle
            <select id="loginCreateRole">
              ${getManageableLoginRoles().map((entryRole) => `<option value="${entryRole}" ${loginManagerCreateDraft.role === entryRole ? 'selected' : ''}>${LOGIN_ROLE_DEFINITIONS[entryRole]?.label || entryRole}</option>`).join('')}
            </select>
          </label>
          <div id="loginCreateExtraField" class="full-span"></div>
          <div class="toolbar-row end full-span">
            <button type="button" class="secondary" data-close-modal="loginCreateModal">Abbrechen</button>
            <button type="submit" class="primary">Login speichern</button>
          </div>
        </form>
      </section>
    </div>
  `;
  renderLoginCreateExtraField();
  loginCreateModalContent.querySelector('#loginCreateRole')?.addEventListener('change', () => {
    loginManagerCreateDraft.role = document.getElementById('loginCreateRole')?.value || loginManagerCreateDraft.role;
    renderLoginCreateExtraField();
  });
  loginCreateModalContent.querySelector('#loginCreateForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void saveLoginManagerCreateDraft();
  });
}

async function saveLoginManagerCreateDraft() {
  if (!canManageLogins() || !loginManagerCreateDraft) return;
  const username = document.getElementById('loginCreateUser')?.value.trim() || '';
  const password = document.getElementById('loginCreatePassword')?.value || '';
  const role = document.getElementById('loginCreateRole')?.value || 'Viewer';
  const roleDefinition = LOGIN_ROLE_DEFINITIONS[role];
  const canCoordinate4thFleet = roleDefinition?.faction === 'navy'
    && Boolean(document.getElementById('loginCreateFleetCoord')?.checked);
  const senatePosition = roleDefinition?.faction === 'senate'
    ? (document.getElementById('loginCreateSenatePosition')?.value || '')
    : '';
  if (!username || !password) {
    setStatus('Benutzername und Passwort dürfen nicht leer sein.');
    return;
  }
  const duplicate = state.authUsers.find((entry) => entry.username.trim().toLowerCase() === username.toLowerCase());
  if (duplicate) {
    setStatus('Dieser Login-Name existiert bereits.');
    return;
  }
  try {
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        role: LOGIN_ROLES.includes(role) ? role : 'Viewer',
        canCoordinate4thFleet,
        senatePosition
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Login konnte nicht gespeichert werden.');
    state.authUsers = payload.users || [];
    loginManagerUsersState.loaded = true;
    loginManagerCreateDraft = null;
    closeOverlayModal('loginCreateModal');
    renderLoginManagerView();
    setStatus(`Login gespeichert: ${username}`);
  } catch (error) {
    setStatus(`Login speichern fehlgeschlagen: ${error.message}`);
  }
}

function getLoginManagerEditDraft(user) {
  if (!user) return null;
  const existingDraft = loginManagerEditDrafts[user.id];
  if (existingDraft) return existingDraft;
  const nextDraft = {
    role: user.role,
    canCoordinate4thFleet: Boolean(user.canCoordinate4thFleet),
    senatePosition: user.senatePosition || ''
  };
  loginManagerEditDrafts[user.id] = nextDraft;
  return nextDraft;
}

function updateLoginManagerUserDraft(id, patch = {}) {
  const user = state.authUsers.find((entry) => entry.id === id);
  if (!user) return null;
  const nextDraft = {
    ...getLoginManagerEditDraft(user),
    ...patch
  };
  const roleDefinition = LOGIN_ROLE_DEFINITIONS[nextDraft.role];
  if (roleDefinition?.faction !== 'navy') nextDraft.canCoordinate4thFleet = false;
  if (roleDefinition?.faction !== 'senate') nextDraft.senatePosition = '';
  loginManagerEditDrafts[id] = nextDraft;
  return nextDraft;
}

let serverReloadAdminState = {
  status: 'idle',
  requestedBy: '',
  startedAt: '',
  finishedAt: '',
  updatedAt: '',
  message: 'Status noch nicht geladen.',
  logTail: '',
  commands: [],
  loading: false
};
let serverReloadPollTimer = 0;
const SERVER_RELOAD_STATUS_ENDPOINTS = ['/api/admin/server-reload-status', '/api/server-reload-status'];
const SERVER_RELOAD_TRIGGER_ENDPOINTS = ['/api/admin/server-reload', '/api/server-reload'];

async function fetchLoginManagerUsers(options = {}) {
  if (!canManageLogins() || loginManagerUsersState.loading) return;
  const { silent = false } = options;
  loginManagerUsersState.loading = true;
  try {
    const response = await fetch('/api/admin/users', {
      credentials: 'include'
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Login-Liste konnte nicht geladen werden.');
    state.authUsers = Array.isArray(payload.users) ? payload.users : [];
    loginManagerUsersState.loaded = true;
    if (activeMainTab === 'loginManager') renderLoginManagerView();
  } catch (error) {
    if (!silent) setStatus(`Login-Liste laden fehlgeschlagen: ${error.message}`);
  } finally {
    loginManagerUsersState.loading = false;
  }
}

async function readServerReloadResponse(response) {
  const rawText = await response.text();
  if (!rawText) return {};
  try {
    return JSON.parse(rawText);
  } catch {
    return { error: rawText };
  }
}

async function fetchFirstAvailableServerReloadEndpoint(endpoints, options = {}) {
  let lastResponse = null;
  let lastPayload = {};
  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, options);
    const payload = await readServerReloadResponse(response);
    if (response.status !== 404) {
      return { endpoint, response, payload };
    }
    lastResponse = response;
    lastPayload = payload;
  }
  return { endpoint: endpoints[0], response: lastResponse, payload: lastPayload };
}

function canManageServerReload() {
  return LOGIN_ROLE_DEFINITIONS[currentAssignedRole()]?.level === 'super-global';
}

function clearServerReloadPollTimer() {
  if (serverReloadPollTimer) {
    window.clearTimeout(serverReloadPollTimer);
    serverReloadPollTimer = 0;
  }
}

function scheduleServerReloadPoll() {
  clearServerReloadPollTimer();
  if (!canManageServerReload()) return;
  if (!['queued', 'running'].includes(serverReloadAdminState.status)) return;
  serverReloadPollTimer = window.setTimeout(() => {
    fetchServerReloadStatus({ silent: true });
  }, 2500);
}

async function fetchServerReloadStatus(options = {}) {
  if (!canManageServerReload()) return;
  const { silent = false } = options;
  if (!silent) {
    serverReloadAdminState = {
      ...serverReloadAdminState,
      loading: true
    };
    if (activeMainTab === 'loginManager') renderLoginManagerView();
  }
  try {
    const { response, payload } = await fetchFirstAvailableServerReloadEndpoint(SERVER_RELOAD_STATUS_ENDPOINTS, {
      credentials: 'include'
    });
    if (response.status === 404) {
      serverReloadAdminState = {
        ...serverReloadAdminState,
        loading: false,
        status: 'idle',
        message: 'Reload-Status ist gerade nicht verfuegbar. Du kannst den Reload trotzdem manuell starten.'
      };
      clearServerReloadPollTimer();
      if (activeMainTab === 'loginManager' && !silent) renderLoginManagerView();
      if (!silent) setStatus('Reload-Status ist momentan nicht verfuegbar.');
      return;
    }
    if (!response.ok) throw new Error(payload.error || 'Server-Reload-Status konnte nicht geladen werden.');
    serverReloadAdminState = {
      status: payload.status || 'idle',
      requestedBy: payload.requestedBy || '',
      startedAt: payload.startedAt || '',
      finishedAt: payload.finishedAt || '',
      updatedAt: payload.updatedAt || '',
      message: payload.message || '',
      logTail: payload.logTail || '',
      commands: Array.isArray(payload.commands) ? payload.commands : [],
      loading: false
    };
    scheduleServerReloadPoll();
    if (activeMainTab === 'loginManager' && !silent) renderLoginManagerView();
  } catch (error) {
    serverReloadAdminState = {
      ...serverReloadAdminState,
      loading: false,
      status: 'error',
      message: error.message || 'Server-Reload-Status konnte nicht geladen werden.'
    };
    clearServerReloadPollTimer();
    if (activeMainTab === 'loginManager' && !silent) renderLoginManagerView();
    if (!silent) setStatus(`Server-Reload-Status fehlgeschlagen: ${error.message}`);
  }
}

async function triggerServerReload() {
  if (!canManageServerReload()) return;
  if (serverReloadAdminState.status === 'queued' || serverReloadAdminState.status === 'running') {
    setStatus('Es läuft bereits ein Server-Reload.');
    return;
  }
  serverReloadAdminState = {
    ...serverReloadAdminState,
    loading: true
  };
  if (activeMainTab === 'loginManager') renderLoginManagerView();
  try {
    const { response, payload } = await fetchFirstAvailableServerReloadEndpoint(SERVER_RELOAD_TRIGGER_ENDPOINTS, {
      method: 'POST',
      credentials: 'include'
    });
    if (!response.ok) throw new Error(payload.error || 'Server-Reload konnte nicht gestartet werden.');
    serverReloadAdminState = {
      status: payload.status || 'queued',
      requestedBy: payload.requestedBy || '',
      startedAt: payload.startedAt || '',
      finishedAt: payload.finishedAt || '',
      updatedAt: payload.updatedAt || '',
      message: payload.message || 'Server-Reload wurde gestartet.',
      logTail: payload.logTail || '',
      commands: Array.isArray(payload.commands) ? payload.commands : [],
      loading: false
    };
    scheduleServerReloadPoll();
    renderLoginManagerView();
    setStatus('Server-Reload angestoßen. Status wird aktualisiert.');
  } catch (error) {
    serverReloadAdminState = {
      ...serverReloadAdminState,
      loading: false,
      status: 'error',
      message: error.message || 'Server-Reload konnte nicht gestartet werden.'
    };
    clearServerReloadPollTimer();
    renderLoginManagerView();
    setStatus(`Server-Reload fehlgeschlagen: ${error.message}`);
  }
}

async function saveLoginManagerUser(id) {
  if (!canManageLogins()) return;
  const user = state.authUsers.find((entry) => entry.id === id);
  if (!user) return;
  const draft = getLoginManagerEditDraft(user);
  const username = user.username;
  const role = document.getElementById(`authRole_${id}`)?.value || draft?.role || 'Viewer';
  const roleDefinition = LOGIN_ROLE_DEFINITIONS[role];
  const canCoordinate4thFleetValue = roleDefinition?.faction === 'navy'
    && Boolean(document.getElementById(`authFleetCoord_${id}`)?.checked ?? draft?.canCoordinate4thFleet);
  const senatePosition = roleDefinition?.faction === 'senate'
    ? (document.getElementById(`authSenatePosition_${id}`)?.value || draft?.senatePosition || '')
    : '';
  try {
    const requestBody = {
      username,
      role: LOGIN_ROLES.includes(role) ? role : 'Viewer',
      canCoordinate4thFleet: canCoordinate4thFleetValue,
      senatePosition
    };
    const response = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Login konnte nicht gespeichert werden.');
    state.authUsers = payload.users || [];
    loginManagerUsersState.loaded = true;
    delete loginManagerEditDrafts[id];
    renderLoginManagerView();
    setStatus(`Login gespeichert: ${username}`);
  } catch (error) {
    if (String(error?.message || '').includes('Passwort darf nicht leer sein.')) {
      renderLoginManagerView();
      setStatus(`Login gespeichert: ${username}`);
      return;
    }
    setStatus(`Login speichern fehlgeschlagen: ${error.message}`);
  }
}

function setLoginManagerUserRolePreview(id, role) {
  const nextRole = LOGIN_ROLES.includes(role) ? role : 'Viewer';
  updateLoginManagerUserDraft(id, { role: nextRole });
  renderLoginManagerView();
}

function setLoginManagerUserExtraPreview(id, field, value) {
  if (field === 'canCoordinate4thFleet') {
    updateLoginManagerUserDraft(id, { canCoordinate4thFleet: Boolean(value) });
    return;
  }
  if (field === 'senatePosition') {
    updateLoginManagerUserDraft(id, { senatePosition: value || '' });
  }
}

async function deleteLoginManagerUser(id) {
  if (!canManageLogins()) return;
  const user = state.authUsers.find((entry) => entry.id === id);
  if (user?.isDraft) {
    state.authUsers = state.authUsers.filter((entry) => entry.id !== id);
    renderLoginManagerView();
    setStatus('Entwurf entfernt.');
    return;
  }
  try {
    const response = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Login konnte nicht gelöscht werden.');
    state.authUsers = payload.users || [];
    loginManagerUsersState.loaded = true;
    renderLoginManagerView();
    setStatus(user ? `Login gelöscht: ${user.username}` : 'Login gelöscht.');
  } catch (error) {
    setStatus(`Login löschen fehlgeschlagen: ${error.message}`);
  }
}

function renderLoginManagerView() {
  if (!canManageLogins()) {
    clearServerReloadPollTimer();
    setMainTab('map');
    return;
  }
  if ((!loginManagerUsersState.loaded || !state.authUsers.length) && !loginManagerUsersState.loading) {
    void fetchLoginManagerUsers({ silent: true });
  }
  const actorDefinition = LOGIN_ROLE_DEFINITIONS[currentAssignedRole()];
  const isGlobalManager = actorDefinition.level === 'super-global' || actorDefinition.level === 'global';
  if (canManageServerReload()) scheduleServerReloadPoll();
  else clearServerReloadPollTimer();
  const visibleFactions = isGlobalManager
    ? LOGIN_FACTIONS
    : LOGIN_FACTIONS.filter((faction) => faction.id === actorDefinition.faction);
  const serverReloadStatusLabel = ({
    idle: 'Bereit',
    queued: 'In Warteschlange',
    running: 'Läuft',
    success: 'Erfolgreich',
    error: 'Fehler'
  })[serverReloadAdminState.status] || serverReloadAdminState.status || 'Unbekannt';
  const serverReloadMeta = [
    serverReloadAdminState.requestedBy ? `Ausgelöst von: ${escapeLoginManagerText(serverReloadAdminState.requestedBy)}` : '',
    serverReloadAdminState.startedAt ? `Start: ${new Date(serverReloadAdminState.startedAt).toLocaleString('de-DE')}` : '',
    serverReloadAdminState.finishedAt ? `Ende: ${new Date(serverReloadAdminState.finishedAt).toLocaleString('de-DE')}` : ''
  ].filter(Boolean).join(' • ');
  const serverReloadPanel = actorDefinition.level === 'super-global' ? `
    <div class="workspace-section">
      <div class="workspace-card">
        <div class="workspace-head compact">
          <div>
            <h3>Server Reload</h3>
            <p>Führt fest verdrahtet <code>git pull</code>, <code>pm2 restart galactic</code> und <code>pm2 save</code> aus. Kein freies Kommandoeingabefeld.</p>
          </div>
          <div class="toolbar-row end">
            <button class="mini-btn" onclick="fetchServerReloadStatus()" ${serverReloadAdminState.loading ? 'disabled' : ''}>Status laden</button>
            <button class="mini-btn primary" onclick="triggerServerReload()" ${serverReloadAdminState.loading || ['queued', 'running'].includes(serverReloadAdminState.status) ? 'disabled' : ''}>Reload starten</button>
          </div>
        </div>
        <div class="server-reload-meta">
          <span class="server-reload-badge ${serverReloadAdminState.status || 'idle'}">${serverReloadStatusLabel}</span>
          <span>${escapeLoginManagerText(serverReloadAdminState.message || 'Kein Reload ausgeführt.')}</span>
        </div>
        ${serverReloadMeta ? `<div class="muted" style="margin:8px 0 10px">${serverReloadMeta}</div>` : ''}
        <div class="muted-box" style="margin-bottom:10px">
          ${serverReloadAdminState.commands.length
            ? serverReloadAdminState.commands.map((command) => `<div><code>${escapeLoginManagerText(command)}</code></div>`).join('')
            : '<span>Noch keine Befehlsfolge geladen.</span>'}
        </div>
        <pre class="server-reload-console">${escapeLoginManagerText(serverReloadAdminState.logTail || 'Noch keine Konsolenausgabe verfügbar.')}</pre>
      </div>
    </div>
  ` : '';
  const manageableRoles = getManageableLoginRoles();
  const getLoginManagerSortWeight = (user) => {
    const level = LOGIN_ROLE_DEFINITIONS[user?.role]?.level || '';
    if (['super-global', 'global', 'faction-admin', 'admin'].includes(level)) return 0;
    if (level === 'member') return 1;
    return 2;
  };
  const sortLoginManagerUsers = (users) => [...users].sort((left, right) => {
    const weightDiff = getLoginManagerSortWeight(left) - getLoginManagerSortWeight(right);
    if (weightDiff !== 0) return weightDiff;
    return String(left?.username || '').localeCompare(String(right?.username || ''), 'de', { sensitivity: 'base' });
  });
  const renderUserRows = (users) => users.length ? users.map((user) => {
    const userDraft = getLoginManagerEditDraft(user);
    const selectedRole = LOGIN_ROLES.includes(userDraft?.role) ? userDraft.role : user.role;
    const userDefinition = LOGIN_ROLE_DEFINITIONS[selectedRole];
    const userFaction = LOGIN_FACTIONS.find((faction) => faction.id === userDefinition?.faction);
    const categoryRoles = userFaction
      ? [userFaction.adminRole, userFaction.memberRole]
      : ['Superadministrator', 'Admin', 'Viewer'];
    const roleOptions = isGlobalManager
      ? categoryRoles.filter((candidateRole) => manageableRoles.includes(candidateRole) || candidateRole === selectedRole)
      : (user.isDraft || manageableRoles.includes(selectedRole) ? manageableRoles : [selectedRole]);
    const editable = user.isDraft || actorDefinition.level === 'super-global' || manageableRoles.includes(selectedRole);
    const extraField = userDefinition?.faction === 'navy'
      ? `<label class="layer-row" style="border:0;padding:0"><input id="authFleetCoord_${user.id}" type="checkbox" ${userDraft?.canCoordinate4thFleet ? 'checked' : ''} ${editable ? `onchange="setLoginManagerUserExtraPreview('${user.id}','canCoordinate4thFleet', this.checked)"` : 'disabled'}> 4th Flottenkoordination</label>`
      : userDefinition?.faction === 'senate'
        ? `<select id="authSenatePosition_${user.id}" ${editable ? `onchange="setLoginManagerUserExtraPreview('${user.id}','senatePosition', this.value)"` : 'disabled'}>
            <option value="">Keine Senatsfunktion</option>
            ${SENATE_POSITIONS.map((position) => `<option value="${position}" ${userDraft?.senatePosition === position ? 'selected' : ''}>${position}</option>`).join('')}
          </select>`
        : '<span class="muted">Keine Zusatzfunktion</span>';
    return `
      <div class="login-manager-grid login-manager-row">
        <div class="login-manager-user">
          <strong>${escapeLoginManagerText(user.username)}</strong>
          ${user.mustChangePassword ? '<span class="login-badge-pending">Passwortwechsel offen</span>' : `<small>${escapeLoginManagerText(LOGIN_ROLE_DEFINITIONS[selectedRole]?.label || selectedRole)}</small>`}
        </div>
        <div>
          <select id="authRole_${user.id}" ${editable ? `onchange="setLoginManagerUserRolePreview('${user.id}', this.value)"` : 'disabled'}>
            ${roleOptions.map((role) => `<option value="${role}" ${selectedRole === role ? 'selected' : ''}>${LOGIN_ROLE_DEFINITIONS[role]?.label || role}</option>`).join('')}
          </select>
        </div>
        <div class="login-manager-extra">${extraField}</div>
        <div class="login-manager-actions">
          ${editable ? `
            <button type="button" class="mini-btn primary" onclick="saveLoginManagerUser('${user.id}')">Speichern</button>
            <button type="button" class="mini-btn danger" onclick="deleteLoginManagerUser('${user.id}')">Löschen</button>
          ` : '<span class="muted">Geschützt</span>'}
        </div>
      </div>
    `;
  }).join('') : '<div class="muted-box">Noch keine Logins in dieser Kategorie.</div>';
  const renderFactionSection = (faction) => {
    const users = sortLoginManagerUsers(state.authUsers.filter((user) => LOGIN_ROLE_DEFINITIONS[user.role]?.faction === faction.id));
    const factionAdmins = users.filter((user) => user.role === faction.adminRole && !user.isDraft);
    const createRole = manageableRoles.includes(faction.memberRole) ? faction.memberRole : manageableRoles[0];
    return `
      <div class="workspace-card">
        <div class="login-faction-head">
          <div>
            <h3>${faction.label}</h3>
            <p class="login-main-admin">Fraktions-Admins: ${factionAdmins.length ? factionAdmins.map((user) => escapeLoginManagerText(user.username)).join(', ') : 'Noch nicht vergeben'}</p>
          </div>
          ${createRole ? `<button type="button" class="mini-btn primary" onclick="createLoginManagerUser('${createRole}')">Login anlegen</button>` : ''}
        </div>
        <div class="login-manager-grid login-manager-head">
          <div>Benutzername</div>
          <div>Rolle</div>
          <div>Zusatzfunktion</div>
          <div>Aktionen</div>
        </div>
        ${renderUserRows(users)}
      </div>
    `;
  };
  const systemUsers = sortLoginManagerUsers(state.authUsers.filter((user) => LOGIN_ROLE_DEFINITIONS[user.role]?.faction === 'system'));
  workspacePanel.innerHTML = `
    <div class="workspace-head">
      <div>
        <h2>Login Manager</h2>
        <p>Logins sind nach Fraktionen geordnet. Fraktions-Admins verwalten die Admins und Mitglieder ihrer eigenen Fraktion.</p>
      </div>
    </div>
    ${loginManagerUsersState.loading ? '<div class="workspace-section"><div class="muted-box">Logins werden geladen...</div></div>' : ''}
    ${serverReloadPanel}
    <div class="workspace-section login-faction-grid">
      ${visibleFactions.map(renderFactionSection).join('')}
      ${isGlobalManager ? `
      <div class="workspace-card">
        <div class="login-faction-head">
          <div><h3>System / Global</h3><p>Superadministratoren, globale Admins und reine Viewer.</p></div>
          <button type="button" class="mini-btn primary" onclick="createLoginManagerUser('Viewer')">Login anlegen</button>
        </div>
        <div class="login-manager-grid login-manager-head">
          <div>Benutzername</div>
          <div>Rolle</div>
          <div>Zusatzfunktion</div>
          <div>Aktionen</div>
        </div>
        ${renderUserRows(systemUsers)}
      </div>
      ` : ''}
    </div>
  `;
}

function getFilteredAdminAuditEntries() {
  const normalizeAuditSearch = (value) => String(value || '').trim().toLowerCase();
  return auditLogAdminState.entries.filter((entry) => {
    const actorUsername = String(entry.actorUsername || 'System').trim() || 'System';
    const action = getAdminAuditActionLabel(entry);
    const entityType = getAdminAuditCategory(entry);
    if (auditLogAdminState.actorFilter && !normalizeAuditSearch(actorUsername).includes(normalizeAuditSearch(auditLogAdminState.actorFilter))) return false;
    if (auditLogAdminState.actionFilter !== 'all' && action !== auditLogAdminState.actionFilter) return false;
    if (auditLogAdminState.entityFilter !== 'all' && entityType !== auditLogAdminState.entityFilter) return false;
    const query = normalizeAuditSearch(auditLogAdminState.query);
    if (!query) return true;
    const haystack = normalizeAuditSearch([
      actorUsername,
      entry.actorRole || '',
      action,
      entityType,
      entry.entityId || '',
      JSON.stringify(entry.payload || {})
    ].join(' '));
    return haystack.includes(query);
  });
}

function getAdminAuditCategory(entry) {
  const action = String(entry?.action || '').trim();
  if (action.startsWith('login_manager.')) return 'Accountverwaltung';
  if (action.startsWith('auth.')) return 'Authentifizierung';
  if (action.startsWith('fleet.')) return 'Flottenmanagement';
  if (action.startsWith('ship.')) return 'Schiffbau';
  if (action.startsWith('build_job.')) return 'Bauprojekte';
  if (action.startsWith('admin.server_reload')) return 'Serververwaltung';
  if (action.startsWith('campaign.state.')) return 'Kampagnenstatus';
  return 'Sonstiges';
}

function getAdminAuditActionLabel(entry) {
  const action = String(entry?.action || '').trim();
  const labels = {
    'login_manager.user_created': 'Account angelegt',
    'login_manager.user_updated': 'Account verändert',
    'login_manager.user_deleted': 'Account gelöscht',
    'auth.login': 'Login',
    'auth.logout': 'Logout',
    'auth.password_changed': 'Passwort geändert',
    'fleet.created': 'Flotte angelegt',
    'fleet.updated': 'Flotte verändert',
    'fleet.deleted': 'Flotte gelöscht',
    'fleet.jump.started': 'Flottensprung gestartet',
    'fleet.moved': 'Flotte bewegt',
    'ship.created': 'Schiff angelegt',
    'ship.updated': 'Schiff verändert',
    'ship.deleted': 'Schiff gelöscht',
    'build_job.created': 'Bauprojekt angelegt',
    'build_job.updated': 'Bauprojekt verändert',
    'build_job.deleted': 'Bauprojekt gelöscht',
    'campaign.state.updated': 'Kampagnenstatus verändert',
    'admin.server_reload': 'Server-Reload'
  };
  return labels[action] || action || 'Systemaktion';
}

function applyAdminAuditLogFilters() {
  auditLogAdminState.query = workspacePanel.querySelector('#adminAuditLogSearch')?.value || auditLogAdminState.query || '';
  auditLogAdminState.actorFilter = workspacePanel.querySelector('#adminAuditLogActorFilter')?.value || '';
  auditLogAdminState.actionFilter = workspacePanel.querySelector('#adminAuditLogActionFilter')?.value || 'all';
  auditLogAdminState.entityFilter = workspacePanel.querySelector('#adminAuditLogEntityFilter')?.value || 'all';
  renderAdminAuditLogView();
}

function renderAdminAuditLogView() {
  if (!canViewAuditLogs()) {
    setMainTab('map');
    return;
  }
  const actorOptions = [...new Set(auditLogAdminState.entries.map((entry) => String(entry.actorUsername || 'System').trim() || 'System'))]
    .sort((left, right) => left.localeCompare(right, 'de', { sensitivity: 'base' }));
  const actionOptions = [...new Set(auditLogAdminState.entries.map((entry) => getAdminAuditActionLabel(entry)))]
    .sort((left, right) => left.localeCompare(right, 'de', { sensitivity: 'base' }));
  const entityOptions = [...new Set(auditLogAdminState.entries.map((entry) => getAdminAuditCategory(entry)))]
    .sort((left, right) => left.localeCompare(right, 'de', { sensitivity: 'base' }));
  const filteredEntries = getFilteredAdminAuditEntries();
  workspacePanel.innerHTML = `
    <div class="workspace-head">
      <div>
        <h2>System-Logs</h2>
        <p>Zentrale Übersicht für Login Manager, Flottenmanagement, Schiffbau, Bauprojekte und weitere Admin-Aktionen.</p>
      </div>
      <div class="toolbar-row">
        <button type="button" class="mini-btn" id="refreshAdminAuditLogBtn" ${auditLogAdminState.loading ? 'disabled' : ''}>Aktualisieren</button>
      </div>
    </div>
    <div class="workspace-section">
      <div class="toolbar-row">
        <input id="adminAuditLogSearch" type="search" placeholder="Logs durchsuchen..." value="${escapeLoginManagerText(auditLogAdminState.query || '')}" autocomplete="off">
        <input id="adminAuditLogActorFilter" type="search" list="adminAuditActorOptions" placeholder="Person suchen..." value="${escapeLoginManagerText(auditLogAdminState.actorFilter || '')}" autocomplete="off">
        <datalist id="adminAuditActorOptions">
          ${actorOptions.map((actor) => `<option value="${escapeLoginManagerText(actor)}"></option>`).join('')}
        </datalist>
        <select id="adminAuditLogActionFilter">
          <option value="all">Alle Aktionen</option>
          ${actionOptions.map((action) => `<option value="${escapeLoginManagerText(action)}" ${auditLogAdminState.actionFilter === action ? 'selected' : ''}>${escapeLoginManagerText(action)}</option>`).join('')}
        </select>
        <select id="adminAuditLogEntityFilter">
          <option value="all">Alle Bereiche</option>
          ${entityOptions.map((entity) => `<option value="${escapeLoginManagerText(entity)}" ${auditLogAdminState.entityFilter === entity ? 'selected' : ''}>${escapeLoginManagerText(entity)}</option>`).join('')}
        </select>
        <button type="button" class="mini-btn primary" id="applyAdminAuditLogFiltersBtn">Filter anwenden</button>
      </div>
      <div class="muted" style="margin-top:10px">${filteredEntries.length} von ${auditLogAdminState.entries.length} Logs sichtbar.</div>
    </div>
    <div class="workspace-section">
      ${auditLogAdminState.loading ? '<div class="muted-box">Logs werden geladen...</div>' : (
        filteredEntries.length
          ? filteredEntries.map((entry) => `
            <div class="workspace-card compact">
              <div class="workspace-head compact" style="margin-bottom:10px">
                <div>
                  <h3>${escapeLoginManagerText(getAdminAuditActionLabel(entry))}</h3>
                  <p>${escapeLoginManagerText(entry.actorUsername || 'System')} • ${escapeLoginManagerText(entry.actorRole || 'Unbekannt')} • ${new Date(entry.createdAt || Date.now()).toLocaleString('de-DE')}</p>
                </div>
                <div class="muted">${escapeLoginManagerText(getAdminAuditCategory(entry))} • ${escapeLoginManagerText(entry.entityId || '—')}</div>
              </div>
              <pre class="server-reload-console" style="min-height:0;max-height:220px;margin-top:0">${escapeLoginManagerText(JSON.stringify(entry.payload || {}, null, 2))}</pre>
            </div>
          `).join('')
          : '<div class="muted-box">Noch keine Logs vorhanden.</div>'
      )}
    </div>
  `;
  workspacePanel.querySelector('#refreshAdminAuditLogBtn')?.addEventListener('click', () => {
    auditLogAdminState.loading = true;
    renderAdminAuditLogView();
    void fetchAuditLog();
  });
  workspacePanel.querySelector('#applyAdminAuditLogFiltersBtn')?.addEventListener('click', () => {
    applyAdminAuditLogFilters();
  });
  workspacePanel.querySelector('#adminAuditLogSearch')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyAdminAuditLogFilters();
    }
  });
  workspacePanel.querySelector('#adminAuditLogActorFilter')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyAdminAuditLogFilters();
    }
  });
  workspacePanel.querySelector('#adminAuditLogActorFilter')?.addEventListener('change', () => {
    applyAdminAuditLogFilters();
  });
  workspacePanel.querySelector('#adminAuditLogActionFilter')?.addEventListener('change', (event) => {
    auditLogAdminState.actionFilter = event.target.value || 'all';
    renderAdminAuditLogView();
  });
  workspacePanel.querySelector('#adminAuditLogEntityFilter')?.addEventListener('change', (event) => {
    auditLogAdminState.entityFilter = event.target.value || 'all';
    renderAdminAuditLogView();
  });
}

function escapeRadioCommandText(value) {
  return escapeLoginManagerText(value);
}

async function fetchRadioCommandCenterData() {
  if (!canManageRadioCommands()) return;
  radioCommandAdminState.loading = true;
  renderRadioCommandCenterView();
  try {
    const response = await fetch('/api/admin/radio-command-center', {
      credentials: 'include'
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Befehlsberechtigungen konnten nicht geladen werden.');
    radioCommandAdminState = {
      permissions: payload.permissions || [],
      audit: payload.audit || [],
      users: payload.users || [],
      fleets: payload.fleets || [],
      radioConfig: payload.radioConfig || null,
      loading: false
    };
    if (activeMainTab === 'radioCommandCenter') renderRadioCommandCenterView();
  } catch (error) {
    radioCommandAdminState.loading = false;
    setStatus(`Befehlsberechtigungen laden fehlgeschlagen: ${error.message}`);
    if (activeMainTab === 'radioCommandCenter') renderRadioCommandCenterView();
  }
}

function createRadioPermissionDraft() {
  if (!canManageRadioCommands()) return;
  radioCommandAdminState.permissions.unshift({
    id: `radio_perm_${Math.random().toString(36).slice(2, 10)}`,
    ingameName: '',
    linkedUserId: '',
    linkedUsername: '',
    permissionRole: 'fleet_officer',
    fleets: [],
    isDraft: true
  });
  radioCommandAdminState.fleetSearch = { ...(radioCommandAdminState.fleetSearch || {}), [radioCommandAdminState.permissions[0].id]: '' };
  renderRadioCommandCenterView();
}

function getDerivedRadioPermissionRole(permission) {
  return ['Superadministrator', 'Admin', 'Republic Navy Admin'].includes(permission?.linkedUserRole)
    ? 'admiralty'
    : 'fleet_officer';
}

function setRadioPermissionFleetSearch(permissionId, value) {
  radioCommandAdminState.fleetSearch = {
    ...(radioCommandAdminState.fleetSearch || {}),
    [permissionId]: String(value || '')
  };
  renderRadioCommandCenterView();
}

function addRadioPermissionFleet(permissionId, fleetId) {
  const permission = radioCommandAdminState.permissions.find((entry) => entry.id === permissionId);
  const fleet = radioCommandAdminState.fleets.find((entry) => entry.id === fleetId);
  if (!permission || !fleet) return;
  const existing = Array.isArray(permission.fleets) ? permission.fleets : [];
  if (existing.some((entry) => entry.fleetId === fleetId)) return;
  permission.fleets = [...existing, { fleetId: fleet.id, fleetName: fleet.name }];
  radioCommandAdminState.fleetSearch = {
    ...(radioCommandAdminState.fleetSearch || {}),
    [permissionId]: ''
  };
  renderRadioCommandCenterView();
}

function removeRadioPermissionFleet(permissionId, fleetId) {
  const permission = radioCommandAdminState.permissions.find((entry) => entry.id === permissionId);
  if (!permission) return;
  permission.fleets = (Array.isArray(permission.fleets) ? permission.fleets : []).filter((entry) => entry.fleetId !== fleetId);
  renderRadioCommandCenterView();
}

async function saveRadioPermission(id) {
  if (!canManageRadioCommands()) return;
  const permission = radioCommandAdminState.permissions.find((entry) => entry.id === id);
  if (!permission) return;
  const ingameName = document.getElementById(`radioIngame_${id}`)?.value.trim() || '';
  const linkedUserId = document.getElementById(`radioLinkedUser_${id}`)?.value || '';
  const fleets = Array.isArray(permission.fleets) ? permission.fleets : [];
  try {
    const response = await fetch(permission.isDraft ? '/api/admin/radio-command-permissions' : `/api/admin/radio-command-permissions/${id}`, {
      method: permission.isDraft ? 'POST' : 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingameName,
        linkedUserId,
        fleets
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Befehlsberechtigung konnte nicht gespeichert werden.');
    radioCommandAdminState = {
      permissions: payload.permissions || [],
      audit: payload.audit || [],
      users: payload.users || [],
      fleets: payload.fleets || [],
      radioConfig: payload.radioConfig || null,
      loading: false
    };
    renderRadioCommandCenterView();
    setStatus(`Befehlsberechtigung gespeichert: ${ingameName}`);
  } catch (error) {
    setStatus(`Befehlsberechtigung speichern fehlgeschlagen: ${error.message}`);
  }
}

async function deleteRadioPermission(id) {
  if (!canManageRadioCommands()) return;
  const permission = radioCommandAdminState.permissions.find((entry) => entry.id === id);
  if (permission?.isDraft) {
    radioCommandAdminState.permissions = radioCommandAdminState.permissions.filter((entry) => entry.id !== id);
    renderRadioCommandCenterView();
    setStatus('Entwurf entfernt.');
    return;
  }
  try {
    const response = await fetch(`/api/admin/radio-command-permissions/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Befehlsberechtigung konnte nicht gelöscht werden.');
    radioCommandAdminState = {
      permissions: payload.permissions || [],
      audit: payload.audit || [],
      users: payload.users || [],
      fleets: payload.fleets || [],
      radioConfig: payload.radioConfig || null,
      loading: false
    };
    renderRadioCommandCenterView();
    setStatus(permission ? `Berechtigung gelöscht: ${permission.ingameName}` : 'Berechtigung gelöscht.');
  } catch (error) {
    setStatus(`Befehlsberechtigung löschen fehlgeschlagen: ${error.message}`);
  }
}

async function pollDiscordRadioCommands() {
  if (!canManageRadioCommands()) return;
  try {
    const response = await fetch('/api/admin/radio-command-center/poll', {
      method: 'POST',
      credentials: 'include'
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Discord-Funk konnte nicht ausgewertet werden.');
    radioCommandAdminState = {
      permissions: payload.permissions || [],
      audit: payload.audit || [],
      users: payload.users || [],
      fleets: payload.fleets || [],
      radioConfig: payload.radioConfig || null,
      loading: false
    };
    renderRadioCommandCenterView();
    const fetched = payload.result?.fetched || 0;
    const relevant = payload.result?.relevant || 0;
    const processed = payload.result?.processed || 0;
    const accepted = payload.result?.accepted || 0;
    const rejected = payload.result?.rejected || 0;
    const firstDebug = Array.isArray(payload.result?.debug) ? payload.result.debug.find(Boolean) : null;
    const debugSuffix = firstDebug?.reason ? ` Letzter Grund: ${firstDebug.reason}.` : '';
    const channelInfo = payload.radioConfig?.channelId ? ` Aktiver Channel: ${payload.radioConfig.channelId}.` : '';
    const parserActorInfo = firstDebug?.parserActorName ? ` Parser-Actor: ${firstDebug.parserActorName}.` : '';
    const recoveredActorInfo = firstDebug?.recoveredActorName ? ` Fallback-Actor: ${firstDebug.recoveredActorName}.` : '';
    const authorInfo = firstDebug?.authorFallbackNames?.length ? ` Discord-Autor: ${firstDebug.authorFallbackNames.join(' / ')}.` : '';
    const contentInfo = firstDebug?.contentPreview ? ` Text: ${firstDebug.contentPreview}.` : '';
    const rawContentInfo = typeof firstDebug?.rawContentLength === 'number' ? ` RawContent: ${firstDebug.rawContentLength} Zeichen.` : '';
    const mergedContentInfo = typeof firstDebug?.contentLength === 'number' ? ` Gesamttext: ${firstDebug.contentLength} Zeichen in ${firstDebug.lineCount || 0} Zeilen.` : '';
    const embedInfo = Array.isArray(firstDebug?.embedSummaries) && firstDebug.embedSummaries.length
      ? ` Embeds: ${firstDebug.embedSummaries.map((embed) => `#${embed.index}(${embed.fieldCount} Felder)`).join(', ')}.`
      : '';
    const rawPreviewInfo = firstDebug?.rawContentPreview ? ` Raw-Preview: ${firstDebug.rawContentPreview}.` : '';
    setStatus(`Discord-Funk ausgewertet: ${fetched} geladen, ${relevant} erkannt, ${processed} verarbeitet, ${accepted} akzeptiert, ${rejected} abgelehnt.${channelInfo}${debugSuffix}${parserActorInfo}${recoveredActorInfo}${authorInfo}${contentInfo}${rawContentInfo}${mergedContentInfo}${embedInfo}${rawPreviewInfo}`);
  } catch (error) {
    setStatus(`Discord-Funk Poll fehlgeschlagen: ${error.message}`);
  }
}

function renderRadioCommandCenterView() {
  if (!canManageRadioCommands()) {
    setMainTab('map');
    return;
  }
  const users = radioCommandAdminState.users || [];
  const fleets = radioCommandAdminState.fleets || [];
  const permissions = radioCommandAdminState.permissions || [];
  const audit = radioCommandAdminState.audit || [];
  const fleetSearch = radioCommandAdminState.fleetSearch || {};
  const userById = new Map(users.map((user) => [user.id, user]));
  const permissionRows = permissions.length ? permissions.map((permission) => {
    const linkedUser = userById.get(permission.linkedUserId) || null;
    permission.linkedUserRole = linkedUser?.role || '';
    permission.permissionRole = getDerivedRadioPermissionRole(permission);
    const selectedFleetIds = new Set((permission.fleets || []).map((fleet) => fleet.fleetId));
    const selectedFleets = fleets.filter((fleet) => selectedFleetIds.has(fleet.id));
    const searchValue = String(fleetSearch[permission.id] || '');
    const normalizedSearch = searchValue.trim().toLowerCase();
    const filteredFleets = fleets.filter((fleet) => !selectedFleetIds.has(fleet.id) && (!normalizedSearch || fleet.name.toLowerCase().includes(normalizedSearch))).slice(0, 8);
    return `
      <tr>
        <td><input id="radioIngame_${permission.id}" value="${escapeRadioCommandText(permission.ingameName || '')}" placeholder="z.B. Kendal Ozzel"></td>
        <td>
          <select id="radioLinkedUser_${permission.id}">
            <option value="">Nicht verknüpft</option>
            ${users.map((user) => `<option value="${user.id}" ${permission.linkedUserId === user.id ? 'selected' : ''}>${escapeRadioCommandText(user.username)} (${escapeRadioCommandText(user.role)})</option>`).join('')}
          </select>
        </td>
        <td>
          <span class="radio-role-badge">${permission.permissionRole === 'admiralty' ? 'Automatisch: Admiralität' : 'Automatisch: Flottenoffizier'}</span>
        </td>
        <td>
          <div class="radio-permission-stack">
            <div class="radio-selected-fleets">
              ${selectedFleets.length
                ? selectedFleets.map((fleet) => `<span class="radio-selected-fleet">${escapeRadioCommandText(fleet.name)}<button type="button" onclick="removeRadioPermissionFleet('${permission.id}','${fleet.id}')">×</button></span>`).join('')
                : `<span class="radio-fleet-search-empty">${permission.permissionRole === 'admiralty' ? 'Admiralität darf alle GAR-Verbände bewegen.' : 'Noch keine Verbände zugewiesen.'}</span>`}
            </div>
            ${permission.permissionRole === 'admiralty' ? '' : `
              <input value="${escapeRadioCommandText(searchValue)}" placeholder="Verband suchen..." oninput="setRadioPermissionFleetSearch('${permission.id}', this.value)">
              <div class="radio-fleet-search-results">
                ${filteredFleets.length
                  ? filteredFleets.map((fleet) => `<button type="button" class="mini-btn" onclick="addRadioPermissionFleet('${permission.id}','${fleet.id}')">${escapeRadioCommandText(fleet.name)}</button>`).join('')
                  : `<span class="radio-fleet-search-empty">${normalizedSearch ? 'Keine passenden Verbände gefunden.' : 'Tippe zum Suchen eines Verbandes.'}</span>`}
              </div>
            `}
          </div>
        </td>
        <td class="actions">
          <button class="mini-btn primary" onclick="saveRadioPermission('${permission.id}')">Speichern</button>
          <button class="mini-btn danger" onclick="deleteRadioPermission('${permission.id}')">Löschen</button>
        </td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="5"><div class="muted-box">Noch keine Befehlsberechtigungen angelegt.</div></td></tr>';
  const auditRows = audit.length ? audit.map((entry) => `
    <tr>
      <td>${entry.createdAt ? new Date(entry.createdAt).toLocaleString('de-DE') : '—'}</td>
      <td>${escapeRadioCommandText(entry.actorIngameName || '—')}</td>
      <td>${escapeRadioCommandText(entry.targetFleetName || '—')}</td>
      <td>${escapeRadioCommandText(entry.targetPlanetName || '—')}</td>
      <td>${escapeRadioCommandText(entry.commandType || '—')}</td>
      <td>${escapeRadioCommandText(entry.status || '—')}</td>
      <td>${escapeRadioCommandText(entry.reason || '—')}</td>
    </tr>
  `).join('') : '<tr><td colspan="7"><div class="muted-box">Noch keine automatisch erkannten Funkbefehle.</div></td></tr>';
  workspacePanel.innerHTML = `
    <div class="workspace-head">
      <div>
        <h2>Befehlsberechtigungen</h2>
        <p>Verknüpfe Ingame-Namen mit Website-Logins, weise bewegliche GAR-Verbände zu und prüfe das Audit-Log der automatisch erkannten Langstreckenfunk-Befehle.</p>
      </div>
      <div class="toolbar-row end">
        <button class="mini-btn" onclick="fetchRadioCommandCenterData()">Aktualisieren</button>
        <button class="mini-btn" onclick="pollDiscordRadioCommands()">Discord jetzt prüfen</button>
        <button class="mini-btn primary" onclick="createRadioPermissionDraft()">Eintrag anlegen</button>
      </div>
    </div>
    <div class="workspace-section">
      <div class="workspace-card">
        <h3>Berechtigungen</h3>
        <p class="muted">${radioCommandAdminState.loading ? 'Lade Daten...' : 'Der FunkRelay-Webhook spiegelt nur Nachrichten. Berechtigungen werden über Ingame-Name + Website-Login geprüft. Republic Navy Admin und Admin werden automatisch als Admiralität behandelt, alle anderen als Flottenoffizier mit zugewiesenen GAR-Verbänden.'}</p>
        <table class="data-table">
          <thead><tr><th>Ingame-Name</th><th>Website-Login</th><th>Rolle</th><th>Verknüpfte Verbände</th><th>Aktionen</th></tr></thead>
          <tbody>${permissionRows}</tbody>
        </table>
      </div>
      <div class="workspace-card">
        <h3>Funk-Audit</h3>
        <table class="data-table">
          <thead><tr><th>Zeit</th><th>Befehlgeber</th><th>Verband</th><th>Zielplanet</th><th>Befehl</th><th>Status</th><th>Grund</th></tr></thead>
          <tbody>${auditRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

