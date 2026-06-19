// Generated from app-shell.js: routes, planets, fleets, management interactions

function render(options = { transform: true, positions: true, frontline: true, influence: true, layers: true }) {
  markDirty(options);
}

function renderAll(options = { transform: true, positions: true, frontline: true, influence: true, layers: true }) {
  render(options);
  if (renderQueued) flushRender();
}

function scheduleDeferredFullRender(delay = 60) {
  if (deferredFullRenderTimer) window.clearTimeout(deferredFullRenderTimer);
  deferredFullRenderTimer = window.setTimeout(() => {
    deferredFullRenderTimer = null;
    renderAll({ frontline: true, influence: true, layers: true });
  }, delay);
}

function renderBaseThenDeferHeavy() {
  renderAll({ transform: true, positions: true, layers: true });
  scheduleDeferredFullRender();
}

function refreshFleetSelectionState() {
  state.fleets.forEach((fleet) => updateFleetElement(fleet));
}

function openRoute(id) {
  const route = tacticalRouteCache.find((entry) => entry.id === id) || routeCache.find((entry) => entry.id === id);
  if (!route) return;
  selected = { type: 'route', id };
  refreshFleetSelectionState();
  refreshRouteSelectionState();
  const dominance = getRouteDominance(route);
  const meta = getRouteMeta(route);
  const disabled = canEditPlanet() ? '' : 'disabled';
  const routePlanets = getRoutePlanets(route).map((planet) => planet.name).join(', ') || (route.a && route.b ? `${route.a.name}, ${route.b.name}` : '—');
  const routeConnections = getRouteConnections(route);
  const canEditConnections = canEditPlanet() && canManuallyEditRoute(route);
  infoPanel.style.display = 'block';
  infoPanel.innerHTML = `
    ${getInfoPanelHeader(getRouteDisplayName(route))}
    <p><span class="badge">${getRouteDisplayName(route)}</span></p>
    <p class="muted">Route-ID: ${route.id} • Verbundene Planeten: ${routePlanets}</p>
    <div class="form-row"><label>Routenname</label><input id="routeName" value="${getRouteDisplayName(route)}" ${disabled}></div>
    <p class="muted">Dominanz automatisch aus den verbundenen Planeten berechnet.</p>
    <p class="muted">GAR ${dominance.gar.toFixed(0)}% • KUS ${dominance.kus.toFixed(0)}% • HUTT ${dominance.hutt.toFixed(0)}% • Neutral / umkämpft ${dominance.neutral.toFixed(0)}%</p>
    ${canManuallyEditRoute(route) ? `
      <div class="form-row">
        <label>Manuelle Routenverbindungen</label>
        <div class="route-connection-list">
          ${routeConnections.length ? routeConnections.map((connection, index) => {
            const startPlanet = planetIndex.get(connection.startPlanetId);
            const endPlanet = planetIndex.get(connection.endPlanetId);
            return `<div class="route-connection-row">
              <span>${startPlanet?.name || connection.startPlanetId} ↔ ${endPlanet?.name || connection.endPlanetId}</span>
              ${canEditConnections ? `<button class="mini-btn danger" onclick="removeRouteConnection('${route.id}', ${index})">Lösen</button>` : ''}
            </div>`;
          }).join('') : '<div class="muted-box">Keine Planetenverbindungen hinterlegt.</div>'}
        </div>
        ${canEditConnections ? `
          <div class="route-connection-add">
            <input id="routeConnectionStart" list="routePlanetChoices" placeholder="Planet A">
            <input id="routeConnectionEnd" list="routePlanetChoices" placeholder="Planet B">
            <button class="mini-btn primary" onclick="addRouteConnection('${route.id}')">Verbinden</button>
          </div>
          ${isUnnamedRoute(route) ? `<div class="toolbar-row" style="margin-top:8px">
            <button class="mini-btn" onclick="resetRouteConnections('${route.id}')">Automatisch zurücksetzen</button>
          </div>` : ''}
        ` : ''}
      </div>
    ` : ''}
    ${canEditPlanet() ? `
      <div class="form-row">
        <label>Neue Route erstellen</label>
        <div class="route-connection-add">
          <input id="newRouteStart" list="routePlanetChoices" placeholder="Planet A">
          <input id="newRouteEnd" list="routePlanetChoices" placeholder="Planet B">
          <button class="mini-btn primary" onclick="createNewRouteFromPanel()">Neue Route</button>
        </div>
        <p class="muted">Erstellt aus den beiden Planeten eine eigenständige Hyperraumroute.</p>
      </div>
    ` : ''}
    <datalist id="routePlanetChoices">
      ${state.planets.slice().sort((a, b) => a.name.localeCompare(b.name, 'de')).map((planet) => `<option value="${planet.name}"></option>`).join('')}
    </datalist>
    <button class="primary" onclick="saveRoute('${route.id}')" ${disabled}>Route speichern</button>
  `;
}

function saveRoute(id) {
  const route = tacticalRouteCache.find((entry) => entry.id === id) || routeCache.find((entry) => entry.id === id);
  if (!route || !canEditPlanet()) return;
  const store = ensureRouteMetaStore();
  store[id] = {
    ...(store[id] || {}),
    name: document.getElementById('routeName').value.trim() || getRouteDisplayName(route)
  };
  const customRoute = ensureCustomRouteStore().find((entry) => entry.id === id);
  if (customRoute) customRoute.name = store[id].name;
  saveLocal();
  playAudioCue(datapadAcceptAudio);
  render({ frontline: true, influence: true, layers: true });
  openRoute(id);
  setStatus('Hyperraumroute gespeichert: ' + store[id].name);
}

function resolveRoutePlanetInput(inputId) {
  const value = document.getElementById(inputId)?.value?.trim() || '';
  return value ? resolvePlanetBySearchValue(value) : null;
}

function refreshManualRouteNetwork() {
  tacticalSectionCanvasCache.clear();
  rebuildTacticalRouteCache(prepareArcgisData(), viewMode === 'schematic' ? 'schematic' : 'image');
  render({ frontline: true, influence: true, layers: true });
}

function addRouteConnection(id) {
  const route = tacticalRouteCache.find((entry) => entry.id === id);
  if (!route || !canEditPlanet() || !canManuallyEditRoute(route)) return;
  const startPlanet = resolveRoutePlanetInput('routeConnectionStart');
  const endPlanet = resolveRoutePlanetInput('routeConnectionEnd');
  if (!startPlanet || !endPlanet) {
    setStatus('Bitte zwei gültige Planetennamen auswählen.');
    return;
  }
  if (startPlanet.id === endPlanet.id) {
    setStatus('Eine Route benötigt zwei unterschiedliche Planeten.');
    return;
  }
  const connections = getRouteConnections(route);
  const key = [startPlanet.id, endPlanet.id].sort().join('__');
  if (connections.some((connection) => [connection.startPlanetId, connection.endPlanetId].sort().join('__') === key)) {
    setStatus('Diese Planeten sind auf der Route bereits verbunden.');
    return;
  }
  const store = ensureRouteMetaStore();
  store[id] = {
    ...(store[id] || {}),
    connections: [
      ...connections.map(serializeRouteConnection),
      { startPlanetId: startPlanet.id, endPlanetId: endPlanet.id }
    ]
  };
  saveLocal();
  refreshManualRouteNetwork();
  openRoute(id);
  setStatus(`Routenverbindung hinzugefügt: ${startPlanet.name} ↔ ${endPlanet.name}`);
}

function removeRouteConnection(id, index) {
  const route = tacticalRouteCache.find((entry) => entry.id === id);
  if (!route || !canEditPlanet() || !canManuallyEditRoute(route)) return;
  const connections = getRouteConnections(route);
  if (index < 0 || index >= connections.length) return;
  const removed = connections[index];
  const automaticMatch = (route.autoConnections || []).find((connection) => {
    const candidateKey = [connection.startPlanetId, connection.endPlanetId].sort().join('__');
    const removedKey = [removed.startPlanetId, removed.endPlanetId].sort().join('__');
    return candidateKey === removedKey;
  });
  const detachedRoute = createCustomRoute({
    ...serializeRouteConnection(removed),
    ...(!removed.path && automaticMatch?.path ? { path: automaticMatch.path } : {})
  });
  if (!detachedRoute) return;
  const remainingConnections = connections
    .filter((_, connectionIndex) => connectionIndex !== index)
    .map(serializeRouteConnection);
  const store = ensureRouteMetaStore();
  if (isCustomRoute(route)) {
    const customRoutes = ensureCustomRouteStore();
    const sourceRoute = customRoutes.find((entry) => entry.id === id);
    if (sourceRoute) sourceRoute.connections = remainingConnections;
    if (!remainingConnections.length) {
      state.meta.customRoutes = customRoutes.filter((entry) => entry.id !== id);
      delete store[id];
    } else {
      store[id] = { ...(store[id] || {}), connections: remainingConnections };
    }
  } else {
    store[id] = { ...(store[id] || {}), connections: remainingConnections };
  }
  saveLocal();
  refreshManualRouteNetwork();
  openRoute(detachedRoute.id);
  const startPlanet = planetIndex.get(removed.startPlanetId);
  const endPlanet = planetIndex.get(removed.endPlanetId);
  setStatus(`Verbindung aus der bisherigen Route gelöst und als neue Route erstellt: ${startPlanet?.name || removed.startPlanetId} ↔ ${endPlanet?.name || removed.endPlanetId}`);
}

function createNewRouteFromPanel() {
  if (!canEditPlanet()) return;
  const startPlanet = resolveRoutePlanetInput('newRouteStart');
  const endPlanet = resolveRoutePlanetInput('newRouteEnd');
  if (!startPlanet || !endPlanet) {
    setStatus('Bitte zwei gültige Planetennamen für die neue Route auswählen.');
    return;
  }
  if (startPlanet.id === endPlanet.id) {
    setStatus('Eine Route benötigt zwei unterschiedliche Planeten.');
    return;
  }
  const customRoute = createCustomRoute({
    startPlanetId: startPlanet.id,
    endPlanetId: endPlanet.id
  });
  if (!customRoute) return;
  saveLocal();
  refreshManualRouteNetwork();
  openRoute(customRoute.id);
  setStatus(`Neue Route erstellt: ${startPlanet.name} ↔ ${endPlanet.name}`);
}

function resetRouteConnections(id) {
  const route = tacticalRouteCache.find((entry) => entry.id === id);
  if (!route || !canEditPlanet() || !isUnnamedRoute(route)) return;
  const store = ensureRouteMetaStore();
  if (store[id]) {
    delete store[id].connections;
    if (!Object.keys(store[id]).length) delete store[id];
  }
  saveLocal();
  refreshManualRouteNetwork();
  openRoute(id);
  setStatus('Routenverbindungen auf Kartenerkennung zurückgesetzt.');
}

function closeContextMenu() {
  contextMenu.style.display = 'none';
  contextMenu.innerHTML = '';
  contextMenuState = null;
}

function openContextMenu(x, y, actions = []) {
  if (!actions.length) {
    closeContextMenu();
    return;
  }
  contextMenuState = { x, y };
  contextMenu.innerHTML = actions.map((action, index) => action.type === 'divider'
    ? '<div class="menu-divider"></div>'
    : `<button type="button" data-action-index="${index}">${action.label}</button>`).join('');
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.style.display = 'block';
  contextMenu.querySelectorAll('button[data-action-index]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = actions[Number(button.dataset.actionIndex)];
      closeContextMenu();
      action?.run?.();
    });
  });
}

function beginPlanetMove(id) {
  const planet = planetIndex.get(id);
  if (!planet || !canEditPlanetRecord(planet)) return;
  closeContextMenu();
  activeInteraction = { mode: 'planet-drag', id };
  viewport.classList.add('dragging');
  setStatus(`Planet verschieben aktiv: ${planet.name}`);
}

