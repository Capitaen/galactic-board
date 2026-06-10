import {
  findRadioCommandPermissionByNormalizedName,
  hasRadioCommandLogEntry,
  insertRadioCommandLog,
  listUsers,
  readCampaignState,
  writeCampaignState
} from '../db.js';
import { getPlanetNameById, writeAuditLog } from '../audit.js';
import { parseRadioCommandMessage } from './radioCommandParser.js';

const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';
const SUPPORTED_PERMISSION_ROLES = new Set(['fleet_officer', 'staff_officer', 'faction_admin', 'admiralty']);

export function createDiscordRadioListener({
  db,
  getIo,
  getActorForSystem = () => ({ id: 'discord-radio', username: 'discord-radio', role: 'System' }),
  onCampaignChanged = () => {}
}) {
  let timer = null;
  let polling = false;

  async function pollOnce() {
    if (polling) return { ok: false, reason: 'busy' };
    polling = true;
    try {
      return await processDiscordMessages({
        db,
        getIo,
        actor: getActorForSystem(),
        onCampaignChanged
      });
    } finally {
      polling = false;
    }
  }

  function start() {
    const config = getDiscordRadioConfig();
    if (!config.enabled) return false;
    if (timer) clearInterval(timer);
    console.log(`Discord radio listener running, polling every ${config.pollMs} ms`);
    timer = setInterval(() => {
      void pollOnce().catch((error) => console.error('Discord radio poll failed', error));
    }, config.pollMs);
    void pollOnce().catch((error) => console.error('Discord radio initial poll failed', error));
    return true;
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, pollOnce };
}

export function getDiscordRadioConfig() {
  const botToken = String(process.env.DISCORD_BOT_TOKEN || '').trim();
  const channelId = String(process.env.DISCORD_RADIO_CHANNEL_ID || '').trim();
  const pollMs = Math.max(5000, Number(process.env.DISCORD_RADIO_POLL_MS || 15000) || 15000);
  return {
    enabled: Boolean(botToken && channelId),
    botToken,
    channelId,
    pollMs
  };
}

async function processDiscordMessages({ db, getIo, actor, onCampaignChanged }) {
  const config = getDiscordRadioConfig();
  if (!config.enabled) {
    return { ok: false, error: 'Discord listener disabled. Set DISCORD_BOT_TOKEN and DISCORD_RADIO_CHANNEL_ID.' };
  }

  const messages = await fetchDiscordMessages(config);
  const chronological = [...messages].reverse();
  let processed = 0;
  let accepted = 0;
  let rejected = 0;
  let relevant = 0;
  const debug = [];

  for (const message of chronological) {
    const result = await processSingleDiscordMessage({ db, message, actor, getIo, onCampaignChanged });
    if (result.debug) debug.push(result.debug);
    if (!result.processed) continue;
    relevant += 1;
    processed += 1;
    accepted += result.acceptedCount;
    rejected += result.rejectedCount;
  }

  return {
    ok: true,
    fetched: messages.length,
    relevant,
    processed,
    accepted,
    rejected,
    debug: debug.slice(-10)
  };
}

