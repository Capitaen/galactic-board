# Technische Erlaeuterung der Wirtschaft

Dieses Dokument beschreibt die Wirtschaft des Galactic Campaign Boards aus technischer Sicht. Es bezieht sich auf die Logik in `index.html`, `server/src/server.js` und `server/src/db.js`.

## Datenquellen und Persistenz

Die Kampagnenressourcen liegen im zentralen Kampagnenzustand (`app_state`). Dort stehen unter anderem Planeten, Minen-/Infrastrukturplaetze, Bauauftraege, Fraktionsressourcen und Zeitstempel fuer Produktionsticks.

Die Boerse liegt in SQLite-Tabellen:

- `market_companies`: Aktien/Holdings mit Basiskurs, aktuellem Kurs, vorherigem Kurs, Fraktion, Sektor und Ressourcenbezug.
- `market_history`: Kursverlauf je Aktie.
- `market_investors`: persoenliche Portfolios mit anonymem Alias und Creditguthaben.
- `market_holdings`: aggregierter Aktienbestand pro Investor und Aktie.
- `market_orders`: einzelne Kaufauftraege. Jeder Kauf bleibt mit Zeitpunkt, Menge, Einstiegskurs und Kaufwert sichtbar.
- `market_events`: galaktische Marktereignisse mit zeitlich begrenztem Kurseinfluss.
- `economy_policy`: Senatspolitik fuer Steuerquote und Foerderung.
- `faction_accounts`: Konten fuer nicht-GAR-Fraktionen wie Black Sun, Pyke und Hutten.

## Ressourcenproduktion

Die serverseitige Produktion laeuft in `applyServerProductionTicks`. Ein Tick entspricht einer Stunde (`RESOURCE_PRODUCTION_TICK_MS = 60 * 60 * 1000`). Wenn seit dem letzten Tick mehrere Stunden vergangen sind, werden mehrere Ticks auf einmal nachgerechnet.

Militaerische Infrastruktur produziert pro belegtem Slot `+1` der jeweiligen Ressource pro Stunde:

- Quadranium-Erz
- Agrinium
- Tibanna-Gas
- Baradium
- Kavam-Salz

Zivile Gebaeude erzeugen Bruttoumsatz in Credits. Dieser Bruttoumsatz wird nicht vollstaendig in den GAR-Haushalt uebernommen, sondern zuerst durch Steuer, Foerderung und Inflation modifiziert.

## Planetare Boni

Zivile Entwicklungsgebaeude geben pro Planet Prozentboni auf bestimmte Ressourcen. Diese Boni wirken auf militaerische Produktion und zivile Creditproduktion desselben Planeten. Pro Ressource ist der Bonus auf `30 %` begrenzt (`MAX_CIVILIAN_PRODUCTION_BONUS = 0.30`).

Beispiel: Wenn ein Planet mehrere Entwicklungszentren besitzt, werden deren Boni addiert, aber fuer die jeweilige Ressource nie ueber `+30 %` hinaus angewendet.

## Steuer, Foerderung und Inflation

Fuer GAR-Credits wird die effektive Creditproduktion so berechnet:

```text
effektive Credits = Bruttocredits * Steuerquote * (1 - Inflation * 0.5)
```

Die Steuerquote kommt aus der Senatspolitik und ist auf `0 %` bis `25 %` begrenzt. Standardwert ist `5 %`.

Die Inflation ergibt sich aus dem GAR-Creditbestand:

```text
Inflation = min(25 %, GAR-Credits / 2.000.000)
```

Hohe GAR-Creditreserven reduzieren damit neue Creditproduktion. Bei maximaler Inflation von `25 %` sinkt die neue Creditproduktion durch den Faktor `(1 - 0.25 * 0.5) = 0.875`.

Foerderungen wirken vor beziehungsweise neben der Steuer:

- `civilian`: zivile Creditrate `+10 %`
- `logistics`: zivile Creditrate `+5 %`
- `research`: Agrinium-Produktion `+10 %`
- `shipbuilding`: ist als Politikoption vorhanden, hat in der aktuellen Produktionsformel aber keinen direkten Ressourcenmultiplikator.
- `none`: keine Foerderung.

