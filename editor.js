const T = TILE; // Konstanten kommen aus config.js
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const msg = document.getElementById('msg');

// Gruppen: [Titel, [[Zeichen, Beschriftung, Tooltip]]]
const PALETTE = [
  ['Blöcke', [['#', '■', 'Block #'], ['^', '▲', 'Spike ^'], ['.', '⌫', 'Radierer']]],
  ['Objekte', [['o', '▂', 'Jump-Pad o'], ['O', '●', 'Orb O'], ['|', '⚑', 'Ziel |'], ['*', '◎', 'Münze * (max. 3)']]],
  ['Modus', [['S', 'S', 'Schiff-Portal S'], ['C', 'C', 'Würfel-Portal C'], ['W', 'W', 'Wellen-Portal W'], ['U', '↑', 'Schwerkraft umkehren U'], ['N', '↓', 'Normale Schwerkraft N']]],
  ['Tempo', [['1', '1', 'Tempo 1,0× (1)'], ['2', '2', 'Tempo 1,2× (2)'], ['3', '3', 'Tempo 1,4× (3)'], ['4', '4', 'Tempo 1,7× (4)']]],
];
let brush = '#', cam = 0;
let failCol = null; // Spalte, an der der Bot scheitert (rot markiert), null = keine

// Level laden (gleiches Format wie game.js: JSON-Array von Zeilen) oder leeres Level mit Boden
function emptyLevel() {
  const rows = Array.from({ length: LEVEL_ROWS }, () => Array(LEVEL_COLS).fill('.'));
  rows[LEVEL_ROWS - 1].fill('#');
  return rows;
}
function toGrid(v) {
  const cols = Math.max(LEVEL_COLS, ...v.map(r => r.length));
  return v.map(r => r.padEnd(cols, '.').split(''));
}
function loadCustomRows() {
  try {
    const v = JSON.parse(localStorage.getItem(CUSTOM_KEY));
    if (Array.isArray(v) && v.length >= 2 && v.every(r => typeof r === 'string')) return v;
  } catch {}
  return null;
}
function load() {
  const v = loadCustomRows();
  return v ? toGrid(v) : emptyLevel();
}
let grid = load();
let ROWS = grid.length, COLS = grid[0].length;
const rowsText = () => grid.map(r => r.join(''));
const maxCam = () => Math.max(0, COLS * T - cv.width);

function say(t) { msg.textContent = t; }

// Palette
const pal = document.getElementById('pal');
const palBtns = [];
for (const [title, items] of PALETTE) {
  const g = document.createElement('span'); g.className = 'grp';
  g.innerHTML = '<small>' + title + '</small>';
  for (const [ch, label, tip] of items) {
    const b = document.createElement('button');
    b.textContent = label; b.title = tip;
    if (PORTALS[ch]) b.style.borderColor = PORTALS[ch][0];
    b.onclick = () => { brush = ch; sync(); };
    g.append(b); palBtns.push([ch, b]);
  }
  pal.append(g);
}
function sync() { for (const [ch, b] of palBtns) b.classList.toggle('sel', ch === brush); }
sync();

