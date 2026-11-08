# Smartify Energy Row Card 2.0.1

## Flow Card verknüpfen – Fehlerbehebung
- Beim Ändern des Dashboard-Pfads wird die Flow-Card-Konfiguration sofort erneut geladen; zuvor war die Neuabfrage abhängig von einem nachfolgenden Home-Assistant-`hass`-Update.
- Dashboard-Pfade und vollständige URLs werden unterstützt. Für `/dashboard-energiemanager/s-f-c` wird auf der Ansicht `s-f-c` gesucht.
- Neuer Button **Verbindung prüfen** im visuellen Editor mit konkreten Fehlercodes und Fundzahl.
- Unterschiedliche Meldungen für nicht verfügbare Sensordaten und nicht gefundene Flow Cards.
- Regressionstests für URL/View-Auswahl, WebSocket-Fehler und setConfig-Refresh.

## Bedienung
Dashboard-Pfad `/dashboard-energiemanager/s-f-c`, Flow Card Nummer `1`. Nach der Installation HACS aktualisieren und Home Assistant neu starten; bei Problemen **Verbindung prüfen** öffnen und den Fehlertext kontrollieren.

Ältere Versionshistorie und Breaking-Change-Hinweise siehe README.
