function normalizeText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[â€žâ€œâ€"']/g, '')
    .toLowerCase();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compactWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripLeadingDiscordFormatting(value) {
  return String(value || '')
    .replace(/^[\s\u200B-\u200D\uFEFF]+/g, '')
    .replace(/^(?:>+\s*)+/gm, '')
    .trim();
}

function stripRadioPrefix(value) {
  return stripLeadingDiscordFormatting(value).replace(/^\[Langstreckenfunk\]\s*/i, '');
}

function looksLikeRadioPrefix(value) {
  const normalized = stripLeadingDiscordFormatting(value);
  return /^\[Langstreckenfunk\]\b/i.test(normalized) || /\blangstreckenfunk\b/i.test(normalized);
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
  const prefixless = stripRadioPrefix(content);
  const labeledPatterns = [
    /\b(?:von|ausgelost von|ausgelöst von|befehlgeber|kommandant|sender)\s*[:\-]\s*([^\n|]+)/i,
    /\b(?:von|ausgelost von|ausgelöst von|befehlgeber|kommandant|sender)\s+([A-ZÄÖÜ][^\n|]{2,80})/i
  ];

  for (const pattern of labeledPatterns) {
    const match = prefixless.match(pattern);
    if (!match?.[1]) continue;
    const candidate = compactWhitespace(match[1].split(/(?:\s{2,}|,|;)/)[0]);
    if (candidate) return candidate;
  }

  const colonIndex = prefixless.indexOf(':');
  if (colonIndex < 0) return '';
  const left = compactWhitespace(prefixless.slice(0, colonIndex));
  const matches = [...left.matchAll(/([A-ZÃ„Ã–Ãœ][a-zÃ¤Ã¶Ã¼ÃŸ'â€™-]+(?:\s+[A-ZÃ„Ã–Ãœ][a-zÃ¤Ã¶Ã¼ÃŸ'â€™-]+)+)\s*$/g)];
  if (matches.length) return compactWhitespace(matches[matches.length - 1][1]);
  const fallback = left.match(/([A-ZÃ„Ã–Ãœ][a-zÃ¤Ã¶Ã¼ÃŸ'â€™-]+(?:\s+[A-ZÃ„Ã–Ãœ][a-zÃ¤Ã¶Ã¼ÃŸ'â€™-]+){1,3})/g);
  if (fallback?.length) return compactWhitespace(fallback[fallback.length - 1]);
  const singleWordMatch = left.match(/([A-ZÃ„Ã–Ãœ][a-zÃ¤Ã¶Ã¼ÃŸ'â€™-]{2,})\s*$/);
  return singleWordMatch?.[1] ? compactWhitespace(singleWordMatch[1]) : '';
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

  const admiraltyListMatch = normalizedMessage.match(/admiralit[aÃ¤]tsflotte\s+([0-9,\sund]+)/i);
  if (admiraltyListMatch?.[1]) {
    for (const number of admiraltyListMatch[1].match(/\d+/g) || []) {
      const wanted = normalizeText(`AdmiralitÃ¤tsflotte ${number}`);
      const match = fleets.find((fleet) => fleet.normalized === wanted);
      if (match) addFleetMatch(results, match, seenIds);
    }
  }

  const compactPatternMatches = [
    ...normalizedMessage.matchAll(/\bsd\s+\d+(?:\.\d+)+\b/gi),
    ...normalizedMessage.matchAll(/\bschlacht division\s+\d+(?:\.\d+)+\b/gi),
    ...normalizedMessage.matchAll(/\btask force\s+[a-z0-9-]+\b/gi),
    ...normalizedMessage.matchAll(/\badmiralit[aÃ¤]tsflotte\s+\d+\b/gi)
  ];

  compactPatternMatches.forEach((entry) => {
    const match = fleets.find((fleet) => fleet.normalized === compactWhitespace(entry[0]));
    if (match) addFleetMatch(results, match, seenIds);
  });

  return results;
}

export function parseRadioCommandMessage(content, context = {}, options = {}) {
  const rawMessage = String(content || '');
  const message = stripLeadingDiscordFormatting(rawMessage);
  const fleets = findFleetMentions(message, buildFleetMatchers(context.fleets || []));
  const planet = findPlanetMention(message, buildPlanetMatchers(context.planets || []));
  const hasPrefix = looksLikeRadioPrefix(message);
  const assumeRelevant = Boolean(options.assumeRelevant);

  if (!hasPrefix && !assumeRelevant && !fleets.length && !planet) {
    return {
      isRelevant: false,
      reason: 'missing_prefix',
      originalMessage: compactWhitespace(rawMessage),
      actorName: '',
      commandType: 'unknown',
      fleets,
      planet
    };
  }

  const actorName = extractActorName(message);
  const commandType = detectCommandType(message);

  return {
    isRelevant: true,
    reason: hasPrefix ? '' : 'inferred_command',
    originalMessage: message,
    actorName,
    commandType,
    fleets,
    planet
  };
}