// Zeichnen im Maßstab des Spiels
function draw() {
  ctx.fillStyle = '#1b2250'; ctx.fillRect(0, 0, cv.width, cv.height);
  const c0 = Math.floor(cam / T), c1 = Math.min(COLS - 1, Math.ceil((cam + cv.width) / T));
  for (let c = c0; c <= c1; c++)
    for (let r = 0; r < ROWS; r++) {
      const ch = grid[r][c], x = c * T - cam, y = r * T;
      if (ch === '#') {
        ctx.fillStyle = '#3d5a9e'; ctx.fillRect(x, y, T, T);
        if (grid[r - 1]?.[c] !== '#') { ctx.fillStyle = '#cfe0ff'; ctx.fillRect(x, y, T, 3); }
      } else if (ch === 'o') {
        ctx.fillStyle = '#ffe600'; ctx.fillRect(x, y + T - 8, T, 8);
      } else if (ch === 'O') {
        ctx.beginPath(); ctx.arc(x + T / 2, y + T / 2, 11, 0, Math.PI * 2);
        ctx.fillStyle = '#ffe600'; ctx.fill();
        ctx.strokeStyle = '#fff6a0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + T / 2, y + T / 2, 16, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
      } else if (PORTALS[ch]) {
        const col = PORTALS[ch][0];
        ctx.beginPath(); ctx.ellipse(x + T / 2, y + T / 2, 10, 1.5 * T, 0, 0, Math.PI * 2);
        ctx.fillStyle = col + '44'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke(); ctx.lineWidth = 1;
        if (PORTALS[ch][1]) { ctx.fillStyle = col; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(PORTALS[ch][1], x + T / 2, y + T / 2 + 7); }
      } else if (ch === '*') {
        ctx.beginPath(); ctx.arc(x + T / 2, y + T / 2, 12, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd400'; ctx.fill(); ctx.strokeStyle = '#a07800'; ctx.lineWidth = 3; ctx.stroke(); ctx.lineWidth = 1;
      } else if (ch === '|') {
        ctx.fillStyle = '#4f4'; ctx.fillRect(x + T / 2 - 3, y, 6, T);
      } else if (ch === '^') {
        ctx.beginPath(); ctx.moveTo(x, y + T); ctx.lineTo(x + T / 2, y); ctx.lineTo(x + T, y + T); ctx.closePath();
        ctx.fillStyle = '#c22'; ctx.fill();
        ctx.strokeStyle = '#ff9a9a'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.lineWidth = 1;
      }
    }
  if (failCol !== null) { ctx.fillStyle = '#ff000066'; ctx.fillRect(failCol * T - cam, 0, T, cv.height); }
  // Gitter + Startspalte
  ctx.strokeStyle = '#ffffff22'; ctx.beginPath();
  for (let c = c0; c <= c1 + 1; c++) { const x = c * T - cam + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, cv.height); }
  for (let r = 0; r <= ROWS; r++) { ctx.moveTo(0, r * T + 0.5); ctx.lineTo(cv.width, r * T + 0.5); }
  ctx.stroke();
  ctx.strokeStyle = '#ffd400'; ctx.strokeRect(START_COL * T - cam + 1, (ROWS - 2) * T + 1, T - 2, T - 2);
  ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('Spalte ' + Math.floor(cam / T), 4, 12);
}

// Malen
function cellAt(e) {
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) * cv.width / r.width, y = (e.clientY - r.top) * cv.height / r.height;
  const c = Math.floor((x + cam) / T), row = Math.floor(y / T);
  return c >= 0 && c < COLS && row >= 0 && row < ROWS ? [c, row] : null;
}
// Undo/Redo: Schnappschüsse des Grids (Zeilen mit \n verbunden)
const undoSt = [], redoSt = [];
const snap = () => rowsText().join('\n');
function pushUndo(s) { undoSt.push(s); if (undoSt.length > 100) undoSt.shift(); redoSt.length = 0; failCol = null; }
function restore(s) { failCol = null; grid = toGrid(s.split('\n')); ROWS = grid.length; COLS = grid[0].length; cam = Math.min(cam, maxCam()); }
function undo() { if (undoSt.length) { redoSt.push(snap()); restore(undoSt.pop()); say('Rückgängig.'); } }
function redo() { if (redoSt.length) { undoSt.push(snap()); restore(redoSt.pop()); say('Wiederholt.'); } }
addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const t = e.target;
  if (t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type !== 'file' && t.type !== 'range')) return;
  if (e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (e.code === 'KeyY') { e.preventDefault(); redo(); }
});
let paintCh = null, strokeStart = null;
function paint(e) {
  const cell = cellAt(e);
  if (!cell) return;
  if (paintCh === '*' && grid[cell[1]][cell[0]] !== '*' && grid.flat().filter(ch => ch === '*').length >= MAX_COINS) { say('Maximal ' + MAX_COINS + ' Münzen pro Level.'); return; }
  grid[cell[1]][cell[0]] = paintCh;
}
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  if (e.button !== 0 && e.button !== 2) return;
  paintCh = e.button === 2 ? '.' : brush;
  cv.setPointerCapture(e.pointerId);
  strokeStart = snap();
  paint(e);
});
cv.addEventListener('pointermove', e => { if (paintCh !== null && e.buttons) paint(e); });
cv.addEventListener('pointerup', () => {
  paintCh = null;
  if (strokeStart !== null && strokeStart !== snap()) pushUndo(strokeStart);
  strokeStart = null;
});

