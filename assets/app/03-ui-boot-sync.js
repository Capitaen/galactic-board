// Generated from app-shell.js: modal UI, tutorial, boot flow, live sync

function hyperlaneSegmentScore(a, b) {
  if (!mapAnalysis) return 1;
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const samples = Math.max(12, Math.ceil(distance / 8));
  let total = 0;
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    total += hyperlaneScoreAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }
  return total / (samples + 1);
}

function rebuildFleetRenderPositions() {
  fleetRenderPositions.clear();
  const byPlanet = new Map();
  state.fleets.forEach((fleet) => {
    const planetId = fleet.locationPlanetId || fleet.planetId;
    if (!planetId) return;
    if (!byPlanet.has(planetId)) byPlanet.set(planetId, []);
    byPlanet.get(planetId).push(fleet);
  });
  byPlanet.forEach((fleets, planetId) => {
    const planet = planetIndex.get(planetId);
    if (!planet) return;
    const basePosition = getImagePlanetPosition(planet);
    fleets
      .slice()
      .sort((a, b) => `${a.faction}:${a.id}`.localeCompare(`${b.faction}:${b.id}`))
      .forEach((fleet, index) => {
        const total = fleets.length;
        const factionBias = fleet.faction === 'GAR' ? -0.55 : 0.55;
        const angle = total === 1
          ? (fleet.faction === 'GAR' ? -Math.PI * 0.72 : Math.PI * 0.28)
          : ((Math.PI * 2) * index / total) + factionBias;
        const radius = total === 1 ? 26 : 30 + Math.floor(index / 6) * 8;
        fleetRenderPositions.set(fleet.id, {
          x: clamp(basePosition.x + Math.cos(angle) * radius, 0, WORLD_SIZE),
          y: clamp(basePosition.y + Math.sin(angle) * radius, 0, WORLD_SIZE),
          angle,
          radius,
          baseX: basePosition.x,
          baseY: basePosition.y
        });
      });
  });
}

function getFleetDisplayPosition(fleet) {
  const travel = fleetTravelState.get(fleet.id);
  if (travel?.currentPosition) return travel.currentPosition;
  const locationPlanetId = fleet.locationPlanetId || fleet.planetId;
  if (viewMode !== 'schematic') {
    const rawPosition = fleetRenderPositions.get(fleet.id) || { x: fleet.x, y: fleet.y, baseX: fleet.x, baseY: fleet.y };
    const zoomPullFactor = clamp(1 - Math.max(0, zoom - 0.56) * 0.18, 0.48, 1);
    const tightened = {
      x: rawPosition.baseX + ((rawPosition.x - rawPosition.baseX) * zoomPullFactor),
      y: rawPosition.baseY + ((rawPosition.y - rawPosition.baseY) * zoomPullFactor)
    };
    if (!isClusterZoomActive()) return tightened;
    const planet = planetIndex.get(locationPlanetId);
    if (!planet) return tightened;
    const rawPlanetPosition = getImagePlanetPosition(planet);
    const displayPlanetPosition = getPlanetDisplayPosition(planet);
    return {
      x: clamp(displayPlanetPosition.x + (tightened.x - rawPlanetPosition.x), 0, WORLD_SIZE),
      y: clamp(displayPlanetPosition.y + (tightened.y - rawPlanetPosition.y), 0, WORLD_SIZE)
    };
  }
  const planet = planetIndex.get(locationPlanetId);
  if (!planet) return { x: fleet.x, y: fleet.y };
  const base = getSchematicPlanetPosition(planet);
  const hash = stableHash(`${fleet.id}:${fleet.faction}`);
  const angle = ((hash % 360) * Math.PI) / 180;
  const radius = clamp(20 - Math.max(0, zoom - 0.56) * 3.4, 10, 20);
  return {
    x: clamp(base.x + Math.cos(angle) * radius, 0, WORLD_SIZE),
    y: clamp(base.y + Math.sin(angle) * radius, 0, WORLD_SIZE)
  };
}

function saveLocal() {
  saveClientUiPrefs();
  queueLocalCampaignSnapshot();
  if (!serverSync.enabled) {
    return;
  }
  if (applyingRemoteState) {
    console.log('saveLocal skipped: applyingRemoteState');
    return;
  }
  if (!serverSyncReady) return;
  queueCampaignSync();
}

function persistLocalCampaignSnapshot(force = false) {
  saveLocalStatePending = false;
  if (applyingRemoteState) return;
  const snapshot = JSON.stringify(makeLocalCampaignSnapshot(state));
  if (!force && snapshot === lastLocalCampaignSnapshot) return;
  lastLocalCampaignSnapshot = snapshot;
  localStorage.setItem(LOCAL_STATE_STORAGE_KEY, snapshot);
}

function queueLocalCampaignSnapshot() {
  saveLocalStatePending = true;
  if (saveLocalStateTimer) return;
  saveLocalStateTimer = window.setTimeout(() => {
    saveLocalStateTimer = null;
    if (!saveLocalStatePending) return;
    persistLocalCampaignSnapshot();
  }, 180);
}

function saveClientUiPrefs() {
  const prefs = {
    layers,
    zoom,
    panX,
    panY,
    viewMode,
    fleetCategoryCollapsedIds: Array.from(fleetCategoryCollapsedIds),
    fleetCommandCollapsedIds: Array.from(fleetCommandCollapsedIds),
    audioMuted
  };
  localStorage.setItem(CLIENT_UI_PREFS_KEY, JSON.stringify(prefs));
  saveUiSettingsPrefs();
}

function loadClientUiPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(CLIENT_UI_PREFS_KEY) || '{}');
    if (raw.layers && typeof raw.layers === 'object') {
      const restoredLayers = { ...raw.layers };
      delete restoredLayers.influence;
      delete restoredLayers.contested;
      layers = { ...STARTUP_LAYERS, ...restoredLayers };
    }
    if (Number.isFinite(raw.zoom)) zoom = raw.zoom;
    if (Number.isFinite(raw.panX)) panX = raw.panX;
    if (Number.isFinite(raw.panY)) panY = raw.panY;
    if (Array.isArray(raw.fleetCategoryCollapsedIds)) fleetCategoryCollapsedIds = new Set(raw.fleetCategoryCollapsedIds.map((entry) => String(entry)));
    if (Array.isArray(raw.fleetCommandCollapsedIds)) fleetCommandCollapsedIds = new Set(raw.fleetCommandCollapsedIds.map((entry) => String(entry)));
    audioMuted = Boolean(raw.audioMuted);
  } catch (error) {
    console.warn('UI prefs could not be restored', error);
  }
  loadUiSettingsPrefs();
}

function syncLayerCheckboxes() {
  document.querySelectorAll('[data-layer]').forEach((cb) => {
    cb.checked = Boolean(layers[cb.dataset.layer]);
  });
  syncSettingsModalState();
}

function queueHoverStateUpdate(event) {
  pendingHoverUpdate = {
    clientX: event.clientX,
    clientY: event.clientY
  };
  if (hoverUpdateFrame) return;
  hoverUpdateFrame = window.requestAnimationFrame(() => {
    hoverUpdateFrame = 0;
    const pointer = pendingHoverUpdate;
    pendingHoverUpdate = null;
    if (!pointer || activeInteraction) return;
    const worldPos = eventToWorld(pointer);
    const hoveredCluster = nearestDisplayedFleetCluster(worldPos.x, worldPos.y, 24);
    const hoveredPlanet = hoveredCluster ? null : nearestDisplayedPlanet(worldPos.x, worldPos.y, 18);
    const hoveredRoute = hoveredPlanet ? null : nearestDisplayedRoute(worldPos.x, worldPos.y, 8);
    queueHoveredRoute(hoveredRoute?.id || null);
    const nextHoveredZone = nearestDisplayedZone(worldPos.x, worldPos.y);
    const keepCurrentSector = !nextHoveredZone
      && hoveredPlanet
      && isPlanetInsideHoveredSector(hoveredPlanet);
    setHoveredZone(keepCurrentSector ? hoveredZoneInfo : nextHoveredZone);
    const hoveredMarker = (hoveredPlanet || hoveredRoute) ? null : nearestDisplayedMarker(worldPos.x, worldPos.y, 20);
    hoveredMarkerId = hoveredMarker?.id || null;
    setHoveredPlanet(hoveredPlanet?.id || null);
  });
}

function getOverlayModalById(modalId) {
  if (modalId === 'settingsModal') return settingsModal;
  if (modalId === 'adminControlModal') return adminControlModal;
  if (modalId === 'auditLogModal') return auditLogModal;
  if (modalId === 'creditsModal') return creditsModal;
  if (modalId === 'tutorialModal') return tutorialModal;
  if (modalId === 'loginCreateModal') return loginCreateModal;
  if (modalId === 'passwordChangeModal') return passwordChangeModal;
  return null;
}

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter((element) => !element.disabled && !element.getAttribute('aria-hidden'));
}

