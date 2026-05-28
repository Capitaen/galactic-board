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
    const beforePlanet = previousPlanets.get(planetId);
    const nextPlanet = nextPlanets.get(planetId);
    if (role === 'Senat') {
      ensure(beforePlanet?.owner === 'GAR' && nextPlanet?.owner === 'GAR', 'Senat may only manage GAR mine slots', { entity: 'planetResources', planetId });
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
      return;
    }
    if (role === 'Republic Navy / GAR') {
      ensure((job.faction || 'GAR') === 'GAR' && job.jobType !== 'mine' && (!before || ((before.faction || 'GAR') === 'GAR' && before.jobType !== 'mine')), 'GAR role may only manage GAR ship projects', { entity: 'buildJob', id: job.id });
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
      ensure((job.faction || 'GAR') === 'GAR' && job.jobType !== 'mine', 'GAR role may only delete GAR ship projects', { entity: 'buildJob', id });
      return;
    }
    if (role === 'Eventleiter / KUS') {
      ensure((job.faction || 'GAR') === 'KUS', 'KUS role may only delete KUS projects', { entity: 'buildJob', id });
      return;
    }
    ensure(false, 'Role may not delete build projects', { entity: 'buildJob', id });
  });
}

function validateAdminOnlyBlocks(role, previousState, nextState) {
  if (role === 'Admin') return;
  ensure(!hasChanged(previousState.authUsers || [], nextState.authUsers || []), 'Only Admin may change login manager users', { entity: 'authUsers' });
  ensure(!hasChanged(previousState.importWarnings || [], nextState.importWarnings || []), 'Only Admin may change import warnings payload', { entity: 'importWarnings' });
}

export function validateNextCampaignState(role, previousState, nextState) {
  ensure(role !== 'Viewer', 'Viewer may not mutate campaign state');
  validatePlanetChanges(role, previousState, nextState);
  validatePlanetResourceChanges(role, previousState, nextState);
  validateFleetChanges(role, previousState, nextState);
  validateShipChanges(role, previousState, nextState);
  validateBuildJobChanges(role, previousState, nextState);
  validateResourceChanges(role, previousState, nextState);
  validateAdminOnlyBlocks(role, previousState, nextState);
}
