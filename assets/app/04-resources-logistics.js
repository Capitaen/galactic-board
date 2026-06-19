// Generated from app-shell.js: resources, warehouses, logistics, build prerequisites

function getFactionResourcePool(faction = 'GAR') {
  state.resources = state.resources || {};
  state.resources[faction] = { ...createEmptyFactionResources(), ...(state.resources[faction] || {}) };
  return state.resources[faction];
}

function getPlanetResourceSlots(planetId) {
  const slots = state.planetResources?.[planetId];
  const normalized = Array.isArray(slots)
    ? slots.slice(0, 10).map((slot) => (INFRASTRUCTURE_KEYS.includes(slot) ? slot : ''))
    : [];
  while (normalized.length < 10) normalized.push('');
  return normalized;
}

function setPlanetResourceSlots(planetId, slots) {
  state.planetResources = state.planetResources || {};
  state.planetResources[planetId] = (slots || [])
    .slice(0, 10)
    .map((slot) => (INFRASTRUCTURE_KEYS.includes(slot) ? slot : ''));
}

function ensureWarehouseStore() {
  state.meta = state.meta || {};
  if (!Array.isArray(state.meta.planetWarehouses)) state.meta.planetWarehouses = [];
  return state.meta.planetWarehouses;
}

function createEmptyStorageStock() {
  return Object.fromEntries(STORAGE_RESOURCE_KEYS.map((resourceKey) => [resourceKey, 0]));
}

function normalizeWarehouseBuildingKey(buildingKey) {
  const key = String(buildingKey || '').trim();
  return LEGACY_STORAGE_BUILDING_ALIAS_MAP[key] || key;
}

function sanitizeWarehouseStock(stockByResource = {}, fallbackResourceType = '', fallbackAmount = 0) {
  const normalized = createEmptyStorageStock();
  STORAGE_RESOURCE_KEYS.forEach((resourceKey) => {
    normalized[resourceKey] = Math.max(0, Number(stockByResource?.[resourceKey] || 0));
  });
  if (fallbackResourceType && STORAGE_RESOURCE_KEYS.includes(fallbackResourceType) && fallbackAmount > 0) {
    normalized[fallbackResourceType] += Math.max(0, Number(fallbackAmount || 0));
  }
  return normalized;
}

function getWarehouseStoredTotal(warehouse) {
  return STORAGE_RESOURCE_KEYS.reduce((sum, resourceKey) => sum + Math.max(0, Number(warehouse?.stockByResource?.[resourceKey] || 0)), 0);
}

function createWarehouseRecord(data = {}) {
  const level = clamp(Math.max(1, Number(data.level || 1)), 1, WAREHOUSE_MAX_LEVEL);
  const capacity = getWarehouseCapacity(level);
  const stockByResource = sanitizeWarehouseStock(data.stockByResource, data.resourceType, data.currentStock);
  const totalStock = Math.min(capacity, getWarehouseStoredTotal({ stockByResource }));
  let remaining = totalStock;
  const cappedStock = createEmptyStorageStock();
  STORAGE_RESOURCE_KEYS.forEach((resourceKey, index) => {
    if (remaining <= 0) return;
    const raw = Math.max(0, Number(stockByResource[resourceKey] || 0));
    const value = index === STORAGE_RESOURCE_KEYS.length - 1 ? remaining : Math.min(raw, remaining);
    cappedStock[resourceKey] = value;
    remaining -= value;
  });
  return {
    id: data.id || `warehouse_${Math.random().toString(36).slice(2, 10)}`,
    planetId: String(data.planetId || ''),
    slotIndex: Math.max(0, Number(data.slotIndex || 0)),
    level,
    stockByResource: cappedStock
  };
}

function getWarehouseBuildingKey() {
  return LOCAL_WAREHOUSE_BUILDING_KEY;
}

function isWarehouseBuildingKey(buildingKey) {
  return Boolean(STORAGE_BUILDING_DEFS[normalizeWarehouseBuildingKey(buildingKey)]);
}

function getWarehouseCapacity(level = 1) {
  const normalizedLevel = clamp(Math.max(1, Number(level || 1)), 1, WAREHOUSE_MAX_LEVEL);
  return WAREHOUSE_BASE_CAPACITY + ((normalizedLevel - 1) * WAREHOUSE_LEVEL_STEP_CAPACITY);
}

function getWarehouseUpgradeCost(level = 1) {
  const nextLevel = clamp(Math.max(2, Number(level || 1) + 1), 2, WAREHOUSE_MAX_LEVEL);
  const factor = nextLevel;
  return {
    quadraniumErz: 280 * factor,
    agrinium: 170 * factor,
    tibannaGas: 150 * factor,
    baradium: 140 * factor,
    kavamSalz: 170 * factor,
    credits: 1800 * factor
  };
}

function getPlanetWarehouses(planetId) {
  return ensureWarehouseStore().filter((entry) => entry.planetId === planetId);
}

function getWarehouseByPlanetSlot(planetId, slotIndex) {
  return ensureWarehouseStore().find((entry) => entry.planetId === planetId && Number(entry.slotIndex) === Number(slotIndex)) || null;
}

function syncWarehouseStoreForPlanet(planetId) {
  const slots = getPlanetResourceSlots(planetId);
  let slotsChanged = false;
  slots.forEach((slot, index) => {
    const normalized = normalizeWarehouseBuildingKey(slot);
    if (slot && normalized !== slot && isWarehouseBuildingKey(slot)) {
      slots[index] = normalized;
      slotsChanged = true;
    }
  });
  if (slotsChanged) setPlanetResourceSlots(planetId, slots);
  const store = ensureWarehouseStore();
  for (let index = store.length - 1; index >= 0; index -= 1) {
    const warehouse = store[index];
    if (warehouse.planetId !== planetId) continue;
    const buildingKey = slots[warehouse.slotIndex] || '';
    if (!isWarehouseBuildingKey(buildingKey)) {
      store.splice(index, 1);
      continue;
    }
    warehouse.level = clamp(warehouse.level, 1, WAREHOUSE_MAX_LEVEL);
    warehouse.stockByResource = sanitizeWarehouseStock(warehouse.stockByResource, warehouse.resourceType, warehouse.currentStock);
    const total = getWarehouseStoredTotal(warehouse);
    if (total > getWarehouseCapacity(warehouse.level)) {
      const overflowRatio = getWarehouseCapacity(warehouse.level) / Math.max(1, total);
      STORAGE_RESOURCE_KEYS.forEach((resourceKey) => {
        warehouse.stockByResource[resourceKey] = Math.floor(Number(warehouse.stockByResource[resourceKey] || 0) * overflowRatio);
      });
    }
  }
  slots.forEach((buildingKey, slotIndex) => {
    if (!isWarehouseBuildingKey(buildingKey) || getWarehouseByPlanetSlot(planetId, slotIndex)) return;
    store.push(createWarehouseRecord({
      planetId,
      slotIndex,
      level: 1,
      stockByResource: createEmptyStorageStock()
    }));
  });
}

function addPlanetHyperlaneLink(linkMap, leftId, rightId) {
  const a = String(leftId || '').trim();
  const b = String(rightId || '').trim();
  if (!a || !b || a === b) return;
  if (!linkMap.has(a)) linkMap.set(a, new Set());
  if (!linkMap.has(b)) linkMap.set(b, new Set());
  linkMap.get(a).add(b);
  linkMap.get(b).add(a);
}

function getPlanetHyperlaneCacheSignature() {
  const planetParts = (Array.isArray(state?.planets) ? state.planets : [])
    .map((planet) => `${String(planet?.id || '').trim()}:${Number(planet?.x || 0).toFixed(2)}:${Number(planet?.y || 0).toFixed(2)}`)
    .join('|');
  const routeParts = (Array.isArray(state?.meta?.customRoutes) ? state.meta.customRoutes : [])
    .flatMap((route) => (Array.isArray(route?.connections) ? route.connections : []))
    .map(normalizeRouteConnection)
    .filter(Boolean)
    .map((connection) => [connection.startPlanetId, connection.endPlanetId].sort().join(':'))
    .sort()
    .join('|');
  return `${planetParts}__${routeParts}`;
}

function buildPlanetHyperlaneDegreeMap() {
  const signature = getPlanetHyperlaneCacheSignature();
  if (planetHyperlaneDegreeCache.signature === signature) return planetHyperlaneDegreeCache.map;
  const planets = Array.isArray(state?.planets) ? state.planets : [];
  const linkMap = new Map(planets.map((planet) => [planet.id, new Set()]));
  const radiusSq = 120 * 120;
  for (let index = 0; index < planets.length; index += 1) {
    const base = planets[index];
    const candidates = [];
    for (let otherIndex = 0; otherIndex < planets.length; otherIndex += 1) {
      if (index === otherIndex) continue;
      const other = planets[otherIndex];
      const dx = Number(base?.x || 0) - Number(other?.x || 0);
      const dy = Number(base?.y || 0) - Number(other?.y || 0);
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq <= radiusSq) candidates.push([distanceSq, other.id]);
    }
    candidates
      .sort((left, right) => left[0] - right[0])
      .slice(0, 3)
      .forEach(([, otherId]) => addPlanetHyperlaneLink(linkMap, base.id, otherId));
  }
  (Array.isArray(state?.meta?.customRoutes) ? state.meta.customRoutes : []).forEach((route) => {
    (Array.isArray(route?.connections) ? route.connections : [])
      .map(normalizeRouteConnection)
      .filter(Boolean)
      .forEach((connection) => addPlanetHyperlaneLink(linkMap, connection.startPlanetId, connection.endPlanetId));
  });
  planetHyperlaneDegreeCache = {
    signature,
    map: new Map([...linkMap.entries()].map(([planetId, neighbors]) => [planetId, neighbors.size]))
  };
  return planetHyperlaneDegreeCache.map;
}

function getPlanetHyperlaneDegree(planetId) {
  return Number(buildPlanetHyperlaneDegreeMap().get(planetId) || 0);
}

function isWarehousePlanetEligible(planetId) {
  return getPlanetHyperlaneDegree(planetId) >= 1;
}

function getPlanetHyperlaneStatus(planetId) {
  const degree = getPlanetHyperlaneDegree(planetId);
  return {
    degree,
    isRoutePlanet: degree >= 1,
    isLogisticsHub: degree >= 3
  };
}

