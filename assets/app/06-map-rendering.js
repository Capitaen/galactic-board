// Generated from app-shell.js: map rendering, tactical layers, sectors, overlays

function rebuildIndexes() {
  ensureImportantCampaignPlanets();
  planetIndex.clear();
  fleetIndex.clear();
  state.meta.mapMarkers = ensureMapMarkerStore().map((marker) => createMapMarkerRecord(marker));
  state.planets.forEach((planet) => {
    syncPlanetCoords(planet);
    planetIndex.set(planet.id, planet);
  });
  state.fleets.forEach((fleet) => {
    const currentPlanetId = fleet.locationPlanetId || fleet.planetId;
    if (!currentPlanetId || !planetIndex.has(currentPlanetId)) {
      const fallback = Number.isFinite(fleet.x) && Number.isFinite(fleet.y)
        ? nearestPlanet(fleet.x, fleet.y)
        : null;
      if (fallback) {
        fleet.planetId = fallback.id;
        fleet.locationPlanetId = fallback.id;
      }
    }
    syncFleetCoords(fleet);
    fleetIndex.set(fleet.id, fleet);
  });
  buildGridModel();
  rebuildFleetRenderPositions();
}

function needsRouteNetwork() {
  return Boolean(layers.hyperlanes);
}

function needsArcgisTacticalData() {
  if (viewMode === 'schematic') return Boolean(layers.hyperlanes || layers.sectorLabels);
  return Boolean(layers.hyperlanes || layers.sectorLabels);
}

function markDirty(options = {}) {
  if (options.transform) dirtyTransform = true;
  if (options.positions) dirtyPositions = true;
  if (options.frontline) dirtyFrontline = true;
  if (options.influence) dirtyInfluence = true;
  if (options.tacticalBase) dirtyTacticalBase = true;
  if (options.routeOverlay) dirtyRouteOverlay = true;
  if (options.layers) dirtyLayers = true;
  if (!renderQueued) {
    renderQueued = true;
    requestAnimationFrame(flushRender);
  }
}

function applyTransform() {
  ({ panX, panY } = clampPanToViewport(panX, panY, zoom));
  world.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
}

function updatePlanetElement(planet) {
  const entry = planetElements.get(planet.id);
  if (!entry) return;
  const display = getPlanetDisplayPosition(planet);
  const isVisible = shouldRenderPlanetOnMap(planet) && isPlanetVisibleInClusterZoom(planet);
  const isSearchHighlighted = activePlanetSearchHighlightId === planet.id;
  const isCoruscant = normalizePlanetKey(planet.id || planet.name) === 'coruscant';
  entry.point.className = 'planet '
    + ownerClass(planet.owner)
    + (isCoruscant ? ' coruscant-planet' : '')
    + (isPriorityWorld(planet) ? ' priority-world' : '')
    + (planet.isCoreWorld ? ' core-world' : '')
    + (isSearchHighlighted ? ' search-highlight' : '')
    + (planet.activeBattle ? ` active-battle${getPlanetBattleRingClass(planet)}` : '');
  entry.point.style.left = display.x + 'px';
  entry.point.style.top = display.y + 'px';
  entry.point.title = `${planet.name} [${planet.owner}]${planet.isCoreWorld ? ' • Kernwelt' : ''}${planet.isUnofficial ? ' • Inoffizieller Planet' : ''}${planet.activeBattle ? ' • Aktives Gefecht' : ''}`;
  entry.label.style.left = display.x + 'px';
  entry.label.style.top = display.y + 'px';
  entry.label.textContent = planet.name;
  entry.label.className = 'planet-label' + (isPriorityWorld(planet) ? ' priority-world' : '') + (isSearchHighlighted ? ' search-highlight' : '');
  entry.label.classList.toggle('hover-visible', hoveredPlanetId === planet.id);
  entry.point.classList.toggle('hidden', !isVisible);
  entry.label.classList.toggle('hidden', !isVisible);
}

function updateMarkerElement(marker) {
  const entry = markerElements.get(marker.id);
  if (!entry) return;
  const isSelected = selected?.type === 'marker' && selected.id === marker.id;
  entry.className = 'marker' + (isSelected ? ' selected' : '') + (activeInteraction?.mode === 'marker-drag' && activeInteraction.id === marker.id ? ' dragging' : '') + (zoom < LABEL_ZOOM_THRESHOLD ? ' hidden-label' : '');
  entry.style.left = `${marker.x}px`;
  entry.style.top = `${marker.y}px`;
  entry.style.setProperty('--marker-color', marker.color || '#ffd54d');
  entry.title = marker.description ? `${marker.name}\n${marker.description}` : marker.name;
  const label = entry.querySelector('.marker-label');
  if (label) label.textContent = marker.name;
}

function ensureMarkerElements() {
  const seen = new Set();
  const frag = document.createDocumentFragment();
  ensureMapMarkerStore().forEach((marker) => {
    seen.add(marker.id);
    if (!markerElements.has(marker.id)) {
      const el = document.createElement('button');
      el.type = 'button';
      el.dataset.id = marker.id;
      el.innerHTML = '<span class="marker-label"></span>';
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        openMarker(marker.id);
      });
      markerElements.set(marker.id, el);
      frag.appendChild(el);
    }
    updateMarkerElement(marker);
  });
  if (frag.childNodes.length) markerLayer.appendChild(frag);
  for (const [markerId, entry] of markerElements.entries()) {
    if (!seen.has(markerId)) {
      entry.remove();
      markerElements.delete(markerId);
    }
  }
}

function setHoveredPlanet(id) {
  if (hoveredPlanetId === id) return;
  const prevId = hoveredPlanetId;
  hoveredPlanetId = id || null;
  if (prevId && planetIndex.has(prevId)) updatePlanetElement(planetIndex.get(prevId));
  if (hoveredPlanetId && planetIndex.has(hoveredPlanetId)) updatePlanetElement(planetIndex.get(hoveredPlanetId));
}

function highlightPlanetSearchFocus(planetId) {
  const previousId = activePlanetSearchHighlightId;
  activePlanetSearchHighlightId = planetId || '';
  if (activePlanetSearchHighlightTimer) window.clearTimeout(activePlanetSearchHighlightTimer);
  if (previousId && previousId !== activePlanetSearchHighlightId && planetIndex.has(previousId)) updatePlanetElement(planetIndex.get(previousId));
  if (activePlanetSearchHighlightId && planetIndex.has(activePlanetSearchHighlightId)) updatePlanetElement(planetIndex.get(activePlanetSearchHighlightId));
  if (!activePlanetSearchHighlightId) return;
  activePlanetSearchHighlightTimer = window.setTimeout(() => {
    const currentId = activePlanetSearchHighlightId;
    activePlanetSearchHighlightId = '';
    if (currentId && planetIndex.has(currentId)) updatePlanetElement(planetIndex.get(currentId));
  }, 7000);
}

function updateFleetElement(fleet) {
  const entry = fleetElements.get(fleet.id);
  if (!entry) return;
  if (fleetClusterMembership.has(fleet.id) && !fleetTravelState.get(fleet.id)?.currentPosition) {
    entry.classList.add('hidden');
    entry.style.left = '';
    entry.style.top = '';
    return;
  }
  const isSelected = selected?.type === 'fleet' && selected.id === fleet.id;
  const isMoving = isFleetTraveling(fleet);
  entry.className = 'fleet ' + fleet.faction
    + (activeInteraction?.mode === 'fleet-drag' && activeInteraction.id === fleet.id ? ' dragging' : '')
    + (isSelected ? ' selected' : '')
    + (isMoving ? ' moving' : '');
  const locationPlanetId = fleet.locationPlanetId || fleet.planetId;
  if (!locationPlanetId && !Number.isFinite(fleet.x) && !Number.isFinite(fleet.y)) {
    entry.classList.add('hidden');
    entry.style.left = '';
    entry.style.top = '';
    return;
  }
  const renderPos = getFleetDisplayPosition(fleet);
  if (!Number.isFinite(renderPos?.x) || !Number.isFinite(renderPos?.y)) {
    entry.classList.add('hidden');
    entry.style.left = '';
    entry.style.top = '';
    return;
  }
  const isVisible = isFleetElementVisible(fleet);
  entry.style.left = renderPos.x + 'px';
  entry.style.top = renderPos.y + 'px';
  entry.title = fleet.name;
  entry.style.pointerEvents = isMoving ? 'none' : 'auto';
  entry.classList.toggle('hidden', !isVisible);
  entry.querySelector('img').src = iconFor(fleet);
  const travel = fleetTravelState.get(fleet.id);
  entry.querySelector('.fleet-tag').textContent = travel ? `${fleet.name} -> ${travel.targetPlanetName}` : fleet.name;
  entry.querySelector('.fleet-assignment').textContent = fleet.assignment || '';
}

function isFleetElementVisible(fleet) {
  if (!fleet) return false;
  const role = currentRole();
  if (fleet.faction === 'GAR') return Boolean(layers.garFleets);
  if (fleet.faction === 'KUS') {
    if (!(role === 'Admin' || role === 'Eventleiter / KUS')) return false;
    return Boolean(layers.kusFleets);
  }
  return true;
}

function getFleetClusterSource(fleets) {
  const garCount = fleets.filter((fleet) => fleet.faction === 'GAR').length;
  const kusCount = fleets.filter((fleet) => fleet.faction === 'KUS').length;
  if (garCount && kusCount) return 'mixed';
  return garCount ? 'GAR' : 'KUS';
}