function createCustomPlanetAt(x, y) {
  if (!canEditPlanet()) return;
  const planet = createCustomPlanetRecord({ x, y });
  state.planets.push(planet);
  rebuildIndexes();
  saveLocal();
  render({ positions: true, frontline: true, influence: true, layers: true });
  openPlanet(planet.id);
  setStatus(`Inoffizieller Planet erstellt bei ${Math.round(x)}, ${Math.round(y)}.`);
}

function deletePlanet(id) {
  const planet = planetIndex.get(id);
  if (!planet || !planet.isUnofficial || !canEditPlanetRecord(planet)) return;
  state.planets = state.planets.filter((entry) => entry.id !== id);
  if (state.planetResources) delete state.planetResources[id];
  state.fleets.forEach((fleet) => {
    if (fleet.locationPlanetId === id || fleet.planetId === id) {
      fleet.locationPlanetId = '';
      fleet.planetId = '';
    }
  });
  state.ships.forEach((ship) => {
    if (ship.locationPlanetId === id) ship.locationPlanetId = '';
  });
  closeInfoPanel();
  rebuildIndexes();
  saveLocal();
  render({ positions: true, frontline: true, influence: true, layers: true });
  setStatus(`Inoffizieller Planet gelöscht: ${planet.name}`);
}

function createMapMarkerAt(x, y) {
  if (!canEditPlanet()) return;
  const marker = createMapMarkerRecord({ x, y });
  ensureMapMarkerStore().push(marker);
  rebuildIndexes();
  saveLocal();
  render({ positions: true, layers: true });
  openMarker(marker.id);
  setStatus(`Marker erstellt bei ${Math.round(x)}, ${Math.round(y)}.`);
}

function openMarker(id) {
  const marker = ensureMapMarkerStore().find((entry) => entry.id === id);
  if (!marker) return;
  selected = { type: 'marker', id };
  refreshFleetSelectionState();
  refreshRouteSelectionState();
  ensureMarkerElements();
  markerElements.forEach((entry, markerId) => {
    const candidate = ensureMapMarkerStore().find((item) => item.id === markerId);
    if (candidate) updateMarkerElement(candidate);
  });
  const canEditMarker = canEditPlanet();
  const disabled = canEditMarker ? '' : 'disabled';
  infoPanel.style.display = 'block';
  infoPanel.innerHTML = `
    ${getInfoPanelHeader(marker.name)}
    <p><span class="badge">Marker</span><span class="badge">${Math.round(marker.x)}, ${Math.round(marker.y)}</span></p>
    <div class="form-row"><label>RP / Notiz</label><textarea id="markerDesc" ${disabled}>${marker.description || ''}</textarea></div>
    ${canEditMarker ? `<div class="form-row"><label>Farbe</label><select id="markerColor" ${disabled}>${MARKER_COLORS.map((color) => `<option value="${color}" ${marker.color === color ? 'selected' : ''}>${color}</option>`).join('')}</select></div>` : ''}
    ${canEditMarker ? `<div class="toolbar-row">
      <button class="primary" onclick="saveMarker('${marker.id}')" ${disabled}>Marker speichern</button>
      <button class="secondary" onclick="beginMarkerMove('${marker.id}')" ${disabled}>Marker verschieben</button>
      <button class="secondary danger" onclick="deleteMarker('${marker.id}')" ${disabled}>Marker löschen</button>
    </div>` : '<p class="muted">Nur Eventleitung und Admin können Marker bearbeiten.</p>'}
  `;
}

function saveMarker(id) {
  const marker = ensureMapMarkerStore().find((entry) => entry.id === id);
  if (!marker || !canEditPlanet()) return;
  marker.color = document.getElementById('markerColor')?.value || marker.color;
  marker.description = document.getElementById('markerDesc')?.value.trim() || '';
  saveLocal();
  render({ positions: true, layers: true });
  openMarker(id);
  setStatus(`Marker gespeichert: ${marker.name}`);
}

function beginMarkerMove(id) {
  const marker = ensureMapMarkerStore().find((entry) => entry.id === id);
  if (!marker || !canEditPlanet()) return;
  closeContextMenu();
  activeInteraction = { mode: 'marker-drag', id };
  viewport.classList.add('dragging');
  setStatus(`Marker verschieben aktiv: ${marker.name}`);
}

function deleteMarker(id) {
  if (!canEditPlanet()) return;
  const marker = ensureMapMarkerStore().find((entry) => entry.id === id);
  state.meta.mapMarkers = ensureMapMarkerStore().filter((entry) => entry.id !== id);
  closeInfoPanel();
  rebuildIndexes();
  saveLocal();
  render({ positions: true, layers: true });
  setStatus(marker ? `Marker gelöscht: ${marker.name}` : 'Marker gelöscht.');
}

function getManualSectorById(id) {
  return ensureSectorStore().find((sector) => sector.id === id) || null;
}

function getManualSectorByName(name) {
  const normalizedName = String(name || '').trim();
  if (!normalizedName) return null;
  return ensureSectorStore().find((sector) => sector.name === normalizedName) || null;
}

function getManualSectorByIdentifier(identifier) {
  return getManualSectorById(identifier) || getManualSectorByName(identifier);
}

function polygonArea(points = []) {
  if (!Array.isArray(points) || points.length < 3) return Number.POSITIVE_INFINITY;
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    area += (Number(points[j].x || 0) * Number(points[i].y || 0)) - (Number(points[i].x || 0) * Number(points[j].y || 0));
  }
  return Math.abs(area / 2);
}

function resolveManualSectorForPlanetPosition(planet) {
  if (!planet) return null;
  const position = getImagePlanetPosition(planet);
  const matches = ensureSectorStore()
    .filter((sector) => Array.isArray(sector.points) && sector.points.length >= 3 && pointInPolygon(position, sector.points))
    .map((sector) => {
      const centroid = averagePoints(sector.points);
      const distance = Math.hypot(Number(position.x || 0) - Number(centroid.x || 0), Number(position.y || 0) - Number(centroid.y || 0));
      return { sector, area: polygonArea(sector.points), distance };
    })
    .sort((left, right) => left.area - right.area || left.distance - right.distance);
  return matches[0]?.sector || null;
}

function syncManualSectorMembershipFromPositions() {
  if (!Array.isArray(state?.planets)) return false;
  let changed = false;
  state.planets.forEach((planet) => {
    const sector = resolveManualSectorForPlanetPosition(planet);
    if (!sector?.name || planet.sector === sector.name) return;
    planet.sector = sector.name;
    changed = true;
  });
  if (changed) rebuildIndexes();
  return changed;
}

function getManualSectorControlSummary(sector) {
  const summary = { total: 0, GAR: 0, KUS: 0, HUTT: 0, NEUTRAL: 0 };
  if (!sector?.points?.length) return summary;
  state.planets.forEach((planet) => {
    if (!pointInPolygon(getImagePlanetPosition(planet), sector.points)) return;
    summary.total += 1;
    const owner = ownerClass(planet.owner);
    summary[owner] = (summary[owner] || 0) + 1;
  });
  return summary;
}