// Scrollen
const scroll = d => { cam = Math.max(0, Math.min(maxCam(), cam + d)); };
cv.addEventListener('wheel', e => { e.preventDefault(); scroll(e.deltaY + e.deltaX); }, { passive: false });
const keys = new Set();
addEventListener('keydown', e => {
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { keys.add(e.code); e.preventDefault(); }
});
addEventListener('keyup', e => keys.delete(e.code));
requestAnimationFrame(function loop() { // erst nach dem Laden des Skripts (Audio-Variablen weiter unten)
  if (keys.has('ArrowLeft')) scroll(-12);
  if (keys.has('ArrowRight')) scroll(12);
  followPlayhead();
  draw(); drawBeats(); drawPlayhead(); drawWave(); requestAnimationFrame(loop);
});

// Buttons
function save() {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(rowsText())); say('Gespeichert.'); return true; }
  catch { say('Speichern fehlgeschlagen.'); return false; }
}
document.getElementById('save').onclick = save;
document.getElementById('test').onclick = () => { if (save()) location.href = 'index.html#test'; };
document.getElementById('testhere').onclick = () => {
  if (save()) location.href = 'index.html#test@' + Math.floor(cam / T) * T;
};
// Level laden: levels.js oder eigenes Level
const lvlSel = document.getElementById('lvl');
lvlSel.add(new Option('Level laden…', ''));
LEVELS.forEach((l, i) => lvlSel.add(new Option('Level ' + (i + 1) + (l.name ? ' – ' + l.name : ''), 'L' + i)));
lvlSel.add(new Option('Eigenes Level', 'custom'));
lvlSel.onchange = () => {
  const v = lvlSel.value;
  lvlSel.value = '';
  const rows = v === 'custom' ? loadCustomRows() : levelGrid(LEVELS[+v.slice(1)]);
  if (!rows) { say('Kein eigenes Level gespeichert.'); return; }
  if (rows.bpm) { bpmIn.value = rows.bpm; offIn.value = rows.offset; } // Rezept-Level bringen BPM/Offset mit
  pushUndo(snap());
  grid = toGrid(rows); ROWS = grid.length; COLS = grid[0].length;
  cam = 0;
  say('Level geladen.');
};
// Level teilen: Zeilen deflate-komprimiert (Fallback unkomprimiert) als base64url im Link-Hash
const b64u = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
document.getElementById('share').onclick = async () => {
  const raw = new TextEncoder().encode(rowsText().join('\n'));
  let code = 'r' + b64u(raw);
  if (typeof CompressionStream !== 'undefined') {
    const buf = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
    code = 'z' + b64u(new Uint8Array(buf));
  }
  const url = new URL('index.html', location.href); url.hash = 'level=' + code;
  try { await navigator.clipboard.writeText(url.href); say('Link in die Zwischenablage kopiert.'); }
  catch { prompt('Link zum Level:', url.href); }
};
// Spielbarkeit: Bot (bot.js) spielt das Level durch, Abbruchspalte wird rot markiert
const botText = r => r.won ? 'schaffbar' + (r.coins + r.missing.length ? ', Münzen erreichbar: ' + r.coins + '/' + (r.coins + r.missing.length) : '')
  : 'nicht schaffbar, Abbruch bei Spalte ' + r.failCol + ' (' + r.pct + ' %)';
