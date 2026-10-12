# GD-Clone

Geometry-Dash-artiger Runner. Läuft auf GitHub Pages (wolkeweb.github.io/gd-clone).

## Regeln
- Vanilla JS + Canvas, kein npm, keine Frameworks, kein Build.
- Nur die Dateien ändern, die im Prompt genannt sind. Physik nur anfassen, wenn ausdrücklich verlangt.
- Alle Pfade relativ (kein führendes `/`), sonst bricht GitHub Pages.
- Kurze Zusammenfassung der Änderung, keine langen Erklärungen.
- Nicht selbst testen, keinen Browser öffnen. Ich teste selbst.
- Erst gezielt suchen (grep nach Funktionsnamen), nicht ganze Dateien lesen.

## Dateien
- `config.js`: gemeinsame Konstanten (TILE, SPEED, GRAV, JUMP, PAD_MULT, DT, START_COL, SPEEDS, PORTALS, TILE_TYPES, MAX_COINS) + `speedSegs`/`speedAtX`/`timeAtX`/`xAtTime` (Position ↔ Musikzeit inkl. Tempo-Portale). Von Spiel und Editor genutzt.
- `levels.js`: `LEVELS`: Grid-Level (Array aus Zeilen-Strings) oder Rezept-Level `{ name, music, bpm, offset, seed, sections: [{ mode, bars, difficulty, speed }] }`.
- `patterns.js`: Muster (`PATTERNS`, `MODES`), Levelbau aus Rezepten (`buildLevel`, `levelGrid`, `recipeStart`), Münzplatzierung (`placeCoins`), Flugbahn-Helfer (`arc`, `flight`, `airTicks`, `shipTicks`), Seed-RNG (`mulberry`). Von Spiel und Editor genutzt.
- `game.js`: Spiel. Zustände `menu/levels/icons/play/dead/won`; Physik in `update()`, `updateShip()`, `updateWave()`; Rendering in `draw()`; Menüs (`drawMenu`, `goLevels`, `goIcons`); Endlos (`startEndless`, `endlessChunk`), Tageslevel (`dailyLevel`); Übungsmodus/Checkpoints; Audio (`playMusic`, `unlockAudio`, Bass-Analyser); Loop mit festem Timestep (`loop`, `acc`).
- `editor.js` / `editor.html`: Leveleditor. Palette (`PALETTE`), Malen (`paint`), Undo/Redo, Wellenform + Beat-Raster (`drawWave`, `drawBeats`), BPM-Erkennung (`detectBpm`), Generator (`generateLevel`), Speichern/Teilen/Ab-hier-testen.
- `index.html`: lädt config → levels → patterns → game.
- `audio/`: `music.mp3`, `death.wav`.

## Tiles
`.` leer · `#` Block · `^` Spike · `o` Jump-Pad · `O` Orb · `*` Münze (max. 3) · `|` Ziel
Portale: `S` Schiff · `C` Würfel · `W` Welle · `U`/`N` Schwerkraft umgekehrt/normal · `1`–`4` Tempostufen (`>`/`<` = Alias 3/1)

## localStorage-Keys
`customLevel` (eigenes Level) · `gdBest.<level>` · `gdCoins.<level>` · `gdBestT.endless` · `gdIcon`