async function processSingleDiscordMessage({ db, message, actor, getIo, onCampaignChanged }) {
  const content = extractRadioMessageText(message);
  const { state: currentState, revision } = readCampaignState(db);
  const parsed = parseRadioCommandMessage(
    content,
    {
      planets: currentState.planets || [],
      fleets: currentState.fleets || []
    },
    {
      assumeRelevant: true
    }
  );

  if (!parsed.isRelevant) {
    return {
      processed: false,
      acceptedCount: 0,
      rejectedCount: 0,
      debug: {
        messageId: String(message?.id || ''),
        matched: false,
        preview: buildMessagePreview(content)
      }
    };
  }

  const authorFallbackNames = buildAuthorFallbackNames(message);
  const actorPermission = resolveActorPermission(db, parsed.actorName);
  const actorDisplayName = parsed.actorName || recoverActorNameFromContent(content) || '';
  const linkedUserMatches = actorPermission?.linkedUserId
    ? listUsers(db).find((user) => user.id === actorPermission.linkedUserId)
    : null;

  const commonPayload = {
    discordMessageId: String(message.id || ''),
    actorName: actorDisplayName,
    actorFallbackNames: authorFallbackNames,
    commandType: parsed.commandType,
    originalMessage: parsed.originalMessage,
    fleets: parsed.fleets.map((fleet) => ({ id: fleet.id, name: fleet.name })),
    planet: parsed.planet ? { id: parsed.planet.id, name: parsed.planet.name } : null
  };

  if (!actorDisplayName) {
    if (!hasRadioCommandLogEntry(db, message.id, null, null, 'rejected')) {
      persistRejectedRadioLog(db, actor, {
        discordMessageId: message.id,
        actorIngameName: '',
        commandType: parsed.commandType,
        originalMessage: parsed.originalMessage,
        reason: 'Befehlgeber konnte nicht erkannt werden.',
        payload: commonPayload
      });
    }
    return {
      processed: true,
      acceptedCount: 0,
      rejectedCount: 1,
      debug: buildProcessedDebug(message, parsed, 'rejected', 'actor_missing')
    };
  }

  if (!actorPermission || !SUPPORTED_PERMISSION_ROLES.has(actorPermission.permissionRole)) {
    if (!hasRadioCommandLogEntry(db, message.id, null, null, 'rejected')) {
      persistRejectedRadioLog(db, actor, {
        discordMessageId: message.id,
        actorIngameName: actorDisplayName,
        commandType: parsed.commandType,
        originalMessage: parsed.originalMessage,
        reason: 'Keine Berechtigung fuer diesen Funkbefehl gefunden.',
        payload: commonPayload
      });
    }
    return {
      processed: true,
      acceptedCount: 0,
      rejectedCount: 1,
      debug: buildProcessedDebug(message, parsed, 'rejected', 'permission_missing')
    };
  }

  if (!actorPermission.linkedUserId || !linkedUserMatches) {
    if (!hasRadioCommandLogEntry(db, message.id, null, null, 'rejected')) {
      persistRejectedRadioLog(db, actor, {
        discordMessageId: message.id,
        actorIngameName: actorDisplayName,
        matchedUserId: actorPermission.linkedUserId || null,
        matchedUsername: actorPermission.linkedUsername || null,
        commandType: parsed.commandType,
        originalMessage: parsed.originalMessage,
        reason: 'Verknuepfter Website-Login fehlt oder ist ungueltig.',
        payload: commonPayload
      });
    }
    return {
      processed: true,
      acceptedCount: 0,
      rejectedCount: 1,
      debug: buildProcessedDebug(message, parsed, 'rejected', 'linked_user_missing')
    };
  }

  if (!parsed.fleets.length) {
    if (!hasRadioCommandLogEntry(db, message.id, null, parsed.planet?.id || null, 'rejected')) {
      persistRejectedRadioLog(db, actor, {
        discordMessageId: message.id,
        actorIngameName: actorDisplayName,
        matchedUserId: actorPermission.linkedUserId,
        matchedUsername: actorPermission.linkedUsername,
        targetPlanetId: parsed.planet?.id || null,
        targetPlanetName: parsed.planet?.name || null,
        commandType: parsed.commandType,
        originalMessage: parsed.originalMessage,
        reason: 'Kein bekannter Flottenverband erkannt.',
        payload: commonPayload
      });
    }
    return {
      processed: true,
      acceptedCount: 0,
      rejectedCount: 1,
      debug: buildProcessedDebug(message, parsed, 'rejected', 'fleet_missing')
    };
  }

  if (!parsed.planet) {
    let rejectedCount = 0;
    parsed.fleets.forEach((fleet) => {
      if (hasRadioCommandLogEntry(db, message.id, fleet.id, null, 'rejected')) return;
      persistRejectedRadioLog(db, actor, {
        discordMessageId: message.id,
        actorIngameName: actorDisplayName,
        matchedUserId: actorPermission.linkedUserId,
        matchedUsername: actorPermission.linkedUsername,
        targetFleetId: fleet.id,
        targetFleetName: fleet.name,
        commandType: parsed.commandType,
        originalMessage: parsed.originalMessage,
        reason: 'Zielplanet fehlt oder ist unklar.',
        payload: commonPayload
      });
      rejectedCount += 1;
    });
    return {
      processed: true,
      acceptedCount: 0,
      rejectedCount,
      debug: buildProcessedDebug(message, parsed, 'rejected', 'planet_missing')
    };
  }

  const fleetPermissionIds = new Set((actorPermission.fleets || []).map((fleet) => String(fleet.fleetId || '')).filter(Boolean));
  const acceptedFleetIds = [];
  let acceptedCount = 0;
  let rejectedCount = 0;
  const nextState = JSON.parse(JSON.stringify(currentState));

  for (const fleetMatch of parsed.fleets) {
    const nextFleet = (nextState.fleets || []).find((fleet) => fleet.id === fleetMatch.id);
    if (!nextFleet) {
      if (!hasRadioCommandLogEntry(db, message.id, fleetMatch.id, parsed.planet.id, 'rejected')) {
        persistRejectedRadioLog(db, actor, {
          discordMessageId: message.id,
          actorIngameName: actorDisplayName,
          matchedUserId: actorPermission.linkedUserId,
          matchedUsername: actorPermission.linkedUsername,
          targetFleetId: fleetMatch.id,
          targetFleetName: fleetMatch.name,
          targetPlanetId: parsed.planet.id,
          targetPlanetName: parsed.planet.name,
          commandType: parsed.commandType,
          originalMessage: parsed.originalMessage,
          reason: 'Flottenverband nicht im aktuellen Kampagnenzustand vorhanden.',
          payload: commonPayload
        });
      }
      rejectedCount += 1;
      continue;
    }

    const canMoveAnyFleet = actorPermission.permissionRole !== 'fleet_officer';
    const canMoveFleet = canMoveAnyFleet || fleetPermissionIds.has(nextFleet.id);
    if (!canMoveFleet) {
      if (!hasRadioCommandLogEntry(db, message.id, nextFleet.id, parsed.planet.id, 'rejected')) {
        persistRejectedRadioLog(db, actor, {
          discordMessageId: message.id,
          actorIngameName: actorDisplayName,
          matchedUserId: actorPermission.linkedUserId,
          matchedUsername: actorPermission.linkedUsername,
          targetFleetId: nextFleet.id,
          targetFleetName: nextFleet.name,
          targetPlanetId: parsed.planet.id,
          targetPlanetName: parsed.planet.name,
          commandType: parsed.commandType,
          originalMessage: parsed.originalMessage,
          reason: 'Dieser Offizier darf den genannten Verband nicht bewegen.',
          payload: commonPayload
        });
      }
      rejectedCount += 1;
      continue;
    }

    if (hasRadioCommandLogEntry(db, message.id, nextFleet.id, parsed.planet.id, 'accepted')) continue;

    const previousPlanetId = String(nextFleet.locationPlanetId || nextFleet.planetId || '').trim();
    nextFleet.locationPlanetId = parsed.planet.id;
    nextFleet.planetId = parsed.planet.id;
    nextFleet.lastMovedBy = actorPermission.linkedUsername || actorDisplayName;
    nextFleet.lastMovedByUserId = actorPermission.linkedUserId;
    nextFleet.lastMovedAt = new Date().toISOString();
    nextFleet.lastMoveFromPlanetId = previousPlanetId || null;
    nextFleet.lastMoveToPlanetId = parsed.planet.id;

    insertRadioCommandLog(db, {
      discordMessageId: message.id,
      actorIngameName: actorDisplayName,
      matchedUserId: actorPermission.linkedUserId,
      matchedUsername: actorPermission.linkedUsername,
      targetFleetId: nextFleet.id,
      targetFleetName: nextFleet.name,
      targetPlanetId: parsed.planet.id,
      targetPlanetName: parsed.planet.name,
      commandType: parsed.commandType,
      status: 'accepted',
      reason: '',
      originalMessage: parsed.originalMessage,
      payload: {
        ...commonPayload,
        selectedFleetId: nextFleet.id,
        selectedFleetName: nextFleet.name
      }
    });

    writeAuditLog(db, {
      actorUserId: actorPermission.linkedUserId,
      actorUsername: actorPermission.linkedUsername || actorDisplayName,
      actorRole: actorPermission.permissionRole,
      action: 'fleet.moved',
      entityType: 'fleet',
      entityId: nextFleet.id,
      payload: {
        fleetId: nextFleet.id,
        fleetName: nextFleet.name || nextFleet.id,
        faction: nextFleet.faction || '',
        fromPlanetId: previousPlanetId || null,
        fromPlanetName: getPlanetNameById(nextState, previousPlanetId || null),
        toPlanetId: parsed.planet.id,
        toPlanetName: parsed.planet.name,
        startedAt: nextFleet.lastMovedAt,
        arrivesAt: null,
        routePlanetIds: [],
        source: 'discord_radio',
        actorUsername: actorPermission.linkedUsername || actorDisplayName,
        actorUserId: actorPermission.linkedUserId,
        discordMessageId: String(message.id || '')
      }
    });

    writeAuditLog(db, {
      actorUserId: actorPermission.linkedUserId,
      actorUsername: actorPermission.linkedUsername || actorDisplayName,
      actorRole: actorPermission.permissionRole,
      action: 'radio.command.accepted',
      entityType: 'fleet',
      entityId: nextFleet.id,
      payload: {
        source: 'discord_radio',
        discordMessageId: String(message.id || ''),
        actorIngameName: actorDisplayName,
        targetFleetId: nextFleet.id,
        targetFleetName: nextFleet.name,
        targetPlanetId: parsed.planet.id,
        targetPlanetName: parsed.planet.name,
        commandType: parsed.commandType,
        originalMessage: parsed.originalMessage,
        status: 'accepted'
      }
    });

    acceptedCount += 1;
    acceptedFleetIds.push(nextFleet.id);
  }

  if (acceptedFleetIds.length) {
    const nextRevision = revision + 1;
    const updatedAt = writeCampaignState(db, nextState, nextRevision);
    const io = typeof getIo === 'function' ? getIo() : null;
    io?.emit?.('campaign:state-changed', {
      revision: nextRevision,
      updatedAt,
      changedKeys: ['fleets'],
      actor: {
        id: actorPermission.linkedUserId,
        username: actorPermission.linkedUsername || actorDisplayName,
        role: actorPermission.permissionRole
      }
    });
    onCampaignChanged({
      revision: nextRevision,
      updatedAt,
      acceptedFleetIds
    });
  }

  return {
    processed: true,
    acceptedCount,
    rejectedCount,
    debug: buildProcessedDebug(
      message,
      parsed,
      acceptedCount > 0 ? 'accepted' : 'rejected',
      acceptedCount > 0 ? 'fleet_moved' : 'no_changes'
    )
  };
}

