// Generated from app-shell.js: foundational helpers, map math, positioning, analysis

function createEmptyFactionResources() {
  return Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0]));
}

function normalizeFleetShipAssignments() {
  state.fleets.forEach((fleet) => {
    fleet.shipIds = [];
  });
  state.ships.forEach((ship) => {
    if (isStationClass(ship.classId)) {
      ship.assignedFleetId = '';
      return;
    }
    if (!ship.assignedFleetId) return;
    const fleet = state.fleets.find((entry) => entry.id === ship.assignedFleetId);
    if (!fleet) {
      ship.assignedFleetId = '';
      return;
    }
    fleet.shipIds.push(ship.id);
  });
}

function ensureFleetCategoriesStore() {
  state.meta = state.meta || {};
  if (!Array.isArray(state.meta.fleetCategories)) state.meta.fleetCategories = [];
  return state.meta.fleetCategories;
}

function ensureSectorStore() {
  state.meta = state.meta || {};
  if (!Array.isArray(state.meta.manualSectors)) state.meta.manualSectors = [];
  return state.meta.manualSectors;
}

function ensureWarehouseStore() {
  state.meta = state.meta || {};
  if (!Array.isArray(state.meta.planetWarehouses)) state.meta.planetWarehouses = [];
  return state.meta.planetWarehouses;
}

function createBuildJobRecord(data = {}) {
  return {
    id: data.id || `build_${Math.random().toString(36).slice(2, 10)}`,
    jobType: data.jobType || 'ship',
    classId: data.classId,
    shipName: data.shipName || '',
    projectName: data.projectName || '',
    buildLocationPlanetId: data.buildLocationPlanetId || '',
    targetSlotIndex: Number.isInteger(data.targetSlotIndex) ? data.targetSlotIndex : -1,
    resourceKey: data.resourceKey || '',
    buildingKey: data.buildingKey || data.resourceKey || '',
    sourceSectorId: String(data.sourceSectorId || '').trim(),
    targetSectorId: String(data.targetSectorId || '').trim(),
    amount: Math.max(0, Number(data.amount || 0)),
    startedAt: data.startedAt || Date.now(),
    finishesAt: data.finishesAt || Date.now(),
    faction: data.faction || 'GAR',
    status: data.status || 'building',
    producedShipId: data.producedShipId || '',
    completedAt: Number(data.completedAt || 0) || 0
  };
}

