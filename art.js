'use strict';

// Every sprite in the game is drawn here, once, into small offscreen canvases.
// Light comes from the west (afternoon sun), so left edges are lit and
// shadows fall to the east.

const INK = '#2a1d1b';
const TILE = 16;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function hash(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noise2(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s);
  const c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const _rgbCache = {};
function rgb(hex) {
  if (_rgbCache[hex]) return _rgbCache[hex];
  const n = parseInt(hex.slice(1), 16);
  return (_rgbCache[hex] = [n >> 16 & 255, n >> 8 & 255, n & 255]);
}
function hex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
const darken = (c, t) => mix(c, '#1d1426', t);
const lighten = (c, t) => mix(c, '#fff4dc', t);

function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
function dot(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }

// 1px outline around anything non-transparent
function outline(canvas, color = INK) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const src = ctx.getImageData(0, 0, w, h);
  const d = src.data;
  const out = new Uint8ClampedArray(d);
  const [r, g, b] = rgb(color);
  const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : d[(y * w + x) * 4 + 3];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (a(x, y) > 0) continue;
      if (a(x - 1, y) > 0 || a(x + 1, y) > 0 || a(x, y - 1) > 0 || a(x, y + 1) > 0) {
        const i = (y * w + x) * 4;
        out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255;
      }
    }
  src.data.set(out);
  ctx.putImageData(src, 0, 0);
  return canvas;
}

function flipX(canvas) {
  const c = makeCanvas(canvas.width, canvas.height);
  const ctx = c.getContext('2d');
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(canvas, 0, 0);
  return c;
}

function rotate90(canvas) {
  const c = makeCanvas(canvas.height, canvas.width);
  const ctx = c.getContext('2d');
  ctx.translate(canvas.height, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(canvas, 0, 0);
  return c;
}

// ---------------------------------------------------------------------------
// 3x5 pixel font for signs and little floating numbers

const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010',
  8: '111101111101111', 9: '111101111001110',
  '-': '000000111000000', '+': '000010111010000', '!': '010010010000010', '.': '000000000000010',
  "'": '010010000000000', '°': '110110000000000', ':': '000010000010000', '/': '001001010100100',
  '?': '110001010000010', ' ': '000000000000000', ',': '000000000010100',
};

function textWidth(s) { return s.length * 4 - 1; }

function drawText(ctx, s, x, y, color) {
  ctx.fillStyle = color;
  s = s.toUpperCase();
  for (let i = 0; i < s.length; i++) {
    const g = GLYPHS[s[i]] || GLYPHS[' '];
    for (let p = 0; p < 15; p++)
      if (g[p] === '1') ctx.fillRect(x + i * 4 + (p % 3), y + ((p / 3) | 0), 1, 1);
  }
}

function drawTextShadow(ctx, s, x, y, color, shadow) {
  drawText(ctx, s, x + 1, y + 1, shadow);
  drawText(ctx, s, x, y, color);
}

// ---------------------------------------------------------------------------
// ground

const GC = {
  grass: ['#5f7d33', '#6f8d3a', '#7e9a41', '#93a84c', '#a7b25a'],
  grassBlade: '#4f6b2b', grassTip: '#b4c063',
  asphalt: ['#47424d', '#4c4752', '#524c58', '#3c3842', '#5e5864', '#6c6672'],
  lot: ['#544e59', '#59535e', '#5f5964', '#48434e', '#6a646f'],
  walk: ['#cbbda4', '#c5b69c', '#d6c9b1', '#b4a58b', '#a6977e'],
  bridge: ['#d1c6b1', '#c9bea8', '#dcd2bf', '#b7ab96'],
  dirt: ['#b48e5c', '#a8834f', '#c29d6c', '#8c7a63'],
  water: ['#467a72', '#4c8178', '#548a80', '#3f6f68', '#62978b', '#79ab9c'],
  sand: ['#e0c58c', '#d5b87e', '#ead3a1', '#c9aa6e'],
  gravel: ['#a0978a', '#8a8275', '#b6ae9f', '#726a5f'],
  splash: ['#a9bec4', '#a2b8bf', '#b3c7cc', '#93abb3'],
  court: ['#b46d4d', '#ae6849', '#bb7454', '#a86246'],
  plank: ['#a57a4f', '#9a7047', '#ae8457', '#6b4b31'],
  pavers: ['#c99a72', '#c08f68', '#d2a57d', '#a8896a'],
};