function trapFocusInModal(event) {
  if (event.key !== 'Tab' || !activeOverlayModalId) return;
  const modal = getOverlayModalById(activeOverlayModalId);
  const focusables = getFocusableElements(modal);
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function closeOverlayModal(modalId, { restoreFocus = true } = {}) {
  const modal = getOverlayModalById(modalId);
  if (!modal) return;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  if (activeOverlayModalId === modalId) activeOverlayModalId = '';
  if (restoreFocus && lastFocusedElementBeforeModal?.focus) {
    window.setTimeout(() => lastFocusedElementBeforeModal.focus(), 20);
  }
}

function openOverlayModal(modalId) {
  const modal = getOverlayModalById(modalId);
  if (!modal) return;
  if (activeOverlayModalId && activeOverlayModalId !== modalId) {
    closeOverlayModal(activeOverlayModalId, { restoreFocus: false });
  }
  lastFocusedElementBeforeModal = document.activeElement;
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  activeOverlayModalId = modalId;
  window.setTimeout(() => {
    const focusables = getFocusableElements(modal);
    (focusables[0] || modal).focus?.();
  }, 30);
}

function getSettingsToggleDefinitions() {
  return [
    { id: 'planetLabels', label: 'Planetennamen', description: 'Blendet Planetennamen direkt auf der Karte ein.' },
    { id: 'hyperlanes', label: 'Hyperraumrouten', description: 'Zeigt Hyperraumrouten und manuelle Verbindungen.' },
    { id: 'majorTradeRoutes', label: 'Große Handelsrouten', description: 'Nutzen aktuell dieselbe Darstellung wie die Haupt-Hyperraumrouten.', checked: () => Boolean(layers.hyperlanes), onToggle: (next) => setLayerPreference('hyperlanes', next) },
    { id: 'conflictPulse', label: 'Konfliktanzeige', description: 'Zeigt sektorale Konfliktfarben an. Ausgeschaltet bleiben Sektoren sichtbar, aber neutral grau.', checked: () => Boolean(layers.conflictPulse), onToggle: (next) => setLayerPreference('conflictPulse', next) },
    { id: 'sectors', label: 'Sektoren', description: 'Blendet alle Sektoren samt Beschriftung gesammelt ein oder aus.', checked: () => Boolean(layers.sectorLabels), onToggle: (next) => setLayerPreference('sectorLabels', next) },
    { id: 'grid', label: 'Raster', description: 'Galaktisches Raster und Ringsegmente ein- oder ausblenden.' },
    { id: 'fleetMarkers', label: 'Flottenmarker', description: 'Zeigt GAR- und KUS-Flottenmarker gesammelt an.', checked: () => Boolean(layers.garFleets && layers.kusFleets), onToggle: (next) => {
      setLayerPreference('garFleets', next, false);
      setLayerPreference('kusFleets', next, true);
    }},
    { id: 'stationMarkers', label: 'Raumstationen', description: 'Blendet Golan-1 und andere Raumstationen separat ein oder aus.' },
    { id: 'tacticalOverlay', label: 'Taktische / schematische Karte', description: 'Wechselt zwischen Bildkarte und schematischer Einsatzdarstellung.', checked: () => viewMode === 'schematic', onToggle: (next) => setViewModePreference(next ? 'schematic' : 'image') }
  ];
}

function setLayerPreference(layerId, enabled, renderAfter = true) {
  layers[layerId] = Boolean(enabled);
  saveClientUiPrefs();
  const affectsTacticalCanvas = ['grid', 'hyperlanes', 'sectorLabels'].includes(layerId);
  const affectsInfluence = layerId === 'sectorLabels' || layerId === 'conflictPulse';
  const affectsRouteNetwork = layerId === 'hyperlanes';
  const affectsFleetMarkers = layerId === 'garFleets' || layerId === 'kusFleets' || layerId === 'stationMarkers';
  markDirty({
    positions: affectsFleetMarkers,
    layers: true,
    tacticalBase: affectsTacticalCanvas,
    influence: affectsInfluence,
    frontline: affectsRouteNetwork,
    routeOverlay: affectsRouteNetwork
  });
  if (renderAfter) syncSettingsModalState();
}

function setViewModePreference(nextMode) {
  if (!['image', 'schematic'].includes(nextMode) || nextMode === viewMode) return;
  viewMode = nextMode;
  tacticalSectionCanvasCache.clear();
  tacticalHoverAreas = { regions: [], sectors: [] };
  tacticalBaseReady = false;
  tacticalBuildQueued = false;
  tacticalBuildVersion += 1;
  saveClientUiPrefs();
  applyViewMode();
  render({ layers: true, frontline: true });
  syncSettingsModalState();
}

function getCurrentSessionLabel() {
  return currentAuthenticatedUsername ? `${currentAuthenticatedUsername} (${currentRole()})` : 'Gast / Viewer';
}

function getAdminControlFilteredPlanets() {
  const normalizedQuery = normalizeSearchText(adminControlPlanetSearchQuery || '');
  return (state.planets || [])
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, 'de'))
    .filter((planet) => {
      if (!normalizedQuery) return true;
      const haystack = normalizeSearchText([planet.name, planet.sector, planet.region, planet.grid, planet.owner].join(' '));
      return haystack.includes(normalizedQuery);
    });
}

function ensureAdminControlPlanetSelection() {
  const filteredPlanets = getAdminControlFilteredPlanets();
  const existingPlanet = planetIndex.get(selectedAdminControlPlanetId);
  if (existingPlanet && filteredPlanets.some((planet) => planet.id === existingPlanet.id)) return existingPlanet;
  if (!filteredPlanets.length) {
    selectedAdminControlPlanetId = '';
    return null;
  }
  selectedAdminControlPlanetId = filteredPlanets[0]?.id || state.planets?.[0]?.id || '';
  return planetIndex.get(selectedAdminControlPlanetId) || null;
}

function getInfrastructureOptionMarkup(selectedKey = '') {
  const categoryLabels = {
    military: 'Militaerisch',
    civilian: 'Zivil',
    development: 'Entwicklung',
    storage: 'Lager'
  };
  const grouped = new Map();
  Object.entries(MINE_PROJECT_DEFS).forEach(([buildingKey, meta]) => {
    const category = meta.category || 'military';
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push({ buildingKey, meta });
  });
  return ['military', 'civilian', 'development', 'storage']
    .filter((category) => grouped.has(category))
    .map((category) => `
      <optgroup label="${categoryLabels[category] || category}">
        ${grouped.get(category)
          .sort((left, right) => (left.meta.label || left.buildingKey).localeCompare((right.meta.label || right.buildingKey), 'de'))
          .map(({ buildingKey, meta }) => `<option value="${buildingKey}" ${selectedKey === buildingKey ? 'selected' : ''}>${escapeHtml(meta.label || buildingKey)}</option>`)
          .join('')}
      </optgroup>
    `)
    .join('');
}

function syncViewsAfterAdminControlSave() {
  render({ positions: true, layers: true, frontline: true, influence: true });
  if (activeMainTab === 'shipyard') renderShipyardView();
  if (activeMainTab === 'fleetManagement') renderFleetManagementView();
  if (activeMainTab === 'buildProjects') renderBuildProjectsView();
  if (activeMainTab === 'economy') renderEconomyView();
}

