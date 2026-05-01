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

function validatePlanetChanges(role, previousState, nextState) {
  if (role === 'Admin') return;
  const previous = indexById(previousState.planets);
  const next = indexById(nextState.planets);
  next.forEach((planet, id) => {
    const before = previous.get(id);
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
}

function validateFleetChanges(role, previousState, nextState) {
  if (role === 'Admin') return;
  const previous = indexById(previousState.fleets);
  nextState.fleets.forEach((fleet) => {
    const before = previous.get(fleet.id);
    if (!before && role === 'Viewer') ensure(false, 'Viewer may not create fleets');
    if (!before || !hasChanged(before, fleet)) return;
    const expectedFaction = role === 'Eventleiter / KUS' ? 'KUS' : role === 'Republic Navy / GAR' ? 'GAR' : null;
    ensure(expectedFaction && before.faction === expectedFaction && fleet.faction === expectedFaction, 'Role may only modify own faction fleets', { entity: 'fleet', id: fleet.id });
  });
}

function validateShipChanges(role, previousState, nextState) {
  if (role === 'Admin') return;
  const previous = indexById(previousState.ships);
  nextState.ships.forEach((ship) => {
    const before = previous.get(ship.id);
    if (!before && role === 'Viewer') ensure(false, 'Viewer may not create ships');
    if (!before || !hasChanged(before, ship)) return;
    const expectedFaction = role === 'Eventleiter / KUS' ? 'KUS' : role === 'Republic Navy / GAR' ? 'GAR' : null;
    ensure(expectedFaction && before.faction === expectedFaction && ship.faction === expectedFaction, 'Role may only modify own faction ships', { entity: 'ship', id: ship.id });
  });
}

function validateResourceChanges(role, previousState, nextState) {
  if (role === 'Admin') return;
  const previousGar = previousState.resources?.GAR || {};
  const nextGar = nextState.resources?.GAR || {};
  if (role === 'Republic Navy / GAR') {
    Object.keys(nextGar).forEach((key) => {
      ensure((nextGar[key] ?? 0) <= (previousGar[key] ?? 0), 'GAR role may not increase shared resources directly', { entity: 'resources', key });
    });
    return;
  }
  if (hasChanged(previousGar, nextGar)) {
    ensure(false, 'Only GAR role or Admin may affect GAR resources', { entity: 'resources' });
  }
}

function validateAdminOnlyBlocks(role, previousState, nextState) {
  if (role === 'Admin') return;
  ensure(!hasChanged(previousState.authUsers || [], nextState.authUsers || []), 'Only Admin may change login manager users', { entity: 'authUsers' });
  ensure(!hasChanged(previousState.importWarnings || [], nextState.importWarnings || []), 'Only Admin may change import warnings payload', { entity: 'importWarnings' });
}

export function validateNextCampaignState(role, previousState, nextState) {
  ensure(role !== 'Viewer', 'Viewer may not mutate campaign state');
  validatePlanetChanges(role, previousState, nextState);
  validateFleetChanges(role, previousState, nextState);
  validateShipChanges(role, previousState, nextState);
  validateResourceChanges(role, previousState, nextState);
  validateAdminOnlyBlocks(role, previousState, nextState);
}