function renderGround(world) {
  const W = world.W * TILE, H = world.H * TILE;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const gt = (tx, ty) => (tx < 0 || ty < 0 || tx >= world.W || ty >= world.H) ? -1 : world.ground[ty * world.W + tx];

  const put = (x, y, col) => {
    const i = (y * W + x) * 4, p = rgb(col);
    d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = 255;
  };

  const grassAt = (gx, gy) => {
    const n = noise2(gx / 26, gy / 26, 1) * 0.65 + noise2(gx / 7, gy / 7, 2) * 0.35;
    const r = hash(gx, gy, 3);
    const v = n + (r - 0.5) * 0.24;
    let col = v > 0.7 ? GC.grass[4] : v > 0.56 ? GC.grass[3] : v > 0.4 ? GC.grass[2] : v > 0.27 ? GC.grass[1] : GC.grass[0];
    const r2 = hash(gx, gy, 4);
    if (r2 < 0.045) col = GC.grassBlade;
    else if (r2 > 0.982) col = GC.grassTip;
    return col;
  };

  const speckle = (pal, gx, gy, s, scale = 30) => {
    const n = noise2(gx / scale, gy / scale, s);
    const r = hash(gx, gy, s + 1);
    if (r < 0.07) return pal[2];
    if (r < 0.14) return pal[3];
    if (r > 0.994 && pal[4]) return pal[4];
    return n > 0.55 ? pal[1] : pal[0];
  };

  for (let ty = 0; ty < world.H; ty++) {
    for (let tx = 0; tx < world.W; tx++) {
      const t = gt(tx, ty);
      for (let py = 0; py < TILE; py++) {
        for (let px = 0; px < TILE; px++) {
          const gx = tx * TILE + px, gy = ty * TILE + py;
          let col;
          switch (t) {
            case G.ROAD: col = speckle(GC.asphalt, gx, gy, 10); break;
            case G.LOT: col = speckle(GC.lot, gx, gy, 20); break;
            case G.WALK:
              col = speckle(GC.walk, gx, gy, 30, 18);
              if (px === 0 || py === 0) col = GC.walk[4];
              break;
            case G.BRIDGE:
              col = speckle(GC.bridge, gx, gy, 40);
              if (py === 0) col = GC.bridge[3];
              break;
            case G.PAVERS: {
              const row = (gy / 4) | 0;
              const off = (row % 2) * 4;
              const mortar = gy % 4 === 0 || (gx + off) % 8 === 0;
              const b = hash(((gx + off) / 8) | 0, row, 50);
              col = mortar ? GC.pavers[3] : b < 0.33 ? GC.pavers[0] : b < 0.66 ? GC.pavers[1] : GC.pavers[2];
              break;
            }
            case G.DIRT: {
              col = speckle(GC.dirt, gx, gy, 60, 12);
              // fray the edges into whatever grass is next to it
              const edge = Math.min(
                gt(tx, ty - 1) === G.GRASS ? py : 99, gt(tx, ty + 1) === G.GRASS ? 15 - py : 99,
                gt(tx - 1, ty) === G.GRASS ? px : 99, gt(tx + 1, ty) === G.GRASS ? 15 - px : 99);
              if (edge < 3 && hash(gx, gy, 61) < (3 - edge) / 4) col = grassAt(gx, gy);
              break;
            }
            case G.WATER: {
              const n = noise2(gx / 20, gy / 9, 70);
              const streak = noise2(gx / 16, gy / 2.5, 71);
              col = n > 0.6 ? GC.water[2] : n > 0.35 ? GC.water[1] : GC.water[0];
              if (streak > 0.78) col = GC.water[4];
              if (hash(gx, gy, 72) < 0.04) col = GC.water[3];
              if (gt(tx, ty - 1) !== G.WATER && gt(tx, ty - 1) !== -1) {
                if (py === 0) col = '#4a3a2b';
                else if (py === 1) col = '#5b4934';
                else if (py === 2) col = hash(gx, gy, 73) < 0.5 ? '#3a5f58' : GC.water[3];
                else if (py === 3 && hash(gx, gy, 74) < 0.5) col = GC.water[3];
              }
              if (gt(tx, ty + 1) !== G.WATER && gt(tx, ty + 1) !== -1) {
                if (py === 15) col = '#6b5a40';
                else if (py === 14) col = '#8a7a58';
                else if (py === 13) col = GC.water[5];
                else if (py === 12 && hash(gx, gy, 75) < 0.5) col = GC.water[4];
              }
              break;
            }
            case G.SAND: col = speckle(GC.sand, gx, gy, 80, 10); break;
            case G.GRAVEL: col = speckle(GC.gravel, gx, gy, 90, 8); if (hash(gx, gy, 91) < 0.12) col = GC.gravel[hash(gx, gy, 92) < 0.5 ? 2 : 3]; break;
            case G.SPLASH: {
              col = speckle(GC.splash, gx, gy, 100, 12);
              if (noise2(gx / 10, gy / 10, 101) > 0.62) col = GC.splash[3];
              break;
            }
            case G.COURT: col = speckle(GC.court, gx, gy, 110, 20); break;
            case G.PLANK: {
              const seam = gy % 4 === 3;
              const b = hash(((gx + ((gy / 4) | 0) * 7) / 13) | 0, (gy / 4) | 0, 120);
              col = seam ? GC.plank[3] : b < 0.4 ? GC.plank[0] : b < 0.75 ? GC.plank[1] : GC.plank[2];
              if (!seam && hash(gx, gy, 121) < 0.05) col = GC.plank[1];
              break;
            }
            default: col = grassAt(gx, gy);
          }
          put(gx, gy, col);
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  // ---- details drawn on top ----
  const R = rng(777);
  const isPaved = t => t === G.WALK || t === G.BRIDGE || t === G.PAVERS;

  for (let ty = 0; ty < world.H; ty++) {
    for (let tx = 0; tx < world.W; tx++) {
      const t = gt(tx, ty);
      const X = tx * TILE, Y = ty * TILE;
      const hs = hash(tx, ty, 500);

      if (t === G.GRASS) {
        // tufts
        const n = 1 + ((hs * 3) | 0);
        for (let i = 0; i < n; i++) {
          const x = X + 2 + ((hash(tx, ty, 510 + i) * 12) | 0), y = Y + 3 + ((hash(tx, ty, 520 + i) * 11) | 0);
          dot(ctx, x, y, GC.grassBlade); dot(ctx, x + 2, y, GC.grassBlade);
          dot(ctx, x + 1, y - 1, GC.grassBlade); dot(ctx, x + 1, y - 2, GC.grassTip);
        }
        if (hs > 0.9) {
          const fx = X + 3 + ((hash(tx, ty, 530) * 10) | 0), fy = Y + 3 + ((hash(tx, ty, 531) * 10) | 0);
          const fc = ['#f2e27a', '#f7f1e1', '#e7a0c0', '#c9a6e8'][(hash(tx, ty, 532) * 4) | 0];
          dot(ctx, fx, fy - 1, fc); dot(ctx, fx - 1, fy, fc); dot(ctx, fx + 1, fy, fc); dot(ctx, fx, fy + 1, fc);
          dot(ctx, fx, fy, '#e8b93a');
        }
        // grass spilling over sidewalk edges
        const spill = (nx, ny, dx, dy) => {
          if (!isPaved(gt(nx, ny))) return;
          for (let i = 0; i < 16; i++) {
            if (hash(X + i, Y, 540 + dx * 3 + dy) < 0.35) {
              const px = dx === 0 ? X + i : (dx > 0 ? X + 16 : X - 1);
              const py = dy === 0 ? Y + i : (dy > 0 ? Y + 16 : Y - 1);
              dot(ctx, px, py, GC.grass[1]);
            }
          }
        };
        spill(tx, ty + 1, 0, 1); spill(tx, ty - 1, 0, -1); spill(tx + 1, ty, 1, 0); spill(tx - 1, ty, -1, 0);
      }

      if (t === G.ROAD || t === G.LOT) {
        // gutter next to curbs
        if (isPaved(gt(tx, ty - 1))) { rect(ctx, X, Y, 16, 1, '#35313a'); rect(ctx, X, Y - 1, 16, 1, '#e2d7c4'); }
        if (isPaved(gt(tx, ty + 1))) { rect(ctx, X, Y + 15, 16, 1, '#35313a'); }
        if (isPaved(gt(tx - 1, ty))) { rect(ctx, X, Y, 1, 16, '#35313a'); rect(ctx, X - 1, Y, 1, 16, '#e2d7c4'); }
        if (isPaved(gt(tx + 1, ty))) { rect(ctx, X + 15, Y, 1, 16, '#35313a'); }
        // tar cracks
        if (hs < 0.16) {
          let x = X + 2 + R() * 12, y = Y + 2 + R() * 12;
          const dx = R() < 0.5 ? 1 : -1;
          for (let i = 0; i < 9; i++) {
            dot(ctx, x | 0, y | 0, '#322e37');
            x += R() < 0.6 ? dx : 0; y += R() < 0.7 ? 1 : 0;
          }
        }
        if (t === G.LOT && hs > 0.8) {
          ctx.globalAlpha = 0.35;
          rect(ctx, X + 5, Y + 6, 6, 4, '#2c2930'); rect(ctx, X + 4, Y + 7, 8, 2, '#2c2930');
          ctx.globalAlpha = 1;
        }
      }

      if (t === G.WALK && hs < 0.1) {
        let x = X + 3 + R() * 10, y = Y + 3;
        for (let i = 0; i < 8; i++) { dot(ctx, x | 0, y + i, GC.walk[4]); x += R() < 0.4 ? (R() < 0.5 ? 1 : -1) : 0; }
      }
      if (t === G.WALK && hs > 0.93) {
        ctx.globalAlpha = 0.2; rect(ctx, X + 4, Y + 5, 7, 5, '#6b5d48'); ctx.globalAlpha = 1;
      }
    }
  }

  // Main St gets a double yellow
  for (let x = 0; x < W; x++) {
    const tx = (x / TILE) | 0;
    if ((tx >= 11 && tx <= 14) || (tx >= 39 && tx <= 42)) continue;
    dot(ctx, x, 174, '#e3b743'); dot(ctx, x, 177, '#e3b743');
  }
  // dashed white on the side streets
  const dashH = (y, x0, x1) => { for (let x = x0; x < x1; x++) if (x % 12 < 6) rect(ctx, x, y, 1, 1, '#d8d2c4'); };
  const dashV = (x, y0, y1) => { for (let y = y0; y < y1; y++) if (y % 12 < 6) rect(ctx, x, y, 1, 1, '#d8d2c4'); };
  for (const y of [20 * 16, 40 * 16]) {
    dashH(y - 1, 0, 11 * 16); dashH(y - 1, 15 * 16, 39 * 16); dashH(y - 1, 43 * 16, W);
  }
  for (const x of [13 * 16, 41 * 16]) {
    dashV(x - 1, 13 * 16, 18 * 16); dashV(x - 1, 22 * 16, 38 * 16);
  }

  // crosswalks
  for (const cw of world.crosswalks) {
    const X = cw.x * TILE, Y = cw.y * TILE;
    if (cw.dir === 'h') {
      for (let x = X + 1; x < X + cw.w * TILE - 1; x += 4)
        for (let y = Y + 2; y < Y + 14; y++) {
          if (hash(x, y, 600) < 0.12) continue;
          rect(ctx, x, y, 2, 1, '#e6dfd0');
        }
    } else {
      for (let y = Y + 1; y < Y + cw.h * TILE - 1; y += 4)
        for (let x = X + 2; x < X + 14; x++) {
          if (hash(x, y, 601) < 0.12) continue;
          rect(ctx, x, y, 1, 2, '#e6dfd0');
        }
    }
  }

  // parking stalls
  for (const row of [33, 36]) {
    for (let tx = 43; tx <= 59; tx++) rect(ctx, tx * 16, row * 16 + 1, 1, 30, '#e1dacb');
    for (let tx = 43; tx < 59; tx++) {
      const sy = row === 33 ? row * 16 + 2 : row * 16 + 28;
      rect(ctx, tx * 16 + 4, sy, 8, 2, '#bdb2a0'); rect(ctx, tx * 16 + 4, sy + 1, 8, 1, '#9a8f7e');
    }
  }
  // lot arrows in the aisle
  for (const tx of [45, 53]) {
    const x = tx * 16 + 4, y = 35 * 16 + 7;
    rect(ctx, x, y, 7, 1, '#d6cfc0'); dot(ctx, x + 5, y - 1, '#d6cfc0'); dot(ctx, x + 5, y + 1, '#d6cfc0'); dot(ctx, x + 4, y - 2, '#d6cfc0'); dot(ctx, x + 4, y + 2, '#d6cfc0');
  }

  // manholes + storm drains
  for (const [tx, ty] of [[6, 10], [27, 11], [47, 19], [13, 30], [40, 33], [20, 39]]) {
    const cx = tx * 16 + 8, cy = ty * 16 + 8;
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
      const r = x * x + y * y;
      if (r <= 16) dot(ctx, cx + x, cy + y, r > 10 ? '#2f2b33' : ((x + y) & 1 ? '#3b3741' : '#56505b'));
    }
  }
  for (const [tx, ty, side] of [[8, 11, 1], [22, 11, 1], [35, 19, -1], [6, 40, 1], [30, 40, 1], [12, 16, 0], [41, 29, 2]]) {
    const X = tx * 16, Y = ty * 16;
    if (side === 1) { rect(ctx, X + 4, Y + 13, 8, 2, '#262229'); for (let i = 0; i < 8; i += 2) dot(ctx, X + 4 + i, Y + 13, '#58535d'); }
    else if (side === -1) { rect(ctx, X + 4, Y + 1, 8, 2, '#262229'); for (let i = 0; i < 8; i += 2) dot(ctx, X + 4 + i, Y + 2, '#58535d'); }
    else if (side === 0) { rect(ctx, X + 1, Y + 4, 2, 8, '#262229'); }
    else { rect(ctx, X + 13, Y + 4, 2, 8, '#262229'); }
  }

  // basketball court lines
  ctx.fillStyle = '#efe7d6';
  const cx0 = 34 * 16, cy0 = 29 * 16;
  ctx.fillRect(cx0 + 1, cy0 + 1, 62, 1); ctx.fillRect(cx0 + 1, cy0 + 46, 62, 1);
  ctx.fillRect(cx0 + 1, cy0 + 1, 1, 46); ctx.fillRect(cx0 + 62, cy0 + 1, 1, 46);
  ctx.fillRect(cx0 + 22, cy0 + 1, 1, 18); ctx.fillRect(cx0 + 42, cy0 + 1, 1, 18); ctx.fillRect(cx0 + 22, cy0 + 18, 21, 1);
  for (let a = 0; a < Math.PI; a += 0.05) dot(ctx, Math.round(cx0 + 32 + Math.cos(a) * 9), Math.round(cy0 + 18 + Math.sin(a) * 7), '#efe7d6');

  // splash pad rings
  const ring = (cx, cy, r, col) => { for (let a = 0; a < Math.PI * 2; a += 0.04) dot(ctx, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.8), col); };
  ring(30 * 16 + 18, 31 * 16 + 18, 12, '#e8743b'); ring(30 * 16 + 18, 31 * 16 + 18, 11, '#e8743b');
  ring(32 * 16 + 14, 32 * 16 + 14, 10, '#3d8fd6'); ring(32 * 16 + 14, 32 * 16 + 14, 9, '#3d8fd6');
  ring(31 * 16 + 30, 31 * 16 + 6, 5, '#f2c94c');
  for (let i = 0; i < 4; i++) rect(ctx, 30 * 16 + 4 + i * 16, 33 * 16 + 12, 4, 1, '#7c939b');

  // bridge railings
  const rail = (x, y0, y1, wood) => {
    for (let y = y0; y < y1; y++) {
      rect(ctx, x, y, 3, 1, wood ? '#7a5636' : '#8d877d');
      dot(ctx, x, y, wood ? '#a07650' : '#b9b3a7');
      if (y % 6 === 0) rect(ctx, x, y, 3, 2, wood ? '#5a3e27' : '#6c665e');
    }
  };
  for (const [x, left] of [[11, true], [14, false], [39, true], [42, false]])
    rail(left ? x * 16 : x * 16 + 13, 24 * 16 - 2, 27 * 16 + 1, false);
  rail(26 * 16, 24 * 16 - 2, 27 * 16 + 1, true);
  rail(27 * 16 + 13, 24 * 16 - 2, 27 * 16 + 1, true);
  for (const x0 of [12, 40]) { rect(ctx, x0 * 16, 24 * 16, 32, 1, '#35313a'); rect(ctx, x0 * 16, 27 * 16 - 1, 32, 1, '#35313a'); }

  // Okafor's half-mowed lawn
  for (let x = 15 * 16; x < 19 * 16; x++) {
    const band = ((x / 6) | 0) % 2;
    ctx.globalAlpha = band ? 0.14 : 0.06;
    rect(ctx, x, 34 * 16, 1, 4 * 16, band ? '#f2f0c8' : '#2d4a1e');
  }
  ctx.globalAlpha = 1;

  // welcome mat at home
  rect(ctx, 5 * 16 + 8, 37 * 16 + 1, 12, 5, '#8a3b2e'); rect(ctx, 5 * 16 + 9, 37 * 16 + 2, 10, 3, '#a85a42');

  // tire ruts at the construction site
  for (let y = 43 * 16; y < 47 * 16; y++) {
    const off = Math.round(Math.sin(y / 9) * 2);
    if (hash(0, y, 700) < 0.75) { dot(ctx, 25 * 16 + 4 + off, y, '#7d7568'); dot(ctx, 26 * 16 + 10 + off, y, '#7d7568'); }
  }

  return c;
}

// ---------------------------------------------------------------------------
// shadows. Drawn solid into their own canvas; the game draws it at low alpha
// and also reads it back to know whether you're standing in shade.

const TREE_SHADE = { dx: 5, dy: 8, rx: 26, ry: 18 };

function renderShadows(world) {
  const W = world.W * TILE, H = world.H * TILE;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';

  const blob = (cx, cy, rx, ry, seed) => {
    for (let y = -ry - 2; y <= ry + 2; y++)
      for (let x = -rx - 2; x <= rx + 2; x++) {
        const n = (hash(x + seed, y, 900) - 0.5) * 0.18 + (noise2((x + seed) / 5, y / 5, 901) - 0.5) * 0.22;
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1 + n) ctx.fillRect(cx + x, cy + y, 1, 1);
      }
  };

  for (const t of world.trees) {
    const s = TREE_SHADE;
    const big = t.v === 1 ? -2 : t.v === 2 ? -4 : 0;
    blob(t.x * TILE + 8 + s.dx, t.y * TILE + s.dy, s.rx + big, s.ry + Math.min(0, big / 2), t.x * 31 + t.y);
  }

  for (const b of world.buildings) {
    const len = { house: 10, shop: 12, library: 18, apartments: 16, grocery: 14, kiosk: 7 }[b.kind] || 10;
    const R = (b.x + b.w) * TILE, T = b.y * TILE, B = (b.y + b.h) * TILE;
    ctx.beginPath();
    ctx.moveTo(R, T - 2);
    ctx.lineTo(R + len, T + len * 0.6);
    ctx.lineTo(R + len, B);
    ctx.lineTo(R, B);
    ctx.fill();
  }

  for (const o of world.overheads) {
    if (o.kind === 'awning') ctx.fillRect(o.x * TILE + 3, o.y * TILE, o.w * TILE, 15);
    else if (o.kind === 'shelter') ctx.fillRect(o.x * TILE + 4, o.y * TILE - 1, o.w * TILE, 15);
    else if (o.kind === 'tent') ctx.fillRect(o.x * TILE + 4, o.y * TILE - 2, o.w * TILE, 20);
    else if (o.kind === 'umbrella') blob(o.x * TILE + 4, o.y * TILE + 8, 15, 10, 5);
  }

  for (const f of world.fences) if (f.kind === 'wood') ctx.fillRect(f.x * TILE + 2, f.y * TILE + 12, 16, 5);
  for (const car of world.cars) {
    if (car.dir === 'v') ctx.fillRect(car.x * TILE + 3, car.y * TILE + 4, 15, 28);
    else ctx.fillRect(car.x * TILE + 4, car.y * TILE + 3, 30, 14);
  }
  // bridges over the bayou
  ctx.fillRect(15 * TILE, 24 * TILE, 5, 48);
  ctx.fillRect(43 * TILE, 24 * TILE, 5, 48);
  ctx.fillRect(28 * TILE, 24 * TILE, 4, 48);

  return c;
}

// ---------------------------------------------------------------------------
// people

const LOOKS = {
  player: { skin: '#b97a50', hair: '#2a1d1b', hairStyle: 'short', shirt: '#e8743b', pants: '#3f5f8f', legs: 'shorts', shoes: '#efe8da' },
  okafor: { skin: '#6b4430', hair: '#bdb8ae', hairStyle: 'receding', shirt: '#dfe7ea', pants: '#a08a62', legs: 'long', shoes: '#4a3b30', beard: '#bdb8ae', pale: true },
  jayden: { skin: '#8d5a3b', hair: '#1f1715', hairStyle: 'short', shirt: '#7fbf4a', pants: '#2f4a7a', legs: 'shorts', shoes: '#d04a3a', kid: true, flush: true },
  dana: { skin: '#f0c4a0', hair: '#6b4426', hairStyle: 'ponytail', shirt: '#e86a8a', pants: '#2b2b33', legs: 'shorts', shoes: '#efe8da', headband: '#efe8da', flush: true, red: true },
  delgado: { skin: '#c99572', hair: '#dcd7cf', hairStyle: 'bun', shirt: '#8a5a9e', pants: '#8a5a9e', legs: 'dress', shoes: '#3b2a20', glasses: true },
  luis: { skin: '#a8714a', hair: '#2a1d1b', hairStyle: 'short', shirt: '#7c8288', pants: '#3f5f8f', legs: 'long', shoes: '#5a4030', hat: 'hardhat', vest: '#e9d23a' },
  mom: { skin: '#8d5a3b', hair: '#1f1715', hairStyle: 'long', shirt: '#3d8fd6', pants: '#e8e2d6', legs: 'long', shoes: '#e8e2d6' },
  volunteer: { skin: '#e2b48c', hair: '#c9a24a', hairStyle: 'short', shirt: '#3d8fd6', pants: '#a08a62', legs: 'shorts', shoes: '#efe8da', hat: 'cap', capColor: '#e8743b' },
  vendor: { skin: '#d6a07a', hair: '#2a1d1b', hairStyle: 'long', shirt: '#f2c94c', pants: '#3f5f8f', legs: 'long', shoes: '#efe8da' },
  kid2: { skin: '#e8b48c', hair: '#c9632f', hairStyle: 'short', shirt: '#f2c94c', pants: '#3d8fd6', legs: 'shorts', shoes: '#efe8da', kid: true },
};

// canvas is 20x27, feet at (10, 25)
const PERSON_W = 20, PERSON_H = 27, PERSON_OX = 10, PERSON_OY = 25;

function drawPerson(look, dir, frame, opts = {}) {
  const c = makeCanvas(PERSON_W, PERSON_H);
  const ctx = c.getContext('2d');
  ctx.translate(2, 3);
  const L = look;
  const kid = !!L.kid;
  const sit = opts.pose === 'sit';
  const hat = opts.hat || L.hat;
  const towel = opts.towel;

  let skin = L.skin;
  if (L.pale) skin = mix(skin, '#9a8f80', 0.12);
  const skinD = darken(skin, 0.2);
  const hair = L.hair, hairL = lighten(hair, 0.22), hairD = darken(hair, 0.25);
  const shirt = L.shirt, shirtD = darken(shirt, 0.2), shirtL = lighten(shirt, 0.18);
  const pants = L.pants, pantsD = darken(pants, 0.22);
  const shoes = L.shoes, shoesD = darken(shoes, 0.3);

  const legH = kid ? 1 : 2;
  const feetY = 21;
  const legTop = feetY - legH;
  const hipTop = legTop - 2;
  const torsoH = kid ? 4 : 6;
  const sh = sit ? 3 : 0;
  const torsoTop = hipTop - torsoH + sh;
  const headTop = torsoTop - 8;

  const walkA = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  const bob = frame === 0 ? 0 : 0;
  const Y = v => v + bob;

  const legColor = L.legs === 'long' ? pants : skin;
  const legColorD = L.legs === 'long' ? pantsD : skinD;

  if (dir === 'down' || dir === 'up') {
    const up = dir === 'up';
    // legs + shoes
    if (sit) {
      rect(ctx, 4, Y(hipTop + sh), 8, 2, L.legs === 'dress' ? shirt : pants);
      rect(ctx, 5, Y(hipTop + sh + 2), 2, 1, legColor); rect(ctx, 9, Y(hipTop + sh + 2), 2, 1, legColor);
      rect(ctx, 5, Y(feetY), 2, 1, shoes); rect(ctx, 9, Y(feetY), 2, 1, shoes);
    } else {
      const lUp = walkA === -1 ? 1 : 0, rUp = walkA === 1 ? 1 : 0;
      rect(ctx, 5, Y(legTop), 2, legH - lUp, legColor); rect(ctx, 9, Y(legTop), 2, legH - rUp, legColor);
      dot(ctx, 6, Y(legTop), legColorD); dot(ctx, 10, Y(legTop), legColorD);
      rect(ctx, 5, Y(feetY - lUp), 2, 1, shoes); rect(ctx, 9, Y(feetY - rUp), 2, 1, shoes);
      if (!up) { dot(ctx, 4, Y(feetY - lUp), shoesD); dot(ctx, 11, Y(feetY - rUp), shoesD); }
    }
    // hips / dress
    if (L.legs === 'dress') {
      rect(ctx, 4, Y(hipTop + sh), 8, 2, shirt); rect(ctx, 3, Y(hipTop + sh + 1), 10, 1 + (sit ? 0 : 1), shirt);
      dot(ctx, 12, Y(hipTop + sh + 1), shirtD);
    } else if (!sit) {
      rect(ctx, 4, Y(hipTop), 8, 2, pants);
      rect(ctx, 11, Y(hipTop), 1, 2, pantsD);
      if (!up) dot(ctx, 7, Y(hipTop + 1), pantsD), dot(ctx, 8, Y(hipTop + 1), pantsD);
    }
    // arms
    const armL = sit ? 0 : walkA, armR = -armL;
    const arm = (x, a) => {
      const top = Y(torsoTop) + Math.max(0, a);
      const len = torsoH - Math.abs(a) + (a > 0 ? 0 : 0);
      rect(ctx, x, top, 2, 2, shirt);
      rect(ctx, x, top + 2, 2, Math.max(1, len - 2), skin);
      dot(ctx, x + 1, top + 2, skinD);
    };
    arm(2, armL); arm(12, armR);
    // torso
    rect(ctx, 4, Y(torsoTop), 8, torsoH, shirt);
    rect(ctx, 11, Y(torsoTop), 1, torsoH, shirtD);
    rect(ctx, 4, Y(torsoTop + torsoH - 1), 8, 1, shirtD);
    dot(ctx, 4, Y(torsoTop), shirtL);
    if (!up) { dot(ctx, 7, Y(torsoTop), skin); dot(ctx, 8, Y(torsoTop), skin); }
    if (L.vest) {
      rect(ctx, 4, Y(torsoTop), 2, torsoH, L.vest); rect(ctx, 10, Y(torsoTop), 2, torsoH, L.vest);
      if (up) rect(ctx, 4, Y(torsoTop), 8, torsoH - 1, L.vest);
      rect(ctx, 4, Y(torsoTop + 3), up ? 8 : 2, 1, '#e3e6e8'); if (!up) rect(ctx, 10, Y(torsoTop + 3), 2, 1, '#e3e6e8');
    }
    if (towel) {
      rect(ctx, 4, Y(torsoTop), 8, 1, '#5fb3d9');
      if (!up) { rect(ctx, 5, Y(torsoTop + 1), 2, 2, '#5fb3d9'); rect(ctx, 9, Y(torsoTop + 1), 2, 2, '#4a9ac2'); }
    }
    // head
    const hy = Y(headTop);
    rect(ctx, 4, hy, 8, 8, skin);
    dot(ctx, 4, hy, 'rgba(0,0,0,0)');
    ctx.clearRect(4, hy, 1, 1); ctx.clearRect(11, hy, 1, 1); ctx.clearRect(4, hy + 7, 1, 1); ctx.clearRect(11, hy + 7, 1, 1);
    rect(ctx, 11, hy + 1, 1, 6, skinD);
    if (up) {
      // back of the head
      if (L.hairStyle === 'receding') {
        rect(ctx, 4, hy + 1, 8, 5, hair); rect(ctx, 5, hy, 6, 1, hair);
      } else {
        rect(ctx, 4, hy + 1, 8, 6, hair); rect(ctx, 5, hy, 6, 1, hair);
        if (L.hairStyle === 'long') rect(ctx, 4, hy + 6, 8, 4, hair);
        rect(ctx, 5, hy + 1, 2, 1, hairL);
      }
      if (L.hairStyle === 'ponytail') { rect(ctx, 7, hy + 5, 2, 5, hair); dot(ctx, 8, hy + 9, hairD); }
      if (L.hairStyle === 'bun') rect(ctx, 6, hy - 2, 4, 3, hair);
      if (L.headband) rect(ctx, 4, hy + 2, 8, 1, L.headband);
    } else {
      // face
      const eye = '#2a1d1b';
      dot(ctx, 6, hy + 4, eye); dot(ctx, 6, hy + 5, eye); dot(ctx, 9, hy + 4, eye); dot(ctx, 9, hy + 5, eye);
      if (L.flush || opts.flush) { dot(ctx, 5, hy + 6, '#e0675a'); dot(ctx, 10, hy + 6, '#e0675a'); }
      if (L.glasses) { dot(ctx, 5, hy + 4, '#3b2a20'); dot(ctx, 7, hy + 4, '#3b2a20'); dot(ctx, 8, hy + 4, '#3b2a20'); dot(ctx, 10, hy + 4, '#3b2a20'); }
      if (L.beard) { rect(ctx, 5, hy + 6, 6, 1, L.beard); rect(ctx, 6, hy + 7, 4, 1, L.beard); }
      // hair
      switch (L.hairStyle) {
        case 'receding':
          rect(ctx, 4, hy + 1, 1, 3, hair); rect(ctx, 11, hy + 1, 1, 3, hair); rect(ctx, 5, hy, 6, 1, hair);
          break;
        case 'long':
          rect(ctx, 5, hy - 1, 6, 1, hair); rect(ctx, 4, hy, 8, 3, hair);
          rect(ctx, 3, hy + 1, 2, 8, hair); rect(ctx, 11, hy + 1, 2, 8, hair);
          dot(ctx, 3, hy + 9, hairD); dot(ctx, 12, hy + 9, hairD);
          rect(ctx, 5, hy, 2, 1, hairL);
          break;
        default:
          rect(ctx, 5, hy - 1, 6, 1, hair); rect(ctx, 4, hy, 8, 3, hair);
          dot(ctx, 4, hy + 3, hair); dot(ctx, 5, hy + 3, hair); dot(ctx, 7, hy + 3, hair); dot(ctx, 8, hy + 3, hair); dot(ctx, 10, hy + 3, hair); dot(ctx, 11, hy + 3, hair);
          rect(ctx, 4, hy + 4, 1, 2, hair); rect(ctx, 11, hy + 4, 1, 2, hair);
          rect(ctx, 5, hy, 2, 1, hairL);
          if (L.hairStyle === 'ponytail') rect(ctx, 12, hy + 2, 1, 4, hair);
          if (L.hairStyle === 'bun') rect(ctx, 6, hy - 3, 4, 2, hair);
      }
      if (L.headband) rect(ctx, 4, hy + 2, 8, 1, L.headband);
    }
    drawHat(ctx, hat, hy, up ? 'up' : 'down', L);
  } else {
    // side view, facing right
    const back = sit ? 0 : walkA;
    // back leg
    if (sit) {
      rect(ctx, 6, Y(hipTop + sh), 6, 2, pants);
      rect(ctx, 10, Y(hipTop + sh + 2), 2, feetY - hipTop - sh - 2, legColor);
      rect(ctx, 10, Y(feetY), 3, 1, shoes);
    } else if (walkA !== 0) {
      rect(ctx, 5, Y(legTop), 2, legH, legColorD); rect(ctx, 4, Y(feetY), 3, 1, shoesD);
      rect(ctx, 9, Y(legTop), 2, legH, legColor); rect(ctx, 9, Y(feetY), 3, 1, shoes);
    } else {
      rect(ctx, 7, Y(legTop), 2, legH, legColor); rect(ctx, 7, Y(feetY), 3, 1, shoes);
    }
    // far arm
    if (!sit) {
      rect(ctx, 7 - back, Y(torsoTop + 2), 2, torsoH - 2, skinD);
    }
    if (L.legs === 'dress') rect(ctx, 5, Y(hipTop + sh), 7, sit ? 2 : 3, shirt);
    else if (!sit) { rect(ctx, 5, Y(hipTop), 6, 2, pants); rect(ctx, 10, Y(hipTop), 1, 2, pantsD); }
    rect(ctx, 5, Y(torsoTop), 6, torsoH, shirt);
    rect(ctx, 10, Y(torsoTop), 1, torsoH, shirtD);
    rect(ctx, 5, Y(torsoTop + torsoH - 1), 6, 1, shirtD);
    if (L.vest) { rect(ctx, 5, Y(torsoTop), 6, torsoH - 1, L.vest); rect(ctx, 5, Y(torsoTop + 3), 6, 1, '#e3e6e8'); }
    if (towel) { rect(ctx, 5, Y(torsoTop), 6, 1, '#5fb3d9'); rect(ctx, 9, Y(torsoTop + 1), 2, 2, '#5fb3d9'); }
    // near arm
    const a = sit ? 0 : -walkA;
    rect(ctx, 7, Y(torsoTop), 2, 2, shirtD);
    rect(ctx, 7 + a, Y(torsoTop + 2), 2, torsoH - 2, skin);
    dot(ctx, 8 + a, Y(torsoTop + 2), skinD);
    // head
    const hy = Y(headTop);
    rect(ctx, 5, hy, 7, 8, skin);
    ctx.clearRect(5, hy, 1, 1); ctx.clearRect(11, hy, 1, 1); ctx.clearRect(5, hy + 7, 1, 1); ctx.clearRect(11, hy + 7, 1, 1);
    dot(ctx, 12, hy + 4, skin);
    dot(ctx, 10, hy + 4, '#2a1d1b'); dot(ctx, 10, hy + 5, '#2a1d1b');
    if (L.flush || opts.flush) dot(ctx, 10, hy + 6, '#e0675a');
    if (L.glasses) { dot(ctx, 9, hy + 4, '#3b2a20'); dot(ctx, 11, hy + 4, '#3b2a20'); rect(ctx, 6, hy + 4, 3, 1, '#3b2a20'); }
    if (L.beard) { rect(ctx, 7, hy + 6, 4, 2, L.beard); }
    switch (L.hairStyle) {
      case 'receding':
        rect(ctx, 6, hy, 5, 1, hair); rect(ctx, 5, hy + 1, 3, 4, hair);
        break;
      case 'long':
        rect(ctx, 6, hy - 1, 5, 1, hair); rect(ctx, 5, hy, 7, 3, hair); rect(ctx, 4, hy + 1, 4, 9, hair);
        dot(ctx, 4, hy + 9, hairD);
        rect(ctx, 6, hy, 2, 1, hairL);
        break;
      default:
        rect(ctx, 6, hy - 1, 5, 1, hair); rect(ctx, 5, hy, 7, 3, hair); rect(ctx, 5, hy + 3, 3, 3, hair);
        dot(ctx, 11, hy + 3, hair);
        rect(ctx, 6, hy, 2, 1, hairL);
        if (L.hairStyle === 'ponytail') { rect(ctx, 3, hy + 2, 2, 2, hair); rect(ctx, 2, hy + 4, 2, 3, hair); dot(ctx, 2, hy + 7, hairD); }
        if (L.hairStyle === 'bun') rect(ctx, 3, hy + 1, 3, 3, hair);
    }
    if (L.headband) rect(ctx, 5, hy + 2, 7, 1, L.headband);
    drawHat(ctx, hat, hy, 'right', L);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return outline(c);
}

function drawHat(ctx, hat, hy, dir, L) {
  if (!hat) return;
  if (hat === 'straw') {
    const s = '#e2c477', sD = '#c7a65a', band = '#b0413e';
    if (dir === 'right') {
      rect(ctx, 6, hy - 3, 6, 3, s); rect(ctx, 6, hy - 1, 6, 1, band);
      rect(ctx, 2, hy, 14, 1, s); rect(ctx, 3, hy + 1, 12, 1, sD);
    } else {
      rect(ctx, 5, hy - 3, 6, 3, s); rect(ctx, 5, hy - 1, 6, 1, band);
      rect(ctx, 1, hy, 14, 2, s); rect(ctx, 2, hy + 2, 12, 1, sD);
      dot(ctx, 6, hy - 3, lighten(s, 0.3));
    }
  } else if (hat === 'cap') {
    const cc = L.capColor || '#c9452f', cD = darken(cc, 0.25);
    if (dir === 'right') {
      rect(ctx, 5, hy - 1, 7, 3, cc); rect(ctx, 11, hy + 2, 4, 1, cD);
    } else {
      rect(ctx, 4, hy - 1, 8, 3, cc); dot(ctx, 5, hy - 1, lighten(cc, 0.3));
      if (dir === 'down') rect(ctx, 4, hy + 2, 8, 1, cD);
    }
  } else if (hat === 'hardhat') {
    const y = '#f2c230', yD = '#c99a1e';
    if (dir === 'right') {
      rect(ctx, 5, hy - 2, 7, 4, y); rect(ctx, 4, hy + 2, 10, 1, yD); dot(ctx, 6, hy - 2, '#fbe58a');
    } else {
      rect(ctx, 4, hy - 2, 8, 4, y); rect(ctx, 3, hy + 2, 10, 1, yD); rect(ctx, 7, hy - 2, 2, 4, '#e0b020'); dot(ctx, 5, hy - 1, '#fbe58a');
    }
  }
}

function makePersonSet(look, opts = {}) {
  const set = {};
  for (const dir of ['down', 'up', 'right']) set[dir] = [0, 1, 2].map(f => drawPerson(look, dir, f, opts));
  set.left = set.right.map(flipX);
  set.sit = { down: drawPerson(look, 'down', 0, { ...opts, pose: 'sit' }), right: drawPerson(look, 'right', 0, { ...opts, pose: 'sit' }) };
  set.sit.left = flipX(set.sit.right);
  return set;
}

function makePortrait(look, size = 64) {
  const src = drawPerson(look, 'down', 0, {});
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  // head and shoulders
  ctx.drawImage(src, 1, 0, 18, 18, 0, 4, size, size);
  return c;
}

// ---------------------------------------------------------------------------
// trees

function makeTree(v) {
  const w = 60, h = 64;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const R = rng(1000 + v * 77);
  const cx = 30, base = 61;

  // trunk with a little root flare, west side lit
  const bark = '#5b4030', barkL = '#7f5c40', barkD = '#3c2a1f';
  for (let y = 44; y <= base; y++) {
    const flare = y > base - 4 ? (y - (base - 4)) : 0;
    const x0 = cx - 4 - flare, x1 = cx + 3 + flare;
    rect(ctx, x0, y, x1 - x0 + 1, 1, bark);
    dot(ctx, x0, y, barkL); dot(ctx, x0 + 1, y, barkL);
    dot(ctx, x1, y, barkD); dot(ctx, x1 - 1, y, barkD);
    if (hash(y, v, 1) < 0.35) dot(ctx, cx - 1 + ((hash(y, v, 2) * 3) | 0), y, barkD);
  }
  // main limbs
  for (let i = 0; i < 8; i++) {
    rect(ctx, cx - 4 - i, 45 - i, 3, 2, i < 2 ? bark : barkD);
    rect(ctx, cx + 1 + i, 45 - i, 3, 2, barkD);
  }

  // canopy blobs
  const cy0 = 29;
  const blobs = [{ x: cx, y: cy0, r: v === 2 ? 17 : 18, ry: v === 2 ? 15 : 14 }];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R() * 0.5;
    const rr = 7 + R() * 5;
    blobs.push({ x: cx + Math.cos(a) * (v === 1 ? 17 : 20), y: cy0 + Math.sin(a) * 11, r: rr, ry: rr * 0.85 });
  }
  const inside = (x, y) => {
    let best = -1, bb = null;
    for (const b of blobs) {
      const dx = (x - b.x) / b.r, dy = (y - b.y) / b.ry;
      const d = 1 - (dx * dx + dy * dy);
      if (d > best) { best = d; bb = b; }
    }
    return best > 0 ? { d: best, b: bb } : null;
  };
  const tones = v === 2
    ? ['#24432a', '#2f5a32', '#3f7339', '#579044', '#77ab52']
    : ['#213f27', '#2c552e', '#3b6c34', '#4f863d', '#6fa14c'];
  for (let y = 2; y < 50; y++) {
    for (let x = 1; x < w - 1; x++) {
      const hit = inside(x, y);
      if (!hit) continue;
      const b = hit.b;
      const nx = (x - b.x) / b.r, ny = (y - b.y) / b.ry;
      let lit = -(nx * 0.75 + ny * 0.6) * 0.55 + hit.d * 0.45;
      lit += (noise2(x / 3.2, y / 3.2, 300 + v) - 0.5) * 0.55;
      lit += (hash(x, y, 301 + v) - 0.5) * 0.12;
      // darker underside where the canopy ends
      if (!inside(x, y + 3)) lit -= 0.35;
      const t = lit > 0.42 ? 4 : lit > 0.2 ? 3 : lit > -0.02 ? 2 : lit > -0.25 ? 1 : 0;
      let col = tones[t];
      if (v === 2 && t >= 2 && hash(x, y, 302) < 0.12) col = hash(x, y, 303) < 0.5 ? '#e58fb4' : '#f4bcd3';
      dot(ctx, x, y, col);
    }
  }
  return outline(c, '#1d2a1c');
}

// ---------------------------------------------------------------------------
// buildings

function shingleRoof(ctx, x, y, w, h, base) {
  const ridge = Math.max(3, Math.round(h * 0.34));
  const north = lighten(base, 0.12), northD = darken(north, 0.08);
  for (let j = 0; j < ridge; j++) {
    rect(ctx, x, y + j, w, 1, j % 2 ? northD : north);
  }
  const dk = darken(base, 0.25), lt = lighten(base, 0.08);
  for (let j = ridge; j < h; j++) {
    const row = ((j - ridge) / 3) | 0;
    const line = (j - ridge) % 3 === 2;
    for (let i = 0; i < w; i++) {
      let col = base;
      if (line) col = dk;
      else if ((i + row * 3) % 6 === 0) col = dk;
      else if (hash(((i + row * 3) / 6) | 0, row, 400) < 0.2) col = lt;
      dot(ctx, x + i, y + j, col);
    }
  }
  rect(ctx, x, y + ridge - 1, w, 1, lighten(base, 0.3));
  rect(ctx, x, y, 1, h, lighten(base, 0.15));
  rect(ctx, x + w - 1, y, 1, h, darken(base, 0.3));
  rect(ctx, x, y + h - 1, w, 1, darken(base, 0.45));
}

function windowPane(ctx, x, y, w, h, trim = '#efe8da', opts = {}) {
  rect(ctx, x, y, w, h, trim);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, opts.glass || '#4f7f98');
  rect(ctx, x + 1, y + 1, w - 2, Math.floor((h - 2) / 2), opts.glassL || '#6f9fb6');
  for (let i = 0; i < Math.min(w, h) - 3; i++) dot(ctx, x + 2 + i, y + h - 3 - i, '#a9cfdf');
  if (!opts.noMullion) {
    rect(ctx, x + (w >> 1), y + 1, 1, h - 2, trim);
    rect(ctx, x + 1, y + (h >> 1), w - 2, 1, trim);
  }
  rect(ctx, x - 1, y + h, w + 2, 1, darken(trim, 0.25));
}

