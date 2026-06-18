// Generated from app-shell.js: login manager and radio command center views

function renderFleetManagementView() {
  runCampaignMaintenance();
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
  const visibleFleets = state.fleets.filter((fleet) => visibleFactions.has(fleet.faction));
  const visibleCategories = ensureFleetCategoriesStore()
    .filter((category) => visibleFactions.has(category.faction))
    .sort((a, b) => {
      if (a.faction !== b.faction) return a.faction.localeCompare(b.faction, 'de');
      return a.name.localeCompare(b.name, 'de');
    });
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
    if (manifestFleet) return ship.assignedFleetId === manifestFleet.id;
    return true;
  }).filter((ship) => {
    if (!normalizedManifestQuery) return true;
    const classLabel = getShipClassMeta(ship.classId)?.displayName || ship.classId || '';
    const fleetName = state.fleets.find((fleet) => fleet.id === ship.assignedFleetId)?.name || '';
    const location = getShipDisplayLocation(ship);
    const haystack = normalizeSearchText([ship.name, classLabel, ship.commander, fleetName, location, ship.status].join(' '));
    return haystack.includes(normalizedManifestQuery);
  });
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
        <button class="mini-btn primary" onclick="createFleetManagementFleet()">Neuen Verband anlegen</button>
        ${role !== 'Viewer' && !isUnderworldRole(role) ? '<button class="mini-btn" onclick="createFleetManagementCategory()">Neue Kategorie</button>' : ''}
        ${role === 'Admin' ? '<button class="mini-btn" onclick="triggerTrelloImport()">Trello JSON importieren</button>' : ''}
      </div>
    </div>
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
        <h4>Ohne Kategorie</h4>
        <div class="fleet-card-list">
          ${ungroupedFleets.length ? ungroupedFleets.map((fleet) => renderFleetManagementFleetCard(fleet, `ungrouped:${fleet.faction}`)).join('') : '<div class="fleet-category-empty">Keine ungruppierten Verbände sichtbar.</div>'}
        </div>
      </div>
      <div class="fleet-category-list">
        ${visibleCategories.map((category) => {
          const categoryFleets = groupedFleetMap.get(category.id) || [];
          const collapsed = fleetCategoryCollapsedIds.has(category.id);
          const categoryEditable = canEditFaction(category.faction);
          const categoryDragAttrs = categoryEditable
            ? `draggable="true" ondragstart="startFleetCategoryDrag('${category.id}', event)" ondragend="endFleetCategoryDrag(event)"`
            : 'draggable="false"';
          return `
            <div class="fleet-category-card" data-focus-key="fleet-category:${category.id}" ${categoryDragAttrs} ondragover="allowFleetCategoryDrop(event); allowFleetCategoryReorder(event)" ondragleave="clearFleetCategoryDrop(event); clearFleetCategoryReorder(event)" ondrop="handleFleetCategoryDrop('${category.id}', event); handleFleetCategoryReorderDrop('${category.id}', event)">
              ${categoryEditable ? '<div class="card-drag-handle" title="Kategorie ziehen">::</div>' : ''}
              <div class="fleet-category-head">
                <div>
                  <h4>${category.name}</h4>
                  <p><span class="badge ${category.faction}">${category.faction}</span> • ${categoryFleets.length} Verband/Verbände</p>
                </div>
                <div class="fleet-category-actions">
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
                <div class="fleet-card-list">
                  ${categoryFleets.length ? categoryFleets.map((fleet) => renderFleetManagementFleetCard(fleet, `category:${category.id}`)).join('') : '<div class="fleet-category-empty">Noch keine Verbände in dieser Kategorie.</div>'}
                </div>
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
                const canAssignStationPlanet = station && isAdminRole();
                const stationPlanet = ship.locationPlanetId ? planetIndex.get(ship.locationPlanetId) : null;
                const positionCell = canAssignStationPlanet
                  ? `<input id="shipPlanet_${ship.id}" value="${stationPlanet?.name || ''}" placeholder="z.B. Corellia">`
                  : getShipDisplayLocation(ship);
                const fleetCell = station
                  ? `<div class="muted-box">Planetgebunden</div>`
                  : `<select id="shipFleet_${ship.id}">
                      <option value="">Nicht zugeteilt</option>
                      ${visibleFleets.filter((fleet) => fleet.faction === ship.faction).map((fleet) => `<option value="${fleet.id}" ${ship.assignedFleetId === fleet.id ? 'selected' : ''}>${fleet.name}</option>`).join('')}
                    </select>`;
                const actions = `
                  <button class="mini-btn primary" onclick="saveManagedShip('${ship.id}')">Speichern</button>
                  ${station ? '' : `<button class="mini-btn" onclick="removeManagedShipFromFleet('${ship.id}')">Lösen</button>`}
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
  renderFleetManagementView();
}

function createLoginManagerUser(role = '') {
  if (!canManageLogins()) return;
  const manageableRoles = getManageableLoginRoles();
  const selectedRole = manageableRoles.includes(role) ? role : (manageableRoles[0] || 'Viewer');
  state.authUsers.push({
    id: `auth_${Math.random().toString(36).slice(2, 10)}`,
    username: '',
    password: '',
    role: selectedRole,
    canCoordinate4thFleet: false,
    senatePosition: '',
    isDraft: true
  });
  renderLoginManagerView();
}

async function saveLoginManagerUser(id) {
  if (!canManageLogins()) return;
  const user = state.authUsers.find((entry) => entry.id === id);
  if (!user) return;
  const username = document.getElementById(`authUser_${id}`)?.value.trim() || '';
  const password = document.getElementById(`authPass_${id}`)?.value || '';
  const role = document.getElementById(`authRole_${id}`)?.value || 'Viewer';
  const roleDefinition = LOGIN_ROLE_DEFINITIONS[role];
  const canCoordinate4thFleetValue = roleDefinition?.faction === 'navy'
    && Boolean(document.getElementById(`authFleetCoord_${id}`)?.checked);
  const senatePosition = roleDefinition?.faction === 'senate'
    ? (document.getElementById(`authSenatePosition_${id}`)?.value || '')
    : '';
  if (!username || !password) {
    setStatus('Login-Name und Passwort dürfen nicht leer sein.');
    return;
  }
  const duplicate = state.authUsers.find((entry) => entry.id !== id && entry.username.trim().toLowerCase() === username.toLowerCase());
  if (duplicate) {
    setStatus('Dieser Login-Name existiert bereits.');
    return;
  }
  try {
    const response = await fetch(user.isDraft ? '/api/admin/users' : `/api/admin/users/${id}`, {
      method: user.isDraft ? 'POST' : 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        role: LOGIN_ROLES.includes(role) ? role : 'Viewer',
        canCoordinate4thFleet: canCoordinate4thFleetValue,
        senatePosition
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Login konnte nicht gespeichert werden.');
    state.authUsers = payload.users || [];
    renderLoginManagerView();
    setStatus(`Login gespeichert: ${username}`);
  } catch (error) {
    setStatus(`Login speichern fehlgeschlagen: ${error.message}`);
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
    renderLoginManagerView();
    setStatus(user ? `Login gelöscht: ${user.username}` : 'Login gelöscht.');
  } catch (error) {
    setStatus(`Login löschen fehlgeschlagen: ${error.message}`);
  }
}

function renderLoginManagerView() {
  if (!canManageLogins()) {
    setMainTab('map');
    return;
  }
  const actorDefinition = LOGIN_ROLE_DEFINITIONS[currentAssignedRole()];
  const visibleFactions = actorDefinition.level === 'global'
    ? LOGIN_FACTIONS
    : LOGIN_FACTIONS.filter((faction) => faction.id === actorDefinition.faction);
  const manageableRoles = getManageableLoginRoles();
  const renderUserRows = (users) => users.length ? users.map((user) => {
    const userDefinition = LOGIN_ROLE_DEFINITIONS[user.role];
    const userFaction = LOGIN_FACTIONS.find((faction) => faction.id === userDefinition?.faction);
    const categoryRoles = userFaction
      ? [userFaction.adminRole, userFaction.memberRole]
      : ['Admin', 'Viewer'];
    const roleOptions = actorDefinition.level === 'global'
      ? categoryRoles
      : (user.isDraft || manageableRoles.includes(user.role) ? manageableRoles : [user.role]);
    const editable = user.isDraft || manageableRoles.includes(user.role);
    const extraField = userDefinition?.faction === 'navy'
      ? `<label class="layer-row" style="border:0;padding:0"><input id="authFleetCoord_${user.id}" type="checkbox" ${user.canCoordinate4thFleet ? 'checked' : ''} ${editable ? '' : 'disabled'}> 4th Flottenkoordination</label>`
      : userDefinition?.faction === 'senate'
        ? `<select id="authSenatePosition_${user.id}" ${editable ? '' : 'disabled'}>
            <option value="">Keine Senatsfunktion</option>
            ${SENATE_POSITIONS.map((position) => `<option value="${position}" ${user.senatePosition === position ? 'selected' : ''}>${position}</option>`).join('')}
          </select>`
        : '<span class="muted">—</span>';
    return `
      <tr>
        <td><input id="authUser_${user.id}" value="${escapeLoginManagerText(user.username)}" placeholder="z.B. benutzer" ${editable ? '' : 'disabled'}></td>
        <td><input id="authPass_${user.id}" type="text" value="${user.password || ''}" placeholder="${editable ? 'Neues Passwort' : 'Nicht bearbeitbar'}" ${editable ? '' : 'disabled'}></td>
        <td>
          <select id="authRole_${user.id}" ${editable ? '' : 'disabled'}>
            ${roleOptions.map((role) => `<option value="${role}" ${user.role === role ? 'selected' : ''}>${LOGIN_ROLE_DEFINITIONS[role]?.label || role}</option>`).join('')}
          </select>
        </td>
        <td>${extraField}</td>
        <td class="actions">
          ${editable ? `
            <button class="mini-btn primary" onclick="saveLoginManagerUser('${user.id}')">Speichern</button>
            <button class="mini-btn danger" onclick="deleteLoginManagerUser('${user.id}')">Löschen</button>
          ` : '<span class="muted">Geschützt</span>'}
        </td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="5"><div class="muted-box">Noch keine Logins in dieser Kategorie.</div></td></tr>';
  const renderFactionSection = (faction) => {
    const users = state.authUsers.filter((user) => LOGIN_ROLE_DEFINITIONS[user.role]?.faction === faction.id);
    const factionAdmins = users.filter((user) => user.role === faction.adminRole && !user.isDraft);
    const createRole = manageableRoles.includes(faction.memberRole) ? faction.memberRole : manageableRoles[0];
    return `
      <div class="workspace-card">
        <div class="login-faction-head">
          <div>
            <h3>${faction.label}</h3>
            <p class="login-main-admin">Fraktions-Admins: ${factionAdmins.length ? factionAdmins.map((user) => escapeLoginManagerText(user.username)).join(', ') : 'Noch nicht vergeben'}</p>
          </div>
          ${createRole ? `<button class="mini-btn primary" onclick="createLoginManagerUser('${createRole}')">Login anlegen</button>` : ''}
        </div>
        <table class="data-table">
          <thead><tr><th>Benutzername</th><th>Passwort</th><th>Rolle</th><th>Zusatzfunktion</th><th>Aktionen</th></tr></thead>
          <tbody>${renderUserRows(users)}</tbody>
        </table>
      </div>
    `;
  };
  const systemUsers = state.authUsers.filter((user) => LOGIN_ROLE_DEFINITIONS[user.role]?.faction === 'system');
  workspacePanel.innerHTML = `
    <div class="workspace-head">
      <div>
        <h2>Login Manager</h2>
        <p>Logins sind nach Fraktionen geordnet. Fraktions-Admins verwalten die Admins und Mitglieder ihrer eigenen Fraktion.</p>
      </div>
    </div>
    <div class="workspace-section login-faction-grid">
      ${visibleFactions.map(renderFactionSection).join('')}
      ${actorDefinition.level === 'global' ? `
      <div class="workspace-card">
        <div class="login-faction-head">
          <div><h3>System / Global</h3><p>Globale Admins und reine Viewer.</p></div>
          <button class="mini-btn primary" onclick="createLoginManagerUser('Viewer')">Login anlegen</button>
        </div>
        <table class="data-table">
          <thead><tr><th>Benutzername</th><th>Passwort</th><th>Rolle</th><th>Zusatzfunktion</th><th>Aktionen</th></tr></thead>
          <tbody>${renderUserRows(systemUsers)}</tbody>
        </table>
      </div>
      ` : ''}
    </div>
  `;
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
  return permission?.linkedUserRole === 'Admin' || permission?.linkedUserRole === 'Republic Navy Admin'
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