function showFail(r) {
  failCol = r && !r.won ? r.failCol : null;
  if (failCol !== null) cam = Math.max(0, Math.min(maxCam(), failCol * T - cv.width / 2));
}
document.getElementById('check').onclick = () => {
  say('Prüfe…');
  setTimeout(() => { const r = checkLevel(grid); showFail(r); say('Level ' + botText(r) + '.'); }, 20);
};
document.getElementById('menu').onclick = () => { location.href = 'index.html'; };
document.getElementById('export').onclick = async () => {
  const text = '[\n' + rowsText().map(r => "  '" + r + "',").join('\n') + '\n],';
  try { await navigator.clipboard.writeText(text); say('Level in die Zwischenablage kopiert.'); }
  catch { say('Zwischenablage nicht verfügbar.'); }
};

// Musik: nur Vorschau im Editor
const player = document.getElementById('player');
document.getElementById('music').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  if (player.src) URL.revokeObjectURL(player.src);
  player.src = URL.createObjectURL(f);
  say('Musik geladen: ' + f.name);
};

// Waveform, Transport und Beat-Raster (Web Audio)
// Position <-> Zeit über timeAtX/xAtTime (config.js), berücksichtigt Speed-Portale
const WAVE_H = 80;
let actx = null, abuf = null, peaks = null, peaksKey = '';
let playing = false, pos = 0, startedAt = 0, src = null;

const wave = document.createElement('canvas');
wave.width = cv.width; wave.height = WAVE_H;
wave.style.cssText = 'width:800px;max-width:100%;border:2px solid #3d5a9e;cursor:pointer';
const wctx = wave.getContext('2d');
cv.after(wave);

const tbar = document.createElement('div');
tbar.style.cssText = 'display:flex;gap:8px;align-items:center';
tbar.innerHTML = '<button id="play">Play (Leertaste)</button>' +
  '<button id="detect">BPM erkennen</button>' +
  '<label>BPM <input id="bpm" type="number" min="1" max="400" step="0.01" value="120" style="width:70px"></label>' +
  '<label>Offset (ms) <input id="offset" type="number" step="1" value="0" style="width:70px"></label>';
wave.after(tbar);
const playBtn = tbar.querySelector('#play'), bpmIn = tbar.querySelector('#bpm'), offIn = tbar.querySelector('#offset');

const curTime = () => playing ? pos + (actx.currentTime - startedAt) : pos;

function stopSrc() {
  if (src) { src.onended = null; try { src.stop(); } catch {} src.disconnect(); src = null; }
}
function play() {
  if (!abuf) { say('Erst Musik laden.'); return; }
  if (pos >= abuf.duration) pos = 0;
  actx.resume();
  src = actx.createBufferSource();
  src.buffer = abuf; src.connect(actx.destination);
  src.onended = () => { if (playing) { pos = abuf.duration; playing = false; src = null; playBtn.textContent = 'Play (Leertaste)'; } };
  src.start(0, pos);
  startedAt = actx.currentTime; playing = true;
  playBtn.textContent = 'Pause (Leertaste)';
}
function pause() {
  if (!playing) return;
  pos = Math.min(abuf.duration, curTime());
  playing = false; stopSrc();
  playBtn.textContent = 'Play (Leertaste)';
}
function seek(t) {
  const was = playing;
  if (was) { playing = false; stopSrc(); }
  pos = Math.max(0, Math.min(abuf.duration, t));
  if (was) play();
}
const toggle = () => (playing ? pause() : play());
playBtn.onclick = () => { playBtn.blur(); toggle(); };
addEventListener('keydown', e => {
  if (e.code !== 'Space') return;
  const t = e.target;
  if (t.tagName === 'INPUT' && t.type !== 'file' && t.type !== 'range') return;
  e.preventDefault();
  if (!e.repeat) toggle();
});