function makeHouse(b) {
  const fw = b.w * TILE, fh = b.h * TILE;
  const c = makeCanvas(fw + 4, fh + 10);
  const ctx = c.getContext('2d');
  const ox = 2, oy = 10;
  const wallH = 22;
  const wallTop = oy + fh - wallH;
  const sid = b.siding, sidD = darken(sid, 0.12), sidDD = darken(sid, 0.28);

  // wall
  for (let y = wallTop; y < oy + fh; y++) rect(ctx, ox, y, fw, 1, (y - wallTop) % 3 === 2 ? sidD : sid);
  rect(ctx, ox, wallTop, 1, wallH, lighten(sid, 0.2));
  rect(ctx, ox + fw - 2, wallTop, 2, wallH, sidDD);
  rect(ctx, ox, wallTop, fw, 3, darken(sid, 0.35));
  rect(ctx, ox, oy + fh - 3, fw, 3, '#8d8478'); rect(ctx, ox, oy + fh - 3, fw, 1, '#a59c8f');
  rect(ctx, ox + 1, wallTop + 3, 1, wallH - 6, '#efe8da'); rect(ctx, ox + fw - 3, wallTop + 3, 1, wallH - 6, '#e0d8c8');

  const R = rng(b.seed || 1);
  const doorColors = ['#7a3f35', '#355c7d', '#3f6b4a', '#8a6a3a', '#5a3f6b'];
  const winY = wallTop + 6;
  let doorX = null;
  if (b.door) {
    doorX = ox + b.door * TILE - 5;
    const dc = doorColors[(R() * doorColors.length) | 0];
    rect(ctx, doorX - 1, wallTop + 4, 12, 16, '#efe8da');
    rect(ctx, doorX, wallTop + 5, 10, 15, dc);
    rect(ctx, doorX + 1, wallTop + 6, 3, 5, darken(dc, 0.25)); rect(ctx, doorX + 6, wallTop + 6, 3, 5, darken(dc, 0.25));
    rect(ctx, doorX + 1, wallTop + 13, 3, 5, darken(dc, 0.25)); rect(ctx, doorX + 6, wallTop + 13, 3, 5, darken(dc, 0.25));
    dot(ctx, doorX + 8, wallTop + 12, '#e8c14a');
    rect(ctx, doorX - 2, oy + fh - 2, 14, 2, '#b8ad9e');
    dot(ctx, doorX - 3, wallTop + 6, '#f2e6b0'); dot(ctx, doorX - 3, wallTop + 7, '#3b2a20');
  }
  // windows, skipping the door
  const slots = [];
  for (let x = ox + 6; x + 12 <= ox + fw - 4; x += 20) slots.push(x);
  let acDone = false;
  for (const x of slots) {
    if (doorX !== null && x + 12 > doorX - 4 && x < doorX + 14) continue;
    windowPane(ctx, x, winY, 12, 10);
    rect(ctx, x - 3, winY, 2, 10, darken(b.roof, 0.1)); rect(ctx, x + 13, winY, 2, 10, darken(b.roof, 0.1));
    if (!acDone && R() < 0.5) {
      acDone = true;
      rect(ctx, x + 2, winY + 6, 8, 5, '#cfcac0'); rect(ctx, x + 2, winY + 10, 8, 1, '#8f8a80');
      for (let i = 0; i < 6; i += 2) rect(ctx, x + 3 + i, winY + 7, 1, 3, '#9d978c');
    }
  }
  if (b.home) {
    rect(ctx, doorX + 13, oy + fh - 7, 5, 5, '#b0603e'); rect(ctx, doorX + 12, oy + fh - 11, 7, 5, '#4f863d'); dot(ctx, doorX + 14, oy + fh - 11, '#6fa14c');
  }

  // roof
  const roofH = wallTop - 0 + 2;
  shingleRoof(ctx, 0, 0, fw + 4, roofH, b.roof);
  rect(ctx, 0, roofH, fw + 4, 1, INK);
  if (R() < 0.6) {
    const cx = 10 + ((R() * (fw - 24)) | 0);
    rect(ctx, cx, 0, 6, 7, '#8a4a3a'); rect(ctx, cx, 0, 6, 1, '#6b3a2e'); rect(ctx, cx, 0, 1, 7, '#a65e4a');
    rect(ctx, cx + 1, 2, 4, 1, '#6b3a2e'); rect(ctx, cx + 1, 5, 4, 1, '#6b3a2e');
  }
  rect(ctx, fw - 12, 6, 2, 3, '#7d7a75');

  return { canvas: outline(c), ox: -2, oy: -10 };
}

