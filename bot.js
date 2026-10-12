// Physik-Simulation ohne Rendering, Audio oder localStorage + Spielbarkeits-Bot (von index.html und editor.html geladen, nach patterns.js).
// step(s, held, pressed, w) ist ein Tick von update() in game.js; game.js nutzt dieselbe Funktion.
// s = Spielerzustand (x, y, vy, ground, grav, spd, ship, wave, …, orbs/coins als Sets, copy-on-write), held/pressed = wirksame Eingabe,
// w = Sicht auf das Level { tile(c, r), colHas(c, ch), ROWS, COLS, coinIdx }. Rückgabe: 'win' | 'die' | 'end' (hinter dem Levelende) | undefined.
(() => {
const T = TILE;
const WAVE_BOX = 20; // Hitbox der Welle (px)
const SHIP_ACC = 0.5, SHIP_MAX = 6.5, SHIP_CEIL = 10; // Schiff: Beschleunigung, max. Vertikaltempo, Decke (Tiles über Boden)
const INSET = { '^': [12, 14, 12, 0], o: [0, 30, 0, 0] }, NO_INSET = [0, 0, 0, 0]; // l, t, r, b

// AABB-Test gegen alle Tiles des Typs ch; Spike nutzt verkleinerte Hitbox, die Welle eine kleinere Spieler-Box
function hits(s, w, ch) {
  const inset = INSET[ch] || NO_INSET;
  const sz = s.wave ? WAVE_BOX : T, o = (T - sz) / 2, px = s.x + o, py = s.y + o;
  for (let r = Math.floor(py / T); r <= Math.floor((py + sz - 1e-6) / T); r++)
    for (let c = Math.floor(px / T); c <= Math.floor((px + sz - 1e-6) / T); c++) {
      if (w.tile(c, r) !== ch) continue;
      const l = c * T + inset[0], t = r * T + inset[1], rr = (c + 1) * T - inset[2], bt = (r + 1) * T - inset[3];
      if (px < rr && px + sz > l && py < bt && py + sz > t) return true;
    }
  return false;
}
// Portal-Spalte durchflogen? gilt für die ganze Spalte
function inPortal(s, w, ch) {
  for (let c = Math.floor(s.x / T); c <= Math.floor((s.x + T - 1e-6) / T); c++) if (w.colHas(c, ch)) return true;
  return false;
}
// Schwerkraft am Start: alle Portale, die der Startposition x vorausliegen
function gravAt(w, x) {
  let g = 1;
  for (let c = 0; c * T - T < x; c++) {
    if (w.colHas(c, 'N')) g = 1;
    if (w.colHas(c, 'U')) g = -1;
  }
  return g;
}
function collectCoins(s, w) {
  const b = s.wave ? WAVE_BOX : T, o = (T - b) / 2, cx = s.x + o + b / 2, cy = s.y + o + b / 2;
  for (let r = Math.floor((s.y + o) / T); r <= Math.floor((s.y + o + b - 1e-6) / T); r++)
    for (let c = Math.floor((s.x + o) / T); c <= Math.floor((s.x + o + b - 1e-6) / T); c++) {
      const i = w.tile(c, r) === '*' ? w.coinIdx.get(c + ',' + r) : undefined;
      if (i !== undefined && !s.coins.has(i) && Math.abs(cx - (c * T + T / 2)) < b / 2 + 14 && Math.abs(cy - (r * T + T / 2)) < b / 2 + 14) s.coins = new Set(s.coins).add(i);
    }
}
function flipGrav(s, g) { s.grav = g; s.ground = false; if (!s.ship) s.vy = 0; }
function applyPortals(s, w) { // U/N: Schwerkraft, 1–4 (> / <): Tempo (gilt für Würfel und Schiff); s.inSpd = Tempostufe im Portal (0 = keins)
  let lv = 0;
  for (const ch in SPEED_CH) if (SPEED_CH[ch] > lv && inPortal(s, w, ch)) lv = SPEED_CH[ch];
  if (lv) s.spd = SPEEDS[lv - 1];
  s.inSpd = lv;
  if (inPortal(s, w, 'N') && s.grav < 0) flipGrav(s, 1);
  if (inPortal(s, w, 'U') && s.grav > 0) flipGrav(s, -1);
}
// Schiff: Eingabe = steigen, sonst sinken; Boden/Blöcke von oben und unten sind sicher, seitlich tödlich
function updateShip(s, held, w) {
  s.vy = Math.max(-SHIP_MAX, Math.min(SHIP_MAX, s.vy + (held ? -SHIP_ACC : SHIP_ACC) * s.grav));
  s.y += s.vy; s.ground = false;
  if (hits(s, w, '#')) {
    s.y = s.vy > 0 ? Math.floor((s.y + T) / T) * T - T : (Math.floor(s.y / T) + 1) * T;
    s.vy = 0;
  }
  const top = (w.ROWS - 1 - SHIP_CEIL) * T;
  if (s.y < top) { s.y = top; s.vy = 0; }
  s.rot += (Math.atan2(s.vy, SPEED * s.spd) - s.rot) * 0.2; s.target = s.rot;
  s.x += SPEED * s.spd; // Y liegt jetzt bündig → jede Blockberührung ist seitlich
  if (hits(s, w, '|')) return 'win';
  if (hits(s, w, '#') || hits(s, w, '^')) return 'die';
  collectCoins(s, w);
  if (inPortal(s, w, 'W')) { enterWave(s); return; }
  if (inPortal(s, w, 'C')) { s.ship = false; s.rot = s.target = 0; }
  applyPortals(s, w);
  if (s.x > w.COLS * T) return 'end';
}
// Welle: Eingabe gehalten = 45° nach oben, sonst 45° nach unten; jede Berührung von Block oder Spike tötet (Decke begrenzt nur)
function enterWave(s) {
  s.wave = true; s.ship = false; s.trail = []; s.grace = s.ground ? 12 : 0; s.ground = false; s.vy = 0; // grace: kurzer Steigflug, wenn vom Boden aus eingetreten
}
function updateWave(s, held, w) {
  const v = SPEED * s.spd, up = s.grace > 0 || held;
  if (s.grace > 0) s.grace--;
  s.vy = up ? -v : v;
  s.x += v; s.y += s.vy; s.ground = false;
  const top = (w.ROWS - 1 - SHIP_CEIL) * T;
  if (s.y < top) s.y = top;
  s.rot = s.target = up ? -Math.PI / 4 : Math.PI / 4;
  if (hits(s, w, '|')) return 'win';
  if (hits(s, w, '#') || hits(s, w, '^') || s.y > w.ROWS * T) return 'die';
  collectCoins(s, w);
  if (inPortal(s, w, 'C')) { s.wave = false; s.vy = 0; s.rot = s.target = 0; }
  else if (inPortal(s, w, 'S')) { s.wave = false; s.ship = true; s.vy = 0; }
  applyPortals(s, w);
  if (s.x > w.COLS * T) return 'end';
}

function step(s, held, pressed, w) {
  if (s.wave) return updateWave(s, held, w);
  if (s.ship) return updateShip(s, held, w);
  if (held && s.ground) { s.vy = JUMP * s.grav; s.ground = false; s.target += s.grav * Math.PI / 2; }
  else if (pressed && !s.ground) { // Orb: nur bei neuem Tastendruck, einmal pro Versuch
    for (let r = Math.floor(s.y / T); r <= Math.floor((s.y + T - 1e-6) / T); r++)
      for (let c = Math.floor(s.x / T); c <= Math.floor((s.x + T - 1e-6) / T); c++) {
        const k = c + ',' + r;
        if (w.tile(c, r) !== 'O' || s.orbs.has(k)) continue;
        const ox = c * T + T / 2, oy = r * T + T / 2;
        if (Math.abs(s.x + T / 2 - ox) < T / 2 + 12 && Math.abs(s.y + T / 2 - oy) < T / 2 + 12) {
          s.orbs = new Set(s.orbs).add(k); s.vy = JUMP * s.grav; s.target += s.grav * Math.PI / 2;
        }
      }
  }
  if (hits(s, w, 'o')) { s.vy = JUMP * PAD_MULT * s.grav; s.ground = false; s.target += s.grav * Math.PI / 2; } // Jump-Pad
  // X: jede Blockberührung hier ist seitlich (Y ist noch sauber auf Oberkante) → Tod
  s.x += SPEED * s.spd;
  if (hits(s, w, '|')) return 'win';
  if (hits(s, w, '#') || hits(s, w, '^')) return 'die';
  applyPortals(s, w);
  if (inPortal(s, w, 'W')) { enterWave(s); return; }
  if (inPortal(s, w, 'S')) { s.ship = true; s.ground = false; s.vy = Math.max(-SHIP_MAX, Math.min(SHIP_MAX, s.vy)); }
  // Y: fallend landen, steigend gegen Decke = Tod
  s.vy += GRAV * s.grav; s.y += s.vy; s.ground = false;
  const top = (w.ROWS - 1 - SHIP_CEIL) * T;
  if (s.grav < 0 && s.y < top) { s.y = top; s.vy = 0; s.ground = true; s.rot = s.target; } // obere Grenze = Boden bei umgekehrter Schwerkraft
  if (hits(s, w, '#')) {
    if (s.vy * s.grav < 0) return 'die';
    s.y = s.grav > 0 ? Math.floor((s.y + T) / T) * T - T : (Math.floor(s.y / T) + 1) * T; // auf Standfläche setzen
    s.vy = 0; s.ground = true; s.rot = s.target;
  }
  if (hits(s, w, '^') || (s.grav > 0 && s.y > w.ROWS * T)) return 'die';
  if (!s.ground) s.rot += (s.target - s.rot) * 0.12;
  collectCoins(s, w);
  if (s.x > w.COLS * T) return 'end';
}

// ---- Bot: Beam-Search über beide Eingaben pro Tick ----
const MAX_STATES = 1500, SNAP_COLS = 8;
function makeWorld(grid) { // grid = Zeilen (Strings oder Zeichen-Arrays)
  const ROWS = grid.length, COLS = Math.max(0, ...grid.map(r => r.length)), cols = [], coinIdx = new Map();
  for (let c = 0; c < COLS; c++) {
    let s = '';
    for (let r = 0; r < ROWS; r++) {
      const ch = grid[r][c] ?? '.';
      if (ch !== '.') s += ch;
      if (ch === '*' && coinIdx.size < MAX_COINS) coinIdx.set(c + ',' + r, coinIdx.size);
    }
    cols.push(s);
  }
  return { tile: (c, r) => grid[r]?.[c] ?? '.', colHas: (c, ch) => (cols[c] || '').includes(ch), ROWS, COLS, coinIdx };
}
// Dedup-Schlüssel: y, vy (gerundet), Boden, Modus, Schwerkraft, Eingabe im letzten Tick (für pressed), Orbs, Münzen
const keyOf = s => Math.round(s.y) + ',' + Math.round(s.vy * 10) + (s.ground ? 'g' : 'a') + (s.wave ? 'w' + s.grace : s.ship ? 's' : 'c') + s.grav + (s.prev ? 'h' : '')
  + '|' + [...s.orbs].join(';') + '|' + [...s.coins].sort().join(',');

// Ist das Level schaffbar? → { won, pct, failCol, coins (in Siegläufen erreichbare Münzen), missing ([{c, r}] unerreichbare Münzen) }
// o.snaps (Array): Zwischenstände merken; o.from (Spalte): erneute Prüfung nach Änderungen ab dieser Spalte, setzt beim letzten gültigen Zwischenstand auf.
function checkLevel(grid, o = {}) {
  const w = makeWorld(grid), snaps = o.snaps;
  if (snaps && o.from == null) snaps.length = 0;
  while (snaps?.length && snaps[snaps.length - 1].col > o.from) snaps.pop();
  const sn = snaps?.[snaps.length - 1];
  let beam, won = false, winCoins = new Set(), lastSnap = -Infinity;
  if (sn) { beam = sn.beam; won = sn.won; winCoins = new Set(sn.wc); lastSnap = sn.col; }
  else {
    const x = START_COL * T;
    beam = [{ x, y: (w.ROWS - 2) * T, vy: 0, ground: true, rot: 0, target: 0, ship: false, grav: gravAt(w, x), spd: speedAtX(grid, x), orbs: new Set(), coins: new Set(), prev: false }];
  }
  let x = beam[0].x;
  while (beam.length) {
    x = beam[0].x; // alle Zustände haben dasselbe x
    const col = Math.floor((x + T) / T) + 1; // erste Spalte, die noch keinen Einfluss hatte
    if (snaps && col - lastSnap >= SNAP_COLS) { snaps.push({ col, beam, won, wc: [...winCoins] }); lastSnap = col; }
    const next = new Map();
    for (const s of beam) for (const h of [false, true]) {
      const n = { ...s, prev: h }, ev = step(n, h, h && !s.prev, w);
      if (ev === 'win') { won = true; for (const i of n.coins) winCoins.add(i); }
      if (ev) continue;
      const k = keyOf(n);
      if (!next.has(k)) next.set(k, n);
    }
    beam = [...next.values()];
    if (beam.length > MAX_STATES) { const all = beam; beam = Array.from({ length: MAX_STATES }, (_, i) => all[Math.floor(i * all.length / MAX_STATES)]); }
  }
  if (!won) return { won, pct: Math.max(0, Math.min(100, Math.floor(x / (w.COLS * T) * 100))), failCol: Math.floor((x + T) / T), coins: 0, missing: [] };
  const missing = [...w.coinIdx].filter(([, i]) => !winCoins.has(i)).map(([k]) => { const [c, r] = k.split(',').map(Number); return { c, r }; });
  return { won, pct: 100, failCol: null, coins: winCoins.size, missing };
}

Object.assign(window, { step, gravAt, checkLevel });
})();
