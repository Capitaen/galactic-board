function indexById(items = []) {
  return new Map(items.map((item) => [item.id, item]));
}

function hasChanged(a, b) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function ensure(condition, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.status = 403;
    error.details = details;
    throw error;
  }
}

function cloneWithoutKeys(item, keys = []) {
  const clone = { ...(item || {}) };
  keys.forEach((key) => {
    delete clone[key];
  });
  return clone;
}

function pointInPolygon(point, polygon) {
  if (!point || !Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (!currentPoint || !previousPoint) continue;
    const intersects = ((Number(currentPoint.y) > Number(point.y)) !== (Number(previousPoint.y) > Number(point.y)))
      && (Number(point.x) < ((Number(previousPoint.x) - Number(currentPoint.x)) * (Number(point.y) - Number(currentPoint.y))) / ((Number(previousPoint.y) - Number(currentPoint.y)) || Number.EPSILON) + Number(currentPoint.x));
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonArea(points = []) {
  if (!Array.isArray(points) || points.length < 3) return Number.POSITIVE_INFINITY;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += (Number(current?.x || 0) * Number(next?.y || 0)) - (Number(next?.x || 0) * Number(current?.y || 0));
  }
  return Math.abs(area / 2);
}

function centroidOfPolygon(points = []) {
  if (!Array.isArray(points) || !points.length) return { x: 0, y: 0 };
  const sum = points.reduce((accumulator, point) => ({
    x: accumulator.x + Number(point?.x || 0),
    y: accumulator.y + Number(point?.y || 0)
  }), { x: 0, y: 0 });
  return {
    x: sum.x / points.length,
    y: sum.y / points.length
  };
}

function resolvePlanetSectorFromManualSectors(planet, manualSectors = []) {
  const point = {
    x: Number(planet?.x),
    y: Number(planet?.y)
  };
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return String(planet?.sector || '').trim();
  const matches = manualSectors
    .map((sector) => {
      const name = String(sector?.name || '').trim();
      const polygon = Array.isArray(sector?.points) ? sector.points : [];
      if (!name || polygon.length < 3 || !pointInPolygon(point, polygon)) return null;
      const centroid = centroidOfPolygon(polygon);
      return {
        name,
        area: polygonArea(polygon),
        distance: Math.hypot(point.x - centroid.x, point.y - centroid.y)
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.area - right.area || left.distance - right.distance || left.name.localeCompare(right.name, 'de'));
  return matches[0]?.name || String(planet?.sector || '').trim();
}

function normalizePlanetSectorsFromManualSectors(state) {
  const manualSectors = Array.isArray(state?.meta?.manualSectors) ? state.meta.manualSectors : [];
  if (!manualSectors.length || !Array.isArray(state?.planets)) return;
  state.planets.forEach((planet) => {
    const resolvedSector = resolvePlanetSectorFromManualSectors(planet, manualSectors);
    if (resolvedSector && String(planet?.sector || '').trim() !== resolvedSector) {
      planet.sector = resolvedSector;
    }
  });
}

const ROLE_BASE_ROLES = {
  'Republic Navy Admin': 'Republic Navy / GAR',
  'Galaktischer Senats Admin': 'Senat',
  'Eventleiter / KUS Admin': 'Eventleiter / KUS',
  'Black Sun Syndikat Admin': 'Black Sun Syndikat',
  'Pyke-Syndikat Admin': 'Pyke-Syndikat',
  'Huttenkartell Admin': 'Huttenkartell'
};
const INFRASTRUCTURE_KEYS = new Set([
  'quadraniumErz',
  'agrinium',
  'tibannaGas',
  'baradium',
  'kavamSalz',
  'civilian_quadraniumErz',
  'civilian_agrinium',
  'civilian_tibannaGas',
  'civilian_baradium',
  'civilian_kavamSalz',
  'civil_trade_center',
  'civil_industrial_complex',
  'civil_logistics_center',
  'civil_research_academy',
  'civil_orbital_trade_station'
]);

function getSectorControlStatus(state, sectorName) {
  const normalizedSector = String(sectorName || '').trim();
  if (!normalizedSector) return 'Neutral';
  const planets = (Array.isArray(state?.planets) ? state.planets : [])
    .filter((planet) => String(planet?.sector || '').trim() === normalizedSector);
  if (!planets.length) return 'Neutral';
  const ownerCounts = new Map();
  planets.forEach((planet) => {
    const owner = String(planet?.owner || 'NEUTRAL').trim() || 'NEUTRAL';
    ownerCounts.set(owner, (ownerCounts.get(owner) || 0) + 1);
  });
  const total = planets.length;
  const gar = Number(ownerCounts.get('GAR') || 0);
  const kus = Number(ownerCounts.get('KUS') || 0);
  if (gar > 0 && kus > 0) return 'Umkämpft';
  if (gar > 0 && gar >= total * 0.6) return 'BLUFOR';
  if (kus > 0 && kus >= total * 0.6) return 'OPFOR';
  return 'Neutral';
}

function isBluforSenateMineTarget(state, planetId) {
  const planet = (Array.isArray(state?.planets) ? state.planets : []).find((entry) => entry?.id === planetId);
  return Boolean(planet?.owner === 'GAR' && getSectorControlStatus(state, planet.sector) === 'BLUFOR');
}

function canManageLogins(role) {
  const normalizedRole = String(role || '');
  return normalizedRole === 'Admin' || normalizedRole.endsWith(' Admin');
}

function validatePlanetChanges(role, previousState, nextState) {
  if (role === 'Admin') return;
  const previous = indexById(previousState.planets);
  const next = indexById(nextState.planets);
  next.forEach((planet, id) => {
    const before = previous.get(id);
    if (role === 'Senat') {
      ensure(before && before.owner === 'GAR' && planet.owner === 'GAR', 'Senat may only modify GAR planets', { entity: 'planet', id });
      const beforeComparable = cloneWithoutKeys(before, ['description']);
      const nextComparable = cloneWithoutKeys(planet, ['description']);
      ensure(!hasChanged(beforeComparable, nextComparable), 'Senat may only update GAR planet descriptions', { entity: 'planet', id });
      return;
    }
    if (role === 'Republic Navy / GAR') {
      ensure(before && !hasChanged(before, planet), 'GAR role may not change planets', { entity: 'planet', id });
      return;
    }
    if (role === 'Eventleiter / KUS') {
      if (!before) {
        ensure(planet.owner !== 'GAR', 'KUS role may not create GAR planets', { entity: 'planet', id });
        return;
      }
      if (!hasChanged(before, planet)) return;
      ensure(before.owner !== 'GAR' && planet.owner !== 'GAR', 'KUS role may not modify GAR planets', { entity: 'planet', id });
    }
  });
  previous.forEach((planet, id) => {
    if (next.has(id)) return;
    if (role === 'Senat') {
      ensure(false, 'Senat may not delete planets', { entity: 'planet', id });
      return;
    }
    if (role === 'Republic Navy / GAR') {
      ensure(false, 'GAR role may not delete planets', { entity: 'planet', id });
      return;
    }
    if (role === 'Eventleiter / KUS') {
      ensure(planet.owner !== 'GAR', 'KUS role may not delete GAR planets', { entity: 'planet', id });
      return;
    }
    ensure(false, 'Role may not delete planets', { entity: 'planet', id });
  });
}

function validatePlanetResourceChanges(role, previousState, nextState) {
  if (role === 'Admin') return;
  const previousSlots = previousState.planetResources || {};
  const nextSlots = nextState.planetResources || {};
  const previousPlanets = indexById(previousState.planets);
  const nextPlanets = indexById(nextState.planets);
  const planetIds = new Set([...Object.keys(previousSlots), ...Object.keys(nextSlots)]);
  planetIds.forEach((planetId) => {
    const before = previousSlots[planetId] || [];
    const after = nextSlots[planetId] || [];
    if (!hasChanged(before, after)) return;
    ensure(Array.isArray(after) && after.length <= 10 && after.every((slot) => !slot || INFRASTRUCTURE_KEYS.has(slot)), 'Invalid infrastructure slot value', { entity: 'planetResources', planetId });
    const beforePlanet = previousPlanets.get(planetId);
    const nextPlanet = nextPlanets.get(planetId);
    if (role === 'Senat') {
      ensure(beforePlanet?.owner === 'GAR' && nextPlanet?.owner === 'GAR', 'Senat may only manage GAR mine slots', { entity: 'planetResources', planetId });
      ensure(isBluforSenateMineTarget(nextState, planetId), 'Senatsminen dürfen nur auf BLUFOR-Territorium gebaut werden', { entity: 'planetResources', planetId });
      return;
    }
    if (role === 'Eventleiter / KUS') {
      ensure(beforePlanet?.owner !== 'GAR' && nextPlanet?.owner !== 'GAR', 'KUS role may not manage GAR mine slots', { entity: 'planetResources', planetId });
      const normalizedBefore = Array.isArray(before) ? before : [];
      const normalizedAfter = Array.isArray(after) ? after : [];
      for (let index = 3; index < Math.max(normalizedBefore.length, normalizedAfter.length); index += 1) {
        ensure((normalizedBefore[index] || '') === (normalizedAfter[index] || ''), 'KUS role may only edit first 3 mine slots', { entity: 'planetResources', planetId, index });
      }
      return;
    }
    ensure(false, 'Role may not change mine slots', { entity: 'planetResources', planetId });
  });
}

function validateFleetChanges(role, previousState, nextState) {
  if (role === 'Admin') return;
  const previous = indexById(previousState.fleets);
  const next = indexById(nextState.fleets);
  nextState.fleets.forEach((fleet) => {
    const before = previous.get(fleet.id);
    const expectedFaction = role === 'Eventleiter / KUS' ? 'KUS' : role === 'Republic Navy / GAR' ? 'GAR' : null;
    if (!before) {
      ensure(expectedFaction && fleet.faction === expectedFaction, 'Role may only create own faction fleets', { entity: 'fleet', id: fleet.id });
      return;
    }
    if (!hasChanged(before, fleet)) return;
    ensure(expectedFaction && before.faction === expectedFaction && fleet.faction === expectedFaction, 'Role may only modify own faction fleets', { entity: 'fleet', id: fleet.id });
  });
  previous.forEach((fleet, id) => {
    if (next.has(id)) return;
    const expectedFaction = role === 'Eventleiter / KUS' ? 'KUS' : role === 'Republic Navy / GAR' ? 'GAR' : null;
    ensure(expectedFaction && fleet.faction === expectedFaction, 'Role may only delete own faction fleets', { entity: 'fleet', id });
  });
}

function validateShipChanges(role, previousState, nextState) {
  if (role === 'Admin') return;
  const previous = indexById(previousState.ships);
  const next = indexById(nextState.ships);
  nextState.ships.forEach((ship) => {
    const before = previous.get(ship.id);
    const expectedFaction = role === 'Eventleiter / KUS' ? 'KUS' : role === 'Republic Navy / GAR' ? 'GAR' : null;
    if (!before) {
      ensure(expectedFaction && ship.faction === expectedFaction, 'Role may only create own faction ships', { entity: 'ship', id: ship.id });
      return;
    }
    if (!hasChanged(before, ship)) return;
    ensure(expectedFaction && before.faction === expectedFaction && ship.faction === expectedFaction, 'Role may only modify own faction ships', { entity: 'ship', id: ship.id });
  });
  previous.forEach((ship, id) => {
    if (next.has(id)) return;
    const expectedFaction = role === 'Eventleiter / KUS' ? 'KUS' : role === 'Republic Navy / GAR' ? 'GAR' : null;
    ensure(expectedFaction && ship.faction === expectedFaction, 'Role may only delete own faction ships', { entity: 'ship', id });
  });
}

function validateResourceChanges(role, previousState, nextState) {
  if (role === 'Admin') return;
  const previousGar = previousState.resources?.GAR || {};
  const nextGar = nextState.resources?.GAR || {};
  if (role === 'Republic Navy / GAR' || role === 'Senat') {
    Object.keys(nextGar).forEach((key) => {
      ensure((nextGar[key] ?? 0) <= (previousGar[key] ?? 0), 'GAR role may not increase shared resources directly', { entity: 'resources', key });
    });
    return;
  }
  if (hasChanged(previousGar, nextGar)) {
    ensure(false, 'Only GAR role or Admin may affect GAR resources', { entity: 'resources' });
  }
}

function validateBuildJobChanges(role, previousState, nextState) {
  if (role === 'Admin') return;
  const previousJobs = indexById(previousState.buildJobs || []);
  const nextJobs = nextState.buildJobs || [];
  const nextJobIndex = indexById(nextJobs);
  nextJobs.forEach((job) => {
    const before = previousJobs.get(job.id);
    if (before && !hasChanged(before, job)) return;
    if (role === 'Senat') {
      ensure((job.faction || 'GAR') === 'GAR' && job.jobType === 'mine' && (!before || ((before.faction || 'GAR') === 'GAR' && before.jobType === 'mine')), 'Senat may only manage GAR mine projects', { entity: 'buildJob', id: job.id });
      ensure(isBluforSenateMineTarget(nextState, job.buildLocationPlanetId), 'Senatsminen dürfen nur auf BLUFOR-Territorium gebaut werden', { entity: 'buildJob', id: job.id, planetId: job.buildLocationPlanetId });
      return;
    }
    if (role === 'Republic Navy / GAR') {
      ensure((job.faction || 'GAR') === 'GAR' && job.jobType !== 'mine' && (!before || ((before.faction || 'GAR') === 'GAR' && before.jobType !== 'mine')), 'GAR role may only manage GAR ship or shipyard projects', { entity: 'buildJob', id: job.id });
      return;
    }
    if (role === 'Eventleiter / KUS') {
      ensure((job.faction || 'GAR') === 'KUS' && (!before || ((before.faction || 'GAR') === 'KUS')), 'KUS role may only manage KUS projects', { entity: 'buildJob', id: job.id });
      return;
    }
    ensure(false, 'Role may not change build projects', { entity: 'buildJob', id: job.id });
  });
  previousJobs.forEach((job, id) => {
    if (nextJobIndex.has(id)) return;
    if (role === 'Senat') {
      ensure((job.faction || 'GAR') === 'GAR' && job.jobType === 'mine', 'Senat may only delete GAR mine projects', { entity: 'buildJob', id });
      return;
    }
    if (role === 'Republic Navy / GAR') {
      ensure((job.faction || 'GAR') === 'GAR' && job.jobType !== 'mine', 'GAR role may only delete GAR ship or shipyard projects', { entity: 'buildJob', id });
      return;
    }
    if (role === 'Eventleiter / KUS') {
      ensure((job.faction || 'GAR') === 'KUS', 'KUS role may only delete KUS projects', { entity: 'buildJob', id });
      return;
    }
    ensure(false, 'Role may not delete build projects', { entity: 'buildJob', id });
  });
}

function validateAdminOnlyBlocks(role, effectiveRole, previousState, nextState) {
  if (effectiveRole === 'Admin') return;
  if (!canManageLogins(role)) {
    ensure(!hasChanged(previousState.authUsers || [], nextState.authUsers || []), 'Only login managers may submit login manager users', { entity: 'authUsers' });
  }
  ensure(!hasChanged(previousState.importWarnings || [], nextState.importWarnings || []), 'Only Admin may change import warnings payload', { entity: 'importWarnings' });
  ensure(!hasChanged(previousState.meta?.manualSectors || [], nextState.meta?.manualSectors || []), 'Only Admin may change manual sectors', { entity: 'manualSectors' });
}

export function validateNextCampaignState(role, previousState, nextState) {
  const actor = role && typeof role === 'object' ? role : { role };
  const assignedRole = actor.role;
  const effectiveRole = ROLE_BASE_ROLES[assignedRole] || assignedRole;
  ensure(effectiveRole !== 'Viewer', 'Viewer may not mutate campaign state');
  normalizePlanetSectorsFromManualSectors(nextState);
  if (assignedRole === 'Senat') {
    ensure(!hasChanged(previousState.resources || {}, nextState.resources || {}), 'Only Senate admins may manage the GAR budget');
    ensure(!hasChanged(previousState.planetResources || {}, nextState.planetResources || {}), 'Only Senate admins may manage GAR infrastructure');
    ensure(!hasChanged(previousState.buildJobs || [], nextState.buildJobs || []), 'Only Senate admins may manage GAR construction projects');
  }
  if (effectiveRole === 'Republic Navy / GAR' && !actor.canCoordinate4thFleet) {
    const previousJobs = indexById(previousState.buildJobs || []);
    const previousShips = indexById(previousState.ships || []);
    const addedGarShipJob = (nextState.buildJobs || []).some((job) => (
      !previousJobs.has(job.id)
      && (job.faction || 'GAR') === 'GAR'
      && (job.jobType || 'ship') === 'ship'
    ));
    const addedGarShip = (nextState.ships || []).some((ship) => (
      !previousShips.has(ship.id)
      && (ship.faction || 'GAR') === 'GAR'
      && String(ship.createdFrom || '').startsWith('shipyard')
    ));
    ensure(!addedGarShipJob && !addedGarShip, '4th Fleet Coordination permission required for GAR ship construction');
  }
  validatePlanetChanges(effectiveRole, previousState, nextState);
  validatePlanetResourceChanges(effectiveRole, previousState, nextState);
  validateFleetChanges(effectiveRole, previousState, nextState);
  validateShipChanges(effectiveRole, previousState, nextState);
  validateBuildJobChanges(effectiveRole, previousState, nextState);
  validateResourceChanges(effectiveRole, previousState, nextState);
  validateAdminOnlyBlocks(assignedRole, effectiveRole, previousState, nextState);
}
