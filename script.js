'use strict';

// ---------------------------------------------------------------------------
// Tuning. Everything that changes how hard the game is lives up here.
// Distances are in pixels, one tile = 16px. Heat goes from 0 to 100.

const PLAYER_SPEED = 58;          // walking, px per second
const SPRINT_SPEED = 92;          // holding shift
const HEAT_START = 12;            // you start a little warm, the house has no AC

// heat gained per second in direct sun, by what you're standing on
const SUN_HEAT = { asphalt: 6, concrete: 5, dirt: 4, grass: 3 };
const SHADE_COOLING = 4;          // heat lost per second in shade over grass/dirt
const SHADE_COOLING_PAVED = 2.5;  // shade over pavement (it still radiates heat)
const SPLASH_COOLING = 14;        // standing in the splash pad
const SPRINT_HEAT_MULT = 1.6;     // running makes sun heat worse...
const SPRINT_SHADE_MULT = 0.5;    // ...and cools you slower in shade

const HAT_SUN_MULT = 0.75;        // straw hat cuts sun heat by 25%
const TOWEL_SUN_MULT = 0.85;      // cooling towel cuts another 15%

const BOTTLE_SIPS = 3;
const SIP_COOLING = 15;
const SIP_COOLDOWN = 1.5;         // seconds between sips
const REFILL_COOLING = 10;        // bonus for drinking at a station
const STATION_COOLDOWN = 6;       // seconds before the same station works again
const STORE_COOLING = 45;         // ducking into the corner store (once)
const SNOWBALL_COOLING = 25;      // (once)

// heat where each symptom stage kicks in, and how much each one slows you
const STAGE_AT = [35, 55, 70, 85];
const STAGE_SPEED = [1, 1, 0.88, 0.78, 0.68];

// end score. Helping people counts most, speed next, signs least.
// The player only sees the total.
const SCORE_PER_HELP = 1000;
const SCORE_FIRST_TRY = 250;      // extra if you picked the right answer first
const SCORE_TIME_MAX = 2000;      // full points at or under SCORE_FAST_SECS
const SCORE_FAST_SECS = 60;
const SCORE_SLOW_SECS = 420;      // zero time points at or past this
const SCORE_PER_SIGN = 100;

const BODY_TEMP_BASE = 98.6;      // shown in the HUD, heat 0
const BODY_TEMP_PER_HEAT = 0.06;  // heat 100 = ~104.6°F
const CLOCK_START_MIN = 15 * 60;  // 3:00 PM
const CLOCK_MIN_PER_SEC = 0.25;   // in-game minutes per real second

// ---------------------------------------------------------------------------

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const buf = makeCanvas(480, 270);
const bctx = buf.getContext('2d');
let vw = 480, vh = 270, scale = 3;

const world = buildWorld();
const MAP_PX_W = world.W * TILE, MAP_PX_H = world.H * TILE;

const groundCanvas = renderGround(world);
const shadowCanvas = (() => {
  const shapes = renderShadows(world);
  const c = makeCanvas(shapes.width, shapes.height);
  const g = c.getContext('2d');
  g.drawImage(shapes, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#1b1233';
  g.fillRect(0, 0, c.width, c.height);
  return c;
})();
const shadeMask = (() => {
  const g = shadowCanvas.getContext('2d');
  const d = g.getImageData(0, 0, MAP_PX_W, MAP_PX_H).data;
  const m = new Uint8Array(MAP_PX_W * MAP_PX_H);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 0 ? 1 : 0;
  return m;
})();

const SPR = makeProps();
const treeImgs = [0, 1, 2].map(makeTree);
const carImgs = new Map();
const personSets = {};
const portraits = {};

function personSet(key, look, opts) {
  if (!personSets[key]) personSets[key] = makePersonSet(look, opts);
  return personSets[key];
}
function portrait(who) {
  if (!LOOKS[who]) return null;
  if (!portraits[who]) portraits[who] = makePortrait(LOOKS[who]);
  return portraits[who];
}
function carImg(color, dog, dir) {
  const k = color + dog + dir;
  if (!carImgs.has(k)) {
    const c = makeCar(color, dog);
    carImgs.set(k, dir === 'h' ? rotate90(c) : c);
  }
  return carImgs.get(k);
}

// ---------------------------------------------------------------------------
// static scenery, sorted by the y of its base each frame

const statics = [];
const overheads = [];
let kioskInfo = null;

function buildStatics() {
  for (const b of world.buildings) {
    const s = makeBuilding(b);
    const d = { img: s.canvas, x: b.x * TILE + s.ox, y: b.y * TILE + s.oy, base: (b.y + b.h) * TILE - 1, building: b };
    statics.push(d);
    if (b.kind === 'kiosk') kioskInfo = { d, windowY: s.windowY };
  }
  world.trees.forEach(t => {
    const img = treeImgs[t.v];
    statics.push({ img, x: t.x * TILE + 8 - 30, y: t.y * TILE + 14 - 61, base: t.y * TILE + 14, tree: true });
  });
  const fenceAt = new Set(world.fences.map(f => f.kind + f.x + ',' + f.y));
  const fenceCache = {};
  for (const f of world.fences) {
    const horiz = fenceAt.has(f.kind + (f.x - 1) + ',' + f.y) || fenceAt.has(f.kind + (f.x + 1) + ',' + f.y);
    const k = f.kind + horiz;
    fenceCache[k] = fenceCache[k] || makeFence(f.kind, horiz);
    statics.push({ img: fenceCache[k], x: f.x * TILE, y: f.y * TILE + 16 - 26, base: f.y * TILE + 15 });
  }
  for (const p of world.props) {
    if (p.kind === 'pole' || p.kind === 'freebox') continue; // these change, drawn as dynamic
    let img = SPR[p.kind];
    if (!img) continue;
    if (p.kind === 'mower') img = flipX(img);
    const tw = (p.tw || 1) * TILE, th = (p.th || 1) * TILE;
    const flat = p.kind === 'nozzle';
    statics.push({
      img, flat,
      x: Math.round(p.x * TILE + tw / 2 - img.width / 2),
      y: Math.round(p.y * TILE + th - img.height + (p.kind === 'hedge' ? 2 : 0)),
      base: p.y * TILE + th - 1,
    });
  }
  for (const c of world.cars) {
    if (c.dog) continue;
    const img = carImg(c.color, false, c.dir);
    statics.push({ img, x: c.x * TILE, y: c.y * TILE + (c.dir === 'v' ? 1 : 0), base: c.y * TILE + (c.dir === 'v' ? 31 : 15) });
  }
  for (const o of world.overheads) {
    const s = makeOverhead(o);
    const w = s.canvas.width, h = s.canvas.height;
    if (o.kind === 'shelter') { statics.push({ img: s.canvas, x: s.x, y: s.y, base: o.y * TILE + 15, shelter: true }); continue; }
    overheads.push({ img: s.canvas, x: s.x, y: s.y, w, h });
  }
}
buildStatics();

// whole-map snapshot for the pause screen map
const mapSnapshot = (() => {
  const c = makeCanvas(MAP_PX_W, MAP_PX_H);
  const g = c.getContext('2d');
  g.drawImage(groundCanvas, 0, 0);
  g.globalAlpha = 0.38; g.drawImage(shadowCanvas, 0, 0); g.globalAlpha = 1;
  [...statics].sort((a, b) => a.base - b.base).forEach(d => g.drawImage(d.img, d.x, d.y));
  overheads.forEach(o => g.drawImage(o.img, o.x, o.y));
  return c;
})();

// ---------------------------------------------------------------------------
// sound. All synthesized, nothing loaded.

const Sound = {
  ac: null, master: null, muted: false, amb: null,
  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    try {
      this.ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    this.master = this.ac.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(this.ac.destination);
    this.startCicadas();
  },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ac.currentTime, 0.05);
    try { localStorage.setItem('sunstruck-muted', m ? '1' : '0'); } catch (e) { /* private mode */ }
  },
  noiseBuffer() {
    if (this._nb) return this._nb;
    const len = this.ac.sampleRate * 2;
    const b = this.ac.createBuffer(1, len, this.ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return (this._nb = b);
  },
  startCicadas() {
    // filtered noise, chopped fast, swelling slowly. Sounds like August.
    const ac = this.ac;
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuffer(); src.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5200; bp.Q.value = 6;
    const chop = ac.createGain(); chop.gain.value = 0;
    const lfo = ac.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 22;
    const lfoAmt = ac.createGain(); lfoAmt.gain.value = 0.5;
    lfo.connect(lfoAmt); lfoAmt.connect(chop.gain);
    const swell = ac.createGain(); swell.gain.value = 0.018;
    const slow = ac.createOscillator(); slow.frequency.value = 0.09;
    const slowAmt = ac.createGain(); slowAmt.gain.value = 0.014;
    slow.connect(slowAmt); slowAmt.connect(swell.gain);
    src.connect(bp); bp.connect(chop); chop.connect(swell); swell.connect(this.master);
    src.start(); lfo.start(); slow.start();
    this.amb = swell;
  },
  tone(freq, dur, { type = 'square', vol = 0.06, slide = 0, delay = 0 } = {}) {
    if (!this.ac) return;
    const t = this.ac.currentTime + delay;
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  hiss(dur, freq, vol = 0.05, delay = 0) {
    if (!this.ac) return;
    const t = this.ac.currentTime + delay;
    const s = this.ac.createBufferSource(); s.buffer = this.noiseBuffer();
    const f = this.ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  },
  step(soft) { this.hiss(0.05, soft ? 900 : 1800, 0.035); },
  sip() { this.tone(420, 0.12, { type: 'sine', vol: 0.12, slide: -220 }); this.tone(380, 0.12, { type: 'sine', vol: 0.1, slide: -200, delay: 0.16 }); },
  refill() { [520, 660, 780].forEach((f, i) => this.tone(f, 0.09, { vol: 0.05, delay: i * 0.06 })); this.hiss(0.3, 3000, 0.03); },
  blip() { this.tone(300 + Math.random() * 60, 0.03, { vol: 0.025 }); },
  page() { this.hiss(0.12, 4000, 0.05); this.tone(880, 0.05, { vol: 0.03, delay: 0.05 }); },
  good() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.12, { vol: 0.05, delay: i * 0.07 })); },
  bad() { this.tone(220, 0.18, { vol: 0.06, slide: -60 }); this.tone(165, 0.25, { vol: 0.05, slide: -40, delay: 0.12 }); },
  warn() { this.tone(660, 0.1, { vol: 0.05 }); this.tone(520, 0.16, { vol: 0.05, delay: 0.1 }); },
  beat(strength) { this.tone(70, 0.12, { type: 'sine', vol: 0.25 * strength, slide: -20 }); this.tone(62, 0.12, { type: 'sine', vol: 0.18 * strength, slide: -15, delay: 0.17 }); },
  win() { [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.08, delay: i * 0.1 })); },
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.08, delay: i * 0.18 })); },
};
try { Sound.muted = localStorage.getItem('sunstruck-muted') === '1'; } catch (e) { /* ignore */ }