function rebuildFleetClusterState() {
  fleetClusterMembership.clear();
  fleetClusterGroups.clear();
  const visibleGroups = new Map();
  state.fleets.forEach((fleet) => {
    if (!isFleetElementVisible(fleet)) return;
    if (fleetTravelState.get(fleet.id)?.currentPosition) return;
    const planetId = fleet.locationPlanetId || fleet.planetId;
    if (!planetId) return;
    const planet = planetIndex.get(planetId);
    if (!planet) return;
    const key = `planet:${planetId}`;
    if (!visibleGroups.has(key)) visibleGroups.set(key, { key, planetId, planet, fleets: [] });
    visibleGroups.get(key).fleets.push(fleet);
  });
  visibleGroups.forEach((group) => {
    if (group.fleets.length < 2) return;
    group.fleets.sort((left, right) => String(left.assignment || left.name).localeCompare(String(right.assignment || right.name), 'de', { sensitivity: 'base', numeric: true }));
    group.source = getFleetClusterSource(group.fleets);
    group.position = getPlanetDisplayPosition(group.planet);
    fleetClusterGroups.set(group.key, group);
    group.fleets.forEach((fleet) => fleetClusterMembership.set(fleet.id, group.key));
  });
}

function closeFleetStackPanel() {
  activeFleetClusterKey = '';
  if (!fleetStackPanel) return;
  fleetStackPanel.classList.remove('active');
  fleetStackPanel.style.display = 'none';
  fleetStackPanel.innerHTML = '';
}

function renderFleetStackPanel() {
  if (!fleetStackPanel) return;
  const cluster = fleetClusterGroups.get(activeFleetClusterKey);
  if (!cluster) {
    closeFleetStackPanel();
    return;
  }
  fleetStackPanel.classList.add('active');
  fleetStackPanel.style.display = 'block';
  fleetStackPanel.innerHTML = `
    <h3>Einheiten bei ${escapeHtml(cluster.planet?.name || 'Sammelpunkt')}</h3>
    <div class="fleet-stack-list">
      ${cluster.fleets.map((fleet) => `
        <div class="fleet-stack-entry" data-fleet-id="${fleet.id}" role="button" tabindex="0" onclick="openFleetStackEntry('${fleet.id}')" onkeydown="if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); openFleetStackEntry('${fleet.id}'); }">
          <div class="fleet-stack-entry-copy">
            <strong>${escapeHtml(fleet.name)}</strong>
            <small>${escapeHtml(getFleetCommandRoleLabel(normalizeFleetCommandRole(fleet.commandRole)))} • ${escapeHtml(fleet.faction)}${fleet.assignment ? ` • ${escapeHtml(fleet.assignment)}` : ''}</small>
          </div>
          <button class="mini-btn" type="button" onclick="event.stopPropagation(); openFleetStackEntry('${fleet.id}')">Öffnen</button>
        </div>
      `).join('')}
    </div>
    <div class="fleet-stack-actions">
      <button class="mini-btn" type="button" onclick="closeFleetStackPanel()">Schließen</button>
    </div>
  `;
}

function openFleetClusterPanel(clusterKey) {
  activeFleetClusterKey = clusterKey || '';
  renderFleetStackPanel();
}

function nearestDisplayedFleetCluster(x, y, radius = 26) {
  let best = null;
  let bestDistanceSq = radius * radius;
  fleetClusterGroups.forEach((group, key) => {
    if (!group?.position) return;
    const dx = Number(group.position.x || 0) - x;
    const dy = Number(group.position.y || 0) - y;
    const distanceSq = (dx * dx) + (dy * dy);
    if (distanceSq > bestDistanceSq) return;
    bestDistanceSq = distanceSq;
    best = { ...group, key };
  });
  return best;
}

function ensureFleetClusterElements() {
  const seen = new Set();
  const frag = document.createDocumentFragment();
  fleetClusterGroups.forEach((group, clusterKey) => {
    seen.add(clusterKey);
    if (!fleetClusterElements.has(clusterKey)) {
      const el = document.createElement('div');
      el.className = 'fleet fleet-cluster';
      el.dataset.clusterKey = clusterKey;
      el.innerHTML = `<img alt=""><div class="fleet-cluster-count"></div>`;
      el.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
      });
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        openFleetClusterPanel(clusterKey);
      });
      fleetClusterElements.set(clusterKey, el);
      frag.appendChild(el);
    }
    const el = fleetClusterElements.get(clusterKey);
    const isSelected = selected?.type === 'fleet' && group.fleets.some((fleet) => fleet.id === selected.id);
    el.className = `fleet fleet-cluster ${group.source === 'mixed' ? 'fleet-cluster-mixed' : ''}${isSelected ? ' selected' : ''}`;
    el.style.left = `${group.position.x}px`;
    el.style.top = `${group.position.y}px`;
    el.style.pointerEvents = 'auto';
    el.title = `${group.fleets.length} Einheiten bei ${group.planet?.name || 'Sammelpunkt'}`;
    el.querySelector('img').src = group.source === 'KUS' ? 'assets/kus.svg' : 'assets/gar.svg';
    el.querySelector('.fleet-cluster-count').textContent = String(group.fleets.length);
    el.classList.toggle('hidden', false);
  });
  if (frag.childNodes.length) fleetLayer.appendChild(frag);
  for (const [clusterKey, el] of fleetClusterElements.entries()) {
    if (!seen.has(clusterKey)) {
      el.remove();
      fleetClusterElements.delete(clusterKey);
      if (activeFleetClusterKey === clusterKey) closeFleetStackPanel();
    }
  }
  if (activeFleetClusterKey) renderFleetStackPanel();
}

function refreshFleetClusterSelectionState() {
  for (const [clusterKey, el] of fleetClusterElements.entries()) {
    const group = fleetClusterGroups.get(clusterKey);
    if (!group) continue;
    const isSelected = selected?.type === 'fleet' && group.fleets.some((fleet) => fleet.id === selected.id);
    el.classList.toggle('selected', isSelected);
  }
  if (activeFleetClusterKey) renderFleetStackPanel();
}

function ensurePlanetElements() {
  const seen = new Set();
  const frag = document.createDocumentFragment();
  const labelFrag = document.createDocumentFragment();
  state.planets.forEach((planet) => {
    seen.add(planet.id);
    if (!planetElements.has(planet.id)) {
      const point = document.createElement('div');
      point.dataset.id = planet.id;
      point.style.pointerEvents = 'auto';
      point.addEventListener('click', (event) => {
        event.stopPropagation();
        openPlanet(planet.id);
      });
      point.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        if (event.button !== 0 || currentRole() !== 'Admin' || !event.altKey) return;
        event.preventDefault();
        activeInteraction = { mode: 'planet-drag', id: planet.id, pointerId: event.pointerId };
        viewport.classList.add('dragging');
        setStatus('Kalibrierung aktiv: ' + planet.name);
      });
      const label = document.createElement('div');
      label.className = 'planet-label';
      frag.appendChild(point);
      labelFrag.appendChild(label);
      planetElements.set(planet.id, { point, label });
    }
    updatePlanetElement(planet);
  });
  if (frag.childNodes.length) planetLayer.appendChild(frag);
  if (labelFrag.childNodes.length) planetLayer.appendChild(labelFrag);
  for (const [planetId, entry] of planetElements.entries()) {
    if (!seen.has(planetId)) {
      entry.point.remove();
      entry.label.remove();
      planetElements.delete(planetId);
    }
  }
}

function ensureFleetElements() {
  rebuildFleetRenderPositions();
  rebuildFleetClusterState();
  const seen = new Set();
  const frag = document.createDocumentFragment();
  state.fleets.forEach((fleet) => {
    seen.add(fleet.id);
    if (!fleetElements.has(fleet.id)) {
      const el = document.createElement('div');
      el.dataset.id = fleet.id;
      el.innerHTML = `<img src="${iconFor(fleet)}" alt=""><div class="fleet-tag"></div><div class="fleet-assignment"></div>`;
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        if (isFleetTraveling(fleet.id)) return;
        openFleet(fleet.id);
      });
      frag.appendChild(el);
      fleetElements.set(fleet.id, el);
    }
    updateFleetElement(fleet);
  });
  if (frag.childNodes.length) fleetLayer.appendChild(frag);
  ensureFleetClusterElements();
  for (const [fleetId, el] of fleetElements.entries()) {
    if (!seen.has(fleetId)) {
      el.remove();
      fleetElements.delete(fleetId);
    }
  }
}