document.getElementById('music').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  loadAudio(() => f.arrayBuffer(), f.name);
  setCustomMusic(f).then(() => say('Musik für eigenes Level gespeichert: ' + f.name), () => say('Musik konnte nicht gespeichert werden.'));
});
getCustomMusic().then(f => f
  ? (player.src = URL.createObjectURL(f), loadAudio(() => f.arrayBuffer(), f.name || 'eigene Musik'))
  : loadAudio(() => fetch('audio/music.mp3').then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); }), 'audio/music.mp3'));

// Peak je Welt-Pixel (Zeitbereich je Pixel aus timeAtX), damit das Zeichnen pro Frame billig bleibt
function buildPeaks() {
  const segs = speedSegs(grid), n = COLS * T, sr = abuf.sampleRate, s0 = new Int32Array(n), s1 = new Int32Array(n);
  peaks = new Float32Array(n);
  let t1 = timeAtX(grid, 0, segs);
  for (let i = 0; i < n; i++) {
    const t0 = t1, a = Math.max(0, Math.floor(t0 * sr));
    t1 = timeAtX(grid, i + 1, segs);
    if (t1 <= 0 || a >= abuf.length) continue; // außerhalb der Musik: s0 = s1 = 0
    s0[i] = a; s1[i] = Math.min(abuf.length, Math.max(a + 1, Math.floor(t1 * sr)));
  }
  for (let ch = 0; ch < abuf.numberOfChannels; ch++) {
    const d = abuf.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      let m = peaks[i];
      for (let s = s0[i]; s < s1[i]; s++) { const v = Math.abs(d[s]); if (v > m) m = v; }
      peaks[i] = m;
    }
  }
  for (let i = 0; i < n; i++) if (s0[i] >= s1[i]) peaks[i] = NaN;
}

async function loadAudio(getData, name) {
  try {
    pause();
    actx = actx || new AudioContext();
    abuf = await actx.decodeAudioData(await getData());
    pos = 0;
    peaksKey = ''; // Peaks werden in drawWave() neu aufgebaut
    say('Musik dekodiert: ' + name + ' (' + abuf.duration.toFixed(1) + ' s)');
  } catch { abuf = peaks = null; say('Musik laden/dekodieren fehlgeschlagen.'); }
}

wave.addEventListener('pointerdown', e => {
  if (!abuf) return;
  const r = wave.getBoundingClientRect();
  seek(timeAtX(grid, (e.clientX - r.left) * wave.width / r.width + cam));
});

function followPlayhead() {
  if (playing) cam = Math.max(0, Math.min(maxCam(), xAtTime(grid, curTime()) - cv.width * 0.25));
}

function drawBeats() {
  const bpm = parseFloat(bpmIn.value), off = (parseFloat(offIn.value) || 0) / 1000;
  if (!(bpm > 0)) return;
  const segs = speedSegs(grid), beat = 60 / bpm;
  const k0 = Math.ceil((timeAtX(grid, cam, segs) - off) / beat), k1 = Math.floor((timeAtX(grid, cam + cv.width, segs) - off) / beat);
  if (k1 - k0 > 2000) return;
  for (let k = k0; k <= k1; k++) {
    const x = Math.round(xAtTime(grid, off + k * beat, segs) - cam) + 0.5, strong = ((k % 4) + 4) % 4 === 0;
    ctx.strokeStyle = strong ? '#ffffffaa' : '#ffffff44';
    ctx.lineWidth = strong ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cv.height); ctx.stroke();
  }
  ctx.lineWidth = 1;
}

function drawPlayhead() {
  if (!abuf) return;
  const x = Math.round(xAtTime(grid, curTime()) - cam) + 0.5;
  ctx.strokeStyle = '#f33'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cv.height); ctx.stroke(); ctx.lineWidth = 1;
}