## Aktienmarkt

Der Aktienmarkt wird ueber `/api/economy/market` gelesen. Bei jedem Abruf wird vorher `runMarketTick` ausgefuehrt. Seit dieser Anpassung darf ein Markttick alle `15 Sekunden` laufen.

Ein Markttick aktualisiert jede Aktie nach dieser Logik:

```text
pullToBase     = ((Basiskurs - aktueller Kurs) / Basiskurs) * 0.04
noise          = Zufall zwischen -0.02 und +0.02
eventImpact    = Einfluss eines aktiven Marktereignisses
inflationImpact = min(8 %, Inflation) * 0.25
neuer Kurs     = aktueller Kurs * (1 + pullToBase + noise + eventImpact + inflationImpact)
```

Der Kurs faellt nie unter `25 Cr`. Nach jedem Tick wird ein Eintrag in `market_history` geschrieben. Die UI liest Kursdaten fuer bis zu sechs Monate und filtert daraus die Bereiche `Heute`, `1 Woche`, `1 Monat` und `6 Monate`.

## Marktereignisse

Alle sechs Stunden kann ein neues Marktereignis entstehen, wenn seit dem letzten Ereignis genug Zeit vergangen ist. Ein Ereignis wirkt drei Stunden und beeinflusst alle Aktien waehrend dieser Zeit. Beispiele:

- Handelsboom: positiver Kurseinfluss
- Boersenkorrektur: negativer Kurseinfluss
- Treibstoffknappheit: negativer Kurseinfluss
- Grossauftrag der Republik: positiver Kurseinfluss

## Kaufen

Angemeldete Rollen mit persoenlichem Portfolio kaufen Aktien mit ihren Portfolio-Credits. Viewer erzeugen nur Nachfrage und erhalten keine Aktie.

Beim Kauf wird:

1. die Menge validiert (`1` bis `10.000`),
2. der aktuelle Kurs als Einstiegskurs verwendet,
3. der Kaufwert vom Portfolio-Guthaben abgezogen,
4. der aggregierte Bestand in `market_holdings` erhoeht,
5. ein einzelner Kaufauftrag in `market_orders` gespeichert,
6. der Aktienkurs durch Nachfrage erhoeht,
7. ein neuer Verlaufspunkt in `market_history` geschrieben.

Der Kaufimpact ist:

```text
priceImpact = 1 + (0.0125 * sqrt(Menge))
neuer Kurs  = aktueller Kurs * priceImpact
```

Durch die Quadratwurzel steigt der Einfluss grosser Kaeufe spuerbar, aber nicht linear. Ein Kauf von 100 Aktien bewegt den Kurs also staerker als 1 Aktie, aber nicht hundertmal so stark.

## Auftragsliste

Die Auftragsliste in der Aktien-Uebersicht basiert auf `market_orders`. Jeder Kaufauftrag zeigt:

- Datum und Uhrzeit des Kaufs
- Menge
- Kaufwert
- aktuelle Veraenderung in Prozent
- aktuelle Veraenderung in Credits

Die Veraenderung wird nicht gespeichert, sondern live aus aktuellem Kurs und Kaufwert berechnet:

```text
aktueller Wert = aktueller Kurs * gekaufte Menge
Veraenderung Credits = aktueller Wert - Kaufwert
Veraenderung Prozent = Veraenderung Credits / Kaufwert * 100
```

Wenn spaeter ein weiterer Kauf derselben Aktie erfolgt, entsteht ein neuer Auftrag mit eigenem Einstiegskurs und eigenem Zeitpunkt. Der aggregierte Bestand bleibt weiterhin in `market_holdings`, waehrend `market_orders` die Kaufhistorie pro Auftrag liefert.

## Verkaufen

Beim Verkauf wird:

