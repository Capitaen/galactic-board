# Galactic Ops Console

Diese Ops-Konsole ist eine **separate Website / separater Prozess** fuer:

- Deploys
- Healthchecks
- Logs
- typische Server-Analysen
- eingeschraenkte eigene Shell-Kommandos

Sie ist bewusst **nicht** Teil der eigentlichen Galactic-Website und bleibt daher erreichbar, auch wenn `galactic` gerade neugestartet wird.

## Ziel

Der Kollege kann:

- `git pull`
- `pm2 restart galactic`
- `pm2 restart audit-dispatch`
- `pm2 save`
- `pm2 flush`
- `pm2 delete galactic`
- `pm2 start .\server\src\server.js --name galactic`
- PM2 / Logs / Port-Checks / Curl-Checks / Source-Checks ausfuehren

Er kann **nicht**:

- freie destruktive Shell-Befehle ausfuehren
- Pipes, Redirects oder Shell-Verkettungen verwenden
- beliebige Dateien ueberschreiben
- die Ops-Seite selbst per Web-Konsole patchen

## Dateien

- [server/src/opsServer.js](D:\galactic-board\server\src\opsServer.js)
- [BURNOUT_CODEX_CONTEXT.md](D:\galactic-board\BURNOUT_CODEX_CONTEXT.md)

## Umgebungsvariablen

In `.env` oder `server/.env` ergaenzen:

```env
OPS_CONSOLE_PORT=4443
OPS_CONSOLE_USERNAME=opsadmin
OPS_CONSOLE_PASSWORD=bitte-sofort-aendern
```

## Start per PM2

```powershell
cd C:\Users\Administrator\galactic-board
pm2 start .\server\src\opsServer.js --name galactic-ops
pm2 save
pm2 status
```

## Aufruf

Danach im Browser:

```text
https://galactic-campaign.duckdns.org:4443/
```

oder direkt ueber die Server-IP:

```text
https://<server-ip>:4443/
```

Je nach Firewall muss Port `4443` freigegeben werden.

## Erlaubte Custom-Commands

Erlaubte Praefixe:

- `git pull`
- `git status`
- `git rev-parse`
- `pm2 flush`
- `pm2 delete galactic`
- `pm2 restart galactic`
- `pm2 restart audit-dispatch`
- `pm2 restart galactic-ops`
- `pm2 start .\server\src\server.js --name galactic`
- `pm2 save`
- `pm2 status`
- `pm2 show galactic`
- `pm2 show audit-dispatch`
- `pm2 show galactic-ops`
- `pm2 jlist`
- `node --check server/src/server.js`
- `node --check server/src/db.js`
- `node --check server/src/opsServer.js`
- `curl.exe -k ...`
- `Get-Content ...`
- `Get-ChildItem ...`
- `Select-String ...`
- `Get-NetTCPConnection ...`
- `Get-Process ...`
- `Resolve-DnsName ...`
- `Test-NetConnection ...`
- `Start-Sleep ...`

Optional erlaubt:

- `cd C:\Users\Administrator\galactic-board`

Dieser `cd` wird ignoriert, weil die Ops-Konsole ohnehin immer im Repo-Ordner ausfuehrt.

## Bewusste Einschraenkungen

Nicht erlaubt:

- Pipes `|`
- Verkettungen `;` `&&`
- Redirects `>` `<`
- Backticks
- freie Dateischreibzugriffe
- freie PowerShell-Eskalation

## Presets

Vordefiniert:

- `Galactic Deploy`
- `Galactic + Audit Deploy`
- `Galactic Hard Restart`
- `PM2 Flush + Status`
- `PM2 Status`
- `Port 443 Check`
- `Local API Health`
- `Frontend + Backend Diagnose`
- `Source + Route Analyse`
- `Reload Route Check`
- `Galactic Logs`
- `Ops Logs`

## Fuer Burnout / Codex

Zusaetzlicher Schnellkontext liegt hier:

- [BURNOUT_CODEX_CONTEXT.md](D:\galactic-board\BURNOUT_CODEX_CONTEXT.md)

## Hinweis

Die Ops-Konsole ist sicherer als eine freie Web-Shell, aber trotzdem ein maechtiges Admin-Werkzeug.
Darum:

- Passwort sofort aendern
- nur globalen Admins geben
- moeglichst nur fuer bekannte IPs oder per Firewall freigeben
