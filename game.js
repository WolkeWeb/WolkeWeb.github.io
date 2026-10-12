const T = TILE; // Konstanten (TILE, SPEED, GRAV, JUMP, DT) kommen aus config.js
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let map, ROWS, COLS;
let colOff = 0; // Endlos: Anzahl verworfener Spalten links (Spaltennummern bleiben absolut)
let coinIdx = new Map(); // Münz-Tile ("c,r") -> Index 0..MAX_COINS-1 (Spaltenreihenfolge; weitere Münzen zählen nicht)
const tile = (c, r) => map[r]?.[c - colOff] ?? '.';
function setMap(m) {
  map = m; colOff = 0; ROWS = m.length; COLS = Math.max(...m.map(r => r.length));
  coinIdx = new Map();
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) if (m[r][c] === '*' && coinIdx.size < MAX_COINS) coinIdx.set(c + ',' + r, coinIdx.size);
}
setMap(levelGrid(LEVELS[0]));

let p, held = false, state = 'menu', attempt = 1, timer = 0, parts = [];
let pressed = false; // Eingabe wurde seit dem letzten Tick neu gedrückt
let usedOrbs = new Set(); // bereits genutzte Orbs ("c,r") im aktuellen Versuch
const down = new Set(); // aktuell gehaltene Eingaben (Taste/Zeiger)
let inputLocked = false; // nach Neustart: Sprung gesperrt, bis alles losgelassen wurde
// Audio: erst nach der ersten Nutzereingabe aktiv (Autoplay-Sperre)
const music = new Audio('audio/music.mp3'), deathSnd = new Audio('audio/death.wav');
music.loop = true;
let audioOn = false, muted = false;
// Übungsmodus (im Hauptmenü umschaltbar): Checkpoint mit Z / Button, Tod → zurück zum Checkpoint, keine Musik
let practice = false, cp = null;
// Bestleistung in % pro Level (localStorage); bestKey = Level-Kennung ('L0', 'custom') oder null (nicht gespeichert)
let bestKey = null, newRecord = false, deathPct = 0;
const getBest = key => { try { return +localStorage.getItem('gdBest.' + key) || 0; } catch { return 0; } };
function recordBest(pct) {
  if (!bestKey || practice || startX !== START_COL * T || pct <= getBest(bestKey)) return;
  try { localStorage.setItem('gdBest.' + bestKey, String(pct)); newRecord = true; } catch {}
}
// Münzen: pro Level gesammelte Indizes in localStorage; runCoins = in diesem Versuch eingesammelt (gespeichert erst beim Sieg, nicht im Übungsmodus)
let runCoins = new Set(), savedCoins = new Set();
const getCoins = key => { try { const v = JSON.parse(localStorage.getItem('gdCoins.' + key)); return Array.isArray(v) ? v.filter(i => i >= 0 && i < MAX_COINS) : []; } catch { return []; } };
const totalCoins = () => LEVELS.reduce((n, _, i) => n + getCoins('L' + i).length, 0);
const levelCoins = m => Math.min(MAX_COINS, levelGrid(m).join('').split('*').length - 1);
const coinText = (key, total) => total ? '◎ ' + getCoins(key).length + '/' + total : '';
function saveCoins() {
  if (!bestKey || practice || !runCoins.size) return;
  try { localStorage.setItem('gdCoins.' + bestKey, JSON.stringify([...new Set([...getCoins(bestKey), ...runCoins])])); } catch {}
}
// Kleine Hinweis-Einblendung (unten mittig)
let toastMsg = '', toastUntil = 0;
function toast(msg) { toastMsg = msg; toastUntil = performance.now() + 2200; }
function drawToast() {
  const left = toastUntil - performance.now();
  if (!toastMsg || left <= 0) return;
  ctx.save(); ctx.globalAlpha = Math.min(1, left / 300); ctx.font = '16px sans-serif'; ctx.textAlign = 'center';
  const w = ctx.measureText(toastMsg).width + 32, x = (cv.width - w) / 2;
  ctx.fillStyle = '#000d'; ctx.fillRect(x, 352, w, 32); ctx.strokeStyle = '#cfe0ff'; ctx.strokeRect(x, 352, w, 32);
  ctx.fillStyle = '#fff'; ctx.fillText(toastMsg, cv.width / 2, 373);
  ctx.restore();
}
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); return toast(okMsg); } catch {}
  try { // Fallback ohne Clipboard-API
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove();
    toast(ok ? okMsg : 'Kopieren fehlgeschlagen');
  } catch { toast('Kopieren fehlgeschlagen'); }
}
// Laufzeit des aktuellen Versuchs (Ticks), Endlos-Bestzeit (s), Ergebnis-Text
let runTicks = 0, deathSec = 0, winTime = 0, levelName = 'Level';
const runSec = () => runTicks * DT / 1000;
const fmtSec = s => s.toFixed(1) + ' s';
const fmtTime = s => Math.floor(s / 60) + ':' + (s % 60).toFixed(1).padStart(4, '0');
const getBestT = () => { try { return +localStorage.getItem('gdBestT.endless') || 0; } catch { return 0; } };
function recordTime(sec) {
  sec = Math.floor(sec * 10) / 10;
  if (sec <= getBestT()) return;
  try { localStorage.setItem('gdBestT.endless', String(sec)); newRecord = true; } catch {}
}
function resultText() {
  const n = coinIdx.size, coins = Array.from({ length: n }, (_, i) => runCoins.has(i) ? '🪙' : '⚫').join('');
  return levelName + ' geschafft! 🎉\nVersuche: ' + attempt + '  ·  Zeit: ' + fmtTime(winTime) + (n ? '\nMünzen: ' + coins : '') + (practice ? '\n(Übungsmodus)' : '');
}
const copyResult = () => copyText(resultText(), 'Ergebnis in die Zwischenablage kopiert');
const progressPct = () => Math.max(0, Math.min(100, Math.floor(p.x / (COLS * T) * 100)));
function win() { state = 'won'; winTime = runSec(); recordBest(100); saveCoins(); savedCoins = new Set(bestKey ? getCoins(bestKey) : []); }
function toggleMute() { unlockAudio(); muted = !muted; music.muted = deathSnd.muted = muted; toast(muted ? 'Ton aus' : 'Ton an'); }
function setCheckpoint() { if (practice && state === 'play') { cp = { p: { ...p, trail: p.trail && [...p.trail] }, orbs: new Set(usedOrbs), coins: new Set(runCoins), ticks: runTicks }; toast('Checkpoint gesetzt'); } }
let startX = START_COL * T, startT = 0; // Startposition (px) und Musikstart (s)
function playMusic() {
  if (!audioOn || practice) return;
  music.volume = 1; music.currentTime = startT; music.play().catch(() => {});
}
// Analyse: Bass-Lautstärke 0–1 (nur Rendering)
let actx, analyser, freqData, bass = 0;
function setupAnalyser() {
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const src = actx.createMediaElementSource(music);
    analyser = actx.createAnalyser(); analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.6;
    src.connect(analyser); analyser.connect(actx.destination);
    freqData = new Uint8Array(analyser.frequencyBinCount);
  } catch { analyser = null; }
}
function updateBass() {
  if (!analyser) { bass *= 0.9; return; }
  if (actx.state === 'suspended') actx.resume().catch(() => {});
  analyser.getByteFrequencyData(freqData);
  let s = 0; for (let i = 0; i < 4; i++) s += freqData[i]; // ~0–340 Hz
  const t = Math.max(0, Math.min(1, (s / 4 / 255 - 0.35) / 0.5));
  bass = Math.max(t, bass * 0.88);
}
function unlockAudio() {
  if (audioOn) return;
  audioOn = true;
  setupAnalyser();
  if (state === 'play') playMusic();
}
function reset() {
  if (practice && cp) { p = { ...cp.p, trail: cp.p.trail && [...cp.p.trail] }; usedOrbs = new Set(cp.orbs); runCoins = new Set(cp.coins); runTicks = cp.ticks || 0; }
  else {
    if (endless) endlessInit();
    runTicks = 0;
    p = { x: startX, y: (ROWS - 2) * T, vy: 0, ground: true, rot: 0, target: 0, ship: false, grav: gravAt(world, startX), spd: speedAtX(map, startX) };
    usedOrbs = new Set(); runCoins = new Set();
  }
  state = 'play'; parts = []; pressed = false; newRecord = false;
  inputLocked = down.size > 0;
  playMusic();
}
// Tod: Partikel-Explosion, nach ~0,5 s (30 Ticks) Neustart
function die() {
  state = 'dead'; timer = 30; deathPct = progressPct();
  if (endless) { deathSec = runSec(); recordTime(deathSec); } else recordBest(deathPct);
  music.pause(); music.currentTime = 0;
  if (audioOn) { deathSnd.currentTime = 0; deathSnd.play().catch(() => {}); }
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5;
    parts.push({ x: p.x + T / 2, y: p.y + T / 2, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2 });
  }
}