function getPlanetSlotUsage(planetId) {
  const slots = getPlanetResourceSlots(planetId);
  const used = slots.filter(Boolean).length;
  return { used, total: 10 };
}

function getManualSectorForPlanet(planet) {
  if (!planet) return null;
  return ensureSectorStore().find((sector) => Array.isArray(sector?.points) && sector.points.length >= 3 && pointInPolygon({ x: planet.x, y: planet.y }, sector.points)) || null;
}

function getOperationalSectorInfoForPlanet(planet) {
  const manualSector = getManualSectorForPlanet(planet);
  if (manualSector) return { id: manualSector.id, name: manualSector.name, manual: true };
  const fallbackName = String(planet?.sector || planet?.region || planet?.name || 'Unbekannter Sektor').trim() || 'Unbekannter Sektor';
  return { id: `fallback:${fallbackName}`, name: fallbackName, manual: false };
}

function getSectorWarehouseSummary(sectorId) {
  const summary = {
    totalCapacity: 0,
    totalUsed: 0,
    warehouses: [],
    resources: Object.fromEntries(STORAGE_RESOURCE_KEYS.map((resourceKey) => [resourceKey, { stock: 0 }]))
  };
  state.planets.forEach((planet) => {
    if (planet.owner !== 'GAR') return;
    const sectorInfo = getOperationalSectorInfoForPlanet(planet);
    if (sectorInfo.id !== sectorId) return;
    getPlanetWarehouses(planet.id).forEach((warehouse) => {
      const capacity = getWarehouseCapacity(warehouse.level);
      const used = getWarehouseStoredTotal(warehouse);
      summary.totalCapacity += capacity;
      summary.totalUsed += used;
      STORAGE_RESOURCE_KEYS.forEach((resourceKey) => {
        summary.resources[resourceKey].stock += Number(warehouse.stockByResource?.[resourceKey] || 0);
      });
      summary.warehouses.push({
        ...warehouse,
        capacity,
        used,
        planetName: planet.name,
        sectorName: sectorInfo.name
      });
    });
  });
  return summary;
}

