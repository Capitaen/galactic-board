import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer } from 'node:https';
import { applyEnvFiles } from './env.js';

const projectRoot = process.cwd();
applyEnvFiles(projectRoot);

const app = express();
app.set('trust proxy', true);

const sslOptions = {
  key: fs.readFileSync('C:/Users/Administrator/galactic-campaign/privkey.pem'),
  cert: fs.readFileSync('C:/Users/Administrator/galactic-campaign/fullchain.pem')
};

const server = createServer(sslOptions, app);
const OPS_PORT = Number(process.env.OPS_CONSOLE_PORT || 4443);
const OPS_COOKIE_NAME = 'gcb_ops_session';
const OPS_USERNAME = String(process.env.OPS_CONSOLE_USERNAME || 'opsadmin').trim();
const OPS_PASSWORD = String(process.env.OPS_CONSOLE_PASSWORD || 'change-me-now').trim();
const sessions = new Map();
const jobs = [];
const recentJobs = [];
let nextJobId = 1;
let activeJob = null;

const ALLOWED_PREFIXES = [
  'git pull',
  'git status',
  'git rev-parse',
  'pm2 restart galactic',
  'pm2 restart audit-dispatch',
  'pm2 save',
  'pm2 status',
  'pm2 show galactic',
  'pm2 show audit-dispatch',
  'pm2 jlist',
  'curl.exe -k',
  'Get-Content ',
  'Select-String ',
  'Get-NetTCPConnection ',
  'Get-Process ',
  'Resolve-DnsName ',
  'Test-NetConnection ',
  'Start-Sleep '
];

const PRESETS = [
  {
    id: 'deploy_galactic',
    label: 'Galactic Deploy',
    description: 'Git pull, galactic restart, pm2 save',
    commands: [
      'git pull',
      'pm2 restart galactic',
      'pm2 save'
    ]
  },
  {
    id: 'deploy_all',
    label: 'Galactic + Audit Deploy',
    description: 'Git pull, beide PM2-Apps restarten, pm2 save',
    commands: [
      'git pull',
      'pm2 restart galactic',
      'pm2 restart audit-dispatch',
      'pm2 save'
    ]
  },
  {
    id: 'pm2_status',
    label: 'PM2 Status',
    description: 'Zeigt Status und Details der laufenden Prozesse',
    commands: [
      'pm2 status',
      'pm2 show galactic',
      'pm2 show audit-dispatch'
    ]
  },
  {
    id: 'port_443_check',
    label: 'Port 443 Check',
    description: 'Prüft Listener und Prozess auf Port 443',
    commands: [
      'Get-NetTCPConnection -LocalPort 443 -State Listen',
      '$pid443 = (Get-NetTCPConnection -LocalPort 443 -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess); if ($pid443) { Get-Process -Id $pid443 | Select-Object Id,ProcessName,Path }'
    ]
  },
  {
    id: 'reload_route_check',
    label: 'Reload Route Check',
    description: 'Prüft lokale Reload-Routen des galactic-Servers',
    commands: [
      'curl.exe -k https://127.0.0.1:443/api/server-reload-status',
      'curl.exe -k https://127.0.0.1:443/api/admin/server-reload-status'
    ]
  },
  {
    id: 'galactic_logs',
    label: 'Galactic Logs',
    description: 'Liest die letzten galactic Logs',
    commands: [
      'Get-Content C:\\Users\\Administrator\\.pm2\\logs\\galactic-out.log -Tail 80',
      'Get-Content C:\\Users\\Administrator\\.pm2\\logs\\galactic-error.log -Tail 80'
    ]
  }
];