async function fetchAuditLog(options = {}) {
  if (!canViewAuditLogs()) return;
  const { silent = false } = options;
  if (!silent) {
    auditLogAdminState.loading = true;
    if (auditLogModal?.classList.contains('active')) renderAuditLogModal();
  }
  try {
    const response = await fetch(`/api/admin/audit-log?limit=${encodeURIComponent(auditLogAdminState.limit || 300)}`, {
      credentials: 'include'
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Logs konnten nicht geladen werden.');
    auditLogAdminState.entries = Array.isArray(payload.entries) ? payload.entries : [];
    auditLogAdminState.loading = false;
    if (auditLogModal?.classList.contains('active')) renderAuditLogModal();
  } catch (error) {
    auditLogAdminState.loading = false;
    setStatus(`Logs laden fehlgeschlagen: ${error.message}`);
    if (auditLogModal?.classList.contains('active')) renderAuditLogModal();
  }
}

function renderAuditLogModal() {
  if (!auditLogModalContent || !canViewAuditLogs()) return;
  const normalizeAuditSearch = (value) => String(value || '').trim().toLowerCase();
  const actorOptions = [...new Set(auditLogAdminState.entries.map((entry) => String(entry.actorUsername || 'System').trim() || 'System'))]
    .sort((left, right) => left.localeCompare(right, 'de', { sensitivity: 'base' }));
  const actionOptions = [...new Set(auditLogAdminState.entries.map((entry) => String(entry.action || 'audit.entry').trim() || 'audit.entry'))]
    .sort((left, right) => left.localeCompare(right, 'de', { sensitivity: 'base' }));
  const filteredEntries = auditLogAdminState.entries.filter((entry) => {
    const actorUsername = String(entry.actorUsername || 'System').trim() || 'System';
    const action = String(entry.action || 'audit.entry').trim() || 'audit.entry';
    if (auditLogAdminState.actorFilter !== 'all' && actorUsername !== auditLogAdminState.actorFilter) return false;
    if (auditLogAdminState.actionFilter !== 'all' && action !== auditLogAdminState.actionFilter) return false;
    const query = normalizeAuditSearch(auditLogAdminState.query);
    if (!query) return true;
    const haystack = normalizeAuditSearch([
      actorUsername,
      entry.actorRole || '',
      action,
      entry.entityType || '',
      entry.entityId || '',
      JSON.stringify(entry.payload || {})
    ].join(' '));
    return haystack.includes(query);
  });
  const logCards = filteredEntries.length
    ? filteredEntries.map((entry) => `
      <article class="project-card">
        <h4>${escapeHtml(entry.action || 'audit.entry')}</h4>
        <p>${escapeHtml(entry.actorUsername || 'System')} • ${escapeHtml(entry.actorRole || 'Unbekannt')} • ${new Date(entry.createdAt || Date.now()).toLocaleString('de-DE')}</p>
        <p class="project-meta">${escapeHtml(entry.entityType || 'entity')} • ${escapeHtml(entry.entityId || '—')}</p>
        <pre class="server-reload-console" style="min-height:0;max-height:220px;margin-top:10px">${escapeHtml(JSON.stringify(entry.payload || {}, null, 2))}</pre>
      </article>
    `).join('')
    : '<div class="muted-box">Noch keine Logs vorhanden.</div>';
  auditLogModalContent.innerHTML = `
    <div class="overlay-panel">
      <div class="overlay-panel-head">
        <div class="overlay-panel-title">
          <h2 id="auditLogModalTitle">System-Logs</h2>
          <p>Zentrale Übersicht für Login Manager, Flottenmanagement, Schiffbau, Bauprojekte und weitere Admin-Aktionen.</p>
        </div>
        <div class="toolbar-row end">
          <button type="button" class="mini-btn" id="refreshAuditLogBtn" ${auditLogAdminState.loading ? 'disabled' : ''}>Aktualisieren</button>
          <button type="button" class="secondary overlay-panel-close" data-close-modal="auditLogModal" aria-label="Logs schließen">×</button>
        </div>
      </div>
      <section class="overlay-section">
        <div class="toolbar-row" style="margin-bottom:12px">
          <input id="auditLogSearch" type="search" placeholder="Logs durchsuchen..." value="${escapeHtml(auditLogAdminState.query || '')}" autocomplete="off">
          <select id="auditLogActorFilter">
            <option value="all">Alle Personen</option>
            ${actorOptions.map((actor) => `<option value="${escapeHtml(actor)}" ${auditLogAdminState.actorFilter === actor ? 'selected' : ''}>${escapeHtml(actor)}</option>`).join('')}
          </select>
          <select id="auditLogActionFilter">
            <option value="all">Alle Aktionen</option>
            ${actionOptions.map((action) => `<option value="${escapeHtml(action)}" ${auditLogAdminState.actionFilter === action ? 'selected' : ''}>${escapeHtml(action)}</option>`).join('')}
          </select>
        </div>
        <div class="muted" style="margin-bottom:10px">${filteredEntries.length} von ${auditLogAdminState.entries.length} Logs sichtbar.</div>
        ${auditLogAdminState.loading ? '<div class="muted-box">Logs werden geladen...</div>' : logCards}
      </section>
    </div>
  `;
  auditLogModalContent.querySelector('#refreshAuditLogBtn')?.addEventListener('click', () => {
    void fetchAuditLog();
  });
  auditLogModalContent.querySelector('#auditLogSearch')?.addEventListener('input', (event) => {
    auditLogAdminState.query = event.target.value || '';
    renderAuditLogModal();
  });
  auditLogModalContent.querySelector('#auditLogActorFilter')?.addEventListener('change', (event) => {
    auditLogAdminState.actorFilter = event.target.value || 'all';
    renderAuditLogModal();
  });
  auditLogModalContent.querySelector('#auditLogActionFilter')?.addEventListener('change', (event) => {
    auditLogAdminState.actionFilter = event.target.value || 'all';
    renderAuditLogModal();
  });
}

function renderAdminControlModal() {
  if (!adminControlModalContent || !isAdminRole()) return;
  const selectedPlanet = ensureAdminControlPlanetSelection();
  const filteredPlanets = getAdminControlFilteredPlanets();
  const selectedPoolGar = getFactionResourcePool('GAR');
  const selectedPoolKus = getFactionResourcePool('KUS');
  const selectedSlots = selectedPlanet ? getPlanetResourceSlots(selectedPlanet.id) : Array.from({ length: 10 }, () => '');
  const slotUsage = selectedPlanet ? getPlanetSlotUsage(selectedPlanet.id) : { used: 0, total: 10 };
  const productionRate = selectedPlanet ? getPlanetProductionRate(selectedPlanet.id) : createEmptyFactionResources();
  adminControlModalContent.innerHTML = `
    <div class="overlay-panel admin-control-panel">
      <div class="overlay-panel-head">
        <div class="overlay-panel-title">
          <h2 id="adminControlModalTitle">Globales Kontrollzentrum</h2>
          <p>Manuelle Eingriffe fuer globale Admins: Fraktionspools, Planeteneigentuemer, Infrastruktur-Slots und lokale Lager.</p>
        </div>
        <button type="button" class="secondary overlay-panel-close" data-close-modal="adminControlModal" aria-label="Kontrollzentrum schliessen">×</button>
      </div>
      <section class="overlay-section">
        <div class="admin-control-section-head">
          <div>
            <h3>Fraktionspools</h3>
            <p>Direkter Eingriff in Ressourcen und Credits fuer GAR und KUS.</p>
          </div>
        </div>
        <div class="admin-control-resource-grid">
          ${[
            { faction: 'GAR', pool: selectedPoolGar, title: 'GAR-Haushalt' },
            { faction: 'KUS', pool: selectedPoolKus, title: 'KUS-Haushalt' }
          ].map(({ faction, pool, title }) => `
            <article class="admin-control-card">
              <h4>${title}</h4>
              <div class="admin-control-input-grid">
                ${RESOURCE_KEYS.map((resourceKey) => `
                  <label class="admin-control-input">
                    <span>${escapeHtml(RESOURCE_LABELS[resourceKey] || resourceKey)}</span>
                    <input id="adminPool_${faction}_${resourceKey}" type="number" min="0" step="1" value="${Math.round(Number(pool?.[resourceKey] || 0))}">
                  </label>
                `).join('')}
              </div>
              <div class="toolbar-row end">
                <button type="button" class="mini-btn primary" data-admin-save-pool="${faction}">${faction} speichern</button>
              </div>
            </article>
          `).join('')}
        </div>
      </section>
      <section class="overlay-section">
        <div class="admin-control-section-head">
          <div>
            <h3>Planeteneditor</h3>
            <p>Planeten schnell finden, Besitzer wechseln, Slots anpassen und Lager direkt pflegen.</p>
          </div>
        </div>
        <div class="admin-control-planet-toolbar">
          <label class="admin-control-search">
            <span>Planet suchen</span>
            <input id="adminControlPlanetSearch" type="search" placeholder="Name, Sektor, Grid ..." value="${escapeHtml(adminControlPlanetSearchQuery)}">
          </label>
          <label class="admin-control-select">
            <span>Auswahl</span>
            <select id="adminControlPlanetSelect">
              ${filteredPlanets.map((planet) => `<option value="${planet.id}" ${planet.id === selectedPlanet?.id ? 'selected' : ''}>${escapeHtml(planet.name)} • ${escapeHtml(planet.sector || '—')} • ${escapeHtml(planet.grid || '—')}</option>`).join('') || '<option value="">Keine Treffer</option>'}
            </select>
          </label>
          <div class="toolbar-row end">
            <button type="button" class="mini-btn" id="adminControlFocusPlanetBtn" ${selectedPlanet ? '' : 'disabled'}>Auf Karte zeigen</button>
          </div>
        </div>
        ${selectedPlanet ? `
          <div class="admin-control-summary-grid">
            <div class="stat-card"><strong>Besitzer</strong><span>${escapeHtml(selectedPlanet.owner || 'NEUTRAL')}</span></div>
            <div class="stat-card"><strong>Grid</strong><span>${escapeHtml(selectedPlanet.grid || '—')}</span></div>
            <div class="stat-card"><strong>Sektor</strong><span>${escapeHtml(selectedPlanet.sector || '—')}</span></div>
            <div class="stat-card"><strong>Region</strong><span>${escapeHtml(getRegionLabel(selectedPlanet.region || ''))}</span></div>
            <div class="stat-card"><strong>Slots belegt</strong><span>${slotUsage.used}/${slotUsage.total || 10}</span></div>
          </div>
          <div class="admin-control-columns">
            <article class="admin-control-card">
              <h4>Grunddaten</h4>
              <div class="admin-control-input-grid">
                <label class="admin-control-input">
                  <span>Besitzer</span>
                  <select id="adminControlPlanetOwner">
                    ${['GAR', 'KUS', 'HUTT', 'NEUTRAL'].map((owner) => `<option value="${owner}" ${selectedPlanet.owner === owner ? 'selected' : ''}>${owner}</option>`).join('')}
                  </select>
                </label>
                <label class="admin-control-input">
                  <span>Sektor</span>
                  <input value="${escapeHtml(selectedPlanet.sector || '—')}" disabled>
                </label>
                <label class="admin-control-input">
                  <span>Region</span>
                  <input value="${escapeHtml(selectedPlanet.region || '—')}" disabled>
                </label>
                <label class="admin-control-input">
                  <span>Produktion / h</span>
                  <input value="${RESOURCE_KEYS.filter((resourceKey) => Number(productionRate?.[resourceKey] || 0) > 0).map((resourceKey) => `${RESOURCE_LABELS[resourceKey]} +${Math.round(Number(productionRate[resourceKey] || 0))}`).join(' • ') || 'Keine'}" disabled>
                </label>
              </div>
            </article>
            <article class="admin-control-card">
              <div class="admin-control-card-head">
                <h4>Infrastruktur-Slots</h4>
                <button type="button" class="mini-btn" id="adminControlClearSlotsBtn">Alle Slots leeren</button>
              </div>
              <div class="admin-control-slot-grid">
                ${selectedSlots.map((slot, index) => `
                  <label class="admin-control-slot-card">
                    <span>Slot ${index + 1}</span>
                    <select id="adminControlSlot_${index}">
                      <option value="" ${!slot ? 'selected' : ''}>Leer</option>
                      ${getInfrastructureOptionMarkup(slot)}
                    </select>
                  </label>
                `).join('')}
              </div>
            </article>
          </div>
          <div class="toolbar-row end" style="margin-top:14px">
            <button type="button" class="mini-btn primary" id="adminControlSavePlanetBtn">Planet speichern</button>
          </div>
        ` : '<div class="muted-box">Kein Planet passend zur aktuellen Suche gefunden.</div>'}
      </section>
    </div>
  `;
  adminControlModalContent.querySelectorAll('[data-admin-save-pool]').forEach((button) => {
    button.addEventListener('click', () => {
      const faction = button.dataset.adminSavePool;
      const pool = getFactionResourcePool(faction);
      RESOURCE_KEYS.forEach((resourceKey) => {
        const input = document.getElementById(`adminPool_${faction}_${resourceKey}`);
        pool[resourceKey] = Math.max(0, Math.round(Number(input?.value || 0)));
      });
      saveLocal();
      playAudioCue(datapadAcceptAudio);
      syncViewsAfterAdminControlSave();
      renderAdminControlModal();
      setStatus(`${faction}-Haushalt manuell aktualisiert.`);
    });
  });
  adminControlModalContent.querySelector('#adminControlPlanetSearch')?.addEventListener('input', (event) => {
    adminControlPlanetSearchQuery = event.target.value || '';
    renderAdminControlModal();
    const selectionStart = event.target.selectionStart ?? null;
    const selectionEnd = event.target.selectionEnd ?? null;
    requestAnimationFrame(() => {
      const input = document.getElementById('adminControlPlanetSearch');
      if (!input) return;
      input.focus({ preventScroll: true });
      const start = Number.isInteger(selectionStart) ? selectionStart : input.value.length;
      const end = Number.isInteger(selectionEnd) ? selectionEnd : start;
      if (typeof input.setSelectionRange === 'function') input.setSelectionRange(start, end);
    });
  });
  adminControlModalContent.querySelector('#adminControlPlanetSelect')?.addEventListener('change', (event) => {
    selectedAdminControlPlanetId = event.target.value || '';
    renderAdminControlModal();
  });
  adminControlModalContent.querySelector('#adminControlFocusPlanetBtn')?.addEventListener('click', () => {
    if (!selectedPlanet) return;
    closeOverlayModal('adminControlModal');
    focusPlanetOnMap(selectedPlanet.id);
  });
  adminControlModalContent.querySelector('#adminControlClearSlotsBtn')?.addEventListener('click', () => {
    for (let index = 0; index < 10; index += 1) {
      const input = document.getElementById(`adminControlSlot_${index}`);
      if (input) input.value = '';
    }
  });
  adminControlModalContent.querySelector('#adminControlSavePlanetBtn')?.addEventListener('click', () => {
    if (!selectedPlanet) return;
    const nextOwner = document.getElementById('adminControlPlanetOwner')?.value || selectedPlanet.owner || 'NEUTRAL';
    selectedPlanet.owner = nextOwner;
    const nextSlots = Array.from({ length: 10 }, (_, index) => document.getElementById(`adminControlSlot_${index}`)?.value || '');
    setPlanetResourceSlots(selectedPlanet.id, nextSlots);
    syncWarehouseStoreForPlanet(selectedPlanet.id);
    saveLocal();
    playAudioCue(datapadAcceptAudio);
    syncViewsAfterAdminControlSave();
    renderAdminControlModal();
    setStatus(`Planet manuell aktualisiert: ${selectedPlanet.name}`);
  });
}

function renderSettingsModal() {
  if (!settingsModalContent) return;
  const toggleRows = getSettingsToggleDefinitions().map((entry) => {
    const checked = entry.checked ? entry.checked() : Boolean(layers[entry.id]);
    return `
      <div class="overlay-toggle-row">
        <div class="overlay-toggle-copy">
          <strong>${escapeHtml(entry.label)}</strong>
          <span>${escapeHtml(entry.description)}</span>
        </div>
        <button
          type="button"
          class="hud-switch${checked ? ' active' : ''}"
          aria-pressed="${checked ? 'true' : 'false'}"
          data-settings-toggle="${escapeHtml(entry.id)}"
        ></button>
      </div>
    `;
  }).join('');
  settingsModalContent.innerHTML = `
    <div class="overlay-panel">
      <div class="overlay-panel-head">
        <div class="overlay-panel-title">
          <h2 id="settingsModalTitle">⚙ Einstellungen</h2>
          <p>Angemeldet als: ${escapeHtml(getCurrentSessionLabel())}</p>
        </div>
        <div class="toolbar-row end">
          ${currentAuthenticatedUsername ? '<button type="button" class="mini-btn" id="openPasswordChangeFromSettings">Passwort ändern</button>' : ''}
          <button type="button" class="secondary overlay-panel-close" data-close-modal="settingsModal" aria-label="Einstellungen schließen">×</button>
        </div>
      </div>
      <section class="overlay-section">
        <h3>Kartenanzeige</h3>
        <div class="overlay-toggle-list">${toggleRows}</div>
      </section>
      <section class="overlay-section">
        <h3>Sound</h3>
        <div class="sound-row">
          <input id="settingsSoundRange" type="range" min="0" max="100" step="1" value="${clampUiSoundVolume(uiSoundVolume)}">
          <strong id="settingsSoundValue">${clampUiSoundVolume(uiSoundVolume)}%</strong>
        </div>
        <div class="overlay-helper-text">Wird lokal gespeichert und auf Klicksounds, Pings und Warnhinweise angewendet.</div>
      </section>
      ${isAdminRole() ? `
        <section class="overlay-section">
          <h3>Admin</h3>
          <div class="overlay-toggle-row">
            <div class="overlay-toggle-copy">
              <strong>Admin-Modus</strong>
              <span>Blendet Admin-Werkzeuge im HUD gezielt ein oder aus.</span>
            </div>
            <button
              type="button"
              class="hud-switch${adminModeEnabled ? ' active' : ''}"
              aria-pressed="${adminModeEnabled ? 'true' : 'false'}"
              data-settings-admin-toggle="true"
            ></button>
          </div>
          <div class="toolbar-row" style="margin-top:12px">
            <button type="button" class="mini-btn primary" id="openAdminControlCenter">Globales Kontrollzentrum öffnen</button>
            ${canViewAuditLogs() ? '<button type="button" class="mini-btn" id="openAuditLogCenter">Logs öffnen</button>' : ''}
          </div>
        </section>
      ` : ''}
      <section class="overlay-section">
        <h3>Credits</h3>
        <div class="toolbar-row">
          <button type="button" class="mini-btn" id="openCreditsFromSettings">Credits öffnen</button>
        </div>
      </section>
    </div>
  `;
  settingsModalContent.querySelectorAll('[data-settings-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const toggle = getSettingsToggleDefinitions().find((entry) => entry.id === button.dataset.settingsToggle);
      if (!toggle) return;
      const current = toggle.checked ? toggle.checked() : Boolean(layers[toggle.id]);
      if (toggle.onToggle) toggle.onToggle(!current);
      else setLayerPreference(toggle.id, !current);
      renderSettingsModal();
    });
  });
  settingsModalContent.querySelector('[data-settings-admin-toggle]')?.addEventListener('click', () => {
    adminModeEnabled = !adminModeEnabled;
    saveUiSettingsPrefs();
    refreshRoleChrome();
    renderSettingsModal();
  });
  settingsModalContent.querySelector('#openAdminControlCenter')?.addEventListener('click', () => {
    renderAdminControlModal();
    openOverlayModal('adminControlModal');
  });
  settingsModalContent.querySelector('#openAuditLogCenter')?.addEventListener('click', () => {
    renderAuditLogModal();
    openOverlayModal('auditLogModal');
    void fetchAuditLog();
  });
  settingsModalContent.querySelector('#openPasswordChangeFromSettings')?.addEventListener('click', () => {
    renderPasswordChangeModal();
    openOverlayModal('passwordChangeModal');
  });
  settingsModalContent.querySelector('#settingsSoundRange')?.addEventListener('input', (event) => {
    uiSoundVolume = clampUiSoundVolume(event.target.value);
    saveUiSettingsPrefs();
    applyAudioMuteState();
    syncSettingsModalState();
  });
  settingsModalContent.querySelector('#openCreditsFromSettings')?.addEventListener('click', () => {
    renderCreditsModal();
    openOverlayModal('creditsModal');
  });
}