function persistRejectedRadioLog(db, actor, input) {
  insertRadioCommandLog(db, {
    ...input,
    status: 'rejected'
  });
  writeAuditLog(db, {
    actorUserId: input.matchedUserId || actor.id,
    actorUsername: input.matchedUsername || input.actorIngameName || actor.username,
    actorRole: 'radio_command',
    action: 'radio.command.rejected',
    entityType: 'fleet',
    entityId: input.targetFleetId || null,
    payload: {
      source: 'discord_radio',
      discordMessageId: input.discordMessageId,
      actorIngameName: input.actorIngameName,
      targetFleetId: input.targetFleetId || null,
      targetFleetName: input.targetFleetName || null,
      targetPlanetId: input.targetPlanetId || null,
      targetPlanetName: input.targetPlanetName || null,
      commandType: input.commandType || null,
      originalMessage: input.originalMessage,
      status: 'rejected',
      reason: input.reason || ''
    }
  });
}

async function fetchDiscordMessages(config) {
  const response = await fetch(`${DISCORD_API_BASE_URL}/channels/${config.channelId}/messages?limit=25`, {
    headers: {
      Authorization: `Bot ${config.botToken}`
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord API failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

function extractRadioMessageText(message) {
  const textParts = [];
  const pushText = (value) => {
    const text = String(value || '').trim();
    if (text) textParts.push(text);
  };

  pushText(message?.content);

  for (const embed of Array.isArray(message?.embeds) ? message.embeds : []) {
    pushText(embed?.title);
    pushText(embed?.description);
    for (const field of Array.isArray(embed?.fields) ? embed.fields : []) {
      pushText(field?.name);
      pushText(field?.value);
    }
  }

  return textParts.join('\n').trim();
}

function stripAnsiSequences(value) {
  return String(value || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function recoverActorNameFromContent(content) {
  const lines = stripAnsiSequences(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const candidate = recoverActorNameFromLine(line);
    if (candidate) return candidate;
  }

  return recoverActorNameFromLine(String(content || '').trim());
}

function recoverActorNameFromLine(line) {
  const normalized = stripAnsiSequences(line)
    .replace(/^\[Langstreckenfunk\]\s*/i, '')
    .replace(/[_*`~|>()[\]{}]/g, ' ')
    .trim();

  const directOrderMatch = normalized.match(
    /(?:^|\s)(?:[A-Z]{1,8}(?:\/[A-Z]{1,8})+\s+)*(?:[A-Z]{2,8}\s+)*([A-ZÄÖÜ][\p{L}'’-]+(?:\s+[A-ZÄÖÜ][\p{L}'’-]+){1,3})\s*:\s*an\b/u
  );
  if (directOrderMatch?.[1]) return directOrderMatch[1].trim();

  const colonIndex = normalized.indexOf(':');
  if (colonIndex < 0) return '';

  const leftSide = normalized.slice(0, colonIndex)
    .replace(/\b[A-Z]{1,8}(?:\/[A-Z]{1,8})+\b/g, ' ')
    .replace(/\b[A-Z]{2,8}\b/g, ' ')
    .replace(/\b\d+(?:th|st|nd|rd)?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const multiWordMatch = leftSide.match(/([A-ZÄÖÜ][\p{L}'’-]+(?:\s+[A-ZÄÖÜ][\p{L}'’-]+){1,3})$/u);
  if (multiWordMatch?.[1]) return multiWordMatch[1].trim();


  return '';
}

function buildMessagePreview(content) {
  return String(content || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function buildProcessedDebug(message, parsed, status, reason) {
  const content = extractRadioMessageText(message);
  const recoveredActorName = recoverActorNameFromContent(content);
  const authorFallbackNames = buildAuthorFallbackNames(message);
  const rawContent = String(message?.content || '');
  const embedSummaries = Array.isArray(message?.embeds)
    ? message.embeds.map((embed, index) => ({
        index,
        title: String(embed?.title || ''),
        description: String(embed?.description || ''),
        fieldCount: Array.isArray(embed?.fields) ? embed.fields.length : 0
      }))
    : [];
  return {
    messageId: String(message?.id || ''),
    matched: true,
    status,
    reason,
    actorName: parsed.actorName || recoveredActorName || authorFallbackNames[0] || '',
    parserActorName: parsed.actorName || '',
    recoveredActorName: recoveredActorName || '',
    authorFallbackNames,
    fleetNames: parsed.fleets.map((fleet) => fleet.name),
    planetName: parsed.planet?.name || '',
    preview: buildMessagePreview(parsed.originalMessage),
    contentPreview: buildMessagePreview(content),
    rawContentPreview: buildMessagePreview(rawContent),
    rawContentLength: rawContent.length,
    contentLength: content.length,
    lineCount: String(content || '').split(/\r?\n/).filter(Boolean).length,
    embedSummaries
  };
}

function buildAuthorFallbackNames(message) {
  const values = [
    message?.member?.nick,
    message?.author?.global_name,
    message?.author?.display_name,
    message?.author?.username
  ];
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function resolveActorPermission(db, parsedActorName) {
  const candidates = [
    parsedActorName
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const permission = findRadioCommandPermissionByNormalizedName(db, candidate);
    if (permission) return permission;
  }

  return null;
}