function flatRoof(ctx, x, y, w, h, seed, units = 2) {
  const R = rng(seed);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const r = hash(x + i, y + j, seed);
      dot(ctx, x + i, y + j, r < 0.08 ? '#a39883' : r > 0.94 ? '#c9bfab' : '#b6ab96');
    }
  rect(ctx, x, y, w, 2, '#ddd3bf'); rect(ctx, x, y, 2, h, '#d3c9b5');
  rect(ctx, x + w - 2, y, 2, h, '#9c917d'); rect(ctx, x, y + h - 2, w, 2, '#9c917d');
  rect(ctx, x + 2, y + 2, w - 4, 1, '#958a76');
  for (let sx = x + 14; sx < x + w - 4; sx += 18) rect(ctx, sx, y + 3, 1, h - 5, '#c4b9a4');
  if (w > 60) {
    const hx = x + w - 22 - ((R() * 20) | 0), hy = y + h - 14;
    rect(ctx, hx, hy, 9, 7, '#8a7f6b'); rect(ctx, hx, hy, 9, 1, '#a69b86'); rect(ctx, hx + 1, hy + 2, 7, 4, '#9c917d');
  }
  for (let k = 0; k < 3; k++) {
    const vx = x + 6 + ((R() * (w - 14)) | 0), vy = y + 5 + ((R() * Math.max(1, h - 12)) | 0);
    rect(ctx, vx, vy, 3, 3, '#6f675c'); dot(ctx, vx + 1, vy + 1, '#3f3a34'); rect(ctx, vx + 3, vy + 1, 2, 2, '#9c917d');
  }
  for (let k = 0; k < units; k++) {
    const ux = x + 8 + ((R() * (w - 28)) | 0), uy = y + 4 + ((R() * Math.max(1, h - 16)) | 0);
    rect(ctx, ux + 3, uy + 3, 12, 9, '#8d826e');
    rect(ctx, ux, uy, 12, 9, '#cfccc5'); rect(ctx, ux, uy + 7, 12, 2, '#a3a099'); rect(ctx, ux, uy, 1, 9, '#e4e1da');
    for (let a = 0; a < 6.28; a += 0.4) dot(ctx, Math.round(ux + 6 + Math.cos(a) * 3), Math.round(uy + 4 + Math.sin(a) * 2), '#6f6c66');
    dot(ctx, ux + 6, uy + 4, '#4a4844');
  }
}