function getLogisticsSectorChoices() {
  const byId = new Map();
  state.planets.forEach((planet) => {
    if (planet.owner !== 'GAR') return;
    const sectorInfo = getOperationalSectorInfoForPlanet(planet);
    if (!byId.has(sectorInfo.id)) byId.set(sectorInfo.id, { ...sectorInfo });
  });
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function getCentralWarehouseSummary() {
  const pool = getFactionResourcePool('GAR');
  return {
    id: CENTRAL_WAREHOUSE_ID,
    name: CENTRAL_WAREHOUSE_LABEL,
    totalCapacity: Number.POSITIVE_INFINITY,
    totalUsed: STORAGE_RESOURCE_KEYS.reduce((sum, resourceKey) => sum + Number(pool[resourceKey] || 0), 0),
    resources: Object.fromEntries(STORAGE_RESOURCE_KEYS.map((resourceKey) => [resourceKey, { stock: Number(pool[resourceKey] || 0) }]))
  };
}

function getLogisticsLocationChoices() {
  return [
    { id: CENTRAL_WAREHOUSE_ID, name: CENTRAL_WAREHOUSE_LABEL, type: 'central' },
    ...getLogisticsSectorChoices().map((entry) => ({ ...entry, type: 'sector' }))
  ];
}

function getLogisticsLocationName(locationId) {
  return getLogisticsLocationChoices().find((entry) => entry.id === locationId)?.name || 'Unbekannter Lagerort';
}

function getLogisticsLocationSummary(locationId) {
  if (locationId === CENTRAL_WAREHOUSE_ID) return getCentralWarehouseSummary();
  return getSectorWarehouseSummary(locationId);
}

function addStockToLogisticsLocation(locationId, resourceType, amount) {
  if (locationId === CENTRAL_WAREHOUSE_ID) {
    const pool = getFactionResourcePool('GAR');
    pool[resourceType] = Number(pool[resourceType] || 0) + Math.max(0, Number(amount || 0));
    return Math.max(0, Number(amount || 0));
  }
  return addStockToSectorWarehouses(locationId, resourceType, amount);
}

function removeStockFromLogisticsLocation(locationId, resourceType, amount) {
  if (locationId === CENTRAL_WAREHOUSE_ID) {
    const pool = getFactionResourcePool('GAR');
    const available = Math.max(0, Number(pool[resourceType] || 0));
    const delta = Math.min(available, Math.max(0, Number(amount || 0)));
    pool[resourceType] = available - delta;
    return delta;
  }
  return removeStockFromSectorWarehouses(locationId, resourceType, amount);
}

function getMineWarehouseCompliance(planet, project) {
  if (!planet || !project?.productionResource) return { ok: true, reason: '' };
  const sectorInfo = getOperationalSectorInfoForPlanet(planet);
  const summary = getSectorWarehouseSummary(sectorInfo.id);
  if (!summary.warehouses.length) {
    return {
      ok: false,
      reason: `Im Sektor ${sectorInfo.name} muss zuerst mindestens ein lokales Lager gebaut werden.`
    };
  }
  const freeCapacity = Math.max(0, Number(summary.totalCapacity || 0) - Number(summary.totalUsed || 0));
  if (freeCapacity <= 0) {
    return {
      ok: false,
      reason: `Die lokalen Lager im Sektor ${sectorInfo.name} sind voll. Bitte zuerst ausbauen oder ein weiteres Lager errichten.`
    };
  }
  return { ok: true, reason: '' };
}

function addStockToSectorWarehouses(sectorId, resourceType, amount) {
  let remaining = Math.max(0, Number(amount || 0));
  if (!remaining) return 0;
  const warehouses = getSectorWarehouseSummary(sectorId).warehouses || [];
  warehouses
    .slice()
    .sort((a, b) => (a.used - b.used) || (a.level - b.level))
    .forEach((warehouseEntry) => {
      if (remaining <= 0) return;
      const warehouse = ensureWarehouseStore().find((entry) => entry.id === warehouseEntry.id);
      if (!warehouse) return;
      const free = Math.max(0, getWarehouseCapacity(warehouse.level) - getWarehouseStoredTotal(warehouse));
      const delta = Math.min(free, remaining);
      warehouse.stockByResource = sanitizeWarehouseStock(warehouse.stockByResource);
      warehouse.stockByResource[resourceType] += delta;
      remaining -= delta;
    });
  return amount - remaining;
}

function removeStockFromSectorWarehouses(sectorId, resourceType, amount) {
  let remaining = Math.max(0, Number(amount || 0));
  if (!remaining) return 0;
  const warehouses = getSectorWarehouseSummary(sectorId).warehouses || [];
  warehouses
    .slice()
    .sort((a, b) => ((Number(b.stockByResource?.[resourceType] || 0) - Number(a.stockByResource?.[resourceType] || 0)) || (b.level - a.level)))
    .forEach((warehouseEntry) => {
      if (remaining <= 0) return;
      const warehouse = ensureWarehouseStore().find((entry) => entry.id === warehouseEntry.id);
      if (!warehouse) return;
      warehouse.stockByResource = sanitizeWarehouseStock(warehouse.stockByResource);
      const delta = Math.min(Number(warehouse.stockByResource[resourceType] || 0), remaining);
      warehouse.stockByResource[resourceType] -= delta;
      remaining -= delta;
  });
  return amount - remaining;
}

function getGarWarehouseTotals() {
  const pool = getFactionResourcePool('GAR');
  return Object.fromEntries(STORAGE_RESOURCE_KEYS.map((resourceKey) => [resourceKey, Number(pool[resourceKey] || 0)]));
}

function canAffordGarInfrastructureCost(cost = {}) {
  const pool = getFactionResourcePool('GAR');
  const credits = Number(pool.credits || 0);
  if (credits < Number(cost?.credits || 0)) return false;
  return STORAGE_RESOURCE_KEYS.every((resourceKey) => Number(pool[resourceKey] || 0) >= Number(cost?.[resourceKey] || 0));
}

function spendGarInfrastructureCost(cost = {}) {
  if (!canAffordGarInfrastructureCost(cost)) return false;
  const pool = getFactionResourcePool('GAR');
  STORAGE_RESOURCE_KEYS.forEach((resourceKey) => {
    pool[resourceKey] = Math.max(0, Number(pool[resourceKey] || 0) - Number(cost?.[resourceKey] || 0));
  });
  pool.credits -= Number(cost?.credits || 0);
  return true;
}

function canEditPlanetResourceSlot(planet, index) {
  if (!planet || !Number.isInteger(index)) return false;
  const role = currentRole();
  if (role === 'Admin') return true;
  if (role === 'Eventleiter / KUS') return planet.owner !== 'GAR' && index < 3;
  if (currentAssignedRole() === 'Galaktischer Senats Admin') return planet.owner === 'GAR';
  return false;
}

function isResourceAssignmentEditable(planet) {
  if (!planet) return false;
  const role = currentRole();
  if (role === 'Admin') return true;
  if (role === 'Eventleiter / KUS') return planet.owner !== 'GAR';
  if (currentAssignedRole() === 'Galaktischer Senats Admin') return planet.owner === 'GAR';
  return false;
}

function getActiveShipyardFaction() {
  const role = currentRole();
  if (role === 'Eventleiter / KUS') return 'KUS';
  if (role === 'Republic Navy / GAR') return 'GAR';
  if (role === 'Senat') return 'GAR';
  if (role === 'Admin') return activeShipyardFactionOverride === 'KUS' ? 'KUS' : 'GAR';
  return 'GAR';
}

function canEditPlanetDescription(planet) {
  if (!planet) return false;
  if (isAdminRole()) return true;
  if (currentRole() === 'Eventleiter / KUS') return planet.owner !== 'GAR';
  if (currentRole() === 'Senat') return planet.owner === 'GAR';
  return false;
}

function canBuildMineProjects() {
  return currentAssignedRole() === 'Admin' || currentAssignedRole() === 'Galaktischer Senats Admin';
}

function canBuildWarehouses() {
  return canBuildMineProjects();
}

function canManageWarehouseLogistics() {
  const assignedRole = currentAssignedRole();
  return assignedRole === 'Admin'
    || assignedRole === 'Galaktischer Senats Admin'
    || assignedRole === 'Republic Navy Admin'
    || currentRole() === 'Republic Navy / GAR';
}

function getMineProjectMeta(buildingKey) {
  return MINE_PROJECT_DEFS[normalizeWarehouseBuildingKey(buildingKey)] || null;
}

function getMineProjectPlanetChoices(category = '') {
  const hyperlaneDegreeMap = buildPlanetHyperlaneDegreeMap();
  return state.planets
    .filter((planet) => planet.owner === 'GAR')
    .map((planet) => {
      const degree = Number(hyperlaneDegreeMap.get(planet.id) || 0);
      const hyperlaneStatus = {
        degree,
        isRoutePlanet: degree >= 1,
        isLogisticsHub: degree >= 3
      };
      const storageEligible = category !== 'storage' || hyperlaneStatus.isRoutePlanet;
      return {
        ...planet,
        hyperlaneDegree: hyperlaneStatus.degree,
        isRoutePlanet: hyperlaneStatus.isRoutePlanet,
        isLogisticsHub: hyperlaneStatus.isLogisticsHub,
        storageEligible
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function isMineSlotUnderConstruction(planetId, slotIndex) {
  return state.buildJobs.some((job) => (
    job.jobType === 'mine'
    && job.status === 'building'
    && job.buildLocationPlanetId === planetId
    && Number(job.targetSlotIndex) === Number(slotIndex)
  ));
}

function getAvailableMineSlots(planetId) {
  return getPlanetResourceSlots(planetId)
    .map((slot, index) => ({ index, slot }))
    .filter((entry) => !entry.slot && !isMineSlotUnderConstruction(planetId, entry.index));
}

function closeInfoPanel() {
  const previousSelection = selected;
  selected = null;
  refreshFleetSelectionState();
  refreshRouteSelectionState();
  if (previousSelection?.type === 'marker') {
    const marker = ensureMapMarkerStore().find((entry) => entry.id === previousSelection.id);
    if (marker) updateMarkerElement(marker);
  }
  infoPanel.style.display = 'none';
}

function getInfoPanelHeader(title) {
  return `
    <div class="panel-head">
      <h2>${title}</h2>
      <button class="panel-close" onclick="closeInfoPanel()" aria-label="Card schließen">x</button>
    </div>
  `;
}

function getOwnerLabel(owner) {
  if (owner === 'GAR') return 'Republik';
  if (owner === 'KUS') return 'KUS';
  if (owner === 'HUTT') return 'Hutten';
  return 'Unabhängig / Neutral';
}

function getRegionLabel(region) {
  const map = {
    'Core': 'Kernwelten',
    'Deep Core': 'Tiefer Kern',
    'Inner Rim': 'Inner Rim',
    'Mid Rim': 'Mid Rim',
    'Outer Rim': 'Outer Rim',
    'Expansion Region': 'Expansionsraum',
    'Colonies': 'Kolonien',
    'Wild Space': 'Wilder Raum',
    'Unknown Regions': 'Unbekannte Regionen',
    'Hutt Space': 'Hutt-Raum'
  };
  return map[region] || region || PLANET_INFO_PLACEHOLDER;
}

function getPlanetOwnerControlPercent(planet) {
  if (!planet) return 0;
  if (planet.owner === 'GAR' || planet.owner === 'KUS' || planet.owner === 'HUTT') return 100;
  return 50;
}

function getPlanetOwnerControlLabel(planet) {
  if (!planet) return PLANET_INFO_PLACEHOLDER;
  if (planet.owner === 'GAR') return '100,0% Republik';
  if (planet.owner === 'KUS') return '100,0% KUS';
  if (planet.owner === 'HUTT') return '100,0% Hutten';
  return '50,0% Neutral / umkämpft';
}

function sanitizePlanetInfoText(value, fallback = PLANET_INFO_PLACEHOLDER) {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizePlanetImageUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  return raw.replace(/\/revision\/latest.*$/i, '');
}

function buildPlanetIntelText(planet, info) {
  const localNote = sanitizePlanetInfoText(planet?.description);
  const routeCount = getPlanetHyperlaneDegree(planet?.id);
  const routeNames = getPlanetRouteNames(planet?.id);
  const slotUsage = planet ? getPlanetSlotUsage(planet.id) : { used: 0, total: 10 };
  const remoteNote = sanitizePlanetInfoText(info?.description);
  if (localNote !== PLANET_INFO_PLACEHOLDER) return localNote;
  if (remoteNote !== PLANET_INFO_PLACEHOLDER) return remoteNote;
  if (!planet) return PLANET_INFO_PLACEHOLDER;
  return `${planet.name} gehört aktuell zur Region ${sanitizePlanetInfoText(getRegionLabel(planet.region), 'Unbekannte Region')}, liegt im Sektor ${sanitizePlanetInfoText(planet.sector, 'Unbekannter Sektor')} auf Raster ${sanitizePlanetInfoText(planet.grid, '—')} und steht unter ${getOwnerLabel(planet.owner)}-Kontrolle. Aktuell bestehen ${routeCount} Hyperraum-Verbindung${routeCount === 1 ? '' : 'en'}${routeNames.length ? ` über ${routeNames.join(', ')}` : ''}. Infrastrukturbelegung: ${slotUsage.used}/${slotUsage.total} Slots.`;
}

function buildPlanetCardInfo(planet, info = {}) {
  const localOverride = PLANET_INFO_LOCAL_OVERRIDES[planet.id] || {};
  const demographicProfile = buildPlanetDemographicProfile(planet);
  const routeNames = getPlanetRouteNames(planet.id);
  const hyperlaneStatus = getPlanetHyperlaneStatus(planet.id);
  const slotUsage = getPlanetSlotUsage(planet.id);
  return {
    climate: sanitizePlanetInfoText(localOverride.climate || (hyperlaneStatus.isLogisticsHub ? 'Logistik-Knoten' : (hyperlaneStatus.isRoutePlanet ? 'Routenanbindung vorhanden' : 'Isolierte Versorgungslage'))),
    population: demographicProfile.currentPopulationLabel,
    lorePopulation: sanitizePlanetInfoText(`${slotUsage.used}/10 Infrastruktur-Slots belegt`),
    strategic: sanitizePlanetInfoText(localOverride.strategic || `${routeNames.length || hyperlaneStatus.degree} Hyperraum-Verbindung${(routeNames.length || hyperlaneStatus.degree) === 1 ? '' : 'en'}` || (planet.isCoreWorld ? 'Hauptplanet' : 'Regulär')),
    description: sanitizePlanetInfoText(planet.description || localOverride.description || info.description),
    image: normalizePlanetImageUrl(info.image || localOverride.image || planet.image),
    demographicProfile
  };
}

function formatPopulationEstimate(value) {
  const amount = Math.max(0, Number(value || 0));
  if (amount >= 1000000000000) return `${String((Math.round((amount / 1000000000000) * 10) / 10)).replace(/\\.0$/, '').replace('.', ',')} Billionen`;
  if (amount >= 1000000000) return `${String((Math.round((amount / 1000000000) * 10) / 10)).replace(/\\.0$/, '').replace('.', ',')} Milliarden`;
  if (amount >= 1000000) return `${String((Math.round((amount / 1000000) * 10) / 10)).replace(/\\.0$/, '').replace('.', ',')} Millionen`;
  if (amount >= 1000) return `${String((Math.round((amount / 1000) * 10) / 10)).replace(/\\.0$/, '').replace('.', ',')} Tausend`;
  return String(Math.round(amount)).replace('.', ',');
}

function getPlanetDemographicEntry(planet) {
  const fallback = {
    id: planet?.id || '',
    name: planet?.name || 'Unbekannt',
    region: getRegionLabel(planet?.region || ''),
    sector: planet?.sector || '',
    owner: planet?.owner || 'NEUTRAL',
    basePopulation: 0,
    settlementClass: 'uninhabited',
    note: 'Keine demografische Schaetzung vorhanden.'
  };
  return {
    ...fallback,
    ...(planet?.id ? (PLANET_DEMOGRAPHIC_CATALOG[planet.id] || {}) : {})
  };
}

function getPlanetBuildingWorkforce(buildingKey) {
  const key = String(buildingKey || '').trim();
  if (!key) return { industrial: 0, service: 0, logistics: 0, research: 0, construction: 0 };
  if (RESOURCE_KEYS.includes(key)) return { industrial: 4200, service: 650, logistics: 240, research: 0, construction: 0 };
  if (key.startsWith('civilian_')) return { industrial: 6800, service: 1200, logistics: 540, research: 0, construction: 0 };
  if (key === 'civil_trade_center') return { industrial: 300, service: 3200, logistics: 650, research: 0, construction: 0 };
  if (key === 'civil_industrial_complex') return { industrial: 5400, service: 900, logistics: 360, research: 0, construction: 0 };
  if (key === 'civil_logistics_center') return { industrial: 850, service: 1800, logistics: 4100, research: 0, construction: 0 };
  if (key === 'civil_research_academy') return { industrial: 250, service: 1400, logistics: 250, research: 2900, construction: 0 };
  if (key === 'civil_orbital_trade_station') return { industrial: 1100, service: 4200, logistics: 2200, research: 1000, construction: 0 };
  if (key.startsWith('storage_')) return { industrial: 250, service: 950, logistics: 1800, research: 0, construction: 0 };
  return { industrial: 400, service: 1200, logistics: 400, research: 0, construction: 0 };
}

function getPlanetConstructionWorkforce(job) {
  const key = String(job?.buildingKey || job?.resourceKey || '').trim();
  const base = getPlanetBuildingWorkforce(key);
  return {
    industrial: 0,
    service: 0,
    logistics: 0,
    research: 0,
    construction: Math.max(120, Math.round((base.industrial + base.service + base.logistics + base.research) * 0.22))
  };
}

function buildPlanetConsumptionRows(profile) {
  const populationMillions = Number(profile.currentPopulation || 0) / 1000000;
  const industrialBands = Number(profile.industrialWorkers || 0) / 1000;
  const serviceBands = Number(profile.serviceWorkers || 0) / 1000;
  const logisticsBands = Number(profile.logisticsWorkers || 0) / 1000;
  const researchBands = Number(profile.researchWorkers || 0) / 1000;
  const constructionBands = Number(profile.constructionWorkers || 0) / 1000;
  const rows = [
    {
      key: 'kavamSalz',
      label: 'Versorgung',
      demandPerDay: Math.max(0, Math.round(populationMillions * 1.15 + serviceBands * 2.8 + constructionBands * 2.2)),
      driver: 'Zivile Grundversorgung und Alltagskonsum'
    },
    {
      key: 'tibannaGas',
      label: 'Treibstoff',
      demandPerDay: Math.max(0, Math.round(logisticsBands * 3.4 + industrialBands * 1.9 + constructionBands * 1.4)),
      driver: 'Transport, Generatoren und planetare Logistik'
    },
    {
      key: 'agrinium',
      label: 'Technologie',
      demandPerDay: Math.max(0, Math.round(researchBands * 3.8 + serviceBands * 1.1 + populationMillions * 0.22)),
      driver: 'Steuerung, Forschung und Hochtechnologie'
    },
    {
      key: 'quadraniumErz',
      label: 'Metalle',
      demandPerDay: Math.max(0, Math.round(industrialBands * 3.1 + constructionBands * 2.5 + logisticsBands * 0.7)),
      driver: 'Wartung, Ausbau und schwere Industrie'
    },
    {
      key: 'baradium',
      label: 'Chemikalien',
      demandPerDay: Math.max(0, Math.round(industrialBands * 1.9 + constructionBands * 1.2 + populationMillions * 0.12)),
      driver: 'Raffinerien, Munition und Industriechemie'
    }
  ];
  return rows.map((row) => ({
    ...row,
    level: row.demandPerDay >= 45 ? 'Sehr hoch'
      : row.demandPerDay >= 22 ? 'Hoch'
        : row.demandPerDay >= 9 ? 'Mittel'
          : row.demandPerDay >= 3 ? 'Niedrig'
            : 'Sehr niedrig'
  }));
}

function buildPlanetDemographicProfile(planet) {
  const entry = getPlanetDemographicEntry(planet);
  const basePopulation = Math.max(0, Number(entry.basePopulation || 0));
  const slots = getPlanetResourceSlots(planet?.id || '');
  const jobs = Array.isArray(state?.buildJobs) ? state.buildJobs.filter((job) => (
    job?.jobType === 'mine'
    && job?.status === 'building'
    && String(job?.buildLocationPlanetId || job?.locationId || '') === String(planet?.id || '')
  )) : [];
  const workforce = { industrial: 0, service: 0, logistics: 0, research: 0, construction: 0 };
  let builtStructures = 0;
  slots.forEach((slotKey) => {
    if (!slotKey) return;
    builtStructures += 1;
    const impact = getPlanetBuildingWorkforce(slotKey);
    workforce.industrial += impact.industrial;
    workforce.service += impact.service;
    workforce.logistics += impact.logistics;
    workforce.research += impact.research;
  });
  jobs.forEach((job) => {
    const impact = getPlanetConstructionWorkforce(job);
    workforce.construction += impact.construction;
  });
  const residentWorkers = workforce.industrial + workforce.service + workforce.logistics + workforce.research;
  const supportPopulation = Math.round((workforce.industrial * 0.34) + (workforce.service * 0.26) + (workforce.logistics * 0.18) + (workforce.research * 0.14));
  let currentPopulation = basePopulation;
  if (basePopulation <= 0) {
    if (workforce.industrial > 0) currentPopulation = workforce.industrial;
    else currentPopulation = residentWorkers + workforce.construction;
  } else {
    currentPopulation += residentWorkers + supportPopulation + Math.round(workforce.construction * 0.35);
  }
  currentPopulation = Math.max(0, Math.round(currentPopulation));
  const populationDelta = currentPopulation - basePopulation;
  const profile = {
    ...entry,
    basePopulation,
    currentPopulation,
    basePopulationLabel: formatPopulationEstimate(basePopulation),
    currentPopulationLabel: formatPopulationEstimate(currentPopulation),
    industrialWorkers: workforce.industrial,
    serviceWorkers: workforce.service,
    logisticsWorkers: workforce.logistics,
    researchWorkers: workforce.research,
    constructionWorkers: workforce.construction,
    builtStructures,
    activeConstructionProjects: jobs.length,
    populationDelta,
    populationDeltaLabel: populationDelta > 0 ? `+${formatPopulationEstimate(populationDelta)}` : formatPopulationEstimate(populationDelta),
    consumption: []
  };
  profile.consumption = buildPlanetConsumptionRows(profile);
  profile.summary = basePopulation <= 0 && workforce.industrial > 0
    ? `Frueher unbesiedelt; aktive Foerderung zieht derzeit mindestens ${formatPopulationEstimate(workforce.industrial)} Industriearbeiter an.`
    : basePopulation <= 0 && currentPopulation > 0
      ? `Der Standort war praktisch leer und wird aktuell durch Infrastruktur- und Baucrews getragen.`
      : populationDelta > 0
        ? `Neue Infrastruktur hebt die lokale Bevoelkerung um etwa ${formatPopulationEstimate(populationDelta)} ueber die Basisabschaetzung.`
        : `Aktuell keine nennenswerte Abweichung von der Basisbevoelkerung.`;
  return profile;
}

function getPlanetRouteNames(planetId) {
  const seen = new Set();
  const routes = [...routeCache, ...tacticalRouteCache];
  routes.forEach((route) => {
    const connections = getRouteConnections(route);
    const hasPlanet = connections.some((connection) => connection.startPlanetId === planetId || connection.endPlanetId === planetId)
      || route.a?.id === planetId
      || route.b?.id === planetId;
    if (!hasPlanet) return;
    seen.add(getRouteDisplayName(route));
  });
  return [...seen].filter(Boolean).sort((a, b) => a.localeCompare(b, 'de'));
}

async function fetchPlanetCardInfo(planet) {
  if (!planet?.id) return {};
  const response = await fetch(`/api/planet-card/${encodeURIComponent(planet.id)}`, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Planetenkarte ${response.status}`);
  const payload = await response.json();
  return payload && typeof payload === 'object' ? payload : {};
}

function refreshPlanetInfoPanelIfActive(planetId) {
  if (selected?.type === 'planet' && selected.id === planetId) openPlanet(planetId);
}

function loadPlanetCardInfo(planet) {
  if (!planet?.id) return;
  const currentCache = planetInfoCardCache.get(planet.id);
  if (currentCache?.loaded || currentCache?.loading) return;
  const requestId = ++activePlanetInfoRequestId;
  planetInfoCardCache.set(planet.id, { ...(currentCache || {}), loading: true });
  fetchPlanetCardInfo(planet)
    .then((payload) => {
      planetInfoCardCache.set(planet.id, { ...payload, loaded: true, loading: false });
      if (selected?.type === 'planet' && selected.id === planet.id && requestId >= activePlanetInfoRequestId) {
        openPlanet(planet.id);
      }
    })
    .catch(() => {
      planetInfoCardCache.set(planet.id, { loaded: true, loading: false });
      refreshPlanetInfoPanelIfActive(planet.id);
    });
}

function summarizeResourceSlots(slots) {
  const counts = {};
  slots.forEach((slot) => {
    counts[slot] = (counts[slot] || 0) + 1;
  });
  return counts;
}

function addFactionResources(faction, delta) {
  const pool = getFactionResourcePool(faction);
  RESOURCE_KEYS.forEach((key) => {
    pool[key] = Math.max(0, Math.round(((pool[key] || 0) + (delta?.[key] || 0)) * 100) / 100);
  });
}

function getCaptureRewardForPlanet(planetId) {
  const reward = createEmptyFactionResources();
  getPlanetResourceSlots(planetId).forEach((slot) => {
    const building = getMineProjectMeta(slot);
    const resourceKey = building?.category === 'military' ? building.productionResource : '';
    if (resourceKey) reward[resourceKey] += CAPTURE_REWARD_PER_SLOT;
  });
  return reward;
}

function getPlanetProductionRate(planetId) {
  const base = createEmptyFactionResources();
  const bonuses = getPlanetCivilianBonuses(planetId);
  getPlanetResourceSlots(planetId).forEach((slot) => {
    const building = getMineProjectMeta(slot);
    if (!building) return;
    const productionPerHour = Math.max(1, Number(building.productionPerHour || 1));
    if (building.category === 'military' && building.productionResource) {
      base[building.productionResource] += productionPerHour;
    }
    const civilianYield = CIVILIAN_CREDIT_YIELDS[slot];
    if (civilianYield) {
      base.credits += (civilianYield.credits * productionPerHour) * (1 + Math.min(MAX_CIVILIAN_PRODUCTION_BONUS, bonuses[civilianYield.resource] || 0));
    }
  });
  const rate = createEmptyFactionResources();
  RESOURCE_KEYS.forEach((key) => {
    rate[key] = key === 'credits'
      ? Math.round(base[key] * 100) / 100
      : Math.round(base[key] * (1 + Math.min(MAX_CIVILIAN_PRODUCTION_BONUS, bonuses[key])) * 100) / 100;
  });
  return rate;
}

function getPlanetCivilianBonuses(planetId) {
  const bonuses = createEmptyFactionResources();
  getPlanetResourceSlots(planetId).forEach((slot) => {
    const building = getMineProjectMeta(slot);
    RESOURCE_KEYS.forEach((key) => {
      bonuses[key] += Number(building?.bonuses?.[key] || 0);
    });
  });
  RESOURCE_KEYS.forEach((key) => {
    bonuses[key] = Math.min(MAX_CIVILIAN_PRODUCTION_BONUS, bonuses[key]);
  });
  return bonuses;
}

function formatResourceAmount(value) {
  const amount = Number(value || 0);
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace('.', ',');
}

function getFactionProductionRate(faction = 'GAR') {
  const totals = createEmptyFactionResources();
  state.planets.forEach((planet) => {
    if (planet.owner !== faction) return;
    const planetRate = getPlanetProductionRate(planet.id);
    RESOURCE_KEYS.forEach((key) => {
      totals[key] += planetRate[key];
    });
  });
  RESOURCE_KEYS.forEach((key) => {
    totals[key] = Math.round(totals[key] * 100) / 100;
  });
  return totals;
}

function getEffectiveFactionProductionRate(faction = 'GAR') {
  const rate = getFactionProductionRate(faction);
  if (faction !== 'GAR') return rate;
  const taxRate = Math.min(0.25, Math.max(0, Number(state.meta?.economy?.taxRate ?? 0.05)));
  const inflationRate = Math.min(0.25, Number(getFactionResourcePool('GAR').credits || 0) / 2000000);
  const subsidy = state.meta?.economy?.subsidy || 'none';
  if (subsidy === 'civilian') rate.credits *= 1.10;
  if (subsidy === 'logistics') rate.credits *= 1.05;
  if (subsidy === 'research') rate.agrinium *= 1.10;
  rate.credits *= taxRate * (1 - (inflationRate * 0.5));
  RESOURCE_KEYS.forEach((key) => {
    rate[key] = Math.round(Number(rate[key] || 0) * 100) / 100;
  });
  return rate;
}

function applyProductionTicks(now = Date.now()) {
  const lastTick = Number(state.lastResourceTickAt) || now;
  const elapsed = Math.max(0, now - lastTick);
  const ticks = Math.floor(elapsed / RESOURCE_PRODUCTION_TICK_MS);
  if (ticks <= 0) return 0;
  const garPoolDelta = createEmptyFactionResources();
  state.planets
    .filter((planet) => planet.owner === 'GAR')
    .forEach((planet) => {
      const perTick = getPlanetProductionRate(planet.id);
      STORAGE_RESOURCE_KEYS.forEach((resourceKey) => {
        garPoolDelta[resourceKey] += Number(perTick?.[resourceKey] || 0) * ticks;
      });
      garPoolDelta.credits += Number(perTick?.credits || 0) * ticks;
    });
  addFactionResources('GAR', garPoolDelta);
  const kusRate = getEffectiveFactionProductionRate('KUS');
  const kusDelta = createEmptyFactionResources();
  RESOURCE_KEYS.forEach((key) => {
    kusDelta[key] = kusRate[key] * ticks;
  });
  addFactionResources('KUS', kusDelta);
  state.lastResourceTickAt = lastTick + (ticks * RESOURCE_PRODUCTION_TICK_MS);
  return ticks;
}

function resourceDeltaToText(delta) {
  return RESOURCE_KEYS
    .filter((key) => delta[key] > 0)
    .map((key) => `+${delta[key]} ${RESOURCE_LABELS[key]}`)
    .join(' • ');
}

function getShipClassOptions() {
  const faction = getActiveShipyardFaction();
  return Object.entries(SHIP_CLASS_POOL)
    .filter(([, meta]) => (meta.faction || 'GAR') === faction)
    .map(([id, meta]) => ({ id, ...meta }))
    .sort((a, b) => String(a.displayName || a.id).localeCompare(String(b.displayName || b.id), 'de'));
}

function getShipClassMeta(classId) {
  return SHIP_CLASS_POOL[classId] || null;
}

function isStationClass(classId) {
  return STATION_CLASS_IDS.has(classId);
}

function getGARControlledPlanets() {
  return state.planets.filter((planet) => planet.owner === 'GAR');
}

function getKUSBuildTargetPlanets() {
  const targets = new Set(KUS_SHIPYARD_PLANET_KEYS);
  return state.planets.filter((planet) => targets.has(normalizePlanetKey(planet.id || planet.name)));
}

function getDefaultShipyardPlanets() {
  const targets = new Set(DEFAULT_SHIPYARD_PLANET_KEYS);
  return state.planets.filter((planet) => targets.has(normalizePlanetKey(planet.id || planet.name)));
}

function getShipyardLocationChoices(classId) {
  const meta = getShipClassMeta(classId);
  if (!meta) return [];
  const faction = getActiveShipyardFaction();
  if (faction === 'KUS') {
    return getKUSBuildTargetPlanets().map((planet) => ({
      ...planet,
      enabled: planet.owner === 'KUS'
    }));
  }
  if (meta.buildLocations === 'anyGARPlanet') {
    return getGARControlledPlanets().map((planet) => ({ ...planet, enabled: true }));
  }
  const allowed = new Set((meta.buildLocations || []).map((name) => normalizePlanetKey(name)));
  return state.planets
    .filter((planet) => allowed.has(normalizePlanetKey(planet.id || planet.name)))
    .map((planet) => ({
      ...planet,
      enabled: planet.owner === 'GAR'
    }));
}

function getAvailableBuildLocations(classId) {
  return getShipyardLocationChoices(classId).filter((planet) => planet.enabled);
}

function canAffordCost(cost, faction = 'GAR') {
  if (DEBUG_DISABLE_GAR_BUILD_LIMITS && faction === 'GAR') return true;
  const pool = getFactionResourcePool(faction);
  return RESOURCE_KEYS.every((key) => (pool[key] || 0) >= (cost?.[key] || 0));
}

function spendResources(cost, faction = 'GAR') {
  if (DEBUG_DISABLE_GAR_BUILD_LIMITS && faction === 'GAR') return true;
  if (!canAffordCost(cost, faction)) return false;
  const pool = getFactionResourcePool(faction);
  RESOURCE_KEYS.forEach((key) => {
    pool[key] -= cost?.[key] || 0;
  });
  return true;
}

function getSectorShipyardCostSummary(planetId, cost = {}) {
  const planet = planetIndex.get(planetId);
  if (!planet) return null;
  const sectorInfo = getOperationalSectorInfoForPlanet(planet);
  const warehouseSummary = getSectorWarehouseSummary(sectorInfo.id);
  const pool = getFactionResourcePool('GAR');
  return {
    planet,
    sectorInfo,
    warehouseSummary,
    reservePool: pool,
    creditBalance: Number(pool.credits || 0),
    missing: STORAGE_RESOURCE_KEYS.filter((resourceKey) => ((Number(warehouseSummary.resources?.[resourceKey]?.stock || 0) + Number(pool[resourceKey] || 0)) < Number(cost?.[resourceKey] || 0)))
  };
}

function canAffordSectorShipyardCost(planetId, cost = {}, faction = 'GAR') {
  if (DEBUG_DISABLE_GAR_BUILD_LIMITS && faction === 'GAR') return true;
  if (faction !== 'GAR') return canAffordCost(cost, faction);
  const summary = getSectorShipyardCostSummary(planetId, cost);
  if (!summary) return false;
  if (summary.creditBalance < Number(cost?.credits || 0)) return false;
  return summary.missing.length === 0;
}

function spendSectorShipyardCost(planetId, cost = {}, faction = 'GAR') {
  if (DEBUG_DISABLE_GAR_BUILD_LIMITS && faction === 'GAR') return true;
  if (faction !== 'GAR') return spendResources(cost, faction);
  if (!canAffordSectorShipyardCost(planetId, cost, faction)) return false;
  const summary = getSectorShipyardCostSummary(planetId, cost);
  STORAGE_RESOURCE_KEYS.forEach((resourceKey) => {
    const required = Number(cost?.[resourceKey] || 0);
    if (required <= 0) return;
    const spent = removeStockFromSectorWarehouses(summary.sectorInfo.id, resourceKey, required);
    const remaining = required - spent;
    if (remaining > 0) summary.reservePool[resourceKey] = Math.max(0, Number(summary.reservePool[resourceKey] || 0) - remaining);
  });
  if (Number(cost?.credits || 0) > 0) getFactionResourcePool('GAR').credits -= Number(cost.credits || 0);
  return true;
}

function getShipDisplayLocation(ship) {
  const planet = ship.locationPlanetId ? planetIndex.get(ship.locationPlanetId) : null;
  return planet ? planet.name : '—';
}

function getFleetDisplayLocation(fleet) {
  const planet = (fleet.locationPlanetId || fleet.planetId) ? planetIndex.get(fleet.locationPlanetId || fleet.planetId) : null;
  return planet ? planet.name : '—';
}

function createFleetRecord(data = {}) {
  return {
    id: data.id || `fleet_${Math.random().toString(36).slice(2, 10)}`,
    name: data.name || 'Neue Taskforce',
    commander: data.commander || data.leader || '',
    leader: data.commander || data.leader || '',
    assignment: String(data.assignment || '').trim(),
    faction: data.faction || 'GAR',
    planetId: data.planetId || data.locationPlanetId || '',
    locationPlanetId: data.locationPlanetId || data.planetId || '',
    shipIds: Array.isArray(data.shipIds) ? data.shipIds : [],
    categoryId: String(data.categoryId || ''),
    commandRole: normalizeFleetCommandRole(data.commandRole),
    parentFleetId: String(data.parentFleetId || ''),
    status: data.status || 'Operational',
    contents: data.contents || '',
    visibility: data.visibility || 'public'
  };
}

function createShipRecord(data = {}) {
  const meta = getShipClassMeta(data.classId);
  return {
    id: data.id || `ship_${Math.random().toString(36).slice(2, 10)}`,
    classId: data.classId,
    name: data.name || meta?.displayName || 'Unbenanntes Schiff',
    commander: data.commander || '',
    faction: data.faction || 'GAR',
    status: data.status || 'active',
    locationPlanetId: data.locationPlanetId || '',
    assignedFleetId: data.assignedFleetId || '',
    canJump: typeof data.canJump === 'boolean' ? data.canJump : (meta?.canJump ?? true),
    createdFrom: data.createdFrom || 'manual'
  };
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
    startedBy: String(data.startedBy || '').trim(),
    status: data.status || 'building',
    producedShipId: data.producedShipId || '',
    completedAt: Number(data.completedAt || 0) || 0
  };
}

function createReadyShipFromBuild(data = {}) {
  const meta = getShipClassMeta(data.classId);
  if (!meta) return null;
  const ship = createShipRecord({
    id: data.id || `ship_${Math.random().toString(36).slice(2, 10)}`,
    classId: data.classId,
    name: data.shipName || meta.displayName,
    faction: data.faction || 'GAR',
    status: 'ready',
    locationPlanetId: data.locationPlanetId || '',
    assignedFleetId: '',
    createdFrom: data.createdFrom || 'shipyard'
  });
  state.ships.push(ship);
  normalizeFleetShipAssignments();
  return ship;
}

function recordBuildProjectActivity(job, title, details = '', createdAt = Date.now()) {
  state.meta = state.meta || {};
  state.meta.buildProjectActivity = Array.isArray(state.meta.buildProjectActivity) ? state.meta.buildProjectActivity : [];
  state.meta.buildProjectActivity.unshift({
    id: `activity_${Math.random().toString(36).slice(2, 10)}`,
    createdAt,
    faction: job.faction || 'GAR',
    jobType: job.jobType || 'ship',
    title,
    details,
    location: getBuildJobLocationName(job),
    author: String(job.startedBy || '').trim()
  });
  state.meta.buildProjectActivity = state.meta.buildProjectActivity.slice(0, 80);
}

function ensureShipyardLogStore() {
  state.meta = state.meta || {};
  state.meta.shipyardLogs = Array.isArray(state.meta.shipyardLogs) ? state.meta.shipyardLogs : [];
  return state.meta.shipyardLogs;
}

function createShipyardLogEntry(data = {}) {
  return {
    id: data.id || `shipyardlog_${Math.random().toString(36).slice(2, 10)}`,
    faction: data.faction || 'GAR',
    eventAt: data.eventAt || new Date().toISOString(),
    location: String(data.location || '').trim(),
    method: String(data.method || '').trim(),
    subject: String(data.subject || '').trim(),
    details: String(data.details || '').trim(),
    createdAt: data.createdAt || Date.now(),
    author: String(data.author || '').trim()
  };
}

function getShipyardLogs(faction = 'GAR') {
  return ensureShipyardLogStore()
    .filter((entry) => (entry.faction || 'GAR') === faction)
    .sort((a, b) => Date.parse(b.eventAt || b.createdAt || 0) - Date.parse(a.eventAt || a.createdAt || 0))
    .slice(0, 40);
}

function getBuildJobCost(job) {
  if (!job) return {};
  if (job.jobType === 'mine') return getMineProjectMeta(job.buildingKey || job.resourceKey)?.cost || {};
  return getShipClassMeta(job.classId)?.cost || {};
}

function getBuildJobRefund(job, ratio = 0.9) {
  const cost = getBuildJobCost(job);
  return RESOURCE_KEYS.reduce((refund, resourceKey) => {
    const value = Number(cost?.[resourceKey] || 0);
    refund[resourceKey] = value > 0 ? Math.round(value * ratio) : 0;
    return refund;
  }, {});
}

function refundShipBuildCostToGar(job, refund) {
  const planet = planetIndex.get(job.buildLocationPlanetId);
  const sectorInfo = planet ? getOperationalSectorInfoForPlanet(planet) : null;
  STORAGE_RESOURCE_KEYS.forEach((resourceKey) => {
    const amount = Number(refund?.[resourceKey] || 0);
    if (amount <= 0) return;
    const stored = sectorInfo ? addStockToSectorWarehouses(sectorInfo.id, resourceKey, amount) : 0;
    const remaining = amount - stored;
    if (remaining > 0) getFactionResourcePool('GAR')[resourceKey] = Number(getFactionResourcePool('GAR')[resourceKey] || 0) + remaining;
  });
  if (Number(refund?.credits || 0) > 0) getFactionResourcePool('GAR').credits = Number(getFactionResourcePool('GAR').credits || 0) + Number(refund.credits || 0);
}

function canCancelBuildJob(job) {
  if (!job || job.status !== 'building') return false;
  const role = currentRole();
  if (role === 'Admin') return true;
  if (role === 'Senat') return (job.faction || 'GAR') === 'GAR' && job.jobType === 'mine';
  if (role === 'Eventleiter / KUS') return (job.faction || 'GAR') === 'KUS';
  if (role === 'Republic Navy / GAR') return (job.faction || 'GAR') === 'GAR' && job.jobType !== 'mine' && canCoordinate4thFleet();
  return false;
}

function cancelBuildJob(jobId) {
  const job = state.buildJobs.find((entry) => entry.id === jobId);
  if (!job || job.status !== 'building') return;
  if (!canCancelBuildJob(job)) {
    setStatus('Dieser Bauauftrag darf mit deiner aktuellen Rolle nicht abgebrochen werden.');
    return;
  }
  const refund = getBuildJobRefund(job, 0.9);
  if ((job.faction || 'GAR') === 'GAR') {
    if (job.jobType === 'mine') addFactionResources('GAR', refund);
    else refundShipBuildCostToGar(job, refund);
  } else if ((job.faction || 'GAR') === 'KUS') {
    addFactionResources('KUS', refund);
  }
  job.status = 'cancelled';
  job.completedAt = Date.now();
  const refundLabel = RESOURCE_KEYS
    .filter((resourceKey) => Number(refund[resourceKey] || 0) > 0)
    .map((resourceKey) => `${RESOURCE_LABELS[resourceKey]} ${formatResourceAmount(refund[resourceKey])}`)
    .join(' • ');
  recordBuildProjectActivity(
    job,
    'Bau abgebrochen',
    `${getBuildJobDisplayName(job)} wurde abgebrochen. Rückerstattung: ${refundLabel || 'Keine Ressourcen'}.`
  );
  saveLocal();
  playAudioCue(datapadDeleteAudio);
  if (activeMainTab === 'shipyard') renderShipyardView();
  if (activeMainTab === 'buildProjects') renderBuildProjectsView();
  setStatus(`${getBuildJobDisplayName(job)} abgebrochen. 90% der Ressourcen wurden zurückerstattet.`);
}

function processBuildJobs(now = Date.now()) {
  let changed = false;
  const retentionMs = 48 * 60 * 60 * 1000;
  state.buildJobs.forEach((job) => {
    if (job.status !== 'building' || now < job.finishesAt) return;
    if (job.jobType === 'transport') {
      const delivered = addStockToLogisticsLocation(job.targetSectorId, job.resourceKey, job.amount);
      const overflow = Math.max(0, Number(job.amount || 0) - delivered);
      if (overflow > 0) {
        const refund = createEmptyFactionResources();
        refund[job.resourceKey] = overflow;
        addFactionResources(job.faction || 'GAR', refund);
      }
      job.status = 'completed';
      job.completedAt = now;
      recordBuildProjectActivity(job, 'Transport abgeschlossen', `${RESOURCE_LABELS[job.resourceKey] || job.resourceKey}: ${formatResourceAmount(job.amount)} nach ${getSectorDisplayName(job.targetSectorId)}`, now);
      changed = true;
      return;
    }
    if (job.jobType === 'mine') {
      const planet = planetIndex.get(job.buildLocationPlanetId);
      const slots = getPlanetResourceSlots(job.buildLocationPlanetId);
      const buildingKey = job.buildingKey || job.resourceKey;
      if (!planet || planet.owner !== 'GAR' || !INFRASTRUCTURE_KEYS.includes(buildingKey) || !Number.isInteger(job.targetSlotIndex) || job.targetSlotIndex < 0 || job.targetSlotIndex >= slots.length) {
        job.status = 'cancelled';
        changed = true;
        return;
      }
      if (slots[job.targetSlotIndex]) {
        job.status = 'cancelled';
        changed = true;
        return;
      }
      slots[job.targetSlotIndex] = buildingKey;
      setPlanetResourceSlots(job.buildLocationPlanetId, slots);
      syncWarehouseStoreForPlanet(job.buildLocationPlanetId);
      job.status = 'completed';
      job.completedAt = now;
      recordBuildProjectActivity(job, 'Bauprojekt abgeschlossen', `${getMineProjectMeta(buildingKey)?.label || buildingKey} auf ${getBuildJobLocationName(job)}`, now);
      changed = true;
      return;
    }
    const meta = getShipClassMeta(job.classId);
    if (!meta) {
      job.status = 'cancelled';
      changed = true;
      return;
    }
    const ship = createReadyShipFromBuild({
      id: job.producedShipId || `ship_${Math.random().toString(36).slice(2, 10)}`,
      classId: job.classId,
      shipName: job.shipName || meta.displayName,
      faction: job.faction || 'GAR',
      locationPlanetId: job.buildLocationPlanetId,
      createdFrom: 'shipyard'
    });
    if (!ship) return;
    job.producedShipId = ship.id;
    job.status = 'ready';
    job.completedAt = now;
    recordBuildProjectActivity(job, 'Schiff fertiggestellt', `${job.shipName || meta.displayName} in ${getBuildJobLocationName(job)}`, now);
    changed = true;
  });
  const beforeLength = state.buildJobs.length;
  state.buildJobs = state.buildJobs.filter((job) => (
    job.status === 'building'
    || !job.completedAt
    || (now - Number(job.completedAt || 0)) < retentionMs
  ));
  if (state.buildJobs.length !== beforeLength) changed = true;
  return changed;
}

function enforceStrategicOwnershipRules() {
  let changed = false;
  state.buildJobs.forEach((job) => {
    if (job.status !== 'building') return;
    const planet = planetIndex.get(job.buildLocationPlanetId);
    const requiredOwner = job.faction === 'KUS' ? 'KUS' : 'GAR';
    if (!planet || planet.owner !== requiredOwner) {
      job.status = 'cancelled';
      changed = true;
    }
  });
  state.ships.forEach((ship) => {
    if (!isStationClass(ship.classId)) return;
    const planet = ship.locationPlanetId ? planetIndex.get(ship.locationPlanetId) : null;
    if (planet && planet.owner !== 'GAR' && ship.status !== 'lost') {
      ship.status = 'lost';
      ship.assignedFleetId = '';
      changed = true;
    }
  });
  if (changed) normalizeFleetShipAssignments();
  return changed;
}

function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

function renderResourcePills(slots) {
  const visibleSlots = (slots || []).filter((slot) => getMineProjectMeta(slot));
  if (!visibleSlots.length) return '<span class="muted">Keine Infrastruktur vorhanden.</span>';
  return visibleSlots.map((slot) => {
    const building = getMineProjectMeta(slot);
    const category = building.category === 'development'
      ? 'Entwicklungszentrum'
      : (building.category === 'civilian' ? 'Zivil' : (building.category === 'storage' ? 'Lager' : 'Militärisch'));
    return `<span class="resource-pill">${category}: ${building.label}</span>`;
  }).join('');
}

function getPlanetInfrastructureBreakdown(slots) {
  const summary = { military: 0, civilian: 0, development: 0, storage: 0, empty: 0 };
  (slots || []).forEach((slot) => {
    const building = getMineProjectMeta(slot);
    if (!building) {
      summary.empty += 1;
      return;
    }
    const category = building.category || 'military';
    if (Object.prototype.hasOwnProperty.call(summary, category)) summary[category] += 1;
    else summary.military += 1;
  });
  return summary;
}

function getBuildJobProgress(job, now = Date.now()) {
  const startedAt = Number(job?.startedAt) || now;
  const finishesAt = Number(job?.finishesAt) || now;
  if (finishesAt <= startedAt) return job?.status === 'building' ? 0 : 1;
  return clamp((now - startedAt) / (finishesAt - startedAt), 0, 1);
}

function getBuildJobDisplayName(job) {
  if (job?.jobType === 'mine') return job.projectName || (getMineProjectMeta(job.buildingKey || job.resourceKey)?.label || 'Infrastrukturprojekt');
  return job?.shipName || getShipClassMeta(job?.classId)?.displayName || 'Bauprojekt';
}

function getBuildJobLocationName(job) {
  return planetIndex.get(job?.buildLocationPlanetId)?.name || '—';
}

function getSectorDisplayName(sectorId) {
  return getLogisticsLocationName(sectorId);
}

function getBuildJobTypeLabel(job) {
  if (job?.jobType !== 'mine') return 'Schiffbau';
  const category = getMineProjectMeta(job.buildingKey || job.resourceKey)?.category;
  if (category === 'development') return 'Wirtschafts- und Entwicklungszentrum';
  if (category === 'storage') return 'Lagerbau';
  return category === 'civilian' ? 'Zivile Infrastruktur' : 'Militärische Infrastruktur';
}

function getBuildJobProgressBar(job) {
  const progress = Math.round(getBuildJobProgress(job) * 100);
  const fillClass = job?.jobType === 'mine' ? 'project-progress-fill mine' : 'project-progress-fill';
  return `
    <div class="project-progress">
      <div class="${fillClass}" style="width:${progress}%"></div>
    </div>
    <div class="project-meta">${progress}% • ${job.status === 'building' ? formatDuration((job.finishesAt || 0) - Date.now()) : (job.status === 'completed' ? 'Abgeschlossen' : job.status === 'ready' ? 'Abholbereit' : 'Abgebrochen')}</div>
  `;
}

function startMineBuildProject() {
  if (!canBuildMineProjects()) {
    setStatus('Nur Senats-Admins oder globale Admins können Infrastrukturprojekte starten.');
    return;
  }
  const planetId = document.getElementById('mineBuildPlanet')?.value || '';
  const buildingKey = document.getElementById('mineBuildResource')?.value || '';
  const slotIndex = Number(document.getElementById('mineBuildSlot')?.value ?? -1);
  const planet = planetIndex.get(planetId);
  const project = getMineProjectMeta(buildingKey);
  if (!planet || planet.owner !== 'GAR') {
    setStatus('Infrastrukturbau ist nur auf republikanischen Planeten möglich.');
    return;
  }
  if (!project || !INFRASTRUCTURE_KEYS.includes(buildingKey)) {
    setStatus('Bitte einen gültigen Gebäudetyp wählen.');
    return;
  }
  if (project.category === 'storage' && !isWarehousePlanetEligible(planetId)) {
    setStatus('Ressourcenlager nur auf Hyperraum-Routen-Planeten möglich.');
    renderBuildProjectsView();
    return;
  }
  const slots = getPlanetResourceSlots(planetId);
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slots.length) {
    setStatus('Bitte einen freien Infrastruktur-Slot wählen.');
    return;
  }
  if (isMineSlotUnderConstruction(planetId, slotIndex)) {
    setStatus('Dieser Slot wird bereits bebaut.');
    renderBuildProjectsView();
    return;
  }
  if (slots[slotIndex]) {
    setStatus('Der gewählte Infrastruktur-Slot ist bereits belegt.');
    return;
  }
  const warehouseCompliance = getMineWarehouseCompliance(planet, project);
  if (!warehouseCompliance.ok) {
    setStatus(warehouseCompliance.reason);
    renderBuildProjectsView();
    return;
  }
  if (!spendGarInfrastructureCost(project.cost)) {
    setStatus('Nicht genug GAR-Ressourcen für dieses Infrastrukturprojekt.');
    renderBuildProjectsView();
    return;
  }
  state.buildJobs.push(createBuildJobRecord({
    jobType: 'mine',
    projectName: `${project.label} (${planet.name})`,
    buildLocationPlanetId: planetId,
    targetSlotIndex: slotIndex,
    resourceKey: project.productionResource || '',
    buildingKey,
    startedAt: Date.now(),
    finishesAt: Date.now() + (MINE_BUILD_DURATION_HOURS * RESOURCE_PRODUCTION_TICK_MS),
    faction: 'GAR',
    startedBy: currentAuthenticatedUsername || currentAssignedRole(),
    status: 'building'
  }));
  saveLocal();
  playAudioCue(datapadAcceptAudio);
  renderBuildProjectsView();
  if (activeMainTab === 'shipyard') renderShipyardView();
  setStatus(`Infrastrukturprojekt gestartet: ${project.label} auf ${planet.name} (Slot ${slotIndex + 1})`);
}

function saveShipyardLogEntry() {
  const faction = getActiveShipyardFaction();
  if (faction !== 'GAR' || !canCoordinate4thFleet()) {
    setStatus('Schiffbau-Logs fuer GAR duerfen nur von der 4th Flottenkoordination gepflegt werden.');
    return;
  }
  const eventAtRaw = document.getElementById('shipyardLogWhen')?.value || '';
  const location = document.getElementById('shipyardLogWhere')?.value.trim() || '';
  const method = document.getElementById('shipyardLogHow')?.value.trim() || '';
  const subject = document.getElementById('shipyardLogWhat')?.value.trim() || '';
  const details = document.getElementById('shipyardLogDetails')?.value.trim() || '';
  if (!eventAtRaw || !location || !method || !subject) {
    setStatus('Bitte im Schiffbau-Log mindestens Wann, Wo, Wie und Was ausfuellen.');
    return;
  }
  ensureShipyardLogStore().unshift(createShipyardLogEntry({
    faction,
    eventAt: new Date(eventAtRaw).toISOString(),
    location,
    method,
    subject,
    details,
    author: currentAuthenticatedUsername || currentAssignedRole()
  }));
  ensureShipyardLogStore().splice(40);
  saveLocal();
  renderShipyardView();
  setStatus('Schiffbau-Log gespeichert.');
}

function startWarehouseBuildProject() {
  if (!canBuildWarehouses()) {
    setStatus('Nur Senats-Admins oder globale Admins können Lager bauen.');
    return;
  }
  const planetId = document.getElementById('warehouseBuildPlanet')?.value || '';
  const planet = planetIndex.get(planetId);
  if (!planet || planet.owner !== 'GAR') {
    setStatus('Lager können nur auf republikanischen Planeten gebaut werden.');
    return;
  }
  if (!isWarehousePlanetEligible(planetId)) {
    setStatus('Lokale Lager dürfen nur auf Planeten mit sichtbarer Hyperraumroute gebaut werden.');
    return;
  }
  const availableSlots = getAvailableMineSlots(planetId);
  const slot = availableSlots[0];
  if (!slot) {
    setStatus('Auf diesem Planeten ist kein freier Slot mehr verfügbar.');
    return;
  }
  if (getPlanetWarehouses(planetId).length) {
    setStatus('Auf diesem Planeten existiert bereits ein lokales Lager.');
    return;
  }
  const project = getMineProjectMeta(LOCAL_WAREHOUSE_BUILDING_KEY);
  if (!project || !spendGarInfrastructureCost(project.cost)) {
    setStatus('Nicht genug GAR-Ressourcen für den Lagerbau.');
    renderBuildProjectsView();
    return;
  }
  state.buildJobs.push(createBuildJobRecord({
    jobType: 'mine',
    projectName: `${project.label} (${planet.name})`,
    buildLocationPlanetId: planetId,
    targetSlotIndex: slot.index,
    resourceKey: '',
    buildingKey: LOCAL_WAREHOUSE_BUILDING_KEY,
    startedAt: Date.now(),
    finishesAt: Date.now() + (MINE_BUILD_DURATION_HOURS * RESOURCE_PRODUCTION_TICK_MS),
    faction: 'GAR',
    startedBy: currentAuthenticatedUsername || currentAssignedRole(),
    status: 'building'
  }));
  saveLocal();
  playAudioCue(datapadAcceptAudio);
  renderBuildProjectsView();
  setStatus(`Lagerbau gestartet: ${project.label} auf ${planet.name} (Slot ${slot.index + 1})`);
}

function upgradeWarehouse(warehouseId) {
  const warehouse = ensureWarehouseStore().find((entry) => entry.id === warehouseId);
  if (!warehouse) {
    setStatus('Lager nicht gefunden.');
    return;
  }
  if (!canBuildWarehouses()) {
    setStatus('Nur Senats-Admins oder globale Admins können Lager upgraden.');
    return;
  }
  if (warehouse.level >= WAREHOUSE_MAX_LEVEL) {
    setStatus('Dieses Lager hat bereits die maximale Ausbaustufe erreicht.');
    return;
  }
  const cost = getWarehouseUpgradeCost(warehouse.level);
  if (!spendGarInfrastructureCost(cost)) {
    setStatus('Nicht genug GAR-Ressourcen für das Lager-Upgrade.');
    return;
  }
  warehouse.level += 1;
  warehouse.stockByResource = sanitizeWarehouseStock(warehouse.stockByResource);
  saveLocal();
  if (selected?.type === 'planet' && selected.id === warehouse.planetId) openPlanet(warehouse.planetId);
  if (activeMainTab === 'buildProjects') renderBuildProjectsView();
  if (activeMainTab === 'shipyard') renderShipyardView();
  setStatus(`Lager-Upgrade abgeschlossen: Universallager jetzt Stufe ${warehouse.level}.`);
}

function closeMineBuildPlanetResults() {
  const resultsEl = document.getElementById('mineBuildPlanetResults');
  if (resultsEl) {
    resultsEl.innerHTML = '';
    resultsEl.classList.add('hidden');
  }
  mineBuildPlanetSearchState.results = [];
  mineBuildPlanetSearchState.activeIndex = -1;
}

function renderMineBuildPlanetResults() {
  const resultsEl = document.getElementById('mineBuildPlanetResults');
  if (!resultsEl) return;
  resultsEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  const category = document.getElementById('infrastructureCategory')?.value || 'military';
  mineBuildPlanetSearchState.results.forEach((planet, index) => {
    const row = document.createElement('div');
    row.className = 'search-result' + (index === mineBuildPlanetSearchState.activeIndex ? ' active' : '');
    const storageBlocked = category === 'storage' && !planet.storageEligible;
    row.innerHTML = `<strong>${planet.name}</strong><small>${planet.grid || '—'} • ${planet.sector || '—'} • ${planet.region || 'Unknown Region'}${storageBlocked ? ' • Keine Hyperraum-Anbindung' : ''}</small>`;
    row.addEventListener('mousedown', (event) => {
      event.preventDefault();
      if (storageBlocked) {
        setStatus('Ressourcenlager nur auf Hyperraum-Routen-Planeten möglich.');
        return;
      }
      chooseMineBuildPlanet(planet.id);
    });
    row.classList.toggle('disabled', storageBlocked);
    frag.appendChild(row);
  });
  resultsEl.appendChild(frag);
  resultsEl.classList.toggle('hidden', !mineBuildPlanetSearchState.results.length);
}

function updateMineBuildPlanetSearch(query) {
  const normalizedQuery = normalizeSearchText(query).trim();
  if (!normalizedQuery) {
    closeMineBuildPlanetResults();
    return;
  }
  const category = document.getElementById('infrastructureCategory')?.value || 'military';
  mineBuildPlanetSearchState.results = getMineProjectPlanetChoices(category)
    .map((planet) => ({ planet, haystack: getPlanetSearchHaystack(planet) }))
    .filter((entry) => entry.haystack.includes(normalizedQuery))
    .sort((a, b) => a.planet.name.localeCompare(b.planet.name, 'de'))
    .slice(0, 10)
    .map((entry) => entry.planet);
  mineBuildPlanetSearchState.activeIndex = mineBuildPlanetSearchState.results.length ? 0 : -1;
  renderMineBuildPlanetResults();
}

function chooseMineBuildPlanet(planetId) {
  const category = document.getElementById('infrastructureCategory')?.value || 'military';
  const planet = getMineProjectPlanetChoices(category).find((entry) => entry.id === planetId);
  const input = document.getElementById('mineBuildPlanetSearch');
  const hidden = document.getElementById('mineBuildPlanet');
  if (!planet || !input || !hidden) return;
  if (category === 'storage' && !planet.storageEligible) {
    setStatus('Ressourcenlager nur auf Hyperraum-Routen-Planeten möglich.');
    return;
  }
  input.value = planet.name;
  hidden.value = planet.id;
  closeMineBuildPlanetResults();
  renderBuildProjectsView();
}

function moveMineBuildPlanetSelection(direction) {
  if (!mineBuildPlanetSearchState.results.length) return;
  mineBuildPlanetSearchState.activeIndex = (
    mineBuildPlanetSearchState.activeIndex
    + direction
    + mineBuildPlanetSearchState.results.length
  ) % mineBuildPlanetSearchState.results.length;
  renderMineBuildPlanetResults();
}

function focusPlanetOnMap(planetId) {
  const planet = planetIndex.get(planetId);
  if (!planet) return;
  setMainTab('map');
  focusPlanetFromSearch(planet.id);
}

function highlightFleetManagementElement(targetKey) {
  activeFleetManagementHighlightKey = targetKey || '';
  if (activeFleetManagementHighlightTimer) clearTimeout(activeFleetManagementHighlightTimer);
  if (!activeFleetManagementHighlightKey) return;
  if (activeFleetManagementHighlightKey.startsWith('fleet:')) {
    ensureFleetCategoryVisibleForFleetId(activeFleetManagementHighlightKey.slice(6));
  } else if (activeFleetManagementHighlightKey.startsWith('ship:')) {
    const ship = state.ships.find((entry) => entry.id === activeFleetManagementHighlightKey.slice(5));
    if (ship?.assignedFleetId) ensureFleetCategoryVisibleForFleetId(ship.assignedFleetId);
  }
  renderFleetManagementView();
  requestAnimationFrame(() => {
    const selector = `[data-focus-key="${activeFleetManagementHighlightKey}"]`;
    const target = workspacePanel.querySelector(selector);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add(target.matches('tr') ? 'focus-highlight-row' : 'focus-highlight');
  });
  activeFleetManagementHighlightTimer = window.setTimeout(() => {
    const previousKey = activeFleetManagementHighlightKey;
    activeFleetManagementHighlightKey = '';
    const target = workspacePanel.querySelector(`[data-focus-key="${previousKey}"]`);
    if (target) {
      target.classList.remove('focus-highlight', 'focus-highlight-row');
    }
    renderFleetManagementView();
  }, 7000);
}

function ensureFleetCategoryVisibleForFleetId(fleetId) {
  const fleet = fleetIndex.get(fleetId) || state.fleets.find((entry) => entry.id === fleetId);
  if (!fleet?.categoryId) return;
  if (fleetCategoryCollapsedIds.has(fleet.categoryId)) {
    fleetCategoryCollapsedIds.delete(fleet.categoryId);
    saveClientUiPrefs();
  }
}

function openFleetInManagement(fleetId) {
  if (!fleetId) return;
  ensureFleetCategoryVisibleForFleetId(fleetId);
  setMainTab('fleetManagement');
  openFleetManifestInManagement(fleetId);
}

function focusFleetOnMap(fleetId, shipId = '') {
  const fleet = fleetIndex.get(fleetId);
  if (!fleet) return;
  const planetId = fleet.locationPlanetId || fleet.planetId;
  if (!planetId) return;
  pendingFleetManifestHighlightShipId = shipId || '';
  setMainTab('map');
  focusPlanetFromSearch(planetId);
  openFleet(fleet.id);
}

function focusShipOnMap(shipId) {
  const ship = state.ships.find((entry) => entry.id === shipId);
  if (!ship?.locationPlanetId) return;
  if (ship.assignedFleetId && fleetIndex.get(ship.assignedFleetId)) {
    focusFleetOnMap(ship.assignedFleetId, ship.id);
    return;
  }
  setMainTab('map');
  focusPlanetFromSearch(ship.locationPlanetId);
  openPlanet(ship.locationPlanetId);
}

function getFleetManagementSearchCandidates() {
  const visibleFactions = getFleetManagementVisibleFactions();
  const fleetCandidates = state.fleets
    .filter((fleet) => visibleFactions.has(fleet.faction))
      .map((fleet) => ({
        type: 'fleet',
        id: fleet.id,
        label: fleet.name,
        meta: `${fleet.faction} • ${fleet.assignment || 'ohne Zuordnung'} • ${fleet.commander || fleet.leader || 'kein CO'} • ${getFleetDisplayLocation(fleet)}`,
        search: normalizeSearchText(`${fleet.name} ${fleet.commander || fleet.leader || ''} ${fleet.assignment || ''} ${getFleetDisplayLocation(fleet)}`)
      }));
  const shipCandidates = state.ships
    .filter((ship) => visibleFactions.has(ship.faction))
    .map((ship) => {
      const fleet = state.fleets.find((entry) => entry.id === ship.assignedFleetId);
      return {
        type: 'ship',
        id: ship.id,
        label: ship.name,
        meta: `${ship.faction} • ${getShipClassMeta(ship.classId)?.displayName || ship.classId} • ${fleet?.name || 'Nicht zugeteilt'}`,
        search: normalizeSearchText(`${ship.name} ${getShipClassMeta(ship.classId)?.displayName || ''} ${ship.commander || ''} ${fleet?.name || ''}`)
      };
    });
  return [...fleetCandidates, ...shipCandidates];
}

function closeFleetManagementSearchResults(clearSelection = true) {
  const resultsEl = document.getElementById('fleetMgmtSearchResults');
  if (resultsEl) {
    resultsEl.innerHTML = '';
    resultsEl.classList.add('hidden');
  }
  fleetManagementSearchResultsState = [];
  if (clearSelection) fleetManagementSearchActiveIndex = -1;
}

function applyFleetManagementSearchChoice(choice) {
  if (!choice) return;
  const searchInput = document.getElementById('fleetMgmtSearch');
  if (searchInput) searchInput.value = choice.label;
  fleetManagementSearchQuery = choice.label;
  closeFleetManagementSearchResults();
  if (choice.type === 'ship') {
    highlightFleetManagementElement(`ship:${choice.id}`);
    setStatus(`Schiff gefunden: ${choice.label}`);
    return;
  }
  highlightFleetManagementElement(`fleet:${choice.id}`);
  setStatus(`Verband gefunden: ${choice.label}`);
}

function renderFleetManagementSearchResults() {
  const resultsEl = document.getElementById('fleetMgmtSearchResults');
  if (!resultsEl) return;
  if (!fleetManagementSearchResultsState.length) {
    closeFleetManagementSearchResults();
    return;
  }
  resultsEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  fleetManagementSearchResultsState.forEach((choice, index) => {
    const row = document.createElement('div');
    row.className = 'search-result' + (index === fleetManagementSearchActiveIndex ? ' active' : '');
    row.innerHTML = `<strong>${choice.label}</strong><small>${choice.meta}</small>`;
    row.addEventListener('mousedown', (event) => {
      event.preventDefault();
      applyFleetManagementSearchChoice(choice);
    });
    frag.appendChild(row);
  });
  resultsEl.appendChild(frag);
  resultsEl.classList.remove('hidden');
}

function updateFleetManagementSearchResults(query) {
  const normalized = normalizeSearchText(query);
  if (normalized.length < 2) {
    closeFleetManagementSearchResults();
    return;
  }
  fleetManagementSearchResultsState = getFleetManagementSearchCandidates()
    .filter((choice) => choice.search.includes(normalized))
    .slice(0, 10);
  fleetManagementSearchActiveIndex = fleetManagementSearchResultsState.length ? 0 : -1;
  renderFleetManagementSearchResults();
}

function moveFleetManagementSearchSelection(direction) {
  if (!fleetManagementSearchResultsState.length) return;
  fleetManagementSearchActiveIndex = (fleetManagementSearchActiveIndex + direction + fleetManagementSearchResultsState.length) % fleetManagementSearchResultsState.length;
  renderFleetManagementSearchResults();
}