function buildRouteCache() {
  initMapAnalysis();
  const points = state.planets;
  const edges = [];
  const used = new Set();
  const radiusSq = 120 * 120;
  for (let i = 0; i < points.length; i += 1) {
    const base = points[i];
    const candidates = [];
    for (let j = 0; j < points.length; j += 1) {
      if (i === j) continue;
      const other = points[j];
      const dx = base.x - other.x;
      const dy = base.y - other.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= radiusSq) {
        candidates.push([distSq, j]);
      }
    }
    candidates.sort((a, b) => a[0] - b[0]);
    candidates.slice(0, 3).forEach(([, idx]) => {
      const key = i < idx ? `${i}-${idx}` : `${idx}-${i}`;
      const laneScore = hyperlaneSegmentScore(base, points[idx]);
      if (laneScore < 55) return;
      if (!used.has(key)) {
        used.add(key);
        edges.push([base, points[idx]]);
      }
    });
  }
  const neutralState = new Map();
  edges.forEach(([a, b]) => {
    if (a.owner === 'NEUTRAL') {
      const entry = neutralState.get(a.id) || { gar: false, kus: false, hutt: false };
      entry.gar ||= b.owner === 'GAR';
      entry.kus ||= b.owner === 'KUS';
      entry.hutt ||= b.owner === 'HUTT';
      neutralState.set(a.id, entry);
    }
    if (b.owner === 'NEUTRAL') {
      const entry = neutralState.get(b.id) || { gar: false, kus: false, hutt: false };
      entry.gar ||= a.owner === 'GAR';
      entry.kus ||= a.owner === 'KUS';
      entry.hutt ||= a.owner === 'HUTT';
      neutralState.set(b.id, entry);
    }
  });
  routeCache = edges.map(([a, b]) => {
    let cls = null;
    if (a.owner === 'GAR' && b.owner === 'GAR') cls = 'blue';
    else if (a.owner === 'KUS' && b.owner === 'KUS') cls = 'red';
    else if (a.owner === 'HUTT' && b.owner === 'HUTT') cls = 'orange';
    else if ((a.owner === 'GAR' && b.owner === 'KUS') || (a.owner === 'KUS' && b.owner === 'GAR')) cls = 'purple';
    else if ((a.owner === 'GAR' && b.owner === 'HUTT') || (a.owner === 'HUTT' && b.owner === 'GAR')) cls = 'orange';
    else if ((a.owner === 'KUS' && b.owner === 'HUTT') || (a.owner === 'HUTT' && b.owner === 'KUS')) cls = 'orange';
    else if (a.owner === 'NEUTRAL' || b.owner === 'NEUTRAL') {
      const neutral = a.owner === 'NEUTRAL' ? a : b;
      const other = neutral.id === a.id ? b : a;
      const contested = neutralState.get(neutral.id);
      if ((contested?.gar && contested?.kus) || (contested?.gar && contested?.hutt) || (contested?.kus && contested?.hutt)) cls = 'purple';
      else if (other.owner === 'GAR') cls = 'purple';
      else if (other.owner === 'KUS') cls = 'red';
      else if (other.owner === 'HUTT') cls = 'orange';
      else cls = 'gray';
    }
    return cls ? { id: getRouteId(a, b), a, b, cls } : null;
  }).filter(Boolean);
}

function renderFrontline() {
  overlay.innerHTML = '';
  const frag = document.createDocumentFragment();
  routeCache.forEach((route) => {
    const { a, b, cls, id } = route;
    const start = getPlanetDisplayPosition(a);
    const end = getPlanetDisplayPosition(b);
    const hitbox = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    hitbox.setAttribute('x1', start.x);
    hitbox.setAttribute('y1', start.y);
    hitbox.setAttribute('x2', end.x);
    hitbox.setAttribute('y2', end.y);
    hitbox.setAttribute('stroke', '#ffffff');
    hitbox.setAttribute('stroke-opacity', '0.001');
    hitbox.setAttribute('stroke-width', '10');
    hitbox.setAttribute('stroke-linecap', 'round');
    hitbox.setAttribute('class', 'route-hitbox ' + (cls === 'purple' ? 'contestedLine' : 'frontLine'));
    hitbox.dataset.routeId = id;
    hitbox.dataset.routeHitbox = 'true';
    frag.appendChild(hitbox);
  });
  overlay.appendChild(frag);
  refreshRouteSelectionState();
}

function addSvgText(parent, attrs, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  node.textContent = text;
  parent.appendChild(node);
}

function renderSectionSafely(sectionName, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`ArcGIS section failed: ${sectionName}`, error);
  }
}

function canvasPathFromPoints(ctx, points) {
  if (!Array.isArray(points) || !points.length) return false;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  return true;
}

function drawCanvasPolyline(ctx, points, strokeStyle, lineWidth, dash = []) {
  if (!canvasPathFromPoints(ctx, points)) return;
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.restore();
}

function getNearestPlanetByDisplayPoint(x, y, positionMode = (viewMode === 'schematic' ? 'schematic' : 'image')) {
  let best = null;
  let bestDistanceSq = Infinity;
  state.planets.forEach((planet) => {
    const display = positionMode === 'image' ? getImagePlanetPosition(planet) : getSchematicPlanetPosition(planet);
    const dx = display.x - x;
    const dy = display.y - y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      best = planet;
    }
  });
  return best;
}

function pathEndpointDistanceSq(pathA, pathB) {
  const endpointsA = [pathA[0], pathA[pathA.length - 1]];
  const endpointsB = [pathB[0], pathB[pathB.length - 1]];
  let best = Infinity;
  endpointsA.forEach((a) => {
    endpointsB.forEach((b) => {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < best) best = distanceSq;
    });
  });
  return best;
}

function buildBoundsForPaths(paths) {
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  paths.forEach((path) => {
    path.forEach((point) => {
      if (point.x < bounds.minX) bounds.minX = point.x;
      if (point.y < bounds.minY) bounds.minY = point.y;
      if (point.x > bounds.maxX) bounds.maxX = point.x;
      if (point.y > bounds.maxY) bounds.maxY = point.y;
    });
  });
  return bounds;
}

function getRoutePathDistanceScore(sourcePaths, targetPaths) {
  if (!sourcePaths?.length || !targetPaths?.length) return Infinity;
  const samplePoints = sourcePaths.flatMap((path) => {
    if (!path.length) return [];
    return [path[0], path[Math.floor(path.length / 2)], path[path.length - 1]];
  });
  if (!samplePoints.length) return Infinity;
  let totalDistance = 0;
  samplePoints.forEach((point) => {
    let nearestDistanceSq = Infinity;
    targetPaths.forEach((path) => {
      for (let index = 1; index < path.length; index += 1) {
        nearestDistanceSq = Math.min(
          nearestDistanceSq,
          pointToSegmentDistanceSq(point.x, point.y, path[index - 1].x, path[index - 1].y, path[index].x, path[index].y)
        );
      }
    });
    totalDistance += Math.sqrt(nearestDistanceSq);
  });
  return totalDistance / samplePoints.length;
}

function mergeRouteGeometry(targetRoute, sourceRoute) {
  targetRoute.paths.push(...sourceRoute.paths);
  targetRoute.svgPaths.push(...sourceRoute.svgPaths);
  targetRoute.autoConnections.push(...sourceRoute.autoConnections);
  const planets = new Map((targetRoute.planets || []).map((planet) => [planet.id, planet]));
  (sourceRoute.planets || []).forEach((planet) => planets.set(planet.id, planet));
  targetRoute.planets = [...planets.values()];
  targetRoute.bounds = buildBoundsForPaths(targetRoute.paths);
}