function drawWave() {
  wctx.fillStyle = '#10142e'; wctx.fillRect(0, 0, wave.width, WAVE_H);
  if (abuf) {
    const key = JSON.stringify(speedSegs(grid)) + COLS;
    if (key !== peaksKey) { peaksKey = key; buildPeaks(); }
  }
  if (!peaks) return;
  const mid = WAVE_H / 2;
  wctx.fillStyle = '#6fa0ff';
  for (let x = 0; x < wave.width; x++) {
    const p = peaks[Math.floor(cam) + x];
    if (!(p >= 0)) continue; // NaN/undefined: außerhalb der Musik
    const h = Math.max(1, p * (WAVE_H - 4));
    wctx.fillRect(x, mid - h / 2, 1, h);
  }
  const px = Math.round(xAtTime(grid, curTime()) - cam) + 0.5;
  wctx.strokeStyle = '#f33'; wctx.lineWidth = 2;
  wctx.beginPath(); wctx.moveTo(px, 0); wctx.lineTo(px, WAVE_H); wctx.stroke(); wctx.lineWidth = 1;
}

// Level-Generator: Rezept aus der Musik (Abschnitte nach Lautstärke), das Grid baut buildLevel() aus den Mustern (patterns.js)
const gbar = document.createElement('div');
gbar.style.cssText = tbar.style.cssText;
gbar.innerHTML = '<button id="gen">Level generieren</button>' +
  '<label>Schwierigkeit (1–5) <input id="diff" type="number" min="1" max="5" step="1" value="2" style="width:50px"></label>' +
  '<label>Seed <input id="seed" type="number" step="1" value="1" style="width:100px"></label>' +
  '<button id="rnd">Zufall</button>';
tbar.after(gbar);
const diffIn = gbar.querySelector('#diff'), seedIn = gbar.querySelector('#seed');
gbar.querySelector('#rnd').onclick = () => { seedIn.value = Math.floor(Math.random() * 1e9); };
gbar.querySelector('#gen').onclick = () => {
  const d = Math.max(1, Math.min(5, Math.round(+diffIn.value) || 1));
  diffIn.value = d;
  generateLevel(d, Math.floor(+seedIn.value) || 0);
};

const SECTION_BARS = 4; // Abschnittslänge in Takten
const SECS_PER_SPEED = 2; // Tempo steigt nach jeweils 2 Abschnitten um eine Stufe (max. 4)

function generateLevel(diff, seed) {
  const bpm = parseFloat(bpmIn.value), off = parseFloat(offIn.value) || 0;
  if (!abuf) { say('Erst Musik laden.'); return; }
  if (!(bpm > 0)) { say('BPM ungültig.'); return; }
  const rnd = mulberry32(seed), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const secLen = SECTION_BARS * 4 * 60 / bpm, t0 = recipeStart(bpm, off), n = Math.floor((abuf.duration - t0) / secLen);
  if (n < 1) { say('Musik zu kurz.'); return; }
  // Lautstärke (RMS) je Abschnitt: laut = schwerer
  const data = abuf.getChannelData(0), sr = abuf.sampleRate;
  const rms = (t, len) => {
    const a = clamp(Math.floor(t * sr), 0, data.length), b = clamp(Math.floor((t + len) * sr), 0, data.length);
    let s = 0, m = 0;
    for (let i = a; i < b; i += 16) { s += data[i] * data[i]; m++; }
    return m ? Math.sqrt(s / m) : 0;
  };
  const r = Array.from({ length: n }, (_, i) => rms(t0 + i * secLen, secLen));
  const lo = Math.min(...r), hi = Math.max(...r);
  const sections = r.map((v, i) => {
    const e = hi > lo ? (v - lo) / (hi - lo) : 0.5;
    let w = rnd() * 8, mode = 'cube'; // Würfel 4,5 : Schiff 2 : Schwerkraft 1,5
    if (i > 0) mode = (w -= 4.5) < 0 ? 'cube' : (w -= 2) < 0 ? 'ship' : 'gravity';
    return { mode, bars: SECTION_BARS, difficulty: clamp(Math.round(diff + (e - 0.5) * 2), 1, 5), speed: Math.min(4, 1 + Math.floor(i / SECS_PER_SPEED)) };
  });
  const rows = buildLevel({ name: 'Generiert', music: 'audio/music.mp3', bpm, offset: off, seed, sections });
  pushUndo(snap());
  grid = toGrid(rows); ROWS = grid.length; COLS = grid[0].length; cam = 0;
  const cnt = m => sections.filter(s => s.mode === m).length;
  showFail(rows.check);
  say('Level generiert: ' + n + ' Abschnitte (' + cnt('ship') + ' Schiff, ' + cnt('gravity') + ' Schwerkraft), ' + rows.patterns + ' Muster, Schwierigkeit ' + diff + ', Seed ' + seed + '.'
    + (rows.check ? ' Bot: ' + botText(rows.check) + (rows.fixes ? ', ' + rows.fixes + ' Nachbesserungen' : '') + '.' : ''));
}

