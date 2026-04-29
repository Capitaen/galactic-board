import fs from 'node:fs';
import path from 'node:path';

function findIndexHtml(projectRoot) {
  const candidates = [
    path.join(projectRoot, 'index.html'),
    path.join(projectRoot, 'public', 'index.html')
  ];

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) return filePath;
  }

  throw new Error('index.html not found in project root or public folder');
}

function extractObjectLiteral(source, startIndex) {
  const firstBrace = source.indexOf('{', startIndex);
  if (firstBrace === -1) {
    throw new Error('DEFAULT_DATA object start not found');
  }

  let depth = 0;
  let inString = false;
  let stringQuote = null;
  let escaped = false;

  for (let i = firstBrace; i < source.length; i++) {
    const char = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === stringQuote) {
        inString = false;
        stringQuote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      inString = true;
      stringQuote = char;
      continue;
    }

    if (char === '{') depth++;
    if (char === '}') depth--;

    if (depth === 0) {
      return source.slice(firstBrace, i + 1);
    }
  }

  throw new Error('DEFAULT_DATA object end not found');
}

export function extractDefaultData(projectRoot) {
  const indexPath = findIndexHtml(projectRoot);
  const source = fs.readFileSync(indexPath, 'utf8');

  const marker = 'const DEFAULT_DATA =';
  const markerIndex = source.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error('DEFAULT_DATA marker not found in index.html');
  }

  const objectLiteral = extractObjectLiteral(source, markerIndex + marker.length);

  try {
    return Function(`"use strict"; return (${objectLiteral});`)();
  } catch (error) {
    throw new Error(`Failed to parse DEFAULT_DATA from index.html: ${error.message}`);
  }
}