function normalizeText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[„“”"']/g, '')
    .toLowerCase();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compactWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function buildPlanetMatchers(planets = []) {
  return planets
    .map((planet) => ({
      id: planet.id,
      name: planet.name,
      normalized: normalizeText(planet.name)
    }))
    .filter((planet) => planet.id && planet.name && planet.normalized)
    .sort((a, b) => b.name.length - a.name.length);
}

function buildFleetMatchers(fleets = []) {
  return fleets
    .map((fleet) => ({
      id: fleet.id,
      name: fleet.name,
      normalized: normalizeText(fleet.name)
    }))
    .filter((fleet) => fleet.id && fleet.name && fleet.normalized)
    .sort((a, b) => b.name.length - a.name.length);
}

function extractActorName(content) {
  const prefixless = String(content || '').replace(/^\[Langstreckenfunk\]\s*/i, '');
  const colonIndex = prefixless.indexOf(':');
  if (colonIndex < 0) return '';
  const left = compactWhitespace(prefixless.slice(0, colonIndex));
  const matches = [...left.matchAll(/([A-ZÄÖÜ][a-zäöüß'’-]+(?:\s+[A-ZÄÖÜ][a-zäöüß'’-]+)+)\s*$/g)];
  if (matches.length) return compactWhitespace(matches[matches.length - 1][1]);
  const fallback = left.match(/([A-ZÄÖÜ][a-zäöüß'’-]+(?:\s+[A-ZÄÖÜ][a-zäöüß'’-]+){1,3})/g);
  return fallback?.length ? compactWhitespace(fallback[fallback.length - 1]) : '';
}

function detectCommandType(text) {
  const normalized = normalizeText(text);
  if (/\bverlager(n|en|e|t)\b/.test(normalized)) return 'verlagern';
  if (/\bverleg(en|e|t)\b/.test(normalized)) return 'verlegen';
  if (/\bauf meiner position\b/.test(normalized) || /\bauf position\b/.test(normalized)) return 'auf position';
  if (/\bsichern\b|\bubernehmen sie die sicherung\b/.test(normalized)) return 'sichern';
  return 'unknown';
}

function findPlanetMention(message, planets = []) {
  const normalizedMessage = normalizeText(message);
  const candidates = [];
  for (const planet of planets) {
    const pattern = new RegExp(`\\b${escapeRegExp(planet.normalized).replace(/\s+/g, '\\s+')}\\b`, 'i');
    const match = pattern.exec(normalizedMessage);
    if (!match) continue;
    const prefix = normalizedMessage.slice(Math.max(0, match.index - 40), match.index);
    let score = planet.name.length;
    if (/\b(nach|zu|zum|zur|richtung|raum von|position|auf|bei)\s*$/.test(prefix)) score += 100;
    if (/\b(in den raum von|im raum von)\s*$/.test(prefix)) score += 120;
    candidates.push({ planet, score, index: match.index });
  }
  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  return candidates[0]?.planet || null;
}

function addFleetMatch(results, fleet, seenIds) {
  if (!fleet?.id || seenIds.has(fleet.id)) return;
  seenIds.add(fleet.id);
  results.push(fleet);
}

function findFleetMentions(message, fleets = []) {
  const normalizedMessage = normalizeText(message);
  const results = [];
  const seenIds = new Set();

  for (const fleet of fleets) {
    const pattern = new RegExp(`\\b${escapeRegExp(fleet.normalized).replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (pattern.test(normalizedMessage)) addFleetMatch(results, fleet, seenIds);
  }

  const admiraltyListMatch = normalizedMessage.match(/admiralit[aä]tsflotte\s+([0-9,\sund]+)/i);
  if (admiraltyListMatch?.[1]) {
    for (const number of admiraltyListMatch[1].match(/\d+/g) || []) {
      const wanted = normalizeText(`Admiralitätsflotte ${number}`);
      const match = fleets.find((fleet) => fleet.normalized === wanted);
      if (match) addFleetMatch(results, match, seenIds);
    }
  }

  const compactPatternMatches = [
    ...normalizedMessage.matchAll(/\bsd\s+\d+(?:\.\d+)+\b/gi),
    ...normalizedMessage.matchAll(/\bschlacht division\s+\d+(?:\.\d+)+\b/gi),
    ...normalizedMessage.matchAll(/\btask force\s+[a-z0-9-]+\b/gi),
    ...normalizedMessage.matchAll(/\badmiralit[aä]tsflotte\s+\d+\b/gi)
  ];

  compactPatternMatches.forEach((entry) => {
    const match = fleets.find((fleet) => fleet.normalized === compactWhitespace(entry[0]));
    if (match) addFleetMatch(results, match, seenIds);
  });

  return results;
}

export function parseRadioCommandMessage(content, context = {}) {
  const message = String(content || '').trim();
  if (!message.startsWith('[Langstreckenfunk]')) {
    return {
      isRelevant: false,
      reason: 'missing_prefix',
      originalMessage: message,
      actorName: '',
      commandType: 'unknown',
      fleets: [],
      planet: null
    };
  }

  const actorName = extractActorName(message);
  const commandType = detectCommandType(message);
  const fleets = findFleetMentions(message, buildFleetMatchers(context.fleets || []));
  const planet = findPlanetMention(message, buildPlanetMatchers(context.planets || []));

  return {
    isRelevant: true,
    reason: '',
    originalMessage: message,
    actorName,
    commandType,
    fleets,
    planet
  };
}