// BPM-Erkennung: Onset-Kurve (positive Energiesprünge) → Autokorrelation → Feinsuche von BPM und Phase (Offset)
function detectBpm() {
  if (!abuf) { say('Erst Musik laden.'); return; }
  const sr = abuf.sampleRate, WIN = 512, HOP = 256, hopT = HOP / sr;
  const n = Math.floor((Math.min(abuf.duration, 120) * sr - WIN) / HOP);
  if (n < 200) { say('Musik zu kurz.'); return; }
  const chs = [...Array(abuf.numberOfChannels).keys()].map(i => abuf.getChannelData(i));
  const en = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const d of chs) for (let j = i * HOP; j < i * HOP + WIN; j += 2) s += d[j] * d[j];
    en[i] = Math.log(1 + 1000 * s / WIN);
  }
  const on = new Float32Array(n);
  for (let i = 1; i < n; i++) on[i] = Math.max(0, en[i] - en[i - 1]);
  const mean = on.reduce((a, b) => a + b, 0) / n;
  for (let i = 0; i < n; i++) on[i] = Math.max(0, on[i] - mean);
  const at = f => { const i = Math.floor(f); return i < 0 || i + 1 >= n ? 0 : on[i] + (on[i + 1] - on[i]) * (f - i); };
  const ac = lag => { let s = 0; for (let i = 0; i + lag + 1 < n; i++) s += on[i] * at(i + lag); return s; };
  let best = 120, bestS = -1;
  for (let b = 70; b <= 180; b += 0.25) {
    const lag = 60 / b / hopT, s = ac(lag) + 0.5 * ac(lag * 2);
    if (s > bestS) { bestS = s; best = b; }
  }
  // Feinsuche: Kamm über die Onsets, BPM in 0,01-Schritten, Phase in Frame-Schritten
  const comb = (b, ph) => {
    const beat = 60 / b; let s = 0;
    for (let t = ph; t < n * hopT - beat; t += beat) { const f = (t - WIN / 2 / sr) / hopT; s += Math.max(at(f - 1), at(f), at(f + 1)); }
    return s;
  };
  let fb = best, fp = 0, fs = -1;
  for (let b = best - 0.6; b <= best + 0.6; b += 0.01) {
    for (let ph = 0; ph < 60 / b; ph += hopT) { const s = comb(b, ph); if (s > fs) { fs = s; fb = b; fp = ph; } }
  }
  bpmIn.value = fb.toFixed(2);
  offIn.value = Math.round(fp * 1000);
  say('BPM erkannt: ' + fb.toFixed(2) + ', Offset ' + Math.round(fp * 1000) + ' ms (am Beat-Raster prüfen).');
}
tbar.querySelector('#detect').onclick = () => { say('Analysiere…'); setTimeout(detectBpm, 20); };