// ---------------------------------------------------------------------------
// run state

let S = null;
let mode = 'title';
let T = 0; // seconds since load, for animation

function newRun() {
  S = {
    t: 0, heat: HEAT_START, peak: HEAT_START, stage: 0, maxStage: 0,
    sips: BOTTLE_SIPS, sipCd: 0, hat: false, towel: false,
    helped: {}, attempts: {}, ach: new Set(), stationsUsed: new Set(), coachSeen: new Set(), coachQueue: [], coachNow: null, read: new Set(), used: new Set(), stationCd: {},
    sunSeconds: 0, rate: 0, sprinting: false,
    player: { x: world.start.x, y: world.start.y, dir: 'down', frame: 0, animT: 0, moving: false, lastFrame: 0 },
    npcs: world.npcs.map(n => ({ ...n, pose: n.pose || 'stand', gone: false, fade: 1, baseX: n.x })),
    birds: [[46, 35.5], [47.2, 35.2], [55, 35.6], [44.5, 32.6], [33, 37.4], [56.3, 35.3]].map(([x, y], i) => ({
      x: x * TILE, y: y * TILE, hx: x * TILE, hy: y * TILE, state: 'idle', t: Math.random() * 2, flip: i % 2 === 0, vx: 0, vy: 0, away: 0,
    })),
    particles: [], floats: [], beatT: 0, endT: 0, target: null,
  };
  camera.x = S.player.x - vw / 2; camera.y = S.player.y - vh / 2;
  clampCamera();
}

const camera = { x: 0, y: 0 };

// ---------------------------------------------------------------------------
// world queries

function tileSolid(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= world.W || ty >= world.H) return true;
  return world.solid[ty * world.W + tx] === 1;
}
function groundAt(x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= world.W || ty >= world.H) return G.GRASS;
  return world.ground[ty * world.W + tx];
}
function shadedAt(x, y) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= MAP_PX_W || y >= MAP_PX_H) return false;
  return shadeMask[y * MAP_PX_W + x] === 1;
}
function surfaceKind(g) {
  if (g === G.ROAD || g === G.LOT) return 'asphalt';
  if (g === G.WALK || g === G.BRIDGE || g === G.PAVERS || g === G.COURT) return 'concrete';
  if (g === G.GRASS) return 'grass';
  return 'dirt';
}
function heatRate(x, y, running) {
  const g = groundAt(x, y);
  if (g === G.SPLASH) return -SPLASH_COOLING;
  const kind = surfaceKind(g);
  if (shadedAt(x, y - 1)) {
    const c = (kind === 'asphalt' || kind === 'concrete') ? SHADE_COOLING_PAVED : SHADE_COOLING;
    return -c * (running ? SPRINT_SHADE_MULT : 1);
  }
  let r = SUN_HEAT[kind];
  if (S.hat) r *= HAT_SUN_MULT;
  if (S.towel) r *= TOWEL_SUN_MULT;
  if (running) r *= SPRINT_HEAT_MULT;
  return r;
}
function stageFor(heat) {
  let s = 0;
  for (let i = 0; i < STAGE_AT.length; i++) if (heat >= STAGE_AT[i]) s = i + 1;
  return s;
}
function bodyTemp(heat) { return BODY_TEMP_BASE + heat * BODY_TEMP_PER_HEAT; }

function blocked(x, y) {
  const pts = [[x - 4, y - 3], [x + 4, y - 3], [x - 4, y + 1], [x + 4, y + 1]];
  for (const [px, py] of pts) if (tileSolid(Math.floor(px / TILE), Math.floor(py / TILE))) return true;
  for (const n of S.npcs) {
    if (n.gone || !n.look || n.inKiosk) continue;
    const nx = n.x * TILE, ny = n.y * TILE;
    if (Math.abs(nx - x) < 8 && Math.abs(ny - y) < 5) return true;
  }
  return false;
}

function streetAt(x, y) {
  const tx = x / TILE, ty = y / TILE;
  // smallest matching area wins (park beats "Elm St" etc)
  let best = null;
  for (const s of world.streets) {
    if (tx >= s.x && tx < s.x + s.w && ty >= s.y && ty < s.y + s.h) {
      if (!best || s.w * s.h < best.w * best.h) best = s;
    }
  }
  if (best) return best.name;
  return groundAt(x, y) === G.GRASS ? "somebody's front yard" : 'the sidewalk';
}

// ---------------------------------------------------------------------------
// input

const keys = {};
const KEYMAP = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  run: ['ShiftLeft', 'ShiftRight'],
};
const held = name => KEYMAP[name].some(k => keys[k]);

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.code === 'Enter' && e.target.closest && e.target.closest('button')) e.preventDefault();
  if (e.repeat && !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) { keys[e.code] = true; return; }
  keys[e.code] = true;
  onKey(e.code);
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  // keyboard is handled above, so stop space/enter from also "clicking" a focused button
  if ((e.code === 'Space' || e.code === 'Enter') && e.target.closest && e.target.closest('button')) e.preventDefault();
});
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('button');
  if (b) b.blur();
});
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (mode === 'play') pause(); });

function onKey(code) {
  if (code === 'KeyM') { Sound.setMuted(!Sound.muted); updateMuteLabel(); return; }
  const confirm = code === 'KeyE' || code === 'Space' || code === 'Enter';

  switch (mode) {
    case 'title':
      if (code === 'Enter' || code === 'Space') startGame();
      break;
    case 'play':
      if (confirm && S.target) interact(S.target);
      else if (code === 'KeyQ' || code === 'KeyF') sip();
      else if (code === 'KeyP' || code === 'Escape') pause();
      else if (code === 'KeyR') restart();
      break;
    case 'dialog':
      if (dlg && dlg.choosing) {
        const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[code];
        if (n !== undefined) pickChoice(n);
      } else if (confirm) advanceDialog();
      break;
    case 'coach':
      if (confirm || code === 'Escape') closeCoach();
      break;
    case 'card':
      if (confirm || code === 'Escape') closeCard();
      break;
    case 'paused':
      if (code === 'KeyP' || code === 'Escape' || code === 'Enter') resume();
      else if (code === 'KeyR') restart();
      break;
    case 'won': case 'lost':
      if (code === 'KeyR' || code === 'Enter') restart();
      break;
  }
}

// ---------------------------------------------------------------------------
// interactions

function npcPos(n) { return { x: n.x * TILE, y: n.y * TILE }; }
function spotPos(s) { return { x: s.x * TILE + 8, y: s.y * TILE + 8 }; }

function findTarget() {
  const p = S.player;
  let best = null, bestD = 22;
  const consider = (x, y, label, act) => {
    const d = Math.hypot(x - p.x, (y - p.y) * 1.2);
    if (d < bestD) { bestD = d; best = { label, act }; }
  };
  for (const s of world.spots) {
    const { x, y } = spotPos(s);
    if (s.kind === 'hat' && S.hat) continue;
    if ((s.kind === 'store' || s.kind === 'snowball') && S.used.has(s.kind)) continue;
    if (s.kind === 'water' && s.locked && !S.helped.hasOwnProperty(s.locked)) continue;
    consider(x, y, s.label, () => useSpot(s));
  }
  for (const n of S.npcs) {
    if (n.gone || n.inKiosk || n.splash) continue;
    const { x, y } = npcPos(n);
    if (n.encounter && !S.helped.hasOwnProperty(n.id)) {
      consider(x, y - 4, n.id === 'dog' ? 'Look in the car' : `Talk to ${ENCOUNTERS[n.id].name}`, () => startEncounter(n.id));
    } else if (n.talk || n.encounter) {
      const lines = n.id === 'mom' ? (S.helped.hasOwnProperty('jayden') ? SMALL_TALK.mom : SMALL_TALK.momBefore) : SMALL_TALK[n.talk];
      const name = n.encounter ? ENCOUNTERS[n.id].name : n.id === 'mom' ? "Jayden's mom" : 'Volunteer';
      if (lines) consider(x, y - 4, `Talk to ${name}`, () => runDialog(lines.map(([who, text]) => ({ who, text }))));
      else if (n.encounter) consider(x, y - 4, `Talk to ${name}`, () => runDialog([{ who: n.id, text: thanksLine(n.id) }]));
    }
  }
  return best;
}