// Sicht auf das aktuelle Level für step() (bot.js)
const world = {
  tile, colHas: (c, ch) => { for (let r = 0; r < ROWS; r++) if (tile(c, r) === ch) return true; return false; },
  get ROWS() { return ROWS; }, get COLS() { return COLS; }, get coinIdx() { return coinIdx; },
};

// Icons: 8 Farben + 4 Gesichter; need = Münzen (Summe über alle Levels), ab denen freigeschaltet
const ICON_COLORS = ['#ffd400', '#ff4f4f', '#4fe86f', '#4fe8ff', '#b84fff', '#ff9a3d', '#ff4fd8', '#ffffff'], COLOR_NEED = [0, 0, 0, 0, 1, 1, 2, 3];
const FACE_NEED = [0, 1, 2, 3];
let icon = { c: 0, f: 0 };
try {
  const v = JSON.parse(localStorage.getItem('gdIcon'));
  if (v && ICON_COLORS[v.c] && FACE_NEED[v.f] !== undefined) icon = { c: v.c, f: v.f };
} catch {}
function drawFace(f, x0, y0, s) { // Gesicht im Quadrat (x0, y0, Seite s), schwarz
  const ex = [x0 + 0.25 * s, x0 + 0.55 * s], ey = y0 + (f === 2 ? 0.3 : 0.25) * s, es = 0.2 * s;
  ctx.fillStyle = ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(2, s / 14);
  if (f === 3) { // Sonnenbrille
    ctx.fillRect(x0 + 0.15 * s, y0 + 0.22 * s, 0.7 * s, 0.24 * s);
    ctx.fillStyle = '#fff'; ctx.fillRect(x0 + 0.2 * s, y0 + 0.25 * s, 0.1 * s, 0.06 * s); ctx.fillStyle = '#000';
  } else for (const x of ex) ctx.fillRect(x, ey, es, es);
  ctx.beginPath();
  if (f === 1 || f === 3) ctx.arc(x0 + 0.5 * s, y0 + 0.52 * s, 0.2 * s, 0.15 * Math.PI, 0.85 * Math.PI);
  if (f === 2) { ctx.moveTo(x0 + 0.2 * s, y0 + 0.14 * s); ctx.lineTo(x0 + 0.48 * s, y0 + 0.26 * s); ctx.moveTo(x0 + 0.8 * s, y0 + 0.14 * s); ctx.lineTo(x0 + 0.52 * s, y0 + 0.26 * s); ctx.moveTo(x0 + 0.3 * s, y0 + 0.78 * s); ctx.lineTo(x0 + 0.7 * s, y0 + 0.78 * s); }
  ctx.stroke(); ctx.lineWidth = 1;
}

