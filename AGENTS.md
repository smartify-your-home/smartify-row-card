# AGENTS.md – verbindliche Entwicklungs- und Release-Regeln

Dieses Dokument gilt für **jede** Änderung an Smartify Energy Row Card (SERC), einschließlich Code, Übersetzungen, Dokumentation und Konfiguration. Es ist **keine** bloße Featureliste. Neue Features müssen passende automatische Prüfungen erhalten.

## 1. Pflichtlektüre vor jeder Änderung

1. `AGENTS.md` vollständig lesen, anschließend `README.md`, `custom_components/smartify_energy_row_card/manifest.json`, die betroffenen Dateien, `tests/` und `.github/workflows/`.
2. Den aktuellen `main`-HEAD, offenen PRs und letzten tatsächlich veröffentlichten GitHub-Release prüfen. Keine unbestätigten Tests oder Releases behaupten.
3. Bei Änderungen an der Flow-Card-Anbindung das **aktuelle** Quellformat in `smartify-your-home/smartify-flow-card` prüfen (insbesondere `solar.plants`, `grid.mode`, `positive_import`, `battery.invert`, Label-Erkennung). Es darf nicht stillschweigend auf einem alten Schema beruhen.
4. Bestehende Nutzer-Konfigurationen unverändert erhalten oder eine explizite, getestete und dokumentierte Migration bereitstellen.

## 2. Architektur, Datenhoheit und Integration

- Eigenständige Home-Assistant-Integration; Kartentyp bleibt `custom:smartify-energy-row-card`. HACS-Installationsweg und automatische Ressourcenregistrierung dürfen nicht ausfallen.
- **Drei wählbare Modi:** `manual`, `import`, `linked`.
  - **manual:** eigene, im HA-Store gespeicherte Konfiguration; keine Pflicht zur Flow Card.
  - **import:** einmalige Übernahme als eigener Snapshot. Nach dem Import dürfen neu hinzugefügte Verbraucher auch nach einem HA-Neustart **nicht** verschwinden. Daten werden danach nicht automatisch überschrieben.
  - **linked:** liest die konfigurierte Flow Card des explizit gewählten Dashboard-Pfads und Kartenindexes. Änderungen werden nachgezogen. Fehlende/gelöschte Quelle erzeugt einen sichtbaren Fehler; **kein stilles Fallback** auf andere Daten und keine Änderung der gespeicherten manuellen Slots.
- Flow-Card-Konfiguration nur lesen; niemals ohne Auftrag andere Dashboard-Konfiguration oder Flow-Card-Entitäten verändern.
- Gleiche Sensoren/Namen/Icons dürfen synchronisiert werden; Reihenfolge, Sichtbarkeit, Zeilenhöhe, Themes und Schriftgrößen bleiben je Row-Card-Instanz separat. Wenn diese Optionen noch fehlen, in Dokumentation ehrlich als offen kennzeichnen.
- Konfiguration getrennt nach *gemeinsam* (manuelle Slots in HA-Storage) und *pro Karte* (Lovelace-Kartenkonfiguration). Adminrechte vor gemeinsamen Schreibzugriffen prüfen; Save-Fehler anzeigen statt Erfolg zu behaupten.
- Keine Manipulation von Lovelace-Elternknoten, um andere Karten nicht zu beeinflussen; Ressourcenregistrierung idempotent und keine Löschung fremder Ressourcen.

## 3. Sensorwerte, Budget und Datenkorrektheit

- PV: `solar.plants[]` berücksichtigen, Leistung **aller** konfigurierten PV-Sensoren korrekt als W summieren (W/kW/MW). Bereits vorhandenes `solar.power` als Legacy-Fallback lesen. Sensoren nicht doppelt zählen.
- Netz: `grid.mode=saldo` mit einem signierten Sensor, `positive_import` korrekt umsetzen. Bei separaten Sensoren Import/Export unterschiedlich führen; Vorzeichen und Richtung in Display und Icons konsistent.
- Akku: `battery.invert` beachten; Lade-/Entlade-Vorzeichen eindeutig dokumentieren und testen. Hausverbrauch nur aus vollständig verfügbaren Messwerten berechnen, **keine Null aus unbekannten Werten**.
- Fehlende, `unknown`, `unavailable`, leere, NaN- und Infinity-Werte werden als fehlend behandelt; nicht zu 0 umdeuten. Bei unvollständigen Quellwerten lieber `–` als eine erfundene Summe.
- Verbraucher: explizit konfigurierte Sensoren plus HA-Label `verbraucher`, ohne Duplikate. `excluded_consumers` beachten. Zusätzliche importierte Verbraucher sind nicht auf die sechs alten Standard-Slots beschränkt.
- Bestehende Wärmepumpen-Overlays (Warmwasser/Abtauen) und Klick auf Entitätsdetails dürfen durch neue Quellenmodi nicht verloren gehen.