function createManualSectorRecord(data = {}) {
  const points = Array.isArray(data.points)
    ? data.points
      .map((point) => ({
        x: clamp(Number(point?.x) || 0, 0, WORLD_SIZE),
        y: clamp(Number(point?.y) || 0, 0, WORLD_SIZE)
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    : [];
  return {
    id: data.id || `sector_${Math.random().toString(36).slice(2, 10)}`,
    name: String(data.name || 'Neuer Sektor').trim() || 'Neuer Sektor',
    description: String(data.description || '').trim(),
    points
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function createFleetCategoryRecord(data = {}) {
  return {
    id: data.id || `fleetcat_${Math.random().toString(36).slice(2, 10)}`,
    name: String(data.name || 'Neue Kategorie').trim() || 'Neue Kategorie',
    faction: data.faction === 'KUS' ? 'KUS' : 'GAR'
  };
}

function ensureFleetCardOrderStore() {
  state.meta = state.meta || {};
  if (!state.meta.fleetCardOrder || typeof state.meta.fleetCardOrder !== 'object' || Array.isArray(state.meta.fleetCardOrder)) state.meta.fleetCardOrder = {};
  return state.meta.fleetCardOrder;
}

function getFleetOrderBucketKey(fleet, categoryId = fleet?.categoryId || '') {
  const faction = fleet?.faction === 'KUS' ? 'KUS' : 'GAR';
  return categoryId ? `category:${categoryId}` : `ungrouped:${faction}`;
}

function getFleetOrderList(bucketKey) {
  const store = ensureFleetCardOrderStore();
  if (!Array.isArray(store[bucketKey])) store[bucketKey] = [];
  return store[bucketKey];
}

function syncFleetIntoOrderBucket(fleet, bucketKey = getFleetOrderBucketKey(fleet)) {
  if (!fleet?.id) return;
  const list = getFleetOrderList(bucketKey);
  if (!list.includes(fleet.id)) list.push(fleet.id);
}

function removeFleetFromOrderBuckets(fleetId) {
  const store = ensureFleetCardOrderStore();
  Object.keys(store).forEach((bucketKey) => {
    store[bucketKey] = getFleetOrderList(bucketKey).filter((entry) => entry !== fleetId);
  });
}

function sortFleetsForBucket(fleets, bucketKey) {
  const order = getFleetOrderList(bucketKey);
  fleets.forEach((fleet) => syncFleetIntoOrderBucket(fleet, bucketKey));
  return [...fleets].sort((a, b) => {
    const aIndex = order.indexOf(a.id);
    const bIndex = order.indexOf(b.id);
    if (aIndex >= 0 && bIndex >= 0 && aIndex !== bIndex) return aIndex - bIndex;
    if (aIndex >= 0 && bIndex < 0) return -1;
    if (bIndex >= 0 && aIndex < 0) return 1;
    return a.name.localeCompare(b.name, 'de');
  });
}

function reorderFleetWithinBucket(fleetId, targetFleetId, bucketKey, placeAfter = false) {
  if (!fleetId || !targetFleetId || fleetId === targetFleetId || !bucketKey) return;
  const list = getFleetOrderList(bucketKey);
  const fromIndex = list.indexOf(fleetId);
  const toIndex = list.indexOf(targetFleetId);
  if (fromIndex < 0 || toIndex < 0) return;
  const [moved] = list.splice(fromIndex, 1);
  let nextIndex = toIndex > fromIndex ? toIndex - 1 : toIndex;
  if (placeAfter) nextIndex += 1;
  nextIndex = clamp(nextIndex, 0, list.length);
  list.splice(nextIndex, 0, moved);
}

function normalizeFleetCategories() {
  const categories = ensureFleetCategoriesStore()
    .map((category) => createFleetCategoryRecord(category))
    .filter((category, index, array) => category.id && array.findIndex((entry) => entry.id === category.id) === index);
  state.meta.fleetCategories = categories;
  ensureFleetCardOrderStore();
  const validCategoryIds = new Set(categories.map((category) => category.id));
  state.fleets.forEach((fleet) => {
    fleet.categoryId = validCategoryIds.has(fleet.categoryId) ? fleet.categoryId : '';
    syncFleetIntoOrderBucket(fleet);
  });
}

function ensureMapMarkerStore() {
  state.meta = state.meta || {};
  if (!Array.isArray(state.meta.mapMarkers)) state.meta.mapMarkers = [];
  return state.meta.mapMarkers;
}

function createMapMarkerRecord(data = {}) {
  return {
    id: data.id || `marker_${Math.random().toString(36).slice(2, 10)}`,
    name: String(data.name || 'Marker').trim() || 'Marker',
    description: String(data.description || '').trim(),
    color: MARKER_COLORS.includes(data.color) ? data.color : '#ffd54d',
    x: clamp(Number(data.x) || (WORLD_SIZE / 2), 0, WORLD_SIZE),
    y: clamp(Number(data.y) || (WORLD_SIZE / 2), 0, WORLD_SIZE)
  };
}

function createCustomPlanetRecord(data = {}) {
  return {
    id: data.id || `custom_planet_${Math.random().toString(36).slice(2, 10)}`,
    name: String(data.name || 'Inoffizieller Planet').trim() || 'Inoffizieller Planet',
    grid: String(data.grid || '').trim(),
    sector: String(data.sector || '').trim(),
    region: String(data.region || '').trim(),
    x: clamp(Number(data.x) || (WORLD_SIZE / 2), 0, WORLD_SIZE),
    y: clamp(Number(data.y) || (WORLD_SIZE / 2), 0, WORLD_SIZE),
    owner: ['GAR', 'KUS', 'HUTT', 'NEUTRAL'].includes(data.owner) ? data.owner : 'NEUTRAL',
    wiki: String(data.wiki || '').trim(),
    description: String(data.description || '').trim(),
    referenceListed: false,
    isUnofficial: true,
    activeBattle: Boolean(data.activeBattle),
    isCoreWorld: Boolean(data.isCoreWorld)
  };
}

function normalizeCampaignState() {
  state.resources = state.resources || {};
  RESOURCE_FACTIONS.forEach((faction) => {
    state.resources[faction] = { ...createEmptyFactionResources(), ...(state.resources[faction] || {}) };
  });
  state.planetResources = Object.fromEntries(
    Object.entries(state.planetResources || {}).map(([planetId, slots]) => [
      planetId,
      Array.isArray(slots)
        ? slots.slice(0, 10).map((slot) => (INFRASTRUCTURE_KEYS.includes(slot) ? slot : ''))
        : []
    ])
  );
  state.ships = Array.isArray(state.ships) ? state.ships : [];
  state.buildJobs = Array.isArray(state.buildJobs) ? state.buildJobs.map((job) => createBuildJobRecord(job)) : [];
  state.fleetMotions = Array.isArray(state.fleetMotions) ? state.fleetMotions : [];
  state.importWarnings = Array.isArray(state.importWarnings) ? state.importWarnings : [];
  state.authUsers = Array.isArray(state.authUsers) ? state.authUsers : [];
  state.lastResourceTickAt = Number(state.lastResourceTickAt) || Date.now();
  state.meta = state.meta || {};
  if (state.meta.resourceResetVersion !== RESOURCE_RESET_VERSION) {
    RESOURCE_FACTIONS.forEach((faction) => {
      state.resources[faction] = createEmptyFactionResources();
    });
    state.lastResourceTickAt = Date.now();
    state.meta.resourceResetVersion = RESOURCE_RESET_VERSION;
  }
  state.meta.mapMarkers = ensureMapMarkerStore().map((marker) => createMapMarkerRecord(marker));
  state.meta.manualSectors = ensureSectorStore()
    .map((sector) => createManualSectorRecord(sector))
    .filter((sector) => sector.points.length >= 3);
  state.meta.planetWarehouses = ensureWarehouseStore()
    .map((warehouse) => createWarehouseRecord(warehouse))
    .filter((warehouse) => warehouse.planetId && Number.isInteger(warehouse.slotIndex));
  state.meta.customRoutes = ensureCustomRouteStore()
    .map((route, index) => ({
      id: String(route?.id || `custom_route_${index + 1}`),
      name: String(route?.name || '').trim() || `Neue Route ${index + 1}`,
      ...(route?.canonicalName ? { canonicalName: String(route.canonicalName) } : {}),
      connections: (Array.isArray(route?.connections) ? route.connections : [])
        .map(normalizeRouteConnection)
        .filter(Boolean)
        .map(serializeRouteConnection)
    }))
    .filter((route) => route.connections.length);
  state.fleets = Array.isArray(state.fleets) ? state.fleets : [];
  state.fleets.forEach((fleet) => {
    fleet.commander = fleet.commander || fleet.leader || '';
    fleet.assignment = String(fleet.assignment || '').trim();
    fleet.shipIds = Array.isArray(fleet.shipIds) ? fleet.shipIds : [];
    fleet.locationPlanetId = fleet.locationPlanetId || fleet.planetId || '';
    fleet.categoryId = String(fleet.categoryId || '');
  });
  state.ships = state.ships
    .map((ship) => ({
      id: ship.id || `ship_${Math.random().toString(36).slice(2, 10)}`,
      classId: ship.classId,
      name: ship.name || 'Unbenanntes Schiff',
      commander: ship.commander || '',
      faction: ship.faction || 'GAR',
      status: ship.status || 'active',
      locationPlanetId: ship.locationPlanetId || ship.planetId || '',
      assignedFleetId: isStationClass(ship.classId) ? '' : (ship.assignedFleetId || ''),
      canJump: typeof ship.canJump === 'boolean' ? ship.canJump : (SHIP_CLASS_POOL[ship.classId]?.canJump ?? true),
      createdFrom: ship.createdFrom || 'manual'
    }))
    .filter((ship) => ship.classId && SHIP_CLASS_POOL[ship.classId]);
  state.planets = (Array.isArray(state.planets) ? state.planets : []).map((planet) => ({
    ...planet,
    name: String(planet.name || '').trim() || 'Unbenannter Planet',
    grid: String(planet.grid || '').trim(),
    sector: String(planet.sector || '').trim(),
    region: String(planet.region || '').trim(),
    wiki: String(planet.wiki || '').trim(),
    description: String(planet.description || '').trim(),
    referenceListed: Boolean(planet.referenceListed),
    isUnofficial: Boolean(planet.isUnofficial),
    activeBattle: Boolean(planet.activeBattle),
    isCoreWorld: Boolean(planet.isCoreWorld)
  }));
  state.planets.forEach((planet) => {
    syncWarehouseStoreForPlanet(planet.id);
  });
  state.authUsers = state.authUsers
    .map((user) => ({
      id: user.id || `auth_${Math.random().toString(36).slice(2, 10)}`,
      username: String(user.username || '').trim(),
      password: String(user.password || ''),
      role: LOGIN_ROLES.includes(user.role) ? user.role : 'Viewer',
      canCoordinate4thFleet: Boolean(user.canCoordinate4thFleet),
      senatePosition: SENATE_POSITIONS.includes(user.senatePosition) ? user.senatePosition : ''
    }))
    .filter((user) => user.username);
  state.fleetMotions = state.fleetMotions
    .map((motion) => ({
      fleetId: String(motion?.fleetId || '').trim(),
      sourcePlanetId: String(motion?.sourcePlanetId || '').trim(),
      sourcePlanetName: String(motion?.sourcePlanetName || '').trim(),
      targetPlanetId: String(motion?.targetPlanetId || '').trim(),
      targetPlanetName: String(motion?.targetPlanetName || '').trim(),
      startedByUserId: motion?.startedByUserId || null,
      source: String(motion?.source || '').trim(),
      serverNowMs: Number(motion?.serverNowMs) || 0,
      startedAtMs: Number(motion?.startedAtMs) || Date.now(),
      durationMs: Math.max(1000, Number(motion?.durationMs) || 0)
    }))
    .filter((motion) => motion.fleetId && motion.sourcePlanetId && motion.targetPlanetId && motion.sourcePlanetId !== motion.targetPlanetId);
  normalizeFleetCategories();
  normalizeFleetShipAssignments();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isClusterZoomActive() {
  return Boolean(clusterZoomState);
}

function getZoomLimit() {
  return isClusterZoomActive() ? CLUSTER_MAX_ZOOM : MAX_ZOOM;
}

function logTacticalDebug(label, details) {
  if (!TACTICAL_DEBUG) return;
  console.groupCollapsed(`[TACTICAL] ${label}`);
  console.log(details);
  console.groupEnd();
}

function syncWorldSizeToMap() {
  const logicalWidth = WORLD_SIZE;
  const logicalHeight = WORLD_SIZE;
  tacticalSectionCanvasCache.clear();
  tacticalHoverAreas = { regions: [], sectors: [] };
  tacticalBaseReady = false;
  tacticalBuildQueued = false;
  tacticalBuildVersion += 1;
  dirtyInfluence = true;
  world.style.width = logicalWidth + 'px';
  world.style.height = logicalHeight + 'px';
  mapEl.style.width = logicalWidth + 'px';
  mapEl.style.height = logicalHeight + 'px';
  influenceCanvas.width = logicalWidth;
  influenceCanvas.height = logicalHeight;
  influenceCanvas.style.width = logicalWidth + 'px';
  influenceCanvas.style.height = logicalHeight + 'px';
  tacticalCanvas.width = logicalWidth;
  tacticalCanvas.height = logicalHeight;
  tacticalCanvas.style.width = logicalWidth + 'px';
  tacticalCanvas.style.height = logicalHeight + 'px';
  tacticalOverlay.setAttribute('viewBox', `0 0 ${logicalWidth} ${logicalHeight}`);
  tacticalOverlay.setAttribute('width', logicalWidth);
  tacticalOverlay.setAttribute('height', logicalHeight);
  overlay.setAttribute('viewBox', `0 0 ${logicalWidth} ${logicalHeight}`);
  overlay.setAttribute('width', logicalWidth);
  overlay.setAttribute('height', logicalHeight);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function parseGrid(grid) {
  const match = String(grid || '').trim().toUpperCase().match(/^([A-Z])(?:-?(\d+))$/);
  if (!match) return null;
  return { col: match[1], row: Number(match[2]) };
}

function stableHash(text) {
  let hash = 0;
  const value = String(text || '');
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function normalizePlanetKey(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function normalizeSearchText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function escapeRegExp(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compactGridName(grid) {
  return String(grid || '').replace(/-/g, '').trim();
}

function isPriorityWorld(planet) {
  if (!planet) return false;
  return CAMPAIGN_PRIORITY_PLANET_KEYS.has(normalizePlanetKey(planet.id || planet.name))
    || CAMPAIGN_PRIORITY_PLANET_KEYS.has(normalizePlanetKey(planet.name));
}

function getPlanetSearchAliases(planet) {
  if (!planet) return '';
  const aliases = [];
  const key = normalizePlanetKey(planet.id || planet.name);
  if (key === 'raxus') aliases.push('Raxus Secundus');
  if (key === 'coruscant' || key === 'imperial_center') aliases.push('Coruscant', 'Imperial Center');
  if (planet.id) aliases.push(String(planet.id).replace(/_/g, ' '));
  return aliases.join(' ');
}

function getPlanetSearchHaystack(planet) {
  if (!planet) return '';
  return normalizeSearchText([
    planet.name,
    planet.id,
    getPlanetSearchAliases(planet),
    planet.grid || '',
    planet.sector || '',
    planet.region || ''
  ].join(' '));
}

function planetMatchesExactSearch(planet, normalizedQuery) {
  if (!planet || !normalizedQuery) return false;
  const candidates = [
    planet.name,
    planet.id,
    ...String(getPlanetSearchAliases(planet) || '')
      .split(/\s{2,}|,\s*|;\s*/)
      .filter(Boolean)
  ];
  return candidates.some((entry) => normalizeSearchText(entry).trim() === normalizedQuery);
}

function resolvePlanetBySearchValue(value) {
  const normalizedValue = normalizeSearchText(value).trim();
  if (!normalizedValue) return null;
  return state.planets.find((planet) => planetMatchesExactSearch(planet, normalizedValue)) || null;
}

function planetHasPersistentMapNote(planet) {
  return Boolean(String(planet?.description || '').trim());
}

function planetIsListedInReference(planet) {
  return Boolean(planet?.referenceListed);
}

function planetHasAnchoredGameplayContent(planetId) {
  if (!planetId) return false;
  return state.fleets.some((fleet) => fleet?.planetId === planetId)
    || state.ships.some((ship) => ship?.locationPlanetId === planetId && ship?.status !== 'lost');
}

function shouldRevealPlanetTemporarily(planet) {
  if (!planet) return false;
  return activePlanetSearchHighlightId === planet.id
    || hoveredPlanetId === planet.id
    || (selected?.type === 'planet' && selected.id === planet.id)
    || isPlanetInsideHoveredSector(planet);
}

function shouldDisplayPlanetByDefault(planet) {
  if (!planet) return false;
  return isPriorityWorld(planet) || Boolean(planet.isCoreWorld);
}

function shouldRenderPlanetOnMap(planet) {
  return shouldDisplayPlanetByDefault(planet) || shouldRevealPlanetTemporarily(planet);
}

function getPlanetBattleRingClass(planet) {
  if (!planet?.activeBattle) return '';
  if (planet.owner === 'GAR') return ' battle-ring-kus';
  if (planet.owner === 'KUS') return ' battle-ring-gar';
  return ' battle-ring-neutral';
}

function getPlanetInfluenceFaction(planet) {
  if (!planet) return 'NEUTRAL';
  if (planet.activeBattle) {
    if (planet.owner === 'GAR') return 'KUS';
    if (planet.owner === 'KUS') return 'GAR';
  }
  return planet.owner || 'NEUTRAL';
}

function clampUiSoundVolume(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 75;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function saveUiSettingsPrefs() {
  try {
    localStorage.setItem(SETTINGS_SOUND_VOLUME_KEY, String(clampUiSoundVolume(uiSoundVolume)));
    localStorage.setItem(SETTINGS_ADMIN_MODE_KEY, adminModeEnabled ? '1' : '0');
  } catch (error) {
    console.warn('UI settings prefs could not be stored', error);
  }
}

function loadUiSettingsPrefs() {
  try {
    const storedVolume = localStorage.getItem(SETTINGS_SOUND_VOLUME_KEY);
    if (storedVolume != null) uiSoundVolume = clampUiSoundVolume(storedVolume);
    const storedAdminMode = localStorage.getItem(SETTINGS_ADMIN_MODE_KEY);
    if (storedAdminMode != null) adminModeEnabled = storedAdminMode !== '0';
  } catch (error) {
    console.warn('UI settings prefs could not be restored', error);
  }
}

function applyAudioMuteState() {
  [hyperspaceStartAudio, hyperspaceFinishAudio, garVictoryAudio, fleetDeleteAudio, datapadClickAudio, datapadAcceptAudio, datapadDeleteAudio]
    .forEach((audio) => {
      audio.muted = audioMuted || uiSoundVolume <= 0;
      audio.volume = clampUiSoundVolume(uiSoundVolume) / 100;
    });
  if (muteBtn) {
    muteBtn.textContent = audioMuted ? '🔇' : '🔊';
    muteBtn.title = audioMuted ? 'OGG-Sounds aktivieren' : 'OGG-Sounds stummschalten';
  }
}

function toggleAudioMute() {
  audioMuted = !audioMuted;
  applyAudioMuteState();
  saveClientUiPrefs();
  setStatus(audioMuted ? 'Clientseitige OGG-Sounds stummgeschaltet.' : 'Clientseitige OGG-Sounds aktiviert.');
}

function playAudioCue(audio) {
  if (audioMuted || uiSoundVolume <= 0) return;
  try {
    audio.currentTime = 0;
    audio.volume = clampUiSoundVolume(uiSoundVolume) / 100;
    const result = audio.play();
    if (result?.catch) result.catch(() => {});
  } catch (error) {
    // Ignore autoplay restrictions and continue the simulation.
  }
}

function distanceBetweenPoints(a, b) {
  return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));
}

function spawnFxParticle(x, y, options = {}) {
  const particle = document.createElement('div');
  particle.className = `fx-particle ${options.shape || (Math.random() > 0.5 ? 'triangle' : 'quad')}`;
  particle.style.left = `${x}px`;
  particle.style.top = `${y}px`;
  particle.style.width = `${options.size || 14}px`;
  particle.style.height = `${options.size || 14}px`;
  particle.style.background = options.color || '#fff';
  particle.style.opacity = String(options.opacity ?? 1);
  fxLayer.appendChild(particle);
  const dx = options.dx ?? ((Math.random() - 0.5) * 160);
  const dy = options.dy ?? ((Math.random() - 0.5) * 160);
  const rotate = options.rotate ?? ((Math.random() - 0.5) * 240);
  const scaleTo = options.scaleTo ?? 0.25;
  const duration = options.duration || 900;
  particle.animate([
    { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: options.opacity ?? 1 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scaleTo}) rotate(${rotate}deg)`, opacity: 0 }
  ], {
    duration,
    easing: options.easing || 'cubic-bezier(.17,.67,.3,1)',
    fill: 'forwards'
  }).finished.finally(() => particle.remove());
}

function spawnFxRing(x, y, options = {}) {
  const ring = document.createElement('div');
  ring.className = 'fx-ring';
  const size = options.size || 24;
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  ring.style.width = `${size}px`;
  ring.style.height = `${size}px`;
  ring.style.borderColor = options.color || 'rgba(255,255,255,.75)';
  fxLayer.appendChild(ring);
  ring.animate([
    { transform: 'translate(-50%, -50%) scale(0.35)', opacity: options.opacity ?? 1 },
    { transform: `translate(-50%, -50%) scale(${options.scaleTo || 4.2})`, opacity: 0 }
  ], {
    duration: options.duration || 850,
    easing: options.easing || 'ease-out',
    fill: 'forwards'
  }).finished.finally(() => ring.remove());
}

function spawnGarVictoryFirework(x, y) {
  const colors = ['#2cd66b', '#ff9d2f', '#4eb8ff'];
  spawnFxRing(x, y, { color: 'rgba(255,255,255,.45)', size: 20, scaleTo: 5.5, duration: 1000, opacity: 0.55 });
  for (let i = 0; i < 26; i += 1) {
    const angle = (Math.PI * 2 * i) / 26;
    const speed = 70 + Math.random() * 90;
    spawnFxParticle(x, y, {
      color: colors[i % colors.length],
      size: 10 + Math.random() * 8,
      shape: i % 2 ? 'triangle' : 'quad',
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      rotate: (Math.random() - 0.5) * 300,
      duration: 900 + Math.random() * 500,
      opacity: 0.62
    });
  }
}

function triggerGarVictoryCelebration(x, y) {
  playAudioCue(garVictoryAudio);
  for (let delay = 0; delay <= 12600; delay += 900) {
    setTimeout(() => {
      const offsetX = (Math.random() - 0.5) * 42;
      const offsetY = (Math.random() - 0.5) * 42;
      spawnGarVictoryFirework(x + offsetX, y + offsetY);
    }, delay);
  }
}

function spawnFleetExplosion(x, y) {
  const colors = ['#ffd86b', '#ff8f45', '#ff4d2f', '#7ad2ff'];
  spawnFxRing(x, y, { color: 'rgba(255,196,92,.95)', size: 18, scaleTo: 4.6, duration: 650 });
  for (let i = 0; i < 22; i += 1) {
    const angle = (Math.PI * 2 * i) / 22;
    const speed = 45 + Math.random() * 70;
    spawnFxParticle(x, y, {
      color: colors[i % colors.length],
      size: 8 + Math.random() * 10,
      shape: i % 3 === 0 ? 'quad' : 'triangle',
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      rotate: (Math.random() - 0.5) * 260,
      duration: 620 + Math.random() * 260,
      scaleTo: 0.18
    });
  }
}

function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distanceBetweenPoints(points[i - 1], points[i]);
  return total;
}

function samplePolylineAtDistance(points, distance) {
  if (!Array.isArray(points) || !points.length) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  let remaining = clamp(distance, 0, polylineLength(points));
  for (let i = 1; i < points.length; i += 1) {
    const start = points[i - 1];
    const end = points[i];
    const segmentLength = distanceBetweenPoints(start, end);
    if (segmentLength <= 1e-6) continue;
    if (remaining <= segmentLength) {
      const t = remaining / segmentLength;
      return {
        x: start.x + ((end.x - start.x) * t),
        y: start.y + ((end.y - start.y) * t)
      };
    }
    remaining -= segmentLength;
  }
  return points[points.length - 1];
}

function isFleetTraveling(fleetOrId) {
  const fleetId = typeof fleetOrId === 'string' ? fleetOrId : fleetOrId?.id;
  return fleetTravelState.has(fleetId);
}

function averagePoints(points) {
  if (!points.length) return { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 };
  const total = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: total.x / points.length, y: total.y / points.length };
}

function collectDisplayedPlanetPositions() {
  return state.planets.map((planet) => ({
    planet,
    position: getPlanetDisplayPosition(planet)
  }));
}

function findClusterZoomCandidate(x, y) {
  const displayedPlanets = collectDisplayedPlanetPositions();
  let anchor = null;
  let bestDistanceSq = CLUSTER_ACTIVATION_RADIUS * CLUSTER_ACTIVATION_RADIUS;
  displayedPlanets.forEach((entry) => {
    const dx = entry.position.x - x;
    const dy = entry.position.y - y;
    const distanceSq = (dx * dx) + (dy * dy);
    if (distanceSq <= bestDistanceSq) {
      bestDistanceSq = distanceSq;
      anchor = entry;
    }
  });
  if (!anchor) return null;
  const clusterEntries = displayedPlanets.filter((entry) => {
    const dx = entry.position.x - anchor.position.x;
    const dy = entry.position.y - anchor.position.y;
    return ((dx * dx) + (dy * dy)) <= (CLUSTER_PLANET_RADIUS * CLUSTER_PLANET_RADIUS);
  });
  if (clusterEntries.length < CLUSTER_MIN_PLANETS) return null;
  const center = averagePoints(clusterEntries.map((entry) => entry.position));
  const maxRadius = clusterEntries.reduce((radius, entry) => {
    const distance = Math.hypot(entry.position.x - center.x, entry.position.y - center.y);
    return Math.max(radius, distance);
  }, 0);
  return {
    id: `cluster__${anchor.planet.id}`,
    anchorPlanetId: anchor.planet.id,
    planetIds: clusterEntries.map((entry) => entry.planet.id),
    planetIdSet: new Set(clusterEntries.map((entry) => entry.planet.id)),
    count: clusterEntries.length,
    center,
    radius: Math.max(CLUSTER_PLANET_RADIUS, maxRadius + 28)
  };
}

function setClusterZoomState(nextState) {
  const prevActive = isClusterZoomActive();
  clusterZoomState = nextState || null;
  const nextActive = isClusterZoomActive();
  document.getElementById('app').classList.toggle('cluster-zoom', nextActive);
  if (prevActive !== nextActive) {
    markDirty({ positions: true, layers: true });
  }
}

function describeViewStatus() {
  const clusterText = isClusterZoomActive() && clusterZoomState
    ? ` • Cluster-Zoom ${clusterZoomState.count} Planeten`
    : '';
  return `Ansicht: Zoom ${zoom.toFixed(2)} • Pan ${Math.round(panX)}, ${Math.round(panY)}${clusterText}`;
}

function getClusterZoomProgress() {
  if (!isClusterZoomActive()) return 0;
  return clamp((zoom - MAX_ZOOM) / Math.max(0.001, CLUSTER_MAX_ZOOM - MAX_ZOOM), 0, 1);
}

function getClusterExpandedPoint(point) {
  if (!isClusterZoomActive() || !point) return point;
  const progress = getClusterZoomProgress();
  if (progress <= 0) return point;
  const center = clusterZoomState.center;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const distance = Math.hypot(dx, dy);
  const influenceRadius = clusterZoomState.radius * 1.9;
  if (distance > influenceRadius) return point;
  const falloff = Math.pow(Math.max(0, 1 - (distance / influenceRadius)), 1.15);
  const expansion = 1 + (progress * 2.8 * falloff);
  return {
    x: clamp(center.x + dx * expansion, 0, WORLD_SIZE),
    y: clamp(center.y + dy * expansion, 0, WORLD_SIZE)
  };
}

function isPlanetVisibleInClusterZoom(planet) {
  if (!isClusterZoomActive()) return true;
  if (!planet) return false;
  if (selected?.type === 'planet' && selected.id === planet.id) return true;
  if (hoveredPlanetId === planet.id) return true;
  if (isPlanetInsideHoveredSector(planet)) return true;
  const basePosition = viewMode === 'schematic' ? getSchematicPlanetPosition(planet) : getImagePlanetPosition(planet);
  const center = clusterZoomState.center;
  const distance = Math.hypot(basePosition.x - center.x, basePosition.y - center.y);
  const progress = getClusterZoomProgress();
  const visibleRadius = clusterZoomState.radius * (1.45 - (progress * 0.65));
  return distance <= visibleRadius;
}

function clampPanToViewport(nextPanX = panX, nextPanY = panY, nextZoom = zoom) {
  const rect = viewport.getBoundingClientRect();
  const scaledSize = WORLD_SIZE * nextZoom;
  const margin = Math.max(70, Math.min(rect.width, rect.height) * 0.08);
  let clampedX = nextPanX;
  let clampedY = nextPanY;
  if (scaledSize + (margin * 2) <= rect.width) {
    clampedX = (rect.width - scaledSize) / 2;
  } else {
    const minPanX = rect.width - scaledSize - margin;
    const maxPanX = margin;
    clampedX = clamp(nextPanX, minPanX, maxPanX);
  }
  if (scaledSize + (margin * 2) <= rect.height) {
    clampedY = (rect.height - scaledSize) / 2;
  } else {
    const minPanY = rect.height - scaledSize - margin;
    const maxPanY = margin;
    clampedY = clamp(nextPanY, minPanY, maxPanY);
  }
  return { panX: clampedX, panY: clampedY };
}

function zoomAtScreenPoint(nextZoom, screenX, screenY) {
  const oldZoom = zoom;
  if (Math.abs(nextZoom - oldZoom) < 1e-6) return false;
  zoom = nextZoom;
  panX = screenX - ((screenX - panX) * (zoom / oldZoom));
  panY = screenY - ((screenY - panY) * (zoom / oldZoom));
  ({ panX, panY } = clampPanToViewport(panX, panY, zoom));
  markDirty({ transform: true, positions: true, layers: needsLayerRefreshForZoom(oldZoom, zoom) });
  return true;
}

function updateZoomFromInput(multiplier, clientX, clientY) {
  const rect = viewport.getBoundingClientRect();
  const screenX = clientX - rect.left;
  const screenY = clientY - rect.top;
  const worldX = (screenX - panX) / zoom;
  const worldY = (screenY - panY) / zoom;
  const zoomIn = multiplier > 1;
  let nextClusterState = clusterZoomState;

  if (!zoomIn && nextClusterState && zoom <= CLUSTER_RELEASE_ZOOM) {
    nextClusterState = null;
  }
  if (zoomIn && !nextClusterState && zoom >= CLUSTER_ZOOM_ENTRY_THRESHOLD) {
    nextClusterState = findClusterZoomCandidate(worldX, worldY);
  }

  const zoomLimit = nextClusterState ? CLUSTER_MAX_ZOOM : MAX_ZOOM;
  const nextZoom = clamp(zoom * multiplier, MIN_ZOOM, zoomLimit);

  if (!zoomIn && nextZoom <= MAX_ZOOM) {
    nextClusterState = null;
  }
  if (zoomIn && !nextClusterState && zoom >= MAX_ZOOM && nextZoom >= MAX_ZOOM) {
    setClusterZoomState(null);
    setStatus('Cluster-Zoom ist nur in dichten Planet-Clustern verfuegbar.');
    return false;
  }

  setClusterZoomState(nextClusterState);
  const changed = zoomAtScreenPoint(nextZoom, screenX, screenY);
  if (changed) setStatus(describeViewStatus());
  return changed;
}

function averageArcgisRing(ring, mode) {
  if (!Array.isArray(ring) || !ring.length) return null;
  return averagePoints(ring.map((point) => projectArcgisToWorld(point[0], point[1], mode)));
}

function simplifyPointList(points, targetCount = 64) {
  if (!Array.isArray(points) || points.length <= targetCount) return points || [];
  const step = Math.max(1, Math.ceil(points.length / targetCount));
  const simplified = [];
  for (let i = 0; i < points.length; i += step) simplified.push(points[i]);
  const last = points[points.length - 1];
  const tail = simplified[simplified.length - 1];
  if (!tail || tail[0] !== last[0] || tail[1] !== last[1]) simplified.push(last);
  return simplified;
}

function simplifyRings(rings, targetCount = 64) {
  if (!Array.isArray(rings)) return [];
  return rings.map((ring) => simplifyPointList(ring, targetCount));
}

function solve3x3(matrix, vector) {
  const m = matrix.map((row, rowIndex) => [...row, vector[rowIndex]]);
  for (let pivot = 0; pivot < 3; pivot += 1) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < 3; row += 1) {
      if (Math.abs(m[row][pivot]) > Math.abs(m[maxRow][pivot])) maxRow = row;
    }
    if (Math.abs(m[maxRow][pivot]) < 1e-9) return null;
    if (maxRow !== pivot) [m[pivot], m[maxRow]] = [m[maxRow], m[pivot]];
    const divisor = m[pivot][pivot];
    for (let col = pivot; col < 4; col += 1) m[pivot][col] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === pivot) continue;
      const factor = m[row][pivot];
      for (let col = pivot; col < 4; col += 1) m[row][col] -= factor * m[pivot][col];
    }
  }
  return [m[0][3], m[1][3], m[2][3]];
}

function fitAffineTransform(pairs) {
  if (pairs.length < 3) return null;
  let sumXX = 0; let sumXY = 0; let sumYY = 0; let sumX = 0; let sumY = 0; let count = 0;
  let sumTargetX = 0; let sumArcTargetX = 0; let sumArcYTargetX = 0;
  let sumTargetY = 0; let sumArcTargetY = 0; let sumArcYTargetY = 0;
  pairs.forEach(({ arcX, arcY, worldX, worldY }) => {
    sumXX += arcX * arcX;
    sumXY += arcX * arcY;
    sumYY += arcY * arcY;
    sumX += arcX;
    sumY += arcY;
    count += 1;
    sumTargetX += worldX;
    sumArcTargetX += arcX * worldX;
    sumArcYTargetX += arcY * worldX;
    sumTargetY += worldY;
    sumArcTargetY += arcX * worldY;
    sumArcYTargetY += arcY * worldY;
  });
  const normal = [
    [sumXX, sumXY, sumX],
    [sumXY, sumYY, sumY],
    [sumX, sumY, count]
  ];
  const xCoefficients = solve3x3(normal, [sumArcTargetX, sumArcYTargetX, sumTargetX]);
  const yCoefficients = solve3x3(normal, [sumArcTargetY, sumArcYTargetY, sumTargetY]);
  if (!xCoefficients || !yCoefficients) return null;
  return {
    x: xCoefficients,
    y: yCoefficients
  };
}

function polygonPathFromRings(rings, projector) {
  return rings
    .map((ring) => ring.map((point, index) => {
      const projected = projector(point[0], point[1]);
      return `${index ? 'L' : 'M'}${projected.x.toFixed(2)},${projected.y.toFixed(2)}`;
    }).join(' ') + ' Z')
    .join(' ');
}

function prepareArcgisData() {
  if (arcgisData) return arcgisData;
  if (!window.ARCGIS_COMPACT) return null;

  const planets = (window.ARCGIS_COMPACT.planets || []).map((planet) => ({
    key: normalizePlanetKey(planet.id || planet.name),
    name: planet.name || '',
    grid: planet.grid || '',
    sector: planet.sector || '',
    region: planet.region || '',
    cRegion: planet.cRegion || '',
    x: Number(planet.x),
    y: Number(planet.y)
  })).filter((planet) => Number.isFinite(planet.x) && Number.isFinite(planet.y));

  const planetMap = new Map();
  planets.forEach((planet) => {
    if (!planetMap.has(planet.key)) planetMap.set(planet.key, planet);
  });

  const grid = (window.ARCGIS_COMPACT.grid || [])
    .filter((cell) => String(cell.name || '').trim())
    .map((cell) => ({ name: cell.name, rings: cell.rings || [] }));

  const boundsSource = [];
  grid.forEach((cell) => {
    cell.rings.forEach((ring) => ring.forEach((point) => boundsSource.push(point)));
  });
  if (!boundsSource.length) {
    planets.forEach((planet) => boundsSource.push([planet.x, planet.y]));
  }
  const minArcX = Math.min(...boundsSource.map((point) => point[0]));
  const maxArcX = Math.max(...boundsSource.map((point) => point[0]));
  const minArcY = Math.min(...boundsSource.map((point) => point[1]));
  const maxArcY = Math.max(...boundsSource.map((point) => point[1]));
  const imagePairs = POSITION_CALIBRATION_ANCHORS
    .map((anchor) => {
      const match = planetMap.get(anchor.id);
      if (!match) return null;
      return { arcX: match.x, arcY: match.y, worldX: anchor.next.x, worldY: anchor.next.y };
    })
    .filter(Boolean);
  const fallbackImagePairs = (state?.planets || [])
    .map((planet) => {
      const match = planetMap.get(normalizePlanetKey(planet.name));
      if (!match) return null;
      return { arcX: match.x, arcY: match.y, worldX: planet.x, worldY: planet.y };
    })
    .filter(Boolean);
  const imageTransform = fitAffineTransform(imagePairs);

  arcgisData = {
    planets,
    planetMap,
    hyperlanes: (window.ARCGIS_COMPACT.hyperlanes || []).map((lane) => ({
      name: lane.name || 'Unnamed Route',
      zoom: Number(lane.zoom ?? 0),
      paths: (lane.paths || []).map((path) => simplifyPointList(path, 28))
    })),
    regions: (window.ARCGIS_COMPACT.regions || []).map((region) => ({
      name: region.name || 'Unknown Region',
      rings: simplifyRings(region.rings || [], 42)
    })),
    sectors: (window.ARCGIS_COMPACT.sectors || []).map((sector) => ({
      name: sector.name || 'Unknown Sector',
      rings: simplifyRings(sector.rings || [], 48)
    })).filter((sector) => String(sector.name || '').trim()),
    grid: (window.ARCGIS_COMPACT.grid || []).map((cell) => ({ ...cell, rings: simplifyRings(cell.rings || [], 8) })),
    bounds: { minArcX, maxArcX, minArcY, maxArcY },
    imageTransform: imageTransform || fitAffineTransform(fallbackImagePairs)
  };
  if (TACTICAL_DEBUG && !tacticalDebugArcgisLogged) {
    tacticalDebugArcgisLogged = true;
    logTacticalDebug('prepareArcgisData', {
      counts: {
        planets: arcgisData.planets.length,
        hyperlanes: arcgisData.hyperlanes.length,
        regions: arcgisData.regions.length,
        sectors: arcgisData.sectors.length,
        grid: arcgisData.grid.length
      },
      bounds: arcgisData.bounds,
      imageTransform: arcgisData.imageTransform,
      samplePlanet: arcgisData.planets[0] || null
    });
  }
  return arcgisData;
}

function getArcgisCounts() {
  const data = prepareArcgisData();
  if (!data) return null;
  return {
    planets: data.planets.length,
    hyperlanes: data.hyperlanes.length,
    regions: data.regions.length,
    sectors: data.sectors.length,
    grid: data.grid.length
  };
}

function projectArcgisToWorld(x, y, mode = 'schematic') {
  const data = prepareArcgisData();
  if (!data || !Number.isFinite(x) || !Number.isFinite(y)) return { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 };
  if (mode === 'image' && data.imageTransform) {
    const shiftedX = ((data.imageTransform.x[0] * x) + (data.imageTransform.x[1] * y) + data.imageTransform.x[2]) + IMAGE_MODE_ARCGIS_OFFSET.x;
    const shiftedY = ((data.imageTransform.y[0] * x) + (data.imageTransform.y[1] * y) + data.imageTransform.y[2]) + IMAGE_MODE_ARCGIS_OFFSET.y;
    const dx = shiftedX - IMAGE_MODE_ARCGIS_WARP_PIVOT.x;
    const dy = shiftedY - IMAGE_MODE_ARCGIS_WARP_PIVOT.y;
    const warpedX = IMAGE_MODE_ARCGIS_WARP_PIVOT.x + (dx * IMAGE_MODE_ARCGIS_WARP.xx) + (dy * IMAGE_MODE_ARCGIS_WARP.xy);
    const warpedY = IMAGE_MODE_ARCGIS_WARP_PIVOT.y + (dx * IMAGE_MODE_ARCGIS_WARP.yx) + (dy * IMAGE_MODE_ARCGIS_WARP.yy);
    const worldX = (warpedX * IMAGE_MODE_ARCGIS_FINE_AFFINE.xx) + (warpedY * IMAGE_MODE_ARCGIS_FINE_AFFINE.xy) + IMAGE_MODE_ARCGIS_FINE_AFFINE.tx;
    const worldY = (warpedX * IMAGE_MODE_ARCGIS_FINE_AFFINE.yx) + (warpedY * IMAGE_MODE_ARCGIS_FINE_AFFINE.yy) + IMAGE_MODE_ARCGIS_FINE_AFFINE.ty;
    return { x: clamp(worldX, 0, WORLD_SIZE), y: clamp(worldY, 0, WORLD_SIZE) };
  }
  const margin = mode === 'schematic' ? 72 : 0;
  const usable = WORLD_SIZE - margin * 2;
  const xNorm = (x - data.bounds.minArcX) / Math.max(1, data.bounds.maxArcX - data.bounds.minArcX);
  const yNorm = (data.bounds.maxArcY - y) / Math.max(1, data.bounds.maxArcY - data.bounds.minArcY);
  return {
    x: clamp(margin + (xNorm * usable), 0, WORLD_SIZE),
    y: clamp(margin + (yNorm * usable), 0, WORLD_SIZE)
  };
}

function getArcgisPlanetRecord(planet) {
  const data = prepareArcgisData();
  if (!data) return null;
  return data.planetMap.get(normalizePlanetKey(planet.name)) || null;
}

function createPlanetFromArcgisRecord(record, overrides = {}) {
  if (!record) return null;
  const projected = projectArcgisToWorld(record.x, record.y, 'image');
  return {
    id: overrides.id || normalizePlanetKey(record.id || record.name),
    name: overrides.name || record.name,
    grid: overrides.grid || compactGridName(record.grid),
    sector: overrides.sector !== undefined ? overrides.sector : (String(record.sector || '').trim()),
    region: overrides.region || record.cRegion || record.region || '',
    x: projected.x,
    y: projected.y,
    owner: overrides.owner || 'NEUTRAL',
    wiki: overrides.wiki || '',
    description: overrides.description || '',
    isCoreWorld: Boolean(overrides.isCoreWorld)
  };
}

function ensureImportantCampaignPlanets() {
  const arcgisDataSet = prepareArcgisData();
  const coruscantRecord = arcgisDataSet?.planetMap?.get('coruscant');
  if (!coruscantRecord) return;
  const existingCoruscant = state.planets.find((planet) => {
    const key = normalizePlanetKey(planet.id || planet.name);
    return key === 'coruscant' || key === 'imperial_center';
  });
  if (existingCoruscant) {
    const projected = projectArcgisToWorld(coruscantRecord.x, coruscantRecord.y, 'image');
    existingCoruscant.id = 'coruscant';
    existingCoruscant.name = 'Coruscant';
    existingCoruscant.owner = existingCoruscant.owner || 'GAR';
    existingCoruscant.grid = existingCoruscant.grid || compactGridName(coruscantRecord.grid);
    existingCoruscant.sector = existingCoruscant.sector || String(coruscantRecord.sector || '').trim();
    existingCoruscant.region = existingCoruscant.region || coruscantRecord.cRegion || coruscantRecord.region || '';
    existingCoruscant.wiki = existingCoruscant.wiki || 'https://starwars.fandom.com/wiki/Coruscant';
    setPlanetWorldPosition(existingCoruscant, projected.x, projected.y);
    return;
  }
  state.planets.push(createPlanetFromArcgisRecord(coruscantRecord, {
    id: 'coruscant',
    name: 'Coruscant',
    owner: 'GAR',
    wiki: 'https://starwars.fandom.com/wiki/Coruscant'
  }));
}

function buildGridModel() {
  const colBuckets = new Map();
  const rowBuckets = new Map();
  state.planets.forEach((planet) => {
    const grid = parseGrid(planet.grid);
    if (!grid) return;
    if (!colBuckets.has(grid.col)) colBuckets.set(grid.col, []);
    if (!rowBuckets.has(grid.row)) rowBuckets.set(grid.row, []);
    colBuckets.get(grid.col).push(planet.x);
    rowBuckets.get(grid.row).push(planet.y);
  });
  const colCenters = new Map();
  const rowCenters = new Map();
  colBuckets.forEach((values, key) => colCenters.set(key, median(values)));
  rowBuckets.forEach((values, key) => rowCenters.set(key, median(values)));
  gridModel = { colCenters, rowCenters };
}

function getGridCellCenter(grid) {
  if (!gridModel) buildGridModel();
  const parsed = parseGrid(grid);
  if (!parsed) return null;
  const x = gridModel.colCenters.get(parsed.col);
  const y = gridModel.rowCenters.get(parsed.row);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function getPlanetFallbackCenter(planet) {
  return getGridCellCenter(planet.grid) || { x: planet.x, y: planet.y };
}

function getPlanetAutoFitAnchor(planet) {
  if (Number.isFinite(planet.x) && Number.isFinite(planet.y)) {
    return { x: planet.x, y: planet.y };
  }
  return getPlanetFallbackCenter(planet);
}

function colorAt(x, y) {
  if (!mapAnalysis) return null;
  const ix = clamp(Math.round(x), 0, WORLD_SIZE - 1);
  const iy = clamp(Math.round(y), 0, WORLD_SIZE - 1);
  const idx = (iy * WORLD_SIZE + ix) * 4;
  const data = mapAnalysis.data;
  return { r: data[idx], g: data[idx + 1], b: data[idx + 2], a: data[idx + 3] };
}

function markerScoreAt(x, y) {
  const c = colorAt(x, y);
  if (!c) return 0;
  const cyanBias = (c.g + c.b) - (c.r * 0.85);
  const brightness = (c.r + c.g + c.b) / 3;
  return cyanBias > 180 && brightness > 110 ? cyanBias + brightness : 0;
}

function hyperlaneScoreAt(x, y) {
  const c = colorAt(x, y);
  if (!c) return 0;
  const magenta = (c.r + c.b) - (c.g * 1.15);
  const brightness = (c.r + c.g + c.b) / 3;
  return magenta > 130 && brightness > 70 ? magenta + brightness * 0.3 : 0;
}

function initMapAnalysis() {
  if (mapAnalysis || mapAnalysisUnavailable || !mapEl.complete || !mapEl.naturalWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width = WORLD_SIZE;
  canvas.height = WORLD_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  try {
    ctx.drawImage(mapEl, 0, 0, WORLD_SIZE, WORLD_SIZE);
    mapAnalysis = {
      canvas,
      ctx,
      data: ctx.getImageData(0, 0, WORLD_SIZE, WORLD_SIZE).data
    };
    if (TACTICAL_DEBUG) {
      logTacticalDebug('initMapAnalysis ready', {
        naturalWidth: mapEl.naturalWidth,
        naturalHeight: mapEl.naturalHeight,
        src: mapEl.currentSrc || mapEl.src
      });
    }
  } catch (error) {
    mapAnalysisUnavailable = true;
    mapAnalysis = null;
    console.warn('[TACTICAL] map analysis unavailable; continuing without pixel sampling', {
      message: error?.message,
      name: error?.name,
      src: mapEl.currentSrc || mapEl.src,
      protocol: window.location.protocol
    });
    setStatus('Karten-Pixelanalyse vom Browser blockiert. Tactical-Overlay bleibt aktiv, Auto-Fit/Hyperlane-Sampling laufen im Fallback.');
  }
}

function findMarkerCandidatesNear(x, y, radius = 64, limit = 6) {
  if (!mapAnalysis) return [];
  const candidates = [];
  const step = radius > 30 ? 2 : 1;
  for (let py = y - radius; py <= y + radius; py += step) {
    for (let px = x - radius; px <= x + radius; px += step) {
      const dx = px - x;
      const dy = py - y;
      const distSq = dx * dx + dy * dy;
      if (distSq > radius * radius) continue;
      const score = markerScoreAt(px, py) - Math.sqrt(distSq) * 1.15;
      if (score <= 0) continue;
      candidates.push({ x: px, y: py, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const deduped = [];
  candidates.forEach((candidate) => {
    if (deduped.some((entry) => ((entry.x - candidate.x) ** 2 + (entry.y - candidate.y) ** 2) < 36)) return;
    deduped.push(candidate);
  });
  return deduped.slice(0, limit);
}

function distributeAroundPoint(center, index, total, radius = 18) {
  if (total <= 1) return center;
  const angle = (-Math.PI / 2) + ((Math.PI * 2) * index / total);
  const ringRadius = radius + (Math.floor(index / 6) * 10);
  return {
    x: clamp(center.x + Math.cos(angle) * ringRadius, 0, WORLD_SIZE),
    y: clamp(center.y + Math.sin(angle) * ringRadius, 0, WORLD_SIZE)
  };
}

function getSchematicCellCenter(grid) {
  const parsed = parseGrid(grid);
  const columnCount = 24;
  const rowCount = 22;
  const marginX = 120;
  const marginY = 120;
  const usableWidth = WORLD_SIZE - marginX * 2;
  const usableHeight = WORLD_SIZE - marginY * 2;
  const cellWidth = usableWidth / columnCount;
  const cellHeight = usableHeight / rowCount;
  const colIndex = parsed ? Math.max(0, Math.min(columnCount - 1, parsed.col.charCodeAt(0) - 65)) : Math.floor(columnCount / 2);
  const rowIndex = parsed ? Math.max(0, Math.min(rowCount - 1, parsed.row - 1)) : Math.floor(rowCount / 2);
  return {
    x: marginX + (colIndex + 0.5) * cellWidth,
    y: marginY + (rowIndex + 0.5) * cellHeight
  };
}

function getSchematicPlanetPosition(planet) {
  return { x: planet.x, y: planet.y };
}

function getImagePlanetPosition(planet) {
  const arcgisPlanet = getArcgisPlanetRecord(planet);
  if (arcgisPlanet) return projectArcgisToWorld(arcgisPlanet.x, arcgisPlanet.y, 'image');
  return { x: planet.x, y: planet.y };
}

function applyArcgisPlanetImport(force = false) {
  const data = prepareArcgisData();
  if (!data) return false;
  state.meta = state.meta || {};
  if (!force && state.meta.arcgisImportVersion === ARCGIS_IMPORT_VERSION) return false;
  if (!force) {
    state.meta.arcgisImportVersion = ARCGIS_IMPORT_VERSION;
    return false;
  }
  let updatedCount = 0;
  state.planets.forEach((planet) => {
    const match = getArcgisPlanetRecord(planet);
    if (!match) return;
    const projected = projectArcgisToWorld(match.x, match.y, 'image');
    setPlanetWorldPosition(planet, projected.x, projected.y);
    if (!planet.region && match.region) planet.region = match.region;
    updatedCount += 1;
  });
  syncManualSectorMembershipFromPositions();
  state.meta.arcgisImportVersion = ARCGIS_IMPORT_VERSION;
  rebuildIndexes();
  saveLocal();
  render({ positions: true, frontline: true, layers: true });
  return updatedCount > 0;
}

function getPlanetDisplayPosition(planet) {
  const basePosition = viewMode === 'schematic' ? getSchematicPlanetPosition(planet) : getImagePlanetPosition(planet);
  return getClusterExpandedPoint(basePosition);
}

function getCalibrationDisplacement(x, y) {
  let totalWeight = 0;
  let dx = 0;
  let dy = 0;
  POSITION_CALIBRATION_ANCHORS.forEach((anchor) => {
    const anchorDx = anchor.next.x - anchor.old.x;
    const anchorDy = anchor.next.y - anchor.old.y;
    const distance = Math.hypot(x - anchor.old.x, y - anchor.old.y);
    const weight = 1 / Math.pow(Math.max(120, distance), 1.35);
    totalWeight += weight;
    dx += anchorDx * weight;
    dy += anchorDy * weight;
  });
  if (!totalWeight) return { dx: 0, dy: 0 };
  return { dx: dx / totalWeight, dy: dy / totalWeight };
}

function getCalibratedPositionForPlanet(planet) {
  const exactAnchor = POSITION_CALIBRATION_ANCHORS.find((anchor) => anchor.id === planet.id);
  if (exactAnchor) {
    return { x: exactAnchor.next.x, y: exactAnchor.next.y };
  }
  const displacement = getCalibrationDisplacement(planet.x, planet.y);
  return {
    x: clamp(planet.x + displacement.dx, 0, WORLD_SIZE),
    y: clamp(planet.y + displacement.dy, 0, WORLD_SIZE)
  };
}

function applyPositionCalibration(force = false) {
  state.meta = state.meta || {};
  if (!force && state.meta.positionCalibrationVersion === POSITION_CALIBRATION_VERSION) return false;
  state.planets.forEach((planet) => {
    const calibrated = getCalibratedPositionForPlanet(planet);
    setPlanetWorldPosition(planet, calibrated.x, calibrated.y);
  });
  state.meta.positionCalibrationVersion = POSITION_CALIBRATION_VERSION;
  rebuildIndexes();
  saveLocal();
  render({ positions: true, frontline: true, layers: true });
  return true;
}

function autoFitPlanets(force = false) {
  initMapAnalysis();
  if (!mapAnalysis) return false;
  state.meta = state.meta || {};
  if (!force && state.meta.autoPlacementVersion === AUTO_PLACEMENT_VERSION) return false;
  const groups = new Map();
  state.planets.forEach((planet) => {
    const key = planet.grid || planet.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(planet);
  });
  let movedCount = 0;
  groups.forEach((planets) => {
    const anchor = planets.reduce((acc, planet) => {
      const pos = getPlanetAutoFitAnchor(planet);
      acc.x += pos.x;
      acc.y += pos.y;
      return acc;
    }, { x: 0, y: 0 });
    anchor.x /= planets.length;
    anchor.y /= planets.length;
    const candidates = findMarkerCandidatesNear(anchor.x, anchor.y, 44, Math.max(3, planets.length));
    const used = new Set();
    planets
      .slice()
      .sort((a, b) => ((a.x - anchor.x) ** 2 + (a.y - anchor.y) ** 2) - ((b.x - anchor.x) ** 2 + (b.y - anchor.y) ** 2))
      .forEach((planet, index) => {
        const current = getPlanetAutoFitAnchor(planet);
        let assigned = null;
        let bestScore = -Infinity;
        candidates.forEach((candidate, candidateIndex) => {
          if (used.has(candidateIndex)) return;
          const closeness = Math.hypot(current.x - candidate.x, current.y - candidate.y);
          const score = candidate.score - closeness * 1.15;
          if (score > bestScore) {
            bestScore = score;
            assigned = { candidate, candidateIndex };
          }
        });
        if (assigned && bestScore > 150 && Math.hypot(current.x - assigned.candidate.x, current.y - assigned.candidate.y) <= 40) {
          used.add(assigned.candidateIndex);
          setPlanetWorldPosition(planet, assigned.candidate.x, assigned.candidate.y);
          movedCount += 1;
        } else {
          const fallback = distributeAroundPoint(current, index, planets.length, 10);
          setPlanetWorldPosition(planet, fallback.x, fallback.y);
        }
      });
  });
  state.meta.autoPlacementVersion = AUTO_PLACEMENT_VERSION;
  rebuildIndexes();
  saveLocal();
  render({ positions: true, frontline: true, layers: true });
  return movedCount > 0;
}