function makeShop(b) {
  const fw = b.w * TILE, fh = b.h * TILE;
  const c = makeCanvas(fw + 4, fh + 6);
  const ctx = c.getContext('2d');
  const ox = 2, oy = 6;
  const wallH = 36;
  const wallTop = oy + fh - wallH;
  flatRoof(ctx, ox - 2, 0, fw + 4, wallTop + 1, b.seed * 13);
  // stucco
  for (let y = wallTop; y < oy + fh; y++)
    for (let x = ox; x < ox + fw; x++)
      dot(ctx, x, y, hash(x, y, b.seed) < 0.1 ? darken(b.wall, 0.06) : b.wall);
  rect(ctx, ox, wallTop, 1, wallH, lighten(b.wall, 0.2));
  rect(ctx, ox + fw - 2, wallTop, 2, wallH, darken(b.wall, 0.22));
  // sign band
  rect(ctx, ox, wallTop + 1, fw, 9, b.trim);
  rect(ctx, ox, wallTop + 9, fw, 1, darken(b.trim, 0.3));
  const tw = textWidth(b.sign);
  drawTextShadow(ctx, b.sign, ox + ((fw - tw) >> 1), wallTop + 3, '#f6edd6', darken(b.trim, 0.4));
  // storefront
  const sy = wallTop + 15, sh = wallH - 18;
  const doorX = ox + ((fw - 10) >> 1) + (b.sign === 'LAUNDRY' ? 20 : 0);
  for (let x = ox + 4; x < ox + fw - 4; x += 22) {
    const ww = Math.min(18, ox + fw - 4 - x);
    if (x + ww > doorX - 2 && x < doorX + 12) continue;
    windowPane(ctx, x, sy, ww, sh, '#5a5048', { glass: '#2f5262', glassL: '#3d6576', noMullion: true });
  }
  rect(ctx, doorX - 1, sy - 1, 12, sh + 3, '#5a5048');
  rect(ctx, doorX, sy, 10, sh + 2, '#3d6576'); rect(ctx, doorX + 4, sy, 1, sh + 2, '#5a5048');
  dot(ctx, doorX + 3, sy + 7, '#d9d4c8'); dot(ctx, doorX + 6, sy + 7, '#d9d4c8');
  rect(ctx, ox, oy + fh - 2, fw, 2, '#8d8478');

  const poster = (x, y, txt, bg, fg) => {
    const w = textWidth(txt) + 4;
    rect(ctx, x, y, w, 9, bg); drawText(ctx, txt, x + 2, y + 2, fg);
  };
  if (b.sign === 'CORNER STORE') {
    poster(ox + 7, sy + 2, 'ICE', '#f1ece0', '#2f6fb0');
    poster(ox + fw - 30, sy + 2, 'COLD', '#f1ece0', '#c9452f');
    rect(ctx, ox + 30, sy + 8, 6, 5, '#e8743b'); rect(ctx, ox + 37, sy + 9, 5, 4, '#3d8fd6');
    poster(ox + fw - 30, sy - 10 + 0, 'OPEN', '#c9452f', '#f6edd6');
  }
  if (b.sign === 'TAQUERIA') {
    const cols = ['#e8743b', '#3d8fd6', '#f2c94c', '#e86a8a', '#7fbf4a'];
    for (let x = ox + 2, i = 0; x < ox + fw - 4; x += 6, i++) {
      rect(ctx, x, wallTop + 11, 4, 3, cols[i % cols.length]);
      dot(ctx, x + 1, wallTop + 13, b.wall); dot(ctx, x + 2, wallTop + 12, b.wall);
    }
  }
  if (b.sign === 'LAUNDRY') {
    for (let i = 0; i < 3; i++) {
      const x = ox + 10 + i * 14, y = sy + 3;
      for (let a = 0; a < 6.28; a += 0.3) dot(ctx, Math.round(x + Math.cos(a) * 4), Math.round(y + 4 + Math.sin(a) * 4), '#d8dde0');
    }
  }
  return { canvas: outline(c), ox: -2, oy: -6 };
}