## 4. Design, Themes, Bedienbarkeit

- Standardmäßig HA-Theme: `--primary-text-color`, `--secondary-text-color`, `--ha-card-background`/`--card-background-color`, `--divider-color`, `--ha-card-border-radius` und geerbte HA-Schrift. Dark-, Light- und Glass-Themes berücksichtigen.
- Hintergrundtransparenz **0–100 %**, nur auf Hintergründe, nicht via `opacity` auf Text/Icon/ganze Karte; optional ursprüngliche Farbverläufe.
- Schriftgröße für Werte und Namen separat konfigurierbar; kein harter Größen-Override durch Themes. Auf schmalen Geräten Umbruch statt horizontalem Überlauf; wichtige Werte müssen lesbar bleiben.
- Editor und Drop-downs müssen auf Touch-Geräten nutzbar bleiben. Kein unbeabsichtigtes Aufklappen von Entitätensuchen und kein Scroll-/Pointer-Bug.
- Benutzereingaben in HTML-Templates konsequent escapen; insbesondere Entitätsnamen, Labels, Icons und Attribute. Keine untrusted Strings ohne Validierung als HTML/CSS/JS einsetzen.

## 5. Sicherheit, Geheimnisse und Zugriff

- Keine Tokens, JWTs, Passwörter, API-Keys, Cookies oder personenbezogene Testdaten in Quellcode, Tests, Logs, Beispielen oder Commits. Bei Leak aus bereits gepushten Historien Token widerrufen; bloßes Entfernen aus der aktuellen Datei reicht nicht.
- Frontend benötigt **keinen** fest eingebetteten Token. Nutze die authentifizierte Home-Assistant-WebSocket-Verbindung.
- Geteilte Konfiguration darf nur nach serverseitiger Berechtigungsprüfung verändert werden. Struktur, Größen und Typen vor dem Speichern validieren.
- Keine unbeabsichtigten Steuerbefehle: Row Card zeigt Werte an und öffnet HA-Entitätsdetails.
- Änderungen an HA-Persistenz müssen Neustart, Reload, parallele Editor-Instanzen und Fehlersituationen berücksichtigen; vorhandene Nutzer-Daten niemals still überschreiben.

## 6. Test- und Release-Gates (verpflichtend)

**Vor jeder Zusammenführung oder Veröffentlichung:**
1. `node --check custom_components/smartify_energy_row_card/frontend/smartify-energy-row-card.js`.
2. `node --test tests/*.test.cjs`: mindestens PV-Mehranlagen, W/kW/MW, Netzsaldo +/- und invertierte Richtung, getrennte Netzsensoren, Akku-Vorzeichen, fehlende Werte, Label/Deduplizierung, Import-Persistenz, Dashboard-Link-Auswahl und Fehler, HTML-Escaping, Registrierungen.
3. `python -m compileall -q custom_components` sowie JSON-/Manifest-/HACS-Konsistenzprüfung.
4. CI muss dieselben Gates ausführen und erfolgreich abschließen. **Datei mit Workflow-Schritten allein ist kein Beleg eines laufenden CI-Jobs.** Bei fehlenden Checks: nicht als getestet markieren; GitHub-Actions-Aktivierung prüfen.
5. Bei Änderungen an `__init__.py`, `config_flow.py` oder HA-Storage nach Möglichkeit Integrationstests in HA-Testumgebung sowie Hassfest/HACS-Validierung ergänzen. Ohne solche Tests klar als Restrisiko kennzeichnen.
6. Dokumentation, GitHub-Release-Notizen, Versionsangaben und `AGENTS.md` konsistent aktualisieren. Keine neue Version behaupten, bevor Tag und GitHub-Release tatsächlich nachweisbar sind.