function syncSettingsModalState() {
  if (settingsModal?.classList.contains('active')) {
    const sessionLabel = settingsModalContent?.querySelector('.overlay-panel-title p');
    if (sessionLabel) sessionLabel.textContent = `Angemeldet als: ${getCurrentSessionLabel()}`;
    getSettingsToggleDefinitions().forEach((entry) => {
      const button = settingsModalContent?.querySelector(`[data-settings-toggle="${entry.id}"]`);
      if (!button) return;
      const checked = entry.checked ? entry.checked() : Boolean(layers[entry.id]);
      button.classList.toggle('active', checked);
      button.setAttribute('aria-pressed', checked ? 'true' : 'false');
    });
    const adminToggle = settingsModalContent?.querySelector('[data-settings-admin-toggle]');
    if (adminToggle) {
      adminToggle.classList.toggle('active', adminModeEnabled);
      adminToggle.setAttribute('aria-pressed', adminModeEnabled ? 'true' : 'false');
    }
  }
  const volumeLabel = document.getElementById('settingsSoundValue');
  if (volumeLabel) volumeLabel.textContent = `${clampUiSoundVolume(uiSoundVolume)}%`;
  const volumeInput = document.getElementById('settingsSoundRange');
  if (volumeInput && document.activeElement !== volumeInput) volumeInput.value = String(clampUiSoundVolume(uiSoundVolume));
}

