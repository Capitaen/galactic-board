import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const projectRoot = process.cwd();
const dbPath = path.join(projectRoot, 'server', 'data.sqlite');
const env = loadEnvFiles(projectRoot);
const webhookUrl = process.env.DISCORD_FLEET_WEBHOOK_URL || env.DISCORD_FLEET_WEBHOOK_URL || '';
const pollIntervalMs = Math.max(1000, Number(process.env.DISCORD_AUDIT_POLL_MS || env.DISCORD_AUDIT_POLL_MS || 5000) || 5000);
const supportedActions = ['fleet.jump.started', 'fleet.moved'];

if (!webhookUrl) {
  console.error('DISCORD_FLEET_WEBHOOK_URL is missing. Set it in your environment or .env file.');
  process.exit(1);
}

if (!fs.existsSync(dbPath)) {
  console.error(`SQLite database not found: ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);
const selectPendingEvents = db.prepare(`
  SELECT id, actor_username, action, payload_json, created_at
  FROM audit_log
  WHERE action IN (${supportedActions.map(() => '?').join(', ')})
    AND dispatched_at IS NULL
  ORDER BY created_at ASC
`);
const markDispatched = db.prepare(`
  UPDATE audit_log
  SET dispatched_at = ?
  WHERE id = ?
`);

console.log(`Audit dispatcher running, polling every ${pollIntervalMs} ms`);
let isPolling = false;

const stopWorker = () => {
  console.log('Audit dispatcher shutting down');
  try {
    db.close();
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', stopWorker);
process.on('SIGTERM', stopWorker);

setInterval(() => {
  void pollOnce();
}, pollIntervalMs);

void pollOnce();

async function pollOnce() {
  if (isPolling) return;
  isPolling = true;

  try {
    const events = selectPendingEvents.all(...supportedActions);
    for (const event of events) {
      try {
        const payload = safeJsonParse(event.payload_json);
        if (String(payload.faction || '').trim().toUpperCase() !== 'GAR') {
          continue;
        }
        const message = buildDiscordMessage(event, payload);
        await postToDiscord(webhookUrl, message);
        markDispatched.run(new Date().toISOString(), event.id);
        console.log(`Dispatched ${event.action} for fleet ${payload.fleetName || payload.fleetId || event.id}`);
      } catch (error) {
        console.error(`Failed to dispatch audit event ${event.id}`, error);
      }
    }
  } catch (error) {
    console.error('Audit dispatcher poll failed', error);
  } finally {
    isPolling = false;
  }
}

function loadEnvFiles(rootDir) {
  const merged = {};
  const candidates = [
    path.join(rootDir, '.env'),
    path.join(rootDir, 'server', '.env')
  ];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const parsed = parseEnvFile(fs.readFileSync(filePath, 'utf8'));
    Object.assign(merged, parsed);
  }

  return merged;
}

function parseEnvFile(contents) {
  const values = {};
  for (const rawLine of String(contents || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function safeJsonParse(rawJson) {
  try {
    return JSON.parse(rawJson || '{}');
  } catch {
    return {};
  }
}

function buildDiscordMessage(event, payload) {
  const fleetName = payload.fleetName || payload.fleetId || 'Unbekannter Verband';
  const faction = payload.faction || 'Unbekannte Fraktion';
  const fromPlanetName = payload.fromPlanetName || payload.fromPlanetId || 'Unbekannt';
  const toPlanetName = payload.toPlanetName || payload.toPlanetId || 'Unbekannt';
  const actorUsername = payload.actorUsername || event.actor_username || 'Unbekannt';
  const timestamp = event.created_at || new Date().toISOString();
  const title = event.action === 'fleet.jump.started' ? '🚀 Flottenverband im Hyperraumsprung' : '🛰️ Flottenverband verlegt';
  const description = event.action === 'fleet.moved'
    ? `**${fleetName}** in **${toPlanetName}** angekommen.`
    : `**${fleetName}** bewegt sich von **${fromPlanetName}** nach **${toPlanetName}** auf Anweisung von **${actorUsername}**.`;
  const fields = event.action === 'fleet.moved'
    ? [
        { name: 'Zeit', value: `<t:${Math.floor(new Date(timestamp).getTime() / 1000)}:F>`, inline: false }
      ]
    : [
        { name: 'Verband', value: fleetName, inline: true },
        { name: 'Fraktion', value: faction, inline: true },
        { name: 'Ausgeloest von', value: actorUsername, inline: true },
        { name: 'Von', value: fromPlanetName, inline: true },
        { name: 'Nach', value: toPlanetName, inline: true },
        { name: 'Zeit', value: `<t:${Math.floor(new Date(timestamp).getTime() / 1000)}:F>`, inline: false }
      ];

  return {
    username: 'Galactic Campaign Board',
    embeds: [
      {
        title,
        description,
        color: event.action === 'fleet.jump.started' ? 0x5865F2 : 0x2ECC71,
        fields,
        footer: {
          text: `Event: ${event.action}`
        },
        timestamp
      }
    ]
  };
}

async function postToDiscord(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Discord webhook failed (${response.status}): ${errorBody}`);
  }
}