// Menü: 'menu' (Hauptmenü), 'levels' (Levelauswahl), 'icons' (Icon-Menü); Buttons werden bei Bedarf neu aufgebaut
let buttons = [];
const inMenu = () => state === 'menu' || state === 'levels' || state === 'icons';
function loadCustom() { // gültiges Level aus localStorage oder null
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return null;
    let v;
    try { v = JSON.parse(raw); } catch { v = raw.split(/\r?\n/); }
    return Array.isArray(v) && v.length >= 2 && v.every(r => typeof r === 'string') ? v : null;
  } catch { return null; }
}
function startLevel(m, x, key, name) { // x: optionale Start-x-Position (Musikzeit = timeAtX); m: Grid oder Rezept (levels.js)
  m = levelGrid(m); endless = null; levelName = name || m.name || 'Level';
  const track = m.music || 'audio/music.mp3';
  if (!music.src.endsWith(track)) music.src = track;
  startX = x ?? START_COL * T; startT = Math.max(0, timeAtX(m, startX));
  setMap(m); attempt = 1; cp = null; bestKey = key || null; savedCoins = new Set(bestKey ? getCoins(bestKey) : []); reset();
}
// Endlos: Level wächst in Abschnitten (buildLevel), alte Spalten fallen weg. Tempo +1 Stufe je ~30 s, Schwierigkeit steigt mit.
// Abschnitte haben gerade Taktzahlen und liegen exakt aneinander, so bleibt die Musik im Takt.
const ENDLESS = { music: 'audio/music.mp3', bpm: 125, offset: 0 };
let endless = null; // { seed, idx (Abschnittszähler), t (geplante Zeit am Abschnittsanfang, s), wx (Welt-x am Abschnittsanfang) }
function endlessInit() {
  const t0 = recipeStart(ENDLESS.bpm, ENDLESS.offset);
  endless = { seed: Math.floor(Math.random() * 1e9), idx: 0, t: t0, wx: START_COL * T + t0 * PPS };
  setMap(Array(LEVEL_ROWS).fill('')); COLS = Infinity; map.bpm = ENDLESS.bpm;
  endlessGrow(START_COL * T);
}
function endlessChunk() {
  const e = endless, seed = e.seed + e.idx * 7919, rnd = mulberry32(seed), bar = 4 * 60 / ENDLESS.bpm;
  const pool = ['cube', 'cube'];
  if (e.t >= 10) pool.push('ship');
  if (e.t >= 25) pool.push('gravity');
  if (e.t >= 45) pool.push('wave');
  const mode = e.idx ? pool[Math.floor(rnd() * pool.length)] : 'cube', sections = [];
  let t = e.t, len = 0;
  const add = (m, bars) => {
    const speed = Math.min(4, 1 + Math.floor((t + 4) / 30)), difficulty = Math.max(1, Math.min(5, 1 + Math.floor(t / 25) - (rnd() < 0.25 ? 1 : 0)));
    sections.push({ mode: m, bars, difficulty, speed });
    len += bars * bar * PPS * SPEEDS[speed - 1]; t += bars * bar;
  };
  add(mode, 4);
  if (mode !== 'cube') add('cube', 2); // zurück auf Würfel, damit Abschnitte ohne Portal-Konflikt aneinanderpassen
  const rows = buildLevel({ bpm: ENDLESS.bpm, offset: ENDLESS.offset, seed, sections, coins: false, check: false }); // keine Bot-Prüfung: würde mitten im Lauf ruckeln
  const n = Math.round((e.wx + len) / T) - Math.round(e.wx / T), from = e.idx ? rows.c0 : 0;
  for (let r = 0; r < map.length; r++) map[r] += rows[r].slice(from, rows.c0 + n);
  e.idx++; e.t = t; e.wx += len;
}
function endlessGrow(px) { while (colOff + map[0].length - Math.floor(px / T) < 100) endlessChunk(); }
function endlessTick() {
  endlessGrow(p.x);
  const drop = Math.floor(p.x / T) - 12 - colOff;
  if (drop >= 40) { for (let r = 0; r < map.length; r++) map[r] = map[r].slice(drop); colOff += drop; }
}
function startEndless() {
  practice = false; // Übungsmodus gilt hier nicht
  if (!music.src.endsWith(ENDLESS.music)) music.src = ENDLESS.music;
  levelName = 'Endlos'; startX = START_COL * T; startT = 0; attempt = 1; cp = null; bestKey = null; savedCoins = new Set();
  endless = {}; reset(); // reset() erzeugt die Welt
}
// Tageslevel: Seed = heutiges Datum (YYYYMMDD), mittlere Schwierigkeit
let dailyRec = null;
function dailyLevel() {
  const d = new Date(), key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  if (dailyRec?.key === key) return dailyRec;
  const rnd = mulberry32(key), pool = ['cube', 'cube', 'ship', 'gravity', 'wave'], sections = [];
  for (let i = 0; i < 12; i++) sections.push({ mode: i ? pool[Math.floor(rnd() * pool.length)] : 'cube', bars: 3 + Math.floor(rnd() * 2), difficulty: 2 + Math.floor(rnd() * 3), speed: i < 5 ? 1 : 2 });
  const pad = n => String(n).padStart(2, '0');
  return dailyRec = { key, name: 'Tageslevel ' + pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear(), music: 'audio/music.mp3', bpm: 125, offset: 0, seed: key, sections };
}
function startDaily() { const r = dailyLevel(); startLevel(r, undefined, 'D' + r.key, r.name); }
function goMenu() {
  state = 'menu'; cp = null; down.clear(); held = false; inputLocked = false; parts = [];
  music.pause(); music.currentTime = 0;
  const bw = 240, gap = 16, bx = (cv.width - 2 * bw - gap) / 2, custom = loadCustom(), daily = dailyLevel(), bt = getBestT();
  const items = [
    { label: 'Spielen', fn: goLevels },
    { label: 'Endlos', sub: bt ? 'Best: ' + fmtSec(bt) : '', fn: startEndless },
    { label: 'Tageslevel', sub: [bestText('D' + daily.key), coinText('D' + daily.key, levelCoins(daily))].filter(Boolean).join('   '), fn: startDaily },
    { label: 'Editor', fn: () => { location.href = 'editor.html'; } },
  ];
  if (custom) items.push({ label: 'Eigenes Level', sub: [bestText('custom'), coinText('custom', levelCoins(custom))].filter(Boolean).join('   '), fn: () => startLevel(custom, undefined, 'custom', 'Eigenes Level') });
  items.push({ label: 'Übungsmodus: ' + (practice ? 'An' : 'Aus'), fn: () => { practice = !practice; goMenu(); } });
  buttons = items.map((b, i) => ({ ...b, x: bx + (i % 2) * (bw + gap), y: 105 + Math.floor(i / 2) * 50, w: bw, h: 42 }));
  if (items.length % 2) buttons[items.length - 1].x = (cv.width - bw) / 2;
  buttons.push({ label: 'Icon', x: 690, y: 18, w: 92, h: 40, fn: goIcons });
}
const bestText = key => getBest(key) ? 'Best: ' + getBest(key) + '%' : '';
function goIcons() {
  state = 'icons';
  const total = totalCoins(), save = () => { try { localStorage.setItem('gdIcon', JSON.stringify(icon)); } catch {} goIcons(); };
  const lock = (b, need) => { if (total < need) { b.locked = need; b.fn = () => {}; } return b; };
  buttons = ICON_COLORS.map((col, i) => lock({ x: 134 + i * 68, y: 150, w: 56, h: 56, col, sel: icon.c === i, fn: () => { icon.c = i; save(); } }, COLOR_NEED[i]));
  FACE_NEED.forEach((need, i) => buttons.push(lock({ x: 204 + i * 104, y: 240, w: 80, h: 80, face: i, col: ICON_COLORS[icon.c], sel: icon.f === i, fn: () => { icon.f = i; save(); } }, need)));
  buttons.push({ label: 'Zurück', x: (cv.width - 240) / 2, y: 352, w: 240, h: 38, fn: goMenu });
}
function goLevels() {
  state = 'levels';
  const bw = 240, gap = 16, per = 2;
  buttons = LEVELS.map((m, i) => {
    const secs = m.sections, d = secs?.length ? Math.max(1, Math.min(5, Math.round(secs.reduce((a, s) => a + (s.difficulty || 1), 0) / secs.length))) : 0;
    return {
      label: m.name || 'Level ' + (i + 1), stars: d, sub: [bestText('L' + i), coinText('L' + i, levelCoins(m))].filter(Boolean).join('   '),
      x: (cv.width - (Math.min(per, LEVELS.length - Math.floor(i / per) * per) * (bw + gap) - gap)) / 2 + (i % per) * (bw + gap),
      y: 135 + Math.floor(i / per) * 56, w: bw, h: 48, fn: () => startLevel(m, undefined, 'L' + i, m.name || 'Level ' + (i + 1)),
    };
  });
  buttons.push({ label: 'Zurück', x: (cv.width - 240) / 2, y: 352, w: 240, h: 38, fn: goMenu });
}
function menuClick(e) {
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) * cv.width / r.width, y = (e.clientY - r.top) * cv.height / r.height;
  const b = buttons.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  if (b) b.fn();
}
function drawMenu() {
  const g = ctx.createLinearGradient(0, 0, 0, cv.height);
  g.addColorStop(0, 'hsl(240,55%,30%)'); g.addColorStop(1, 'hsl(270,60%,12%)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#ffd400'; ctx.textAlign = 'center';
  ctx.font = 'bold 56px sans-serif'; ctx.fillText('GD Clone', cv.width / 2, 90);
  if (state === 'levels') { ctx.fillStyle = '#fff'; ctx.font = '22px sans-serif'; ctx.fillText('Level wählen', cv.width / 2, 125); }
  if (state === 'icons') {
    ctx.fillStyle = '#fff'; ctx.font = '22px sans-serif'; ctx.fillText('Icon wählen   ◎ ' + totalCoins(), cv.width / 2, 125);
    ctx.font = '13px sans-serif'; ctx.fillStyle = '#cfe0ff'; ctx.fillText('Gesperrte Icons werden mit Münzen freigeschaltet', cv.width / 2, 230);
  }
  ctx.font = '22px sans-serif';
  for (const b of buttons) {
    if (b.col) { // Icon-Button: Farbfeld oder Gesicht
      ctx.fillStyle = b.locked ? '#222' : b.col; ctx.fillRect(b.x, b.y, b.w, b.h);
      if (b.face !== undefined && !b.locked) drawFace(b.face, b.x, b.y, b.w);
      ctx.strokeStyle = b.sel ? '#ffd400' : '#cfe0ff'; ctx.lineWidth = b.sel ? 4 : 2; ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.lineWidth = 1;
      if (b.locked) { ctx.fillStyle = '#fff'; ctx.font = '16px sans-serif'; ctx.fillText('◎ ' + b.locked, b.x + b.w / 2, b.y + b.h / 2 + 6); ctx.font = '22px sans-serif'; }
      continue;
    }
    ctx.fillStyle = '#3d5a9e'; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = '#cfe0ff'; ctx.lineWidth = 2; ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.lineWidth = 1;
    ctx.fillStyle = '#fff';
    if (b.stars || b.sub) {
      const info = [b.stars ? '★'.repeat(b.stars) + '☆'.repeat(5 - b.stars) : '', b.sub].filter(Boolean).join('   ');
      ctx.fillText(b.label, b.x + b.w / 2, b.y + (b.h > 44 ? 22 : 24));
      ctx.font = '13px sans-serif'; ctx.fillStyle = '#cfe0ff'; ctx.fillText(info, b.x + b.w / 2, b.y + (b.h > 44 ? 40 : 39)); ctx.font = '22px sans-serif';
    }
    else ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 8);
  }
  if (state === 'menu') { // Steuerungshilfe
    ctx.fillStyle = '#cfe0ff'; ctx.font = '14px sans-serif';
    ctx.fillText('Springen: Leertaste / Klick / Touch  ·  M = Ton  ·  ESC = Menü', cv.width / 2, 345);
    ctx.fillText('Übungsmodus: Z = Checkpoint setzen (am Handy: Z-Button)', cv.width / 2, 367);
  }
  drawToast();
}

