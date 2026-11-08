# Arbeitsregeln Smartify Energy Row
- Vor jeder Änderung README, aktuelle manifest-Version, Frontend und relevante Tests lesen; zuletzt veröffentlichten GitHub-Stand prüfen.
- Keine Tokens oder Zugangsdaten ins Repository übernehmen.
- Separater Kartentyp `custom:smartify-energy-row` muss eigenständig funktionieren.
- Quellen: link (live aus Lovelace-Flow-Konfiguration), import (einmalige Kopie), manual (eigenständige HA-Storage-Konfiguration). Keine stille Fallback-Quelle bei fehlendem Link.
- PV-Anlagen summieren, Vorzeichen des Netzsaldo-Sensors beachten; Batterie laden/entladen sauber unterscheiden, ungültige Zustände nie zu 0 umdeuten.
- Themes, Hintergründe und Schriftgrößen konsistent zur Flow Card; Transparenz darf Texte und Bedienelemente nicht beeinflussen.
- Original-Slots, Icons, Wärmepumpen-Overlay und Klickhandlung erhalten. Tests vor Release.