function rebuildTacticalRouteCache(data, projectionMode) {
  const groupedRoutes = new Map();
  tacticalTravelEdges = [];
  const routeProjectionMode = getHyperlaneProjectionMode(projectionMode);
  (data?.hyperlanes || []).forEach((lane, laneIndex) => {
    const routeName = canonicalizeLoreRouteName(lane.name || `Hyperroute ${laneIndex + 1}`);
    if (!groupedRoutes.has(routeName)) {
      groupedRoutes.set(routeName, {
        name: routeName,
        pathEntries: []
      });
    }
    const route = groupedRoutes.get(routeName);
    (lane.paths || []).forEach((lanePath) => {
      const projectedPath = Array.isArray(lanePath)
        ? lanePath.map((point) => {
          const projected = projectArcgisToWorld(point[0], point[1], routeProjectionMode);
          return projectionMode === 'schematic' ? applySchematicReferenceOffset(projected) : projected;
        })
        : [];
      if (projectedPath.length < 2) return;
      const startPlanet = getNearestPlanetByDisplayPoint(projectedPath[0].x, projectedPath[0].y);
      const endPlanet = getNearestPlanetByDisplayPoint(projectedPath[projectedPath.length - 1].x, projectedPath[projectedPath.length - 1].y);
      route.pathEntries.push({
        projectedPath,
        svgPath: projectedPath.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' '),
        startPlanet,
        endPlanet
      });
    });
  });
  const connectivityThresholdSq = 80 * 80;
  tacticalRouteCache = [];
  groupedRoutes.forEach((group) => {
    const entries = group.pathEntries;
    const visited = new Set();
    let componentIndex = 0;
    for (let i = 0; i < entries.length; i += 1) {
      if (visited.has(i)) continue;
      const queue = [i];
      visited.add(i);
      const componentEntries = [];
      while (queue.length) {
        const currentIndex = queue.shift();
        const currentEntry = entries[currentIndex];
        componentEntries.push(currentEntry);
        for (let j = 0; j < entries.length; j += 1) {
          if (visited.has(j)) continue;
          if (pathEndpointDistanceSq(currentEntry.projectedPath, entries[j].projectedPath) <= connectivityThresholdSq) {
            visited.add(j);
            queue.push(j);
          }
        }
      }
      const componentName = componentIndex === 0 && visited.size === entries.length ? group.name : `${group.name} (${componentIndex + 1})`;
      const routeId = `hyperlane__${normalizePlanetKey(group.name)}__${componentIndex}`;
      const connectedPlanets = new Map();
      componentEntries.forEach((entry) => {
        if (entry.startPlanet) connectedPlanets.set(entry.startPlanet.id, entry.startPlanet);
        if (entry.endPlanet) connectedPlanets.set(entry.endPlanet.id, entry.endPlanet);
      });
      const paths = componentEntries.map((entry) => entry.projectedPath);
      const autoConnections = componentEntries
        .filter((entry) => entry.startPlanet && entry.endPlanet && entry.startPlanet.id !== entry.endPlanet.id)
        .map((entry) => ({
          startPlanetId: entry.startPlanet.id,
          endPlanetId: entry.endPlanet.id,
          path: entry.projectedPath
        }));
      tacticalRouteCache.push({
        id: routeId,
        name: componentName,
        paths,
        svgPaths: componentEntries.map((entry) => entry.svgPath),
        planets: [...connectedPlanets.values()],
        autoConnections,
        bounds: buildBoundsForPaths(paths)
      });
      componentIndex += 1;
    }
  });
  const canonicalRouteCandidates = tacticalRouteCache
    .filter((route) => !route.isCustom && !isUnnamedRoute(route))
    .map((route) => ({ route, referencePaths: route.paths.map((path) => path.slice()) }));
  ensureCustomRouteStore().forEach((customRoute) => {
    const connections = (customRoute.connections || []).map(normalizeRouteConnection).filter(Boolean);
    const paths = connections.map((connection) => {
      if (projectionMode !== 'schematic' && Array.isArray(connection.path) && connection.path.length >= 2) return connection.path;
      const startPlanet = planetIndex.get(connection.startPlanetId);
      const endPlanet = planetIndex.get(connection.endPlanetId);
      return startPlanet && endPlanet
        ? [getPlanetDisplayPosition(startPlanet), getPlanetDisplayPosition(endPlanet)]
        : null;
    }).filter(Boolean);
    if (!paths.length) return;
    const planets = new Map();
    connections.forEach((connection) => {
      const startPlanet = planetIndex.get(connection.startPlanetId);
      const endPlanet = planetIndex.get(connection.endPlanetId);
      if (startPlanet) planets.set(startPlanet.id, startPlanet);
      if (endPlanet) planets.set(endPlanet.id, endPlanet);
    });
    const routeRecord = {
      id: customRoute.id,
      name: customRoute.name,
      isCustom: true,
      paths,
      svgPaths: paths.map((path) => path
        .map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
        .join(' ')),
      planets: [...planets.values()],
      autoConnections: connections.map(serializeRouteConnection),
      bounds: buildBoundsForPaths(paths)
    };
    const hasGenericName = /^(?:gelöste|neue) route(?:\s+\d+)?$/i.test(String(customRoute.name || '').trim());
    if (hasGenericName) {
      const canonicalMatch = canonicalRouteCandidates
        .map((candidate) => ({
          route: candidate.route,
          distance: getRoutePathDistanceScore(routeRecord.paths, candidate.referencePaths)
        }))
        .filter((candidate) => candidate.distance <= 35)
        .sort((a, b) => a.distance - b.distance)[0];
      if (canonicalMatch) {
        customRoute.canonicalName = canonicalMatch.route.name;
        mergeRouteGeometry(canonicalMatch.route, routeRecord);
        return;
      }
      delete customRoute.canonicalName;
    }
    tacticalRouteCache.push(routeRecord);
  });
  tacticalRouteCache.forEach((route) => {
    const meta = getRouteMeta(route);
    if (!Array.isArray(meta?.connections)) return;
    const manualPaths = getRouteConnections(route).map((connection) => {
      const automaticMatch = (route.autoConnections || []).find((candidate) => {
        const candidateKey = [candidate.startPlanetId, candidate.endPlanetId].sort().join('__');
        const connectionKey = [connection.startPlanetId, connection.endPlanetId].sort().join('__');
        return candidateKey === connectionKey;
      });
      if (automaticMatch?.path?.length >= 2) return automaticMatch.path;
      const startPlanet = planetIndex.get(connection.startPlanetId);
      const endPlanet = planetIndex.get(connection.endPlanetId);
      return startPlanet && endPlanet
        ? [getPlanetDisplayPosition(startPlanet), getPlanetDisplayPosition(endPlanet)]
        : null;
    }).filter(Boolean);
    route.paths = manualPaths;
    route.svgPaths = manualPaths.map((path) => path
      .map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(' '));
    route.bounds = manualPaths.length ? buildBoundsForPaths(manualPaths) : null;
  });
  tacticalRouteCache.filter(isUnnamedRoute).forEach((route) => {
    const remainingConnections = [];
    const remainingPaths = [];
    getRouteConnections(route).forEach((connection) => {
      const connectionKey = [connection.startPlanetId, connection.endPlanetId].sort().join('__');
      const automaticMatch = (route.autoConnections || []).find((candidate) => {
        return [candidate.startPlanetId, candidate.endPlanetId].sort().join('__') === connectionKey;
      });
      const startPlanet = planetIndex.get(connection.startPlanetId);
      const endPlanet = planetIndex.get(connection.endPlanetId);
      const path = Array.isArray(connection.path) && connection.path.length >= 2
        ? connection.path
        : automaticMatch?.path?.length >= 2
          ? automaticMatch.path
          : startPlanet && endPlanet
            ? [getPlanetDisplayPosition(startPlanet), getPlanetDisplayPosition(endPlanet)]
            : null;
      if (!path) return;
      const canonicalMatch = canonicalRouteCandidates
        .map((candidate) => ({
          route: candidate.route,
          distance: getRoutePathDistanceScore([path], candidate.referencePaths)
        }))
        .filter((candidate) => candidate.distance <= 35)
        .sort((a, b) => a.distance - b.distance)[0];
      if (!canonicalMatch) {
        remainingConnections.push(serializeRouteConnection(connection));
        remainingPaths.push(path);
        return;
      }
      mergeRouteGeometry(canonicalMatch.route, {
        paths: [path],
        svgPaths: [path.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')],
        autoConnections: [serializeRouteConnection(connection)],
        planets: [startPlanet, endPlanet].filter(Boolean)
      });
    });
    route.runtimeConnections = remainingConnections;
    route.paths = remainingPaths;
    route.svgPaths = remainingPaths.map((path) => path
      .map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(' '));
    route.planets = getRoutePlanets(route);
    route.bounds = remainingPaths.length ? buildBoundsForPaths(remainingPaths) : null;
  });
  tacticalRouteCache = tacticalRouteCache.filter((route) => !isUnnamedRoute(route) || getRouteConnections(route).length);
  tacticalRouteCache.forEach((route) => {
    getRouteConnections(route).forEach((connection, connectionIndex) => {
      const startPlanet = planetIndex.get(connection.startPlanetId);
      const endPlanet = planetIndex.get(connection.endPlanetId);
      if (!startPlanet || !endPlanet) return;
      const path = route.isCustom && Array.isArray(route.paths?.[connectionIndex])
        ? route.paths[connectionIndex]
        : Array.isArray(connection.path) && connection.path.length >= 2
          ? connection.path
        : [getPlanetDisplayPosition(startPlanet), getPlanetDisplayPosition(endPlanet)];
      tacticalTravelEdges.push({
        id: `travel_edge__${route.id}__${connectionIndex}`,
        routeId: route.id,
        name: getRouteDisplayName(route),
        startPlanetId: startPlanet.id,
        endPlanetId: endPlanet.id,
        path,
        length: polylineLength(path)
      });
    });
  });
}

function drawCanvasPolygonRings(ctx, rings, projectionMode, options = {}) {
  if (!Array.isArray(rings) || !rings.length) return false;
  ctx.save();
  ctx.beginPath();
  let drew = false;
  rings.forEach((ring) => {
    if (!Array.isArray(ring) || ring.length < 2) return;
    const start = projectArcgisToWorld(ring[0][0], ring[0][1], projectionMode);
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < ring.length; i += 1) {
      const point = projectArcgisToWorld(ring[i][0], ring[i][1], projectionMode);
      ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
    drew = true;
  });
  if (!drew) {
    ctx.restore();
    return false;
  }
  if (options.fillStyle) {
    ctx.fillStyle = options.fillStyle;
    ctx.fill();
  }
  if (options.strokeStyle) {
    ctx.strokeStyle = options.strokeStyle;
    ctx.lineWidth = options.lineWidth ?? 1;
    ctx.setLineDash(options.dash || []);
    ctx.stroke();
  }
  ctx.restore();
  return true;
}

function drawCanvasText(ctx, x, y, text, options = {}) {
  if (!text || !Number.isFinite(x) || !Number.isFinite(y)) return;
  ctx.save();
  ctx.font = options.font || '700 24px Segoe UI';
  ctx.fillStyle = options.fillStyle || '#d5e7fb';
  ctx.textAlign = options.align || 'center';
  ctx.textBaseline = options.baseline || 'middle';
  if (options.strokeStyle) {
    ctx.lineWidth = options.strokeWidth || 3;
    ctx.strokeStyle = options.strokeStyle;
    ctx.strokeText(text, x, y);
  }
  ctx.fillText(text, x, y);
  ctx.restore();
}