function thanksLine(id) {
  return {
    okafor: "I feel a lot better. Go on, get to the library.",
    jayden: "My head feels better now.",
    luis: "I'm done for today. Go get inside.",
  }[id] || "Thanks again.";
}

function interact(t) { t.act(); }

function startEncounter(id) {
  const E = ENCOUNTERS[id];
  S.attempts[id] = 0;
  const n = S.npcs.find(n => n.id === id);
  if (n && n.look && n.pose === 'stand') {
    const dx = S.player.x - n.x * TILE, dy = S.player.y - n.y * TILE;
    n.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }
  runDialog([...E.lines.map(([who, text]) => ({ who, text })), { choice: id }]);
}

function useSpot(s) {
  if (s.kind === 'flyer') {
    openCard(s.tip);
  } else if (s.kind === 'water') {
    const k = s.x + ',' + s.y;
    if ((S.stationCd[k] || 0) > 0) { floatText(S.player.x, S.player.y - 26, 'SIP SIP', '#bfe3f2'); return; }
    S.sips = BOTTLE_SIPS;
    if (S.stage < 4) S.heat = Math.max(0, S.heat - REFILL_COOLING);
    S.stationCd[k] = STATION_COOLDOWN;
    S.stationsUsed.add(k);
    if (S.stationsUsed.size >= 3) unlock('hydrated');
    Sound.refill();
    floatText(S.player.x, S.player.y - 26, 'REFILLED', '#9fd8f0');
    splashBurst(S.player.x, S.player.y - 16, 8);
  } else if (s.kind === 'hat') {
    runDialog([
      { who: null, text: "Someone left a box of free stuff on the curb. A wide straw hat sits on top." },
      { who: null, text: "You put it on. It shades your face and neck. (Sun heat -25%)" },
    ], () => { S.hat = true; unlock('hat'); floatText(S.player.x, S.player.y - 26, 'HAT ON', '#f2d58a'); });
  } else if (s.kind === 'store') {
    runDialog([
      { who: null, text: "You duck into the corner store. The AC is cranked." },
      { who: null, text: "You stand by the drink cooler for a few minutes until your face cools down. The cashier waves you in like they've seen ten people do it today." },
    ], () => {
      S.used.add('store');
      unlock('ac');
      S.heat = Math.max(0, S.heat - STORE_COOLING);
      Sound.refill();
      floatText(S.player.x, S.player.y - 26, 'COOLED OFF', '#9fd8f0');
    });
  } else if (s.kind === 'snowball') {
    runDialog([
      { who: 'vendor', text: "Hey hon! Still got ice. What flavor?" },
      { choice: 'snowball' },
    ]);
  }
}

function sip() {
  if (S.sipCd > 0) return;
  // someone with heat stroke shouldn't drink (choking risk), so you can't either
  if (S.stage >= 4) {
    floatText(S.player.x, S.player.y - 26, "CAN'T DRINK", '#e8a08a');
    Sound.bad();
    S.sipCd = 0.8;
    return;
  }
  if (S.sips <= 0) {
    coach('empty');
    floatText(S.player.x, S.player.y - 26, 'EMPTY', '#e8a08a');
    Sound.bad();
    S.sipCd = 0.6;
    return;
  }
  S.sips--;
  S.sipCd = SIP_COOLDOWN;
  S.heat = Math.max(0, S.heat - SIP_COOLING);
  Sound.sip();
  floatText(S.player.x, S.player.y - 26, '-' + SIP_COOLING, '#9fd8f0');
}

// ---------------------------------------------------------------------------
// dialog box

let dlg = null;
const dlgEl = $('dialog'), dlgName = $('dlg-name'), dlgText = $('dlg-text'), dlgChoices = $('dlg-choices');
const dlgPortrait = $('dlg-portrait'), dlgNext = $('dlg-next'), dlgVerdict = $('dlg-verdict');

function runDialog(steps, onDone) {
  dlg = { steps: [...steps], i: -1, onDone, typing: false, shown: 0, full: '', choosing: false, disabled: new Set(), result: null };
  mode = 'dialog';
  dlgEl.classList.remove('hidden');
  $('prompt').classList.add('hidden');
  nextStep();
}

function nextStep() {
  dlg.i++;
  if (dlg.i >= dlg.steps.length) return endDialog();
  const st = dlg.steps[dlg.i];
  dlgChoices.innerHTML = '';
  dlgChoices.classList.add('hidden');
  dlgVerdict.className = 'dlg-verdict hidden';
  dlg.choosing = false;

  if (st.choice) return showChoice(st.choice);

  setSpeaker(st.who);
  if (st.verdict) {
    dlgVerdict.textContent = st.verdict === 'right' ? 'Right call' : 'Not quite';
    dlgVerdict.className = 'dlg-verdict ' + st.verdict;
  }
  if (st.run) st.run();
  typeText(st.text, !!st.who);
}

function setSpeaker(who) {
  const pic = who ? portrait(who) : null;
  if (pic) {
    dlgPortrait.classList.remove('hidden');
    const g = dlgPortrait.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 64, 64);
    g.drawImage(pic, 0, 0);
  } else dlgPortrait.classList.add('hidden');
  const names = { okafor: 'Mr. Okafor', jayden: 'Jayden', dana: 'Jogger', delgado: 'Ms. Delgado', luis: 'Luis', mom: "Jayden's mom", volunteer: 'Volunteer', vendor: 'Snowball stand' };
  dlgName.textContent = who ? names[who] || '' : '';
  dlgName.classList.toggle('hidden', !who);
  dlgEl.classList.toggle('narration', !who);
}

function typeText(text, voiced) {
  dlg.full = text;
  dlg.shown = 0;
  dlg.typing = true;
  dlg.voiced = voiced;
  dlgText.textContent = '';
  dlgNext.classList.add('hidden');
}

function advanceDialog() {
  if (!dlg) return;
  if (dlg.typing) {
    dlg.shown = dlg.full.length;
    dlgText.textContent = dlg.full;
    dlg.typing = false;
    dlgNext.classList.remove('hidden');
    return;
  }
  nextStep();
}

function updateDialog(dt) {
  if (!dlg || !dlg.typing) return;
  const before = Math.floor(dlg.shown);
  dlg.shown = Math.min(dlg.full.length, dlg.shown + dt * 62);
  const now = Math.floor(dlg.shown);
  if (now !== before) {
    dlgText.textContent = dlg.full.slice(0, now);
    if (dlg.voiced && now % 3 === 0 && dlg.full[now - 1] !== ' ') Sound.blip();
  }
  if (now >= dlg.full.length) { dlg.typing = false; dlgNext.classList.remove('hidden'); }
}

function showChoice(id) {
  dlg.choosing = true;
  dlgNext.classList.add('hidden');
  let question, options;
  if (id === 'snowball') {
    setSpeaker('vendor');
    question = "Tiger's blood is the classic. Pickle is for the brave.";
    options = SNOWBALL_FLAVORS.map(f => ({ text: f }));
  } else {
    const E = ENCOUNTERS[id];
    setSpeaker(null);
    question = E.question;
    options = E.choices;
  }
  dlgText.textContent = question;
  dlg.shown = question.length; dlg.typing = false;
  dlgChoices.classList.remove('hidden');
  dlgChoices.innerHTML = '';
  options.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'choice';
    if (dlg.disabled.has(i)) { b.classList.add('crossed'); b.disabled = true; }
    b.innerHTML = `<span class="key">${i + 1}</span><span></span>`;
    b.lastChild.textContent = c.text;
    b.addEventListener('click', () => pickChoice(i));
    dlgChoices.appendChild(b);
  });
  dlg.choiceId = id;
}

function pickChoice(i) {
  if (!dlg || !dlg.choosing || dlg.disabled.has(i)) return;
  const id = dlg.choiceId;
  const insert = (steps) => dlg.steps.splice(dlg.i + 1, 0, ...steps);

  if (id === 'snowball') {
    const flavor = SNOWBALL_FLAVORS[i];
    insert([
      { who: 'vendor', text: i === 1 ? "Brave. Here you go." : `${flavor}, coming up.` },
      { who: null, text: "Brain freeze. The ice helps, but your body needs water more." },
    ]);
    dlg.onDone = () => {
      S.used.add('snowball');
      unlock('snowball');
      S.heat = Math.max(0, S.heat - SNOWBALL_COOLING);
      floatText(S.player.x, S.player.y - 26, 'BRAIN FREEZE', '#f4bcd3');
    };
    Sound.refill();
    return nextStep();
  }

  const E = ENCOUNTERS[id];
  const c = E.choices[i];
  S.attempts[id] = (S.attempts[id] || 0) + 1;
  if (c.correct) {
    Sound.good();
    const after = [];
    if (E.reward === 'giveSip') {
      if (S.sips > 0) after.push({ who: null, text: "You give him a few sips from your bottle and walk him into the shade.", run: () => { S.sips--; } });
      else after.push({ who: null, text: "Your bottle's empty, so you walk him into the shade. His mom has water in her bag." });
    }
    after.push(...E.after.map(([who, text]) => ({ who, text })));
    insert([{ who: null, text: c.reply, verdict: 'right' }, ...after]);
    dlg.onDone = () => resolveEncounter(id);
  } else {
    Sound.bad();
    dlg.disabled.add(i);
    insert([{ who: null, text: c.reply, verdict: 'wrong' }, { choice: id }]);
  }
  nextStep();
}

function endDialog() {
  const done = dlg.onDone;
  dlg = null;
  dlgEl.classList.add('hidden');
  if (mode === 'dialog') mode = 'play';
  if (done) done();
}

