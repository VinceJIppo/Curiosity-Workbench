# Licensed brand fonts (not committed)

Drop licensed font files here (.woff2, .woff, .ttf or .otf). The build embeds
them as base64. File names decide the family:

- names containing `Plantijn` become `Martina Plantijn` (headlines)
- names containing `Atelier` become `AF Atelier Sans` (UI)

Weight comes from the name (Light 300, Regular 400, Medium 500, Semibold 600,
Bold 700); `Italic` sets the italic style. Without these files the app falls
back to Georgia and the system sans and says so in Settings.

This folder is gitignored except for this README.