function getRectGridLayout(mode = viewMode, options = {}) {
  const columnCount = options.columns || 24;
  const rowCount = options.rows || 22;
  const imageGridOffsetColumns = options.imageGridOffsetColumns ?? -1;
  const imageGridOffsetRows = options.imageGridOffsetRows ?? -0.2;
  if (mode === 'image') {
    if (!gridModel) buildGridModel();
    const colEntries = [...(gridModel?.colCenters?.entries?.() || [])]
      .filter(([, center]) => Number.isFinite(center))
      .sort((a, b) => a[0].localeCompare(b[0]));
    const rowEntries = [...(gridModel?.rowCenters?.entries?.() || [])]
      .filter(([, center]) => Number.isFinite(center))
      .sort((a, b) => a[0] - b[0]);
    if (colEntries.length >= columnCount && rowEntries.length >= rowCount) {
      const getAverageStep = (entries) => {
        const deltas = [];
        for (let i = 1; i < entries.length; i += 1) {
          const delta = entries[i][1] - entries[i - 1][1];
          if (Number.isFinite(delta) && Math.abs(delta) > 1) deltas.push(delta);
        }
        return deltas.length ? (deltas.reduce((sum, value) => sum + value, 0) / deltas.length) : 0;
      };
      const columns = colEntries.slice(0, columnCount).map(([label]) => ({ label }));
      const rows = rowEntries.slice(0, rowCount).map(([label]) => ({ label: String(label) }));
      const columnStep = getAverageStep(colEntries) || (WORLD_SIZE / columnCount);
      const rowStep = getAverageStep(rowEntries) || (WORLD_SIZE / rowCount);
      const columnOrigin = colEntries[0][1] - (columnStep / 2) + (imageGridOffsetColumns * columnStep);
      const rowOrigin = rowEntries[0][1] - (rowStep / 2) + (imageGridOffsetRows * rowStep);
      const verticalLines = Array.from({ length: columnCount + 1 }, (_, index) => columnOrigin + (index * columnStep));
      const horizontalLines = Array.from({ length: rowCount + 1 }, (_, index) => rowOrigin + (index * rowStep));
      columns.forEach((column, index) => {
        column.center = columnOrigin + ((index + 0.5) * columnStep);
      });
      rows.forEach((row, index) => {
        row.center = rowOrigin + ((index + 0.5) * rowStep);
      });
      return { columns, rows, verticalLines, horizontalLines };
    }
  }
  const colWidth = WORLD_SIZE / columnCount;
  const rowHeight = WORLD_SIZE / rowCount;
  return {
    columns: Array.from({ length: columnCount }, (_, index) => ({
      label: String.fromCharCode(65 + index),
      center: (index + 0.5) * colWidth
    })),
    rows: Array.from({ length: rowCount }, (_, index) => ({
      label: String(index + 1),
      center: (index + 0.5) * rowHeight
    })),
    verticalLines: Array.from({ length: columnCount + 1 }, (_, index) => index * colWidth),
    horizontalLines: Array.from({ length: rowCount + 1 }, (_, index) => index * rowHeight)
  };
}

function computePointBounds(points) {
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  points.forEach((point) => {
    bounds.minX = Math.min(bounds.minX, point.x);
    bounds.minY = Math.min(bounds.minY, point.y);
    bounds.maxX = Math.max(bounds.maxX, point.x);
    bounds.maxY = Math.max(bounds.maxY, point.y);
  });
  return bounds;
}