function htmlEscape(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function makeOpsPage() {
  const presetCards = PRESETS.map((preset) => `
    <button class="preset-card" data-preset-id="${htmlEscape(preset.id)}">
      <strong>${htmlEscape(preset.label)}</strong>
      <span>${htmlEscape(preset.description)}</span>
    </button>
  `).join('');

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Galactic Ops Console</title>
  <style>
    :root {
      --bg:#07101a;
      --panel:#0e1a26;
      --panel-2:#132435;
      --line:rgba(131,220,255,.18);
      --text:#eef8ff;
      --muted:#9eb4c5;
      --accent:#56cfff;
      --accent-2:#7ef0ff;
      --danger:#ff7f7f;
      --ok:#79e8ae;
    }
    * { box-sizing:border-box; }
    body {
      margin:0;
      font-family:"Segoe UI", Arial, sans-serif;
      background:
        radial-gradient(circle at top, rgba(73,174,255,.14), transparent 28%),
        linear-gradient(180deg, #050b12, var(--bg));
      color:var(--text);
      min-height:100vh;
    }
    .shell {
      max-width:1200px;
      margin:0 auto;
      padding:24px;
      display:grid;
      gap:20px;
    }
    .hero, .panel {
      border:1px solid var(--line);
      border-radius:22px;
      background:linear-gradient(180deg, rgba(13,24,37,.96), rgba(8,15,24,.98));
      box-shadow:0 18px 44px rgba(0,0,0,.28), inset 0 0 0 1px rgba(255,255,255,.02);
    }
    .hero { padding:24px; }
    .hero h1 { margin:0 0 8px; font-size:30px; letter-spacing:.06em; }
    .hero p { margin:0; color:var(--muted); line-height:1.5; }
    .hero-status { margin-top:14px; color:var(--accent-2); font-size:14px; letter-spacing:.12em; text-transform:uppercase; }
    .grid { display:grid; gap:20px; grid-template-columns:1.1fr .9fr; }
    .panel { padding:18px; }
    .panel h2 { margin:0 0 14px; font-size:18px; letter-spacing:.06em; }
    .preset-grid {
      display:grid;
      grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));
      gap:12px;
    }
    .preset-card, .action-btn {
      border:1px solid rgba(130,219,255,.16);
      background:linear-gradient(180deg, rgba(21,37,54,.96), rgba(11,21,32,.98));
      color:var(--text);
      border-radius:16px;
      padding:14px 16px;
      text-align:left;
      cursor:pointer;
    }
    .preset-card strong, .action-btn strong { display:block; margin-bottom:6px; }
    .preset-card span, .help { color:var(--muted); font-size:13px; line-height:1.45; }
    .preset-card:hover, .action-btn:hover { border-color:rgba(126,240,255,.38); transform:translateY(-1px); }
    .custom-box { display:grid; gap:12px; }
    textarea, input {
      width:100%;
      border-radius:14px;
      border:1px solid rgba(128,217,255,.18);
      background:rgba(5,10,17,.92);
      color:var(--text);
      padding:14px;
      font:inherit;
    }
    textarea { min-height:160px; resize:vertical; }
    .toolbar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
    .action-btn.primary {
      background:linear-gradient(180deg, rgba(58,149,255,.98), rgba(38,111,204,.98));
      border-color:rgba(126,240,255,.24);
    }
    .action-btn.secondary {
      background:linear-gradient(180deg, rgba(18,31,45,.98), rgba(10,17,27,.98));
    }
    .action-btn.logout {
      margin-left:auto;
    }
    .status-line {
      padding:12px 14px;
      border-radius:14px;
      border:1px solid rgba(128,217,255,.12);
      background:rgba(9,17,27,.86);
      color:var(--muted);
      min-height:48px;
    }
    .status-line.ok { color:var(--ok); }
    .status-line.error { color:var(--danger); }
    .job-list {
      display:grid;
      gap:10px;
      max-height:240px;
      overflow:auto;
    }
    .job-card {
      border:1px solid rgba(128,217,255,.12);
      border-radius:14px;
      background:rgba(8,16,25,.88);
      padding:12px;
    }
    .job-meta { color:var(--muted); font-size:12px; margin-bottom:8px; }
    .console {
      white-space:pre-wrap;
      font-family:Consolas, monospace;
      background:#04080d;
      border:1px solid rgba(128,217,255,.1);
      border-radius:14px;
      padding:14px;
      min-height:320px;
      max-height:620px;
      overflow:auto;
      color:#d9f6ff;
    }
    .login-wrap {
      min-height:100vh;
      display:grid;
      place-items:center;
      padding:20px;
    }
    .login-card {
      width:min(460px, 92vw);
      padding:24px;
      border-radius:22px;
      border:1px solid var(--line);
      background:linear-gradient(180deg, rgba(13,24,37,.96), rgba(8,15,24,.98));
    }
    .login-card h1 { margin:0 0 8px; font-size:24px; }
    .login-card p { margin:0 0 16px; color:var(--muted); }
    @media (max-width: 900px) {
      .grid { grid-template-columns:1fr; }
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
    const presets = ${JSON.stringify(PRESETS)};
    let appState = {
      authenticated: false,
      statusType: 'info',
      statusText: 'Bereit.',
      jobs: [],
      activeJobId: '',
      activeOutput: '',
      customCommand: 'cd C:\\\\Users\\\\Administrator\\\\galactic-board\\ngit pull\\npm2 restart galactic\\npm2 save'
    };
    let pollTimer = 0;

    function escapeHtml(value) {
      return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
    }

    function setStatus(text, type = 'info') {
      appState.statusText = text;
      appState.statusType = type;
      render();
    }

    async function api(path, options = {}) {
      const response = await fetch(path, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
      });
      const text = await response.text();
      let payload = {};
      try { payload = text ? JSON.parse(text) : {}; } catch { payload = { error: text }; }
      if (!response.ok) throw new Error(payload.error || ('HTTP ' + response.status));
      return payload;
    }

    function schedulePoll() {
      window.clearTimeout(pollTimer);
      pollTimer = window.setTimeout(loadJobs, 2500);
    }

    async function loadJobs() {
      try {
        const payload = await api('/api/jobs');
        appState.authenticated = true;
        appState.jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
        const active = appState.jobs.find((job) => job.status === 'running' || job.status === 'queued') || appState.jobs[0] || null;
        appState.activeJobId = active?.id || '';
        appState.activeOutput = active?.output || '';
        render();
        if (appState.jobs.some((job) => job.status === 'running' || job.status === 'queued')) schedulePoll();
      } catch (error) {
        appState.authenticated = false;
        render();
      }
    }

    async function login(event) {
      event.preventDefault();
      const username = document.getElementById('loginUser').value.trim();
      const password = document.getElementById('loginPass').value;
      try {
        await api('/api/login', {
          method: 'POST',
          body: JSON.stringify({ username, password })
        });
        appState.authenticated = true;
        setStatus('Ops-Konsole verbunden.', 'ok');
        await loadJobs();
      } catch (error) {
        setStatus('Login fehlgeschlagen: ' + error.message, 'error');
      }
    }

    async function logout() {
      try { await api('/api/logout', { method: 'POST' }); } catch {}
      appState.authenticated = false;
      window.clearTimeout(pollTimer);
      render();
    }

    async function runPreset(id) {
      const preset = presets.find((entry) => entry.id === id);
      if (!preset) return;
      try {
        const payload = await api('/api/run-preset', {
          method: 'POST',
          body: JSON.stringify({ presetId: id })
        });
        appState.activeJobId = payload.job?.id || '';
        setStatus('Preset in Warteschlange gelegt: ' + preset.label, 'ok');
        await loadJobs();
      } catch (error) {
        setStatus('Preset fehlgeschlagen: ' + error.message, 'error');
      }
    }

    async function runCustom() {
      const commandText = document.getElementById('customCommand').value;
      appState.customCommand = commandText;
      try {
        const payload = await api('/api/run-custom', {
          method: 'POST',
          body: JSON.stringify({ commandText })
        });
        appState.activeJobId = payload.job?.id || '';
        setStatus('Eigener Befehl in Warteschlange gelegt.', 'ok');
        await loadJobs();
      } catch (error) {
        setStatus('Eigener Befehl abgelehnt: ' + error.message, 'error');
      }
    }

    function selectJob(id) {
      appState.activeJobId = id;
      const active = appState.jobs.find((job) => job.id === id);
      appState.activeOutput = active?.output || '';
      render();
    }

    function renderLogin() {
      return \`
        <div class="login-wrap">
          <form class="login-card" onsubmit="login(event)">
            <h1>Galactic Ops Console</h1>
            <p>Separater Wartungszugang für Deploys, Diagnosen und sichere Shell-Kommandos.</p>
            <input id="loginUser" placeholder="Benutzername" autocomplete="username" value="opsadmin">
            <div style="height:10px"></div>
            <input id="loginPass" type="password" placeholder="Passwort" autocomplete="current-password">
            <div style="height:14px"></div>
            <button class="action-btn primary" type="submit"><strong>Einloggen</strong><span>Ops-Konsole öffnen</span></button>
            <div style="height:12px"></div>
            <div class="status-line \${appState.statusType === 'error' ? 'error' : appState.statusType === 'ok' ? 'ok' : ''}">\${escapeHtml(appState.statusText)}</div>
          </form>
        </div>
      \`;
    }

    function renderApp() {
      const activeJob = appState.jobs.find((job) => job.id === appState.activeJobId) || appState.jobs[0] || null;
      const output = activeJob?.output || appState.activeOutput || 'Noch keine Ausgabe.';
      return \`
        <div class="shell">
          <div class="hero">
            <h1>Galactic Ops Console</h1>
            <p>Separater Admin-Prozess für Deploys und Diagnosen. Diese Seite selbst läuft unabhängig von der eigentlichen Galactic-Website und bietet nur eingeschränkte, allowlist-basierte Befehle.</p>
            <div class="hero-status">Port ${OPS_PORT} • Prozess bleibt beim galactic-Restart online</div>
          </div>
          <div class="grid">
            <div class="panel">
              <div class="toolbar">
                <h2 style="margin:0">Preset-Aktionen</h2>
                <button class="action-btn secondary logout" type="button" onclick="logout()"><strong>Logout</strong><span>Sitzung beenden</span></button>
              </div>
              <div class="preset-grid">${presetCards}</div>
              <div style="height:16px"></div>
              <div class="custom-box">
                <h2>Eigene Analyse-Kommandos</h2>
                <div class="help">Erlaubt sind nur sichere Read-/Deploy-Kommandos ohne Pipes, Redirects oder Dateischreibzugriffe. Ein optionales <code>cd C:\\Users\\Administrator\\galactic-board</code> am Anfang wird ignoriert.</div>
                <textarea id="customCommand" spellcheck="false">${htmlEscape(appState.customCommand)}</textarea>
                <div class="toolbar">
                  <button class="action-btn primary" type="button" onclick="runCustom()"><strong>Kommandos ausführen</strong><span>Zeilenweise, nacheinander</span></button>
                  <button class="action-btn secondary" type="button" onclick="loadJobs()"><strong>Aktualisieren</strong><span>Jobs neu laden</span></button>
                </div>
                <div class="status-line ${appState.statusType === 'error' ? 'error' : appState.statusType === 'ok' ? 'ok' : ''}">${htmlEscape(appState.statusText)}</div>
              </div>
            </div>
            <div class="panel">
              <h2>Job-Verlauf</h2>
              <div class="job-list">
                ${(appState.jobs.length ? appState.jobs : [{ id:'', status:'idle', label:'Noch keine Jobs', createdAt:'', output:'' }]).map((job) => \`
                  <button class="job-card" type="button" onclick="selectJob('${htmlEscape(job.id)}')">
                    <div><strong>\${escapeHtml(job.label || 'Unbenannter Job')}</strong></div>
                    <div class="job-meta">#\${escapeHtml(job.id || '—')} • \${escapeHtml(job.status || 'idle')} • \${escapeHtml(job.createdAt || '')}</div>
                  </button>
                \`).join('')}
              </div>
            </div>
          </div>
          <div class="panel">
            <h2>Ausgabe</h2>
            <div class="console">${htmlEscape(output)}</div>
          </div>
        </div>
      \`;
    }

    function attachEvents() {
      document.querySelectorAll('[data-preset-id]').forEach((button) => {
        button.addEventListener('click', () => runPreset(button.dataset.presetId));
      });
    }

    function render() {
      const root = document.getElementById('app');
      root.innerHTML = appState.authenticated ? renderApp() : renderLogin();
      if (appState.authenticated) attachEvents();
    }

    window.login = login;
    window.logout = logout;
    window.runCustom = runCustom;
    window.selectJob = selectJob;
    render();
    loadJobs();
  </script>
</body>
</html>`;
}

function normalizeCommandLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return '';
  if (/^cd\s+/i.test(trimmed)) {
    const target = trimmed.slice(2).trim().replace(/^"+|"+$/g, '');
    if (target.toLowerCase() === projectRoot.toLowerCase()) return '';
    throw new Error('Nur das Projektverzeichnis darf als cd-Ziel verwendet werden.');
  }
  if (/[\r\n]/.test(trimmed)) throw new Error('Mehrzeilige Einzelkommandos sind nicht erlaubt.');
  if (/[|&;><`]/.test(trimmed)) throw new Error('Pipes, Redirects und Shell-Verkettungen sind nicht erlaubt.');
  if (!ALLOWED_PREFIXES.some((prefix) => trimmed.toLowerCase().startsWith(prefix.toLowerCase()))) {
    throw new Error(`Nicht erlaubtes Kommando: ${trimmed}`);
  }
  return trimmed;
}

function parseCommandText(commandText) {
  const lines = String(commandText || '')
    .split(/\r?\n/)
    .map((line) => normalizeCommandLine(line))
    .filter(Boolean);
  if (!lines.length) throw new Error('Keine ausführbaren Kommandos gefunden.');
  return lines;
}

function getSession(req) {
  const token = req.cookies?.[OPS_COOKIE_NAME];
  if (!token) return null;
  return sessions.get(token) || null;
}

function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt.' });
  req.opsUser = session;
  next();
}

function serializeJob(job) {
  return {
    id: job.id,
    label: job.label,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    requestedBy: job.requestedBy,
    output: job.output
  };
}

function appendJobOutput(job, text) {
  job.output += String(text || '');
  if (!job.output.endsWith('\n')) job.output += '\n';
  if (job.output.length > 120000) {
    job.output = job.output.slice(job.output.length - 120000);
  }
}

function runPowerShellCommand(commandLine) {
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      commandLine
    ], {
      cwd: projectRoot,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk || ''); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk || ''); });
    child.on('close', (code) => resolve({ code: Number(code || 0), stdout, stderr }));
    child.on('error', (error) => resolve({ code: 1, stdout, stderr: String(error?.message || error) }));
  });
}

async function executeJob(job) {
  job.status = 'running';
  job.startedAt = new Date().toISOString();
  appendJobOutput(job, `>>> Job ${job.id} gestartet (${job.label})`);
  for (const commandLine of job.commands) {
    appendJobOutput(job, `\nPS ${projectRoot}> ${commandLine}`);
    const result = await runPowerShellCommand(commandLine);
    if (result.stdout) appendJobOutput(job, result.stdout);
    if (result.stderr) appendJobOutput(job, result.stderr);
    if (result.code !== 0) {
      job.status = 'error';
      job.finishedAt = new Date().toISOString();
      appendJobOutput(job, `>>> Exitcode ${result.code}`);
      return;
    }
  }
  job.status = 'success';
  job.finishedAt = new Date().toISOString();
  appendJobOutput(job, '>>> Job erfolgreich abgeschlossen');
}

async function processQueue() {
  if (activeJob) return;
  const nextJob = jobs.find((job) => job.status === 'queued');
  if (!nextJob) return;
  activeJob = nextJob;
  await executeJob(nextJob);
  recentJobs.unshift(serializeJob(nextJob));
  if (recentJobs.length > 20) recentJobs.length = 20;
  jobs.splice(jobs.findIndex((job) => job.id === nextJob.id), 1);
  activeJob = null;
  void processQueue();
}

function enqueueJob({ label, requestedBy, commands }) {
  const job = {
    id: `ops_${String(nextJobId++).padStart(4, '0')}`,
    label,
    requestedBy,
    commands,
    status: 'queued',
    createdAt: new Date().toISOString(),
    startedAt: '',
    finishedAt: '',
    output: `>>> Eingereiht von ${requestedBy}\n`
  };
  jobs.unshift(job);
  void processQueue();
  return job;
}

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(makeOpsPage());
});

app.post('/api/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (username !== OPS_USERNAME || password !== OPS_PASSWORD) {
    return res.status(401).json({ error: 'Ungültige Zugangsdaten.' });
  }
  const token = crypto.randomUUID();
  sessions.set(token, {
    username,
    createdAt: new Date().toISOString()
  });
  res.cookie(OPS_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/'
  });
  res.json({ ok: true });
});

app.post('/api/logout', requireAuth, (req, res) => {
  const token = req.cookies?.[OPS_COOKIE_NAME];
  if (token) sessions.delete(token);
  res.clearCookie(OPS_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/jobs', requireAuth, (req, res) => {
  const visibleJobs = [];
  if (activeJob) visibleJobs.push(serializeJob(activeJob));
  jobs.forEach((job) => {
    if (job.id !== activeJob?.id) visibleJobs.push(serializeJob(job));
  });
  recentJobs.forEach((job) => visibleJobs.push(job));
  res.json({
    ok: true,
    jobs: visibleJobs.slice(0, 25)
  });
});

app.post('/api/run-preset', requireAuth, (req, res) => {
  const presetId = String(req.body?.presetId || '').trim();
  const preset = PRESETS.find((entry) => entry.id === presetId);
  if (!preset) return res.status(404).json({ error: 'Preset nicht gefunden.' });
  const job = enqueueJob({
    label: preset.label,
    requestedBy: req.opsUser.username,
    commands: preset.commands
  });
  res.json({ ok: true, job: serializeJob(job) });
});

app.post('/api/run-custom', requireAuth, (req, res) => {
  const commands = parseCommandText(req.body?.commandText || '');
  const job = enqueueJob({
    label: 'Eigene Kommandos',
    requestedBy: req.opsUser.username,
    commands
  });
  res.json({ ok: true, job: serializeJob(job) });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'galactic-ops-console',
    port: OPS_PORT,
    queueLength: jobs.length + (activeJob ? 1 : 0)
  });
});

server.listen(OPS_PORT, '0.0.0.0', () => {
  console.log(`Galactic Ops Console listening on https://0.0.0.0:${OPS_PORT}`);
  if (OPS_PASSWORD === 'change-me-now') {
    console.warn('OPS_CONSOLE_PASSWORD nutzt noch den Default-Wert. Bitte vor Internetfreigabe ändern.');
  }
});