1. geprueft, ob genug Aktienbestand vorhanden ist,
2. der Bestand reduziert oder geloescht,
3. der aktuelle Verkaufserloes dem Portfolio gutgeschrieben,
4. der Kurs durch Verkaufsdruck gesenkt,
5. ein Verlaufspunkt geschrieben.

Der Verkaufsimpact ist:

```text
priceImpact = max(0.75, 1 - (0.0125 * sqrt(Menge)))
neuer Kurs  = max(25 Cr, aktueller Kurs * priceImpact)
```

Die Auftragsliste wird durch Verkaeufe derzeit nicht reduziert. Sie ist eine Kaufhistorie und dient zur Anzeige der Performance einzelner Kaufzeitpunkte.

## Portfolio und Rangliste

Der Portfolio-Wert besteht aus:

```text
Portfolio-Wert = Creditguthaben + Summe(Aktienbestand * aktueller Kurs)
```

Die oeffentliche Rangliste zeigt anonyme Portfolios nach Gesamtwert. Nur aktivierte persoenliche Portfolios werden dort beruecksichtigt.

## UI-Aktualisierung

Wenn der Wirtschaftsbereich geoeffnet ist, ruft die UI alle `15 Sekunden` `/api/economy/market` ab. Dadurch werden Kurse, Charts, Bestandswerte, Rangliste und Auftragsveraenderungen regelmaessig aktualisiert. Manuelle Aktualisierung ueber den Button bleibt weiterhin moeglich.

## Sektor-Wirtschaft

Der Tab `Sektor-Wirtschaft` liest seine Daten ueber die neuen API-Routen:

- `GET /api/economy/sectors`
- `GET /api/economy/sectors/:sectorId`
- `GET /api/economy/sectors/:sectorId/holdings`
- `POST /api/economy/sectors/:sectorId/buy-resource`
- `POST /api/economy/sectors/:sectorId/embargo`

Die 62 Sektoren kommen aus `meta.manualSectors`. Der Server normalisiert die bekannten Umbenennungen, darunter `Sith Worlds` zu `Tynquay` und `Ariarch` beziehungsweise `Sektor 61` zu `Chubara`. Bestimmte Sektoren sind wirtschaftlich ausgeschlossen und erhalten keine sektoralen Holdings und keine zivile Wirtschaft: Velcar, Rago, Chiss Ascendancy Ost, Chiss Ascendancy, Chss Ascendancy, Vardoss, Ghost Nebula, Bakura und Corva.

Pro Sektor wird aus den enthaltenen Planeten ein Kontrollstatus abgeleitet:

- `BLUFOR`, wenn GAR den Sektor klar kontrolliert.
- `OPFOR`, wenn KUS den Sektor klar kontrolliert.
- `Umkaempft`, wenn GAR und KUS gleichzeitig relevante Praesenz haben.
- `Neutral`, wenn keine klare GAR- oder KUS-Kontrolle besteht.

Die UI zeigt grobe Labels wie `Sehr niedrig`, `Niedrig`, `Mittel`, `Hoch` und `Sehr hoch`. Intern bleiben die Werte numerisch, damit Preise und Risikoformeln fein reagieren koennen.

## Sektorale Ressourcenpreise

Die Tabelle `sector_resource_prices` speichert fuer jeden Sektor und jede Ressource:

- Basispreis
- aktuellen Preis
- vorherigen Preis
- Nachfragewert
- Angebotswert
- Spekulationswert

Der Nachfrage-Tick schreibt weiterhin `sector_resource_demand` und fuehrt daraus geglaettete Preise ab. Preisbewegungen werden gedrosselt: vorhandene Preise bewegen sich nur schrittweise in Richtung des neu berechneten Zielwerts. Dadurch fuehren einzelne Ereignisse oder Kaeufe nicht zu komplett zerstoerten Preisen.

Ein Ressourcenkauf durch Navy oder Senat erhoeht:

1. den lokalen Ressourcenpreis,
2. den Nachfragewert,
3. den Spekulationswert,
4. die passende sektorale Holding,
5. die Marktberichte und galaktischen Ereignisse.