function projectArcgisRingsToWorld(rings, projectionMode) {
  return (rings || []).map((ring) => ring.map((point) => projectArcgisToWorld(point[0], point[1], projectionMode)));
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = ((yi > point.y) !== (yj > point.y))
      && (point.x < (((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-6)) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInAreaRings(point, rings) {
  let inside = false;
  rings.forEach((ring) => {
    if (ring.length >= 3 && pointInPolygon(point, ring)) inside = !inside;
  });
  return inside;
}

function createHoverArea(type, name, centroid, rings) {
  if (!name || !centroid || !Array.isArray(rings) || !rings.length) return null;
  const bounds = rings.reduce((acc, ring) => {
    const ringBounds = computePointBounds(ring);
    acc.minX = Math.min(acc.minX, ringBounds.minX);
    acc.minY = Math.min(acc.minY, ringBounds.minY);
    acc.maxX = Math.max(acc.maxX, ringBounds.maxX);
    acc.maxY = Math.max(acc.maxY, ringBounds.maxY);
    return acc;
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  return { type, name, centroid, rings, bounds };
}

function buildManualSectorHoverAreas() {
  return ensureSectorStore()
    .map((sector) => {
      const area = createHoverArea('sector', sector.name, averagePoints(sector.points), [sector.points]);
      return area ? { ...area, id: sector.id } : null;
    })
    .filter(Boolean);
}

function buildGroupedHoverAreas(mode = viewMode) {
  const getPosition = mode === 'schematic' ? getSchematicPlanetPosition : getImagePlanetPosition;
  const regionGroups = new Map();
  const sectorGroups = new Map();
  state.planets.forEach((planet) => {
    const regionName = String(planet.region || '').trim();
    if (regionName) {
      if (!regionGroups.has(regionName)) regionGroups.set(regionName, []);
      regionGroups.get(regionName).push(getPosition(planet));
    }
    const sectorName = String(planet.sector || '').trim();
    if (sectorName) {
      const sectorKey = `${regionName || 'Unknown Region'}::${sectorName}`;
      if (!sectorGroups.has(sectorKey)) sectorGroups.set(sectorKey, { regionName, sectorName, points: [] });
      sectorGroups.get(sectorKey).points.push(getPosition(planet));
    }
  });
  const regions = [];
  const sectors = [];
  regionGroups.forEach((points, regionName) => {
    if (points.length < 3) return;
    const hull = expandHull(convexHull(points), 1.06, 40);
    regions.push(createHoverArea('region', regionName, averagePoints(points), [hull]));
  });
  sectorGroups.forEach(({ sectorName, points }) => {
    if (points.length < 3) return;
    const hull = expandHull(convexHull(points), 1.03, 20);
    sectors.push(createHoverArea('sector', sectorName, averagePoints(points), [hull]));
  });
  return {
    regions: regions.filter(Boolean),
    sectors: sectors.filter(Boolean)
  };
}

function buildTacticalHoverAreas(data, projectionMode, mode = viewMode) {
  return { regions: [], sectors: buildManualSectorHoverAreas() };
}

function findHoveredArea(areas, x, y) {
  const point = { x, y };
  for (let i = 0; i < areas.length; i += 1) {
    const area = areas[i];
    if (!area?.bounds) continue;
    if (x < area.bounds.minX || x > area.bounds.maxX || y < area.bounds.minY || y > area.bounds.maxY) continue;
    if (pointInAreaRings(point, area.rings)) return area;
  }
  return null;
}

function nearestDisplayedZone(x, y) {
  if (!tacticalHoverAreas.sectors.length && !tacticalHoverAreas.regions.length) {
    const projectionMode = viewMode === 'schematic' ? 'schematic' : 'image';
    tacticalHoverAreas = buildTacticalHoverAreas(needsArcgisTacticalData() ? prepareArcgisData() : null, projectionMode, viewMode);
  }
  const sectorArea = findHoveredArea(tacticalHoverAreas.sectors, x, y);
  const regionArea = findHoveredArea(tacticalHoverAreas.regions, x, y);
  const sector = sectorArea;
  const region = regionArea;
  if (!sector && !region) return null;
  return {
    sector: sector ? { name: sector.name, centroid: sector.centroid } : null,
    region: region ? { name: region.name, centroid: region.centroid } : null,
    sectorArea: sectorArea || null,
    regionArea: regionArea || null
  };
}

function renderManualSectorOverlay() {
  tacticalOverlay.querySelectorAll('.manual-sector-shape, .manual-sector-label, .manual-sector-draft-line, .manual-sector-ghost-line, .manual-sector-draft-point').forEach((el) => el.remove());
  const frag = document.createDocumentFragment();
  if (layers.sectorLabels) {
    ensureSectorStore().forEach((sector) => {
      if (!Array.isArray(sector.points) || sector.points.length < 3) return;
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', sector.points.map((point) => `${point.x},${point.y}`).join(' '));
      polygon.setAttribute('class', `manual-sector-shape${hoveredZoneInfo?.sector?.name === sector.name ? ' hovered' : ''}`);
      frag.appendChild(polygon);
      const centroid = averagePoints(sector.points);
      addSvgText(frag, { x: centroid.x, y: centroid.y, class: 'manual-sector-label' }, sector.name);
    });
  }
  if (activeSectorDraft?.points?.length) {
    const previewPolar = activeSectorDraft.preview;
    const previewRaw = activeSectorDraft.previewRaw;
    const lastPoint = activeSectorDraft.points[activeSectorDraft.points.length - 1];
    const hasDistinctPreview = Boolean(previewPolar && (
      previewPolar.radius !== lastPoint?.radius
      || previewPolar.angle !== lastPoint?.angle
    ));
    const previewPoints = buildSectorPolygonPoints(activeSectorDraft.points, hasDistinctPreview ? previewPolar : null, false);
    if (previewPoints.length >= 2) {
      const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline.setAttribute('points', previewPoints.map((point) => `${point.x},${point.y}`).join(' '));
      polyline.setAttribute('class', 'manual-sector-draft-line');
      frag.appendChild(polyline);
    }
    activeSectorDraft.points.forEach((polarPoint, index) => {
      const point = polarToSectorPoint(polarPoint.angle, polarPoint.radius);
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', point.x);
      circle.setAttribute('cy', point.y);
      circle.setAttribute('r', index === 0 ? 6 : 5);
      circle.setAttribute('class', 'manual-sector-draft-point');
      frag.appendChild(circle);
    });
    if (previewRaw && lastPoint) {
      const ghostStart = hasDistinctPreview
        ? polarToSectorPoint(previewPolar.angle, previewPolar.radius)
        : polarToSectorPoint(lastPoint.angle, lastPoint.radius);
      const rawPreviewLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      rawPreviewLine.setAttribute('x1', ghostStart.x);
      rawPreviewLine.setAttribute('y1', ghostStart.y);
      rawPreviewLine.setAttribute('x2', previewRaw.x);
      rawPreviewLine.setAttribute('y2', previewRaw.y);
      rawPreviewLine.setAttribute('class', 'manual-sector-ghost-line');
      frag.appendChild(rawPreviewLine);
    }
    if (hasDistinctPreview) {
      const previewPoint = polarToSectorPoint(previewPolar.angle, previewPolar.radius);
      const previewCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      previewCircle.setAttribute('cx', previewPoint.x);
      previewCircle.setAttribute('cy', previewPoint.y);
      previewCircle.setAttribute('r', 5);
      previewCircle.setAttribute('class', 'manual-sector-draft-point');
      previewCircle.setAttribute('opacity', '0.55');
      frag.appendChild(previewCircle);
    }
  }
  tacticalOverlay.appendChild(frag);
}

function renderTacticalHoverLabels() {
  tacticalOverlay.querySelectorAll('.tactical-hover-label').forEach((el) => el.remove());
  if (!layers.sectorLabels || !hoveredZoneInfo) return;
  const frag = document.createDocumentFragment();
  if (hoveredZoneInfo.region?.name && hoveredZoneInfo.region?.centroid) {
    addSvgText(frag, { x: hoveredZoneInfo.region.centroid.x, y: hoveredZoneInfo.region.centroid.y, class: 'tactical-hover-label region' }, hoveredZoneInfo.region.name);
  }
  if (hoveredZoneInfo.sector?.name && hoveredZoneInfo.sector?.centroid) {
    const regionCentroid = hoveredZoneInfo.region?.centroid;
    const sectorY = regionCentroid && Math.abs(regionCentroid.y - hoveredZoneInfo.sector.centroid.y) < 42
      ? hoveredZoneInfo.sector.centroid.y + 34
      : hoveredZoneInfo.sector.centroid.y;
    addSvgText(frag, { x: hoveredZoneInfo.sector.centroid.x, y: sectorY, class: 'tactical-hover-label sector' }, hoveredZoneInfo.sector.name);
  }
  tacticalOverlay.appendChild(frag);
}

function drawRectGridSection(ctx, options = {}) {
  const layout = getRectGridLayout(options.mode || viewMode, options);
  ctx.save();
  ctx.strokeStyle = options.strokeStyle || 'rgba(88,222,255,.6)';
  ctx.lineWidth = options.lineWidth || 1.15;
  layout.verticalLines.forEach((x) => {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD_SIZE);
    ctx.stroke();
  });
  layout.horizontalLines.forEach((y) => {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_SIZE, y);
    ctx.stroke();
  });
  ctx.restore();
  layout.columns.forEach(({ label, center }) => {
    drawCanvasText(ctx, center, 24, label, {
      font: '700 20px Segoe UI',
      fillStyle: 'rgba(133,240,255,.6)',
      strokeStyle: 'rgba(0,0,0,.38)',
      strokeWidth: 3
    });
  });
  layout.rows.forEach(({ label, center }) => {
    drawCanvasText(ctx, 16, center + 6, label, {
      font: '700 20px Segoe UI',
      fillStyle: 'rgba(133,240,255,.6)',
      strokeStyle: 'rgba(0,0,0,.38)',
      strokeWidth: 3,
      align: 'left'
    });
  });
}

function getInfluenceAdjacency() {
  const adjacency = new Map();
  tacticalTravelEdges.forEach((edge) => {
    if (!adjacency.has(edge.startPlanetId)) adjacency.set(edge.startPlanetId, new Set());
    if (!adjacency.has(edge.endPlanetId)) adjacency.set(edge.endPlanetId, new Set());
    adjacency.get(edge.startPlanetId).add(edge.endPlanetId);
    adjacency.get(edge.endPlanetId).add(edge.startPlanetId);
  });
  return adjacency;
}

function getNeutralInfluenceStatus(planet, adjacency) {
  if (!planet || planet.owner !== 'NEUTRAL') return null;
  const neighbors = [...(adjacency.get(planet.id) || [])]
    .map((neighborId) => planetIndex.get(neighborId))
    .filter(Boolean);
  const hasGAR = neighbors.some((neighbor) => getPlanetInfluenceFaction(neighbor) === 'GAR');
  const hasKUS = neighbors.some((neighbor) => getPlanetInfluenceFaction(neighbor) === 'KUS');
  const hasHUTT = neighbors.some((neighbor) => getPlanetInfluenceFaction(neighbor) === 'HUTT');
  if ((hasGAR && hasKUS) || (hasGAR && hasHUTT) || (hasKUS && hasHUTT)) return 'CONTESTED';
  if (hasGAR) return 'GAR_PRESSURE';
  if (hasKUS) return 'KUS_PRESSURE';
  if (hasHUTT) return 'HUTT_PRESSURE';
  return 'NEUTRAL';
}

function getHyperlaneVisualState(a, b, adjacency) {
  const ownerA = getPlanetInfluenceFaction(a);
  const ownerB = getPlanetInfluenceFaction(b);
  if (!a || !b) return { color: 'rgba(160,170,188,.28)', contested: false };
  if (ownerA === 'GAR' && ownerB === 'GAR') return { color: 'rgba(31,124,255,.5)', contested: false };
  if (ownerA === 'KUS' && ownerB === 'KUS') return { color: 'rgba(208,54,50,.5)', contested: false };
  if (ownerA === 'HUTT' && ownerB === 'HUTT') return { color: 'rgba(31,107,72,.6)', contested: false };
  if ((ownerA === 'GAR' && ownerB === 'KUS') || (ownerA === 'KUS' && ownerB === 'GAR')) return { color: 'rgba(156,67,255,.72)', contested: true };
  if ((ownerA === 'GAR' && ownerB === 'HUTT') || (ownerA === 'HUTT' && ownerB === 'GAR')) return { color: 'rgba(64,146,108,.62)', contested: true };
  if ((ownerA === 'KUS' && ownerB === 'HUTT') || (ownerA === 'HUTT' && ownerB === 'KUS')) return { color: 'rgba(78,142,96,.62)', contested: true };
  if (ownerA === 'NEUTRAL' && ownerB === 'NEUTRAL') {
    const aStatus = getNeutralInfluenceStatus(a, adjacency);
    const bStatus = getNeutralInfluenceStatus(b, adjacency);
    if (aStatus === 'CONTESTED' || bStatus === 'CONTESTED') return { color: 'rgba(156,67,255,.42)', contested: true };
    return { color: 'rgba(170,176,188,.32)', contested: false };
  }
  const neutral = ownerA === 'NEUTRAL' ? a : (ownerB === 'NEUTRAL' ? b : null);
  const faction = neutral && neutral.id === a.id ? b : a;
  const neutralStatus = neutral ? getNeutralInfluenceStatus(neutral, adjacency) : null;
  if (neutralStatus === 'CONTESTED') return { color: getPlanetInfluenceFaction(faction) === 'GAR' ? 'rgba(110,140,255,.66)' : 'rgba(186,94,255,.66)', contested: true };
  if (neutralStatus === 'GAR_PRESSURE') return { color: 'rgba(94,154,255,.44)', contested: true };
  if (neutralStatus === 'KUS_PRESSURE') return { color: 'rgba(222,98,120,.44)', contested: true };
  if (neutralStatus === 'HUTT_PRESSURE') return { color: 'rgba(31,107,72,.5)', contested: true };
  return { color: 'rgba(170,176,188,.32)', contested: false };
}

function drawInfluencePlanetHalo(ctx, x, y, innerColor, outerColor, radius) {
  const gradient = ctx.createRadialGradient(x, y, radius * 0.08, x, y, radius);
  gradient.addColorStop(0, innerColor);
  gradient.addColorStop(0.55, outerColor);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.fillStyle = gradient;
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function renderInfluenceClouds() {
  const width = influenceCanvas.width || WORLD_SIZE;
  const height = influenceCanvas.height || WORLD_SIZE;
  influenceCtx.clearRect(0, 0, width, height);
  if (layers.influence) {
    if (!tacticalBaseReady && viewMode !== 'schematic') {
      scheduleTacticalBaseBuild();
    } else {
      const adjacency = getInfluenceAdjacency();
      const drawCloudPass = (predicate, strokeStyle, lineWidth, blur, alpha) => {
        influenceCtx.save();
        influenceCtx.globalAlpha = alpha;
        influenceCtx.filter = `blur(${blur}px)`;
        influenceCtx.lineCap = 'round';
        influenceCtx.lineJoin = 'round';
        influenceCtx.strokeStyle = strokeStyle;
        influenceCtx.lineWidth = lineWidth;
        tacticalTravelEdges.forEach((edge) => {
          const start = planetIndex.get(edge.startPlanetId);
          const end = planetIndex.get(edge.endPlanetId);
          if (!start || !end || !predicate(start, end, edge)) return;
          canvasPathFromPoints(influenceCtx, edge.path);
          influenceCtx.stroke();
        });
        influenceCtx.restore();
      };

      drawCloudPass((a, b) => getPlanetInfluenceFaction(a) === 'GAR' && getPlanetInfluenceFaction(b) === 'GAR', 'rgba(31,124,255,.95)', 70, 18, 0.28);
      drawCloudPass((a, b) => getPlanetInfluenceFaction(a) === 'KUS' && getPlanetInfluenceFaction(b) === 'KUS', 'rgba(208,54,50,.95)', 70, 18, 0.28);
      drawCloudPass((a, b) => getPlanetInfluenceFaction(a) === 'HUTT' && getPlanetInfluenceFaction(b) === 'HUTT', 'rgba(31,107,72,.92)', 66, 18, 0.26);
      if (layers.contested) {
        drawCloudPass((a, b) => {
          const visual = getHyperlaneVisualState(a, b, adjacency);
          return visual.contested;
        }, 'rgba(156,67,255,.88)', 54, 16, 0.22);
      }

      state.planets.forEach((planet) => {
        const position = getPlanetDisplayPosition(planet);
        const influenceOwner = getPlanetInfluenceFaction(planet);
        if (influenceOwner === 'GAR') {
          drawInfluencePlanetHalo(influenceCtx, position.x, position.y, 'rgba(115,184,255,.5)', 'rgba(31,124,255,.2)', 68);
          return;
        }
        if (influenceOwner === 'KUS') {
          drawInfluencePlanetHalo(influenceCtx, position.x, position.y, 'rgba(255,126,126,.46)', 'rgba(208,54,50,.18)', 68);
          return;
        }
        if (influenceOwner === 'HUTT') {
          drawInfluencePlanetHalo(influenceCtx, position.x, position.y, 'rgba(68,170,118,.42)', 'rgba(31,107,72,.18)', 62);
          return;
        }
        if (layers.contested) {
          const status = getNeutralInfluenceStatus(planet, adjacency);
          if (status === 'CONTESTED') {
            drawInfluencePlanetHalo(influenceCtx, position.x, position.y, 'rgba(205,150,255,.42)', 'rgba(156,67,255,.16)', 60);
          } else if (status === 'GAR_PRESSURE') {
            drawInfluencePlanetHalo(influenceCtx, position.x, position.y, 'rgba(133,190,255,.22)', 'rgba(122,140,160,.1)', 48);
          } else if (status === 'KUS_PRESSURE') {
            drawInfluencePlanetHalo(influenceCtx, position.x, position.y, 'rgba(255,138,138,.22)', 'rgba(152,132,144,.1)', 48);
          } else if (status === 'HUTT_PRESSURE') {
            drawInfluencePlanetHalo(influenceCtx, position.x, position.y, 'rgba(68,170,118,.24)', 'rgba(31,107,72,.12)', 48);
          } else {
            drawInfluencePlanetHalo(influenceCtx, position.x, position.y, 'rgba(255,228,112,.14)', 'rgba(178,178,178,.08)', 40);
          }
        }
      });
    }
  }

  if (layers.sectorLabels) {
    const sectors = ensureSectorStore().filter((sector) => Array.isArray(sector?.points) && sector.points.length >= 3);
    sectors.forEach((sector) => {
      const summary = getManualSectorControlSummary(sector);
      if (!summary.total) return;
      const influenceState = getSectorInfluenceState(summary);
      const palette = layers.conflictPulse
        ? getSectorInfluencePalette(influenceState.dominantOwner || 'NEUTRAL')
        : { fill: 'rgba(142,152,170,.16)', edge: 'rgba(180,188,201,.66)' };
      const fill = palette.fill;
      const edge = palette.edge;
      if (!fill || !edge || !traceSectorPolygonPath(influenceCtx, sector.points)) return;
      influenceCtx.save();
      influenceCtx.fillStyle = fill;
      influenceCtx.strokeStyle = edge;
      influenceCtx.lineWidth = 3;
      influenceCtx.shadowColor = edge;
      influenceCtx.shadowBlur = 12;
      influenceCtx.fill();
      influenceCtx.stroke();
      influenceCtx.restore();
    });
  }
}

function createTacticalSectionCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getHyperlaneProjectionMode(projectionMode) {
  return projectionMode === 'schematic' ? 'image' : projectionMode;
}

function renderTacticalSectionToContext(ctx, sectionName, data, projectionMode) {
  renderSectionSafely(sectionName, () => {
    if (sectionName === 'grid') {
      drawRectGridSection(ctx, { mode: projectionMode === 'image' ? 'image' : 'schematic' });
      return;
    }
    if (sectionName === 'sectors') {
      return;
    }
    if (sectionName === 'hyperlanes') {
      if (!tacticalRouteCache.length) rebuildTacticalRouteCache(data, getHyperlaneProjectionMode(projectionMode));
      const adjacency = getInfluenceAdjacency();
      tacticalRouteCache.forEach((route) => {
        route.paths.forEach((projected) => {
          const startPlanet = getNearestPlanetByDisplayPoint(projected[0].x, projected[0].y);
          const endPlanet = getNearestPlanetByDisplayPoint(projected[projected.length - 1].x, projected[projected.length - 1].y);
          const visual = getHyperlaneVisualState(startPlanet, endPlanet, adjacency);
          drawCanvasPolyline(ctx, projected, visual.color, 4, [10, 8]);
        });
      });
    }
  });
}

function getTacticalSectionCanvas(sectionName, data, projectionMode, width, height) {
  const cacheKey = `${projectionMode}:${sectionName}:${width}x${height}`;
  if (tacticalSectionCanvasCache.has(cacheKey)) return tacticalSectionCanvasCache.get(cacheKey);
  const canvas = createTacticalSectionCanvas(width, height);
  const ctx = canvas.getContext('2d');
  renderTacticalSectionToContext(ctx, sectionName, data, projectionMode);
  tacticalSectionCanvasCache.set(cacheKey, canvas);
  return canvas;
}

function convexHull(points) {
  if (points.length <= 2) return points.slice();
  const sorted = points
    .map((point) => ({ x: point.x, y: point.y }))
    .sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const cross = (o, a, b) => ((a.x - o.x) * (b.y - o.y)) - ((a.y - o.y) * (b.x - o.x));
  const lower = [];
  sorted.forEach((point) => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  });
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const point = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function expandHull(points, scale = 1.08, minRadius = 22) {
  if (!points.length) return [];
  const center = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  center.x /= points.length;
  center.y /= points.length;
  return points.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const distance = Math.hypot(dx, dy) || 1;
    const target = Math.max(distance * scale, distance + minRadius);
    return {
      x: clamp(center.x + (dx / distance) * target, 0, WORLD_SIZE),
      y: clamp(center.y + (dy / distance) * target, 0, WORLD_SIZE)
    };
  });
}

function drawHull(parent, points, className) {
  if (points.length < 3) return;
  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygon.setAttribute('points', points.map((point) => `${point.x},${point.y}`).join(' '));
  polygon.setAttribute('class', className);
  parent.appendChild(polygon);
}

function scheduleTacticalBaseBuild() {
  if (tacticalBaseReady || tacticalBuildQueued) return;
  const projectionMode = viewMode === 'schematic' ? 'schematic' : 'image';
  if (!needsArcgisTacticalData()) {
    tacticalBaseReady = true;
    return;
  }
  const data = prepareArcgisData();
  if (!data) {
    tacticalBaseReady = true;
    return;
  }
  tacticalBuildQueued = true;
  const buildVersion = tacticalBuildVersion;
  const width = tacticalCanvas.width || WORLD_SIZE;
  const height = tacticalCanvas.height || WORLD_SIZE;
  const runStep = (step) => {
    window.setTimeout(() => {
      if (buildVersion !== tacticalBuildVersion) return;
      try {
        step();
      } catch (error) {
        tacticalBuildQueued = false;
        console.error('scheduleTacticalBaseBuild failed', error);
        setStatus('ArcGIS-Overlay konnte nicht vorbereitet werden. Fallback aktiv.');
      }
    }, 0);
  };
  const finishBuild = () => {
    if (buildVersion !== tacticalBuildVersion) return;
    tacticalBuildQueued = false;
    tacticalBaseReady = true;
    markDirty({ tacticalBase: true, influence: true, layers: true });
  };
  runStep(() => {
    if (layers.hyperlanes) {
      rebuildTacticalRouteCache(data, projectionMode);
    } else {
      tacticalRouteCache = [];
      tacticalTravelEdges = [];
    }
    runStep(() => {
      if (layers.grid) getTacticalSectionCanvas('grid', data, projectionMode, width, height);
      runStep(() => {
        if (layers.sectorLabels) getTacticalSectionCanvas('sectors', data, projectionMode, width, height);
        runStep(() => {
          if (layers.hyperlanes) getTacticalSectionCanvas('hyperlanes', data, projectionMode, width, height);
          runStep(() => {
            tacticalHoverAreas = layers.sectorLabels
              ? buildTacticalHoverAreas(data, projectionMode, viewMode)
              : { regions: [], sectors: [] };
            finishBuild();
          });
        });
      });
    });
  });
}

function renderTacticalBase() {
  const width = tacticalCanvas.width || WORLD_SIZE;
  const height = tacticalCanvas.height || WORLD_SIZE;
  tacticalCtx.clearRect(0, 0, width, height);
  tacticalOverlay.innerHTML = '';
  const data = needsArcgisTacticalData() ? prepareArcgisData() : null;
  const projectionMode = viewMode === 'schematic' ? 'schematic' : 'image';
  const needsRouteCacheBuild = layers.hyperlanes && !tacticalRouteCache.length;
  const needsHoverAreaBuild = layers.sectorLabels && !tacticalHoverAreas.sectors.length && !tacticalHoverAreas.regions.length;
  tacticalDebugRenderCount += 1;
  if (TACTICAL_DEBUG) {
    const canvasRect = tacticalCanvas.getBoundingClientRect();
    const overlayRect = tacticalOverlay.getBoundingClientRect();
    const worldRect = world.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const canvasStyle = getComputedStyle(tacticalCanvas);
    const overlayStyle = getComputedStyle(tacticalOverlay);
    const sampleArcPlanet = data?.planets?.[0] || null;
    const sampleProjected = sampleArcPlanet ? {
      image: projectArcgisToWorld(sampleArcPlanet.x, sampleArcPlanet.y, 'image'),
      schematic: projectArcgisToWorld(sampleArcPlanet.x, sampleArcPlanet.y, 'schematic')
    } : null;
    logTacticalDebug(`renderTacticalBase #${tacticalDebugRenderCount}`, {
      viewMode,
      layers: { ...layers },
      hasArcgisData: Boolean(data),
      mapAnalysisUnavailable,
      mapAnalysisReady: Boolean(mapAnalysis),
      canvas: {
        width,
        height,
        clientWidth: tacticalCanvas.clientWidth,
        clientHeight: tacticalCanvas.clientHeight,
        rect: { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height },
        display: canvasStyle.display,
        visibility: canvasStyle.visibility,
        opacity: canvasStyle.opacity,
        zIndex: canvasStyle.zIndex
      },
      overlay: {
        childCount: tacticalOverlay.childNodes.length,
        rect: { left: overlayRect.left, top: overlayRect.top, width: overlayRect.width, height: overlayRect.height },
        display: overlayStyle.display,
        visibility: overlayStyle.visibility,
        opacity: overlayStyle.opacity,
        zIndex: overlayStyle.zIndex
      },
      world: {
        className: world.className,
        transform: world.style.transform,
        rect: { left: worldRect.left, top: worldRect.top, width: worldRect.width, height: worldRect.height }
      },
      viewport: {
        rect: { left: viewportRect.left, top: viewportRect.top, width: viewportRect.width, height: viewportRect.height }
      },
      sampleArcPlanet,
      sampleProjected
    });
  }
  if (data) {
    if (!tacticalBaseReady || needsRouteCacheBuild || needsHoverAreaBuild) {
      tacticalBaseReady = false;
      scheduleTacticalBaseBuild();
      return;
    }
    try {
      if (layers.grid) tacticalCtx.drawImage(getTacticalSectionCanvas('grid', data, projectionMode, width, height), 0, 0);
      if (layers.sectorLabels) tacticalCtx.drawImage(getTacticalSectionCanvas('sectors', data, projectionMode, width, height), 0, 0);
      if (layers.hyperlanes) tacticalCtx.drawImage(getTacticalSectionCanvas('hyperlanes', data, projectionMode, width, height), 0, 0);

      renderTacticalRouteInteraction();
      return;
    } catch (error) {
      console.error('renderTacticalBase failed', error);
      setStatus('ArcGIS-Overlay konnte nicht gerendert werden. Fallback aktiv.');
    }
  }

  const frag = document.createDocumentFragment();
  tacticalHoverAreas = buildTacticalHoverAreas(null, 'image', 'schematic');

  const columnCount = 24;
  const rowCount = 22;
  const colWidth = WORLD_SIZE / columnCount;
  const rowHeight = WORLD_SIZE / rowCount;

  if (layers.grid) {
    for (let col = 0; col <= columnCount; col += 1) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', col * colWidth);
      line.setAttribute('y1', 0);
      line.setAttribute('x2', col * colWidth);
      line.setAttribute('y2', WORLD_SIZE);
      line.setAttribute('class', 'grid-line');
      frag.appendChild(line);
    }
    for (let row = 0; row <= rowCount; row += 1) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', 0);
      line.setAttribute('y1', row * rowHeight);
      line.setAttribute('x2', WORLD_SIZE);
      line.setAttribute('y2', row * rowHeight);
      line.setAttribute('class', 'grid-line');
      frag.appendChild(line);
    }

    for (let col = 0; col < columnCount; col += 1) {
      const label = String.fromCharCode(65 + col);
      addSvgText(frag, { x: col * colWidth + colWidth / 2, y: 34, class: 'grid-label', 'text-anchor': 'middle' }, label);
    }
    for (let row = 0; row < rowCount; row += 1) {
      addSvgText(frag, { x: 18, y: row * rowHeight + rowHeight / 2 + 8, class: 'grid-label' }, String(row + 1));
    }
  }

  if (layers.grid) {
    [0.24, 0.39, 0.57, 0.76].forEach((scale) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', WORLD_SIZE / 2);
      circle.setAttribute('cy', WORLD_SIZE / 2);
      circle.setAttribute('r', WORLD_SIZE * scale);
      circle.setAttribute('class', 'schematic-ring');
      frag.appendChild(circle);
    });
  }

  if (layers.hyperlanes && viewMode !== 'schematic') {
    const adjacency = getInfluenceAdjacency();
    routeCache.forEach(({ a, b }) => {
      const start = getSchematicPlanetPosition(a);
      const end = getSchematicPlanetPosition(b);
      const visual = getHyperlaneVisualState(a, b, adjacency);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', start.x);
      line.setAttribute('y1', start.y);
      line.setAttribute('x2', end.x);
      line.setAttribute('y2', end.y);
      line.setAttribute('class', 'tactical-hyperlane');
      line.style.stroke = visual.color;
      frag.appendChild(line);
    });
  }

  if (layers.hyperlanes) {
    const adjacency = getInfluenceAdjacency();
    tacticalRouteCache.filter(isCustomRoute).forEach((route) => {
      route.svgPaths.forEach((pathData, pathIndex) => {
        const connection = getRouteConnections(route)[pathIndex];
        const startPlanet = connection ? planetIndex.get(connection.startPlanetId) : null;
        const endPlanet = connection ? planetIndex.get(connection.endPlanetId) : null;
        const visual = getHyperlaneVisualState(startPlanet, endPlanet, adjacency);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('class', 'tactical-hyperlane');
        path.style.stroke = visual.color;
        frag.appendChild(path);
      });
    });
  }

  tacticalOverlay.appendChild(frag);
  renderTacticalRouteInteraction();
}