function getSectorInfluenceEntries(summary) {
  return ['GAR', 'KUS', 'HUTT', 'NEUTRAL']
    .map((owner) => ({ owner, count: Number(summary?.[owner] || 0) }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);
}

function getSectorInfluenceState(summary) {
  const entries = getSectorInfluenceEntries(summary);
  const top = entries[0] || null;
  const second = entries[1] || null;
  const total = Math.max(1, Number(summary?.total || 0));
  const dominantShare = top ? (top.count / total) : 0;
  const secondShare = second ? (second.count / total) : 0;
  const secured = Boolean(top) && dominantShare > SECTOR_DOMINANCE_THRESHOLD;
  const contested = false;
  return {
    entries,
    dominantOwner: secured ? (top?.owner || '') : 'NEUTRAL',
    dominantShare,
    secondOwner: second?.owner || '',
    secondShare,
    secured,
    contested,
    status: secured ? 'SECURED' : 'NEUTRAL'
  };
}

function getSectorInfluenceHistoryEntry(sectorId) {
  return ensureSectorInfluenceStore()[sectorId] || null;
}

function syncSectorInfluenceHistory(timestamp = Date.now(), recordChanges = true) {
  const store = ensureSectorInfluenceStore();
  let changed = false;
  ensureSectorStore().forEach((sector) => {
    const summary = getManualSectorControlSummary(sector);
    const influenceState = getSectorInfluenceState(summary);
    const nextController = influenceState.dominantOwner || 'NEUTRAL';
    const previous = store[sector.id];
    if (!previous) {
      store[sector.id] = {
        controller: nextController,
        status: influenceState.status,
        dominantShare: influenceState.dominantShare,
        updatedAt: timestamp,
        lastChange: null
      };
      changed = true;
      return;
    }
    if (recordChanges && previous.controller && previous.controller !== nextController) {
      previous.lastChange = {
        from: previous.controller,
        to: nextController,
        at: timestamp
      };
      changed = true;
    }
    if (previous.status !== influenceState.status || previous.controller !== nextController || Math.abs((previous.dominantShare || 0) - influenceState.dominantShare) > 0.0001) {
      previous.status = influenceState.status;
      previous.controller = nextController;
      previous.dominantShare = influenceState.dominantShare;
      previous.updatedAt = timestamp;
      changed = true;
    }
  });
  return changed;
}

function getSectorInfluencePalette(owner) {
  if (owner === 'GAR') return { fill: 'rgba(31,124,255,.24)', edge: 'rgba(124,190,255,.88)' };
  if (owner === 'KUS') return { fill: 'rgba(208,54,50,.24)', edge: 'rgba(255,142,142,.88)' };
  if (owner === 'HUTT') return { fill: 'rgba(31,107,72,.24)', edge: 'rgba(120,214,163,.84)' };
  return { fill: 'rgba(142,152,170,.22)', edge: 'rgba(214,222,236,.8)' };
}

function getPlanetInfluenceWeight(planet) {
  let weight = 1;
  if (planet?.isCoreWorld) weight += 0.35;
  if (planet?.activeBattle) weight += 0.15;
  return weight;
}

function buildSectorInfluenceFill(ctx, sector, summary) {
  const entries = getSectorInfluenceEntries(summary);
  if (!entries.length) return null;
  const points = Array.isArray(sector?.points) ? sector.points : [];
  if (!points.length) return null;
  if (entries.length === 1) return getSectorInfluencePalette(entries[0].owner).fill;
  const bounds = points.reduce((acc, point) => ({
    minX: Math.min(acc.minX, point.x),
    minY: Math.min(acc.minY, point.y),
    maxX: Math.max(acc.maxX, point.x),
    maxY: Math.max(acc.maxY, point.y)
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const gradient = ctx.createLinearGradient(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
  let cursor = 0;
  entries.forEach((entry, index) => {
    const share = entry.count / Math.max(1, summary.total);
    const nextCursor = index === entries.length - 1 ? 1 : Math.min(1, cursor + share);
    const fill = getSectorInfluencePalette(entry.owner).fill;
    gradient.addColorStop(cursor, fill);
    gradient.addColorStop(nextCursor, fill);
    cursor = nextCursor;
  });
  return gradient;
}

function getSectorInfluenceEdge(summary) {
  const influenceState = getSectorInfluenceState(summary);
  const entries = influenceState.entries;
  if (!entries.length) return null;
  if (influenceState.contested) return 'rgba(182,112,255,.9)';
  return getSectorInfluencePalette(entries[0].owner).edge;
}

function traceSectorPolygonPath(ctx, points = []) {
  if (!points.length) return false;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index].x, points[index].y);
  }
  ctx.closePath();
  return true;
}

function renderSectorPressureField(ctx, sector, sectorPlanets = [], influenceState) {
  if (!sectorPlanets.length || !traceSectorPolygonPath(ctx, sector.points)) return;
  const bounds = sector.points.reduce((acc, point) => ({
    minX: Math.min(acc.minX, point.x),
    minY: Math.min(acc.minY, point.y),
    maxX: Math.max(acc.maxX, point.x),
    maxY: Math.max(acc.maxY, point.y)
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 180);
  ctx.save();
  ctx.clip();
  sectorPlanets.forEach((planet) => {
    const palette = getSectorInfluencePalette(ownerClass(planet.owner));
    const weight = getPlanetInfluenceWeight(planet);
    const radius = Math.max(110, Math.min(220, span * 0.34 * weight));
    const gradient = ctx.createRadialGradient(planet.x, planet.y, radius * 0.06, planet.x, planet.y, radius);
    gradient.addColorStop(0, palette.fill.replace('.24', influenceState.contested ? '.24' : '.34'));
    gradient.addColorStop(0.42, palette.fill.replace('.24', influenceState.contested ? '.12' : '.18'));
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.fillStyle = gradient;
    ctx.arc(planet.x, planet.y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function renderSectorContestedOverlay(ctx, sector) {
  if (!traceSectorPolygonPath(ctx, sector.points)) return;
  const bounds = sector.points.reduce((acc, point) => ({
    minX: Math.min(acc.minX, point.x),
    minY: Math.min(acc.minY, point.y),
    maxX: Math.max(acc.maxX, point.x),
    maxY: Math.max(acc.maxY, point.y)
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(191,132,255,.45)';
  ctx.lineWidth = 3;
  for (let x = bounds.minX - (bounds.maxY - bounds.minY); x <= bounds.maxX + (bounds.maxY - bounds.minY); x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, bounds.minY - 12);
    ctx.lineTo(x + (bounds.maxY - bounds.minY) + 24, bounds.maxY + 12);
    ctx.stroke();
  }
  ctx.restore();
}

function formatElapsedSince(timestamp) {
  if (!timestamp) return 'unbekannt';
  const diff = Math.max(0, Date.now() - Number(timestamp));
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return `vor ${days} Tag${days === 1 ? '' : 'en'}`;
}

function formatSectorControlPercent(summary, owner) {
  if (!summary.total) return '0.0%';
  return `${(((summary[owner] || 0) / summary.total) * 100).toFixed(1)}%`;
}

function openSector(id) {
  const sector = getManualSectorByIdentifier(id);
  if (!sector || !isAdminRole()) {
    if (selected?.type === 'sector') closeInfoPanel();
    return;
  }
  if (syncManualSectorMembershipFromPositions()) saveLocal();
  const control = getManualSectorControlSummary(sector);
  selected = { type: 'sector', id: sector.id };
  refreshFleetSelectionState();
  refreshRouteSelectionState();
  infoPanel.style.display = 'block';
  infoPanel.innerHTML = `
    ${getInfoPanelHeader(sector.name)}
    <p><span class="badge">Manueller Sektor</span><span class="badge">${control.total} Planet${control.total === 1 ? '' : 'en'}</span></p>
    <div class="form-row"><label>Sektorname</label><input id="sectorName" value="${escapeHtml(sector.name)}"></div>
    <div class="form-row"><label>Notiz</label><textarea id="sectorDescription">${escapeHtml(sector.description || '')}</textarea></div>
    <div class="form-row">
      <label>Kontrolle im Sektor</label>
      <div class="workspace-card compact">
        <div><span class="badge GAR">GAR</span> ${formatSectorControlPercent(control, 'GAR')} (${control.GAR})</div>
        <div><span class="badge KUS">KUS</span> ${formatSectorControlPercent(control, 'KUS')} (${control.KUS})</div>
        <div><span class="badge HUTT">HUTT</span> ${formatSectorControlPercent(control, 'HUTT')} (${control.HUTT})</div>
        <div><span class="badge NEUTRAL">Neutral</span> ${formatSectorControlPercent(control, 'NEUTRAL')} (${control.NEUTRAL})</div>
      </div>
    </div>
    <p class="muted">Diese Sektor-Infocard ist nur fuer Global Admins verfuegbar.</p>
    <div class="toolbar-row">
      <button class="primary" onclick="saveSector('${sector.id}')">Sektor speichern</button>
      <button class="secondary danger" onclick="deleteManualSector('${sector.id}')">Sektor loeschen</button>
    </div>
  `;
}

function saveSector(id) {
  const sector = getManualSectorById(id);
  if (!sector || !isAdminRole()) return;
  sector.name = document.getElementById('sectorName')?.value.trim() || sector.name;
  sector.description = document.getElementById('sectorDescription')?.value.trim() || '';
  syncManualSectorMembershipFromPositions();
  tacticalHoverAreas = buildTacticalHoverAreas(null, viewMode === 'schematic' ? 'schematic' : 'image', viewMode);
  saveLocal();
  refreshSectorOverlayNow();
  render({ positions: true, layers: true, routeOverlay: true });
  openSector(sector.id);
  setStatus(`Sektor gespeichert: ${sector.name}`);
}

function openPlanet(id) {
  const p = planetIndex.get(id);
  if (!p) return;
  if (syncManualSectorMembershipFromPositions()) saveLocal();
  selected = { type: 'planet', id };
  refreshFleetSelectionState();
  refreshRouteSelectionState();
  ensureMarkerElements();
  const cachedInfo = planetInfoCardCache.get(p.id) || {};
  const cardInfo = buildPlanetCardInfo(p, cachedInfo);
  const demographicProfile = cardInfo.demographicProfile || buildPlanetDemographicProfile(p);
  const canEditPlanetCore = canEditPlanetRecord(p);
  const canEditDescription = canEditPlanetDescription(p);
  const resourceSlots = getPlanetResourceSlots(p.id);
  const routeNames = getPlanetRouteNames(p.id);
  const hyperlaneStatus = getPlanetHyperlaneStatus(p.id);
  const hyperlaneBadge = hyperlaneStatus.isLogisticsHub
    ? 'Hyperraum-Hub'
    : (hyperlaneStatus.isRoutePlanet ? 'Routen-Planet' : 'Isolierter Planet');
  const militaryInfrastructureOptions = Object.entries(MINE_PROJECT_DEFS)
    .filter(([, entry]) => entry.category === 'military')
    .map(([key, entry]) => `<option value="${key}">${entry.label}</option>`)
    .join('');
  const civilianInfrastructureOptions = Object.entries(MINE_PROJECT_DEFS)
    .filter(([, entry]) => entry.category === 'civilian')
    .map(([key, entry]) => `<option value="${key}">${entry.label}</option>`)
    .join('');
  const developmentInfrastructureOptions = Object.entries(MINE_PROJECT_DEFS)
    .filter(([, entry]) => entry.category === 'development')
    .map(([key, entry]) => `<option value="${key}">${entry.label}</option>`)
    .join('');
  const resourceOptions = `<option value="">Leer</option><optgroup label="Militärische Infrastruktur">${militaryInfrastructureOptions}</optgroup><optgroup label="Zivile Infrastruktur">${civilianInfrastructureOptions}</optgroup><optgroup label="Wirtschafts- und Entwicklungszentren">${developmentInfrastructureOptions}</optgroup>`;
  const slotUsage = getPlanetSlotUsage(p.id);
  const slotBreakdown = getPlanetInfrastructureBreakdown(resourceSlots);
  const resourceSlotControls = resourceSlots.map((slot, index) => {
    const slotEditable = canEditPlanetResourceSlot(p, index);
    if (isWarehouseBuildingKey(slot)) {
      return `
        <div class="resource-slot-cell">
          <input value="Reservierter Logistik-Slot" disabled>
          <small>Nicht direkt in der Planetenverwaltung bearbeitbar</small>
        </div>
      `;
    }
    return `
      <div class="resource-slot-cell">
        <select id="planetResource${index}" ${slotEditable ? '' : 'disabled'}>${resourceOptions.replace(`value="${slot || ''}"`, `value="${slot || ''}" selected`)}</select>
        <small>${currentRole() === 'Senat' ? 'Senat' : (index < 3 ? 'Event' : 'Admin')}</small>
      </div>
    `;
  }).join('');
  const stationShips = state.ships
    .filter((ship) => isStationClass(ship.classId) && ship.locationPlanetId === p.id && ship.status !== 'lost')
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const ownerOptions = ['GAR', 'KUS', 'HUTT', 'NEUTRAL']
    .filter((owner) => isAdminRole() || currentRole() !== 'Eventleiter / KUS' || owner !== 'GAR' || p.owner === 'GAR')
    .map((owner) => `<option ${p.owner === owner ? 'selected' : ''}>${owner}</option>`)
    .join('');
  const controlPercent = getPlanetOwnerControlPercent(p);
  const controlLabel = getPlanetOwnerControlLabel(p);
  const ownerDotClass = ownerClass(p.owner);
  const adminEditor = (canEditPlanetCore || canEditDescription || isResourceAssignmentEditable(p)) ? `
    <div class="planet-card-section planet-card-editor">
      <h3>Verwaltung</h3>
      <div class="form-row"><label>Name</label><input id="planetName" value="${escapeHtml(p.name)}" ${canEditPlanetCore ? '' : 'disabled'}></div>
      <div class="form-row"><label>Fraktion</label><select id="planetOwner" ${canEditPlanetCore ? '' : 'disabled'}>${ownerOptions}</select></div>
      <div class="form-row planet-card-admin-toggle"><label><input id="planetBattle" type="checkbox" ${p.activeBattle ? 'checked' : ''} ${canEditPlanetCore ? '' : 'disabled'}> Aktives Gefecht</label></div>
      <div class="form-row planet-card-admin-toggle"><label><input id="planetCoreWorld" type="checkbox" ${p.isCoreWorld ? 'checked' : ''} ${canEditPlanetCore ? '' : 'disabled'}> Hauptplanet</label></div>
      <div class="form-row"><label>Wiki-Link</label><input id="planetWiki" value="${escapeHtml(p.wiki || '')}" ${canEditPlanetCore ? '' : 'disabled'}></div>
      <div class="form-row"><label>Infocard / RP-Notiz</label><textarea id="planetDesc" ${canEditDescription ? '' : 'disabled'}>${escapeHtml(p.description || '')}</textarea></div>
      <div class="form-row">
        <label>Infrastruktur-Slots</label>
        <div>${renderResourcePills(resourceSlots)}</div>
        <small>${slotUsage.used}/10 Slots belegt</small>
        <div class="planet-card-chip-group" style="margin-top:8px">
          <span class="planet-card-chip">Militärisch: ${slotBreakdown.military}</span>
          <span class="planet-card-chip">Zivil: ${slotBreakdown.civilian}</span>
          <span class="planet-card-chip">Zentren: ${slotBreakdown.development}</span>
          <span class="planet-card-chip">Frei: ${slotBreakdown.empty}</span>
        </div>
        <div class="resource-slot-row">
          ${resourceSlotControls}
        </div>
        <small>${currentRole() === 'Admin'
          ? 'Admin kann alle 10 Infrastruktur-Slots pflegen.'
          : (currentRole() === 'Senat'
            ? (isResourceAssignmentEditable(p) ? 'Senat kann alle 10 Infrastruktur-Slots auf republikanischen Planeten verwalten.' : 'Senat kann nur republikanische Planeten verwalten.')
            : (isResourceAssignmentEditable(p) ? 'Eventleitung darf nur die ersten 3 Infrastruktur-Slots auf KUS- und Neutral-Planeten ändern.' : 'Infrastruktur-Slots sind für deine Rolle auf diesem Planeten nicht editierbar.'))}</small>
      </div>
      <div class="form-row">
        <label>Orbitale Raumstationen</label>
        <div class="workspace-card compact">
          ${stationShips.length
            ? stationShips.map((ship) => `<div><strong>${ship.name}</strong><br><small>${getShipClassMeta(ship.classId)?.displayName || ship.classId}${ship.commander ? ` • Leitung ${ship.commander}` : ''}</small></div>`).join('<hr style="border-color:rgba(255,255,255,.08)">')
            : '<span class="muted">Keine planetgebundenen Raumstationen zugewiesen.</span>'}
        </div>
      </div>
      <div class="toolbar-row">
        <button class="primary" onclick="savePlanet('${p.id}')" ${(canEditPlanetCore || canEditDescription || isResourceAssignmentEditable(p)) ? '' : 'disabled'}>Planet speichern</button>
        <button class="secondary" onclick="beginPlanetMove('${p.id}')" ${canEditPlanetCore ? '' : 'disabled'}>Planet verschieben</button>
        ${p.isUnofficial ? `<button class="secondary danger" onclick="deletePlanet('${p.id}')" ${canEditPlanetCore ? '' : 'disabled'}>Planet löschen</button>` : ''}
      </div>
    </div>
  ` : '';
  infoPanel.style.display = 'block';
  infoPanel.innerHTML = `
    ${getInfoPanelHeader(p.name)}
    <div class="planet-card">
      <div class="planet-card-top">
        <p class="planet-card-kicker">${sanitizePlanetInfoText(p.sector || 'Unbekannter Sektor')}</p>
        <p class="planet-card-control"><span class="planet-card-control-dot ${ownerDotClass}"></span>${getOwnerLabel(p.owner)}-Kontrolle</p>
      </div>
      ${cardInfo.image ? `
      <div class="planet-card-hero">
        <div class="planet-card-image"><img src="${cardInfo.image}" alt="${escapeHtml(p.name)}"></div>
        <div class="planet-card-war">
          <p class="planet-card-war-label">Kontrollstatus</p>
          <div class="planet-card-war-bar">
            <div class="planet-card-war-fill ${ownerDotClass}" style="width:${controlPercent}%"></div>
          </div>
          <p class="planet-card-war-caption">${controlLabel}</p>
        </div>
      </div>
      ` : `
      <div class="planet-card-war">
        <p class="planet-card-war-label">Kontrollstatus</p>
        <div class="planet-card-war-bar">
          <div class="planet-card-war-fill ${ownerDotClass}" style="width:${controlPercent}%"></div>
        </div>
        <p class="planet-card-war-caption">${controlLabel}</p>
      </div>
      `}
      <div class="planet-card-stats">
        <div class="planet-card-stat"><p class="planet-card-stat-label">Region</p><p class="planet-card-stat-value small">${escapeHtml(getRegionLabel(p.region))}</p></div>
        <div class="planet-card-stat"><p class="planet-card-stat-label">Sektor</p><p class="planet-card-stat-value small">${escapeHtml(sanitizePlanetInfoText(p.sector))}</p></div>
        <div class="planet-card-stat"><p class="planet-card-stat-label">Raster</p><p class="planet-card-stat-value small">${escapeHtml(sanitizePlanetInfoText(p.grid, '—'))}</p></div>
        <div class="planet-card-stat"><p class="planet-card-stat-label">Aktive Bevölkerung</p><p class="planet-card-stat-value small">${escapeHtml(cardInfo.population)}</p></div>
        <div class="planet-card-stat"><p class="planet-card-stat-label">Hyperraumrouten</p><p class="planet-card-stat-value small">${escapeHtml(String(hyperlaneStatus.degree || routeNames.length || 0))}</p></div>
        <div class="planet-card-stat"><p class="planet-card-stat-label">Hyperraumstatus</p><p class="planet-card-stat-value small">${escapeHtml(cardInfo.strategic)}</p></div>
        <div class="planet-card-stat"><p class="planet-card-stat-label">Infrastruktur-Slots</p><p class="planet-card-stat-value small">${escapeHtml(`${slotUsage.used}/${slotUsage.total}`)}</p></div>
      </div>
      <div class="planet-card-section">
        <h3>Demografie & Verbrauch</h3>
        <p>${escapeHtml(demographicProfile.summary)}</p>
        <div class="planet-card-stats" style="margin-top:10px">
          <div class="planet-card-stat"><p class="planet-card-stat-label">Industrie</p><p class="planet-card-stat-value small">${escapeHtml(formatPopulationEstimate(demographicProfile.industrialWorkers))}</p></div>
          <div class="planet-card-stat"><p class="planet-card-stat-label">Dienste</p><p class="planet-card-stat-value small">${escapeHtml(formatPopulationEstimate(demographicProfile.serviceWorkers))}</p></div>
          <div class="planet-card-stat"><p class="planet-card-stat-label">Logistik</p><p class="planet-card-stat-value small">${escapeHtml(formatPopulationEstimate(demographicProfile.logisticsWorkers))}</p></div>
          <div class="planet-card-stat"><p class="planet-card-stat-label">Forschung</p><p class="planet-card-stat-value small">${escapeHtml(formatPopulationEstimate(demographicProfile.researchWorkers))}</p></div>
          ${demographicProfile.constructionWorkers ? `<div class="planet-card-stat"><p class="planet-card-stat-label">Baucrews</p><p class="planet-card-stat-value small">${escapeHtml(formatPopulationEstimate(demographicProfile.constructionWorkers))}</p></div>` : ''}
        </div>
        <div class="planet-card-stats" style="margin-top:10px">
          ${demographicProfile.consumption.map((row) => `
            <div class="planet-card-stat">
              <p class="planet-card-stat-label">${escapeHtml(row.label)}</p>
              <p class="planet-card-stat-value small">${escapeHtml(String(row.demandPerDay))}/Tag</p>
              <p class="muted" style="margin-top:6px">${escapeHtml(row.level)}</p>
            </div>
          `).join('')}
        </div>
        <div class="planet-card-section planet-card-subsection" style="margin-top:12px">
          <h3>Slot-Verteilung</h3>
          <div class="planet-card-chip-group">
            <span class="planet-card-chip">Militärisch: ${slotBreakdown.military}</span>
            <span class="planet-card-chip">Zivil: ${slotBreakdown.civilian}</span>
            <span class="planet-card-chip">Zentren: ${slotBreakdown.development}</span>
            <span class="planet-card-chip">Frei: ${slotBreakdown.empty}</span>
          </div>
          <div style="margin-top:10px">${renderResourcePills(resourceSlots)}</div>
        </div>
        <p class="muted" style="margin-top:10px">Systemstatus: ${escapeHtml(cardInfo.lorePopulation || PLANET_INFO_PLACEHOLDER)}. Verbrauchswerte reagieren live auf gebaute Infrastruktur und aktive Minen.</p>
      </div>
      <div class="planet-card-section">
        <h3>Hyperraumrouten</h3>
        <div class="planet-card-chip-group">
          ${routeNames.length ? routeNames.map((name) => `<span class="planet-card-chip">${escapeHtml(name)}</span>`).join('') : '<span class="muted">Keine Informationen gefunden</span>'}
        </div>
      </div>
      <div class="planet-card-section">
        <h3>Informationsbericht</h3>
        <p>${escapeHtml(buildPlanetIntelText(p, cardInfo))}</p>
      </div>
      <div class="planet-card-section">
        <h3>Zusatzdaten</h3>
        <p>${p.wiki ? `<a href="${p.wiki}" target="_blank" rel="noreferrer">Wiki öffnen</a>` : '<span class="muted">Kein Wiki-Link gesetzt.</span>'}</p>
        <p class="muted" style="margin-top:10px">Weltkoordinaten: ${Math.round(p.x)}, ${Math.round(p.y)} • Norm: ${p.xNorm.toFixed(4)}, ${p.yNorm.toFixed(4)}${p.isCoreWorld ? ' • Hauptplanet' : ''}${p.isUnofficial ? ' • Inoffizieller Planet' : ''}${p.activeBattle ? ' • Aktives Gefecht' : ''}</p>
      </div>
      ${adminEditor}
    </div>
  `;
  loadPlanetCardInfo(p);
}

function savePlanet(id) {
  const p = planetIndex.get(id);
  if (!p || !(canEditPlanetRecord(p) || canEditPlanetDescription(p) || isResourceAssignmentEditable(p))) return;
  const previousOwner = p.owner;
  if (canEditPlanetRecord(p)) {
    p.name = document.getElementById('planetName').value.trim() || p.name;
    p.owner = document.getElementById('planetOwner').value;
    p.wiki = document.getElementById('planetWiki').value;
    p.activeBattle = Boolean(document.getElementById('planetBattle')?.checked);
    p.isCoreWorld = Boolean(document.getElementById('planetCoreWorld')?.checked);
  }
  if (canEditPlanetDescription(p)) {
    p.description = document.getElementById('planetDesc').value;
  }
  if (isResourceAssignmentEditable(p)) {
    const nextSlots = getPlanetResourceSlots(p.id);
    for (let index = 0; index < 10; index += 1) {
      if (!canEditPlanetResourceSlot(p, index)) continue;
      if (isWarehouseBuildingKey(nextSlots[index])) continue;
      nextSlots[index] = document.getElementById(`planetResource${index}`)?.value || '';
    }
    setPlanetResourceSlots(p.id, nextSlots);
    syncWarehouseStoreForPlanet(p.id);
  }
  let rewardText = '';
  if (previousOwner !== 'GAR' && p.owner === 'GAR') {
    const reward = getCaptureRewardForPlanet(p.id);
    addFactionResources('GAR', reward);
    rewardText = resourceDeltaToText(reward);
  }
  enforceStrategicOwnershipRules();
  saveLocal();
  playAudioCue(datapadAcceptAudio);
  render({ positions: true, frontline: true, influence: true, layers: true });
  openPlanet(id);
  if (previousOwner === 'KUS' && p.owner === 'GAR') {
    const display = getPlanetDisplayPosition(p);
    triggerGarVictoryCelebration(display.x, display.y);
  }
  if (activeMainTab === 'shipyard') renderShipyardView();
  if (activeMainTab === 'fleetManagement') renderFleetManagementView();
  if (activeMainTab === 'buildProjects') renderBuildProjectsView();
  setStatus(rewardText ? `Planet gespeichert: ${p.name} • Capture Reward: ${rewardText}` : 'Planet gespeichert: ' + p.name);
}

function openFleet(id) {
  const f = fleetIndex.get(id);
  if (!f) return;
  selected = { type: 'fleet', id };
  refreshFleetSelectionState();
  refreshRouteSelectionState();
  const disabled = canEditFaction(f.faction) ? '' : 'disabled';
  const planet = planetIndex.get(f.locationPlanetId || f.planetId);
  const travel = fleetTravelState.get(f.id);
  const jumpDisabled = (!canEditFaction(f.faction) || travel) ? 'disabled' : '';
  const summary = getFleetOperationalSummary(f.id);
  const isBattleGroup = summary.role === 'battle_group';
  const classSummary = summary.classSummary;
  const activeShips = summary.activeShips;
  const shipManifest = activeShips.length
    ? activeShips.map((ship) => {
        const classMeta = getShipClassMeta(ship.classId);
        const isHighlighted = pendingFleetManifestHighlightShipId === ship.id;
        return `<div data-manifest-ship-id="${ship.id}" class="${isHighlighted ? 'focus-highlight' : ''}"><strong>${ship.name}</strong><br><small>${classMeta?.displayName || ship.classId}${ship.commander ? ` • CO ${ship.commander}` : ''}</small></div>`;
      }).join('')
    : '<span class="muted">Dieser Flotte sind aktuell keine einzelnen Schiffe zugewiesen.</span>';
  const subordinateInfo = summary.role === 'battle_group'
    ? `<div class="form-row"><label>Unterstellte Einheiten</label><div class="workspace-card compact">
        <strong>${summary.divisions.length} Schlachtdivision(en)</strong> • <strong>${summary.stations.length} Raumstation(en)</strong><br>
        <small>Gesamtstaerke aus Unterverbänden: ${summary.totalShips} Schiff(e)${summary.directShips ? ` • Direkt zugewiesen: ${summary.directShips}` : ''}</small>
      </div></div>`
    : '';
  const movementNotice = isBattleGroup
    ? `<p class="muted fleet-command-warning">Dieser Kampfverband ist ein Oberverband. Im Normalfall werden einzelne Schlachtdivisionen bewegt. Eine Verlegung des gesamten Verbandes ist nur für Notfälle gedacht.</p>`
    : `<p class="muted">Diese Schlachtdivision/Raumstation ist die reguläre Bewegungseinheit für Einsätze und Verlegungen.</p>`;
  fleetJumpSearchState.fleetId = f.id;
  fleetJumpSearchState.selectedPlanetId = null;
  infoPanel.style.display = 'block';
  infoPanel.innerHTML = `
    ${getInfoPanelHeader(f.name)}
    <p><span class="badge ${f.faction}">${f.faction}</span><span class="badge">${f.status || 'Operational'}</span></p>
    <p class="muted">Position: ${planet ? planet.name : '—'}${travel ? ` • Unterwegs nach ${travel.targetPlanetName}` : ' • Verlegung nur per Hyperraumsprung'}</p>
    ${subordinateInfo}
    <div class="form-row"><label>Zugewiesene Klassen</label><div class="workspace-card compact">${classSummary}</div></div>
    <div class="form-row"><label>Schiffsmanifest</label><div class="workspace-card compact">${shipManifest}</div></div>
    <div class="form-row"><label>Flottenname</label><input id="fleetName" value="${f.name}" ${disabled}></div>
    <div class="form-row"><label>Fraktion</label><select id="fleetFaction" ${disabled}><option ${f.faction === 'GAR' ? 'selected' : ''}>GAR</option><option ${f.faction === 'KUS' ? 'selected' : ''}>KUS</option></select></div>
    <div class="form-row"><label>Leitung</label><input id="fleetLeader" value="${f.leader || ''}" ${disabled}></div>
    <div class="form-row"><label>Zuordnung</label><input id="fleetAssignment" value="${f.assignment || ''}" placeholder="z.B. 1.1.1" ${disabled}></div>
    <div class="form-row"><label>Status</label><input id="fleetStatus" value="${f.status || ''}" ${disabled}></div>
    <div class="form-row"><label>Inhalt</label><textarea id="fleetContents" ${disabled}>${f.contents || ''}</textarea></div>
    <div class="form-row">
      <label>Sprungziel</label>
      <div class="inline-search-wrap">
        <input id="fleetJumpTarget" placeholder="Planet suchen..." autocomplete="off" ${jumpDisabled}>
        <input id="fleetJumpTargetId" type="hidden">
        <div id="fleetJumpResults" class="inline-search-results hidden"></div>
      </div>
    </div>
    ${movementNotice}
    <p class="muted">Reisezeit orientiert sich an Hyperraumdistanz. Eine Strecke von Kartenmitte oben nach Kartenmitte unten dauert etwa 5 Minuten.</p>
    <button class="primary ${isBattleGroup ? 'danger' : ''}" onclick="startFleetJump('${f.id}')" ${jumpDisabled}>${isBattleGroup ? 'Notfallverlegung starten' : 'Division verlegen'}</button>
    <button class="secondary" onclick="openFleetInManagement('${f.id}')">Im Flottenmanagement</button>
    <button class="primary" onclick="saveFleet('${f.id}')" ${disabled}>Flotte speichern</button>
    <button class="secondary danger" onclick="deleteFleet('${f.id}')" ${disabled}>Flotte löschen</button>
  `;
  const jumpInput = document.getElementById('fleetJumpTarget');
  if (pendingFleetManifestHighlightShipId) {
    const manifestTarget = infoPanel.querySelector(`[data-manifest-ship-id="${pendingFleetManifestHighlightShipId}"]`);
    if (manifestTarget) {
      manifestTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => manifestTarget.classList.remove('focus-highlight'), 7000);
    }
    pendingFleetManifestHighlightShipId = '';
  }
  if (jumpInput) {
    jumpInput.addEventListener('input', () => {
      document.getElementById('fleetJumpTargetId').value = '';
      fleetJumpSearchState.selectedPlanetId = null;
      updateFleetJumpSearch(f.id, jumpInput.value);
    });
    jumpInput.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveFleetJumpSelection(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveFleetJumpSelection(-1);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const planet = fleetJumpSearchState.results[Math.max(0, fleetJumpSearchState.activeIndex)];
        if (planet) chooseFleetJumpTarget(planet.id);
        else startFleetJump(f.id);
        return;
      }
      if (event.key === 'Escape') {
        closeFleetJumpResults();
      }
    });
  }
}

function saveFleet(id) {
  const f = fleetIndex.get(id);
  if (!f || !canEditFaction(f.faction)) return;
  f.name = document.getElementById('fleetName').value;
  f.faction = document.getElementById('fleetFaction').value;
  f.leader = document.getElementById('fleetLeader').value;
  f.commander = f.leader;
  f.assignment = document.getElementById('fleetAssignment').value.trim();
  f.status = document.getElementById('fleetStatus').value;
  f.contents = document.getElementById('fleetContents').value;
  rebuildFleetRenderPositions();
  saveLocal();
  playAudioCue(datapadAcceptAudio);
  render({ positions: true, layers: true });
  openFleet(id);
  setStatus('Flotte gespeichert: ' + f.name);
}

function deleteFleet(id) {
  const f = fleetIndex.get(id);
  if (!f || !canEditFaction(f.faction)) return;
  const display = getFleetDisplayPosition(f);
  playAudioCue(fleetDeleteAudio);
  playAudioCue(datapadDeleteAudio);
  spawnFleetExplosion(display.x, display.y);
  fleetTravelState.delete(id);
  removeFleetMotionRecord(id);
  emitLiveSocketEvent('fx:fleet-delete', { fleetId: id });
  state.fleets = state.fleets.filter((item) => item.id !== id);
  removeFleetFromOrderBuckets(id);
  rebuildIndexes();
  saveLocal();
  render({ positions: true, layers: true });
  infoPanel.style.display = 'none';
  setStatus('Flotte gelöscht.');
}

function saveFleetManagementFleet(id) {
  const fleet = fleetIndex.get(id) || state.fleets.find((entry) => entry.id === id);
  if (!fleet || !canEditFaction(fleet.faction)) return;
  const nameInput = document.getElementById(`fmFleetName_${id}`);
  const commanderInput = document.getElementById(`fmFleetCommander_${id}`);
  const assignmentInput = document.getElementById(`fmFleetAssignment_${id}`);
  const locationInput = document.getElementById(`fmFleetLocation_${id}`);
  const roleInput = document.getElementById(`fmFleetRole_${id}`);
  const parentInput = document.getElementById(`fmFleetParent_${id}`);
  if (nameInput) fleet.name = nameInput.value.trim() || fleet.name;
  if (commanderInput) {
    fleet.commander = commanderInput.value.trim();
    fleet.leader = fleet.commander;
  }
  if (roleInput) fleet.commandRole = normalizeFleetCommandRole(roleInput.value);
  if (parentInput && fleet.commandRole !== 'battle_group') {
    const parent = state.fleets.find((entry) => entry.id === parentInput.value);
    const validParent = parent
      && parent.id !== fleet.id
      && parent.faction === fleet.faction
      && normalizeFleetCommandRole(parent.commandRole) === 'battle_group';
    fleet.parentFleetId = validParent ? parent.id : '';
    if (validParent) fleet.categoryId = parent.categoryId || '';
  } else {
    fleet.parentFleetId = '';
  }
  if (assignmentInput) fleet.assignment = assignmentInput.value.trim();
  if (locationInput) {
    const planet = resolvePlanetBySearchValue(locationInput.value);
    fleet.locationPlanetId = planet?.id || '';
    fleet.planetId = fleet.locationPlanetId;
  }
  normalizeFleetShipAssignments();
  syncFleetHierarchyCategoryLinks();
  rebuildFleetRenderPositions();
  rebuildIndexes();
  saveLocal();
  playAudioCue(datapadAcceptAudio);
  render({ positions: true, layers: true });
  renderFleetManagementView();
  setStatus('Verband gespeichert: ' + fleet.name);
}

function createFleetManagementFleet() {
  const role = currentRole();
  if (role === 'Viewer' || role === 'Senat' || isUnderworldRole(role)) return;
  const faction = role === 'Eventleiter / KUS'
    ? 'KUS'
    : (fleetManagementFactionFilter === 'KUS' ? 'KUS' : 'GAR');
  const fleet = createFleetRecord({ name: 'Neues Kampfgeschwader', faction, commandRole: 'battle_group' });
  state.fleets.push(fleet);
  saveLocal();
  playAudioCue(datapadAcceptAudio);
  rebuildIndexes();
  render({ positions: true, layers: true });
  renderFleetManagementView();
}

function saveManagedShip(id) {
  const ship = state.ships.find((entry) => entry.id === id);
  if (!ship || !canEditFaction(ship.faction)) return;
  const station = isStationClass(ship.classId);
  const nameInput = document.getElementById(`shipName_${id}`);
  const commanderInput = document.getElementById(`shipCommander_${id}`);
  const fleetSelect = document.getElementById(`shipFleet_${id}`);
  const stationPlanetInput = document.getElementById(`shipPlanet_${id}`);
  const statusSelect = document.getElementById(`shipStatus_${id}`);
  const previousFleetId = ship.assignedFleetId || '';
  if (nameInput) ship.name = nameInput.value.trim() || ship.name;
  if (commanderInput) ship.commander = commanderInput.value.trim();
  let nextFleet = null;
  if (fleetSelect) {
    nextFleet = state.fleets.find((entry) => entry.id === fleetSelect.value);
    const nextRole = normalizeFleetCommandRole(nextFleet?.commandRole);
    ship.assignedFleetId = station ? '' : (nextFleet && nextFleet.faction === ship.faction && nextRole !== 'battle_group' ? nextFleet.id : '');
  }
  if (station && isAdminRole() && stationPlanetInput) {
    const rawPlanetName = stationPlanetInput.value.trim();
    const targetPlanet = rawPlanetName ? resolvePlanetBySearchValue(rawPlanetName) : null;
    if (rawPlanetName && !targetPlanet) {
      setStatus('Planet für Station nicht gefunden. Bitte exakten Planetennamen verwenden.');
      return;
    }
    ship.locationPlanetId = targetPlanet?.id || '';
  }
  if (statusSelect) ship.status = statusSelect.value;
  const sourceFleet = previousFleetId ? state.fleets.find((entry) => entry.id === previousFleetId) : null;
  const nextFleetId = ship.assignedFleetId || '';
  if (!station && sourceFleet && nextFleetId && nextFleetId !== previousFleetId) {
    ship.assignedFleetId = previousFleetId;
    animateShipTransferBetweenFleets(ship, sourceFleet, nextFleet);
    return;
  }
  normalizeFleetShipAssignments();
  saveLocal();
  playAudioCue(datapadAcceptAudio);
  rebuildIndexes();
  render({ positions: true, layers: true });
  renderFleetManagementView();
  setStatus('Schiff gespeichert: ' + ship.name);
}

function removeManagedShipFromFleet(id) {
  const ship = state.ships.find((entry) => entry.id === id);
  if (!ship || !canEditFaction(ship.faction)) return;
  if (isStationClass(ship.classId)) return;
  ship.assignedFleetId = '';
  normalizeFleetShipAssignments();
  saveLocal();
  playAudioCue(datapadDeleteAudio);
  renderFleetManagementView();
}

function showManagedShipOnMap(id) {
  const ship = state.ships.find((entry) => entry.id === id);
  if (!ship?.locationPlanetId) return;
  focusPlanetOnMap(ship.locationPlanetId);
}

function autoScrollFleetManagementPanel(clientY) {
  if (activeMainTab !== 'fleetManagement') return;
  const panel = workspacePanel;
  if (!panel?.classList.contains('active')) return;
  const rect = panel.getBoundingClientRect();
  const edge = 90;
  const topDistance = clientY - rect.top;
  const bottomDistance = rect.bottom - clientY;
  if (topDistance < edge) {
    panel.scrollBy({ top: -Math.max(8, ((edge - topDistance) / edge) * 28), behavior: 'auto' });
  } else if (bottomDistance < edge) {
    panel.scrollBy({ top: Math.max(8, ((edge - bottomDistance) / edge) * 28), behavior: 'auto' });
  }
}

function startBuildOrder() {
  const classId = document.getElementById('shipyardClass')?.value;
  const locationPlanetId = document.getElementById('shipyardLocation')?.value;
  const shipName = document.getElementById('shipyardName')?.value.trim();
  const meta = getShipClassMeta(classId);
  const planet = planetIndex.get(locationPlanetId);
  const faction = getActiveShipyardFaction();
  const role = currentRole();
  if (role === 'Senat') {
    setStatus('Senat hat keinen Zugriff auf den Schiffbau.');
    return;
  }
  if (role === 'Viewer' || isUnderworldRole(role)) {
    setStatus('Diese Fraktion kann aktuell keine Schiffe bauen.');
    return;
  }
  if (role === 'Republic Navy / GAR' && faction !== 'GAR') {
    setStatus('Republic Navy kann nur GAR-Schiffe bauen.');
    return;
  }
  if (role === 'Republic Navy / GAR' && faction === 'GAR' && !canCoordinate4thFleet()) {
    setStatus('Nur Personen mit der Berechtigung „4th Flottenkoordination“ können GAR-Schiffe in Auftrag geben.');
    return;
  }
  if (role === 'Eventleiter / KUS' && faction !== 'KUS') {
    setStatus('Eventleitung kann hier nur KUS-Schiffe bauen.');
    return;
  }
  if (!meta || !planet) {
    setStatus('Bitte Schiffsklasse und Bauort wählen.');
    return;
  }
  if ((meta.faction || 'GAR') !== faction) {
    setStatus('Diese Schiffsklasse gehört nicht zur aktiven Fraktion.');
    return;
  }
  if (planet.owner !== faction) {
    setStatus(`Bauort muss ${faction}-kontrolliert sein.`);
    return;
  }
  const locationChoice = getShipyardLocationChoices(classId).find((entry) => entry.id === locationPlanetId) || null;
  if (locationChoice && !locationChoice.enabled) {
    setStatus(locationChoice.disabledReason || 'Dieser Bauort ist für die gewählte Klasse derzeit nicht verfügbar.');
    renderShipyardView();
    return;
  }
  const validLocations = new Set(getAvailableBuildLocations(classId).map((entry) => entry.id));
  if (!validLocations.has(locationPlanetId)) {
    setStatus('Dieser Bauort ist für die gewählte Klasse nicht erlaubt.');
    return;
  }
  if (faction === 'GAR' && !spendSectorShipyardCost(locationPlanetId, meta.cost, 'GAR')) {
    setStatus('Nicht genug Ressourcen für diesen Bauauftrag.');
    renderShipyardView();
    return;
  }
  if (faction === 'KUS' || (faction === 'GAR' && DEBUG_DISABLE_GAR_BUILD_LIMITS)) {
    const ship = createReadyShipFromBuild({
      classId,
      shipName: shipName || meta.displayName,
      faction,
      locationPlanetId,
      createdFrom: DEBUG_DISABLE_GAR_BUILD_LIMITS && faction === 'GAR' ? 'shipyard_debug_instant' : 'shipyard_instant'
    });
    if (!ship) {
      setStatus(`${faction}-Schiff konnte nicht erzeugt werden.`);
      return;
    }
    saveLocal();
    playAudioCue(datapadAcceptAudio);
    renderShipyardView();
    if (activeMainTab === 'fleetManagement') renderFleetManagementView();
    setStatus(`${faction}-Spawn sofort bereit: ${ship.name} in ${planet.name}`);
    return;
  }
  state.buildJobs.push(createBuildJobRecord({
    classId,
    shipName: shipName || meta.displayName,
    buildLocationPlanetId: locationPlanetId,
    startedAt: Date.now(),
    finishesAt: Date.now() + (meta.buildTimeHours * RESOURCE_PRODUCTION_TICK_MS),
    faction,
    startedBy: currentAuthenticatedUsername || currentAssignedRole()
  }));
  saveLocal();
  playAudioCue(datapadAcceptAudio);
  renderShipyardView();
  setStatus(`Bau gestartet: ${shipName || meta.displayName} in ${planet.name}`);
}

function onShipyardClassChange() {
  renderShipyardView();
}

function setShipyardFaction(faction) {
  activeShipyardFactionOverride = faction === 'KUS' ? 'KUS' : 'GAR';
  renderShipyardView();
}

function setFleetManagementFactionFilter(value) {
  fleetManagementFactionFilter = ['GAR', 'KUS', 'all'].includes(value) ? value : 'all';
  renderFleetManagementView();
}

function importTrelloFromFileInput(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result || '{}'));
      importTrelloData(payload);
    } catch (error) {
      setStatus('Trello-JSON konnte nicht gelesen werden.');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function triggerTrelloImport() {
  if (!isAdminRole()) {
    setStatus('Trello-Import ist nur für Admin verfügbar.');
    return;
  }
  let input = document.getElementById('trelloImportInput');
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.id = 'trelloImportInput';
    input.className = 'hidden';
    input.addEventListener('change', importTrelloFromFileInput);
    document.body.appendChild(input);
  }
  input.click();
}

function triggerFleetManagementSearch() {
  const query = normalizeSearchText(document.getElementById('fleetMgmtSearch')?.value || '');
  fleetManagementSearchQuery = document.getElementById('fleetMgmtSearch')?.value || '';
  const activeChoice = fleetManagementSearchResultsState[Math.max(0, fleetManagementSearchActiveIndex)];
  if (activeChoice) {
    applyFleetManagementSearchChoice(activeChoice);
    return;
  }
  if (!query) {
    setStatus('Bitte einen Verband, Schiffsnamen, CO oder eine Klasse eingeben.');
    return;
  }
  const candidates = getFleetManagementSearchCandidates().filter((choice) => choice.search.includes(query));
  const exact = candidates.find((choice) => normalizeSearchText(choice.label) === query);
  const result = exact || candidates[0];
  if (!result) {
    setStatus('Kein passender Verband oder kein passendes Schiff gefunden.');
    return;
  }
  applyFleetManagementSearchChoice(result);
}

function deleteFleetManagementFleet(id) {
  const fleet = fleetIndex.get(id) || state.fleets.find((entry) => entry.id === id);
  if (!fleet || !canEditFaction(fleet.faction)) return;
  const assignedShips = state.ships.filter((ship) => ship.assignedFleetId === fleet.id);
  assignedShips.forEach((ship) => {
    ship.assignedFleetId = '';
  });
  state.fleets.forEach((entry) => {
    if (entry.parentFleetId === fleet.id) entry.parentFleetId = '';
  });
  fleetTravelState.delete(fleet.id);
  removeFleetMotionRecord(fleet.id);
  emitLiveSocketEvent('fx:fleet-delete', { fleetId: fleet.id });
  state.fleets = state.fleets.filter((entry) => entry.id !== fleet.id);
  removeFleetFromOrderBuckets(fleet.id);
  normalizeFleetShipAssignments();
  syncFleetHierarchyCategoryLinks();
  rebuildFleetRenderPositions();
  rebuildIndexes();
  saveLocal();
  playAudioCue(datapadDeleteAudio);
  if (selected?.type === 'fleet' && selected.id === fleet.id) closeInfoPanel();
  render({ positions: true, layers: true });
  renderFleetManagementView();
  setStatus(`Verband gelöscht: ${fleet.name}. ${assignedShips.length} Schiff(e) zurück im Pool.`);
}

function playShipTransferFx(ship, sourceFleet, targetFleet) {
  const sourcePosition = sourceFleet ? getFleetDisplayPosition(sourceFleet) : null;
  const targetPosition = targetFleet ? getFleetDisplayPosition(targetFleet) : null;
  const sourcePlanetId = sourceFleet?.locationPlanetId || sourceFleet?.planetId || '';
  const targetPlanetId = targetFleet?.locationPlanetId || targetFleet?.planetId || '';
  if (!ship || !sourceFleet || !targetFleet || !sourcePosition || !targetPosition) return false;
  const routePlan = sourcePlanetId && targetPlanetId && sourcePlanetId !== targetPlanetId
    ? findFleetTravelPlan(sourcePlanetId, targetPlanetId)
    : null;
  const fallbackPoints = [sourcePosition, targetPosition];
  const points = routePlan?.points?.length ? routePlan.points : fallbackPoints;
  const totalLength = routePlan?.totalLength || distanceBetweenPoints(sourcePosition, targetPosition);
  const duration = Math.max(6000, Math.min(45000, (Math.max(180, totalLength) / FLEET_TRAVEL_REFERENCE_DISTANCE) * FLEET_TRAVEL_REFERENCE_DURATION_MS));
  const token = document.createElement('div');
  token.className = 'fleet-transfer-token';
  token.style.left = `${sourcePosition.x}px`;
  token.style.top = `${sourcePosition.y}px`;
  token.innerHTML = `<img src="${iconFor(targetFleet)}" alt="">`;
  fxLayer.appendChild(token);
  playAudioCue(hyperspaceStartAudio);
  let finishAudioPlayed = false;
  const playFinishIfNeeded = () => {
    if (finishAudioPlayed) return;
    finishAudioPlayed = true;
    playAudioCue(hyperspaceFinishAudio);
  };
  const finalizeTransferFx = () => {
    token.remove();
    playFinishIfNeeded();
  };
  const startedAt = performance.now();
  const tickTransfer = (now) => {
    const elapsed = now - startedAt;
    const movementElapsed = Math.max(0, elapsed - FLEET_HYPERSPACE_START_DELAY_MS);
    const linearProgress = clamp(movementElapsed / duration, 0, 1);
    const distance = totalLength * linearProgress;
    const point = samplePolylineAtDistance(points, distance);
    token.style.left = `${point.x}px`;
    token.style.top = `${point.y}px`;
    if (elapsed < FLEET_HYPERSPACE_START_DELAY_MS) {
      token.style.opacity = String(clamp(elapsed / 450, 0, 1));
      token.style.transform = 'translate(-50%, -50%) scale(1)';
    } else {
      token.style.opacity = linearProgress > 0.94 ? String((1 - linearProgress) / 0.06) : '1';
      token.style.transform = 'translate(-50%, -50%) scale(0.92)';
    }
    if (!finishAudioPlayed && elapsed >= Math.max(FLEET_HYPERSPACE_START_DELAY_MS, (duration + FLEET_HYPERSPACE_START_DELAY_MS) - FLEET_HYPERSPACE_FINISH_LEAD_MS)) {
      playFinishIfNeeded();
    }
    if (linearProgress >= 1) {
      finalizeTransferFx();
      return;
    }
    requestAnimationFrame(tickTransfer);
  };
  requestAnimationFrame(tickTransfer);
  return duration + FLEET_HYPERSPACE_START_DELAY_MS;
}

function openFleetManifestInManagement(fleetId) {
  ensureFleetCategoryVisibleForFleetId(fleetId);
  activeFleetManifestFilterFleetId = fleetId || '';
  renderFleetManagementView();
  requestAnimationFrame(() => {
    const target = document.getElementById('fleetManagementShipsSection');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function clearFleetManifestFilter() {
  activeFleetManifestFilterFleetId = '';
  fleetManifestSearchQuery = '';
  renderFleetManagementView();
}

function createFleetManagementCategory() {
  const role = currentRole();
  if (role === 'Viewer' || role === 'Senat' || isUnderworldRole(role)) return;
  const faction = role === 'Eventleiter / KUS'
    ? 'KUS'
    : (fleetManagementFactionFilter === 'KUS' ? 'KUS' : 'GAR');
  const category = createFleetCategoryRecord({ faction, name: 'Neue Navy-Kategorie' });
  ensureFleetCategoriesStore().push(category);
  saveLocal();
  playAudioCue(datapadAcceptAudio);
  renderFleetManagementView();
  setStatus(`Kategorie erstellt: ${category.name}`);
}

function saveFleetManagementCategory(id) {
  const category = ensureFleetCategoriesStore().find((entry) => entry.id === id);
  if (!category || !canEditFaction(category.faction)) return;
  const input = document.getElementById(`fleetCategoryName_${id}`);
  if (input) category.name = input.value.trim() || category.name;
  saveLocal();
  playAudioCue(datapadAcceptAudio);
  renderFleetManagementView();
  setStatus(`Kategorie gespeichert: ${category.name}`);
}

function deleteFleetManagementCategory(id) {
  const category = ensureFleetCategoriesStore().find((entry) => entry.id === id);
  if (!category || !canEditFaction(category.faction)) return;
  state.fleets.forEach((fleet) => {
    if (fleet.categoryId === id) fleet.categoryId = '';
  });
  syncFleetHierarchyCategoryLinks();
  state.meta.fleetCategories = ensureFleetCategoriesStore().filter((entry) => entry.id !== id);
  delete ensureFleetCardOrderStore()[`category:${id}`];
  fleetCategoryCollapsedIds.delete(id);
  saveLocal();
  playAudioCue(datapadDeleteAudio);
  renderFleetManagementView();
  setStatus(`Kategorie gelöscht: ${category.name}`);
}

function toggleFleetManagementCategory(id) {
  if (!id) return;
  if (fleetCategoryCollapsedIds.has(id)) fleetCategoryCollapsedIds.delete(id);
  else fleetCategoryCollapsedIds.add(id);
  saveClientUiPrefs();
  renderFleetManagementView();
}

function getDragSourceElementFromEvent(event) {
  return event?.currentTarget?.closest?.('.fleet-card, .fleet-category-card') || null;
}

function startFleetManagementFleetDrag(fleetId, event) {
  const fleet = fleetIndex.get(fleetId) || state.fleets.find((entry) => entry.id === fleetId);
  if (!fleet || !canEditFaction(fleet.faction)) {
    event?.preventDefault?.();
    return;
  }
  if (!event?.target?.closest?.('.card-drag-handle')) {
    event?.preventDefault?.();
    return;
  }
  event?.stopPropagation?.();
  draggedFleetManagementFleetId = fleetId;
  getDragSourceElementFromEvent(event)?.classList.add('drag-active');
  if (event?.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `fleet:${fleetId}`);
  }
}

function endFleetManagementFleetDrag(event) {
  draggedFleetManagementFleetId = '';
  getDragSourceElementFromEvent(event)?.classList.remove('drag-active');
}

function startFleetCategoryDrag(categoryId, event) {
  const category = ensureFleetCategoriesStore().find((entry) => entry.id === categoryId);
  if (!category || !canEditFaction(category.faction)) {
    event?.preventDefault?.();
    return;
  }
  if (!event?.target?.closest?.('.card-drag-handle')) {
    event?.preventDefault?.();
    return;
  }
  event?.stopPropagation?.();
  draggedFleetCategoryId = categoryId;
  getDragSourceElementFromEvent(event)?.classList.add('drag-active');
  if (event?.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `category:${categoryId}`);
  }
}

function endFleetCategoryDrag(event) {
  draggedFleetCategoryId = '';
  getDragSourceElementFromEvent(event)?.classList.remove('drag-active');
}

function allowFleetCategoryDrop(event) {
  event.preventDefault();
  autoScrollFleetManagementPanel(event.clientY);
  if (event.currentTarget) event.currentTarget.classList.add('drop-target');
}

function clearFleetCategoryDrop(event) {
  if (event?.currentTarget) event.currentTarget.classList.remove('drop-target');
}

function assignFleetToCategory(fleetId, categoryId) {
  const fleet = fleetIndex.get(fleetId) || state.fleets.find((entry) => entry.id === fleetId);
  if (!fleet || !canEditFaction(fleet.faction)) return;
  if (categoryId) {
    const category = ensureFleetCategoriesStore().find((entry) => entry.id === categoryId);
    if (!category || category.faction !== fleet.faction) return;
    removeFleetFromOrderBuckets(fleet.id);
    fleet.categoryId = category.id;
    fleetCategoryCollapsedIds.delete(category.id);
    syncFleetIntoOrderBucket(fleet, getFleetOrderBucketKey(fleet, category.id));
  } else {
    removeFleetFromOrderBuckets(fleet.id);
    fleet.categoryId = '';
    syncFleetIntoOrderBucket(fleet, getFleetOrderBucketKey(fleet, ''));
  }
  syncFleetHierarchyCategoryLinks();
  saveClientUiPrefs();
  saveLocal();
  playAudioCue(datapadAcceptAudio);
  renderFleetManagementView();
  setStatus(categoryId ? `Verband in Kategorie verschoben: ${fleet.name}` : `Verband aus Kategorie gelöst: ${fleet.name}`);
}

function handleFleetCategoryDrop(categoryId, event) {
  event.preventDefault();
  clearFleetCategoryDrop(event);
  const payload = event.dataTransfer?.getData('text/plain') || (draggedFleetCategoryId ? `category:${draggedFleetCategoryId}` : (draggedFleetManagementFleetId ? `fleet:${draggedFleetManagementFleetId}` : ''));
  if (!payload) return;
  if (payload.startsWith('fleet:')) {
    const fleetId = payload.slice(6);
    draggedFleetManagementFleetId = '';
    assignFleetToCategory(fleetId, categoryId || '');
  }
}

function allowFleetCardReorder(event) {
  event.preventDefault();
  autoScrollFleetManagementPanel(event.clientY);
  if (event.currentTarget) event.currentTarget.classList.add('reorder-target');
}

function clearFleetCardReorder(event) {
  if (event?.currentTarget) event.currentTarget.classList.remove('reorder-target');
}

function handleFleetCardReorderDrop(targetFleetId, bucketKey, event) {
  event.preventDefault();
  event.stopPropagation();
  clearFleetCardReorder(event);
  const payload = event.dataTransfer?.getData('text/plain') || (draggedFleetManagementFleetId ? `fleet:${draggedFleetManagementFleetId}` : '');
  if (!payload || !payload.startsWith('fleet:')) return;
  const fleetId = payload.slice(6);
  const fleet = fleetIndex.get(fleetId) || state.fleets.find((entry) => entry.id === fleetId);
  if (!fleet || !canEditFaction(fleet.faction)) return;
  const targetFleet = fleetIndex.get(targetFleetId) || state.fleets.find((entry) => entry.id === targetFleetId);
  if (!targetFleet || targetFleet.faction !== fleet.faction) return;
  const targetCategoryId = bucketKey.startsWith('category:') ? bucketKey.slice(9) : '';
  if ((fleet.categoryId || '') !== targetCategoryId) {
    assignFleetToCategory(fleet.id, targetCategoryId);
  }
  const effectiveBucketKey = getFleetOrderBucketKey(fleet, targetCategoryId);
  syncFleetIntoOrderBucket(fleet, effectiveBucketKey);
  syncFleetIntoOrderBucket(targetFleet, effectiveBucketKey);
  const targetRect = event.currentTarget?.getBoundingClientRect?.();
  const placeAfter = Boolean(targetRect && event.clientY > (targetRect.top + (targetRect.height / 2)));
  reorderFleetWithinBucket(fleet.id, targetFleet.id, effectiveBucketKey, placeAfter);
  saveLocal();
  playAudioCue(datapadAcceptAudio);
  renderFleetManagementView();
  setStatus(`Kartenreihenfolge aktualisiert: ${fleet.name}`);
}

function reorderFleetCategory(draggedCategoryId, targetCategoryId) {
  if (!draggedCategoryId || !targetCategoryId || draggedCategoryId === targetCategoryId) return;
  const categories = ensureFleetCategoriesStore();
  const fromIndex = categories.findIndex((entry) => entry.id === draggedCategoryId);
  const toIndex = categories.findIndex((entry) => entry.id === targetCategoryId);
  if (fromIndex < 0 || toIndex < 0) return;
  const dragged = categories[fromIndex];
  const target = categories[toIndex];
  if (!canEditFaction(dragged.faction) || dragged.faction !== target.faction) return;
  categories.splice(fromIndex, 1);
  categories.splice(toIndex, 0, dragged);
  saveLocal();
  playAudioCue(datapadAcceptAudio);
  renderFleetManagementView();
  setStatus(`Kategorie verschoben: ${dragged.name}`);
}

function allowFleetCategoryReorder(event) {
  event.preventDefault();
  autoScrollFleetManagementPanel(event.clientY);
  if (event.currentTarget) event.currentTarget.classList.add('reorder-target');
}

function clearFleetCategoryReorder(event) {
  if (event?.currentTarget) event.currentTarget.classList.remove('reorder-target');
}

function handleFleetCategoryReorderDrop(targetCategoryId, event) {
  event.preventDefault();
  clearFleetCategoryReorder(event);
  const payload = event.dataTransfer?.getData('text/plain') || (draggedFleetCategoryId ? `category:${draggedFleetCategoryId}` : '');
  if (!payload || !payload.startsWith('category:')) return;
  const draggedCategoryId = payload.slice(9);
  draggedFleetCategoryId = '';
  reorderFleetCategory(draggedCategoryId, targetCategoryId);
}

function getFleetHierarchySortValue(fleet) {
  const role = normalizeFleetCommandRole(fleet?.commandRole);
  if (role === 'station') return 0;
  if (role === 'battle_division') return 1;
  return 2;
}

function getFleetParentOptions(fleet, fleets) {
  if (!fleet || normalizeFleetCommandRole(fleet.commandRole) === 'battle_group') return [];
  return fleets
    .filter((entry) => entry.id !== fleet.id
      && entry.faction === fleet.faction
      && normalizeFleetCommandRole(entry.commandRole) === 'battle_group')
    .sort((a, b) => String(a.assignment || a.name).localeCompare(String(b.assignment || b.name), 'de', { sensitivity: 'base', numeric: true }));
}

function buildFleetHierarchy(fleets) {
  const fleetById = new Map(fleets.map((fleet) => [fleet.id, fleet]));
  const childrenMap = new Map();
  const roots = [];
  fleets.forEach((fleet) => {
    const role = normalizeFleetCommandRole(fleet.commandRole);
    const parent = fleet.parentFleetId ? fleetById.get(fleet.parentFleetId) : null;
    const parentValid = parent
      && parent.id !== fleet.id
      && parent.faction === fleet.faction
      && normalizeFleetCommandRole(parent.commandRole) === 'battle_group'
      && role !== 'battle_group';
    if (parentValid) {
      if (!childrenMap.has(parent.id)) childrenMap.set(parent.id, []);
      childrenMap.get(parent.id).push(fleet);
      return;
    }
    roots.push(fleet);
  });
  roots.sort((a, b) => {
    const roleDelta = getFleetHierarchySortValue(a) - getFleetHierarchySortValue(b);
    if (roleDelta !== 0) return roleDelta;
    return (a.assignment || a.name).localeCompare(b.assignment || b.name, 'de', { sensitivity: 'base', numeric: true });
  });
  childrenMap.forEach((children, key) => {
    children.sort((a, b) => {
      const roleDelta = getFleetHierarchySortValue(a) - getFleetHierarchySortValue(b);
      if (roleDelta !== 0) return roleDelta;
      return (a.assignment || a.name).localeCompare(b.assignment || b.name, 'de', { sensitivity: 'base', numeric: true });
    });
    childrenMap.set(key, children);
  });
  return { roots, childrenMap };
}

function syncFleetHierarchyCategoryLinks() {
  const fleetById = new Map(state.fleets.map((fleet) => [fleet.id, fleet]));
  state.fleets.forEach((fleet) => {
    const role = normalizeFleetCommandRole(fleet.commandRole);
    if (role === 'battle_group') {
      fleet.parentFleetId = '';
      return;
    }
    const parent = fleet.parentFleetId ? fleetById.get(fleet.parentFleetId) : null;
    const validParent = parent
      && parent.id !== fleet.id
      && parent.faction === fleet.faction
      && normalizeFleetCommandRole(parent.commandRole) === 'battle_group';
    if (!validParent) {
      fleet.parentFleetId = '';
      return;
    }
    fleet.categoryId = parent.categoryId || '';
  });
}

function syncFleetParentSelectState(fleetId) {
  const roleSelect = document.getElementById(`fmFleetRole_${fleetId}`);
  const parentSelect = document.getElementById(`fmFleetParent_${fleetId}`);
  if (!roleSelect || !parentSelect) return;
  const role = normalizeFleetCommandRole(roleSelect.value);
  const disableParent = role === 'battle_group';
  parentSelect.disabled = disableParent;
  if (disableParent) parentSelect.value = '';
}

function renderFleetHierarchyColumns(fleets, bucketKeyPrefix = 'category') {
  const { roots, childrenMap } = buildFleetHierarchy(fleets);
  const commandGroups = roots.filter((fleet) => normalizeFleetCommandRole(fleet.commandRole) === 'battle_group');
  const unassignedNodes = roots.filter((fleet) => normalizeFleetCommandRole(fleet.commandRole) !== 'battle_group');
  const columns = commandGroups.map((fleet) => {
    const children = childrenMap.get(fleet.id) || [];
    const stations = children.filter((entry) => normalizeFleetCommandRole(entry.commandRole) === 'station');
    const divisions = children.filter((entry) => normalizeFleetCommandRole(entry.commandRole) === 'battle_division');
    const bucketKey = bucketKeyPrefix.startsWith('category:') || bucketKeyPrefix.startsWith('ungrouped:')
      ? bucketKeyPrefix
      : `${bucketKeyPrefix}:${fleet.categoryId || fleet.faction}`;
    return `
      <div class="fleet-command-column">
        ${renderFleetManagementFleetCard(fleet, bucketKey, { compact: true, inHierarchy: true })}
        <div class="fleet-command-child-block">
          <div class="fleet-command-child-title">Raumstationen</div>
          ${stations.length
            ? `<div class="fleet-command-child-list">${stations.map((entry) => renderFleetManagementFleetCard(entry, bucketKey, { compact: true, inHierarchy: true })).join('')}</div>`
            : '<div class="fleet-category-empty">Keine Raumstation zugeordnet.</div>'}
        </div>
        <div class="fleet-command-child-block">
          <div class="fleet-command-child-title">Schlachtdivisionen</div>
          ${divisions.length
            ? `<div class="fleet-command-child-list">${divisions.map((entry) => renderFleetManagementFleetCard(entry, bucketKey, { compact: true, inHierarchy: true })).join('')}</div>`
            : '<div class="fleet-category-empty">Keine Schlachtdivision zugeordnet.</div>'}
        </div>
      </div>
    `;
  }).join('');
  const normalizedBucketKey = bucketKeyPrefix.startsWith('category:') || bucketKeyPrefix.startsWith('ungrouped:')
    ? bucketKeyPrefix
    : `${bucketKeyPrefix}:${fleets[0]?.categoryId || fleets[0]?.faction || 'GAR'}`;
  const unassignedBlock = unassignedNodes.length
    ? `
      <div class="fleet-command-unassigned">
        <h5>Direkt auf Kategorieebene</h5>
        <div class="fleet-card-list">
          ${unassignedNodes.map((fleet) => renderFleetManagementFleetCard(fleet, normalizedBucketKey, { compact: true })).join('')}
        </div>
      </div>
    `
    : '';
  if (!columns && !unassignedBlock) return '<div class="fleet-category-empty">Noch keine Verbände in dieser Kategorie.</div>';
  return `
    ${columns ? `<div class="fleet-command-grid">${columns}</div>` : ''}
    ${unassignedBlock}
  `;
}

function renderFleetManagementFleetCard(fleet, bucketKey = getFleetOrderBucketKey(fleet), options = {}) {
  const editable = canEditFaction(fleet.faction);
  const compact = Boolean(options?.compact);
  const hierarchy = Boolean(options?.inHierarchy);
  const commandRole = normalizeFleetCommandRole(fleet.commandRole);
  const parentOptions = getFleetParentOptions(fleet, state.fleets);
  const currentParent = fleet.parentFleetId ? (fleetIndex.get(fleet.parentFleetId) || state.fleets.find((entry) => entry.id === fleet.parentFleetId)) : null;
  const summary = getFleetOperationalSummary(fleet.id);
  const secondaryStat = commandRole === 'battle_group'
    ? `${summary.divisions.length} Division(en) • ${summary.stations.length} Station(en)`
    : `${summary.totalShips} Schiff(e) • ${fleet.assignment || 'ohne Kennung'}`;
  const shipSummaryText = summary.totalShips
    ? summary.classSummary.replaceAll('<br>', ' • ')
    : 'Keine Schiffe zugewiesen';
  const reorderAttrs = editable
    ? `ondragover="allowFleetCardReorder(event)" ondragleave="clearFleetCardReorder(event)" ondrop="handleFleetCardReorderDrop('${fleet.id}', '${bucketKey}', event)"`
    : '';
  return `
    <div class="fleet-card ${compact ? 'compact' : ''} ${hierarchy ? 'hierarchy-card' : ''}" data-focus-key="fleet:${fleet.id}" ${reorderAttrs}>
      ${editable ? `<div class="card-drag-handle" title="Verband ziehen" draggable="true" ondragstart="startFleetManagementFleetDrag('${fleet.id}', event)" ondragend="endFleetManagementFleetDrag(event)">::</div>` : ''}
      <div class="fleet-card-headline">
        <div>
          <h4>${fleet.name}</h4>
          <p><span class="badge ${fleet.faction}">${fleet.faction}</span> • ${getFleetCommandRoleLabel(commandRole)}</p>
        </div>
      </div>
      <div class="fleet-card-overview">
        <div class="fleet-card-stat">
          <span class="fleet-card-stat-label">CO</span>
          <strong>${escapeHtml(fleet.commander || fleet.leader || 'Nicht gesetzt')}</strong>
        </div>
        <div class="fleet-card-stat">
          <span class="fleet-card-stat-label">Struktur</span>
          <strong>${escapeHtml(secondaryStat)}</strong>
        </div>
        <div class="fleet-card-stat">
          <span class="fleet-card-stat-label">Standort</span>
          <strong>${escapeHtml(getFleetDisplayLocation(fleet))}</strong>
        </div>
        <div class="fleet-card-stat">
          <span class="fleet-card-stat-label">Unterstellt</span>
          <strong>${escapeHtml(commandRole === 'battle_group' ? 'Eigenständig' : (currentParent?.name || 'Nicht unterstellt'))}</strong>
        </div>
        <div class="fleet-card-stat fleet-card-shipbox">
          <span class="fleet-card-stat-label">Schiffe</span>
          <strong>${commandRole === 'battle_group'
            ? `${summary.totalShips} Gesamt`
            : `${summary.totalShips} Direkt`}</strong>
          <small>${escapeHtml(shipSummaryText)}</small>
        </div>
      </div>
      <div class="split-inline">
        <input id="fmFleetName_${fleet.id}" value="${fleet.name}">
        <input id="fmFleetCommander_${fleet.id}" value="${fleet.commander || ''}" placeholder="CO / Commander">
      </div>
      <div class="split-inline">
        <div class="form-row">
          <label>Kommandotyp</label>
          <select id="fmFleetRole_${fleet.id}" onchange="syncFleetParentSelectState('${fleet.id}')">
            <option value="battle_group" ${commandRole === 'battle_group' ? 'selected' : ''}>Kampfgeschwader</option>
            <option value="station" ${commandRole === 'station' ? 'selected' : ''}>Raumstation</option>
            <option value="battle_division" ${commandRole === 'battle_division' ? 'selected' : ''}>Schlachtdivision</option>
          </select>
        </div>
        <div class="form-row">
          <label>Unterstellt</label>
          <select id="fmFleetParent_${fleet.id}" ${commandRole === 'battle_group' ? 'disabled' : ''}>
            <option value="">Nicht unterstellt</option>
            ${parentOptions.map((entry) => `<option value="${entry.id}" ${fleet.parentFleetId === entry.id ? 'selected' : ''}>${entry.assignment ? `${entry.assignment} • ` : ''}${entry.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <label>Kennung</label>
        <input id="fmFleetAssignment_${fleet.id}" value="${fleet.assignment || ''}" placeholder="z.B. 1.1.1">
      </div>
      <div class="form-row">
        <label>Planetenbindung</label>
        <input id="fmFleetLocation_${fleet.id}" value="${getFleetDisplayLocation(fleet)}" placeholder="z.B. Coruscant">
      </div>
      <p>${commandRole === 'battle_group'
        ? `Oberverband ohne doppelte Schiffsbindung. Gesamtstärke wird aus den unterstellten Schlachtdivisionen aggregiert.${summary.directShips ? ` Legacy-Direktzuweisungen: ${summary.directShips}.` : ''}`
        : `Diese Einheit wird normalerweise eigenständig bewegt und kann optional einem Kampfgeschwader unterstellt werden.`}</p>
      ${commandRole === 'battle_group'
        ? '<p class="fleet-command-warning">Bewegung nur im Notfall. Normalerweise werden die unterstellten Schlachtdivisionen verlegt.</p>'
        : '<p class="muted">Diese Einheit ist regulär einzeln verlegbar.</p>'}
      <div class="actions">
        <button class="mini-btn primary" onclick="saveFleetManagementFleet('${fleet.id}')">Verband speichern</button>
        <button class="mini-btn" onclick="openFleetManifestInManagement('${fleet.id}')">Schiffsmanifest</button>
        ${fleet.locationPlanetId || fleet.planetId ? `<button class="mini-btn" onclick="focusFleetOnMap('${fleet.id}')">Auf Map</button>` : ''}
        <button class="mini-btn danger" onclick="deleteFleetManagementFleet('${fleet.id}')">Verband löschen</button>
      </div>
    </div>
  `;
}

function animateShipTransferBetweenFleets(ship, sourceFleet, targetFleet) {
  const sourcePosition = sourceFleet ? getFleetDisplayPosition(sourceFleet) : null;
  const targetPosition = targetFleet ? getFleetDisplayPosition(targetFleet) : null;
  if (!ship || !sourceFleet || !targetFleet || !sourcePosition || !targetPosition) {
    ship.assignedFleetId = targetFleet?.id || '';
    ship.locationPlanetId = targetFleet?.locationPlanetId || targetFleet?.planetId || ship.locationPlanetId;
    normalizeFleetShipAssignments();
    rebuildIndexes();
    saveLocal();
    render({ positions: true, layers: true });
    if (activeMainTab === 'fleetManagement') renderFleetManagementView();
    if (selected?.type === 'fleet' && (selected.id === sourceFleet?.id || selected.id === targetFleet?.id)) openFleet(selected.id);
    return;
  }
  const transferDurationMs = playShipTransferFx(ship, sourceFleet, targetFleet);
  emitLiveSocketEvent('fx:ship-redeploy', {
    shipId: ship.id,
    sourceFleetId: sourceFleet.id,
    targetFleetId: targetFleet.id
  });
  ship.assignedFleetId = '';
  normalizeFleetShipAssignments();
  saveLocal();
  if (activeMainTab === 'fleetManagement') renderFleetManagementView();
  if (selected?.type === 'fleet' && (selected.id === sourceFleet.id || selected.id === targetFleet.id)) openFleet(selected.id);
  const finalizeTransfer = () => {
    ship.assignedFleetId = targetFleet.id;
    ship.locationPlanetId = targetFleet.locationPlanetId || targetFleet.planetId || ship.locationPlanetId;
    normalizeFleetShipAssignments();
    rebuildIndexes();
    saveLocal();
    render({ positions: true, layers: true });
    if (activeMainTab === 'fleetManagement') renderFleetManagementView();
    if (selected?.type === 'fleet' && (selected.id === sourceFleet.id || selected.id === targetFleet.id)) openFleet(selected.id);
    setStatus(`Schiff umverlegt: ${ship.name} -> ${targetFleet.name}`);
  };
  window.setTimeout(finalizeTransfer, Math.max(Number(transferDurationMs) || 0, 6500));
}