function renderCreditsModal() {
  if (!creditsModalContent) return;
  const names = ['Burnout', 'Shoot'];
  creditsModalContent.innerHTML = `
    <div class="overlay-panel">
      <div class="overlay-panel-head">
        <div class="overlay-panel-title">
          <h2 id="creditsModalTitle">👤 CREDITS</h2>
          <p>Mitwirkende dieser Board-Version.</p>
        </div>
        <button type="button" class="secondary overlay-panel-close" data-close-modal="creditsModal" aria-label="Credits schließen">×</button>
      </div>
      <div class="credits-card-list">
        ${names.map((name, index) => `
          <article class="credits-card">
            <div class="credits-card-index">${String(index + 1).padStart(2, '0')}</div>
            <div class="credits-card-name">${escapeHtml(name)}</div>
          </article>
        `).join('')}
      </div>
    </div>
  `;
}

function getTutorialSteps() {
  const baseSteps = [
    {
      title: 'Willkommen auf dem Galactic Campaign Command Board',
      body: 'Hier steuerst du Karte, Fraktionen, Wirtschaft und Kampagnenstatus aus einer Oberfläche.'
    },
    {
      title: 'Karte bewegen und zoomen',
      body: 'Mit Ziehen, Mausrad und den Zoom-Buttons bewegst du dich über die Galaxis und fokussierst wichtige Fronten.'
    },
    {
      title: 'Planeten anklicken und Informationen lesen',
      body: 'Ein Klick auf einen Planeten öffnet dir Besitzverhältnisse, Sektor, Routen, Infrastruktur und weitere Details.'
    },
    {
      title: 'Layer und Map Display',
      body: 'Über Settings steuerst du Labels, Hyperraumrouten, Raster, Flottenmarker und die schematische Kartenansicht.'
    },
    {
      title: 'Flottenmanagement-Grundlagen',
      body: 'Im Flottenmanagement ordnest du Verbände, Sprünge, Schiffe und Zuständigkeiten innerhalb deiner Fraktion.'
    },
    {
      title: 'Schiffbau und Bauprojekte',
      body: 'Bauorte, Slots, Infrastruktur und laufende Aufträge laufen über Schiffbau und Bauprojekte zusammen.'
    },
    {
      title: 'Wirtschaft und Börse',
      body: 'Im Wirtschaftsbereich beobachtest du Holdings, Sektorpreise, Portfolios und Ressourcenströme.'
    },
    {
      title: 'Rollen und Rechte',
      body: 'Deine Rolle steuert, welche Menüs, Buttons und Verwaltungsfunktionen du auf dem Board nutzen kannst.'
    }
  ];
  if (!isAdminRole()) return baseSteps;
  return [
    ...baseSteps,
    {
      title: 'Admin-Werkzeuge',
      body: 'Als Admin hast du zusätzlich Zugriff auf Export JSON, Trello-Import, Login Manager und Befehlsberechtigungen.'
    }
  ];
}

function renderTutorialModal() {
  if (!tutorialModalContent) return;
  const steps = tutorialFlowState.steps;
  if (!tutorialFlowState.started) {
    tutorialModalContent.innerHTML = `
      <div class="overlay-panel">
        <div class="overlay-panel-head">
          <div class="overlay-panel-title">
            <h2 id="tutorialModalTitle">🛰 Tutorial</h2>
            <p>Einmaliger Einstieg für neue Besuche auf dieser Verbindung.</p>
          </div>
          <button type="button" class="secondary overlay-panel-close" data-close-modal="tutorialModal" aria-label="Tutorial schließen">×</button>
        </div>
        <section class="overlay-section tutorial-step-card">
          <h3>Kurzer Rundgang?</h3>
          <p>Wir zeigen dir in wenigen Schritten Karte, Menüs, Bauprojekte und Wirtschaft, damit du direkt sauber reinkommst.</p>
          <div class="tutorial-actions">
            <button type="button" class="secondary" id="tutorialSkipBtn">Überspringen</button>
            <button type="button" class="primary" id="tutorialStartBtn">Tutorial starten</button>
          </div>
        </section>
      </div>
    `;
    tutorialModalContent.querySelector('#tutorialSkipBtn')?.addEventListener('click', () => finishTutorialFlow('skipped'));
    tutorialModalContent.querySelector('#tutorialStartBtn')?.addEventListener('click', () => {
      tutorialFlowState.started = true;
      tutorialFlowState.stepIndex = 0;
      renderTutorialModal();
    });
    return;
  }
  const step = steps[tutorialFlowState.stepIndex] || steps[0];
  const isLast = tutorialFlowState.stepIndex >= steps.length - 1;
  tutorialModalContent.innerHTML = `
    <div class="overlay-panel">
      <div class="overlay-panel-head">
        <div class="overlay-panel-title">
          <h2 id="tutorialModalTitle">🛰 Tutorial</h2>
          <p>Schritt ${tutorialFlowState.stepIndex + 1} von ${steps.length}</p>
        </div>
        <button type="button" class="secondary overlay-panel-close" data-close-modal="tutorialModal" aria-label="Tutorial schließen">×</button>
      </div>
      <div class="tutorial-stepper">
        ${steps.map((_, index) => `<span class="tutorial-step-dot${index === tutorialFlowState.stepIndex ? ' active' : ''}"></span>`).join('')}
      </div>
      <section class="overlay-section tutorial-step-card">
        <h3>${escapeHtml(step.title)}</h3>
        <p>${escapeHtml(step.body)}</p>
      </section>
      <div class="tutorial-actions">
        <button type="button" class="secondary" id="tutorialBackBtn" ${tutorialFlowState.stepIndex <= 0 ? 'disabled' : ''}>Zurück</button>
        <div class="toolbar-row">
          <button type="button" class="secondary" id="tutorialSkipBtn">Überspringen</button>
          <button type="button" class="primary" id="tutorialNextBtn">${isLast ? 'Abschließen' : 'Weiter'}</button>
        </div>
      </div>
    </div>
  `;
  tutorialModalContent.querySelector('#tutorialBackBtn')?.addEventListener('click', () => {
    tutorialFlowState.stepIndex = Math.max(0, tutorialFlowState.stepIndex - 1);
    renderTutorialModal();
  });
  tutorialModalContent.querySelector('#tutorialSkipBtn')?.addEventListener('click', () => finishTutorialFlow('skipped'));
  tutorialModalContent.querySelector('#tutorialNextBtn')?.addEventListener('click', () => {
    if (isLast) {
      finishTutorialFlow('completed');
      return;
    }
    tutorialFlowState.stepIndex += 1;
    renderTutorialModal();
  });
}

