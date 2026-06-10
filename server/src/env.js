import fs from 'node:fs';
import path from 'node:path';

export function parseEnvFile(contents) {
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

export function loadEnvFiles(rootDir = process.cwd()) {
  const merged = {};
  const candidates = [
    path.join(rootDir, '.env'),
    path.join(rootDir, 'server', '.env')
  ];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    Object.assign(merged, parseEnvFile(fs.readFileSync(filePath, 'utf8')));
  }

  return merged;
}

export function applyEnvFiles(rootDir = process.cwd()) {
  const envValues = loadEnvFiles(rootDir);
  Object.entries(envValues).forEach(([key, value]) => {
    if (!(key in process.env)) process.env[key] = value;
  });
  return envValues;
}