function makeLibrary(b) {
  const fw = b.w * TILE, fh = b.h * TILE;
  const c = makeCanvas(fw + 4, fh + 6);
  const ctx = c.getContext('2d');
  const ox = 2, oy = 6;
  const wallH = 48;
  const wallTop = oy + fh - wallH;
  flatRoof(ctx, ox - 2, 0, fw + 4, wallTop + 1, 4242, 3);
  // skylight
  rect(ctx, ox + 70, 12, 40, 14, '#6f8fa0'); rect(ctx, ox + 70, 12, 40, 1, '#cfe2ea');
  for (let i = 0; i < 40; i += 8) rect(ctx, ox + 70 + i, 12, 1, 14, '#4b5f6a');

  // brick
  for (let y = wallTop; y < oy + fh; y++) {
    const row = ((y - wallTop) / 4) | 0;
    for (let x = ox; x < ox + fw; x++) {
      const mortar = (y - wallTop) % 4 === 3 || (x + (row % 2) * 4) % 8 === 0;
      const v = hash(((x + (row % 2) * 4) / 8) | 0, row, 77);
      dot(ctx, x, y, mortar ? '#8a4a39' : v < 0.3 ? '#a2533d' : v < 0.75 ? '#ad5c44' : '#b8664c');
    }
  }
  rect(ctx, ox, wallTop, 1, wallH, '#c77a5e');
  rect(ctx, ox + fw - 2, wallTop, 2, wallH, '#7d3e2f');
  // cornice + sign
  rect(ctx, ox - 2, wallTop - 1, fw + 4, 4, '#e8dfcc'); rect(ctx, ox - 2, wallTop + 3, fw + 4, 1, '#a89e8a');
  const sign = 'MORENO BRANCH LIBRARY';
  rect(ctx, ox + ((fw - textWidth(sign)) >> 1) - 4, wallTop + 6, textWidth(sign) + 8, 9, '#3b2a20');
  drawText(ctx, sign, ox + ((fw - textWidth(sign)) >> 1), wallTop + 8, '#f1e6c8');

  // windows
  const doorL = ox + (b.doorX - b.x) * TILE;
  for (const x of [ox + 8, ox + 28, ox + 48, ox + 128, ox + 148, ox + 168]) {
    windowPane(ctx, x, wallTop + 20, 14, 20, '#e8dfcc');
    rect(ctx, x - 1, wallTop + 18, 16, 2, '#e8dfcc');
  }
  // entrance
  rect(ctx, doorL - 8, wallTop + 16, 48, wallH - 16, '#e8dfcc');
  rect(ctx, doorL - 6, wallTop + 18, 4, wallH - 18, '#f4ede0'); rect(ctx, doorL - 3, wallTop + 18, 1, wallH - 18, '#bdb3a0');
  rect(ctx, doorL + 34, wallTop + 18, 4, wallH - 18, '#f4ede0'); rect(ctx, doorL + 37, wallTop + 18, 1, wallH - 18, '#bdb3a0');
  rect(ctx, doorL, wallTop + 22, 32, wallH - 22, '#7a8a8f');
  rect(ctx, doorL + 1, wallTop + 23, 14, wallH - 23, '#a7dcef'); rect(ctx, doorL + 17, wallTop + 23, 14, wallH - 23, '#a7dcef');
  rect(ctx, doorL + 1, wallTop + 23, 14, 6, '#c9ecf7'); rect(ctx, doorL + 17, wallTop + 23, 14, 6, '#c9ecf7');
  for (let i = 0; i < 8; i++) { dot(ctx, doorL + 3 + i, wallTop + 40 - i, '#e2f6fc'); dot(ctx, doorL + 19 + i, wallTop + 40 - i, '#e2f6fc'); }
  rect(ctx, doorL + 13, wallTop + 32, 1, 5, '#5a6a70'); rect(ctx, doorL + 18, wallTop + 32, 1, 5, '#5a6a70');

  // the banner
  const banner = 'COOLING CENTER';
  const bw = textWidth(banner) + 18;
  const bx = doorL + 16 - (bw >> 1), by = wallTop + 16 - 13;
  rect(ctx, bx, by + 10, bw, 11, '#2f6fb0'); rect(ctx, bx, by + 10, bw, 1, '#5b95cf'); rect(ctx, bx, by + 20, bw, 1, '#1f4f82');
  dot(ctx, bx, by + 21, '#1f4f82'); dot(ctx, bx + bw - 1, by + 21, '#1f4f82');
  // snowflake
  const sx = bx + 5, sy = by + 15;
  for (const [dx, dy] of [[0, 0], [-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, 1], [1, -1], [-1, 1]]) dot(ctx, sx + dx, sy + dy, '#f4fbff');
  drawText(ctx, banner, bx + 10, by + 13, '#f4fbff');
  rect(ctx, ox, oy + fh - 2, fw, 2, '#8d8478');
  return { canvas: outline(c), ox: -2, oy: -6 };
}

function makeGrocery(b) {
  const fw = b.w * TILE, fh = b.h * TILE;
  const c = makeCanvas(fw + 4, fh + 6);
  const ctx = c.getContext('2d');
  const ox = 2, oy = 6, wallH = 34, wallTop = oy + fh - wallH;
  flatRoof(ctx, ox - 2, 0, fw + 4, wallTop + 1, 999, 3);
  for (let y = wallTop; y < oy + fh; y++)
    for (let x = ox; x < ox + fw; x++) dot(ctx, x, y, hash(x, y, 5) < 0.1 ? '#d9c7a0' : '#e6d5b0');
  rect(ctx, ox, wallTop, 1, wallH, '#f3e7c9'); rect(ctx, ox + fw - 2, wallTop, 2, wallH, '#b9a67f');
  rect(ctx, ox, wallTop + 2, fw, 11, '#c03a2b'); rect(ctx, ox, wallTop + 12, fw, 1, '#8a2a1f');
  const s = 'GROCERY';
  // big double-size letters
  const tmp = makeCanvas(textWidth(s), 5);
  drawText(tmp.getContext('2d'), s, 0, 0, '#fff4dc');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, ox + ((fw - tmp.width * 2) >> 1), wallTop + 3, tmp.width * 2, 10);
  const sy = wallTop + 16, sh = wallH - 18;
  const doorX = ox + ((fw - 24) >> 1);
  for (let x = ox + 4; x < ox + fw - 4; x += 20) {
    if (x + 18 > doorX - 2 && x < doorX + 26) continue;
    windowPane(ctx, x, sy, 18, sh, '#7d756b', { glass: '#2f5262', glassL: '#3d6576', noMullion: true });
  }
  rect(ctx, doorX, sy - 1, 24, sh + 3, '#7d756b'); rect(ctx, doorX + 1, sy, 22, sh + 2, '#4f7f98'); rect(ctx, doorX + 12, sy, 1, sh + 2, '#7d756b');
  rect(ctx, ox + 10, sy + 3, 19, 7, '#f2c94c'); drawText(ctx, 'SALE', ox + 12, sy + 4, '#c03a2b');
  rect(ctx, ox, oy + fh - 2, fw, 2, '#8d8478');
  return { canvas: outline(c), ox: -2, oy: -6 };
}

function makeApartments(b) {
  const fw = b.w * TILE, fh = b.h * TILE;
  const c = makeCanvas(fw + 4, fh + 6);
  const ctx = c.getContext('2d');
  const ox = 2, oy = 6, wallH = 44, wallTop = oy + fh - wallH;
  flatRoof(ctx, ox - 2, 0, fw + 4, wallTop + 1, 555, 2);
  for (let y = wallTop; y < oy + fh; y++)
    for (let x = ox; x < ox + fw; x++) dot(ctx, x, y, (y - wallTop) % 3 === 2 ? '#c4a882' : '#d4b996');
  rect(ctx, ox, wallTop, 1, wallH, '#e6cfae'); rect(ctx, ox + fw - 2, wallTop, 2, wallH, '#a88d6a');
  rect(ctx, ox, wallTop, fw, 3, '#7a5a3e');
  // balcony walkway
  rect(ctx, ox, wallTop + 21, fw, 3, '#8a7a66'); rect(ctx, ox, wallTop + 20, fw, 1, '#5a4a3a');
  for (let x = ox; x < ox + fw; x += 4) rect(ctx, x, wallTop + 16, 1, 5, '#5a4a3a');
  rect(ctx, ox, wallTop + 16, fw, 1, '#5a4a3a');
  for (let i = 0; i < 6; i++) {
    const x = ox + 8 + i * 30;
    windowPane(ctx, x, wallTop + 5, 10, 9);
    windowPane(ctx, x, wallTop + 28, 10, 9);
    rect(ctx, x + 14, wallTop + 26, 8, 14, '#6b4a3e'); dot(ctx, x + 20, wallTop + 33, '#e8c14a');
    rect(ctx, x + 14, wallTop + 4, 8, 12, '#6b4a3e');
    if (i % 2 === 0) { rect(ctx, x + 1, wallTop + 11, 8, 4, '#cfcac0'); }
  }
  // stairs
  for (let i = 0; i < 7; i++) rect(ctx, ox + fw - 24 + i * 2, wallTop + 22 + i * 3, 8, 2, '#9d8f7c');
  const s = 'BELL APTS';
  rect(ctx, ox + 4, oy + fh - 12, textWidth(s) + 4, 8, '#3b2a20'); drawText(ctx, s, ox + 6, oy + fh - 10, '#e8dfcc');
  rect(ctx, ox, oy + fh - 2, fw, 2, '#8d8478');
  return { canvas: outline(c), ox: -2, oy: -6 };
}

function makeKiosk(b) {
  const fw = b.w * TILE, fh = b.h * TILE;
  const c = makeCanvas(fw + 6, fh + 12);
  const ctx = c.getContext('2d');
  const ox = 3, oy = 12;
  const wallTop = oy + fh - 26;
  // walls
  for (let y = wallTop; y < oy + fh; y++) rect(ctx, ox, y, fw, 1, (y - wallTop) % 4 === 3 ? '#5fa9be' : '#7fc4d8');
  rect(ctx, ox, wallTop, 1, oy + fh - wallTop, '#a6dcea'); rect(ctx, ox + fw - 2, wallTop, 2, oy + fh - wallTop, '#4a8da1');
  // service window (the vendor shows through it)
  rect(ctx, ox + 8, wallTop + 6, fw - 16, 11, '#2b2430');
  rect(ctx, ox + 6, wallTop + 17, fw - 12, 2, '#efe8da');
  // flavor jugs
  const jugs = ['#c9452f', '#3d8fd6', '#7fbf4a', '#f2c94c', '#e86a8a'];
  jugs.forEach((col, i) => { rect(ctx, ox + 9 + i * 6, wallTop + 14, 3, 3, col); });
  // striped roof
  for (let y = 0; y < wallTop - oy + 14; y++) {
    for (let x = 0; x < fw + 6; x++) {
      const inset = Math.max(0, 6 - y);
      if (x < inset || x >= fw + 6 - inset) continue;
      dot(ctx, x, y + 2, ((x / 5) | 0) % 2 ? '#f4ead0' : '#e8743b');
    }
  }
  rect(ctx, 0, wallTop - oy + 15, fw + 6, 1, '#b8562a');
  rect(ctx, ox + 2, 6, fw - 4, 9, '#3b2a20');
  const s = 'SNOWBALLS';
  const cols = ['#f2c94c', '#e86a8a', '#7fd0e8', '#9fdc6a'];
  for (let i = 0; i < s.length; i++) drawText(ctx, s[i], ox + ((fw - textWidth(s)) >> 1) + i * 4, 8, cols[i % 4]);
  return { canvas: outline(c), ox: -3, oy: -12, windowY: wallTop + 6 - oy };
}