// Ein Physik-Tick: step() aus bot.js (dieselbe Simulation wie der Spielbarkeits-Bot), danach Spiel-Ereignisse und Effekte
function update() {
  if (inMenu() || state === 'won' || state === 'paused') return;
  if (state === 'dead') {
    for (const q of parts) { q.x += q.vx; q.y += q.vy; q.vy += 0.3; }
    if (--timer <= 0) { attempt++; reset(); }
    return;
  }
  if (endless) endlessTick();
  runTicks++;
  const inSpd = p.inSpd, wasWave = p.wave;
  p.orbs = usedOrbs; p.coins = runCoins;
  const ev = step(p, held && !inputLocked, pressed && !inputLocked, world);
  pressed = false; usedOrbs = p.orbs; runCoins = p.coins;
  if (p.inSpd && p.inSpd !== inSpd) flash = { col: PORTALS[String(p.inSpd)][0], t: performance.now() }; // Blitz beim Durchfliegen
  if (ev === 'win') win();
  else if (ev === 'die') die();
  else if (ev === 'end') { cp = null; reset(); } // Levelende ohne Ziel → von vorn
  else if (wasWave) { p.trail.push({ x: p.x + T / 2, y: p.y + T / 2 }); if (p.trail.length > 90) p.trail.shift(); }
}