async function finishTutorialFlow(action) {
  if (serverSync.enabled && currentAuthenticatedUsername) {
    try {
      await fetch('/api/tutorial/complete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
    } catch (error) {
      console.warn('Tutorial completion could not be saved', error);
    }
  }
  tutorialFlowState.shouldPrompt = false;
  closeOverlayModal('tutorialModal');
}

async function checkTutorialStatus() {
  if (!serverSync.enabled || !currentAuthenticatedUsername || currentRole() === 'Viewer') return false;
  if (tutorialCheckPromise) return tutorialCheckPromise;
  tutorialCheckPromise = (async () => {
    try {
      const response = await fetch('/api/tutorial/status', { credentials: 'include' });
      const payload = await response.json();
      tutorialFlowState.shouldPrompt = Boolean(payload.shouldShowTutorial);
      shouldForcePasswordChange = Boolean(payload.shouldForcePasswordChange || serverSync.session?.mustChangePassword);
      tutorialFlowState.started = false;
      tutorialFlowState.stepIndex = -1;
      tutorialFlowState.steps = getTutorialSteps();
      if (tutorialFlowState.shouldPrompt) {
        renderTutorialModal();
        openOverlayModal('tutorialModal');
      }
      return tutorialFlowState.shouldPrompt;
    } catch (error) {
      console.warn('Tutorial status could not be loaded', error);
      return false;
    } finally {
      tutorialCheckPromise = null;
    }
  })();
  return tutorialCheckPromise;
}

function sanitizeCampaignMeta(meta) {
  const source = meta && typeof meta === 'object' ? meta : {};
  const blockedKeys = new Set([
    'arcgisCompact',
    'arcgisRaw',
    'hyperlanes',
    'grid',
    'regions',
    'sectors',
    'mapAnalysis',
    'routeCache',
    'tacticalRouteCache',
    'searchState',
    'layerState',
    'viewState',
    'zoom',
    'panX',
    'panY',
    'viewMode',
    'ui',
    'animationState',
    'renderCache',
    'indexCache',
    'domCache'
  ]);
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !blockedKeys.has(key))
  );
}

function makeServerCampaignPayload(nextState) {
  const payload = {
    planets: Array.isArray(nextState?.planets) ? nextState.planets : [],
    fleets: Array.isArray(nextState?.fleets) ? nextState.fleets : [],
    ships: Array.isArray(nextState?.ships) ? nextState.ships : [],
    buildJobs: Array.isArray(nextState?.buildJobs) ? nextState.buildJobs : [],
    fleetMotions: Array.isArray(nextState?.fleetMotions) ? nextState.fleetMotions : [],
    resources: nextState?.resources && typeof nextState.resources === 'object' ? nextState.resources : {},
    planetResources: nextState?.planetResources && typeof nextState.planetResources === 'object' ? nextState.planetResources : {},
    lastResourceTickAt: Number(nextState?.lastResourceTickAt) || Date.now(),
    importWarnings: Array.isArray(nextState?.importWarnings) ? nextState.importWarnings : [],
    meta: sanitizeCampaignMeta(nextState?.meta)
  };
  return JSON.parse(JSON.stringify(payload));
}

function triggerOwnerChangeEffects(previousOwners) {
  if (!(previousOwners instanceof Map) || !previousOwners.size) return;
  state.planets.forEach((planet) => {
    const previousOwner = previousOwners.get(planet.id);
    if (previousOwner === 'KUS' && planet.owner === 'GAR') {
      const display = getPlanetDisplayPosition(planet);
      triggerGarVictoryCelebration(display.x, display.y);
    }
  });
}

function schedulePostBootstrapMapWork() {
  warmDeferredCampaignAssets();
  syncWorldSizeToMap();
  window.setTimeout(() => {
    if ((state.meta?.positionCalibrationVersion ?? 0) < POSITION_CALIBRATION_VERSION) {
      applyPositionCalibration(false);
    }
    if ((state.meta?.arcgisImportVersion ?? 0) < ARCGIS_IMPORT_VERSION) {
      applyArcgisPlanetImport(false);
    }
  }, 0);
  if (mapEl.complete) {
    window.setTimeout(() => {
      initMapAnalysis();
      scheduleDeferredFullRender(20);
    }, 0);
    return;
  }
  mapEl.addEventListener('load', () => {
    syncWorldSizeToMap();
    window.setTimeout(() => {
      initMapAnalysis();
      scheduleDeferredFullRender(20);
    }, 0);
  }, { once: true });
}

function applyServerCampaign(campaign, revision = serverRevision, options = {}) {
  if (!campaign || typeof campaign !== 'object') return;
  const previousOwners = new Map((state?.planets || []).map((planet) => [planet.id, planet.owner]));
  if (options.updatedAt) {
    const updatedAtMs = new Date(options.updatedAt).getTime();
    if (Number.isFinite(updatedAtMs) && updatedAtMs > 0) {
      serverSync.clockOffsetMs = Date.now() - updatedAtMs;
    }
  }
  applyingRemoteState = true;
  serverSync.isApplyingRemoteState = true;
  try {
    state = JSON.parse(JSON.stringify({
      ...DEFAULT_DATA,
      ...campaign,
      authUsers: Array.isArray(campaign.authUsers) ? campaign.authUsers : []
    }));
    normalizeCampaignState();
    rebuildIndexes();
    syncFleetTravelStateFromCampaign();
    renderBaseThenDeferHeavy();
    schedulePostBootstrapMapWork();
    if (options.playOwnerEffects) triggerOwnerChangeEffects(previousOwners);
    serverRevision = Number(revision || 0);
    serverSync.revision = serverRevision;
  } finally {
    applyingRemoteState = false;
    serverSync.isApplyingRemoteState = false;
  }
}

function syncAuthUsersFromCampaign(campaign) {
  if (!campaign || typeof campaign !== 'object') return;
  if (!Array.isArray(campaign.authUsers)) return;
  state.authUsers = campaign.authUsers
    .map((user) => ({
      id: user.id || `auth_${Math.random().toString(36).slice(2, 10)}`,
      username: String(user.username || '').trim(),
      password: String(user.password || ''),
      role: LOGIN_ROLES.includes(user.role) ? user.role : 'Viewer',
      canCoordinate4thFleet: Boolean(user.canCoordinate4thFleet),
      mustChangePassword: Boolean(user.mustChangePassword),
      senatePosition: SENATE_POSITIONS.includes(user.senatePosition) ? user.senatePosition : ''
    }))
    .filter((user) => user.username);
  if (activeMainTab === 'loginManager' && canManageLogins()) renderLoginManagerView();
}

function clearServerReconnectTimer() {
  if (!serverSync.reconnectTimer) return;
  window.clearTimeout(serverSync.reconnectTimer);
  serverSync.reconnectTimer = null;
}

function clearServerRefreshTimer() {
  if (!serverSync.refreshTimer) return;
  window.clearTimeout(serverSync.refreshTimer);
  serverSync.refreshTimer = null;
}

function updateServerSession(me) {
  if (!me) return;
  const incomingUsername = String(me.username || '').trim();
  const incomingRole = String(me.role || 'Viewer').trim() || 'Viewer';
  const hadAuthenticatedSession = Boolean(currentAuthenticatedUsername);
  const incomingIsAnonymousViewer = !incomingUsername && incomingRole === 'Viewer';
  if (hadAuthenticatedSession && incomingIsAnonymousViewer && !viewerModeActive && !pendingLoginAttempt) {
    console.warn('Ignoring anonymous session downgrade during live refresh.');
    return;
  }
  serverSync.session = me;
  shouldForcePasswordChange = Boolean(me.mustChangePassword);
  currentAuthenticatedUsername = incomingUsername;
  if (currentAuthenticatedUsername) viewerModeActive = false;
  roleSelect.value = incomingRole;
  refreshRoleChrome();
  if (currentAuthenticatedUsername) hideLoginModal();
  else if (!viewerModeActive && !pendingLoginAttempt) showLoginModal();
}

function destroyServerSocketConnection() {
  if (!serverSync.socket) return;
  serverSync.socket.removeAllListeners();
  serverSync.socket.disconnect();
  serverSync.socket = null;
}

function disableLiveSync(reason) {
  destroyServerSocketConnection();
  clearServerReconnectTimer();
  clearServerRefreshTimer();
  serverSync.offlineMode = true;
  setStatus(reason || 'Server nicht erreichbar. Lokaler Offline-Modus aktiv.');
}

function scheduleSocketReconnect(reason) {
  if (!serverSync.enabled || serverSync.offlineMode || serverSync.reconnectTimer) return;
  const delay = Math.min(15000, 1000 * (2 ** Math.min(serverSync.reconnectAttempt, 4)));
  serverSync.reconnectAttempt += 1;
  setStatus(`${reason || 'Live-Sync getrennt.'} Neuer Verbindungsversuch in ${(delay / 1000).toFixed(delay >= 10000 ? 0 : 1)}s.`);
  serverSync.reconnectTimer = window.setTimeout(() => {
    serverSync.reconnectTimer = null;
    connectServerSocket();
  }, delay);
}

