// Handgemachte Muster + Level-Rezepte (von index.html und editor.html geladen, nach config.js).
// Rezept: { name, music, bpm, offset (ms), seed, sections: [{ mode: 'cube'|'ship'|'gravity'|'wave', bars, difficulty (1–5), speed (1–4, optional) }] }
// levelGrid(level) liefert für Rezepte das erzeugte Grid (Zeilen-Strings mit Zusatzfeldern name/music/bpm/offset), für alte Grid-Level das Array selbst.
// Spielbarkeit: alle Maße (Sprungweiten, Lücken, Abstände, Schiff-Wendezeiten) werden aus GRAV, JUMP, PAD_MULT, SPEED, SPEEDS und den Schiff-Konstanten berechnet.
// Bekannte Grenze: das Schiff darf über Zeile 0 hinausfliegen (siehe SHIP_CEIL in game.js), Tunneldecken lassen sich dort überfliegen.
(() => {
const T = TILE, F = LEVEL_ROWS - 1, S = F - 1; // F = Bodenzeile, S = Standzeile des Würfels
const SHIP_ACC = 0.5, SHIP_MAX = 6.5; // müssen zu game.js passen
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cols = px => Math.ceil(px / T);

function mulberry32(a) {
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---- Physik (Tick-genau wie update() in game.js) ----
// Ticks, bis ein Würfel mit Starthöhe h0 (px über der Landefläche) und Startgeschwindigkeit vy0 (negativ = hoch) landet
function airTicks(h0, vy0) {
  let h = h0, vy = vy0, t = 0;
  do { vy += GRAV; h -= vy; t++; } while (h > 0 && t < 999);
  return t;
}
// Sprung vom Boden: Flugweite und Strecke, auf der der Spieler über Spike-Höhe spikeH ist
function arc(spikeH, spd) {
  let h = 0, vy = JUMP, t = 0, above = 0;
  do { vy += GRAV; h -= vy; t++; if (h > spikeH) above++; } while (h > 0);
  return { px: t * SPEED * spd, spikePx: above * SPEED * spd };
}
function riseTick(hh) { // Tick, in dem ein Sprung erstmals Höhe hh erreicht
  let h = 0, vy = JUMP, n = 0;
  do { vy += GRAV; h -= vy; n++; } while (h < hh && vy < 0);
  return n;
}
function fallTick(hh) { // Tick, in dem ein Sprung beim Abstieg Höhe hh unterschreitet
  let h = 0, vy = JUMP, n = 0;
  do { vy += GRAV; h -= vy; n++; } while ((vy < 0 || h > hh) && n < 999);
  return n;
}
function flight(x0, v, vy0) { // Zustände (Spieler-x, Höhe) für die X-Kollisionen eines Flugs bis zur Landung
  const out = []; let x = x0, h = 0, vy = vy0;
  for (let i = 0; i < 400; i++) {
    out.push({ x, h });
    x += v; vy += GRAV; h -= vy;
    if (h <= 0 && vy > 0) { out.push({ x, h: 0 }); break; }
  }
  return out;
}
// Schiff: Ticks für eine vertikale Strecke d (px) bei voller Beschleunigung, dann Bremsen
function shipTicks(d) {
  const dv = SHIP_MAX * SHIP_MAX / SHIP_ACC;
  return d <= dv ? 2 * Math.sqrt(d / SHIP_ACC) : 2 * SHIP_MAX / SHIP_ACC + (d - dv) / SHIP_MAX;
}
const leg = (B, d) => cols(shipTicks(d + T) * 1.3 * B.v) + 1; // Spalten, um d px zu steigen/sinken (+Reserve)

// ---- Baukasten ----
// Muster werden mit Spaltenversatz dc und Würfel-Zeilen (F = Boden, S = Standzeile) beschrieben;
// bei umgekehrter Schwerkraft (up) wird vertikal gespiegelt (Decke = Zeile 0). B.abs nimmt echte Zeilen.
function mkB(g, c0, spd, up, rnd, avail, d) {
  const v = SPEED * spd, ar = arc(up ? T + 2 : 28, spd), log = [];
  const B = { g, c0, spd, up, rnd, avail, d, v, ar, sep: cols(ar.px + 10), cands: [] }; // sep = Mindestabstand von Hindernisanfang zu Hindernisanfang
  B.abs = (dc, r, ch) => {
    const c = c0 + dc;
    if (c < 0 || !g[r] || c >= g[r].length) return;
    log.push([r, c, g[r][c]]); g[r][c] = ch;
  };
  B.undo = () => { while (log.length) { const [r, c, o] = log.pop(); g[r][c] = o; } };
  B.put = (dc, r, ch) => B.abs(dc, up ? F - r : r, ch);
  B.cand = (dc, r, abs) => B.cands.push({ c: c0 + dc, r: up && !abs ? F - r : r }); // mögliche Münzstelle (r = Würfel-Zeile, abs = echte Zeile)
  B.blocks = (dc0, dc1, h) => { for (let c = dc0; c < dc1; c++) for (let r = F - h; r < F; r++) B.put(c, r, '#'); };
  B.spikes = (dc, n = 1, r = S) => { for (let i = 0; i < n; i++) B.put(dc + i, r, '^'); };
  return B;
}
// Anzahl Absprung-Ticks, mit denen ein Sprung über n Spikes (ab Spalte 0) die Münze in Spalte dc, hc px über der Standfläche einsammelt (ohne Tod, Landung noch im Musterbereich)
function coinWindow(B, n, dc, hc) {
  const v = B.v, clr = B.up ? T + 2 : 28, maxLand = (B.sep - 1) * T;
  let cnt = 0;
  for (let x0 = -28; x0 >= -300; x0 -= v) {
    const fl = flight(x0, v, JUMP);
    let ok = true, hit = false;
    fl.forEach((q, i) => {
      if (q.x > -28 && q.x < 28 + (n - 1) * T && q.h < clr) ok = false;
      if (Math.abs(q.x - dc * T) < 34 && Math.abs((fl[i + 1] || q).h - hc) < 34) hit = true;
    });
    if (ok && hit && fl[fl.length - 1].x <= maxLand) cnt++;
  }
  return cnt;
}
const needPx = n => n * T + 16; // n Spikes nebeneinander: Hitbox-Breite + Spielerbreite
const WIN = 30; // Mindest-Absprungfenster (px) bei Spike-Gruppen

// ---- Würfel (und, gespiegelt, Schwerkraft) ----
const spikeGroup = n => B => {
  if (B.ar.spikePx - needPx(n) < WIN) return 0;
  B.spikes(0, n);
  for (let dc = 0; dc <= n + 1; dc++) for (const k of [2, 3]) { // Münze nur mit knappem Absprungfenster (4–12 Ticks)
    const cnt = coinWindow(B, n, dc, k * T);
    if (cnt >= 4 && cnt <= 12) B.cand(dc, S - k);
  }
  return Math.max(n + 1, B.sep);
};

const rhythm = B => { // Spikes im Takt der Sprungweite
  const its = [[1, 1, 1], [1, 1, 1], [1, 2, 1], [2, 1, 2, 1], [1, 2, 1, 2, 1]][B.d - 1];
  const dbl = B.ar.spikePx - needPx(2) >= WIN;
  its.forEach((n, i) => B.spikes(i * B.sep, dbl ? n : 1));
  return its.length * B.sep;
};

// Blocktreppe (je 1 Kachel höher), oben ein Spike hinter der Landezone
const stairs = (nSteps, spikeN) => B => {
  const v = B.v, n40 = fallTick(T), r40 = riseTick(T);
  const len = Math.max(3, cols(v * n40 + 10)); // Stufenlänge: Landung + Platz für den nächsten Absprung
  const k = cols(v * (n40 - r40) + 3 * v + 8); // erster Spike hinter der spätesten Landung
  let n = spikeN;
  while (n > 1 && B.ar.spikePx - needPx(n) < WIN) n--;
  if (B.ar.spikePx - needPx(n) < WIN) return 0;
  let c = 0;
  for (let h = 1; h < nSteps; h++, c += len) B.blocks(c, c + len, h);
  const topLen = k + n + 2;
  B.blocks(c, c + topLen, nSteps);
  B.spikes(c + k, n, S - nSteps);
  return c + topLen + cols(airTicks(nSteps * T, JUMP) * v) + 1;
};

const platforms = B => { // Plattformen mit Bodenlücken
  if (B.up) return 0;
  const minWin = [110, 95, 80, 70, 60][B.d - 1], win = w => B.ar.px - (w - 1) * T; // Absprungfenster bei Lückenbreite w
  if (win(2) < minWin) return 0;
  let wMax = 2;
  while (wMax < 4 && win(wMax + 1) >= minWin) wMax++;
  let c = 2;
  for (let i = 0; i < [2, 2, 3, 3, 4][B.d - 1]; i++) {
    const w = 2 + Math.floor(B.rnd() * (wMax - 1));
    for (let j = 0; j < w; j++) B.abs(c + j, F, '.');
    c += w + Math.max(3, cols(B.ar.px - w * T) + 2); // Plattform: spätester Absprung muss noch darauf landen, plus Reaktionsraum
  }
  return c + 1;
};

const padSpikes = B => { // Pad schleudert über ein kurzes Spikefeld
  if (B.up) return 0;
  const fl = airTicks(0, JUMP * PAD_MULT) * B.v, kmax = Math.floor((fl - T - 12 - 28 - 12) / T);
  const n = Math.min(kmax - 1, B.d >= 3 ? 3 : 2);
  if (n < 1) return 0;
  B.put(0, S, 'o'); B.spikes(2, n);
  return cols(fl) + 2;
};

const padFlights = v => [-T + v, -T + 2 * v].map(x0 => flight(x0, v, JUMP * PAD_MULT)); // frühester/spätester Pad-Auslösepunkt

const padWall = B => { // Pad trägt über eine Mauer
  if (B.up) return 0;
  const v = B.v, Hw = B.d >= 4 ? 4 : 3, top = Hw * T + 4, paths = padFlights(v), ok = [];
  const over = (q, s) => q.x + T > s * T && q.x < (s + 2) * T;
  for (let s = 2; s <= 16; s++) {
    if (paths.every(p => p.some(q => over(q, s)) && p.every(q => !over(q, s) || q.h >= top) && p[p.length - 1].x >= (s + 2) * T + 8)) ok.push(s);
  }
  if (!ok.length) return 0;
  const s = ok[Math.floor(B.rnd() * ok.length)];
  B.put(0, S, 'o'); B.blocks(s, s + 2, Hw);
  return Math.max(...paths.map(p => cols(p[p.length - 1].x + T))) + 2;
};

const padTower = B => { // Pad → hoher Block → Spike-Landung hinter dem Block
  if (B.up) return 0;
  const v = B.v, H = B.d >= 4 && B.rnd() < 0.5 ? 4 : 3, top = H * T, paths = padFlights(v);
  for (let s = 2; s <= 16; s++) {
    let e = 0, ok = true;
    for (const p of paths) {
      const i = p.findIndex(q => q.x + T > s * T); // erste Berührung der Turmspalte: muss darüber sein
      if (i < 1 || p[i].h < top + 4 || p[i - 1].h < top) { ok = false; break; }
      const j = p.findIndex((q, k) => k >= i && q.h <= top && p[k - 1].h > top); // Landung auf dem Turm
      if (j < 0 || p[j].x + T <= s * T) { ok = false; break; }
      e = Math.max(e, cols(p[j].x + T) + 3);
    }
    if (!ok) continue;
    // Abrutschen vom Turm landet bei mid (Spikes dort); Absprung kurz vor der Kante muss dahinter landen
    const dw = airTicks(top, 0) * v, dj = airTicks(top, JUMP) * v, mid = Math.floor((e * T + dw + T / 2) / T);
    if (e * T + dj - (mid * T + 28) - 12 < 40) return 0;
    B.put(0, S, 'o'); B.blocks(s, e, H); B.spikes(mid - 1, 2);
    return Math.max(mid + 1, e + cols(dj)) + 2;
  }
  return 0;
};

const orbChain = B => { // Spikefeld, nur mit Orb-Kette überquerbar (Orbs 2 Kacheln über dem Boden)
  const v = B.v, n = B.d >= 5 ? 4 : B.d >= 4 ? 3 : 2;
  let h = 80, vy = JUMP, t0 = 999, t1 = 0; // Zeitfenster nach einem Orb, in dem der Spieler wieder auf Orb-Höhe (±32 px) absteigt
  for (let i = 1; i < 200 && h > 0; i++) {
    vy += GRAV; h -= vy;
    if (vy > 0 && h > 48 && h < 112) { t0 = Math.min(t0, i); t1 = i; }
  }
  const sp = Math.max(3, Math.round((t0 + t1) / 2 * v / T));
  const post = Math.floor((airTicks(48, JUMP) * v - 72) / T); // sichere Spikes hinter dem letzten Orb
  if (post < 1) return 0;
  const last = 1 + (n - 1) * sp, fe = last + Math.min(post, 3);
  B.spikes(0, fe + 1);
  for (let i = 0; i < n; i++) B.put(1 + i * sp, 6, 'O');
  B.cand(1 + Math.round(17.7 * v / T), 3); // Scheitel des Sprungs vom ersten Orb: nur mit frühem Orb-Druck erreichbar
  return fe + 1 + 4;
};

const blockRide = B => { // Blockreihe (1 hoch) mit Spikes obendrauf
  if (B.ar.spikePx - needPx(1) < WIN) return 0;
  const v = B.v, n40 = fallTick(T), r40 = riseTick(T), k0 = cols(v * (n40 - r40) + 3 * v + 8), ns = B.d >= 4 ? B.d - 1 : 2;
  const dbl = B.d >= 5 && B.ar.spikePx - needPx(2) >= WIN;
  const L = k0 + (ns - 1) * B.sep + 2 + 3;
  B.blocks(0, L, 1);
  for (let i = 0; i < ns; i++) B.spikes(k0 + i * B.sep, dbl && i % 2 ? 2 : 1, S - 1);
  return L + cols(airTicks(T, JUMP) * v) + 1;
};

// ---- Schwerkraft: Wechsel mitten im Sprung ----
// Start und Ende auf der Decke. Deckenspikes mit N-Portal über dem zweiten Spike → Wechsel nur im Sprung möglich, der Spieler fällt zum Boden;
// dort Bodenspikes mit U-Portal, zurück zur Decke. Abstand = Fallzeit (max. 30 Ticks) + Landung + Reaktion.
const flipMid = reps => B => {
  if (!B.up) return 0;
  const step = cols(30 * B.v + 40 + 3 * B.v + (B.d >= 5 ? 20 : 50) - 12);
  for (let r = 0; r < reps; r++) {
    const a = r * 2 * step, b = a + step;
    B.abs(a, 1, '^'); B.abs(a + 1, 1, '^'); B.abs(a + 1, 4, 'N');
    B.abs(b, S, '^'); B.abs(b + 1, S, '^'); B.abs(b + 1, 4, 'U');
  }
  return reps * 2 * step;
};

// ---- Schiff: Tunnel aus Zuständen {t, b, n, sp}: Wände oben (Zeilen < t) und unten (Zeilen >= b), n Spalten, sp = Spikes an den Rändern ----
const free = n => ({ t: 0, b: F, n });
function lay(B, list, coins = true) { // Zustände setzen, auf die verfügbare Breite kürzen, am Ende 3 freie Spalten
  const tail = 3;
  let tot = 0;
  const keep = [];
  for (const s of list) { if (tot + s.n + tail > B.avail) break; keep.push(s); tot += s.n; }
  if (keep.length < 3) return 0;
  let c = 0;
  const starts = [];
  for (const s of keep) {
    starts.push(c);
    for (let i = 0; i < s.n; i++, c++) {
      for (let r = 0; r < s.t; r++) B.abs(c, r, '#');
      for (let r = s.b; r < F; r++) B.abs(c, r, '#');
      if (s.sp && s.t >= 1 && i >= 1 && i < s.n - 1) B.abs(c, i % 2 ? s.t : s.b - 1, '^');
    }
  }
  if (coins) for (let j = 1; j < keep.length - 1; j++) { // Münze an der Tunnelwand (abseits der Mitte), Zeile in allen drei Nachbarzuständen frei
    const [a, s, b] = [keep[j - 1], keep[j], keep[j + 1]];
    if (a.sp || s.sp || b.sp) continue;
    const lo = Math.max(a.t, s.t, b.t), hi = Math.min(a.b, s.b, b.b) - 1, dc = starts[j] + (s.n >> 1);
    if (hi - lo < 1) continue;
    if (lo >= 1) B.cand(dc, lo, true);
    B.cand(dc, hi, true);
  }
  return c + tail;
}

const shipOpen = B => {
  const n = Math.max(5, leg(B, T));
  return lay(B, [free(leg(B, 160)), ...[[1, 8], [2, 8], [2, 7], [1, 7], [1, 8]].map(([t, b]) => ({ t, b, n }))]);
};
const shipStairs = B => { // Tunnel steigt Kachel für Kachel und sinkt wieder
  const up = [[4, 9], [3, 8], [2, 7], [1, 6], [0, 5]], n = Math.max(3, leg(B, T));
  return lay(B, [free(leg(B, 200)), ...up.concat(up.slice(0, -1).reverse()).map(([t, b]) => ({ t, b, n }))]);
};
const shipZigzag = B => { // Tunnelmitte springt zwischen zwei Höhen; Abstand zwischen den Sprüngen aus der Schiffsbeschleunigung
  const d = B.d, G = d <= 3 ? 5 : 4, k = d <= 2 ? 1 : d <= 4 ? 2 : 3, lo = 1, hi = Math.min(F - G, lo + k);
  const n = Math.max(3, leg(B, (hi - lo) * T)), list = [free(leg(B, 200))];
  for (let i = 0; i < 4 + (d >= 4 ? 1 : 0); i++) { const t = i % 2 ? hi : lo; list.push({ t, b: t + G, n }); }
  return lay(B, list);
};
const shipPillars = B => { // Säulen abwechselnd vom Boden und von oben: erst darüber, dann darunter durch
  const d = B.d, shift = d <= 2 ? 1 : d <= 4 ? 2 : 3, rb = 4, rt = rb - 1 + shift, gap = leg(B, shift * T);
  const list = [free(leg(B, 280))];
  for (let i = 0; i < 4 + d; i++) list.push(i % 2 ? { t: rt, b: F, n: 2 } : { t: 0, b: rb, n: 2 }, free(gap));
  return lay(B, list);
};
const shipSpikes = B => { // schmaler Korridor mit Spikes an Decke und Boden
  const d = B.d, G = d <= 3 ? 6 : 5, n = Math.max(6, leg(B, T)), list = [free(leg(B, 200))];
  for (let i = 0; i < 2 + d; i++) { const t = 1 + i % 2; list.push({ t, b: t + G, n, sp: true }); }
  return lay(B, list);
};
const shipNarrow = B => { // enge Schlucht (3 Kacheln), sanftes Weben
  const n = Math.max(3, leg(B, T)), st = [[4, 9], [5, 9], [5, 8], [4, 7], [3, 6], [4, 7], [5, 8], [6, 9], [5, 9], [4, 9]];
  return lay(B, [free(leg(B, 200)), ...st.map(([t, b]) => ({ t, b, n }))]);
};

// ---- Welle: 45°-Flug (Steigung 1) → Tunnel mit Diagonalen (n = 1 Spalte je Stufe), Tore mit Abstand ≥ Höhendifferenz + Reserve ----
const waveStep = (G, tops) => B => lay(B, [free(10), ...tops.map(t => ({ t, b: t + G, n: 1 }))], false);
const waveGates = B => { // Tore (Lücke 4 Kacheln) auf wechselnder Höhe, dazwischen offener Raum
  const sh = B.d <= 4 ? 1 : 2, m = 6 + sh, list = [free(10)];
  for (let i = 0; i < 4 + (B.d >= 5 ? 2 : 0); i++) list.push({ t: 1 + (i % 2) * sh, b: 5 + (i % 2) * sh, n: 1 }, free(m));
  return lay(B, list, false);
};
const waveSpikes = B => { // breiter Korridor mit Spikes an Decke und Boden
  const G = B.d >= 5 ? 6 : 7, list = [free(10)];
  for (let i = 0; i < 3 + B.d; i++) { const t = 1 + i % 2; list.push({ t, b: t + G, n: 6, sp: true }); }
  return lay(B, list, false);
};

const PATTERNS = [
  { id: 'spike1', name: 'Einzelspike', mode: 'cube', diff: 1, build: spikeGroup(1) },
  { id: 'spike2', name: 'Doppelspike', mode: 'cube', diff: 1, build: spikeGroup(2) },
  { id: 'padSpikes', name: 'Pad über Spikefeld', mode: 'cube', diff: 1, build: padSpikes },
  { id: 'rhythm', name: 'Spike-Rhythmus', mode: 'cube', diff: 2, build: rhythm },
  { id: 'platforms', name: 'Plattformsprünge über Lücken', mode: 'cube', diff: 2, build: platforms },
  { id: 'stairs', name: 'Blocktreppe hoch mit Spike oben', mode: 'cube', diff: 2, build: stairs(2, 1) },
  { id: 'padWall', name: 'Pad über Mauer', mode: 'cube', diff: 2, build: padWall },
  { id: 'spike3', name: 'Dreierspike', mode: 'cube', diff: 3, build: spikeGroup(3) },
  { id: 'blockRide', name: 'Spike-Ritt auf Blockreihe', mode: 'cube', diff: 3, build: blockRide },
  { id: 'padTower', name: 'Pad → hoher Block → Spike-Landung', mode: 'cube', diff: 3, build: padTower },
  { id: 'orbChain', name: 'Orb-Kette über Spikefeld', mode: 'cube', diff: 3, build: orbChain },
  { id: 'pyramid', name: 'Blockpyramide mit Doppelspike', mode: 'cube', diff: 4, build: stairs(3, 2) },
  { id: 'shipOpen', name: 'Schiff: offener Tunnel', mode: 'ship', diff: 1, build: shipOpen },
  { id: 'shipStairs', name: 'Schiff: Tunneltreppe', mode: 'ship', diff: 2, build: shipStairs },
  { id: 'shipZigzag', name: 'Schiff: Tunnel mit Zickzack', mode: 'ship', diff: 2, build: shipZigzag },
  { id: 'shipPillars', name: 'Schiff durch Block-Säulen', mode: 'ship', diff: 3, build: shipPillars },
  { id: 'shipSpikes', name: 'Schiff mit Spikes an Decke und Boden', mode: 'ship', diff: 3, build: shipSpikes },
  { id: 'shipNarrow', name: 'Schiff: enge Schlucht', mode: 'ship', diff: 5, build: shipNarrow },
  { id: 'waveRamp', name: 'Welle: flache Rampe', mode: 'wave', diff: 1, build: waveStep(6, [3, 2, 1, 0, 1, 2, 3]) },
  { id: 'waveStairs', name: 'Welle: Diagonaltunnel', mode: 'wave', diff: 2, build: waveStep(5, [4, 3, 2, 1, 0, 1, 2, 3, 4]) },
  { id: 'waveZigzag', name: 'Welle: Zickzack', mode: 'wave', diff: 3, build: waveStep(5, [4, 3, 2, 3, 4, 3, 2, 3, 4, 3, 2, 3, 4]) },
  { id: 'waveGates', name: 'Welle: Tore', mode: 'wave', diff: 4, build: waveGates },
  { id: 'waveSpikes', name: 'Welle mit Spikes an Decke und Boden', mode: 'wave', diff: 5, build: waveSpikes },
  { id: 'ceilSpike', name: 'Decken-Spike', mode: 'gravity', diff: 1, build: spikeGroup(1) },
  { id: 'ceilDouble', name: 'Decken-Doppelspike', mode: 'gravity', diff: 2, build: spikeGroup(2) },
  { id: 'ceilStairs', name: 'Deckentreppe mit Spike', mode: 'gravity', diff: 2, build: stairs(2, 1) },
  { id: 'ceilRhythm', name: 'Decken-Rhythmus', mode: 'gravity', diff: 2, build: rhythm },
  { id: 'flipMid', name: 'Schwerkraft-Wechsel mitten im Sprung', mode: 'gravity', diff: 3, build: flipMid(1) },
  { id: 'ceilRide', name: 'Spike-Ritt unter der Decke', mode: 'gravity', diff: 3, build: blockRide },
  { id: 'ceilOrbs', name: 'Decken-Orbkette', mode: 'gravity', diff: 4, build: orbChain },
  { id: 'flipDouble', name: 'Doppelter Schwerkraft-Wechsel', mode: 'gravity', diff: 4, build: flipMid(2) },
  { id: 'flipChain', name: 'Flip-Kette', mode: 'gravity', diff: 5, build: flipMid(3) },
];

// ---- Rezept -> Grid ----
const MODES = { cube: 'cube', wuerfel: 'cube', 'würfel': 'cube', ship: 'ship', schiff: 'ship', gravity: 'gravity', grav: 'gravity', schwerkraft: 'gravity', wave: 'wave', welle: 'wave' };
const shape = m => m === 'ship' || m === 'wave' ? m : 'cube'; // Portal-Art: S / W / C (Schwerkraft läuft über U/N)
const normMode = m => MODES[String(m).toLowerCase()] || 'cube';

// Musikzeit (s), zu der der erste Abschnitt beginnt: erster Taktanfang mit genug Anlauf vor dem ersten Hindernis
function recipeStart(bpm, offsetMs) {
  const bar = 4 * 60 / bpm;
  let t = (offsetMs || 0) / 1000;
  while (START_COL * T + t * PPS < (START_COL + 6) * T) t += bar;
  return t;
}

const fallCols = (h, v) => cols(airTicks(h, 0) * v) + 2;
function runway(prev, s) { // freie Spalten hinter dem Portal, damit der Spieler landen/reagieren kann
  const v = SPEED * s.spd;
  if (s.mode === 'ship' || s.mode === 'wave') return 1; // Ausrichten übernimmt der Tunnel-Anlauf
  if (s.mode !== prev.mode) return fallCols(s.mode === 'gravity' || prev.mode === 'gravity' ? 280 : 360, v);
  return s.lvl !== prev.lvl ? cols(airTicks(0, JUMP) * v) + 1 : 0; // Tempowechsel im Sprung verlängert die Flugbahn
}

// MAX_COINS Münzen: je eine pro Drittel des Levels (Mindestabstand 8 Spalten), danach aus dem Rest auffüllen
function placeCoins(g, cands, rnd) {
  const ok = cands.filter(q => g[q.r]?.[q.c] === '.');
  if (!ok.length) return;
  const lo = Math.min(...ok.map(q => q.c)), span = (Math.max(...ok.map(q => q.c)) - lo + 1) / MAX_COINS, chosen = [];
  const free = q => chosen.every(o => Math.abs(o.c - q.c) >= 8), pick = l => l[Math.floor(rnd() * l.length)];
  for (let z = 0; z < MAX_COINS; z++) {
    const zone = ok.filter(q => q.c >= lo + z * span && q.c < lo + (z + 1) * span && free(q));
    if (zone.length) chosen.push(pick(zone));
  }
  for (let rest; chosen.length < MAX_COINS && (rest = ok.filter(q => !chosen.includes(q) && free(q))).length;) chosen.push(pick(rest));
  for (const q of chosen) g[q.r][q.c] = '*';
}

function buildLevel(rec) {
  const bpm = rec.bpm > 0 ? rec.bpm : 120, beat = 60 / bpm, rnd = mulberry32(Math.floor(rec.seed) || 0);
  const secs = (rec.sections || []).map(s => ({
    mode: normMode(s.mode), d: clamp(Math.round(s.difficulty) || 1, 1, 5),
    lvl: clamp(Math.round(s.speed) || 1, 1, 4), bars: Math.max(1, Math.round(s.bars) || 4),
  }));
  let x = START_COL * T + recipeStart(bpm, rec.offset) * PPS; // x = linke Spielerkante am Abschnittsanfang
  for (const s of secs) {
    s.spd = SPEEDS[s.lvl - 1]; s.x = x; s.cp = Math.round(x / T) + 1; // Portalspalte: Wechsel beim Berühren, eine Spalte nach der Spielerkante
    x += s.bars * 4 * beat * PPS * s.spd;
  }
  secs.forEach((s, i) => { s.end = i + 1 < secs.length ? secs[i + 1].cp : Math.round(x / T) + 1; });
  const last = secs[secs.length - 1] || { mode: 'cube', lvl: 1, spd: 1, end: START_COL + 8 };
  const goal = last.end + (last.mode === 'cube' ? 0 : fallCols(360, SPEED * last.spd)) + 8; // nach Schiff/Schwerkraft Platz zum Landen
  const g = Array.from({ length: LEVEL_ROWS }, () => Array(goal + 6).fill('.'));
  g[F].fill('#');
  for (let r = 0; r < F; r++) g[r][goal] = '|';
  if (last.mode === 'ship' || last.mode === 'wave') g[4][last.end] = 'C'; // vor dem Ziel wieder Würfel / normale Schwerkraft
  if (last.mode === 'gravity') g[3][last.end] = 'N';

  let nPat = 0;
  const cands = []; // mögliche Münzstellen aller Muster
  secs.forEach((s, i) => {
    const prev = i ? secs[i - 1] : { mode: 'cube', lvl: 1 };
    if (shape(s.mode) !== shape(prev.mode)) g[4][s.cp] = { ship: 'S', wave: 'W', cube: 'C' }[shape(s.mode)];
    if (s.lvl !== prev.lvl) g[5][s.cp] = String(s.lvl);
    if ((s.mode === 'gravity') !== (prev.mode === 'gravity')) g[3][s.cp] = s.mode === 'gravity' ? 'U' : 'N';
    if (s.mode === 'gravity') for (let c = s.cp; c < s.end; c++) g[0][c] = '#';

    const lim = s.end - 2, pxBeat = beat * PPS * s.spd, up = s.mode === 'gravity';
    let c = s.cp + 2 + runway(prev, s), lastId = '';
    for (let guard = 0; c < lim && guard < 99; guard++) {
      let kk = Math.ceil((c * T - s.x) / pxBeat), cs; // Musterstart auf den nächsten Beat legen
      do { cs = Math.round((s.x + kk++ * pxBeat) / T); } while (cs < c);
      if (cs >= lim) break;
      const pool = PATTERNS.filter(p => p.mode === s.mode && p.diff <= s.d);
      let w = 0;
      while (pool.length && !w) {
        const wt = pool.map(p => (p.diff >= s.d - 1 ? 4 : 1) * (p.id === lastId ? 0.25 : 1));
        let r = rnd() * wt.reduce((a, b) => a + b, 0), k = 0;
        while (k < pool.length - 1 && (r -= wt[k]) >= 0) k++;
        const p = pool.splice(k, 1)[0], B = mkB(g, cs, s.spd, up, rnd, lim - cs, s.d);
        w = p.build(B);
        if (w > 0 && cs + w <= lim) { lastId = p.id; nPat++; cands.push(...B.cands); }
        else { B.undo(); w = 0; }
      }
      if (!w) break;
      c = cs + w + (s.mode === 'ship' || s.mode === 'wave' ? 0 : Math.max(1, Math.round((6.5 - s.d) * (0.7 + 0.6 * rnd()) * s.spd)));
    }
  });

  if (rec.coins !== false) placeCoins(g, cands, rnd);
  const rows = g.map(r => r.join(''));
  Object.assign(rows, { name: rec.name, music: rec.music, bpm, offset: rec.offset || 0, patterns: nPat, c0: secs.length ? secs[0].cp : START_COL }); // c0 = Portalspalte des ersten Abschnitts
  return rows;
}

const gridCache = new WeakMap();
function levelGrid(level) { // Grid-Level bleiben unverändert, Rezepte werden einmal erzeugt
  if (Array.isArray(level)) return level;
  if (!gridCache.has(level)) gridCache.set(level, buildLevel(level));
  return gridCache.get(level);
}

Object.assign(window, { PATTERNS, buildLevel, levelGrid, recipeStart, mulberry32 });
})();
