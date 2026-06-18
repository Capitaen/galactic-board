# Galactic Ops Console

Diese Ops-Konsole ist eine **separate Website / separater Prozess** für:

- Deploys
- Healthchecks
- Logs
- typische Server-Analysen
- eingeschränkte eigene Shell-Kommandos

Sie ist bewusst **nicht** Teil der eigentlichen Galactic-Website und bleibt daher erreichbar, auch wenn `galactic` gerade neugestartet wird.

## Ziel

Der Kollege kann:

- `git pull`
- `pm2 restart galactic`
- `pm2 restart audit-dispatch`
- `pm2 save`
- PM2 / Logs / Port-Checks / Curl-Checks ausführen

Er kann **nicht**:

- freie destruktive Shell-Befehle ausführen
- Pipes, Redirects oder Shell-Verkettungen verwenden
- beliebige Dateien überschreiben
- die Ops-Seite selbst per Web-Konsole patchen

## Dateien

- [server/src/opsServer.js](D:\galactic-board\server\src\opsServer.js)

## Umgebungsvariablen

In `.env` oder `server/.env` ergänzen:

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

oder direkt über die Server-IP:

```text
https://<server-ip>:4443/
```

Je nach Firewall muss Port `4443` freigegeben werden.

## Erlaubte Custom-Commands

Erlaubte Präfixe:

- `git pull`
- `git status`
- `git rev-parse`
- `pm2 restart galactic`
- `pm2 restart audit-dispatch`
- `pm2 save`
- `pm2 status`
- `pm2 show galactic`
- `pm2 show audit-dispatch`
- `pm2 jlist`
- `curl.exe -k ...`
- `Get-Content ...`
- `Select-String ...`
- `Get-NetTCPConnection ...`
- `Get-Process ...`
- `Resolve-DnsName ...`
- `Test-NetConnection ...`
- `Start-Sleep ...`

Optional erlaubt:

- `cd C:\Users\Administrator\galactic-board`

Dieser `cd` wird ignoriert, weil die Ops-Konsole ohnehin immer im Repo-Ordner ausführt.

## Bewusste Einschränkungen

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
- `PM2 Status`
- `Port 443 Check`
- `Reload Route Check`
- `Galactic Logs`

## Hinweis

Die Ops-Konsole ist sicherer als eine freie Web-Shell, aber trotzdem ein mächtiges Admin-Werkzeug.
Darum:

- Passwort sofort ändern
- nur globalen Admins geben
- möglichst nur für bekannte IPs oder per Firewall freigeben