async function refreshCampaignFromServer() {
  if (!serverSync.enabled || serverSync.refreshInFlight) return;
  if (serverSync.syncInFlight || serverSync.syncQueued || isRendering) {
    scheduleCampaignRefresh(1200);
    return;
  }
  serverSync.refreshInFlight = true;
  try {
    const endpoint = serverSync.transport === 'polling' ? '/api/sync/status' : '/api/bootstrap';
    const response = await fetch(endpoint, { credentials: 'include' });
    if (!response.ok) throw new Error(`sync failed (${response.status})`);
    const payload = await response.json();
    serverSync.offlineMode = false;
    updateServerSession(payload.me || { id: null, username: '', role: 'Viewer' });
    if (payload?.serverNowMs) {
      const serverNowMs = Number(payload.serverNowMs);
      if (Number.isFinite(serverNowMs) && serverNowMs > 0) {
        serverSync.clockOffsetMs = Date.now() - serverNowMs;
      }
    }
    const nextRevision = Number(payload.revision || 0);
    if (serverSync.transport === 'polling' && !(nextRevision > serverRevision)) {
      return;
    }
    if (nextRevision > serverRevision) {
      const bootstrapPayload = serverSync.transport === 'polling'
        ? await (async () => {
          const bootstrapResponse = await fetch('/api/bootstrap', { credentials: 'include' });
          if (!bootstrapResponse.ok) throw new Error(`bootstrap failed (${bootstrapResponse.status})`);
          return bootstrapResponse.json();
        })()
        : payload;
      applyServerCampaign(
        bootstrapPayload.campaign || DEFAULT_DATA,
        nextRevision,
        { playOwnerEffects: true, updatedAt: bootstrapPayload.updatedAt }
      );
      updateServerSession(bootstrapPayload.me || payload.me || { id: null, username: '', role: 'Viewer' });
    } else if (payload.campaign) {
      syncAuthUsersFromCampaign(payload.campaign);
    }
  } catch (error) {
    console.warn('Server refresh failed', error);
    if (serverSync.transport === 'socket') scheduleSocketReconnect('Live-Sync Aktualisierung fehlgeschlagen.');
    else schedulePollingRefresh(12000);
  } finally {
    serverSync.refreshInFlight = false;
  }
}

function scheduleCampaignRefresh(delay = 250) {
  if (!serverSync.enabled || serverSync.offlineMode) return;
  clearServerRefreshTimer();
  serverSync.refreshTimer = window.setTimeout(() => {
    serverSync.refreshTimer = null;
    refreshCampaignFromServer();
  }, delay);
}

function schedulePollingRefresh(delay) {
  if (!serverSync.enabled) return;
  const normalizedDelay = Math.max(8000, Number(delay) || 20000);
  clearServerRefreshTimer();
  serverSync.refreshTimer = window.setTimeout(async () => {
    serverSync.refreshTimer = null;
    await refreshCampaignFromServer();
    schedulePollingRefresh(document.hidden ? 45000 : 20000);
  }, normalizedDelay);
}

function emitLiveSocketEvent(eventName, payload) {
  if (!serverSync.socket?.connected) return;
  if (!serverSync.session?.role || serverSync.session.role === 'Viewer') return;
  serverSync.socket.emit(eventName, payload);
}

function getBootStatusText() {
  if (bootLoadState.mode === 'economy') {
    if (!bootLoadState.tasks.economyReady) return 'LADE WIRTSCHAFT UND BÖRSE';
    return 'WIRTSCHAFT ONLINE';
  }
  if (!bootLoadState.tasks.domReady) return 'INITIALISIERE SYSTEME';
  if (!bootLoadState.tasks.mapImageReady) return 'LADE GALAXIEKARTE';
  if (!bootLoadState.tasks.campaignReady) return 'SYNCHRONISIERE KAMPAGNENDATEN';
  if (!bootLoadState.tasks.authReady) return 'PRÜFE ZUGANGSDATEN';
  return 'SYSTEME ONLINE';
}

function setBootProgress(progress, statusText = getBootStatusText()) {
  bootLoadState.progress = Math.max(0, Math.min(100, Number(progress) || 0));
  if (bootProgressFill) bootProgressFill.style.width = `${bootLoadState.progress}%`;
  if (bootProgressText) bootProgressText.textContent = `${Math.round(bootLoadState.progress)}%`;
  if (bootStatusLabel) bootStatusLabel.textContent = statusText;
}

const RESTART_VERIFICATION_SPLASH_DURATION_MS = 20000;
let restartVerificationSplashTimer = 0;

function showRestartVerificationSplash() {
  if (!restartVerificationSplash) return;
  if (restartVerificationSplashTimer) {
    window.clearTimeout(restartVerificationSplashTimer);
    restartVerificationSplashTimer = 0;
  }
  restartVerificationSplash.classList.remove('hidden');
  restartVerificationSplash.classList.add('visible');
  restartVerificationSplash.setAttribute('aria-hidden', 'false');
  restartVerificationSplashTimer = window.setTimeout(() => {
    restartVerificationSplash.classList.remove('visible');
    restartVerificationSplash.classList.add('hidden');
    restartVerificationSplash.setAttribute('aria-hidden', 'true');
  }, RESTART_VERIFICATION_SPLASH_DURATION_MS);
}

function finalizeBootScreen(statusText = 'SYSTEME ONLINE') {
  if (bootLoadState.hidden) return;
  bootLoadState.hidden = true;
  setBootProgress(100, statusText);
  if (bootLoadState.timer) {
    window.clearInterval(bootLoadState.timer);
    bootLoadState.timer = null;
  }
  if (bootLoadState.forceTimer) {
    window.clearTimeout(bootLoadState.forceTimer);
    bootLoadState.forceTimer = null;
  }
  bootScreen?.classList.add('fade-out');
  window.setTimeout(() => {
    bootScreen?.classList.remove('active');
    bootScreen?.setAttribute('aria-hidden', 'true');
  }, 420);
}

function maybeFinishBootScreen() {
  if (bootLoadState.hidden) return;
  const allReady = Object.values(bootLoadState.tasks).every(Boolean);
  if (!allReady) return;
  const elapsed = Date.now() - bootLoadState.startedAt;
  if (elapsed >= BOOT_MIN_DURATION_MS) {
    finalizeBootScreen();
  } else {
    window.setTimeout(() => finalizeBootScreen(), BOOT_MIN_DURATION_MS - elapsed);
  }
}

function markBootTask(taskKey, ready = true) {
  if (!(taskKey in bootLoadState.tasks)) return;
  bootLoadState.tasks[taskKey] = Boolean(ready);
  setBootProgress(bootLoadState.progress, getBootStatusText());
  maybeFinishBootScreen();
}

function resetBootSequenceState(mode = 'app') {
  if (bootLoadState.timer) {
    window.clearInterval(bootLoadState.timer);
    bootLoadState.timer = null;
  }
  if (bootLoadState.forceTimer) {
    window.clearTimeout(bootLoadState.forceTimer);
    bootLoadState.forceTimer = null;
  }
  bootLoadState.startedAt = Date.now();
  bootLoadState.progress = 0;
  bootLoadState.hidden = false;
  bootLoadState.mode = mode === 'economy' ? 'economy' : 'app';
  bootLoadState.tasks = {
    domReady: true,
    mapImageReady: mapImageLoaded || Boolean(mapEl?.complete),
    campaignReady: bootLoadState.mode === 'economy',
    authReady: bootLoadState.mode === 'economy',
    economyReady: bootLoadState.mode !== 'economy'
  };
  bootScreen?.classList.remove('fade-out');
  bootScreen?.classList.add('active');
  bootScreen?.setAttribute('aria-hidden', 'false');
}

function startBootSequence(mode = 'app') {
  showRestartVerificationSplash();
  resetBootSequenceState(mode);
  setBootProgress(4, getBootStatusText());
  bootLoadState.timer = window.setInterval(() => {
    if (bootLoadState.hidden) return;
    const target = Object.values(bootLoadState.tasks).every(Boolean) ? 100 : 90;
    if (bootLoadState.progress < target) {
      const delta = Math.max(1, Math.round((target - bootLoadState.progress) * 0.08));
      setBootProgress(Math.min(target, bootLoadState.progress + delta));
    }
    maybeFinishBootScreen();
  }, 120);
  const maxDuration = bootLoadState.mode === 'economy' ? ECONOMY_BOOT_MAX_DURATION_MS : BOOT_MAX_DURATION_MS;
  bootLoadState.forceTimer = window.setTimeout(() => {
    if (bootLoadState.hidden) return;
    console.warn('Bootscreen still waiting for remaining tasks.');
    Object.keys(bootLoadState.tasks).forEach((taskKey) => {
      bootLoadState.tasks[taskKey] = true;
    });
    setBootProgress(Math.max(bootLoadState.progress, 96), 'SYSTEME ONLINE');
    maybeFinishBootScreen();
  }, maxDuration);
}

