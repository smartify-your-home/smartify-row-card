# Smartify Energy Row Card

Eigenständige Home-Assistant-Integration mit kompakter Energieleiste und visueller Konfiguration. **Kein Zugangstoken im Frontend**.

## Installation (HACS)

1. In HACS unter benutzerdefinierte Repositories `https://github.com/smartify-your-home/smartify-row-card` als **Integration** hinzufügen.
2. Installieren, Home Assistant neu starten.
3. Unter **Einstellungen → Geräte & Dienste** die Integration **Smartify Energy Row Card** einmalig hinzufügen.
4. In einem Dashboard `custom:smartify-energy-row-card` als Karte hinzufügen. Die JS-Ressource wird im Lovelace-Storage-Modus automatisch registriert.

Bei YAML-Lovelace-Ressourcen diese URL als JavaScript-Modul eintragen:
`/smartify_energy_row_card/smartify-energy-row-card.js?v=2.0.0`.

## Datenquellen im Karteneditor

- **Mit Flow Card verknüpfen:** Dashboard-Pfad angeben (z. B. `lovelace` für das Standard-Dashboard, sonst den URL-Pfad ohne führenden Schrägstrich). Wird beim Start und danach periodisch gelesen. Bei mehreren Flow Cards Index 1, 2, … auswählen; Änderungen der Quellkarte werden automatisch nachgeladen.
- **Einmalig importieren:** Gleiche Quellparameter, danach werden die Geräte als eigene Row-Card-Slots übernommen und sind unabhängig.
- **Manuell:** Vorhandene sechs Standard-Slots weiterhin im Editor einstellen; die Einstellungen werden über den Integrations-WebSocket in HA-Storage gespeichert. Für alle Dashboards gilt dieselbe manuelle Konfiguration.

Die Übernahme unterstützt `solar.plants[]` (PV-Leistungen summiert), `grid.mode=saldo` mit `positive_import`, getrennte Netzsensoren, Batteriespeicher inklusive `invert`, explizite und über Labels erkannte Verbraucher. Die Row Card übernimmt im verknüpften Modus die Reihenfolge aus der Quellkonfiguration und ergänzt explizite sowie per Label erkannte Verbraucher. **Eigene Reihenfolge- und Sichtbarkeitsfilter für verknüpfte Slots sind noch nicht im Editor umgesetzt.** Im manuellen Modus bleiben die bestehenden Slot-Einstellungen verfügbar.

## Darstellung

Theme-basierte Schriftfarben und Flächen, optional eigene Farbverläufe, Hintergrundtransparenz von 0–100 % und frei einstellbare Schriftgrößen für Wert und Namen. Transparenz betrifft ausschließlich Hintergrundflächen. Mobile Breiten erlauben Zeilenumbruch ohne Überlauf. Wärmepumpen-Overlay (Warmwasser/Abtauen) und Klick auf Entität erhalten.

## Hinweise

Wenn eine verknüpfte Flow Card verschoben oder gelöscht wird, zeigt die Row Card einen Konfigurationshinweis an, statt auf falsche Entitäten zu wechseln. Nach dem Umstieg alte, manuell registrierte `/local/smartify-energy-row.js`-Ressourcen und die alte Integration entfernen, um doppelte Kartentypen zu vermeiden.

Es werden keine Hardware-Steuerbefehle gesendet. Zur Sicherheit sind Konfigurationsänderungen im gemeinsamen Speicher auf HA-Administratoren begrenzt.

## Entwicklungsstatus und Prüfungen

Der Quellcode enthält `AGENTS.md` mit verbindlichen Entwicklungs- und Release-Regeln sowie CI unter `.github/workflows/validation.yml`. Die Tests prüfen JavaScript-Syntax, Messwertumrechnung (PV, Netzsaldo, getrennte Netzsensoren, Akku), Slot-Import, Label-Erkennung, fehlende Werte, HTML-Escaping und die Integration-Metadaten. 

**Hinweis:** Das Vorhandensein dieser CI-Datei bestätigt noch keinen erfolgreichen GitHub-Actions-Lauf. Vor einem ersten Release sind die tatsächlichen Prüfergebnisse in GitHub Actions und ein realer Home-Assistant-Test einschließlich HACS-Installationsweg, WebSocket-Storage und Karteneditor zu kontrollieren. Bei einem neu angelegten Repository können Actions zunächst deaktiviert sein.

Aktuelle Einschränkungen: Die Live-Verknüpfung verwendet Dashboard-Pfad und Flow-Card-Index (kein stabiler Karten-Identifier). Das bedeutet, dass das Verschieben der Quellkarte die Zuordnung ändern kann. Die automatische Konfigurationsabfrage ist zeitlich begrenzt und erfolgt nicht als echtes Push-Ereignis; Änderungen erscheinen erst bei der nächsten Abfrage. Individuelle Sichtbarkeit/Reihenfolge für verknüpfte Verbraucher wird erst in einem folgenden Ausbau unterstützt.

## Dashboard-Pfad für Sections (Fix 1.0.1)

Beispiel: Die Flow Card liegt unter `/dashboard-energiemanager/s-f-c` (zweite Ansicht). Im Row-Card-Editor **Dashboard-Pfad: `dashboard-energiemanager`**, **Flow Card Nummer: `1`**, sofern es die erste Flow Card im gesamten Dashboard ist. `s-f-c` ist der Ansichtspfad und gehört nicht ins Feld.

Seit 1.0.1 werden auch `views[].sections[].cards[]` (Sections-Dashboard) und verschachtelte Karten/Stacks durchsucht. Die Suche verwendet die gespeicherte Lovelace-Konfiguration des angegebenen Dashboards; wird die Flow Card nicht gefunden, nennt die Fehlermeldung jetzt den ausgewählten Dashboard-Pfad. Nach einem Update ggf. HA neu starten, Dashboard neu laden und die automatisch registrierte Ressource `/smartify_energy_row_card/smartify-energy-row-card.js?v=2.0.0` prüfen.

**Einheitliche technische Bezeichnung ab 2.0.0:** Domain `smartify_energy_row_card`, Kartentyp `custom:smartify-energy-row-card`, Ressource `/smartify_energy_row_card/smartify-energy-row-card.js`. GitHub-Repository-URL bleibt unverändert.

## Migration von der früheren Smartify Energy Row

Version 2.0.0 ist eine **technische Umbenennung** (neue Integrations-Domain). Alte Dashboard-Karten mit `type: custom:smartify-energy-row` müssen einmalig auf `type: custom:smartify-energy-row-card` geändert werden. Nach HACS-Installation muss die neue Integration **Smartify Energy Row Card** unter Geräte & Dienste erneut hinzugefügt werden. Das neue Backend übernimmt vorhandene manuelle Slots beim ersten Start aus dem früheren HA-Store `smartify_energy_row.settings`, soweit dieser noch existiert. Deine per Lovelace-Kartenkonfiguration gespeicherten Einstellungen (Dashboard-Pfad, Modus, Schriftgrößen und Transparenz) bleiben erhalten, wenn du die alte Karte nur umbenennst. Die alte Integration und Ressource sollten erst nach erfolgreicher Migration entfernt werden. Es gibt **keine automatische Umbenennung von vorhandenen Dashboard-Kartentypen**.