function applyViewMode() {
  const isSchematic = viewMode === 'schematic';
  world.classList.toggle('schematic', isSchematic);
  mapEl.style.display = isSchematic ? 'none' : 'block';
  influenceCanvas.style.display = 'block';
  influenceCanvas.style.opacity = '1';
  tacticalCanvas.style.display = 'block';
  tacticalCanvas.style.opacity = '1';
  tacticalOverlay.style.display = 'block';
  tacticalOverlay.style.opacity = '1';
  document.getElementById('viewModeBtn').textContent = isSchematic ? 'Image Map' : 'Schematic Map';
}

function applyLayers() {
  const isSchematic = viewMode === 'schematic';
  applyViewMode();
  syncLayerCheckboxes();
  planetLayer.classList.toggle('hidden', !layers.planets);
  legendPanel.classList.toggle('active', Boolean(layers.legend) && activeMainTab === 'map');
  const showLabels = layers.planetLabels && (zoom >= LABEL_ZOOM_THRESHOLD || isClusterZoomActive());
  planetLayer.classList.toggle('show-labels', showLabels);
  planetElements.forEach(({ label }) => {
    label.classList.toggle('is-hidden-by-zoom', layers.planetLabels && zoom < LABEL_ZOOM_THRESHOLD && !isClusterZoomActive());
  });
  overlay.classList.toggle('hide-hyperlanes', !layers.hyperlanes);
  fleetElements.forEach((el, fleetId) => {
    const fleet = fleetIndex.get(fleetId);
    const isVisible = isFleetElementVisible(fleet);
    el.classList.toggle('hidden', !isVisible);
  });
  const showInfluenceCanvas = layers.sectorLabels;
  const showTacticalCanvas = isSchematic
    ? (layers.hyperlanes || layers.sectorLabels)
    : (layers.grid || layers.sectorLabels || layers.hyperlanes);
  const showTacticalOverlay = isSchematic
    ? (layers.grid || layers.hyperlanes || layers.sectorLabels)
    : (layers.hyperlanes || layers.sectorLabels);
  if (TACTICAL_DEBUG) {
    logTacticalDebug('applyLayers', {
      viewMode,
      isSchematic,
      zoom,
      layers: { ...layers },
      showInfluenceCanvas,
      showTacticalCanvas,
      showTacticalOverlay,
      mapDisplay: getComputedStyle(mapEl).display,
      mapOpacity: getComputedStyle(mapEl).opacity,
      influenceDisplayBefore: getComputedStyle(influenceCanvas).display,
      canvasDisplayBefore: getComputedStyle(tacticalCanvas).display,
      overlayDisplayBefore: getComputedStyle(tacticalOverlay).display
    });
  }
  influenceCanvas.classList.toggle('hidden', !showInfluenceCanvas);
  influenceCanvas.style.display = showInfluenceCanvas ? 'block' : 'none';
  tacticalCanvas.classList.toggle('hidden', !showTacticalCanvas);
  tacticalCanvas.style.display = showTacticalCanvas ? 'block' : 'none';
  tacticalOverlay.classList.toggle('hidden', !showTacticalOverlay);
  tacticalOverlay.style.display = showTacticalOverlay ? 'block' : 'none';
  renderTacticalHoverLabels();
  if (TACTICAL_DEBUG) {
    logTacticalDebug('applyLayers result', {
      influenceClass: influenceCanvas.className,
      influenceDisplayAfter: getComputedStyle(influenceCanvas).display,
      canvasClass: tacticalCanvas.className,
      canvasDisplayAfter: getComputedStyle(tacticalCanvas).display,
      overlayClass: tacticalOverlay.className,
      overlayDisplayAfter: getComputedStyle(tacticalOverlay).display,
      overlayChildren: tacticalOverlay.childNodes.length
    });
  }
}

