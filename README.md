# Smartify Energy Row

Eigenständige Home-Assistant-Integration mit kompakter Energieleiste und visueller Konfiguration. **Kein Zugangstoken im Frontend**.

## Installation (HACS)

1. In HACS unter benutzerdefinierte Repositories `https://github.com/smartify-your-home/smartify-row-card` als **Integration** hinzufügen.
2. Installieren, Home Assistant neu starten.
3. Unter **Einstellungen → Geräte & Dienste** die Integration **Smartify Energy Row** einmalig hinzufügen.
4. In einem Dashboard `custom:smartify-energy-row` als Karte hinzufügen. Die JS-Ressource wird im Lovelace-Storage-Modus automatisch registriert.

Bei YAML-Lovelace-Ressourcen diese URL als JavaScript-Modul eintragen:
`/smartify_energy_row/smartify-energy-row.js?v=1.0.0`.

## Datenquellen im Karteneditor

- **Mit Flow Card verknüpfen:** Dashboard-Pfad angeben (z. B. `lovelace` für das Standard-Dashboard, sonst den URL-Pfad ohne führenden Schrägstrich). Wird beim Start und danach periodisch gelesen. Bei mehreren Flow Cards Index 1, 2, … auswählen; Änderungen der Quellkarte werden automatisch nachgeladen.
- **Einmalig importieren:** Gleiche Quellparameter, danach werden die Geräte als eigene Row-Card-Slots übernommen und sind unabhängig.
- **Manuell:** Vorhandene sechs Standard-Slots weiterhin im Editor einstellen; die Einstellungen werden über den Integrations-WebSocket in HA-Storage gespeichert. Für alle Dashboards gilt dieselbe manuelle Konfiguration.

Die Übernahme unterstützt `solar.plants[]` (PV-Leistungen summiert), `grid.mode=saldo` mit `positive_import`, getrennte Netzsensoren, Batteriespeicher inklusive `invert`, explizite und über Labels erkannte Verbraucher. Die Reihenfolge und Sichtbarkeit können in der Row Card separat eingestellt werden.

## Darstellung

Theme-basierte Schriftfarben und Flächen, optional eigene Farbverläufe, Hintergrundtransparenz von 0–100 % und frei einstellbare Schriftgrößen für Wert und Namen. Transparenz betrifft ausschließlich Hintergrundflächen. Mobile Breiten erlauben Zeilenumbruch ohne Überlauf. Wärmepumpen-Overlay (Warmwasser/Abtauen) und Klick auf Entität erhalten.

## Hinweise

Wenn eine verknüpfte Flow Card verschoben oder gelöscht wird, zeigt die Row Card einen Konfigurationshinweis an, statt auf falsche Entitäten zu wechseln. Die ursprüngliche `/local/smartify-energy-row.js`-Ressource sollte nach Umstieg aus Lovelace entfernt werden, um doppelte Registrierungen zu vermeiden.

Es werden keine Hardware-Steuerbefehle gesendet. Zur Sicherheit sind Konfigurationsänderungen im gemeinsamen Speicher auf HA-Administratoren begrenzt.
