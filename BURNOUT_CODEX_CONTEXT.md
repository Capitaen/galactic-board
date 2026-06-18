# Burnout Codex Context

Diese Datei ist der Schnellstart-Kontext fuer Burnout und dessen Codex, damit nicht jedes Mal dieselben Grundlagen neu zusammengesucht werden muessen.

## Projektbild

`galactic-board` ist die Kampagnen- und Wirtschafts-Webseite.

Wichtige Prozesse:

- `galactic`
  Hauptwebsite auf Port `443`
- `audit-dispatch`
  Separater Nebenprozess fuer Audit-/Discord-Dispatch
- `galactic-ops`
  Separate Ops-Konsole auf Port `4443`

Die Ops-Konsole ist bewusst getrennt, damit man auch dann noch Deploys und Analysen fahren kann, wenn die Hauptseite haengt, timet outet oder gerade neugestartet wird.

## Wichtigste Ordner

- [server/src](D:\galactic-board\server\src)
  Backend, API, Datenbanklogik, Ops-Konsole
- [assets/app](D:\galactic-board\assets\app)
  Frontend-Module der Website
- [server/scripts](D:\galactic-board\server\scripts)
  Nebenjobs wie Audit-Dispatch

## Bekannte Stolpersteine

### 1. PM2 kann gruen sein, obwohl die Website faktisch kaputt ist

Das war hier mehrfach der Fall.

Typische Symptome:

- `pm2 status` zeigt `online`
- Browser bekommt trotzdem `ERR_CONNECTION_TIMED_OUT`
- oder API-Route scheint "nicht gefunden", obwohl der Code sie schon enthaelt

Dann war oft nicht der Code das Hauptproblem, sondern:

- falscher oder alter Prozess hing noch auf Port `443`
- PM2-Instanz war aus altem Zustand gestartet
- Browser sprach mit einem Prozess, der nicht der gerade erwartete Code-Stand war

### 2. Port-443-Konflikte

Fehlerbild:

```text
EADDRINUSE: address already in use 0.0.0.0:443
```

Dann zuerst pruefen:

- Wer lauscht wirklich auf `443`?
- Ist `galactic` wirklich der aktive Listener?
- Hilft `pm2 restart galactic` oder braucht es `pm2 delete galactic` plus sauberen Start?

### 3. Wirtschaftstick kann teuer sein

Groessere Lastspitzen kamen haeufig aus:

- `runMarketTick()`
- `marketSummarySnapshot`
- `runCorporateBuildTick()`

Wenn die Seite wieder langsam oder instabil wird, zuerst in diese Richtung schauen.

### 4. Browser-/Asset-Stale-State

Es gab Faelle, in denen:

- direkt nach Neustart kurz eine alte Karten-/Asset-Version sichtbar war
- danach erst der korrekte Zustand geladen wurde

Darum bei Frontend-Problemen immer mitdenken:

- Cache
- altes Bundle
- unvollstaendig neu gestarteter Prozess

## Empfohlene Reihenfolge bei Problemen

1. Ops-Konsole auf `https://<server>:4443/` oeffnen
2. `PM2 Status` laufen lassen
3. `Port 443 Check` laufen lassen
4. `Local API Health` laufen lassen
5. falls noetig `Frontend + Backend Diagnose`
6. bei harten Prozessproblemen `Galactic Hard Restart`

## Wichtige Presets in der Ops-Konsole

- `Galactic Deploy`
  Standard: `git pull`, `pm2 restart galactic`, `pm2 save`
- `Galactic + Audit Deploy`
  Neustart von Hauptseite plus Audit-Prozess
- `Galactic Hard Restart`
  Loescht `galactic` in PM2 und startet ihn sauber neu
- `PM2 Flush + Status`
  Leert Logs und zeigt den Prozesszustand neu
- `Local API Health`
  Prueft lokale API-Endpunkte und Ops-Health
- `Frontend + Backend Diagnose`
  Kombipaket aus PM2, Portbindung, API und Logs
- `Source + Route Analyse`
  Fuehrt `node --check` aus und sucht Reload-Routen im Code

## Erlaubte Custom-Kommandos

Die Ops-Konsole erlaubt absichtlich nur einen allowlist-basierten Satz aus:

- Deploy-Kommandos
- PM2-Status / Restart / Delete / Start / Save / Flush
- lokale `curl.exe -k` API-Checks
- `Get-Content`, `Select-String`, `Get-NetTCPConnection`, `Get-Process`
- `node --check` fuer zentrale Serverdateien

Nicht erlaubt sind freie Pipes, Redirects oder allgemeine Schreib-/Loeschaktionen.

## Wofuer Burnout die Ops-Seite nutzen soll

- sicheren Deploy fahren
- Healthchecks machen
- Logs pruefen
- Listener-/Port-Probleme eingrenzen
- API-Endpunkte pruefen
- seinem Codex konkrete Analyseausgaben geben

Nicht gedacht ist sie als freie Web-Shell fuer beliebige Servereingriffe.

## Typische Schnellkommandos fuer Codex

Wenn Codex auf konkrete Laufzeitdaten angewiesen ist, sind diese Ausgaben oft am wertvollsten:

```powershell
pm2 status
pm2 show galactic
Get-NetTCPConnection -LocalPort 443 -State Listen
curl.exe -k https://127.0.0.1:443/api/bootstrap
curl.exe -k https://127.0.0.1:443/api/economy/market/summary
Get-Content C:\Users\Administrator\.pm2\logs\galactic-error.log -Tail 80
Get-Content C:\Users\Administrator\.pm2\logs\galactic-out.log -Tail 80
```

## Aktueller Gedanke hinter der Trennung

Die Hauptseite soll fuer Spieler und Admins laufen.

Die Ops-Seite soll:

- separat ueberleben
- nicht aus Versehen mitgepatcht oder per UI kaputtgeklickt werden
- Deploys und Diagnosen auch dann erlauben, wenn `galactic` selbst gerade zickt

Wenn Burnout etwas fuer Codex dokumentiert, sollte diese Datei als erster Einstieg mitgegeben werden.
