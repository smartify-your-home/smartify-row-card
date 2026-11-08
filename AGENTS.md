# AGENTS.md – verbindliche Entwicklungs- und Release-Regeln

Dieses Dokument gilt für **jede** Änderung an Smartify Energy Row (SER), einschließlich Code, Übersetzungen, Dokumentation und Konfiguration. Es ist **keine** bloße Featureliste. Neue Features müssen passende automatische Prüfungen erhalten.

## 1. Pflichtlektüre vor jeder Änderung

1. `AGENTS.md` vollständig lesen, anschließend `README.md`, `custom_components/smartify_energy_row/manifest.json`, die betroffenen Dateien, `tests/` und `.github/workflows/`.
2. Den aktuellen `main`-HEAD, offenen PRs und letzten tatsächlich veröffentlichten GitHub-Release prüfen. Keine unbestätigten Tests oder Releases behaupten.
3. Bei Änderungen an der Flow-Card-Anbindung das **aktuelle** Quellformat in `smartify-your-home/smartify-flow-card` prüfen (insbesondere `solar.plants`, `grid.mode`, `positive_import`, `battery.invert`, Label-Erkennung). Es darf nicht stillschweigend auf einem alten Schema beruhen.
4. Bestehende Nutzer-Konfigurationen unverändert erhalten oder eine explizite, getestete und dokumentierte Migration bereitstellen.

## 2. Architektur, Datenhoheit und Integration

- Eigenständige Home-Assistant-Integration; Kartentyp bleibt `custom:smartify-energy-row`. HACS-Installationsweg und automatische Ressourcenregistrierung dürfen nicht ausfallen.
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
1. `node --check custom_components/smartify_energy_row/frontend/smartify-energy-row.js`.
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
