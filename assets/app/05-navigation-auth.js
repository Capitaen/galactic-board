// Generated from app-shell.js: navigation, auth, role gating, search, app entry actions

function setMainTab(tabId) {
  runCampaignMaintenance();
  playAudioCue(datapadClickAudio);
  activeMainTab = tabId;
  document.querySelectorAll('.main-tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mainTab === tabId);
  });
  const isMap = tabId === 'map';
  workspacePanel.classList.toggle('active', !isMap);
  viewport.style.pointerEvents = isMap ? 'auto' : 'none';
  viewport.style.opacity = isMap ? '1' : '.18';
  document.querySelector('.toolstack').classList.toggle('workspace-hidden', !isMap);
  document.getElementById('homeBtn').classList.toggle('workspace-hidden', !isMap);
  document.getElementById('layersBtn').disabled = !isMap;
  document.getElementById('layersPanel').style.display = isMap ? document.getElementById('layersPanel').style.display : 'none';
  legendPanel.classList.toggle('active', isMap && Boolean(layers.legend));
  if (!isMap) infoPanel.style.display = 'none';
  if (isMap) {
    workspacePanel.innerHTML = '';
  } else if (tabId === 'fleetManagement') {
    renderFleetManagementView();
  } else if (tabId === 'shipyard') {
    renderShipyardView();
  } else if (tabId === 'buildProjects') {
    renderBuildProjectsView();
  } else if (tabId === 'economy') {
    renderEconomyView();
    if (!economyViewState.loaded) void ensureEconomyViewLoaded({ showLoader: true });
    else if ((Date.now() - Number(economyViewState.lastLoadedAt || 0)) > 120000) void fetchEconomyView({ renderLoading: false });
  } else if (tabId === 'loginManager') {
    renderLoginManagerView();
  } else if (tabId === 'radioCommandCenter') {
    renderRadioCommandCenterView();
    void fetchRadioCommandCenterData();
  }
}

function detectShipClassId(text) {
  const normalized = normalizeSearchText(text);
  for (const entry of SHIP_CLASS_IMPORT_PATTERNS) {
    if (entry.patterns.some((pattern) => normalized.includes(normalizeSearchText(pattern)))) return entry.classId;
  }
  return null;
}

function parseCommanderFromLabel(label) {
  const match = String(label || '').match(/(?:^|[|,])\s*CO\s+([^|,\n]+)/i);
  return match ? match[1].trim() : '';
}

function extractPlayerLeadFromText(text) {
  const match = String(text || '').match(/(?:spieler|player|leitung|player-leitung)\s*:\s*([^\n|,]+)/i);
  return match ? match[1].trim() : '';
}

function extractPositionFromText(text) {
  const match = String(text || '').match(/position\s*:\s*([^\n|,]+)/i);
  return match ? match[1].trim() : '';
}

function extractOfficerFromText(text) {
  const match = String(text || '').match(/(?:befehlshabender\s+offizier|co)\s*[: ]\s*([^\n|,]+)/i);
  if (!match) return '';
  const candidate = match[1].trim();
  if (!candidate || /^vakant$/i.test(candidate) || /^co$/i.test(candidate)) return '';
  return candidate;
}

function getImportClassPatterns(classId) {
  const meta = getShipClassMeta(classId);
  const patternEntry = SHIP_CLASS_IMPORT_PATTERNS.find((entry) => entry.classId === classId);
  return [meta?.displayName, ...(patternEntry?.patterns || [])]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
}

