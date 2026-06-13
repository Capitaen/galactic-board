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

Die Solvenzlogik steckt in `refreshHoldingSolvency` in `server/src/db.js`. Sie bewertet ausschliesslich sektorale Holdings (`id LIKE 'sector_holding_%'`) und berechnet fuer jede Holding pro Tick einen neuen Wert fuer:

- `bankruptcy_risk`
- `debt_index`
- `confidence_index`
- `market_status`
- `is_embargoed`

Die Formel arbeitet additiv aus mehreren Druckkomponenten:

```text
pricePressure      = 1 - (currentPrice / basePrice)
demandPressure     = 1 - marketMultiplier
embargoPressure    = 0.25 bei Embargo
recessionPressure  = +0.14 in Rezession, +0.08 im Abschwung, -0.04 in guten Lagen
sentimentPressure  = Panik/Negativ positiv auf Risiko, Positiv/Euphorisch negativ auf Risiko
cyclePressure      = Mischung aus pressureScore, momentum, trend, volatility, warPressure, chainImpulse

nextRisk = clamp(
  oldRisk * 0.78
  + pricePressure * 0.14
  + demandPressure * 0.18
  + embargoPressure
  + recessionPressure
  + sentimentPressure
  + cyclePressure,
  0,
  1
)
```

Wichtig ist dabei:

- fallende Kurse gegenueber dem Basiskurs erhoehen direkt das Insolvenzrisiko,
- ein `marketMultiplier` unter `1` wird als Nachfrageschwaeche interpretiert,
- Embargos wirken sehr hart und sofort,
- Rezession, Panik und negative Marktstimmung addieren weiteren konstanten Druck,
- positive Signale bauen Risiko nur langsam ab.

Aus `nextRisk` folgen dann die Sekundaerwerte:

```text
wenn nextRisk > 0.62: debt_index +0.035, sonst -0.018
wenn nextRisk > 0.65: confidence_index -0.04, sonst +0.02
```

Statusschwellen:

- ab `0.80`: `suspended`
- ab `0.92`: `insolvent`
- unter `0.70`: Rueckkehr von `suspended`/`embargo` zu `tradeable`

Das ist wichtig fuer das Gesamtverhalten: Schulden und Vertrauensverlust sind nicht nur Anzeigeparameter, sondern werden bei haeufigen Ticks sehr schnell zu einem systematischen Beschleuniger.

### Uebernahmen

Wenn in einem Sektor eine Holding insolvent oder extrem gefaehrdet ist und gleichzeitig eine andere Holding im selben Sektor noch `tradeable` ist, kann die starke Holding die schwache uebernehmen. Dabei wird:

1. die starke Holding um die Ressourcen der schwachen Holding erweitert,
2. der Name dynamisch zusammengefuehrt oder zu einer Industrial-Holding verdichtet,
3. die schwache Holding auf `takeover` gesetzt,
4. ein Eintrag in `holding_mergers` geschrieben,
5. ein galaktisches Ereignis erzeugt.

Bestehende Portfolio-Bestaende bleiben erhalten, weil die urspruenglichen Firmen-IDs nicht geloescht werden.

## Warum fast alle Firmen insolvent gehen koennen

Der wichtigste technische Grund ist nicht eine einzelne Zahl, sondern die Kopplung der Solvenzlogik an den sehr schnellen Wirtschaftstick.

### 1. Der Solvenz-Tick laeuft effektiv alle 15 Sekunden

`runMarketTick` wird an mehreren Stellen aufgerufen:

- beim Laden von `/api/economy/market`
- beim Laden von `/api/economy/sectors`
- beim Laden einzelner Sektordetails
- im Server-Maintenance-Loop

Gleichzeitig ist `DEMAND_TICK_MS = 15 * 1000`. Wenn der Tick laeuft, wird zuerst `runCivilianDemandTick(...)` ausgefuehrt und **direkt danach** `refreshHoldingSolvency(db, now)`.

Das bedeutet praktisch:

- Nachfrage, Sektorpreise und Solvenz werden im 15-Sekunden-Rhythmus fortgeschrieben,
- Ressourcenproduktion und viele eigentliche Wirtschaftsgrundlagen laufen aber auf Stundenbasis,
- Schulden und Vertrauensverlust koennen dadurch in Minuten eskalieren, obwohl die reale Spielwirtschaft viel traeger gedacht ist.

### 2. Die Solvenzformel ist fuer langsame Ticks plausibel, fuer 15-Sekunden-Ticks aber sehr aggressiv

Die Formel enthaelt mehrere additive Druckquellen gleichzeitig:

- Preis unter Basiskurs
- schwache lokale Nachfrage
- Rezession/Abschwung
- negative Marktstimmung
- Kriegsdruck
- Volatilitaet
- Embargo