Die Wirkung grosser Kaeufe steigt ueber eine Quadratwurzel-Formel. Grosse Mengen sind also sichtbar, aber nicht linear uebermaechtig.

## Ziviler Ressourcenkauf

Navy-Admins, Senats-Admins, Senatoren und globale Admins duerfen im Tab `Sektor-Wirtschaft` zivile Ressourcen fuer den GAR-/Militaerpool kaufen. Normale Spieler koennen nur beobachten.

Beim Kauf prueft der Server:

- gueltiger Sektor,
- gueltige Ressource,
- gueltige positive Menge,
- kein ausgeschlossener Wirtschaftssektor,
- kein Embargo,
- kein OPFOR-Sektor,
- Kontrollstatus `BLUFOR`,
- ausreichende GAR-Credits,
- keine negativen oder ungueltigen Preise.

Danach werden GAR-Credits reduziert, die gekaufte Ressource dem GAR-Pool hinzugefuegt und ein Eintrag in `civilian_resource_purchases` geschrieben. Der Kauf erzeugt ausserdem einen Marktbericht und ein galaktisches Ereignis.

## Embargos

Embargos werden serverseitig in `sector_economy_state.is_embargoed` gespeichert. OPFOR-Sektoren gelten fuer den zivilen GAR-Markt automatisch als blockiert.

Embargo bedeutet technisch:

- zivile Minen in diesem Sektor zahlen keinen normalen Marktertrag aus,
- zivile Ressourcenkaufe werden serverseitig abgelehnt,
- sektorale Holdings werden als `embargo` markiert,
- normale Aktienkaeufe fuer diese Holdings werden blockiert,
- institutionelle Anleger ignorieren diese Werte im regulaeren Tick.

Admins koennen Embargos ueber `POST /api/economy/sectors/:sectorId/embargo` setzen oder aufheben. Jede Aenderung erzeugt ein Ereignis in `market_events`.

## Holdings, Insolvenz und Uebernahmen

`market_companies` wurde defensiv erweitert:

- `sector_id`
- `resource_refs_json`
- `market_status`
- `bankruptcy_risk`
- `debt_index`
- `confidence_index`
- `is_embargoed`
- `acquired_by_company_id`
- `merged_name`

Die bestehende Einzelressource `resource_key` bleibt erhalten, damit alte Portfolios, Kurse und History-Daten weiter funktionieren. Neue Mehrfachressourcen einer uebernommenen Holding liegen in `resource_refs_json`.

Das Insolvenzrisiko steigt durch schwache Nachfrage, fallende Kurse, Embargo, Rezession, Schulden und sinkendes Vertrauen. Bei hohem Risiko kann der Handel ausgesetzt oder die Holding als insolvent markiert werden. Das erzeugt ein Ereignis.

Starke Holdings im gleichen Sektor koennen insolvente oder extrem schwache Holdings uebernehmen. Dabei wird:

1. die starke Holding um die Ressourcen der schwachen Holding erweitert,
2. der Name dynamisch zusammengefuehrt oder zu einer Industrial-Holding verdichtet,
3. die schwache Holding auf `takeover` gesetzt,
4. ein Eintrag in `holding_mergers` geschrieben,
5. ein galaktisches Ereignis erzeugt.

Bestehende Portfolio-Bestaende bleiben erhalten, weil die urspruenglichen Firmen-IDs nicht geloescht werden.

## Senatsminen und BLUFOR-Regel

Senatsminen duerfen nur auf BLUFOR-Territorium entstehen. Diese Regel wird in `stateValidation.js` serverseitig erzwungen.

Der Server prueft dabei:

- Zielplanet gehoert GAR,
- Zielsektor ist nicht KUS,
- Zielsektor ist nicht neutral,
- Zielsektor ist nicht umkaempft,
- der abgeleitete Kontrollstatus ist `BLUFOR`.

Dadurch reicht es nicht, die UI zu umgehen: nicht erlaubte Senatsminen werden beim Speichern des Kampagnenzustands blockiert.