**Pull-Request-Checkliste:** Anforderungen und Auswirkungen; mögliche Migration; Tests mit *tatsächlichem* Ergebnis und Links; Sicherheit/Datenschutz; UI auf Desktop und Smartphone; Release-Notizen.

## 7. Änderungsdisziplin

- Änderungen in kleinen, überprüfbaren Schritten; keine Versions- oder Release-Erhöhung ohne bestandene Checks.
- Bei Tests auf GitHub: immer letzten Commit-SHA kontrollieren, nicht auf Ergebnisse eines älteren Commits verlassen.
- `README.md`/HACS-Hinweise und Beispiele bei Features aktualisieren. Bekannte Einschränkungen nicht als fertig darstellen.
- Vor dem Fertigmelden echten GitHub-Stand (Commit/PR/Release-Tag) prüfen und über ungeprüfte Bereiche transparent informieren.

## Sections-Dashboards: Pflichtfall für Link- und Importtests
- Die Suche muss `views[].sections[].cards[]` ebenso wie klassische `views[].cards[]`, verschachtelte Stacks und Wrapper-Karten berücksichtigen. Beispielpfad `/dashboard-energiemanager/s-f-c`: Dashboard-Schlüssel `dashboard-energiemanager`, View `s-f-c` ist **keine** Kartenindex- oder Dashboard-Eingabe.
- Tests müssen eine Flow Card auf der zweiten Ansicht unter Sections finden und den Dashboard-Pfad `lovelace/config` exakt prüfen. Fehlerdiagnosen sollen den geprüften Pfad nennen.

## Einheitliche Produktbezeichnung
- Der für Nutzer sichtbare Name in HACS (`hacs.json`), HA (`manifest.json`, Flow-Titel, Übersetzungen) und im Lovelace-Kartenkatalog lautet **Smartify Energy Row Card**.
- Ab 2.0.0 sind Domain `smartify_energy_row_card`, JS `smartify-energy-row-card.js`, Ressourcenpfad `/smartify_energy_row_card/smartify-energy-row-card.js` und Kartentyp `custom:smartify-energy-row-card` verbindlich. Neue Implementierungen dürfen keine zweite alte Integrationsdomain enthalten; Ausnahme: dokumentierte und getestete Einmalmigration des alten HA-Storage. Tests prüfen die Metadaten auf Gleichheit.

## Konsistente Namen und Migration ab 2.0.0
- Alle sichtbaren Namen heißen **Smartify Energy Row Card**. Backend-Domain `smartify_energy_row_card`, Klassen `SmartifyEnergyRowCard*`, Frontend-Datei `smartify-energy-row-card.js`, Kartentyp `custom:smartify-energy-row-card`, WebSocket `smartify_energy_row_card/get`, `smartify_energy_row_card/save`, `smartify_energy_row_card/save_profile` und `smartify_energy_row_card/delete_profile`.
- HACS muss exakt **eine** Integration unter `custom_components/smartify_energy_row_card` finden. Alle Quell-, Workflow-, Dokumentations- und Testpfade müssen übereinstimmen.
- Migration: alte Konfigurationsdaten im HA-Storage (nur lesend) einmalig übernehmen, wenn neue Daten fehlen; alte Daten nicht löschen. Nutzer müssen Dashboard-Kartentyp und Integrationsinstallation explizit aktualisieren; keine stillen Änderungen an Lovelace-Dashboards.

## Verbindungsdiagnose (2.0.1)
- Jede Änderung an Dashboard-/Ansichtspfad oder Flow-Card-Nummer muss eine **sofortige** Neuabfrage auslösen, unabhängig davon, ob Lovelace den `hass`-Setter erneut aufruft. Laufende veraltete Requests dürfen neuere Konfigurationen nicht überschreiben.
- Vollständige HA-URLs, `/dashboard-energiemanager/s-f-c` und `dashboard-energiemanager` müssen funktionieren. Mit Angabe der Ansicht nur diese durchsuchen; ohne Ansicht alle Views.
- Der Editor muss einen manuellen Verbindungstest mit Erfolgsmeldung (gefundene Quellen) und verwertbarem Fehlercode/-text bieten. Tests müssen diese Fälle abdecken.