Schon wenn mehrere dieser Faktoren leicht negativ sind, steigt `nextRisk` dauerhaft. Weil der Tick sehr oft laeuft, werden diese kleinen negativen Delta-Werte extrem oft hintereinander angewandt. Das fuehrt dazu, dass Holdings nicht ueber Wochen oder Tage, sondern in kurzer Live-Zeit von `tradeable` zu `suspended` und dann `insolvent` rutschen.

### 3. Hoher Risk-Wert erhoeht Schulden und senkt Vertrauen ebenfalls alle 15 Sekunden

Sobald `nextRisk` ueber `0.62` oder `0.65` liegt, passiert pro Tick:

- `debt_index` steigt,
- `confidence_index` sinkt.

Dadurch entsteht ein technischer Rueckkopplungseffekt:

- negative Marktlage erzeugt Risk,
- Risk verschlechtert Debt und Confidence,
- diese Werte werden zwar nicht direkt voll in derselben Formel multipliziert, markieren aber einen dauerhaften Krisenzustand,
- Holdings erreichen dadurch schnell die Schwellwerte fuer `suspended` und `insolvent`.

### 4. Suspendierte und insolvente Holdings erholen sich kaum noch

Im normalen `runMarketTick` werden Holdings mit folgenden Stati von der regulaeren Preisfortschreibung ausgeschlossen:

- `embargo`
- `suspended`
- `insolvent`
- `takeover`

Das heisst:

- eine gesunde Holding bekommt laufend Preisupdates,
- eine ausgesetzte oder insolvente Holding nimmt an der normalen Kurserholung nicht mehr teil,
- damit fehlt ein grosser Teil des natuerlichen Rueckwegs in die Normalitaet.

Technisch ausgedrueckt: Die Logik hat einen starken Kriseneintritt, aber nur einen schwachen automatischen Erholungspfad.

### 5. Bei leerer oder falscher Kampagnendatenbank verstaerkt sich das Problem

Wenn `app_state`, `manualSectors`, Flotten oder sektorale Wirtschaftsdaten unvollstaendig sind, arbeiten die Wirtschaftsjoins nur noch mit Teilinformationen. Das fuehrt zwar nicht immer allein zur Insolvenz, aber die Marktlogik verliert damit:

- stabile Sektorzuordnung,
- glaubwuerdige Nachfragebeziehungen,
- realistische BLUFOR/OPFOR-Verteilung,
- konsistente Produktions- und Infrastrukturgrundlagen.

In so einem Zustand kippt das System schneller in uniforme Krisenmuster, weil viele Holdings nicht mehr von differenzierten lokalen Faktoren profitieren.

### Technische Kurzdiagnose

Wenn fast alle Firmen insolvent gehen, ist die wahrscheinlichste Ursache im aktuellen Stand:

1. `refreshHoldingSolvency` laeuft zu haeufig, naemlich im 15-Sekunden-Takt.
2. Die Risikoschwellen (`0.80` fuer `suspended`, `0.92` fuer `insolvent`) werden dadurch zu schnell erreicht.
3. Suspendierte/insolvente Holdings sind von normaler Kursfortschreibung ausgeschlossen und erholen sich kaum.
4. Falsche oder beschaedigte SQLite-Daten verstaerken die Instabilitaet zusaetzlich.

### Praktische Folgerung fuer Balancing

Wenn das System stabiler werden soll, gibt es technisch mehrere Stellhebel:

- `refreshHoldingSolvency` deutlich seltener ausfuehren, zum Beispiel minuetlich oder stuendlich statt alle 15 Sekunden,
- `debt_index` und `confidence_index` langsamer veraendern,
- Schwellen fuer `suspended` und `insolvent` anheben,
- explizite Erholungspfade fuer suspendierte Holdings einfuehren,
- Solvenz nur bei echten Nachfrage-/Produktions-Ticks und nicht bei jedem API-getriebenen Markttick fortschreiben.

Der wichtigste einzelne Punkt ist aber die Tickfrequenz. Die aktuelle Formel wirkt eher wie eine Tages- oder Stundensimulation, wird aber momentan wie eine Sekundensimulation gefahren.

## Senatsminen und BLUFOR-Regel

Senatsminen duerfen nur auf BLUFOR-Territorium entstehen. Diese Regel wird in `stateValidation.js` serverseitig erzwungen.

Der Server prueft dabei:

- Zielplanet gehoert GAR,
- Zielsektor ist nicht KUS,
- Zielsektor ist nicht neutral,
- Zielsektor ist nicht umkaempft,
- der abgeleitete Kontrollstatus ist `BLUFOR`.

Dadurch reicht es nicht, die UI zu umgehen: nicht erlaubte Senatsminen werden beim Speichern des Kampagnenzustands blockiert.
