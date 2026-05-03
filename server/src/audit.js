import crypto from 'node:crypto';

export function writeAuditLog(db, {
  actorUserId,
  actorUsername,
  actorRole,
  action,
  entityType,
  entityId,
  payload
}) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO audit_log (
      id,
      actor_user_id,
      actor_username,
      actor_role,
      action,
      entity_type,
      entity_id,
      payload_json,
      created_at,
      dispatched_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(
    id,
    actorUserId || null,
    actorUsername || null,
    actorRole || null,
    action,
    entityType || null,
    entityId || null,
    JSON.stringify(payload || {}),
    createdAt
  );

  return { id, createdAt };
}

export function getPlanetNameById(state, planetId) {
  const planets = Array.isArray(state?.planets) ? state.planets : [];
  const planet = planets.find((entry) => entry.id === planetId);
  return planet?.name || planetId || 'Unbekannt';
}

export function getFleetPlanetId(fleet) {
  const locationPlanetId = String(fleet?.locationPlanetId || '').trim();
  if (locationPlanetId) return locationPlanetId;
  const planetId = String(fleet?.planetId || '').trim();
  return planetId || '';
}

export function getFleetMotionByFleetId(state, fleetId) {
  const motions = Array.isArray(state?.fleetMotions) ? state.fleetMotions : [];
  return motions.find((motion) => String(motion?.fleetId || '').trim() === fleetId) || null;
}

export function getFleetMotionStartedAtIso(motion, fallbackIso = new Date().toISOString()) {
  const startedAtMs = Number(motion?.startedAtMs);
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) return fallbackIso;
  return new Date(startedAtMs).toISOString();
}

export function getFleetMotionArrivalIso(motion) {
  const startedAtMs = Number(motion?.startedAtMs);
  const durationMs = Number(motion?.durationMs);
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0 || !Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }
  return new Date(startedAtMs + durationMs).toISOString();
}