function flushRender() {
  renderQueued = false;
  isRendering = true;
  try {
    if (dirtyTransform) {
      applyTransform();
      dirtyTransform = false;
    }
    if (dirtyPositions) {
      ensurePlanetElements();
      ensureMarkerElements();
      ensureFleetElements();
      dirtyPositions = false;
    }
    if (dirtyFrontline) {
      if (needsRouteNetwork()) {
        buildRouteCache();
        renderFrontline();
      } else {
        routeCache = [];
        tacticalRouteCache = [];
        tacticalTravelEdges = [];
        overlay.innerHTML = '';
      }
      renderTacticalBase();
      if (layers.sectorLabels) renderInfluenceClouds();
      dirtyFrontline = false;
      dirtyInfluence = false;
      dirtyTacticalBase = false;
      dirtyRouteOverlay = false;
    }
    if (dirtyTacticalBase) {
      renderTacticalBase();
      if (dirtyInfluence) {
        renderInfluenceClouds();
        dirtyInfluence = false;
      }
      dirtyTacticalBase = false;
    }
    if (dirtyInfluence) {
      renderInfluenceClouds();
      dirtyInfluence = false;
    }
    if (dirtyRouteOverlay) {
      renderFrontline();
      dirtyRouteOverlay = false;
    }
    if (dirtyLayers) {
      applyLayers();
      dirtyLayers = false;
    }
  } finally {
    isRendering = false;
  }
}