let wonAt = 0;
// Render-Effekte (keine Physik): Hue-Wechsel, Kamera-Y, Partikel, Squash, Shake
let flash = null; // Farbblitz beim Tempo-Portal
let hueCur = 220, camY = 0, fx = [], fxP = null, prevGround = true, prevState = '', squash = 0, shakeUntil = 0, lastDraw = 0;
function drawLayer(cam, f, size, gap, alpha, hue) {
  const step = size + gap, off = cam * f, sz = size * (1 + 0.25 * bass);
  ctx.fillStyle = `hsla(${hue},60%,70%,${alpha + 0.08 * bass})`;
  for (let i = Math.floor(off / step) - 1; i <= Math.ceil((off + cv.width) / step); i++) {
    const y = (((i * 3) % 5) + 5) % 5 * (cv.height / 5) - size / 3 - camY * f;
    ctx.fillRect(i * step - off - (sz - size) / 2, y - (sz - size) / 2, sz, sz);
  }
}
function draw() {
  if (inMenu()) { prevState = state; return drawMenu(); }
  const now = performance.now(), k = Math.min(3, (now - (lastDraw || now)) / DT || 1); lastDraw = now;
  const cam = p.x - 150, pr = Math.min(1, p.x / (COLS * T));
  updateBass();
  // Hintergrundfarbe: alle 8 Takte (4/4) neuer Ton, weicher Übergang
  const bpm = map.bpm ?? (typeof BPM !== 'undefined' ? BPM : 120);
  const seg = Math.max(0, Math.floor((endless ? runSec() : timeAtX(map, p.x)) / (8 * 4 * 60 / bpm)));
  hueCur += (220 + seg * 50 - hueCur) * Math.min(1, 0.02 * k);
  const hue = hueCur;
  // neuer Versuch: Effekte zurücksetzen
  if (p !== fxP) { fxP = p; fx = []; camY = 0; prevGround = p.ground; squash = 0; }
  if (state === 'dead' && prevState !== 'dead') shakeUntil = now + 300;
  prevState = state;
  if (state === 'play') {
    if (p.ground && !prevGround) { // Landung: Staub + Squash
      squash = 1;
      for (let i = 0; i < 8; i++)
        fx.push({ x: p.x + T / 2, y: p.grav > 0 ? p.y + T : p.y, vx: (Math.random() - 0.7) * 3, vy: -Math.random() * 1.5, life: 1, size: 3 + Math.random() * 3, dust: true });
    }
    prevGround = p.ground;
    if (!p.wave) fx.push({ x: p.x + 4, y: p.y + T / 2 + (Math.random() - 0.5) * T * 0.6, vx: 0, vy: 0, life: 1, size: 10, hue: hue + 150 });
  }
  squash = Math.max(0, squash - 0.08 * k);
  for (const q of fx) { q.x += q.vx * k; q.y += q.vy * k; q.life -= (q.dust ? 0.04 : 0.06) * k; }
  fx = fx.filter(q => q.life > 0);
  // Kamera folgt vertikal weich, wenn der Spieler hoch springt
  camY += (Math.min(0, p.y - (ROWS - 2) * T + 80) - camY) * Math.min(1, 0.08 * k);
  ctx.save();
  if (now < shakeUntil) { const m = 8 * (shakeUntil - now) / 300; ctx.translate((Math.random() - 0.5) * 2 * m, (Math.random() - 0.5) * 2 * m); }
  const g = ctx.createLinearGradient(0, 0, 0, cv.height);
  g.addColorStop(0, `hsl(${hue},55%,${30 + 5 * bass}%)`); g.addColorStop(1, `hsl(${hue + 30},60%,${12 + 4 * bass}%)`);
  ctx.fillStyle = g; ctx.fillRect(-20, -20, cv.width + 40, cv.height + 40);
  drawLayer(cam, 0.2, 140, 160, 0.06, hue);
  drawLayer(cam, 0.4, 70, 120, 0.09, hue);
  ctx.save(); ctx.translate(0, -camY);
  for (let c = Math.floor(cam / T); c <= Math.ceil((cam + cv.width) / T); c++)
    for (let r = 0; r < ROWS; r++) {
      const ch = tile(c, r), x = c * T - cam, y = r * T;
      if (ch === '#') {
        ctx.fillStyle = '#3d5a9e'; ctx.fillRect(x, y, T, T);
        if (tile(c, r - 1) !== '#') {
          ctx.fillStyle = `hsl(220,100%,${81 + 15 * bass}%)`; ctx.shadowColor = '#cfe0ff'; ctx.shadowBlur = 12 * bass;
          ctx.fillRect(x, y, T, 3 + 3 * bass); ctx.shadowBlur = 0;
        }
      }
      else if (ch === 'o') {
        const s = 1 + 0.15 * Math.sin(performance.now() / 120) + 0.4 * bass;
        ctx.fillStyle = '#ffe600'; ctx.shadowColor = '#ffe600'; ctx.shadowBlur = 8 * s;
        ctx.fillRect(x + T / 2 - T / 2 * s, y + T - 8 * s, T * s, 8 * s); ctx.shadowBlur = 0;
      }
      else if (ch === 'O') {
        if (usedOrbs.has(c + ',' + r)) continue;
        const s = 1 + 0.15 * Math.sin(performance.now() / 120) + 0.4 * bass;
        ctx.beginPath(); ctx.arc(x + T / 2, y + T / 2, 11 * s, 0, Math.PI * 2);
        ctx.fillStyle = '#ffe600'; ctx.shadowColor = '#ffe600'; ctx.shadowBlur = 14 + 14 * bass; ctx.fill(); ctx.shadowBlur = 0;
        ctx.strokeStyle = '#fff6a0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + T / 2, y + T / 2, 16 * s, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
      }
      else if (ch === '*') {
        const i = coinIdx.get(c + ',' + r);
        if (i === undefined || runCoins.has(i)) continue;
        const w = 12 * Math.abs(Math.cos(performance.now() / 250 + c)) + 2;
        ctx.globalAlpha = savedCoins.has(i) ? 0.45 : 1;
        ctx.beginPath(); ctx.ellipse(x + T / 2, y + T / 2, w, 13, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd400'; ctx.shadowColor = '#ffd400'; ctx.shadowBlur = 8 + 8 * bass; ctx.fill(); ctx.shadowBlur = 0;
        ctx.strokeStyle = '#a07800'; ctx.lineWidth = 3; ctx.stroke(); ctx.lineWidth = 1; ctx.globalAlpha = 1;
      }
      else if (ch === '|') { ctx.fillStyle = '#4f4'; ctx.fillRect(x + T / 2 - 3, y, 6, T); }
      else if (PORTALS[ch]) { // Portal: hohes, schmales, leuchtendes Oval (~3 Tiles)
        const col = PORTALS[ch][0], pulse = 1 + 0.08 * Math.sin(performance.now() / 150) + 0.15 * bass;
        ctx.beginPath(); ctx.ellipse(x + T / 2, y + T / 2, 10 * pulse, 1.5 * T, 0, 0, Math.PI * 2);
        ctx.fillStyle = col + '44'; ctx.shadowColor = col; ctx.shadowBlur = 16 + 12 * bass; ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke(); ctx.lineWidth = 1; ctx.shadowBlur = 0;
        if (PORTALS[ch][1]) { ctx.fillStyle = col; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(PORTALS[ch][1], x + T / 2, y + T / 2 + 7); }
      }
      else if (ch === '^') {
        ctx.beginPath(); ctx.moveTo(x, y + T); ctx.lineTo(x + T / 2, y); ctx.lineTo(x + T, y + T); ctx.closePath();
        ctx.fillStyle = '#c22'; ctx.fill();
        ctx.strokeStyle = '#ff9a9a'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.lineWidth = 1;
      }
    }
  for (const q of fx) { // Spur + Staub
    ctx.globalAlpha = q.life * (q.dust ? 0.6 : 0.5);
    ctx.fillStyle = q.dust ? '#ddd' : `hsl(${q.hue},90%,60%)`;
    const sz = q.size * (q.dust ? 1 : q.life);
    ctx.fillRect(q.x - cam - sz / 2, q.y - sz / 2, sz, sz);
  }
  ctx.globalAlpha = 1;
  const ic = ICON_COLORS[icon.c];
  if (p.wave && p.trail.length > 1 && state !== 'dead') { // Wellen-Spur als Linie
    ctx.strokeStyle = ic; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.globalAlpha = 0.85;
    ctx.beginPath(); p.trail.forEach((q, i) => i ? ctx.lineTo(q.x - cam, q.y) : ctx.moveTo(q.x - cam, q.y));
    ctx.lineTo(p.x + T / 2 - cam, p.y + T / 2); ctx.stroke(); ctx.lineWidth = 1; ctx.globalAlpha = 1;
  }
  if (state === 'dead') {
    ctx.fillStyle = ic;
    for (const q of parts) ctx.fillRect(q.x - cam - 3, q.y - 3, 6, 6);
  } else {
    ctx.save(); // Spieler, um Mittelpunkt rotiert; Squash beim Landen (Unterkante bleibt am Boden)
    ctx.translate(p.x - cam + T / 2, p.y + T / 2);
    const sq = 0.25 * squash * squash;
    ctx.translate(0, T / 2 * sq * p.grav); ctx.scale(1 + sq, 1 - sq);
    ctx.rotate(p.rot); ctx.scale(1, p.grav);
    ctx.shadowColor = ic; ctx.shadowBlur = 16;
    if (p.wave) { // Welle: Pfeil in Flugrichtung
      ctx.beginPath(); ctx.moveTo(-13, -13); ctx.lineTo(15, 0); ctx.lineTo(-13, 13); ctx.closePath();
      ctx.fillStyle = ic; ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.lineWidth = 1;
    } else if (p.ship) { // Schiff: kleiner Würfel auf flachem Rumpf
      ctx.fillStyle = '#ff4fd8'; ctx.fillRect(-T / 2, 2, T, 12);
      ctx.fillStyle = ic; ctx.fillRect(-12, -14, 24, 24);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(-12, -14, 24, 24); ctx.strokeRect(-T / 2, 2, T, 12); ctx.lineWidth = 1;
      drawFace(icon.f, -12, -14, 24);
    } else {
    ctx.fillStyle = ic; ctx.fillRect(-T / 2, -T / 2, T, T);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(-T / 2 + 1, -T / 2 + 1, T - 2, T - 2); ctx.lineWidth = 1;
    drawFace(icon.f, -T / 2, -T / 2, T);
    }
    ctx.restore();
  }
  ctx.restore(); // Kamera
  ctx.restore(); // Shake
  if (state === 'won') { // Musik in 1 s ausblenden
    if (!wonAt) wonAt = performance.now();
    const k = Math.min(1, (performance.now() - wonAt) / 1000);
    music.volume = 1 - k;
    if (k >= 1) music.pause();
  } else wonAt = 0;
  if (flash) {
    const a = 1 - (performance.now() - flash.t) / 250;
    if (a > 0) { ctx.globalAlpha = a * 0.45; ctx.fillStyle = flash.col; ctx.fillRect(0, 0, cv.width, cv.height); ctx.globalAlpha = 1; }
    else flash = null;
  }
  // Fortschrittsbalken + Versuchszähler
  if (endless) { // Endlos: Zeit statt Fortschrittsbalken
    const bt = getBestT();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(fmtSec(state === 'dead' ? deathSec : runSec()) + '   ·   Tempo ×' + p.spd + (bt ? '   ·   Best ' + fmtSec(bt) : ''), cv.width / 2, 22);
  } else {
    ctx.fillStyle = '#0006'; ctx.fillRect(100, 10, 600, 10);
    ctx.fillStyle = '#4f4'; ctx.fillRect(100, 10, 600 * pr, 10);
  }
  ctx.fillStyle = '#fff'; ctx.font = '16px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('Versuch ' + attempt, 10, 20);
  if (practice) { ctx.fillStyle = '#4fe8ff'; ctx.fillText('Übungsmodus', 10, 40); }
  if (coinIdx.size) { ctx.fillStyle = '#ffd400'; ctx.fillText('◎ ' + runCoins.size + '/' + coinIdx.size, 10, practice ? 60 : 40); }
  if (state === 'dead') { // erreichter Prozentwert groß, blendet in den letzten Ticks aus
    ctx.globalAlpha = Math.min(1, timer / 10); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 96px sans-serif';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 8; ctx.fillText(endless ? fmtSec(deathSec) : deathPct + '%', cv.width / 2, 240); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
  if (state === 'dead' && newRecord) {
    ctx.fillStyle = '#ffd400'; ctx.textAlign = 'center'; ctx.font = 'bold 32px sans-serif';
    ctx.fillText('Neuer Rekord! ' + (endless ? fmtSec(deathSec) : progressPct() + '%'), cv.width / 2, 130);
  }
  drawButtons(hudButtons());
  if (state === 'paused') {
    ctx.fillStyle = '#000a'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '40px sans-serif'; ctx.fillText('Pause', cv.width / 2, 140);
    drawButtons(pauseButtons());
  }
  ctx.textAlign = 'left';
  if (state === 'won') {
    ctx.fillStyle = '#000a'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = '40px sans-serif'; ctx.fillText('Level geschafft!', cv.width / 2, 170);
    ctx.font = '20px sans-serif';
    ctx.fillText('Versuche: ' + attempt + '   Zeit: ' + fmtTime(winTime) + (coinIdx.size ? '   ◎ ' + runCoins.size + '/' + coinIdx.size + (practice ? ' (Übung: nicht gespeichert)' : '') : ''), cv.width / 2, 210);
    ctx.fillText('Leertaste = Neustart  ·  C = Ergebnis kopieren', cv.width / 2, 245);
    drawButtons(winButtons());
  }
  drawToast();
}

function drawButtons(list) {
  ctx.textAlign = 'center'; ctx.font = 'bold 16px sans-serif';
  for (const b of list) {
    ctx.fillStyle = '#0008'; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = '#cfe0ff'; ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#fff'; ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 6);
  }
}
const winButtons = () => [{ label: 'Ergebnis kopieren', x: 290, y: 262, w: 220, h: 36, fn: copyResult }];
// Buttons im Spiel (Touch): Menü, Ton, Checkpoint (nur Übungsmodus)
function hudButtons() {
  const l = [{ label: '☰', x: 758, y: 28, w: 34, h: 30, fn: goMenu }, { label: '♪', x: 720, y: 28, w: 34, h: 30, fn: toggleMute }];
  if (practice) l.push({ label: 'Z', x: 682, y: 28, w: 34, h: 30, fn: setCheckpoint });
  return l;
}
function hudClick(e) {
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) * cv.width / r.width, y = (e.clientY - r.top) * cv.height / r.height;
  const b = [...hudButtons(), ...(state === 'won' ? winButtons() : []), ...(state === 'paused' ? pauseButtons() : [])].find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  if (b) b.fn();
  return !!b;
}
// Eingabe: Leertaste / Maus / Touch
const set = v => e => {
  if (e.code && e.code !== 'Space') return;
  if (v) unlockAudio();
  if (inMenu()) { if (v && !e.code) menuClick(e); e.preventDefault(); return; }
  if (v && !e.code && hudClick(e)) { e.preventDefault(); return; }
  if (v && state === 'paused') { e.preventDefault(); return; } // Pause: nur die Buttons
  const id = e.code ? 'key' : 'ptr' + e.pointerId;
  if (v && !down.has(id)) pressed = true;
  v ? down.add(id) : down.delete(id);
  held = down.size > 0;
  if (!held) inputLocked = false;
  if (v && state === 'won') { attempt = 1; cp = null; reset(); } // nach Sieg: Neustart
  e.preventDefault();
};
addEventListener('keydown', e => { // ESC: Levelauswahl → Menü, im Spiel → Menü
  if (e.code !== 'Escape' || state === 'menu') return;
  goMenu();
});
addEventListener('keydown', e => { // M: alles stumm/an
  if (e.code !== 'KeyM') return;
  toggleMute();
});
addEventListener('keydown', e => { if (e.code === 'KeyZ' && !e.repeat) setCheckpoint(); }); // Z: Checkpoint (Übungsmodus)
addEventListener('keydown', e => { if (e.code === 'KeyC' && !e.repeat && state === 'won') copyResult(); }); // C: Ergebnis kopieren
addEventListener('keydown', e => { if (e.code === 'KeyP' && !e.repeat) state === 'paused' ? resumeGame() : pauseGame(); }); // P: Pause
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
addEventListener('keydown', set(true)); addEventListener('keyup', set(false));
cv.addEventListener('pointerdown', set(true)); addEventListener('pointerup', set(false)); addEventListener('pointercancel', set(false));
cv.addEventListener('contextmenu', e => e.preventDefault());

// Pause (P / Tab-Wechsel): Overlay Weiter / Neustart / Menü
const musicPos = () => endless ? runSec() : timeAtX(map, p.x); // Soll-Musikzeit (s) zur Spielerposition
function syncMusic(force) { // Musik auf die Spielerposition setzen (ohne force nur bei > 50 ms Abweichung)
  let t = Math.max(0, musicPos());
  if (music.duration > 0) t %= music.duration;
  if (force || Math.abs(music.currentTime - t) > 0.05) music.currentTime = t;
  lastSync = performance.now();
}
function pauseGame() {
  if (state !== 'play') return;
  state = 'paused'; music.pause(); down.clear(); held = false; pressed = false;
}
function resumeGame() {
  if (state !== 'paused') return;
  state = 'play'; acc = 0; last = performance.now(); inputLocked = down.size > 0;
  if (audioOn && !practice) { syncMusic(true); music.play().catch(() => {}); }
}
const pauseButtons = () => [
  { label: 'Weiter', x: 290, y: 170, w: 220, h: 40, fn: resumeGame },
  { label: 'Neustart', x: 290, y: 220, w: 220, h: 40, fn: () => { attempt++; cp = null; acc = 0; last = performance.now(); reset(); } },
  { label: 'Menü', x: 290, y: 270, w: 220, h: 40, fn: goMenu },
];

// Fester Timestep 60 Hz; alle 2 s Musik nachjustieren
let last = performance.now(), acc = 0, lastSync = 0;
function loop(now) {
  acc += Math.min(now - last, 250); last = now;
  while (acc >= DT) { update(); acc -= DT; }
  if (state === 'play' && audioOn && !practice && !music.paused && performance.now() - lastSync >= 2000) syncMusic();
  draw(); requestAnimationFrame(loop);
}
goMenu();
const th = location.hash.match(/^#test(?:@(\d+))?$/);
if (th) { const c = loadCustom(); if (c) startLevel(c, th[1] ? +th[1] : undefined); } // Teststart aus dem Editor
// Geteiltes Level: index.html#level=<z|r><base64url> (z = deflate-raw, r = unkomprimiert)
async function unpackLevel(code) {
  try {
    let u8 = Uint8Array.from(atob(code.slice(1).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    if (code[0] === 'z') u8 = new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    const rows = new TextDecoder().decode(u8).split('\n');
    return rows.length >= 2 && rows.length <= 30 && rows.every(r => r.length <= 500 && /^[.#^oO|SCUNW*1-4<>]*$/.test(r)) ? rows : null;
  } catch { return null; }
}
const lh = location.hash.match(/^#level=([zr][A-Za-z0-9_-]+)$/);
if (lh) unpackLevel(lh[1]).then(rows => { if (rows) startLevel(rows); });
requestAnimationFrame(loop);