function resolveEncounter(id) {
  S.helped[id] = S.attempts[id] === 1;
  const E = ENCOUNTERS[id];
  const n = S.npcs.find(n => n.id === id);
  if (E.reward === 'refill') S.sips = BOTTLE_SIPS;
  if (E.reward === 'towel') { S.towel = true; unlock('towel'); }
  if (Object.keys(S.helped).length === Object.keys(ENCOUNTERS).length) unlock('neighbor');
  if (n) {
    if (n.fix) { n.x = n.fix.x; n.y = n.fix.y; n.pose = n.fix.pose; n.dir = n.fix.dir; n.wobble = false; n.fade = 0; n.fadingIn = true; }
    else { n.leaving = true; }
  }
  coach('after_' + id);
}

// ---------------------------------------------------------------------------
// achievements are saved across games; the toast only shows the first time ever
const savedAch = new Set();
try { JSON.parse(localStorage.getItem('sunstruck-ach') || '[]').forEach(id => savedAch.add(id)); } catch (e) { /* ignore */ }

function unlock(id) {
  if (!S || S.ach.has(id)) return;
  const a = ACHIEVEMENTS.find(a => a.id === id);
  if (!a) return;
  S.ach.add(id);
  if (savedAch.has(id)) return;
  savedAch.add(id);
  try { localStorage.setItem('sunstruck-ach', JSON.stringify([...savedAch])); } catch (e) { /* ignore */ }
  toast('Achievement: ' + a.name, a.desc, 'good');
  Sound.good();
}

// coach tips: pause, explain, point at the thing

function coach(key) {
  if (!key || S.coachSeen.has(key)) return;
  S.coachSeen.add(key);
  S.coachQueue.push(key);
}

function nearestShade() {
  const p = S.player;
  let best = null, bd = Infinity;
  const tx0 = Math.floor(p.x / TILE), ty0 = Math.floor(p.y / TILE);
  for (let ty = ty0 - 12; ty <= ty0 + 12; ty++) for (let tx = tx0 - 12; tx <= tx0 + 12; tx++) {
    if (tileSolid(tx, ty)) continue;
    const x = tx * TILE + 8, y = ty * TILE + 10;
    if (!shadedAt(x, y - 1)) continue;
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < bd) { bd = d; best = { x, y }; }
  }
  return best;
}

function coachTarget(point) {
  if (point && typeof point === 'object') return { x: point.x * TILE + 8, y: point.y * TILE + 8 };
  if (point === 'goal') return { x: world.goal.x + 16, y: world.goal.y + 8 };
  if (point === 'shade') return nearestShade();
  if (point === 'station') {
    let best = null, bd = Infinity;
    for (const s of world.spots) {
      if (s.kind !== 'water' || (s.locked && !S.helped.hasOwnProperty(s.locked))) continue;
      const d = Math.hypot(s.x * TILE + 8 - S.player.x, s.y * TILE + 8 - S.player.y);
      if (d < bd) { bd = d; best = { x: s.x * TILE + 8, y: s.y * TILE + 8 }; }
    }
    return best;
  }
  const n = S.npcs.find(n => n.id === point);
  return n ? { x: n.x * TILE, y: n.y * TILE - 10 } : null;
}

function showCoach(key) {
  const c = COACH[key];
  S.coachNow = { key, target: c.point === 'water' ? null : coachTarget(c.point) };
  $('coach-title').textContent = c.title;
  $('coach-text').textContent = c.text;
  $('coach').classList.remove('hidden');
  $('prompt').classList.add('hidden');
  $('hud').classList.toggle('spot-water', c.point === 'water');
  mode = 'coach';
}

function closeCoach() {
  $('coach').classList.add('hidden');
  $('hud').classList.remove('spot-water');
  S.coachNow = null;
  mode = 'play';
}
$('coach-close').addEventListener('click', () => { if (mode === 'coach') closeCoach(); });

// fact signs

const cardEl = $('card');
function openCard(i) {
  const fact = FACTS[i];
  $('card-title').textContent = fact.title;
  $('card-body').innerHTML = '';
  const p = document.createElement('p');
  p.textContent = fact.body;
  $('card-body').appendChild(p);
  $('card-source').textContent = 'Source: ' + fact.source;
  $('card-num').textContent = `Fact ${i + 1} of ${FACTS.length}`;
  cardEl.classList.remove('hidden');
  cardEl.style.setProperty('--tilt', ((i % 2 ? 1 : -1) * (0.6 + (i % 3) * 0.4)) + 'deg');
  $('prompt').classList.add('hidden');
  mode = 'card';
  Sound.page();
  S.read.add(i);
  if (S.read.size === FACTS.length) unlock('facts');
}
function closeCard() {
  cardEl.classList.add('hidden');
  mode = 'play';
}
$('card-close').addEventListener('click', () => { if (mode === 'card') closeCard(); });

// ---------------------------------------------------------------------------
// toasts + floating text + particles