## Farbkennzeichnungen (2.0.2)
- Theme-Stil muss **immer sichtbare Akzentmarkierungen** an den Kacheln zeigen. Transparenz darf nur Hintergrundflächen beeinflussen, nicht die Akzentfarbe.
- PV gelb, Netzbezug orange, Netzeinspeisung türkis, Akkuladung hellblau, Akkuentladung grün; Verbraucher übernehmen gültige Hex-Farben der Flow Card. Farb-Eingaben gegen CSS-Injektion validieren.
- Original-Farbverläufe bleiben als alternative Darstellung; Regressionstests für alle Richtungen und Modi sind verpflichtend.

## Globaler Verbraucher-Anzeigefilter (2.0.3)
- Pro Row-Card-Instanz müssen `hide_low_power_devices` (standardmäßig false) und `device_display_threshold_w` (Watt, >= 0) im Editor und YAML funktionieren.
- Filter gilt nur für Geräte/Verbraucher in manual/import/linked; PV, Hausverbrauch, Netz und Akku werden nicht global ausgeblendet. Bestehende individuelle `hide_below`-Grenzen bleiben wirksam.
- Anzeige bei |Leistung| >= Grenzwert, darunter ausblenden; kW/MW in W umrechnen. Fehlende/ungültige Werte bleiben ungültig, nicht Null. Regressionstests für Standard-off, Grenzwert-Gleichheit und negative Leistung.

## Profile und Abweichungen pro Karte (2.1.0)
- Auflösung immer **Standardwerte → Profil (HA-Storage) → Lovelace-Kartenkonfiguration**. Karten-Overrides in `slots:` sind Teil-Objekte je `id`; nicht genannte Felder kommen aus dem Profil.
- Alte v4.x-`slots:`-Listen müssen ohne Profil weiter funktionieren (Regressionstest). Gespeicherte 2.0.x-`slots` erscheinen read-only als Profil `standard`; nie still überschreiben.
- Profilnamen nur `[a-z0-9_-]{1,40}`; Schreiben (WebSocket und Dienste) nur für Administratoren, serverseitig validiert (Typen, max. 50 Profile, 200 Slots, 256 kB).
- Darstellungsoptionen (`icon_size`, `show_unit`, `value_format`, `bar_position`, `bar_style`, `bar_height`, `border_radius`, `slot_border`, `text_color`) müssen in Profil und Karte gleich wirken. `bar_position: none` ist eine bewusste Abwahl der Akzentmarkierung; Standard bleibt `top`.
- Theme-Variablen `--smartify-energy-row-*` (E-Paper) haben Vorrang vor Profil- und Kartenwerten.
- README-Bilder liegen unter `docs/images/` und sind bei sichtbaren Änderungen neu zu erzeugen.

## Render-Signatur, Profil-Retry und Cache (2.1.1)
- Der `hass`-Setter darf nicht bei jeder Zustandsänderung neu zeichnen. `_render()` merkt sich in `this._sig` die Zustandsobjekte aller angezeigten Entitäten (`slotEntityIds`: `entity`, `entity_secondary`, `entity_activity`, `entities[]`); `_needsRender()` vergleicht per Identität. Liest ein neues Feature weitere Entitäten, MÜSSEN sie in `slotEntityIds` aufgenommen werden, sonst aktualisiert sich die Anzeige nicht. Im Linked-Modus zusätzlich bei geänderter Entitäts-/Label-Registry. `setConfig`, Store-/Flow-Laden und Reload-Event zeichnen weiterhin immer.
- Fehlgeschlagenes Laden der Profile (`wsGet` liefert `null`) wird nach `STORE_RETRY_MS` erneut versucht; kein dauerhafter Zustand „nicht geladen“.
- Die Kartendatei wird mit `StaticPathConfig(..., True)` (langlebiger Browser-Cache) ausgeliefert. Nur sicher, weil die Ressourcen-URL `?v=<VERSION>` trägt: jede veröffentlichte JS-Änderung braucht eine neue Manifest-Version.
- Die Karte nicht über `add_extra_js_url` einbinden: Extra-JS im `<head>` kann vor dem Custom-Element-Polyfill des HA-Frontends laufen und erzeugt dann dauerhaft „Konfigurationsfehler“ (siehe smartify-energy-pro 0.3.62). Test in `tests/test_repository.py`.
- `getGridOptions()` ist die aktuelle HA-API; `getLayoutOptions()` bleibt nur für ältere Versionen.