function extractImportShipName(rawName, classId) {
  const baseName = String(rawName || '').trim();
  if (!baseName) return getShipClassMeta(classId)?.displayName || 'Unbenannt';
  const quotedMatch = baseName.match(/[\"“„]([^\"“”„]+)[\"”]/);
  if (quotedMatch?.[1]) return quotedMatch[1].trim();
  let working = baseName
    .replace(/\s*\|\s*\d+\s*tage?\s*bauzeit.*$/i, '')
    .replace(/\s*\|\s*co\b.*$/i, '')
    .replace(/\s*,\s*co\b.*$/i, '')
    .trim();
  for (const pattern of getImportClassPatterns(classId)) {
    const regex = new RegExp(`^${escapeRegExp(pattern).replace(/\s+/g, '[\\\\s-]*')}\\s*[-,:|]*\\s*`, 'i');
    const next = working.replace(regex, '').trim();
    if (next && next !== working) {
      working = next;
      break;
    }
  }
  working = working.replace(/^RSS\s+/i, 'RSS ').trim();
  working = working.replace(/^["'„“]+|["'“”]+$/g, '').trim();
  return working || getShipClassMeta(classId)?.displayName || 'Unbenannt';
}

function parseImportCardMeta(card, fleet, classId) {
  const name = String(card?.name || '');
  const desc = String(card?.desc || '');
  const playerLead = extractPlayerLeadFromText(desc) || extractPlayerLeadFromText(name);
  const commander = playerLead || extractOfficerFromText(desc) || parseCommanderFromLabel(name) || parseCommanderFromLabel(desc) || fleet.commander || fleet.leader || '';
  const rawPosition = extractPositionFromText(desc) || extractPositionFromText(name);
  const resolvedPlanet = resolvePlanetBySearchValue(rawPosition) || planetIndex.get(fleet.locationPlanetId || fleet.planetId) || null;
  return {
    cleanName: extractImportShipName(name, classId),
    commander,
    locationPlanetId: resolvedPlanet?.id || '',
    sourcePositionLabel: rawPosition || resolvedPlanet?.name || ''
  };
}

function importTrelloData(payload) {
  const board = Array.isArray(payload?.boards)
    ? payload.boards.find((entry) => normalizeSearchText(entry.name || '').includes('4. flottenkoordination')) || payload.boards[0]
    : payload;
  const lists = Array.isArray(board?.lists) ? board.lists : Array.isArray(payload?.lists) ? payload.lists : [];
  const cards = Array.isArray(board?.cards) ? board.cards : Array.isArray(payload?.cards) ? payload.cards : [];
  const warnings = [];
  const listMap = new Map(lists.map((list) => [list.id, list]));
  const validFleetMap = new Map();
  lists.forEach((list) => {
    const normalizedName = normalizeSearchText(list.name || '');
    if (!normalizedName || TRELLO_EXCLUDED_LISTS.has(normalizedName)) return;
    const existing = state.fleets.find((fleet) => normalizeSearchText(fleet.name) === normalizedName);
    const fleet = existing || createFleetRecord({
      name: list.name,
      commander: parseCommanderFromLabel(list.name),
      faction: 'GAR'
    });
    if (!existing) state.fleets.push(fleet);
    validFleetMap.set(list.id, fleet);
  });
  cards.forEach((card) => {
    if (card.closed) return;
    const fleet = validFleetMap.get(card.idList);
    if (!fleet) return;
    const classId = detectShipClassId(card.name || '');
    if (!classId || !SHIP_CLASS_POOL[classId]) return;
    const parsed = parseImportCardMeta(card, fleet, classId);
    const candidateNames = new Set([
      normalizeSearchText(card.name),
      normalizeSearchText(parsed.cleanName)
    ]);
    const existingShip = state.ships.find((ship) => ship.classId === classId && candidateNames.has(normalizeSearchText(ship.name)));
    const assignedFleetId = isStationClass(classId) ? '' : fleet.id;
    const locationPlanetId = parsed.locationPlanetId || fleet.locationPlanetId || fleet.planetId || '';
    if (existingShip) {
      existingShip.classId = classId;
      existingShip.name = parsed.cleanName || existingShip.name;
      existingShip.commander = parsed.commander || existingShip.commander || '';
      existingShip.faction = 'GAR';
      existingShip.status = existingShip.status === 'lost' ? 'lost' : 'active';
      existingShip.locationPlanetId = locationPlanetId || existingShip.locationPlanetId || '';
      existingShip.assignedFleetId = assignedFleetId;
      existingShip.createdFrom = existingShip.createdFrom || 'trello';
      return;
    }
    state.ships.push(createShipRecord({
      classId,
      name: parsed.cleanName,
      commander: parsed.commander,
      faction: 'GAR',
      status: 'active',
      locationPlanetId,
      assignedFleetId,
      createdFrom: 'trello'
    }));
  });
  state.importWarnings = warnings;
  normalizeFleetShipAssignments();
  saveLocal();
  render({ positions: true, layers: true });
  renderFleetManagementView();
  setStatus(warnings.length ? `Trello-Import abgeschlossen mit ${warnings.length} Warnungen.` : 'Trello-Import abgeschlossen.');
}

function runCampaignMaintenance() {
  const producedTicks = serverSync.enabled ? 0 : applyProductionTicks();
  const buildChanged = processBuildJobs();
  const ruleChanged = enforceStrategicOwnershipRules();
  if (producedTicks || buildChanged || ruleChanged) {
    rebuildIndexes();
    saveLocal();
  }
  return Boolean(producedTicks || buildChanged || ruleChanged);
}

function ensureRouteMetaStore() {
  state.meta = state.meta || {};
  state.meta.routeMeta = state.meta.routeMeta || {};
  return state.meta.routeMeta;
}

function ensureCustomRouteStore() {
  state.meta = state.meta || {};
  state.meta.customRoutes = Array.isArray(state.meta.customRoutes) ? state.meta.customRoutes : [];
  return state.meta.customRoutes;
}

function getRouteId(a, b) {
  return [a.id, b.id].sort().join('__');
}

function getTacticalRouteId(route, index) {
  return `hyperlane__${normalizePlanetKey(route.name || `route_${index}`)}`;
}

function canonicalizeLoreRouteName(name) {
  const value = String(name || '').trim();
  const corrections = {
    'Perlimian Trade Route': 'Perlemian Trade Route',
    'Duantless Run': 'Dauntless Run',
    'Tertiery Etti Route': 'Tertiary Etti Route'
  };
  return corrections[value] || value;
}

function getRouteMeta(route) {
  const store = ensureRouteMetaStore();
  return store[route.id] || null;
}

function isUnnamedRoute(route) {
  return /^unnamed route(?:\s*\(\d+\))?$/i.test(String(route?.name || '').trim());
}

function isCustomRoute(route) {
  return Boolean(route?.isCustom);
}

function canManuallyEditRoute(route) {
  return isUnnamedRoute(route) || isCustomRoute(route);
}

function normalizeRouteConnection(connection) {
  const startPlanetId = String(connection?.startPlanetId || '').trim();
  const endPlanetId = String(connection?.endPlanetId || '').trim();
  if (!startPlanetId || !endPlanetId || startPlanetId === endPlanetId) return null;
  return {
    startPlanetId,
    endPlanetId,
    ...(Array.isArray(connection?.path) && connection.path.length >= 2 ? { path: connection.path } : {})
  };
}

function serializeRouteConnection(connection) {
  return {
    startPlanetId: connection.startPlanetId,
    endPlanetId: connection.endPlanetId,
    ...(Array.isArray(connection.path) && connection.path.length >= 2 ? { path: connection.path } : {})
  };
}

function createCustomRoute(connection, name = '') {
  const normalizedConnection = normalizeRouteConnection(connection);
  if (!normalizedConnection) return null;
  const routes = ensureCustomRouteStore();
  const route = {
    id: `custom_route_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: String(name || '').trim() || 'Neue Route',
    connections: [serializeRouteConnection(normalizedConnection)]
  };
  routes.push(route);
  return route;
}

function getRouteConnections(route) {
  const meta = getRouteMeta(route);
  const source = Array.isArray(route?.runtimeConnections)
    ? route.runtimeConnections
    : Array.isArray(meta?.connections)
      ? meta.connections
      : (route.autoConnections || []);
  const seen = new Set();
  return source.map(normalizeRouteConnection).filter((connection) => {
    if (!connection || !planetIndex.has(connection.startPlanetId) || !planetIndex.has(connection.endPlanetId)) return false;
    const key = [connection.startPlanetId, connection.endPlanetId].sort().join('__');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getRoutePlanets(route) {
  const meta = getRouteMeta(route);
  const planets = new Map();
  getRouteConnections(route).forEach((connection) => {
    const startPlanet = planetIndex.get(connection.startPlanetId);
    const endPlanet = planetIndex.get(connection.endPlanetId);
    if (startPlanet) planets.set(startPlanet.id, startPlanet);
    if (endPlanet) planets.set(endPlanet.id, endPlanet);
  });
  if (!planets.size && !Array.isArray(meta?.connections)) {
    (route.planets || []).forEach((planet) => planets.set(planet.id, planet));
  }
  return [...planets.values()];
}

function getRouteEndpointPlanets(route) {
  const degree = new Map();
  getRouteConnections(route).forEach((connection) => {
    degree.set(connection.startPlanetId, (degree.get(connection.startPlanetId) || 0) + 1);
    degree.set(connection.endPlanetId, (degree.get(connection.endPlanetId) || 0) + 1);
  });
  const endpoints = [...degree.entries()]
    .filter(([, count]) => count === 1)
    .map(([planetId]) => planetIndex.get(planetId))
    .filter(Boolean);
  return endpoints.length >= 2 ? endpoints : getRoutePlanets(route);
}

function getDefaultRouteDominance(route) {
  const routePlanets = getRoutePlanets(route);
  const endpoints = routePlanets.length
    ? routePlanets
    : [route.a, route.b].filter(Boolean);
  const total = endpoints.length || 1;
  const garCount = endpoints.filter((planet) => planet?.owner === 'GAR').length;
  const kusCount = endpoints.filter((planet) => planet?.owner === 'KUS').length;
  const huttCount = endpoints.filter((planet) => planet?.owner === 'HUTT').length;
  return {
    gar: Math.round((garCount / total) * 100),
    kus: Math.round((kusCount / total) * 100),
    hutt: Math.round((huttCount / total) * 100)
  };
}

function getRouteDominance(route) {
  const fallback = getDefaultRouteDominance(route);
  const gar = clamp(Number(fallback.gar) || 0, 0, 100);
  const kus = clamp(Number(fallback.kus) || 0, 0, 100);
  const hutt = clamp(Number(fallback.hutt) || 0, 0, 100);
  const neutral = Math.max(0, 100 - gar - kus - hutt);
  return { gar, kus, hutt, neutral };
}

function getRouteDisplayName(route) {
  const meta = getRouteMeta(route);
  const rawName = String(meta?.name || route?.name || '').trim();
  if ((!meta?.name && isUnnamedRoute(route)) || /^(?:gelöste|neue) route(?:\s+\d+)?$/i.test(rawName)) {
    const planets = getRouteEndpointPlanets(route);
    if (planets.length === 2) return `${planets[0].name} – ${planets[1].name}`;
    if (planets.length > 2) return `${planets[0].name} – ${planets[planets.length - 1].name}`;
  }
  if (meta?.name) return String(meta.name);
  if (route.name) return String(route.name);
  if (route.a && route.b) return `${route.a.name} - ${route.b.name}`;
  return route.id;
}

function renderTacticalRouteInteraction() {
  tacticalOverlay.querySelectorAll('.tactical-route-highlight').forEach((el) => el.remove());
  renderManualSectorOverlay();
  if (!layers.hyperlanes || !tacticalRouteCache.length) {
    renderTacticalHoverLabels();
    return;
  }
  const frag = document.createDocumentFragment();
  const selectedRoute = selected?.type === 'route' ? tacticalRouteCache.find((route) => route.id === selected.id) : null;
  const hoveredRoute = hoveredRouteId ? tacticalRouteCache.find((route) => route.id === hoveredRouteId) : null;
  const routesToDraw = [];
  if (hoveredRoute && (!selectedRoute || hoveredRoute.id !== selectedRoute.id)) routesToDraw.push({ route: hoveredRoute, className: 'hover' });
  if (selectedRoute) routesToDraw.push({ route: selectedRoute, className: 'selected' });
  routesToDraw.forEach(({ route, className }) => {
    route.svgPaths.forEach((pathData) => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('class', `tactical-route-highlight ${className}`);
      frag.appendChild(path);
    });
  });
  tacticalOverlay.appendChild(frag);
  renderTacticalHoverLabels();
}

function refreshRouteSelectionState() {
  overlay.querySelectorAll('[data-route-id]').forEach((el) => {
    const isSelected = selected?.type === 'route' && el.dataset.routeId === selected.id;
    const isHovered = hoveredRouteId && el.dataset.routeId === hoveredRouteId;
    el.classList.toggle('route-hovered', Boolean(isHovered) && !isSelected);
    el.classList.toggle('route-selected', isSelected);
  });
  renderTacticalRouteInteraction();
}

function buildFleetTravelGraph() {
  const graph = new Map();
  tacticalTravelEdges.forEach((edge) => {
    if (!planetIndex.has(edge.startPlanetId) || !planetIndex.has(edge.endPlanetId) || edge.length <= 0) return;
    if (!graph.has(edge.startPlanetId)) graph.set(edge.startPlanetId, []);
    if (!graph.has(edge.endPlanetId)) graph.set(edge.endPlanetId, []);
    graph.get(edge.startPlanetId).push({
      to: edge.endPlanetId,
      edge,
      reversed: false
    });
    graph.get(edge.endPlanetId).push({
      to: edge.startPlanetId,
      edge,
      reversed: true
    });
  });
  return graph;
}

function ensureFleetTravelNetwork() {
  if (tacticalTravelEdges.length) return true;
  const data = prepareArcgisData();
  if (!data) return false;
  const projectionMode = viewMode === 'schematic' ? 'schematic' : 'image';
  rebuildTacticalRouteCache(data, projectionMode);
  if (tacticalTravelEdges.length) return true;
  getTacticalSectionCanvas('hyperlanes', data, projectionMode, tacticalCanvas.width || WORLD_SIZE, tacticalCanvas.height || WORLD_SIZE);
  if (tacticalTravelEdges.length) return true;
  const fallbackMode = projectionMode === 'schematic' ? 'image' : 'schematic';
  rebuildTacticalRouteCache(data, fallbackMode);
  return tacticalTravelEdges.length > 0;
}

function findFleetTravelPlan(startPlanetId, endPlanetId) {
  if (!startPlanetId || !endPlanetId || startPlanetId === endPlanetId) return null;
  ensureFleetTravelNetwork();
  const graph = buildFleetTravelGraph();
  if (!graph.size) return null;
  const startPlanet = planetIndex.get(startPlanetId);
  const endPlanet = planetIndex.get(endPlanetId);
  if (!startPlanet || !endPlanet) return null;
  const resolveGraphAnchor = (planet) => {
    if (graph.has(planet.id)) {
      return { nodeId: planet.id, connector: [] };
    }
    let bestNodeId = null;
    let bestDistance = Infinity;
    graph.forEach((_, nodeId) => {
      const candidate = planetIndex.get(nodeId);
      if (!candidate) return;
      const distance = distanceBetweenPoints(getPlanetDisplayPosition(planet), getPlanetDisplayPosition(candidate));
      if (distance < bestDistance) {
        bestDistance = distance;
        bestNodeId = nodeId;
      }
    });
    if (!bestNodeId) return null;
    const anchorPlanet = planetIndex.get(bestNodeId);
    return {
      nodeId: bestNodeId,
      connector: [getPlanetDisplayPosition(planet), getPlanetDisplayPosition(anchorPlanet)]
    };
  };
  const startAnchor = resolveGraphAnchor(startPlanet);
  const endAnchor = resolveGraphAnchor(endPlanet);
  if (!startAnchor || !endAnchor) return null;
  const graphStartId = startAnchor.nodeId;
  const graphEndId = endAnchor.nodeId;
  if (!graph.has(graphStartId) || !graph.has(graphEndId)) return null;
  const distances = new Map([[graphStartId, 0]]);
  const previous = new Map();
  const queue = new Set(graph.keys());

  while (queue.size) {
    let current = null;
    let currentDistance = Infinity;
    queue.forEach((nodeId) => {
      const value = distances.get(nodeId);
      if (value !== undefined && value < currentDistance) {
        currentDistance = value;
        current = nodeId;
      }
    });
    if (!current) break;
    queue.delete(current);
    if (current === graphEndId) break;
    (graph.get(current) || []).forEach((step) => {
      if (!queue.has(step.to)) return;
      const nextDistance = currentDistance + step.edge.length;
      if (nextDistance < (distances.get(step.to) ?? Infinity)) {
        distances.set(step.to, nextDistance);
        previous.set(step.to, { from: current, step });
      }
    });
  }

  if (graphStartId !== graphEndId && !previous.has(graphEndId)) return null;
  const steps = [];
  let cursor = graphEndId;
  while (cursor !== graphStartId) {
    const entry = previous.get(cursor);
    if (!entry) return null;
    steps.unshift(entry.step);
    cursor = entry.from;
  }

  const points = [];
  if (startAnchor.connector.length) {
    startAnchor.connector.forEach((point, index) => {
      if (index === 0 || distanceBetweenPoints(points[points.length - 1], point) > 0.01) points.push(point);
    });
  }
  steps.forEach((step, index) => {
    const path = step.reversed ? [...step.edge.path].reverse() : step.edge.path;
    path.forEach((point, pointIndex) => {
      if (points.length && pointIndex === 0 && distanceBetweenPoints(points[points.length - 1], point) <= 0.01) return;
      points.push(point);
    });
  });
  if (endAnchor.connector.length) {
    const connector = [...endAnchor.connector].reverse();
    connector.forEach((point) => {
      if (!points.length || distanceBetweenPoints(points[points.length - 1], point) > 0.01) points.push(point);
    });
  }
  if (graphStartId === graphEndId && !points.length) {
    points.push(getPlanetDisplayPosition(startPlanet), getPlanetDisplayPosition(endPlanet));
  }
  return {
    steps,
    points,
    totalLength: polylineLength(points)
  };
}

function upsertFleetMotionRecord(motion) {
  const normalizedMotion = normalizeMotionTimingForClient(motion);
  const nextMotion = {
    fleetId: String(normalizedMotion?.fleetId || '').trim(),
    sourcePlanetId: String(normalizedMotion?.sourcePlanetId || '').trim(),
    sourcePlanetName: String(normalizedMotion?.sourcePlanetName || '').trim(),
    targetPlanetId: String(normalizedMotion?.targetPlanetId || '').trim(),
    targetPlanetName: String(normalizedMotion?.targetPlanetName || '').trim(),
    startedByUserId: normalizedMotion?.startedByUserId || null,
    source: String(normalizedMotion?.source || '').trim(),
    serverNowMs: Number(normalizedMotion?.serverNowMs) || 0,
    startedAtMs: Number(normalizedMotion?.startedAtMs) || Date.now(),
    durationMs: Math.max(1000, Number(normalizedMotion?.durationMs) || 0)
  };
  if (!nextMotion.fleetId) return;
  state.fleetMotions = Array.isArray(state.fleetMotions) ? state.fleetMotions.filter((entry) => entry.fleetId !== nextMotion.fleetId) : [];
  state.fleetMotions.push(nextMotion);
}

function normalizeMotionTimingForClient(motion) {
  const rawStartedAtMs = Number(motion?.startedAtMs) || Date.now();
  const source = String(motion?.source || '').trim();
  let startedAtMs = rawStartedAtMs;
  if (source === 'discord_radio' && Number.isFinite(serverSync.clockOffsetMs)) {
    startedAtMs = rawStartedAtMs + serverSync.clockOffsetMs;
  }
  return {
    ...motion,
    startedAtMs
  };
}

function removeFleetMotionRecord(fleetId) {
  if (!Array.isArray(state.fleetMotions)) return;
  state.fleetMotions = state.fleetMotions.filter((entry) => entry.fleetId !== fleetId);
}

function buildFleetTravelRuntime(motion, nowMs = Date.now()) {
  const sourcePlanet = planetIndex.get(motion?.sourcePlanetId);
  const targetPlanet = planetIndex.get(motion?.targetPlanetId);
  if (!sourcePlanet || !targetPlanet) return null;
  const plan = findFleetTravelPlan(sourcePlanet.id, targetPlanet.id);
  if (!plan || plan.points.length < 2 || plan.totalLength <= 0) return null;
  const startedAtMs = Number(motion?.startedAtMs) || nowMs;
  const durationMs = Math.max(1000, Number(motion?.durationMs) || Math.max(6000, (plan.totalLength / FLEET_TRAVEL_REFERENCE_DISTANCE) * FLEET_TRAVEL_REFERENCE_DURATION_MS));
  const elapsed = Math.max(0, nowMs - startedAtMs);
  const movementElapsed = Math.max(0, elapsed - FLEET_HYPERSPACE_START_DELAY_MS);
  const progress = clamp(movementElapsed / durationMs, 0, 1);
  const distance = plan.totalLength * progress;
  return {
    fleetId: String(motion.fleetId || '').trim(),
    sourcePlanetId: sourcePlanet.id,
    sourcePlanetName: motion?.sourcePlanetName || sourcePlanet.name,
    targetPlanetId: targetPlanet.id,
    targetPlanetName: motion?.targetPlanetName || targetPlanet.name,
    startedByUserId: motion?.startedByUserId || null,
    startedAtMs,
    durationMs,
    totalLength: plan.totalLength,
    points: plan.points,
    currentPosition: samplePolylineAtDistance(plan.points, distance),
    finishAudioPlayed: elapsed >= Math.max(FLEET_HYPERSPACE_START_DELAY_MS, (durationMs + FLEET_HYPERSPACE_START_DELAY_MS) - FLEET_HYPERSPACE_FINISH_LEAD_MS)
  };
}

function beginFleetTravelFromMotion(motion, options = {}) {
  const runtime = buildFleetTravelRuntime(normalizeMotionTimingForClient(motion));
  if (!runtime) return false;
  if (options.persistMotion !== false) upsertFleetMotionRecord(runtime);
  fleetTravelState.set(runtime.fleetId, runtime);
  const fleet = fleetIndex.get(runtime.fleetId);
  if (fleet) updateFleetElement(fleet);
  if (options.playStartAudio) playAudioCue(hyperspaceStartAudio);
  ensureFleetTravelAnimation();
  return true;
}

function syncFleetTravelStateFromCampaign() {
  const activeFleetIds = new Set();
  (Array.isArray(state.fleetMotions) ? state.fleetMotions : []).forEach((motion) => {
    if (beginFleetTravelFromMotion(motion, { persistMotion: false })) {
      activeFleetIds.add(motion.fleetId);
    }
  });
  [...fleetTravelState.keys()].forEach((fleetId) => {
    if (!activeFleetIds.has(fleetId)) fleetTravelState.delete(fleetId);
  });
  if (!fleetTravelState.size && fleetTravelFrame) {
    cancelAnimationFrame(fleetTravelFrame);
    fleetTravelFrame = 0;
  }
}

function tickFleetTravelAnimation() {
  fleetTravelFrame = 0;
  if (!fleetTravelState.size) return;
  const now = Date.now();
  let stillTraveling = false;
  fleetTravelState.forEach((travel, fleetId) => {
    const fleet = fleetIndex.get(fleetId);
    if (!fleet) {
      fleetTravelState.delete(fleetId);
      return;
    }
    const elapsed = now - travel.startedAtMs;
    const movementElapsed = Math.max(0, elapsed - FLEET_HYPERSPACE_START_DELAY_MS);
    const progress = clamp(movementElapsed / travel.durationMs, 0, 1);
    const distance = travel.totalLength * progress;
    if (!travel.finishAudioPlayed && elapsed >= Math.max(FLEET_HYPERSPACE_START_DELAY_MS, (travel.durationMs + FLEET_HYPERSPACE_START_DELAY_MS) - FLEET_HYPERSPACE_FINISH_LEAD_MS)) {
      travel.finishAudioPlayed = true;
      playAudioCue(hyperspaceFinishAudio);
    }
    travel.currentPosition = samplePolylineAtDistance(travel.points, distance);
    updateFleetElement(fleet);
    if (progress >= 1) {
      if (travel.startedByUserId && serverSync.session?.id && String(travel.startedByUserId) === String(serverSync.session.id)) {
        emitLiveSocketEvent('fx:fleet-jump-finish', {
          fleetId,
          targetPlanetId: travel.targetPlanetId,
          targetPlanetName: travel.targetPlanetName
        });
      }
      fleetTravelState.delete(fleetId);
      removeFleetMotionRecord(fleetId);
      fleet.planetId = travel.targetPlanetId;
      fleet.locationPlanetId = travel.targetPlanetId;
      syncFleetCoords(fleet);
      rebuildFleetRenderPositions();
      updateFleetElement(fleet);
      if (selected?.type === 'fleet' && selected.id === fleet.id) openFleet(fleet.id);
      saveLocal();
      setStatus(`Flotte angekommen: ${fleet.name} -> ${travel.targetPlanetName}`);
      return;
    }
    stillTraveling = true;
  });
  if (stillTraveling) {
    fleetTravelFrame = requestAnimationFrame(tickFleetTravelAnimation);
  }
}

function ensureFleetTravelAnimation() {
  if (fleetTravelFrame || !fleetTravelState.size) return;
  fleetTravelFrame = requestAnimationFrame(tickFleetTravelAnimation);
}

function setHoveredRoute(id) {
  if (hoveredRouteId === id) return;
  hoveredRouteId = id || null;
  refreshRouteSelectionState();
}

function hoveredZoneKey(info) {
  if (!info) return '';
  return `${info.region?.name || ''}::${info.sector?.name || ''}`;
}

function isPlanetInsideHoveredSector(planet) {
  const sectorArea = hoveredZoneInfo?.sectorArea;
  if (!planet || !sectorArea?.rings?.length) return false;
  const basePosition = viewMode === 'schematic'
    ? getSchematicPlanetPosition(planet)
    : getImagePlanetPosition(planet);
  return pointInAreaRings(basePosition, sectorArea.rings);
}

function normalizeAngle(angle) {
  let normalized = angle % (Math.PI * 2);
  if (normalized < 0) normalized += Math.PI * 2;
  return normalized;
}

function getShortestAngleDelta(startAngle, endAngle) {
  let delta = normalizeAngle(endAngle) - normalizeAngle(startAngle);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function getAngleDistance(a, b) {
  return Math.abs(getShortestAngleDelta(a, b));
}

function getSectorSnapPolar(point) {
  const dx = Number(point?.x || 0) - GALACTIC_CORE_CENTER.x;
  const dy = Number(point?.y || 0) - GALACTIC_CORE_CENTER.y;
  const rawRadius = Math.hypot(dx, dy);
  const rawAngle = normalizeAngle(Math.atan2(dy, dx));
  const angleStep = (Math.PI / 180) * SECTOR_ANGLE_STEP_DEG;
  const snappedAngle = normalizeAngle(Math.round(rawAngle / angleStep) * angleStep);
  const snappedRadius = SECTOR_SNAP_RADII.reduce((best, radius) => {
    if (Math.abs(radius - rawRadius) < Math.abs(best - rawRadius)) return radius;
    return best;
  }, SECTOR_SNAP_RADII[0]);
  return {
    angle: snappedAngle,
    radius: snappedRadius
  };
}

function polarToSectorPoint(angle, radius) {
  return {
    x: clamp(GALACTIC_CORE_CENTER.x + (Math.cos(angle) * radius), 0, WORLD_SIZE),
    y: clamp(GALACTIC_CORE_CENTER.y + (Math.sin(angle) * radius), 0, WORLD_SIZE)
  };
}

function buildSectorArcPoints(radius, startAngle, endAngle, reverse = false) {
  const normalizedStart = normalizeAngle(startAngle);
  let span = getShortestAngleDelta(normalizedStart, endAngle);
  if (reverse) span += span >= 0 ? -Math.PI * 2 : Math.PI * 2;
  const steps = Math.max(2, Math.ceil(Math.abs(span) / ((Math.PI / 180) * 10)));
  const points = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const angle = normalizedStart + (span * t);
    points.push(polarToSectorPoint(angle, radius));
  }
  return points;
}

function buildSectorSegmentPoints(fromPolar, toPolar) {
  if (!fromPolar || !toPolar) return [];
  const sameRadius = Math.abs((fromPolar.radius || 0) - (toPolar.radius || 0)) < 1;
  const sameAngle = getAngleDistance((fromPolar.angle || 0), (toPolar.angle || 0)) < 0.0001;
  if (sameRadius) {
    return buildSectorArcPoints(fromPolar.radius, fromPolar.angle, toPolar.angle, false);
  }
  if (sameAngle) {
    return [
      polarToSectorPoint(fromPolar.angle, fromPolar.radius),
      polarToSectorPoint(toPolar.angle, toPolar.radius)
    ];
  }
  const arcPoints = buildSectorArcPoints(fromPolar.radius, fromPolar.angle, toPolar.angle, false);
  const radialPoints = [
    polarToSectorPoint(toPolar.angle, fromPolar.radius),
    polarToSectorPoint(toPolar.angle, toPolar.radius)
  ];
  return [...arcPoints, ...radialPoints.slice(1)];
}

function buildSectorPolygonPoints(polarPoints = [], previewPolar = null, closeShape = true) {
  const sequence = [...(Array.isArray(polarPoints) ? polarPoints : [])];
  if (previewPolar) sequence.push(previewPolar);
  if (sequence.length < 2) return sequence.length === 1 ? [polarToSectorPoint(sequence[0].angle, sequence[0].radius)] : [];
  const polygonPoints = [];
  for (let index = 0; index < sequence.length - 1; index += 1) {
    const segment = buildSectorSegmentPoints(sequence[index], sequence[index + 1]);
    if (!segment.length) continue;
    if (!polygonPoints.length) polygonPoints.push(...segment);
    else polygonPoints.push(...segment.slice(1));
  }
  if (closeShape && sequence.length >= 3) {
    // Closing is intentionally direct. An inferred polar arc here can wrap around
    // the Core even though the user never drew that boundary.
    polygonPoints.push(polarToSectorPoint(sequence[0].angle, sequence[0].radius));
  }
  return polygonPoints;
}

function refreshSectorOverlayNow() {
  renderManualSectorOverlay();
}

function updateSectorDrawButton() {
  if (!sectorDrawBtn) return;
  sectorDrawBtn.classList.toggle('hidden', !isAdminRole() || !adminModeEnabled);
  sectorDrawBtn.textContent = activeSectorDraft ? 'Sektor abbrechen' : 'Sektor zeichnen';
}

function cancelSectorDraft(silent = false) {
  if (!activeSectorDraft) return;
  activeSectorDraft = null;
  updateSectorDrawButton();
  refreshSectorOverlayNow();
  render({ layers: true, routeOverlay: true });
  if (!silent) setStatus('Sektorzeichnen abgebrochen.');
}

function commitSectorDraft() {
  if (!activeSectorDraft?.points || activeSectorDraft.points.length < 3) {
    setStatus('Bitte mindestens 3 Sektorpunkte setzen.');
    return;
  }
  const name = window.prompt('Sektorname', `Sektor ${ensureSectorStore().length + 1}`);
  if (name === null) return;
  const points = buildSectorPolygonPoints(activeSectorDraft.points, null, true);
  const sector = createManualSectorRecord({
    name,
    points
  });
  ensureSectorStore().push(sector);
  activeSectorDraft = null;
  tacticalHoverAreas = buildTacticalHoverAreas(null, viewMode === 'schematic' ? 'schematic' : 'image', viewMode);
  saveLocal();
  updateSectorDrawButton();
  refreshSectorOverlayNow();
  render({ layers: true, routeOverlay: true });
  setStatus(`Sektor gespeichert: ${sector.name}`);
}

function deleteManualSector(name) {
  const sector = getManualSectorByIdentifier(name);
  if (!sector || !isAdminRole()) return;
  const nextSectors = ensureSectorStore().filter((entry) => entry.id !== sector.id);
  if (nextSectors.length === ensureSectorStore().length) return;
  state.meta.manualSectors = nextSectors;
  tacticalHoverAreas = buildTacticalHoverAreas(null, viewMode === 'schematic' ? 'schematic' : 'image', viewMode);
  if (hoveredZoneInfo?.sector?.id === sector.id || hoveredZoneInfo?.sector?.name === sector.name) setHoveredZone(null);
  if (selected?.type === 'sector' && selected.id === sector.id) closeInfoPanel();
  saveLocal();
  refreshSectorOverlayNow();
  renderAll({ layers: true, routeOverlay: true });
  setStatus(`Sektor gelöscht: ${sector.name}`);
}

function updateSectorDraftPreview(point) {
  if (!activeSectorDraft?.points?.length) return;
  activeSectorDraft.previewRaw = {
    x: clamp(Number(point?.x || 0), 0, WORLD_SIZE),
    y: clamp(Number(point?.y || 0), 0, WORLD_SIZE)
  };
  activeSectorDraft.preview = getSectorSnapPolar(point);
  updateSectorDrawButton();
  refreshSectorOverlayNow();
  render({ layers: true, routeOverlay: true });
}

function handleSectorDraftMapClick(point) {
  if (!activeSectorDraft) return false;
  const snapped = getSectorSnapPolar(point);
  const firstPoint = activeSectorDraft.points[0];
  if (firstPoint && activeSectorDraft.points.length >= 3) {
    const firstScreenPoint = polarToSectorPoint(firstPoint.angle, firstPoint.radius);
    const snappedScreenPoint = polarToSectorPoint(snapped.angle, snapped.radius);
    const distance = Math.hypot(firstScreenPoint.x - snappedScreenPoint.x, firstScreenPoint.y - snappedScreenPoint.y);
    if (distance <= 22) {
      commitSectorDraft();
      return true;
    }
  }
  const previousPoint = activeSectorDraft.points[activeSectorDraft.points.length - 1];
  if (previousPoint && previousPoint.radius === snapped.radius && previousPoint.angle === snapped.angle) {
    setStatus('Dieser Sektorpunkt ist bereits gesetzt.');
    return true;
  }
  activeSectorDraft.points.push(snapped);
  activeSectorDraft.preview = snapped;
  activeSectorDraft.previewRaw = polarToSectorPoint(snapped.angle, snapped.radius);
  updateSectorDrawButton();
  refreshSectorOverlayNow();
  render({ layers: true, routeOverlay: true });
  if (activeSectorDraft.points.length === 1) {
    setStatus('Erster Sektorpunkt gesetzt. Bewege die Maus für die Ghostline und klicke für den nächsten Abschnitt.');
  } else {
    setStatus(`Sektorpunkt gesetzt (${activeSectorDraft.points.length}). Klick nahe auf den ersten Punkt zum Schließen.`);
  }
  return true;
}

function startSectorDraft(initialPoint = null) {
  if (!isAdminRole()) return;
  if (!activeSectorDraft) activeSectorDraft = { points: [], preview: null, previewRaw: null };
  if (initialPoint) handleSectorDraftMapClick(initialPoint);
  else {
    updateSectorDrawButton();
    refreshSectorOverlayNow();
    render({ layers: true, routeOverlay: true });
    setStatus('Sektorzeichnen aktiv. Erster Klick setzt den Startpunkt, weitere Klicks erweitern den Sektorabschnitt.');
  }
}

function setHoveredZone(info) {
  const nextInfo = info || null;
  if (hoveredZoneKey(hoveredZoneInfo) === hoveredZoneKey(nextInfo)) return;
  hoveredZoneInfo = nextInfo;
  state.planets.forEach((planet) => {
    if (planetElements.has(planet.id)) updatePlanetElement(planet);
  });
  renderTacticalHoverLabels();
}

function queueHoveredRoute(id) {
  pendingRouteHoverId = id || null;
  if (routeHoverFrame) return;
  routeHoverFrame = requestAnimationFrame(() => {
    routeHoverFrame = 0;
    setHoveredRoute(pendingRouteHoverId);
  });
}

function needsLayerRefreshForZoom(prevZoom, nextZoom) {
  return (prevZoom >= LABEL_ZOOM_THRESHOLD) !== (nextZoom >= LABEL_ZOOM_THRESHOLD)
    || ((prevZoom > MAX_ZOOM) !== (nextZoom > MAX_ZOOM));
}

function setStatus(t) {
  document.getElementById('statusLeft').textContent = t;
}

function isLikelyMobileDevice() {
  return window.matchMedia('(max-width: 900px)').matches
    && (navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
}

function isPortraitMobile() {
  return isLikelyMobileDevice() && window.matchMedia('(orientation: portrait)').matches;
}

async function requestLandscapeOrientation() {
  if (!isLikelyMobileDevice()) return false;
  try {
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
  } catch (_) {}
  try {
    if (screen.orientation?.lock) {
      await screen.orientation.lock('landscape');
      return true;
    }
  } catch (_) {}
  return false;
}

function syncMobileOrientationUi() {
  const mobile = isLikelyMobileDevice();
  document.body.classList.toggle('mobile-device', mobile);
  if (!orientationGuardEl) return;
  const shouldShowGuard = mobile && isPortraitMobile() && !mobileOrientationDismissed;
  orientationGuardEl.setAttribute('aria-hidden', shouldShowGuard ? 'false' : 'true');
  orientationGuardEl.style.display = shouldShowGuard ? 'flex' : '';
}

function closePlanetSearchResults(clearSelection = true) {
  planetSearchResults.innerHTML = '';
  planetSearchResults.classList.add('hidden');
  searchResultsState = [];
  if (clearSelection) activeSearchResultIndex = -1;
}

function renderPlanetSearchResults() {
  if (!searchResultsState.length) {
    closePlanetSearchResults();
    return;
  }
  planetSearchResults.innerHTML = '';
  const frag = document.createDocumentFragment();
  searchResultsState.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'search-result' + (index === activeSearchResultIndex ? ' active' : '');
    row.dataset.searchType = entry.type;
    row.dataset.targetId = entry.id;
    row.innerHTML = `<strong>${entry.label}</strong><small>${entry.meta}</small>`;
    row.addEventListener('mousedown', (event) => {
      event.preventDefault();
      focusSearchResult(entry);
    });
    frag.appendChild(row);
  });
  planetSearchResults.appendChild(frag);
  planetSearchResults.classList.remove('hidden');
}

function updatePlanetSearchResults(query) {
  const normalizedQuery = normalizeSearchText(query).trim();
  if (normalizedQuery.length < 2) {
    closePlanetSearchResults();
    return;
  }
  searchResultsState = [
    ...state.planets.map((planet) => ({
      type: 'planet',
      id: planet.id,
      label: planet.name,
      meta: `${planet.grid || '—'} • ${planet.sector || '—'} • ${planet.region || 'Unknown Region'}`,
      search: getPlanetSearchHaystack(planet)
    })),
    ...state.fleets.map((fleet) => ({
      type: 'fleet',
      id: fleet.id,
      label: fleet.name,
      meta: `${fleet.faction} • ${fleet.assignment || 'ohne Zuordnung'} • ${fleet.commander || fleet.leader || 'kein CO'} • ${getFleetDisplayLocation(fleet)}`,
      search: normalizeSearchText(`${fleet.name} ${fleet.commander || fleet.leader || ''} ${fleet.assignment || ''} ${getFleetDisplayLocation(fleet)}`)
    }))
  ]
    .filter((entry) => entry.search.includes(normalizedQuery))
    .sort((a, b) => {
      const aStarts = normalizeSearchText(a.label).startsWith(normalizedQuery) ? 0 : 1;
      const bStarts = normalizeSearchText(b.label).startsWith(normalizedQuery) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      if (a.type !== b.type) return a.type.localeCompare(b.type, 'de');
      return a.label.localeCompare(b.label, 'de');
    })
    .slice(0, 12)
    .map(({ search, ...entry }) => entry);
  activeSearchResultIndex = searchResultsState.length ? 0 : -1;
  renderPlanetSearchResults();
}

function focusPlanetFromSearch(id, options = {}) {
  const planet = planetIndex.get(id);
  if (!planet) return;
  const rect = viewport.getBoundingClientRect();
  const targetZoom = clamp(Math.max(zoom, viewMode === 'schematic' ? 2.1 : 2.6), MIN_ZOOM, MAX_ZOOM);
  setClusterZoomState(null);
  const position = getPlanetDisplayPosition(planet);
  setView(
    targetZoom,
    (rect.width / 2) - (position.x * targetZoom),
    (rect.height / 2) - (position.y * targetZoom)
  );
  highlightPlanetSearchFocus(id);
  if (options.openFleetId) openFleet(options.openFleetId);
  else openPlanet(id);
  planetSearchInput.value = planet.name;
  closePlanetSearchResults();
  planetSearchInput.blur();
  setStatus(options.openFleetId ? `Flotte gefunden: ${options.fleetName || 'Unbenannte Flotte'} @ ${planet.name}` : `Planet gefunden: ${planet.name}`);
}

function focusSearchResult(result) {
  if (!result) return;
  if (result.type === 'fleet') {
    const fleet = fleetIndex.get(result.id);
    const planetId = fleet?.locationPlanetId || fleet?.planetId || '';
    if (!fleet || !planetId) {
      setStatus(`Flotte gefunden, aber ohne gültige Planetenbindung: ${result.label}`);
      return;
    }
    focusPlanetFromSearch(planetId, { openFleetId: fleet.id, fleetName: fleet.name });
    planetSearchInput.value = fleet.name;
    return;
  }
  focusPlanetFromSearch(result.id);
}

function closeFleetJumpResults() {
  const resultsEl = document.getElementById('fleetJumpResults');
  if (resultsEl) {
    resultsEl.innerHTML = '';
    resultsEl.classList.add('hidden');
  }
  fleetJumpSearchState.results = [];
  fleetJumpSearchState.activeIndex = -1;
}

function renderFleetJumpResults() {
  const resultsEl = document.getElementById('fleetJumpResults');
  if (!resultsEl) return;
  if (!fleetJumpSearchState.results.length) {
    closeFleetJumpResults();
    return;
  }
  resultsEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  fleetJumpSearchState.results.forEach((planet, index) => {
    const row = document.createElement('div');
    row.className = 'search-result' + (index === fleetJumpSearchState.activeIndex ? ' active' : '');
    row.innerHTML = `<strong>${planet.name}</strong><small>${planet.grid || '—'} • ${planet.sector || '—'} • ${planet.region || 'Unknown Region'}</small>`;
    row.addEventListener('mousedown', (event) => {
      event.preventDefault();
      chooseFleetJumpTarget(planet.id);
    });
    frag.appendChild(row);
  });
  resultsEl.appendChild(frag);
  resultsEl.classList.remove('hidden');
}

function updateFleetJumpSearch(fleetId, query) {
  fleetJumpSearchState.fleetId = fleetId;
  const fleet = fleetIndex.get(fleetId);
  const normalizedQuery = normalizeSearchText(query).trim();
  if (!fleet || normalizedQuery.length < 2) {
    closeFleetJumpResults();
    return;
  }
  fleetJumpSearchState.results = state.planets
    .filter((planet) => planet.id !== fleet.planetId)
    .map((planet) => ({
      planet,
      haystack: getPlanetSearchHaystack(planet)
    }))
    .filter((entry) => entry.haystack.includes(normalizedQuery))
    .sort((a, b) => a.planet.name.localeCompare(b.planet.name, 'de'))
    .slice(0, 10)
    .map((entry) => entry.planet);
  fleetJumpSearchState.activeIndex = fleetJumpSearchState.results.length ? 0 : -1;
  renderFleetJumpResults();
}

function chooseFleetJumpTarget(planetId) {
  const fleet = fleetIndex.get(fleetJumpSearchState.fleetId);
  const planet = planetIndex.get(planetId);
  const input = document.getElementById('fleetJumpTarget');
  const hidden = document.getElementById('fleetJumpTargetId');
  if (!fleet || !planet || !input || !hidden) return;
  input.value = planet.name;
  hidden.value = planet.id;
  fleetJumpSearchState.selectedPlanetId = planet.id;
  closeFleetJumpResults();
}

function moveFleetJumpSelection(direction) {
  if (!fleetJumpSearchState.results.length) return;
  fleetJumpSearchState.activeIndex = (fleetJumpSearchState.activeIndex + direction + fleetJumpSearchState.results.length) % fleetJumpSearchState.results.length;
  renderFleetJumpResults();
}

function startFleetJump(id) {
  const fleet = fleetIndex.get(id);
  if (!fleet || !canEditFaction(fleet.faction) || isFleetTraveling(fleet)) return;
  const jumpInput = document.getElementById('fleetJumpTarget');
  const typedTarget = jumpInput?.value?.trim() || '';
  let targetId = document.getElementById('fleetJumpTargetId')?.value || fleetJumpSearchState.selectedPlanetId;
  if (!targetId && typedTarget) {
    const normalizedTypedTarget = normalizeSearchText(typedTarget);
    const exactMatch = state.planets.find((planet) => planetMatchesExactSearch(planet, normalizedTypedTarget));
    if (exactMatch) targetId = exactMatch.id;
  }
  const targetPlanet = planetIndex.get(targetId);
  const sourcePlanet = planetIndex.get(fleet.locationPlanetId || fleet.planetId);
  if (!sourcePlanet || !targetPlanet) {
    setStatus('Bitte ein gueltiges Sprungziel aus der Suche auswaehlen.');
    return;
  }
  if (sourcePlanet.id === targetPlanet.id) {
    setStatus('Flotte befindet sich bereits am ausgewaehlten Ziel.');
    return;
  }
  const plan = findFleetTravelPlan(sourcePlanet.id, targetPlanet.id);
  if (!plan || plan.points.length < 2 || plan.totalLength <= 0) {
    setStatus(`Keine gueltige Hyperraumroute von ${sourcePlanet.name} nach ${targetPlanet.name} gefunden.`);
    return;
  }
  const motion = {
    fleetId: fleet.id,
    sourcePlanetId: sourcePlanet.id,
    sourcePlanetName: sourcePlanet.name,
    targetPlanetId: targetPlanet.id,
    targetPlanetName: targetPlanet.name,
    startedByUserId: serverSync.session?.id || null,
    startedAtMs: Date.now(),
    durationMs: Math.max(6000, (plan.totalLength / FLEET_TRAVEL_REFERENCE_DISTANCE) * FLEET_TRAVEL_REFERENCE_DURATION_MS),
  };
  upsertFleetMotionRecord(motion);
  beginFleetTravelFromMotion(motion, { persistMotion: false, playStartAudio: true });
  emitLiveSocketEvent('fx:fleet-jump-start', { motion });
  ensureFleetTravelAnimation();
  updateFleetElement(fleet);
  if (selected?.type === 'fleet' && selected.id === fleet.id) openFleet(fleet.id);
  saveLocal();
  setStatus(`Sprung eingeleitet: ${fleet.name} -> ${targetPlanet.name}`);
}

function currentAssignedRole() {
  return serverSync.session?.role || roleSelect.value || 'Viewer';
}

function currentRole() {
  return LOGIN_ROLE_DEFINITIONS[currentAssignedRole()]?.baseRole || 'Viewer';
}

function canCoordinate4thFleet() {
  return isAdminRole() || (
    currentRole() === 'Republic Navy / GAR'
    && Boolean(serverSync.session?.canCoordinate4thFleet)
  );
}

function isAdminRole() {
  return currentRole() === 'Admin';
}

function isUnderworldRole(role = currentRole()) {
  return ['Black Sun Syndikat', 'Pyke-Syndikat', 'Huttenkartell'].includes(role);
}

function canManageLogins() {
  return ['global', 'admin', 'faction-admin'].includes(LOGIN_ROLE_DEFINITIONS[currentAssignedRole()]?.level);
}

function canManageRadioCommands() {
  return currentAssignedRole() === 'Admin' || currentAssignedRole() === 'Republic Navy Admin';
}

function getManageableLoginRoles() {
  const actor = LOGIN_ROLE_DEFINITIONS[currentAssignedRole()];
  if (actor?.level === 'global') return LOGIN_ROLES;
  const faction = LOGIN_FACTIONS.find((entry) => entry.id === actor?.faction);
  if (!faction) return [];
  if (actor.level === 'admin' || actor.level === 'faction-admin') return [faction.adminRole, faction.memberRole];
  return [];
}

function escapeLoginManagerText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setNavCollapsed(collapsed) {
  navCollapsed = Boolean(collapsed);
  document.body.classList.toggle('nav-collapsed', navCollapsed);
  if (mainNavToggle) {
    mainNavToggle.textContent = navCollapsed ? '⌃' : '⌄';
    mainNavToggle.setAttribute('title', navCollapsed ? 'Navigation ausklappen' : 'Navigation einklappen');
    mainNavToggle.setAttribute('aria-label', navCollapsed ? 'Navigation ausklappen' : 'Navigation einklappen');
  }
}

function showLoginModal() {
  if (!loginModal) return;
  loginModal.classList.add('active');
  loginModal.setAttribute('aria-hidden', 'false');
  window.setTimeout(() => loginModalUser?.focus(), 30);
}

function hideLoginModal() {
  if (!loginModal) return;
  if (loginModal.contains(document.activeElement)) {
    document.activeElement?.blur?.();
  }
  loginModal.classList.remove('active');
  loginModal.setAttribute('aria-hidden', 'true');
}

function updateSessionDisplay() {
  if (!sessionUserDisplay) return;
  const role = currentRole();
  if (currentAuthenticatedUsername) {
    sessionUserDisplay.textContent = `${currentAuthenticatedUsername} (${role})`;
    if (logoutBtn) logoutBtn.textContent = 'Logout';
    return;
  }
  sessionUserDisplay.textContent = viewerModeActive ? 'Gast / Viewer' : 'Nicht eingeloggt';
  if (logoutBtn) logoutBtn.textContent = 'Login';
}

function safeRefreshRoleChrome() {
  try {
    refreshRoleChrome();
  } catch (error) {
    console.error('Role chrome refresh failed', error);
    updateSessionDisplay();
  }
}

let appLoadSequencePromise = null;

function hasLoadedCampaignState() {
  return Array.isArray(state?.planets) && state.planets.length > 0 && serverRevision >= 0;
}

async function beginAppLoadSequence() {
  if (appLoadSequencePromise) return appLoadSequencePromise;
  appLoadSequencePromise = (async () => {
    startBootSequence('app');
    try {
      if (serverSync.enabled) {
        await bootstrapFromServer();
        markBootTask('economyReady', true);
      } else {
        applyDefaultAnonymousRole();
        ensureImportantCampaignPlanets();
        rebuildIndexes();
        runCampaignMaintenance();
        rebuildIndexes();
        syncFleetTravelStateFromCampaign();
        renderBaseThenDeferHeavy();
        safeRefreshRoleChrome();
        markBootTask('campaignReady', true);
        markBootTask('authReady', true);
        markBootTask('economyReady', true);
      }
    } finally {
      appLoadSequencePromise = null;
    }
  })();
  return appLoadSequencePromise;
}

async function ensureEconomyViewLoaded(options = {}) {
  const showLoader = options.showLoader !== false;
  if (showLoader) startBootSequence('economy');
  let summaryLoaded = economyViewState.loaded;
  if (!summaryLoaded || (Date.now() - Number(economyViewState.lastLoadedAt || 0)) > 120000) {
    summaryLoaded = await fetchEconomyView({ renderLoading: false });
  }
  const loaded = Boolean(summaryLoaded);
  if (showLoader) markBootTask('economyReady', loaded);
  return loaded;
}

async function finalizeSuccessfulLogin(payload) {
  viewerModeActive = false;
  pendingLoginAttempt = null;
  setAppEntrySessionActive(true);
  serverSync.session = payload.user || { id: null, username: '', role: 'Viewer' };
  currentAuthenticatedUsername = payload.user?.username || '';
  if (roleSelect) roleSelect.value = payload.user?.role || 'Viewer';
  if (loginModalPassword) loginModalPassword.value = '';
  destroyServerSocketConnection();
  clearServerReconnectTimer();
  clearServerRefreshTimer();
  serverSync.offlineMode = false;
  safeRefreshRoleChrome();
  hideLoginModal();
  if (serverSync.enabled) {
    const hasCampaignState = serverRevision > 0 && Array.isArray(state?.planets) && state.planets.length > 0;
    if (!hasCampaignState) {
      try {
        const response = await fetch('/api/bootstrap', { credentials: 'include' });
        if (response.ok) {
          const bootstrapPayload = await response.json();
          updateServerSession(bootstrapPayload.me || payload.user || { id: null, username: '', role: 'Viewer' });
          const nextRevision = Number(bootstrapPayload.revision || 0);
          if (nextRevision > serverRevision) {
            applyServerCampaign(bootstrapPayload.campaign || DEFAULT_DATA, nextRevision, { playOwnerEffects: true, updatedAt: bootstrapPayload.updatedAt });
          } else {
            syncAuthUsersFromCampaign(bootstrapPayload.campaign);
          }
          serverSyncReady = true;
          serverRevision = nextRevision;
          serverSync.revision = nextRevision;
        }
      } catch (error) {
        console.warn('Post-login bootstrap refresh failed', error);
      }
    } else {
      serverSyncReady = true;
      serverSync.revision = serverRevision;
    }
    if (serverSync.transport === 'socket') connectServerSocket();
    else schedulePollingRefresh(250);
  }
  await checkTutorialStatus();
  if (selected?.type === 'planet') openPlanet(selected.id);
  if (selected?.type === 'fleet') openFleet(selected.id);
  if (selected?.type === 'route') openRoute(selected.id);
  if (selected?.type === 'sector') openSector(selected.id);
  if (activeMainTab === 'fleetManagement') renderFleetManagementView();
  if (activeMainTab === 'shipyard') renderShipyardView();
  if (activeMainTab === 'buildProjects') renderBuildProjectsView();
  if (activeMainTab === 'economy') {
    renderEconomyView();
    void ensureEconomyViewLoaded({ showLoader: true });
  }
  if (activeMainTab === 'loginManager') renderLoginManagerView();
  if (activeMainTab === 'radioCommandCenter') renderRadioCommandCenterView();
  setStatus(`Login erfolgreich: ${payload.user.username} (${payload.user.role})`);
}

function restoreLoginAfterFailure(message) {
  pendingLoginAttempt = null;
  viewerModeActive = false;
  setAppEntrySessionActive(false);
  currentAuthenticatedUsername = '';
  serverSync.session = { id: null, username: '', role: 'Viewer' };
  if (roleSelect) roleSelect.value = 'Viewer';
  safeRefreshRoleChrome();
  showLoginModal();
  setStatus(message);
}

async function verifyDeferredLogin(loginAttempt) {
  if (!loginAttempt?.username) return;
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: loginAttempt.username,
        password: loginAttempt.password
      })
    });
    const payload = await response.json();
    if (pendingLoginAttempt?.id !== loginAttempt.id) return;
    if (!response.ok) {
      restoreLoginAfterFailure(`Login fehlgeschlagen: ${payload.error || 'Ungültige Zugangsdaten.'}`);
      return;
    }
    await finalizeSuccessfulLogin(payload);
  } catch (error) {
    if (pendingLoginAttempt?.id !== loginAttempt.id) return;
    if (String(error.message || '').includes('Failed to fetch')) {
      disableLiveSync('Login fehlgeschlagen: Server nicht erreichbar. Lokaler Offline-Modus aktiv.');
      return;
    }
    restoreLoginAfterFailure(`Login fehlgeschlagen: ${error.message}`);
  }
}

function continueAsGuest() {
  viewerModeActive = true;
  pendingLoginAttempt = null;
  setAppEntrySessionActive(true);
  currentAuthenticatedUsername = '';
  serverSync.session = { id: null, username: '', role: 'Viewer' };
  if (roleSelect) roleSelect.value = 'Viewer';
  hideLoginModal();
  tutorialFlowState.shouldPrompt = false;
  closeOverlayModal('tutorialModal', { restoreFocus: false });
  safeRefreshRoleChrome();
  if (!hasLoadedCampaignState()) {
    void beginAppLoadSequence();
  }
  setStatus('Gastmodus aktiv. Kampagnendaten werden geladen.');
}

async function logoutCurrentUser() {
  if (!currentAuthenticatedUsername) {
    viewerModeActive = false;
    pendingLoginAttempt = null;
    safeRefreshRoleChrome();
    showLoginModal();
    return;
  }
  if (serverSync.enabled) {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (error) {
      console.warn('Logout request failed', error);
    }
  }
  viewerModeActive = false;
  pendingLoginAttempt = null;
  setAppEntrySessionActive(false);
  currentAuthenticatedUsername = '';
  serverSync.session = { id: null, username: '', role: 'Viewer' };
  if (roleSelect) roleSelect.value = 'Viewer';
  safeRefreshRoleChrome();
  tutorialFlowState.shouldPrompt = false;
  closeOverlayModal('tutorialModal', { restoreFocus: false });
  showLoginModal();
  setStatus('Du wurdest ausgeloggt.');
}

async function attemptLogin() {
  const username = loginModalUser?.value || '';
  const password = loginModalPassword?.value || '';
  if (!serverSync.enabled) {
    setStatus('Login benötigt den Server-Modus über http://localhost.');
    return;
  }
  pendingLoginAttempt = { id: crypto.randomUUID(), username, password };
  viewerModeActive = false;
  setAppEntrySessionActive(true);
  hideLoginModal();
  setStatus('Zugangsdaten werden geprüft. Grundsysteme werden bereits geladen.');
  if (!hasLoadedCampaignState()) {
    void beginAppLoadSequence();
  }
  void verifyDeferredLogin(pendingLoginAttempt);
}

function applyDefaultAnonymousRole() {
  if (currentAuthenticatedUsername) return;
  viewerModeActive = false;
  pendingLoginAttempt = null;
  serverSync.session = { id: null, username: '', role: 'Viewer' };
  if (roleSelect) roleSelect.value = 'Viewer';
}

function getRoleFaction(role = currentRole()) {
  if (role === 'Eventleiter / KUS') return 'KUS';
  if (role === 'Republic Navy / GAR' || role === 'Senat') return 'GAR';
  return '';
}

function refreshRoleChrome() {
  const showAdminTools = isAdminRole() ? adminModeEnabled : true;
  saveBtn.classList.toggle('hidden', !showAdminTools);
  loginManagerTabBtn.classList.toggle('hidden', !canManageLogins() || (isAdminRole() && !adminModeEnabled));
  radioCommandTabBtn.classList.toggle('hidden', !canManageRadioCommands() || (isAdminRole() && !adminModeEnabled));
  buildProjectsTabBtn.classList.remove('hidden');
  updateSectorDrawButton();
  document.querySelector('[data-main-tab="fleetManagement"]')?.classList.toggle('hidden', currentRole() === 'Senat');
  document.querySelector('[data-main-tab="shipyard"]')?.classList.toggle('hidden', currentRole() === 'Senat');
  roleSelect.disabled = true;
  updateSessionDisplay();
  syncSettingsModalState();
  if (!canManageLogins() && activeMainTab === 'loginManager') setMainTab('map');
  if (!canManageRadioCommands() && activeMainTab === 'radioCommandCenter') setMainTab('map');
  if (currentRole() === 'Senat' && (activeMainTab === 'fleetManagement' || activeMainTab === 'shipyard')) setMainTab('buildProjects');
  const faction = getRoleFaction();
  if (!faction) {
    roleFactionBadge.classList.add('hidden');
    roleFactionBadge.innerHTML = '';
    return;
  }
  const logoSrc = faction === 'KUS' ? 'assets/kus.svg' : 'assets/gar.svg';
  roleFactionBadge.innerHTML = `<img src="${logoSrc}" alt="${faction} Logo"><strong>${faction}</strong>`;
  roleFactionBadge.classList.remove('hidden');
}

function canEditFaction(faction) {
  const r = currentRole();
  return r === 'Admin' || (r === 'Eventleiter / KUS' && faction === 'KUS') || (r === 'Republic Navy / GAR' && faction === 'GAR');
}

function getFleetManagementVisibleFactions() {
  const role = currentRole();
  if (role === 'Republic Navy / GAR') return new Set(['GAR']);
  if (role === 'Senat') return new Set(['GAR']);
  if (role === 'Eventleiter / KUS') return new Set(['KUS']);
  if (fleetManagementFactionFilter === 'GAR') return new Set(['GAR']);
  if (fleetManagementFactionFilter === 'KUS') return new Set(['KUS']);
  return new Set(['GAR', 'KUS']);
}

function canEditPlanet() {
  const r = currentRole();
  return r === 'Admin' || r === 'Eventleiter / KUS' || r === 'Senat';
}

function canEditPlanetRecord(planet) {
  if (!planet) return false;
  if (isAdminRole()) return true;
  return currentRole() === 'Eventleiter / KUS' && planet.owner !== 'GAR';
}

function ownerClass(o) {
  return o === 'GAR' ? 'GAR' : (o === 'KUS' ? 'KUS' : (o === 'HUTT' ? 'HUTT' : 'NEUTRAL'));
}

function iconFor(f) {
  return f.faction === 'GAR' ? 'assets/gar.svg' : 'assets/kus.svg';
}

function syncPlanetCoords(planet) {
  const hasWorldX = Number.isFinite(planet.x);
  const hasWorldY = Number.isFinite(planet.y);
  const hasNormX = Number.isFinite(planet.xNorm);
  const hasNormY = Number.isFinite(planet.yNorm);
  const normWorldX = hasNormX ? planet.xNorm * WORLD_SIZE : NaN;
  const normWorldY = hasNormY ? planet.yNorm * WORLD_SIZE : NaN;
  const rawX = hasWorldX && (!hasNormX || Math.abs(normWorldX - planet.x) > 2) ? planet.x : normWorldX;
  const rawY = hasWorldY && (!hasNormY || Math.abs(normWorldY - planet.y) > 2) ? planet.y : normWorldY;
  planet.x = clamp(Number.isFinite(rawX) ? rawX : WORLD_SIZE / 2, 0, WORLD_SIZE);
  planet.y = clamp(Number.isFinite(rawY) ? rawY : WORLD_SIZE / 2, 0, WORLD_SIZE);
  planet.xNorm = planet.x / WORLD_SIZE;
  planet.yNorm = planet.y / WORLD_SIZE;
}

function setPlanetWorldPosition(planet, x, y) {
  planet.x = clamp(x, 0, WORLD_SIZE);
  planet.y = clamp(y, 0, WORLD_SIZE);
  planet.xNorm = planet.x / WORLD_SIZE;
  planet.yNorm = planet.y / WORLD_SIZE;
}

function syncFleetCoords(fleet) {
  const planet = planetIndex.get(fleet.locationPlanetId || fleet.planetId);
  if (!planet) {
    return;
  }
  fleet.planetId = planet.id;
  fleet.locationPlanetId = planet.id;
  fleet.x = planet.x;
  fleet.y = planet.y;
}

function nearestPlanet(x, y) {
  let best = null;
  let bestDistanceSq = Infinity;
  for (const planet of state.planets) {
    const dx = planet.x - x;
    const dy = planet.y - y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      best = planet;
    }
  }
  return best;
}

function nearestDisplayedPlanet(x, y, maxDistance = 16) {
  if (!layers.planets) return null;
  let best = null;
  let bestDistanceSq = maxDistance * maxDistance;
  state.planets.forEach((planet) => {
    if (!shouldRenderPlanetOnMap(planet)) return;
    if (!isPlanetVisibleInClusterZoom(planet)) return;
    const display = getPlanetDisplayPosition(planet);
    const dx = display.x - x;
    const dy = display.y - y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq <= bestDistanceSq) {
      bestDistanceSq = distanceSq;
      best = planet;
    }
  });
  return best;
}

function nearestDisplayedMarker(x, y, maxDistance = 20) {
  let best = null;
  let bestDistanceSq = maxDistance * maxDistance;
  ensureMapMarkerStore().forEach((marker) => {
    const dx = marker.x - x;
    const dy = marker.y - y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq <= bestDistanceSq) {
      bestDistanceSq = distanceSq;
      best = marker;
    }
  });
  return best;
}

function pointToSegmentDistanceSq(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLenSq = (abx * abx) + (aby * aby);
  if (abLenSq <= 1e-6) {
    const dx = px - ax;
    const dy = py - ay;
    return dx * dx + dy * dy;
  }
  const t = clamp(((apx * abx) + (apy * aby)) / abLenSq, 0, 1);
  const closestX = ax + (abx * t);
  const closestY = ay + (aby * t);
  const dx = px - closestX;
  const dy = py - closestY;
  return dx * dx + dy * dy;
}

function nearestDisplayedRoute(x, y, maxDistance = 8) {
  if (!layers.hyperlanes) return null;
  let best = null;
  let bestDistanceSq = maxDistance * maxDistance;
  tacticalRouteCache.forEach((route) => {
    if (route.bounds) {
      const expandedMinX = route.bounds.minX - maxDistance;
      const expandedMaxX = route.bounds.maxX + maxDistance;
      const expandedMinY = route.bounds.minY - maxDistance;
      const expandedMaxY = route.bounds.maxY + maxDistance;
      if (x < expandedMinX || x > expandedMaxX || y < expandedMinY || y > expandedMaxY) return;
    }
    route.paths.forEach((path) => {
      for (let i = 1; i < path.length; i += 1) {
        const prev = path[i - 1];
        const next = path[i];
        const distanceSq = pointToSegmentDistanceSq(x, y, prev.x, prev.y, next.x, next.y);
        if (distanceSq <= bestDistanceSq) {
          bestDistanceSq = distanceSq;
          best = route;
        }
      }
    });
  });
  return best;
}