async function bootstrapFromServer() {
  if (!serverSync.enabled) return;
  try {
    const response = await fetch('/api/bootstrap', { credentials: 'include' });
    if (!response.ok) throw new Error(`bootstrap failed (${response.status})`);
    const payload = await response.json();
    serverSync.offlineMode = false;
    updateServerSession(payload.me || { id: null, username: '', role: 'Viewer' });
    const nextRevision = Number(payload.revision || 0);
    console.log('bootstrap received');
    if (!(nextRevision > 0 && nextRevision === serverRevision && state?.planets?.length)) {
      applyServerCampaign(payload.campaign || DEFAULT_DATA, nextRevision, { playOwnerEffects: false, updatedAt: payload.updatedAt });
    } else {
      syncAuthUsersFromCampaign(payload.campaign);
    }
    markBootTask('campaignReady', true);
    markBootTask('authReady', true);
    serverSyncReady = true;
    serverRevision = nextRevision;
    serverSync.revision = serverRevision;
    refreshRoleChrome();
    if (serverSync.transport === 'socket') {
      window.setTimeout(() => connectServerSocket(), 250);
    } else {
      schedulePollingRefresh(12000);
    }
    void checkTutorialStatus();
  } catch (error) {
    console.warn('Server bootstrap unavailable, falling back to local state', error);
    applyDefaultAnonymousRole();
    refreshRoleChrome();
    showLoginModal();
    disableLiveSync('Server-Bootstrap fehlgeschlagen. Lokaler Offline-Modus aktiv.');
    markBootTask('campaignReady', true);
    markBootTask('authReady', true);
    markBootTask('economyReady', true);
  }
}

function connectServerSocket() {
  if (
    !serverSync.enabled
    || serverSync.offlineMode
    || serverSync.transport !== 'socket'
    || typeof io === 'undefined'
    || serverSync.socket
  ) return;
  serverSync.socket = io({
    withCredentials: true,
    transports: ['polling', 'websocket'],
    reconnection: false,
    timeout: 2500
  });
  serverSync.socket.on('connect', () => {
    const wasReconnect = serverSync.reconnectAttempt > 0 || serverSync.offlineMode;
    serverSync.offlineMode = false;
    serverSync.reconnectAttempt = 0;
    clearServerReconnectTimer();
    if (wasReconnect) showRestartVerificationSplash();
    setStatus('Live-Sync mit Server verbunden.');
  });
  serverSync.socket.on('socket:ready', (payload) => {
    serverSync.offlineMode = false;
    serverSync.reconnectAttempt = 0;
    clearServerReconnectTimer();
    updateServerSession(payload?.me || { id: null, username: '', role: 'Viewer' });
    if (payload?.updatedAt) {
      const updatedAtMs = new Date(payload.updatedAt).getTime();
      if (Number.isFinite(updatedAtMs) && updatedAtMs > 0) serverSync.clockOffsetMs = Date.now() - updatedAtMs;
    }
    const nextRevision = Number(payload?.revision || 0);
    if (nextRevision > serverRevision) scheduleCampaignRefresh(120);
  });
  serverSync.socket.on('disconnect', (reason) => {
    destroyServerSocketConnection();
    scheduleSocketReconnect(`Live-Sync getrennt (${reason || 'unbekannt'}).`);
  });
  serverSync.socket.on('connect_error', (error) => {
    console.warn('socket connect error', error);
    destroyServerSocketConnection();
    serverSync.transport = 'polling';
    setStatus('Live-Sync wechselt in stabilen Abrufmodus.');
    schedulePollingRefresh(2500);
  });
  serverSync.socket.on('campaign:state-changed', (payload) => {
    if (payload?.serverNowMs) {
      const serverNowMs = Number(payload.serverNowMs);
      if (Number.isFinite(serverNowMs) && serverNowMs > 0) {
        serverSync.clockOffsetMs = Date.now() - serverNowMs;
      }
    } else if (payload?.updatedAt) {
      const updatedAtMs = new Date(payload.updatedAt).getTime();
      if (Number.isFinite(updatedAtMs) && updatedAtMs > 0) {
        serverSync.clockOffsetMs = Date.now() - updatedAtMs;
      }
    }
    const nextRevision = Number(payload?.revision || 0);
    if (!(nextRevision > serverRevision)) return;
    scheduleCampaignRefresh(160);
  });
  serverSync.socket.on('campaign:bulk-sync', (payload) => {
    if (!payload?.campaign) return;
    const nextRevision = Number(payload.revision || 0);
    if (nextRevision > 0 && nextRevision <= serverRevision) return;
    applyServerCampaign(payload.campaign, nextRevision, { playOwnerEffects: true, updatedAt: payload.updatedAt });
    if (payload.me) updateServerSession(payload.me);
  });
  serverSync.socket.on('fx:fleet-jump-start', (payload) => {
    if (!payload?.motion?.fleetId) return;
    if (payload?.serverNowMs) {
      const serverNowMs = Number(payload.serverNowMs);
      if (Number.isFinite(serverNowMs) && serverNowMs > 0) {
        serverSync.clockOffsetMs = Date.now() - serverNowMs;
      }
    } else if (payload?.motion?.serverNowMs) {
      const serverNowMs = Number(payload.motion.serverNowMs);
      if (Number.isFinite(serverNowMs) && serverNowMs > 0) {
        serverSync.clockOffsetMs = Date.now() - serverNowMs;
      }
    }
    const adjustedMotion = normalizeMotionTimingForClient(payload.motion);
    const existing = fleetTravelState.get(adjustedMotion.fleetId);
    const isDuplicate = Boolean(existing
      && existing.sourcePlanetId === adjustedMotion.sourcePlanetId
      && existing.targetPlanetId === adjustedMotion.targetPlanetId
      && Math.abs(Number(existing.startedAtMs || 0) - Number(adjustedMotion.startedAtMs || 0)) < 250
      && Math.abs(Number(existing.durationMs || 0) - Number(adjustedMotion.durationMs || 0)) < 250);
    upsertFleetMotionRecord(adjustedMotion);
    beginFleetTravelFromMotion(adjustedMotion, { persistMotion: false, playStartAudio: !isDuplicate });
  });
  serverSync.socket.on('fx:fleet-jump-finish', (payload) => {
    if (!payload?.fleetId) return;
    playAudioCue(hyperspaceFinishAudio);
  });
  serverSync.socket.on('fx:fleet-delete', (payload) => {
    const fleet = fleetIndex.get(payload?.fleetId);
    if (!fleet) return;
    const display = getFleetDisplayPosition(fleet);
    playAudioCue(fleetDeleteAudio);
    spawnFleetExplosion(display.x, display.y);
  });
  serverSync.socket.on('fx:ship-redeploy', (payload) => {
    const ship = state.ships.find((entry) => entry.id === payload?.shipId);
    const sourceFleet = fleetIndex.get(payload?.sourceFleetId);
    const targetFleet = fleetIndex.get(payload?.targetFleetId);
    if (!ship || !sourceFleet || !targetFleet) return;
    playShipTransferFx(ship, sourceFleet, targetFleet);
  });
}

function queueCampaignSync() {
  if (!serverSync.enabled || applyingRemoteState || serverSync.isApplyingRemoteState || !serverSyncReady) return;
  if (!serverSync.session?.role || serverSync.session.role === 'Viewer') return;
  if (saveSyncTimer) window.clearTimeout(saveSyncTimer);
  if (isRendering) {
    serverSync.syncQueued = true;
    saveSyncTimer = window.setTimeout(() => {
      saveSyncTimer = null;
      pushCampaignStateToServer();
    }, 1200);
    return;
  }
  if (serverSync.syncInFlight) {
    serverSync.syncQueued = true;
    return;
  }
  serverSync.syncQueued = true;
  saveSyncTimer = window.setTimeout(() => {
    saveSyncTimer = null;
    pushCampaignStateToServer();
  }, 1000);
}

async function pushCampaignStateToServer() {
  if (!serverSync.enabled || serverSync.syncInFlight) return;
  if (applyingRemoteState || serverSync.isApplyingRemoteState) {
    serverSync.syncQueued = false;
    return;
  }
  if (isRendering || !serverSyncReady) {
    serverSync.syncQueued = true;
    if (!saveSyncTimer) {
      saveSyncTimer = window.setTimeout(() => {
        saveSyncTimer = null;
        pushCampaignStateToServer();
      }, 1000);
    }
    return;
  }
  if (!serverSync.session?.role || serverSync.session.role === 'Viewer') return;
  const campaignPayload = makeServerCampaignPayload(state);
  const kb = Math.round(JSON.stringify(campaignPayload).length / 1024);
  console.log('server sync payload KB', kb);
  console.log('server sync PUT');
  serverSync.syncQueued = false;
  serverSync.syncInFlight = true;
  try {
    const response = await fetch('/api/campaign/state', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedRevision: serverRevision,
        campaign: campaignPayload
      })
    });
    const responsePayload = await response.json();
    if (!response.ok) {
      if (response.status === 409) {
        await bootstrapFromServer();
      }
      throw new Error(responsePayload.error || `sync failed (${response.status})`);
    }
    serverRevision = Number(responsePayload.revision || serverRevision);
    serverSync.revision = serverRevision;
  } catch (error) {
    console.warn('Campaign sync failed', error);
    setStatus(`Server-Sync fehlgeschlagen: ${error.message}`);
  } finally {
    serverSync.syncInFlight = false;
    if (serverSync.syncQueued) queueCampaignSync();
  }
}

