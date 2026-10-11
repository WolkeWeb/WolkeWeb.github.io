// Gemeinsame Konstanten für Spiel und Editor
const TILE = 40, SPEED = 5, GRAV = 0.65, JUMP = -11.5, PAD_MULT = 1.5, DT = 1000 / 60;
const CANVAS_W = 800, CANVAS_H = 400;
const LEVEL_COLS = 70, LEVEL_ROWS = 10; // Standardgröße eines Levels (siehe levels.js)
const START_COL = 3; // Spieler startet in dieser Spalte, eine Zeile über dem Boden
const CUSTOM_KEY = 'customLevel'; // localStorage: Level als JSON-Array von Zeilen-Strings
const TILE_TYPES = { '.': 'Leer', '#': 'Block', '^': 'Spike', 'o': 'Jump-Pad', 'O': 'Orb', '|': 'Ziel' };

// Portale: Farbe + Symbol. S/C = Schiff/Würfel, U/N = Schwerkraft umgekehrt/normal, 1–4 = Tempostufen (SPEEDS × SPEED), > / < = Alias für 3 / 1
const SPEEDS = [1, 1.2, 1.4, 1.7];
const SPEED_CH = { '1': 1, '2': 2, '3': 3, '4': 4, '<': 1, '>': 3 }; // Tile -> Stufe
const PORTALS = { S: ['#ff4fd8', ''], C: ['#4fe8ff', ''], U: ['#b84fff', '↑'], N: ['#4fff9a', '↓'], '1': ['#6fa0ff', '1'], '2': ['#4fe86f', '2'], '3': ['#ffd23d', '3'], '4': ['#ff4f4f', '4'], '>': ['#ffd23d', '»'], '<': ['#6fa0ff', '«'] };
const PPS = SPEED * 1000 / DT; // Pixel pro Sekunde bei Normaltempo

// Position <-> Musikzeit. x = linke Kante des Spielers; Zeit 0 = Startposition (START_COL * TILE).
// level = Zeilen (Strings oder Zeichen-Arrays). segs (optional) = speedSegs(level), spart das erneute Scannen.
function speedSegs(level) { // [{x, spd}]: ab Spieler-x > x gilt spd; Wechsel, sobald der Spieler die Portalspalte berührt
  const segs = [{ x: -Infinity, spd: 1 }], cols = Math.max(0, ...level.map(r => r.length));
  for (let c = 0; c < cols; c++) {
    let lv = 0; // höchste Stufe in der Spalte gewinnt (wie applyPortals in game.js)
    for (const row of level) lv = Math.max(lv, SPEED_CH[row[c]] || 0);
    const spd = lv ? SPEEDS[lv - 1] : 0;
    if (spd && spd !== segs[segs.length - 1].spd) segs.push({ x: (c - 1) * TILE, spd });
  }
  return segs;
}
function speedAtX(level, x, segs = speedSegs(level)) {
  let s = 1;
  for (const g of segs) if (g.x < x) s = g.spd;
  return s;
}
function timeAtX(level, x, segs = speedSegs(level)) { // Sekunden seit Start (negativ links davon)
  const x0 = START_COL * TILE, a = Math.min(x, x0), b = Math.max(x, x0);
  let t = 0;
  segs.forEach((g, i) => {
    const s = Math.max(a, g.x), e = Math.min(b, i + 1 < segs.length ? segs[i + 1].x : Infinity);
    if (e > s) t += (e - s) / (PPS * g.spd);
  });
  return x < x0 ? -t : t;
}
function xAtTime(level, t, segs = speedSegs(level)) { // Umkehrung von timeAtX
  const x0 = START_COL * TILE, n = segs.length, end = i => i + 1 < n ? segs[i + 1].x : Infinity;
  let rem = Math.abs(t);
  if (t >= 0) {
    for (let i = 0; i < n; i++) {
      const s = Math.max(x0, segs[i].x), e = end(i), v = PPS * segs[i].spd;
      if (e <= s) continue;
      if (rem <= (e - s) / v) return s + rem * v;
      rem -= (e - s) / v;
    }
  } else {
    for (let i = n - 1; i >= 0; i--) {
      const s = segs[i].x, e = Math.min(x0, end(i)), v = PPS * segs[i].spd;
      if (e <= s) continue;
      if (rem <= (e - s) / v) return e - rem * v;
      rem -= (e - s) / v;
    }
  }
  return NaN;
}