function toast(title, body, tone) {
  const el = document.createElement('div');
  el.className = 'toast ' + (tone || '');
  const h = document.createElement('div'); h.className = 'toast-title'; h.textContent = title;
  el.appendChild(h);
  if (body) { const b = document.createElement('div'); b.className = 'toast-body'; b.textContent = body; el.appendChild(b); }
  $('toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), tone === 'stage' ? 8000 : 4500);
  setTimeout(() => el.remove(), tone === 'stage' ? 8600 : 5100);
}

function floatText(x, y, text, color) {
  S.floats.push({ x, y, text, color, life: 1.4 });
}
function splashBurst(x, y, n) {
  for (let i = 0; i < n; i++) S.particles.push({ x, y, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30, g: 120, life: 0.5, max: 0.5, color: '#bfe3f2', size: 1 });
}

// ---------------------------------------------------------------------------
// game flow

function startGame() {
  Sound.init();
  newRun();
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  mode = 'play';
  runDialog(INTRO.map(text => ({ who: null, text })), () => {
    coach('start');
  });
}

function restart() {
  for (const id of ['win', 'lose', 'pause']) $(id).classList.add('hidden');
  if (dlg) { dlg = null; dlgEl.classList.add('hidden'); }
  cardEl.classList.add('hidden');
  $('toasts').innerHTML = '';
  $('fade').style.transition = 'none';
  $('fade').style.opacity = '0';
  newRun();
  $('hud').classList.remove('hidden');
  mode = 'play';
}

function pause() {
  mode = 'paused';
  $('pause').classList.remove('hidden');
  drawPauseMap();
}
function resume() {
  $('pause').classList.add('hidden');
  mode = 'play';
}
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', restart);
$('btn-start').addEventListener('click', startGame);
$('btn-howto').addEventListener('click', () => $('howto').classList.toggle('hidden'));
$('btn-pause').addEventListener('click', () => { if (mode === 'play') pause(); else if (mode === 'paused') resume(); });
$('btn-mute').addEventListener('click', () => { Sound.setMuted(!Sound.muted); updateMuteLabel(); });
$('win-again').addEventListener('click', restart);
$('lose-again').addEventListener('click', restart);
dlgEl.addEventListener('click', (e) => { if (!e.target.closest('.choice')) advanceDialog(); });

function updateMuteLabel() {
  $('btn-mute').textContent = Sound.muted ? 'Sound off' : 'Sound on';
  $('btn-mute').classList.toggle('off', Sound.muted);
}
updateMuteLabel();

function die() {
  mode = 'dying';
  S.endT = 0;
  S.where = streetAt(S.player.x, S.player.y);
  Sound.lose();
  $('prompt').classList.add('hidden');
  fadeTo('#2a0f0c', 2);
}

// whole-screen fade (covers the HUD too). fadeTo() goes in, fadeOut() comes back.
function fadeTo(color, secs) {
  const f = $('fade');
  f.style.transition = 'none';
  f.style.background = color;
  f.style.opacity = '0';
  void f.offsetWidth;
  f.style.transition = `opacity ${secs}s ease-in`;
  f.style.opacity = '1';
}
function fadeOut(secs) {
  const f = $('fade');
  f.style.transition = `opacity ${secs}s ease-out`;
  f.style.opacity = '0';
}

function win() {
  mode = 'winning';
  S.endT = 0;
  Sound.win();
  $('prompt').classList.add('hidden');
  if (S.maxStage < 3) unlock('coolhead');
  fadeTo('#ffffff', 1.2);
}

function fmtTime(s) {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

function showWin() {
  mode = 'won';
  $('hud').classList.add('hidden');
  const helpedIds = Object.keys(S.helped);
  const firstTry = helpedIds.filter(id => S.helped[id]).length;
  const total = Object.keys(ENCOUNTERS).length;

  let best = null;
  try { best = parseFloat(localStorage.getItem('sunstruck-best')); } catch (e) { /* ignore */ }
  const isBest = !best || S.t < best;
  if (isBest) { try { localStorage.setItem('sunstruck-best', String(S.t)); } catch (e) { /* ignore */ } }

  let title;
  if (helpedIds.length === total) title = "You made it, and you helped everyone you met.";
  else if (helpedIds.length >= 4) title = 'You made it, and you helped people on the way.';
  else if (helpedIds.length >= 1) title = 'You made it inside.';
  else title = 'You made it inside. Your neighbors are still out there in the heat.';
  $('win-title').textContent = title;
  $('win-sub').textContent = 'It\'s 68° inside. A librarian hands you a cup of water and a folding chair.';

  const timeK = Math.max(0, Math.min(1, (SCORE_SLOW_SECS - S.t) / (SCORE_SLOW_SECS - SCORE_FAST_SECS)));
  const score = Math.round(helpedIds.length * SCORE_PER_HELP + firstTry * SCORE_FIRST_TRY + timeK * SCORE_TIME_MAX + S.read.size * SCORE_PER_SIGN);
  let bestScore = 0;
  try { bestScore = parseInt(localStorage.getItem('sunstruck-score'), 10) || 0; } catch (e) { /* ignore */ }
  if (score > bestScore) { try { localStorage.setItem('sunstruck-score', String(score)); } catch (e) { /* ignore */ } }
  $('win-score').textContent = score.toLocaleString();
  $('win-score-note').textContent = score > bestScore ? (bestScore ? 'New high score' : '') : 'High score ' + bestScore.toLocaleString();

  $('win-stats').innerHTML = '';
  const stat = (label, value, note) => {
    const d = document.createElement('div'); d.className = 'stat';
    d.innerHTML = '<div class="stat-label"></div><div class="stat-value"></div>' + (note ? '<div class="stat-note"></div>' : '');
    d.children[0].textContent = label; d.children[1].textContent = value; if (note) d.children[2].textContent = note;
    $('win-stats').appendChild(d);
  };
  stat('Time', fmtTime(S.t), isBest ? 'your best' : best ? 'best ' + fmtTime(best) : '');
  stat('People helped', `${helpedIds.length} / ${total}`, helpedIds.length ? `${firstTry} on the first try` : '');
  stat('Facts read', `${S.read.size} / ${FACTS.length}`);
  stat('Hottest you got', bodyTemp(S.peak).toFixed(1) + '°F', S.peak >= STAGE_AT[3] ? 'heat stroke range' : S.peak >= STAGE_AT[2] ? 'heat exhaustion' : '');

  const people = $('win-people');
  people.innerHTML = '';
  for (const id of Object.keys(ENCOUNTERS)) {
    const E = ENCOUNTERS[id];
    const li = document.createElement('li');
    const helped = S.helped.hasOwnProperty(id);
    li.className = helped ? 'yes' : 'no';
    li.innerHTML = '<span class="who"></span><span class="what"></span>';
    li.children[0].textContent = helped ? E.name : '???';
    li.children[1].textContent = helped ? E.condition : 'You walked past someone.';
    people.appendChild(li);
  }

  const tips = $('win-tips');
  tips.innerHTML = '';
  FACTS.forEach((t, i) => {
    const li = document.createElement('li');
    li.className = S.read.has(i) ? 'yes' : 'no';
    li.textContent = S.read.has(i) ? t.short : 'A sign you didn\'t read.';
    tips.appendChild(li);
  });
  const ach = $('win-ach');
  ach.innerHTML = '';
  for (const a of ACHIEVEMENTS) {
    const got = savedAch.has(a.id);
    const li = document.createElement('li');
    li.className = got ? 'got' : 'locked';
    if (got && S.ach.has(a.id)) li.classList.add('this-run');
    li.innerHTML = '<span class="ach-name"></span><span class="ach-desc"></span>';
    li.children[0].textContent = got ? a.name : '???';
    li.children[1].textContent = got ? a.desc : a.hint;
    ach.appendChild(li);
  }

  $('win').classList.remove('hidden');
  $('win').scrollTop = 0;
}

function showLose() {
  mode = 'lost';
  $('hud').classList.add('hidden');
  $('lose-title').textContent = `You passed out on ${S.where}.`;
  $('lose-sub').textContent = LOSE_LINE;
  const fill = (id, list) => {
    const el = $(id); el.innerHTML = '';
    list.forEach(s => { const li = document.createElement('li'); li.textContent = s; el.appendChild(li); });
  };
  fill('lose-stroke', FIRST_AID.stroke);
  fill('lose-exhaustion', FIRST_AID.exhaustion);
  const sunPct = S.t > 0 ? Math.min(100, Math.round((S.sunSeconds / S.t) * 100)) : 0;
  let hint;
  if (S.sips === BOTTLE_SIPS && S.t > 20) hint = "You never drank your water. Press Q to drink, and drink before you feel bad.";
  else if (sunPct > 70) hint = `You spent ${sunPct}% of your walk in direct sun. Try the bayou trail or Oak Ln. They have more shade.`;
  else hint = 'When you feel dizzy, stop and cool down. If you keep going, heat exhaustion can turn into heat stroke.';
  $('lose-hint').textContent = hint;
  $('lose').classList.remove('hidden');
  $('lose').scrollTop = 0;
}

// ---------------------------------------------------------------------------
// update

function update(dt) {
  T += dt;
  if (mode === 'title') return;
  if (mode === 'dialog') updateDialog(dt);
  if (mode === 'paused') return;

  if (mode === 'play') updatePlay(dt);
  if (mode === 'dying') {
    S.endT += dt;
    if (S.endT > 2.2 && mode === 'dying') { showLose(); fadeOut(0.7); }
  }
  if (mode === 'winning') {
    S.endT += dt;
    if (S.endT > 1.4 && mode === 'winning') { showWin(); fadeOut(0.9); }
  }
  updateWorldLife(dt);
}

function updatePlay(dt) {
  const p = S.player;
  let ix = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
  let iy = (held('down') ? 1 : 0) - (held('up') ? 1 : 0);
  const wantsMove = ix !== 0 || iy !== 0;
  if (wantsMove) {
    if (Math.abs(ix) >= Math.abs(iy)) p.dir = ix > 0 ? 'right' : 'left';
    else p.dir = iy > 0 ? 'down' : 'up';
  }
  // heat stroke: you can't quite walk straight
  if (wantsMove && S.stage >= 4) { ix += Math.sin(T * 1.9) * 0.45; iy += Math.cos(T * 1.4) * 0.45; }
  const len = Math.hypot(ix, iy);
  if (len > 0) { ix /= len; iy /= len; }
  const running = wantsMove && held('run');
  S.sprinting = running;
  const speed = (running ? SPRINT_SPEED : PLAYER_SPEED) * STAGE_SPEED[S.stage];

  let moved = false;
  if (wantsMove) {
    const dx = ix * speed * dt, dy = iy * speed * dt;
    if (dx && !blocked(p.x + dx, p.y)) { p.x += dx; moved = true; }
    else if (dx) {
      // slide around corners
      for (const n of [3, -3, 6, -6]) if (!blocked(p.x + dx, p.y + n) && !blocked(p.x, p.y + Math.sign(n))) { p.y += Math.sign(n) * speed * dt * 0.7; moved = true; break; }
    }
    if (dy && !blocked(p.x, p.y + dy)) { p.y += dy; moved = true; }
    else if (dy) {
      for (const n of [4, -4, 7, -7]) if (!blocked(p.x + n, p.y + dy) && !blocked(p.x + Math.sign(n), p.y)) { p.x += Math.sign(n) * speed * dt * 0.7; moved = true; break; }
    }
  }
  p.moving = moved;
  if (moved) {
    p.animT += dt * (running ? 11 : 7.5);
    const f = [1, 0, 2, 0][Math.floor(p.animT) % 4];
    if (f !== p.frame && f !== 0) Sound.step(groundAt(p.x, p.y) === G.GRASS);
    p.frame = f;
    if (running && Math.random() < 0.3) S.particles.push({ x: p.x + (Math.random() - 0.5) * 6, y: p.y, vx: -ix * 10, vy: -6, g: 0, life: 0.35, max: 0.35, color: 'rgba(214,200,170,0.7)', size: 1 });
  } else { p.frame = 0; p.animT = 0; }

  // heat
  S.rate = heatRate(p.x, p.y, running);
  if (S.rate > 0) S.sunSeconds += dt;
  S.heat = Math.max(0, Math.min(100, S.heat + S.rate * dt));
  S.peak = Math.max(S.peak, S.heat);
  const st = stageFor(S.heat);
  if (st > S.maxStage) {
    S.maxStage = st;
    coach(STAGES[st].coach);
    Sound.warn();
  }
  S.stage = st;
  if (S.heat >= 100) return die();

  // heartbeat when it gets bad
  if (S.stage >= 3) {
    S.beatT -= dt;
    if (S.beatT <= 0) { Sound.beat(S.stage >= 4 ? 1 : 0.6); S.beatT = S.stage >= 4 ? 0.62 : 0.85; S.pulse = 1; }
  }
  S.pulse = Math.max(0, (S.pulse || 0) - dt * 3);

  // sweat
  if (S.stage >= 1 && Math.random() < dt * (S.stage >= 3 ? 9 : 4)) {
    S.particles.push({ x: p.x + (Math.random() < 0.5 ? -4 : 4) + (Math.random() - 0.5) * 2, y: p.y - 19, vx: (Math.random() - 0.5) * 8, vy: -8, g: 90, life: 0.6, max: 0.6, color: '#cfeaf5', size: 1 });
  }

  S.sipCd = Math.max(0, S.sipCd - dt);
  for (const k in S.stationCd) S.stationCd[k] = Math.max(0, S.stationCd[k] - dt);
  S.t += dt;

  const gl = world.goal;
  if (p.x > gl.x && p.x < gl.x + gl.w && p.y > gl.y && p.y < gl.y + gl.h) return win();

  // first-time hints for things that heat you up or cool you down
  const near = (tx, ty, r) => Math.hypot(p.x - (tx * TILE + 8), p.y - (ty * TILE + 8)) < r * TILE;
  const gNow = groundAt(p.x, p.y);
  if ((gNow === G.ROAD || gNow === G.LOT) && S.rate > 0) coach('asphalt');
  if (S.rate < 0 && gNow !== G.SPLASH) coach('shade');
  if (near(32, 32, 4)) coach('splash');
  if (gNow === G.SPLASH) unlock('splash');
  if (near(5.5, 8.6, 3) && !S.used.has('store')) coach('store');
  if (near(34, 8.6, 3) && !S.used.has('snowball')) coach('snowball');
  if (near(30.5, 12, 2.5)) coach('shelter');
  if (near(2, 37, 2.5) && !S.hat) coach('hat');
  if (world.spots.some(s => s.kind === 'water' && !(s.locked && !S.helped.hasOwnProperty(s.locked)) && near(s.x, s.y, 2.5))) coach('station');
  const lib = world.goal;
  if (Math.hypot(p.x - lib.x - 16, p.y - lib.y) < 10 * TILE) coach('library');
  const dg = S.npcs.find(n => n.id === 'delgado');
  if (!dg.gone && !S.helped.hasOwnProperty('delgado') && Math.hypot(p.x - dg.x * TILE, p.y - dg.y * TILE) < 6 * TILE) coach('neighbor');
  if (S.coachQueue.length) return showCoach(S.coachQueue.shift());

  S.target = findTarget();
  const pr = $('prompt');
  if (S.target) { $('prompt-text').textContent = S.target.label; pr.classList.remove('hidden'); }
  else pr.classList.add('hidden');
}

function updateWorldLife(dt) {
  const p = S.player;
  // people
  for (const n of S.npcs) {
    if (n.leaving) { n.fade -= dt * 1.5; if (n.fade <= 0) { n.gone = true; n.leaving = false; } }
    if (n.fadingIn) { n.fade = Math.min(1, n.fade + dt * 2); if (n.fade >= 1) n.fadingIn = false; }
    if (n.splash) {
      n.t = (n.t || 0) + dt;
      n.x = 31.6 + Math.sin(n.t * 0.9) * 1.1;
      n.dir = Math.cos(n.t * 0.9) > 0 ? 'right' : 'left';
      n.frame = [1, 0, 2, 0][Math.floor(n.t * 7) % 4];
    } else if (n.look && n.pose === 'stand' && !n.wobble && n.id !== 'okafor') {
      const d = Math.hypot(n.x * TILE - p.x, n.y * TILE - p.y);
      if (d < 40) {
        const dx = p.x - n.x * TILE, dy = p.y - n.y * TILE;
        n.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      }
    }
  }
  // grackles
  for (const b of S.birds) {
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (b.state === 'idle') {
      b.t -= dt;
      if (b.t <= 0) { b.t = 0.8 + Math.random() * 2; b.hop = 0.18; b.x += (Math.random() - 0.5) * 6; b.flip = Math.random() < 0.5; }
      if (b.hop) b.hop = Math.max(0, b.hop - dt);
      if (d < 30 && mode === 'play') { unlock('grackle'); b.state = 'fly'; b.vx = (b.x > p.x ? 1 : -1) * (50 + Math.random() * 30); b.vy = -45 - Math.random() * 20; }
    } else if (b.state === 'fly') {
      b.x += b.vx * dt; b.y += b.vy * dt; b.vy -= 10 * dt;
      b.away += dt;
      if (b.away > 4) { b.state = 'gone'; b.away = 0; }
    } else if (b.state === 'gone') {
      b.away += dt;
      if (b.away > 14 && Math.hypot(b.hx - p.x, b.hy - p.y) > 120) { b.state = 'idle'; b.x = b.hx; b.y = b.hy; b.away = 0; }
    }
  }
  // splash pad jets
  if (Math.random() < dt * 30) {
    const nx = (31 + Math.round(Math.random())) * TILE + 8, ny = 32 * TILE + 9;
    S.particles.push({ x: nx + (Math.random() - 0.5) * 2, y: ny, vx: (Math.random() - 0.5) * 22, vy: -50 - Math.random() * 25, g: 170, life: 0.75, max: 0.75, color: Math.random() < 0.5 ? '#d8f1fb' : '#9fd3ec', size: 1, ground: ny + 6 });
  }
  // heat shimmer over sunny asphalt near the player
  if (mode === 'play' && Math.random() < dt * 14) {
    const x = camera.x + Math.random() * vw, y = camera.y + Math.random() * vh;
    const g = groundAt(x, y);
    if ((g === G.ROAD || g === G.LOT) && !shadedAt(x, y)) S.particles.push({ x, y, vx: 0, vy: -9, g: 0, life: 1.6, max: 1.6, color: 'rgba(255,236,200,0.22)', size: 1, shimmer: true, seed: Math.random() * 6 });
  }

  for (const q of S.particles) {
    q.life -= dt;
    q.vy += (q.g || 0) * dt;
    q.x += q.vx * dt; q.y += q.vy * dt;
    if (q.ground && q.y > q.ground) q.life = 0;
  }
  S.particles = S.particles.filter(q => q.life > 0);
  if (S.particles.length > 400) S.particles.splice(0, S.particles.length - 400);
  for (const f of S.floats) { f.life -= dt; f.y -= dt * 14; }
  S.floats = S.floats.filter(f => f.life > 0);
}

// ---------------------------------------------------------------------------
// render

function clampCamera() {
  camera.x = MAP_PX_W <= vw ? (MAP_PX_W - vw) / 2 : Math.max(0, Math.min(MAP_PX_W - vw, camera.x));
  camera.y = MAP_PX_H <= vh ? (MAP_PX_H - vh) / 2 : Math.max(0, Math.min(MAP_PX_H - vh, camera.y));
}

const titlePath = [[6, 36], [13, 26], [26, 30], [30, 20], [48, 12], [50, 30], [30, 42], [8, 38]];
function updateCamera(dt) {
  if (mode === 'title') {
    const seg = ((T * 0.045) % titlePath.length + titlePath.length) % titlePath.length;
    const i = Math.floor(seg), f = seg - i;
    const a = titlePath[i], b = titlePath[(i + 1) % titlePath.length];
    const e = f * f * (3 - 2 * f);
    camera.x = (a[0] + (b[0] - a[0]) * e) * TILE - vw / 2;
    camera.y = (a[1] + (b[1] - a[1]) * e) * TILE - vh / 2;
  } else if (S) {
    const tx = S.player.x - vw / 2, ty = S.player.y - 8 - vh / 2;
    const k = Math.min(1, dt * 8);
    camera.x += (tx - camera.x) * k;
    camera.y += (ty - camera.y) * k;
  }
  clampCamera();
}

function render(dt) {
  updateCamera(dt);
  const g = bctx;
  g.imageSmoothingEnabled = false;
  const cx = Math.round(camera.x), cy = Math.round(camera.y);
  g.fillStyle = '#5f7d33';
  g.fillRect(0, 0, vw, vh);
  g.drawImage(groundCanvas, cx, cy, vw, vh, 0, 0, vw, vh);

  drawWater(g, cx, cy);

  // flat props that sit on the ground (splash nozzles)
  for (const d of statics) if (d.flat) g.drawImage(d.img, d.x - cx, d.y - cy);

  g.globalAlpha = 0.4;
  g.drawImage(shadowCanvas, cx, cy, vw, vh, 0, 0, vw, vh);
  g.globalAlpha = 1;

  const p = S ? S.player : null;
  const list = [];
  const inView = (x, y, w, h) => x + w >= cx && x <= cx + vw && y + h >= cy && y <= cy + vh;
  for (const d of statics) if (!d.flat && inView(d.x, d.y, d.img.width, d.img.height)) list.push(d);

  if (S) {
    // flyer poles + free box + dog car change state
    for (const s of world.spots) {
      if (s.kind === 'flyer') {
        const img = S.read.has(s.tip) ? SPR.poleRead : SPR.pole;
        list.push({ img, x: s.x * TILE + 8 - 6, y: s.y * TILE + 16 - 36, base: s.y * TILE + 15, spot: s });
      } else if (s.kind === 'hat') {
        const img = S.hat ? SPR.freebox : SPR.freeboxHat;
        list.push({ img, x: s.x * TILE - 1, y: s.y * TILE + 16 - img.height, base: s.y * TILE + 15 });
      }
    }
    const dc = world.dogCar;
    list.push({ img: carImg(dc.color, !S.helped.hasOwnProperty('dog'), 'v'), x: dc.x * TILE, y: dc.y * TILE + 1, base: dc.y * TILE + 31 });

    for (const n of S.npcs) {
      if (n.gone || !n.look || n.inKiosk) continue;
      list.push({ npc: n, base: n.y * TILE });
    }
    for (const b of S.birds) if (b.state !== 'gone') list.push({ bird: b, base: b.y });
    if (mode !== 'won' && mode !== 'lost' && mode !== 'title') list.push({ player: true, base: p.y });
  }

  list.sort((a, b) => a.base - b.base);
  for (const d of list) {
    if (d.npc) drawNpc(g, d.npc, cx, cy);
    else if (d.player) drawPlayer(g, cx, cy);
    else if (d.bird) drawBird(g, d.bird, cx, cy);
    else {
      let alpha = 1;
      if (d.tree && p && p.y < d.base - 2 && p.y > d.base - 48 && Math.abs(p.x - (d.x + 30)) < 25) alpha = 0.55;
      if (d.shelter && p && p.x > d.x && p.x < d.x + d.img.width && p.y > d.y && p.y < d.base + 4) alpha = 0.55;
      g.globalAlpha = alpha;
      g.drawImage(d.img, d.x - cx, d.y - cy);
      g.globalAlpha = 1;
      if (d.building && d.building.kind === 'kiosk') drawVendor(g, d, cx, cy);
    }
  }

  for (const o of overheads) {
    if (!inView(o.x, o.y, o.w, o.h)) continue;
    const under = p && p.x > o.x && p.x < o.x + o.w && p.y > o.y && p.y < o.y + o.h + 16;
    g.globalAlpha = under ? 0.55 : 1;
    g.drawImage(o.img, o.x - cx, o.y - cy);
    g.globalAlpha = 1;
  }

  if (S) {
    for (const q of S.particles) {
      const a = Math.max(0, q.life / q.max);
      if (q.shimmer) {
        g.fillStyle = q.color;
        const x = Math.round(q.x + Math.sin(q.life * 5 + q.seed) * 1.5 - cx), y = Math.round(q.y - cy);
        g.globalAlpha = Math.sin(a * Math.PI);
        g.fillRect(x, y, 1, 3); g.fillRect(x + 1, y + 3, 1, 2);
        g.globalAlpha = 1;
        continue;
      }
      g.globalAlpha = Math.min(1, a * 1.5);
      g.fillStyle = q.color;
      g.fillRect(Math.round(q.x - cx), Math.round(q.y - cy), q.size, q.size + (q.vy > 20 ? 1 : 0));
    }
    g.globalAlpha = 1;
    if (mode !== 'title') drawMarkers(g, cx, cy);
    if (mode === 'coach' && S.coachNow && S.coachNow.target) drawPointer(g, S.coachNow.target, cx, cy);
    for (const f of S.floats) {
      const w = textWidth(f.text);
      g.globalAlpha = Math.min(1, f.life * 2);
      drawTextShadow(g, f.text, Math.round(f.x - w / 2 - cx), Math.round(f.y - cy), f.color, '#2a1d1b');
      g.globalAlpha = 1;
    }
  }

  // afternoon haze over everything
  g.fillStyle = 'rgba(255,170,70,0.07)';
  g.fillRect(0, 0, vw, vh);

  if (S && mode !== 'title') {
    drawHeatEffects(g);
    if (mode === 'play' || mode === 'dialog' || mode === 'card' || mode === 'coach') drawGoalArrow(g, cx, cy);
  }
  if (mode === 'title') drawTitleSun(g);

  blit();
}

function drawWater(g, cx, cy) {
  const tx0 = Math.floor(cx / TILE), ty0 = Math.floor(cy / TILE);
  for (let ty = ty0; ty <= ty0 + Math.ceil(vh / TILE); ty++) {
    for (let tx = tx0; tx <= tx0 + Math.ceil(vw / TILE); tx++) {
      if (tx < 0 || ty < 0 || tx >= world.W || ty >= world.H) continue;
      if (world.ground[ty * world.W + tx] !== G.WATER) continue;
      for (let k = 0; k < 2; k++) {
        const s = hash(tx, ty, 40 + k);
        const px = ((s * 16 + T * (3 + k * 2)) % 20) - 2;
        const py = 4 + ((s * 97) % 8 | 0);
        const a = 0.5 + 0.5 * Math.sin(T * 1.3 + s * 12);
        g.fillStyle = `rgba(170,215,200,${0.32 * a})`;
        g.fillRect(Math.round(tx * TILE + px - cx), ty * TILE + py - cy, 4, 1);
        if (a > 0.92) { g.fillStyle = 'rgba(240,250,240,0.5)'; g.fillRect(Math.round(tx * TILE + px + 1 - cx), ty * TILE + py - cy, 1, 1); }
      }
    }
  }
}

function frameFor(set, dir, frame, pose) {
  if (pose === 'sit') return set.sit[dir === 'up' ? 'down' : dir] || set.sit.down;
  return set[dir][frame || 0];
}

function drawNpc(g, n, cx, cy) {
  const set = personSet(n.look, LOOKS[n.look], {});
  const img = frameFor(set, n.dir, n.frame, n.pose);
  let x = n.x * TILE, y = n.y * TILE;
  if (n.wobble) x += Math.sin(T * 2.3) * 1.5;
  g.globalAlpha = n.fade;
  g.fillStyle = 'rgba(27,18,51,0.28)';
  g.fillRect(Math.round(x - 5 - cx), Math.round(y - 1 - cy), 10, 2);
  g.drawImage(img, Math.round(x - PERSON_OX - cx), Math.round(y - PERSON_OY - cy));
  g.globalAlpha = 1;
}

function drawPlayer(g, cx, cy) {
  const p = S.player;
  const key = 'player' + (S.hat ? 'H' : '') + (S.towel ? 'T' : '') + (S.stage >= 3 ? 'F' : '');
  const set = personSet(key, LOOKS.player, { hat: S.hat ? 'straw' : null, towel: S.towel, flush: S.stage >= 3 });
  const x = Math.round(p.x - cx), y = Math.round(p.y - cy);
  g.fillStyle = 'rgba(27,18,51,0.3)';
  g.fillRect(x - 5, y - 1, 10, 2); g.fillRect(x - 4, y + 1, 8, 1);
  if (mode === 'dying') {
    // fall over
    const img = set.down[0];
    const k = Math.min(1, S.endT / 0.5);
    g.save();
    g.translate(x, y);
    g.rotate(k * Math.PI / 2);
    g.drawImage(img, -PERSON_OX, -PERSON_OY);
    g.restore();
    return;
  }
  g.drawImage(set[p.dir][p.frame], x - PERSON_OX, y - PERSON_OY);
}

function drawVendor(g, d, cx, cy) {
  const set = personSet('vendor', LOOKS.vendor, {});
  const img = set.down[0];
  const wx = d.x + 3 + 8, wy = d.y + kioskInfo.windowY + 12;
  g.save();
  g.beginPath();
  g.rect(wx - cx, wy - cy, 48 - 16, 11);
  g.clip();
  g.drawImage(img, Math.round(d.x + 3 + 24 - PERSON_OX - cx), Math.round(wy - 3 - cy + Math.sin(T * 2) * 0.5));
  g.restore();
}

function drawBird(g, b, cx, cy) {
  let img;
  if (b.state === 'fly') img = SPR.grackleFly;
  else img = SPR.grackle[b.hop ? 1 : 0];
  const x = Math.round(b.x - cx - 4), y = Math.round(b.y - cy - img.height);
  if (b.flip) { g.save(); g.translate(x + img.width, y); g.scale(-1, 1); g.drawImage(img, 0, 0); g.restore(); }
  else g.drawImage(img, x, y);
}

function bubble(g, x, y, color) {
  rect(g, x - 3, y - 9, 7, 9, '#2a1d1b');
  rect(g, x - 2, y - 10, 5, 11, '#2a1d1b');
  rect(g, x - 2, y - 8, 5, 7, '#fff6e0');
  rect(g, x - 1, y - 9, 3, 9, '#fff6e0');
  drawText(g, '!', x - 1, y - 7, color);
  dot(g, x, y + 1, '#2a1d1b');
}

function drawMarkers(g, cx, cy) {
  const bobY = Math.round(Math.sin(T * 4) * 1.5);
  for (const n of S.npcs) {
    if (n.gone || !n.encounter || S.helped.hasOwnProperty(n.id)) continue;
    const x = Math.round(n.x * TILE - cx);
    const y = Math.round(n.y * TILE - cy - (n.id === 'dog' ? 26 : n.pose === 'sit' ? 26 : 30) + bobY);
    bubble(g, x, y, '#e8743b');
  }
  for (const s of world.spots) {
    if (s.kind === 'flyer' && !S.read.has(s.tip)) bubble(g, Math.round(s.x * TILE + 8 - cx), Math.round(s.y * TILE - 22 - cy + bobY), '#3d8fd6');
  }
  // small key hint above whatever you can interact with
  if (S.target && mode === 'play') {
    const p = S.player;
    const x = Math.round(p.x - cx), y = Math.round(p.y - 34 - cy);
    rect(g, x - 4, y - 1, 9, 9, '#2a1d1b'); rect(g, x - 3, y, 7, 7, '#fff6e0');
    drawText(g, 'E', x - 1, y + 1, '#2a1d1b');
  }
}

function drawPointer(g, t, cx, cy) {
  let x = t.x - cx, y = t.y - cy;
  const m = 20;
  const off = x < m || y < m || x > vw - m || y > vh - m;
  x = Math.max(m, Math.min(vw - m, x)); y = Math.max(m, Math.min(vh - m, y));
  const r = 11 + Math.sin(T * 6) * 2;
  if (!off) {
    g.strokeStyle = '#2a1d1b'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(Math.round(x), Math.round(y), r, r * 0.7, 0, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#f2c94c'; g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(Math.round(x), Math.round(y), r, r * 0.7, 0, 0, Math.PI * 2); g.stroke();
  }
  // arrow bobbing above it
  const ay = Math.round(y - r - 6 - Math.abs(Math.sin(T * 5)) * 4);
  g.fillStyle = '#2a1d1b';
  g.beginPath(); g.moveTo(x, ay + 2); g.lineTo(x - 7, ay - 7); g.lineTo(x + 7, ay - 7); g.closePath(); g.fill();
  g.fillStyle = '#f2c94c';
  g.beginPath(); g.moveTo(x, ay - 1); g.lineTo(x - 4, ay - 6); g.lineTo(x + 4, ay - 6); g.closePath(); g.fill();
}

function drawGoalArrow(g, cx, cy) {
  const gx = world.goal.x + 16, gy = world.goal.y + 4;
  const sx = gx - cx, sy = gy - cy;
  // keep the arrow out from under the HUD panels
  const m = 18, top = Math.ceil(150 / scale);
  if (sx > m && sx < vw - m && sy > top && sy < vh - m) return;
  const ccx = vw / 2, ccy = (top + vh - m) / 2;
  const dx = sx - ccx, dy = sy - ccy;
  const k = Math.min((vw / 2 - m) / Math.abs(dx || 1e-6), (dy < 0 ? ccy - top : vh - m - ccy) / Math.abs(dy || 1e-6));
  const ax = Math.round(ccx + dx * k), ay = Math.round(ccy + dy * k);
  const ang = Math.atan2(dy, dx);
  const pulse = Math.sin(T * 5) * 1.5;
  g.save();
  g.translate(ax, ay);
  g.rotate(ang);
  g.fillStyle = '#2a1d1b';
  g.beginPath(); g.moveTo(9 + pulse, 0); g.lineTo(-5, -7); g.lineTo(-2, 0); g.lineTo(-5, 7); g.closePath(); g.fill();
  g.fillStyle = '#7fd0f0';
  g.beginPath(); g.moveTo(6 + pulse, 0); g.lineTo(-3, -4.5); g.lineTo(-0.5, 0); g.lineTo(-3, 4.5); g.closePath(); g.fill();
  g.restore();
  const label = 'LIBRARY';
  const lw = textWidth(label);
  let lx = ax - lw / 2 - Math.cos(ang) * 16, ly = ay - 2 - Math.sin(ang) * 14;
  lx = Math.max(2, Math.min(vw - lw - 2, lx)); ly = Math.max(2, Math.min(vh - 7, ly));
  drawTextShadow(g, label, Math.round(lx), Math.round(ly), '#dff4fc', '#2a1d1b');
}

function drawHeatEffects(g) {
  const h = S.heat;
  if (h > 40) {
    const k = Math.min(1, (h - 40) / 60);
    const pulse = (S.pulse || 0) * (S.stage >= 3 ? 0.18 : 0);
    const grad = g.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * (0.55 - k * 0.25), vw / 2, vh / 2, Math.max(vw, vh) * 0.72);
    grad.addColorStop(0, 'rgba(180,40,20,0)');
    grad.addColorStop(1, `rgba(${S.stage >= 3 ? 150 : 210},${S.stage >= 3 ? 20 : 70},20,${Math.min(0.85, k * 0.75 + pulse)})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, vw, vh);
  }
  if (S.stage >= 2) {
    g.fillStyle = `rgba(255,120,40,${0.04 + (S.stage - 2) * 0.04})`;
    g.fillRect(0, 0, vw, vh);
  }
}

function drawTitleSun(g) {
  // big chunky sun in the corner of the title screen
  const r = Math.max(26, Math.min(vw, vh) * 0.14);
  const sx = vw - r * 1.1, sy = r * 1.1;
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2 + T * 0.15;
    const r0 = r + 6, r1 = r + 14 + (i % 2) * 6;
    for (let t = r0; t < r1; t++) {
      g.fillStyle = i % 2 ? '#f2c94c' : '#f29a3c';
      g.fillRect(Math.round(sx + Math.cos(a) * t), Math.round(sy + Math.sin(a) * t), 2, 2);
    }
  }
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = x * x + y * y;
    if (d > r * r) continue;
    const lit = (x + y) / (r * 2);
    g.fillStyle = d > (r - 2) * (r - 2) ? '#e8743b' : lit < -0.25 ? '#fde58a' : lit < 0.15 ? '#f8cf55' : '#f2b13c';
    g.fillRect(Math.round(sx + x), Math.round(sy + y), 1, 1);
  }
}

function blit() {
  ctx.imageSmoothingEnabled = false;
  const wob = S && (mode === 'play' || mode === 'dialog' || mode === 'card' || mode === 'coach' || mode === 'dying') ? (S.stage >= 4 ? 2.6 : S.stage >= 3 ? 1.2 : 0) : 0;
  if (wob > 0) {
    ctx.fillStyle = '#2a1d1b';
    ctx.fillRect(0, 0, vw, vh);
    for (let y = 0; y < vh; y += 2) {
      const off = Math.round(Math.sin(y * 0.045 + T * 2.2) * wob);
      ctx.drawImage(buf, 0, y, vw, 2, off, y, vw, 2);
    }
  } else {
    ctx.drawImage(buf, 0, 0);
  }
  if (S && S.stage >= 4 && mode !== 'title') {
    ctx.globalAlpha = 0.22;
    ctx.drawImage(buf, Math.round(Math.sin(T * 1.3) * 4), 1);
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------
// pause map

function drawPauseMap() {
  const c = $('map');
  const w = c.width, h = c.height;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#2a1d1b';
  g.fillRect(0, 0, w, h);
  const k = Math.min(w / MAP_PX_W, h / MAP_PX_H);
  const ox = (w - MAP_PX_W * k) / 2, oy = (h - MAP_PX_H * k) / 2;
  g.drawImage(mapSnapshot, ox, oy, MAP_PX_W * k, MAP_PX_H * k);
  const mark = (x, y, col, r = 4) => {
    g.fillStyle = '#2a1d1b'; g.fillRect(Math.round(ox + x * k - r - 1), Math.round(oy + y * k - r - 1), r * 2 + 2, r * 2 + 2);
    g.fillStyle = col; g.fillRect(Math.round(ox + x * k - r), Math.round(oy + y * k - r), r * 2, r * 2);
  };
  for (const s of world.spots) if (s.kind === 'water' && !(s.locked && !S.helped.hasOwnProperty(s.locked))) mark(s.x * TILE + 8, s.y * TILE + 8, '#3d8fd6', 3);
  for (const n of S.npcs) if (n.encounter && !n.gone && !S.helped.hasOwnProperty(n.id)) mark(n.x * TILE, n.y * TILE - 8, '#e8743b', 3);
  mark(world.goal.x + 16, world.goal.y, '#7fd0f0', 5);
  mark(S.player.x, S.player.y - 8, '#fff6e0', 4);
  g.fillStyle = '#e8743b';
  g.fillRect(Math.round(ox + S.player.x * k - 2), Math.round(oy + (S.player.y - 8) * k - 2), 4, 4);

}

// ---------------------------------------------------------------------------
// HUD

const hud = {
  fill: $('meter-fill'), temp: $('temp'), status: $('status'),
  bottle: $('bottle'), clock: $('clock'), helped: $('helped'), read: $('read'), items: $('items'), meter: $('meter'),
};
const last = {};
function setText(el, key, v) { if (last[key] !== v) { last[key] = v; el.textContent = v; } }

function updateHud() {
  if (!S) return;
  const h = S.heat;
  hud.fill.style.width = h.toFixed(1) + '%';
  const tone = STAGES[S.stage].tone;
  if (last.tone !== tone) { last.tone = tone; hud.meter.dataset.tone = tone; hud.status.dataset.tone = tone; }
  setText(hud.temp, 'temp', bodyTemp(h).toFixed(1) + '°F');
  setText(hud.status, 'status', STAGES[S.stage].label);

  const sipsKey = S.sips + '/' + BOTTLE_SIPS;
  if (last.sips !== sipsKey) {
    last.sips = sipsKey;
    hud.bottle.innerHTML = '';
    for (let i = 0; i < BOTTLE_SIPS; i++) {
      const b = document.createElement('span');
      b.className = 'sip' + (i < S.sips ? ' full' : '');
      hud.bottle.appendChild(b);
    }
  }
  const items = (S.hat ? 'hat' : '') + (S.towel ? 'towel' : '');
  if (last.items !== items) {
    last.items = items;
    hud.items.innerHTML = '';
    if (S.hat) { const s = document.createElement('span'); s.className = 'item'; s.textContent = 'Straw hat'; hud.items.appendChild(s); }
    if (S.towel) { const s = document.createElement('span'); s.className = 'item'; s.textContent = 'Cooling towel'; hud.items.appendChild(s); }
  }
  const mins = CLOCK_START_MIN + S.t * CLOCK_MIN_PER_SEC;
  const hh = Math.floor(mins / 60), mm = Math.floor(mins % 60);
  setText(hud.clock, 'clock', `${hh > 12 ? hh - 12 : hh}:${String(mm).padStart(2, '0')} PM`);
  setText($('elapsed'), 'elapsed', fmtTime(S.t));
  setText(hud.helped, 'helped', `${Object.keys(S.helped).length}/${Object.keys(ENCOUNTERS).length}`);
  setText(hud.read, 'read', `${S.read.size}/${FACTS.length}`);
}

// ---------------------------------------------------------------------------
// sizing + main loop

function resize() {
  const ww = window.innerWidth, wh = window.innerHeight;
  scale = Math.max(2, Math.round(wh / 250));
  while (scale > 1 && ww / scale < 300) scale--;
  vw = Math.ceil(ww / scale); vh = Math.ceil(wh / scale);
  canvas.width = vw; canvas.height = vh;
  buf.width = vw; buf.height = vh;
  canvas.style.width = vw * scale + 'px';
  canvas.style.height = vh * scale + 'px';
  document.documentElement.style.setProperty('--px', scale + 'px');
}
window.addEventListener('resize', resize);
resize();

try {
  const best = parseFloat(localStorage.getItem('sunstruck-best'));
  if (best) $('title-best').textContent = 'Best time ' + fmtTime(best);
} catch (e) { /* ignore */ }

newRun();
mode = 'title';
let lastT = performance.now();
function loop(now) {
  const dt = Math.max(0, Math.min(0.05, (now - lastT) / 1000));
  lastT = now;
  update(dt);
  render(dt);
  if (mode !== 'title') updateHud();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// hold the loading screen until the fonts are in, so the title doesn't flash
// in fallback fonts. Give up after 3s so a bad connection doesn't block the game.
const fontsIn = document.fonts
  ? Promise.all(['700 20px "Pixelify Sans"', '500 20px "Pixelify Sans"', '400 16px "Atkinson Hyperlegible"'].map(f => document.fonts.load(f))).catch(() => {})
  : Promise.resolve();
Promise.race([fontsIn, new Promise(r => setTimeout(r, 3000))]).then(() => {
  document.body.classList.remove('loading');
  $('loader').classList.add('done');
  setTimeout(() => $('loader').remove(), 400);
});