function makeBuilding(b) {
  switch (b.kind) {
    case 'house': return makeHouse(b);
    case 'shop': return makeShop(b);
    case 'library': return makeLibrary(b);
    case 'grocery': return makeGrocery(b);
    case 'apartments': return makeApartments(b);
    case 'kiosk': return makeKiosk(b);
  }
}

// ---------------------------------------------------------------------------
// cars

function makeCar(color, dog) {
  const c = makeCanvas(16, 30);
  const ctx = c.getContext('2d');
  const D = darken(color, 0.22), Lc = lighten(color, 0.25);
  // tires
  rect(ctx, 0, 5, 16, 5, '#1e1b20'); rect(ctx, 0, 20, 16, 5, '#1e1b20');
  rect(ctx, 1, 1, 14, 28, color);
  rect(ctx, 1, 1, 1, 28, Lc); rect(ctx, 14, 1, 1, 28, D);
  rect(ctx, 2, 0, 12, 1, color); rect(ctx, 2, 29, 12, 1, color);
  // windshield
  rect(ctx, 2, 7, 12, 5, '#2b3a4a'); rect(ctx, 3, 8, 3, 1, '#7d93a8'); rect(ctx, 3, 9, 2, 1, '#56708a');
  // roof
  rect(ctx, 3, 12, 10, 8, Lc); rect(ctx, 3, 12, 10, 1, lighten(color, 0.4));
  rect(ctx, 2, 12, 1, 8, '#2b3a4a'); rect(ctx, 13, 12, 1, 8, '#2b3a4a');
  // rear window
  rect(ctx, 2, 20, 12, 4, '#2b3a4a'); rect(ctx, 3, 21, 2, 1, '#56708a');
  // lights
  rect(ctx, 2, 1, 3, 1, '#f3edd3'); rect(ctx, 11, 1, 3, 1, '#f3edd3');
  rect(ctx, 2, 28, 3, 1, '#b8322a'); rect(ctx, 11, 28, 3, 1, '#b8322a');
  // mirrors
  dot(ctx, 0, 9, color); dot(ctx, 15, 9, color);
  if (dog) {
    rect(ctx, 5, 20, 6, 4, '#a8743e'); rect(ctx, 4, 20, 2, 3, '#7a522b'); rect(ctx, 10, 20, 2, 3, '#7a522b');
    dot(ctx, 6, 21, INK); dot(ctx, 9, 21, INK); rect(ctx, 7, 23, 2, 1, '#e8687a');
  }
  return outline(c);
}

// ---------------------------------------------------------------------------
// props

function P(w, h, fn, ink = INK) {
  const c = makeCanvas(w, h);
  fn(c.getContext('2d'), w, h);
  return ink ? outline(c, ink) : c;
}

function makeProps() {
  const S = {};

  S.hedge = P(18, 20, (g) => {
    for (let y = 2; y < 19; y++) for (let x = 1; x < 17; x++) {
      const dx = (x - 8.5) / 8, dy = (y - 11) / 8.5;
      if (dx * dx + dy * dy > 1 + (hash(x, y, 8) - 0.5) * 0.3) continue;
      const lit = -(dx * 0.7 + dy * 0.7) + (noise2(x / 2.5, y / 2.5, 9) - 0.5);
      dot(g, x, y, lit > 0.4 ? '#5f9446' : lit > -0.1 ? '#467a37' : lit > -0.6 ? '#35622d' : '#2a4f25');
    }
  }, '#1d2a1c');

  S.barricade = P(18, 16, (g) => {
    rect(g, 2, 8, 2, 7, '#7a7470'); rect(g, 14, 8, 2, 7, '#7a7470');
    for (let x = 1; x < 17; x++) {
      g.fillStyle = ((x + 0) / 3 | 0) % 2 ? '#f1ece0' : '#e8743b';
      g.fillRect(x, 3, 1, 5);
    }
    rect(g, 1, 7, 16, 1, '#a8522a');
    dot(g, 3, 1, '#f2c94c'); dot(g, 3, 2, '#c99a1e');
  });

  S.slide = P(34, 40, (g) => {
    rect(g, 3, 6, 2, 30, '#b0413e'); rect(g, 12, 6, 2, 30, '#b0413e');
    for (let y = 10; y < 34; y += 4) rect(g, 5, y, 7, 1, '#d9d4c8');
    rect(g, 2, 4, 13, 4, '#e8743b'); rect(g, 2, 4, 13, 1, '#f2a06a');
    for (let i = 0; i < 26; i++) {
      const x = 15 + i * 0.6, y = 6 + i;
      rect(g, Math.round(x), y, 8, 1, i % 3 ? '#cdd3d8' : '#e8edf0');
      dot(g, Math.round(x), y, '#9aa3ab'); dot(g, Math.round(x) + 7, y, '#7d868e');
    }
    rect(g, 26, 31, 8, 3, '#cdd3d8');
  });

  S.swings = P(34, 34, (g) => {
    rect(g, 1, 4, 32, 2, '#3d6fa8'); rect(g, 1, 4, 32, 1, '#6f98c9');
    rect(g, 2, 6, 2, 26, '#3d6fa8'); rect(g, 30, 6, 2, 26, '#3d6fa8');
    for (const x of [9, 21]) {
      rect(g, x, 6, 1, 18, '#7d7a75'); rect(g, x + 5, 6, 1, 18, '#7d7a75');
      rect(g, x - 1, 24, 8, 2, '#2b2b33');
    }
  });

  S.bench = P(18, 14, (g) => {
    rect(g, 1, 2, 16, 3, '#9a6a42'); rect(g, 1, 2, 16, 1, '#b8885c');
    rect(g, 1, 6, 16, 3, '#8a5c38'); rect(g, 1, 6, 16, 1, '#a87a50');
    rect(g, 2, 9, 2, 4, '#3a3a40'); rect(g, 14, 9, 2, 4, '#3a3a40');
  });

  S.hoop = P(20, 44, (g) => {
    rect(g, 9, 14, 3, 29, '#6c6f74'); rect(g, 9, 14, 1, 29, '#9aa0a6');
    rect(g, 2, 2, 16, 12, '#f1ece0'); rect(g, 6, 6, 8, 5, '#c9452f'); rect(g, 7, 7, 6, 3, '#f1ece0');
    rect(g, 6, 13, 8, 1, '#e8743b');
    for (let i = 0; i < 4; i++) { dot(g, 7 + i * 2, 14 + (i % 2), '#efe8da'); dot(g, 7 + i * 2, 16, '#efe8da'); }
  });

  S.nozzle = P(8, 6, (g) => { rect(g, 2, 1, 4, 4, '#cfd6da'); rect(g, 3, 1, 2, 1, '#3d8fd6'); });

  S.parksign = P(46, 22, (g) => {
    rect(g, 8, 12, 2, 10, '#5a3e27'); rect(g, 36, 12, 2, 10, '#5a3e27');
    rect(g, 1, 2, 44, 11, '#6b4a2e'); rect(g, 2, 3, 42, 9, '#8a6a42');
    drawText(g, 'BAYOU PARK', 4, 5, '#f1e6c8');
  });

  S.trash = P(12, 16, (g) => {
    rect(g, 1, 3, 10, 12, '#3f6b4a'); rect(g, 1, 3, 2, 12, '#55875f'); rect(g, 9, 3, 2, 12, '#2c4d35');
    rect(g, 0, 1, 12, 3, '#2c4d35'); rect(g, 1, 7, 10, 1, '#2c4d35');
  });

  S.mailbox = P(10, 18, (g) => {
    rect(g, 4, 8, 2, 10, '#6b4a2e');
    rect(g, 1, 2, 8, 6, '#3a3a40'); rect(g, 1, 2, 8, 2, '#56565e'); rect(g, 8, 3, 1, 3, '#c9452f');
  });

  S.mower = P(18, 16, (g) => {
    rect(g, 2, 7, 12, 7, '#c9452f'); rect(g, 2, 7, 12, 2, '#e06a50'); rect(g, 4, 9, 6, 3, '#3a3a40');
    rect(g, 1, 13, 3, 3, '#1e1b20'); rect(g, 12, 13, 3, 3, '#1e1b20');
    rect(g, 13, 1, 1, 8, '#7d7a75'); rect(g, 11, 1, 6, 1, '#3a3a40');
  });

  S.chair = P(16, 20, (g) => {
    rect(g, 3, 1, 10, 9, '#a07650'); for (let x = 4; x < 13; x += 2) rect(g, x, 2, 1, 8, '#8a6440');
    rect(g, 2, 10, 12, 4, '#b8885c'); rect(g, 3, 14, 2, 5, '#6b4a2e'); rect(g, 11, 14, 2, 5, '#6b4a2e');
    rect(g, 1, 18, 14, 1, '#6b4a2e');
  });

  S.hydrant = P(10, 14, (g) => {
    rect(g, 2, 3, 6, 10, '#e2b13c'); rect(g, 2, 3, 2, 10, '#f2cf6a'); rect(g, 1, 6, 8, 2, '#c99a1e');
    rect(g, 3, 1, 4, 2, '#c99a1e'); rect(g, 1, 12, 8, 2, '#a07a1a');
  });

  S.busstop = P(12, 34, (g) => {
    rect(g, 5, 10, 2, 24, '#6c6f74');
    rect(g, 1, 1, 10, 10, '#2f6fb0'); rect(g, 1, 1, 10, 1, '#5b95cf');
    drawText(g, 'BUS', 0 + 0, 4, '#f1ece0');
  });

  S.picnic = P(34, 18, (g) => {
    rect(g, 1, 3, 32, 6, '#9a6a42'); rect(g, 1, 3, 32, 1, '#b8885c'); rect(g, 1, 6, 32, 1, '#7a5232');
    rect(g, 3, 9, 2, 6, '#6b4a2e'); rect(g, 29, 9, 2, 6, '#6b4a2e');
    rect(g, 0, 12, 34, 3, '#8a5c38');
    rect(g, 16, 0, 2, 10, '#d9d4c8');
  });

  S.planter = P(18, 18, (g) => {
    rect(g, 1, 9, 16, 8, '#c9bfae'); rect(g, 1, 9, 16, 1, '#e2dacb'); rect(g, 15, 9, 2, 8, '#a59b8a');
    for (let y = 1; y < 11; y++) for (let x = 2; x < 16; x++) {
      const dx = (x - 9) / 7, dy = (y - 6) / 5;
      if (dx * dx + dy * dy < 1 + (hash(x, y, 3) - 0.5) * 0.4) dot(g, x, y, hash(x, y, 4) < 0.3 ? '#6fa14c' : dx + dy > 0.2 ? '#35622d' : '#467a37');
    }
    dot(g, 6, 4, '#e86a8a'); dot(g, 11, 5, '#f2c94c'); dot(g, 8, 7, '#e86a8a');
  });

  S.bookdrop = P(14, 18, (g) => {
    rect(g, 1, 3, 12, 14, '#2f6fb0'); rect(g, 1, 3, 3, 14, '#4f8fcf'); rect(g, 1, 1, 12, 3, '#1f4f82');
    rect(g, 3, 6, 8, 2, '#152f50'); drawText(g, 'B', 5, 10, '#f1ece0');
  });

  S.carts = P(34, 18, (g) => {
    rect(g, 1, 14, 32, 2, '#8d877d');
    for (let i = 0; i < 4; i++) {
      const x = 2 + i * 7;
      rect(g, x, 4, 9, 9, '#a9b0b6');
      for (let y = 5; y < 12; y += 2) rect(g, x + 1, y, 7, 1, '#7d868e');
      rect(g, x, 3, 9, 1, '#c03a2b');
    }
  });

  S.lamp = P(16, 52, (g) => {
    rect(g, 7, 6, 2, 46, '#6c6f74'); rect(g, 7, 6, 1, 46, '#9aa0a6');
    rect(g, 2, 2, 12, 4, '#4a4d52'); rect(g, 3, 5, 10, 1, '#e8e2c8');
    rect(g, 5, 49, 6, 3, '#9aa0a6');
  });

  S.framing = P(84, 52, (g) => {
    rect(g, 2, 44, 80, 4, '#c9a26a');
    rect(g, 2, 6, 80, 3, '#c9a26a'); rect(g, 2, 6, 80, 1, '#e2c08a');
    for (let x = 2; x <= 80; x += 6) { rect(g, x, 9, 2, 35, '#d4ae76'); dot(g, x, 9, '#e8c896'); rect(g, x + 1, 9, 1, 35, '#b08654'); }
    rect(g, 30, 9, 14, 35, 'rgba(0,0,0,0)');
    g.clearRect(32, 9, 12, 35);
    rect(g, 30, 9, 16, 3, '#c9a26a');
    // a sheet of plywood leaning on it
    rect(g, 58, 18, 18, 26, '#d9b77c'); for (let i = 0; i < 10; i++) dot(g, 60 + ((hash(i, 1, 5) * 14) | 0), 20 + ((hash(i, 2, 5) * 22) | 0), '#c29a5c');
  });

  S.mixer = P(34, 26, (g) => {
    rect(g, 4, 18, 26, 3, '#4a4d52');
    rect(g, 2, 21, 5, 5, '#1e1b20'); rect(g, 26, 21, 5, 5, '#1e1b20');
    for (let y = 2; y < 18; y++) for (let x = 6; x < 30; x++) {
      const dx = (x - 18) / 12, dy = (y - 10) / 8;
      if (dx * dx + dy * dy < 1) dot(g, x, y, dx < -0.3 ? '#f29a5c' : dy > 0.4 ? '#b8562a' : '#e8743b');
    }
    for (let x = 9; x < 28; x += 5) rect(g, x, 4, 1, 12, '#b8562a');
  });

  S.portapotty = P(16, 32, (g) => {
    rect(g, 1, 4, 14, 27, '#3d6fa8'); rect(g, 1, 4, 3, 27, '#5b8fc8'); rect(g, 12, 4, 3, 27, '#2c5486');
    rect(g, 0, 1, 16, 4, '#e8e2d6'); rect(g, 6, 12, 4, 1, '#2c5486'); rect(g, 11, 16, 1, 4, '#d9d4c8');
  });

  S.pallets = P(34, 20, (g) => {
    for (let k = 0; k < 2; k++) {
      const y = 12 - k * 5;
      rect(g, 1, y, 32, 4, '#b08654'); rect(g, 1, y, 32, 1, '#d4ae76');
      for (let x = 2; x < 32; x += 6) rect(g, x, y + 1, 4, 3, '#8a6440');
    }
    rect(g, 4, 1, 12, 7, '#d9d4c8'); rect(g, 17, 2, 12, 6, '#cfc8ba'); drawText(g, 'MIX', 6, 2, '#8a8478');
  });

  S.cone = P(10, 12, (g) => {
    rect(g, 4, 1, 2, 2, '#e8743b'); rect(g, 3, 3, 4, 2, '#f1ece0'); rect(g, 3, 5, 4, 2, '#e8743b'); rect(g, 2, 7, 6, 2, '#e8743b');
    rect(g, 1, 9, 8, 2, '#c9562a');
  });

  S.bucket = P(12, 12, (g) => {
    rect(g, 2, 2, 8, 9, '#e8743b'); rect(g, 2, 2, 2, 9, '#f29a5c'); rect(g, 1, 1, 10, 2, '#c9562a');
    drawText(g, 'H', 5, 5, '#f1ece0');
  });

  S.freebox = P(18, 18, (g) => {
    rect(g, 1, 6, 16, 11, '#c49a62'); rect(g, 1, 6, 16, 2, '#d8b37e'); rect(g, 14, 6, 3, 11, '#a37c48');
    rect(g, 0, 4, 6, 3, '#d8b37e'); rect(g, 12, 4, 6, 3, '#a37c48');
    drawText(g, 'FREE', 2, 10, '#3b2a20');
  });
  S.freeboxHat = P(18, 20, (g) => {
    g.drawImage(S.freebox, 0, 2);
    rect(g, 2, 3, 14, 2, '#e2c477'); rect(g, 5, 0, 8, 3, '#e2c477'); rect(g, 5, 2, 8, 1, '#b0413e');
  });

  S.pole = P(12, 36, (g) => {
    rect(g, 5, 0, 3, 36, '#6b4a2e'); rect(g, 5, 0, 1, 36, '#8a6440');
    rect(g, 1, 10, 10, 12, '#f6f0df'); rect(g, 1, 10, 10, 3, '#e8743b');
    for (let y = 15; y < 21; y += 2) rect(g, 2, y, 6 + (y % 3), 1, '#9a9286');
    dot(g, 6, 10, '#3d8fd6');
  });
  S.poleRead = P(12, 36, (g) => {
    rect(g, 5, 0, 3, 36, '#6b4a2e'); rect(g, 5, 0, 1, 36, '#8a6440');
    rect(g, 1, 10, 10, 12, '#e3dccb'); rect(g, 1, 10, 10, 3, '#b8a596');
    for (let y = 15; y < 21; y += 2) rect(g, 2, y, 6 + (y % 3), 1, '#b3ab9e');
  });

  S.fountain = P(14, 22, (g) => {
    rect(g, 4, 8, 6, 13, '#9aa0a6'); rect(g, 4, 8, 2, 13, '#c4c9ce'); rect(g, 9, 8, 1, 13, '#6c6f74');
    rect(g, 1, 4, 12, 5, '#b8bdc2'); rect(g, 2, 5, 10, 2, '#3d8fd6'); rect(g, 3, 5, 3, 1, '#7fc0f0');
    rect(g, 3, 20, 8, 2, '#7d8287');
  });

  S.watertable = P(20, 24, (g) => {
    rect(g, 1, 11, 18, 3, '#e8e2d6'); rect(g, 1, 13, 18, 1, '#b8b2a6');
    rect(g, 3, 14, 1, 9, '#7d7a75'); rect(g, 16, 14, 1, 9, '#7d7a75');
    rect(g, 3, 1, 8, 10, '#3d8fd6'); rect(g, 3, 1, 3, 10, '#7fc0f0'); rect(g, 4, 0, 6, 1, '#2f6fb0'); rect(g, 10, 7, 2, 1, '#e8e2d6');
    for (let i = 0; i < 3; i++) { rect(g, 12 + i * 2, 6, 1, 5, '#a9dcef'); dot(g, 12 + i * 2, 5, '#2f6fb0'); }
  });

  S.cooler = P(16, 16, (g) => {
    rect(g, 1, 3, 14, 12, '#e8743b'); rect(g, 1, 3, 3, 12, '#f29a5c'); rect(g, 12, 3, 3, 12, '#c9562a');
    rect(g, 0, 1, 16, 3, '#f1ece0'); rect(g, 6, 8, 4, 3, '#f1ece0');
  });

  S.grackle = [0, 1].map(f => P(9, 7, (g) => {
    rect(g, 2, 2 - f, 5, 3, '#1d1c26'); rect(g, 6, 1 - f, 2, 2, '#1d1c26'); dot(g, 7, 1 - f, '#e8d84a');
    rect(g, 0, 3 - f, 2, 1, '#1d1c26'); dot(g, 3, 2 - f, '#3c3a6a');
    dot(g, 3, 5, '#3a3a40'); dot(g, 5, 5, '#3a3a40');
  }, null));
  S.grackleFly = P(11, 6, (g) => {
    rect(g, 3, 2, 5, 2, '#1d1c26'); rect(g, 0, 0, 4, 2, '#2a2840'); rect(g, 7, 0, 4, 2, '#2a2840'); dot(g, 8, 2, '#e8d84a');
  }, null);

  return S;
}

