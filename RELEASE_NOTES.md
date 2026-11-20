# Smartify Energy Row Card 2.2.0

- **Tageswerte (optional):** `show_today: true` zeigt in jeder Kachel ein kleineres Icon und daneben die Energie seit Mitternacht (kWh). Die aktuelle Leistung bleibt der große Wert. Standard: aus – bestehende Karten sehen unverändert aus.
- Quelle je Slot `entity_today` (Tages- oder Gesamtzähler, Wert aus der Recorder-Statistik des Kalendertags). Leer: automatisch der einzige Energiezähler am Gerät des Leistungssensors; bei mehreren wird nicht geraten.
- Netz/Akku zusätzlich `entity_today_secondary` (Einspeisung bzw. Ladung), Anzeige `Bezug / Einspeisung kWh`.
- Neue Optionen `today_icon_size` (16) und `font_size_today` (12), im Profil und pro Karte; Editor-Felder je Slot mit Auswahl nur passender Energie-Sensoren.
- Aktualisierung alle 5 Minuten; fehlende Statistik wird als `–` angezeigt, nie als 0.

## Vorherige Version: 2.1.1

- **Weniger Last im Browser:** Die Karte zeichnet nur noch neu, wenn sich eine angezeigte Entität ändert. Bisher wurde sie bei jeder beliebigen Zustandsänderung in Home Assistant komplett neu aufgebaut.
- **Profile nach HA-Neustart:** Schlägt das Laden der Profile fehl (z. B. weil Home Assistant noch startet), versucht die Karte es alle 5 Sekunden erneut, statt bis zum Neuladen „Bitte Entitäten im Editor konfigurieren“ zu zeigen.
- **Schnelleres Laden:** Die Kartendatei wird mit Cache-Headern ausgeliefert (URL ist über `?v=` versioniert). Das verkürzt die Zeit, in der Home Assistant beim Seitenaufbau kurz „Konfigurationsfehler“ zeigen kann.
- `manifest.json`: `http` und `lovelace` als Abhängigkeiten, damit die Ressource beim Start zuverlässig registriert wird.
- `getGridOptions()` für aktuelle Home-Assistant-Versionen (Sections-Dashboards); `getLayoutOptions()` bleibt für ältere Versionen.
- Keine Änderung an Konfiguration, Profilen oder Darstellung. Nach dem Update Home Assistant neu starten und Dashboard/App einmal neu laden.

## Vorherige Version: 2.1.0

- **Profile:** Slots und Darstellung zentral in HA gespeichert (`profile: standard`). Änderungen gelten sofort für alle Karten mit diesem Profil.
- **Abweichungen pro Karte:** jede Option und einzelne Slot-Felder (z. B. `hidden: true`) lassen sich nur für eine Karte überschreiben. Editor mit Umschalter „Profil / Nur diese Karte“, Reset ↺ und „Abweichungen ins Profil übernehmen“.
- **Poolpumpe** wieder als Standard-Slot mit dreistufiger Farbe; Schwellen `threshold_mid`/`threshold_high` für Pool- und Wärmepumpe einstellbar.
- Neue Optionen: `icon_size`, `show_unit` (auto/immer/nie inkl. automatischer Schriftanpassung), `value_format` (auto/W/kW), `bar_position` (oben/unten/aus), `bar_style` (Akzent/Verlauf), `bar_height`, `border_radius`, `slot_border`, `text_color`.
- **E-Paper/Themes:** `--smartify-energy-row-text-color`, `-slot-background`, `-slot-shadow`, `-slot-border-radius`, `-overlay-background` haben Vorrang.
- Alte v4.x-Kartenkonfigurationen (`slots:`-Liste im YAML) funktionieren nach Umbenennung des Kartentyps unverändert weiter.
- Dienste `smartify_energy_row_card.set_profile` und `delete_profile` (nur Administratoren); WebSocket `save_profile`/`delete_profile` mit Validierung.
- Migration: gespeicherte Slots aus 2.0.x erscheinen als Profil `standard`, ohne Altdaten zu verändern.
- Neue automatische Tests für Profilauflösung, Overrides, Poolpumpe, Werteformat, Balken, Radius und Theme-Variablen.
