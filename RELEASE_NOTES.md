# Smartify Energy Row Card 2.1.0

- **Profile:** Slots und Darstellung zentral in HA gespeichert (`profile: standard`). Änderungen gelten sofort für alle Karten mit diesem Profil.
- **Abweichungen pro Karte:** jede Option und einzelne Slot-Felder (z. B. `hidden: true`) lassen sich nur für eine Karte überschreiben. Editor mit Umschalter „Profil / Nur diese Karte“, Reset ↺ und „Abweichungen ins Profil übernehmen“.
- **Poolpumpe** wieder als Standard-Slot mit dreistufiger Farbe; Schwellen `threshold_mid`/`threshold_high` für Pool- und Wärmepumpe einstellbar.
- Neue Optionen: `icon_size`, `show_unit` (auto/immer/nie inkl. automatischer Schriftanpassung), `value_format` (auto/W/kW), `bar_position` (oben/unten/aus), `bar_style` (Akzent/Verlauf), `bar_height`, `border_radius`, `slot_border`, `text_color`.
- **E-Paper/Themes:** `--smartify-energy-row-text-color`, `-slot-background`, `-slot-shadow`, `-slot-border-radius`, `-overlay-background` haben Vorrang.
- Alte v4.x-Kartenkonfigurationen (`slots:`-Liste im YAML) funktionieren nach Umbenennung des Kartentyps unverändert weiter.
- Dienste `smartify_energy_row_card.set_profile` und `delete_profile` (nur Administratoren); WebSocket `save_profile`/`delete_profile` mit Validierung.
- Migration: gespeicherte Slots aus 2.0.x erscheinen als Profil `standard`, ohne Altdaten zu verändern.
- Neue automatische Tests für Profilauflösung, Overrides, Poolpumpe, Werteformat, Balken, Radius und Theme-Variablen.