function makeFence(kind, horiz) {
  if (kind === 'wood') {
    return P(16, 26, (g) => {
      if (horiz) {
        for (let x = 0; x < 16; x += 4) {
          rect(g, x, 6, 4, 18, x % 8 ? '#9c7a52' : '#8f6e48');
          rect(g, x, 6, 1, 18, '#b08c60');
          dot(g, x + 1, 5, '#9c7a52'); dot(g, x + 2, 5, '#9c7a52');
        }
        rect(g, 0, 10, 16, 1, '#6b4f33'); rect(g, 0, 19, 16, 1, '#6b4f33');
      } else {
        rect(g, 6, 0, 4, 26, '#9c7a52'); rect(g, 6, 0, 1, 26, '#b89468'); rect(g, 9, 0, 1, 26, '#6b4f33');
      }
    }, null);
  }
  return P(16, 26, (g) => {
    if (horiz) {
      for (let y = 7; y < 24; y++) for (let x = 0; x < 16; x++) if ((x + y) % 3 === 0 || (x - y + 30) % 3 === 0) dot(g, x, y, 'rgba(170,176,182,0.85)');
      rect(g, 0, 6, 16, 1, '#8a8f93'); rect(g, 0, 23, 16, 1, '#8a8f93');
      rect(g, 0, 5, 2, 20, '#6f7478'); rect(g, 0, 5, 1, 20, '#a9aeb2');
    } else {
      rect(g, 7, 0, 2, 26, '#8a8f93'); rect(g, 7, 0, 1, 26, '#b2b7bb');
    }
  }, null);
}

function makeOverhead(o) {
  if (o.kind === 'awning') {
    const w = o.w * TILE;
    return {
      canvas: P(w + 2, 14, (g) => {
        for (let x = 1; x < w + 1; x++) {
          const col = ((x - 1) / 6 | 0) % 2 ? o.colors[1] : o.colors[0];
          rect(g, x, 0, 1, 10, col);
          rect(g, x, 0, 1, 2, darken(col, 0.25));
          const scal = (x % 6 === 2 || x % 6 === 3) ? 2 : 1;
          rect(g, x, 10, 1, scal, darken(col, 0.12));
        }
      }), x: o.x * TILE - 1, y: o.y * TILE - 12,
    };
  }
  if (o.kind === 'shelter') {
    const w = o.w * TILE;
    return {
      canvas: P(w + 2, 30, (g) => {
        rect(g, 2, 8, 2, 22, '#5a5d62'); rect(g, w - 2, 8, 2, 22, '#5a5d62');
        rect(g, 4, 9, w - 6, 12, 'rgba(160,200,215,0.35)');
        rect(g, 0, 2, w + 2, 7, '#3f6b5a'); rect(g, 0, 2, w + 2, 2, '#5f8f7a'); rect(g, 0, 8, w + 2, 1, '#2c4d40');
      }), x: o.x * TILE - 1, y: o.y * TILE - 18,
    };
  }
  if (o.kind === 'umbrella') {
    return {
      canvas: P(36, 26, (g) => {
        rect(g, 17, 10, 2, 15, '#d9d4c8');
        for (let y = 0; y < 13; y++) for (let x = 0; x < 36; x++) {
          const dx = (x - 18) / 17, dy = (y - 10) / 10;
          if (dy > 0.25 || dx * dx + dy * dy > 1) continue;
          const seg = Math.floor((Math.atan2(y - 12, x - 18) + Math.PI) / (Math.PI / 6));
          dot(g, x, y + 1, seg % 2 ? o.colors[1] : o.colors[0]);
        }
      }), x: o.x * TILE - 18, y: o.y * TILE - 24,
    };
  }
  if (o.kind === 'tent') {
    const w = o.w * TILE;
    return {
      canvas: P(w + 6, 30, (g) => {
        rect(g, 2, 8, 2, 22, '#9aa0a6'); rect(g, w + 2, 8, 2, 22, '#9aa0a6');
        rect(g, 0, 2, w + 6, 7, '#2f6fb0'); rect(g, 0, 2, w + 6, 2, '#5b95cf');
        for (let x = 0; x < w + 6; x += 6) rect(g, x, 9, 3, 2, '#2f6fb0');
      }), x: o.x * TILE - 3, y: o.y * TILE - 16,
    };
  }
}
