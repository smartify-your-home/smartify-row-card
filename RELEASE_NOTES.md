# Smartify Energy Row Card 2.0.0

## Neuer Name und technische Umstellung
- Einheitliche HACS- und Home-Assistant-Bezeichnung: **Smartify Energy Row Card**
- Integrationsdomain: `smartify_energy_row_card`
- Lovelace-Kartentyp: `custom:smartify-energy-row-card`
- JavaScript-Ressource: `/smartify_energy_row_card/smartify-energy-row-card.js?v=2.0.0`
- HACS erhält mit diesem Release einen richtigen SemVer-Tag `v2.0.0`, statt einen Commit-Hash anzuzeigen.

## Funktionen
- Eigenständige Lovelace-Karte mit manuellem Modus, einmaligem Import und Live-Verknüpfung mit einer Smartify Flow Card.
- Erkennung von Flow Cards in klassischen Dashboards, Sections (auch auf der zweiten Ansicht) sowie verschachtelten Karten.
- Mehrere PV-Quellen, Netzsaldo mit einstellbarer Vorzeichenrichtung, Akku und Verbraucher.
- Theme-Anpassung, Schriftgrößen, Hintergrundtransparenz und automatische Umbrüche.

## Wichtig: Wechsel von 1.x auf 2.0.0
**Breaking Change:** Die technische Domain und der Kartentyp wurden umbenannt. Eine bestehende Row Card muss nach der Installation auf `type: custom:smartify-energy-row-card` umgestellt werden. Die Integration **Smartify Energy Row Card** muss unter Home Assistant Geräte & Dienste eingerichtet werden. Die neue Integration liest bisherige manuelle Slots beim ersten Start aus dem bisherigen HA-Store (sofern vorhanden). Die alte Integration erst danach entfernen.

## Validierung
Frontend-Syntax, Regressionstests sowie Integration-Metadaten-/Secret-Prüfungen laufen in GitHub Actions vor der Veröffentlichung. Live-Prüfungen im konkreten Home-Assistant-System sind damit nicht ersetzt.
