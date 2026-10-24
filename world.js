'use strict';

// The neighborhood. Painted with rectangles instead of one giant string so
// moving a house or a tree around doesn't mean re-counting columns.

const MAP_W = 60;
const MAP_H = 50;

const G = {
  GRASS: 0, ROAD: 1, WALK: 2, LOT: 3, DIRT: 4, WATER: 5, BRIDGE: 6,
  PLANK: 7, SPLASH: 8, GRAVEL: 9, PAVERS: 10, COURT: 11, SAND: 12,
};

function buildWorld() {
  const W = MAP_W, H = MAP_H;
  const ground = new Uint8Array(W * H);
  const solid = new Uint8Array(W * H);
  const idx = (x, y) => y * W + x;

  const paint = (type, x, y, w, h) => {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++)
        if (i >= 0 && j >= 0 && i < W && j < H) ground[idx(i, j)] = type;
  };
  const block = (x, y, w = 1, h = 1) => {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++)
        if (i >= 0 && j >= 0 && i < W && j < H) solid[idx(i, j)] = 1;
  };

  const world = {
    W, H, ground, solid,
    buildings: [], trees: [], props: [], overheads: [],
    npcs: [], spots: [], fences: [], cars: [], shadeRects: [],
    crosswalks: [], streets: [],
  };

  // ---- ground ----
  paint(G.WATER, 0, 24, W, 3);           // the bayou
  paint(G.DIRT, 0, 27, W, 1);            // trail along the south bank
  paint(G.SAND, 24, 30, 5, 4);           // playground
  paint(G.SPLASH, 30, 31, 4, 3);
  paint(G.COURT, 34, 29, 4, 3);
  paint(G.LOT, 43, 33, 17, 5);
  paint(G.WALK, 45, 32, 13, 1);          // in front of the grocery
  paint(G.GRAVEL, 17, 43, 19, 4);        // construction site
  paint(G.DIRT, 25, 42, 2, 1);           // site gate

  for (const y of [9, 12, 18, 21, 38, 41]) paint(G.WALK, 0, y, W, 1);
  for (const x of [11, 14, 39, 42]) paint(G.WALK, x, 12, 1, 30);
  paint(G.PAVERS, 44, 9, 12, 1);
  paint(G.WALK, 5, 37, 2, 1);            // front walk at home
  paint(G.WALK, 18, 33, 2, 1);           // Okafor's front walk
  paint(G.WALK, 26, 17, 2, 1);           // Ms. Delgado's porch

  paint(G.ROAD, 0, 10, W, 2);            // Main St
  paint(G.ROAD, 0, 19, W, 2);            // Pecan St
  paint(G.ROAD, 0, 39, W, 2);            // Elm St
  paint(G.ROAD, 12, 10, 2, 31);          // Oak Ln
  paint(G.ROAD, 40, 10, 2, 31);          // Bell Ave
  for (const x of [11, 14, 39, 42]) paint(G.BRIDGE, x, 24, 1, 3);
  paint(G.PLANK, 26, 24, 2, 3);          // footbridge

  for (let i = 0; i < W * H; i++) if (ground[i] === G.WATER) solid[i] = 1;

  // crosswalks where a sidewalk line runs into a road
  for (const y of [12, 18, 21, 38]) {
    world.crosswalks.push({ x: 12, y, w: 2, h: 1, dir: 'h' });
    world.crosswalks.push({ x: 40, y, w: 2, h: 1, dir: 'h' });
  }
  for (const x of [11, 14, 39, 42]) {
    world.crosswalks.push({ x, y: 10, w: 1, h: 2, dir: 'v' });
    world.crosswalks.push({ x, y: 19, w: 1, h: 2, dir: 'v' });
    world.crosswalks.push({ x, y: 39, w: 1, h: 2, dir: 'v' });
  }

  world.streets = [
    { name: 'Main St', x: 0, y: 9, w: W, h: 4 },
    { name: 'Pecan St', x: 0, y: 18, w: W, h: 4 },
    { name: 'Elm St', x: 0, y: 38, w: W, h: 4 },
    { name: 'Oak Ln', x: 11, y: 12, w: 4, h: 30 },
    { name: 'Bell Ave', x: 39, y: 12, w: 4, h: 30 },
    { name: 'the bayou trail', x: 0, y: 22, w: W, h: 7 },
    { name: 'Bayou Park', x: 23, y: 29, w: 15, h: 9 },
    { name: 'the grocery parking lot', x: 43, y: 32, w: 17, h: 6 },
    { name: 'the construction site', x: 16, y: 42, w: 21, h: 6 },
  ];

  // ---- buildings ----
  const building = (b) => {
    world.buildings.push(b);
    block(b.x, b.y, b.w, b.h);
    return b;
  };

  // north side of Main
  building({ kind: 'shop', x: 2, y: 4, w: 8, h: 5, sign: 'CORNER STORE', wall: '#d8c39a', trim: '#8a3b2e', awning: ['#3f7d5a', '#efe6cf'], seed: 3 });
  building({ kind: 'shop', x: 15, y: 4, w: 7, h: 5, sign: 'TAQUERIA', wall: '#e2a25a', trim: '#5a2f1f', awning: ['#c9452f', '#f4e7c8'], seed: 9 });
  building({ kind: 'shop', x: 24, y: 4, w: 7, h: 5, sign: 'LAUNDRY', wall: '#a9c3c8', trim: '#33525a', awning: null, seed: 12 });
  building({ kind: 'kiosk', x: 33, y: 6, w: 3, h: 3, sign: 'SNOWBALLS' });
  const lib = building({ kind: 'library', x: 44, y: 2, w: 12, h: 7, doorX: 49 });
  // the doors themselves are walkable, walking into them wins
  solid[idx(49, 8)] = 0; solid[idx(50, 8)] = 0;
  world.goal = { x: 49 * 16, y: 8 * 16, w: 32, h: 12 };
  world.library = lib;

  // awnings throw shade on the sidewalk
  world.overheads.push({ kind: 'awning', x: 2, y: 9, w: 8, colors: ['#3f7d5a', '#efe6cf'] });
  world.overheads.push({ kind: 'awning', x: 15, y: 9, w: 7, colors: ['#c9452f', '#f4e7c8'] });
  world.overheads.push({ kind: 'umbrella', x: 37, y: 8, colors: ['#e8743b', '#f4e7c8'] });
  world.overheads.push({ kind: 'shelter', x: 29, y: 12, w: 3 });

  // block between Main and Pecan
  building({ kind: 'house', x: 1, y: 13, w: 6, h: 4, siding: '#8fb4c9', roof: '#5a5560', door: 3, seed: 21 });
  building({ kind: 'house', x: 16, y: 13, w: 6, h: 4, siding: '#e8d6a8', roof: '#6b4a3e', door: 2, seed: 22 });
  building({ kind: 'house', x: 24, y: 13, w: 6, h: 4, siding: '#d99c8a', roof: '#4f5a4a', door: 3, seed: 23, porch: true });
  building({ kind: 'house', x: 32, y: 13, w: 6, h: 4, siding: '#a8c49a', roof: '#7a3f35', door: 3, seed: 24 });
  building({ kind: 'apartments', x: 44, y: 13, w: 12, h: 4, sign: 'BELL APTS' });

  // south of the bayou
  building({ kind: 'house', x: 3, y: 33, w: 6, h: 4, siding: '#cdb8dc', roof: '#5a5560', door: 3, seed: 31, home: true });
  building({ kind: 'house', x: 16, y: 29, w: 6, h: 4, siding: '#f0d27a', roof: '#6b4a3e', door: 3, seed: 32 });
  building({ kind: 'grocery', x: 45, y: 28, w: 13, h: 4, sign: 'GROCERY' });

  // south of Elm
  building({ kind: 'house', x: 2, y: 43, w: 6, h: 4, siding: '#9cc1c4', roof: '#7a3f35', door: 0, seed: 41 });
  building({ kind: 'house', x: 44, y: 43, w: 6, h: 4, siding: '#e8d6a8', roof: '#4f5a4a', door: 0, seed: 42 });
  building({ kind: 'house', x: 52, y: 43, w: 6, h: 4, siding: '#d99c8a', roof: '#5a5560', door: 0, seed: 43 });

  // ---- trees (trunk tile) ----
  // A tree shades its own tile, the one west of it, and the rows just above
  // and below (leaning east). So a tree right next to a sidewalk shades it.
  const trees = [
    // north edge
    [1, 2], [11, 2], [20, 2], [31, 3], [40, 2], [58, 2],
    // Main St, north side (between shops) and south side (back yards)
    [12, 8], [23, 8], [39, 8], [42, 6], [57, 8],
    [8, 13], [15, 13], [23, 13], [38, 13], [57, 13],
    // Pecan St front yards
    [10, 15], [9, 17], [15, 17], [22, 17], [30, 17], [38, 17], [43, 17], [57, 17],
    // north bank of the bayou
    [3, 22], [7, 22], [10, 23], [17, 22], [21, 22], [34, 22], [37, 23], [45, 22], [50, 22], [55, 22],
    // along the trail
    [2, 28], [6, 28], [17, 28], [21, 28], [24, 28], [29, 28], [35, 28], [38, 28], [44, 28],
    // Oak Ln + home + Okafor's yard
    [10, 31], [10, 33], [10, 35], [1, 32], [5, 31], [15, 34], [15, 37],
    // park
    [23, 31], [23, 35], [29, 30], [36, 34], [33, 36], [37, 37],
    // south of Elm
    [9, 42], [13, 42], [39, 42], [50, 42], [12, 45], [1, 47], [14, 47], [38, 47], [42, 46], [51, 46], [58, 44],
  ];
  trees.forEach(([x, y], i) => {
    world.trees.push({ x, y, v: i % 3 });
    block(x, y);
  });

  // ---- fences ----
  const fenceRun = (kind, x, y, w, h, gaps = []) => {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) {
        if (gaps.some(([gx, gy]) => gx === i && gy === j)) continue;
        world.fences.push({ kind, x: i, y: j });
        block(i, j);
      }
  };
  fenceRun('wood', 0, 29, 10, 1);
  fenceRun('wood', 9, 30, 1, 3);
  fenceRun('chain', 16, 42, 21, 1, [[25, 42], [26, 42]]);
  fenceRun('chain', 16, 43, 1, 5);
  fenceRun('chain', 36, 43, 1, 5);
  fenceRun('chain', 17, 47, 19, 1);

  // map edge: high water barricades on the streets, hedges everywhere else
  for (let y = 0; y < H; y++) {
    for (const x of [0, W - 1]) {
      const t = ground[idx(x, y)];
      if (t === G.ROAD || t === G.WALK || t === G.DIRT) world.props.push({ kind: 'barricade', x, y, solid: true });
      else if (t !== G.WATER && !world.trees.some(tr => tr.x === x && tr.y === y)) world.props.push({ kind: 'hedge', x, y, solid: true });
      block(x, y);
    }
  }
  for (let x = 1; x < W - 1; x++) {
    for (const y of [0, H - 1]) {
      if (!world.trees.some(tr => tr.x === x && tr.y === y)) world.props.push({ kind: 'hedge', x, y, solid: true });
      block(x, y);
    }
  }

  // ---- props ----
  const prop = (p) => { world.props.push(p); if (p.solid) block(Math.floor(p.x), Math.floor(p.y), p.tw || 1, p.th || 1); return p; };

  // park
  prop({ kind: 'slide', x: 24, y: 30, tw: 2, th: 2, solid: true });
  prop({ kind: 'swings', x: 27, y: 30, tw: 2, th: 1, solid: true });
  prop({ kind: 'bench', x: 24, y: 35, solid: true });
  prop({ kind: 'bench', x: 34, y: 35, solid: true });
  prop({ kind: 'hoop', x: 35, y: 29, solid: true });
  prop({ kind: 'nozzle', x: 31, y: 32 });
  prop({ kind: 'nozzle', x: 32, y: 32 });
  prop({ kind: 'parksign', x: 28, y: 37, solid: true });
  prop({ kind: 'trash', x: 37, y: 35, solid: true });

  // yards & streets
  prop({ kind: 'mailbox', x: 8, y: 37, solid: true });
  prop({ kind: 'mower', x: 20, y: 35, solid: true });
  prop({ kind: 'chair', x: 26, y: 17 });
  prop({ kind: 'mailbox', x: 21, y: 33, solid: true });
  prop({ kind: 'hydrant', x: 14, y: 26.5 });
  prop({ kind: 'hydrant', x: 38, y: 21 });
  prop({ kind: 'bench', x: 30, y: 12 });        // under the bus shelter
  prop({ kind: 'busstop', x: 32, y: 12 });
  prop({ kind: 'trash', x: 10, y: 9, solid: true });
  prop({ kind: 'picnic', x: 36, y: 8, tw: 2, solid: true });
  prop({ kind: 'planter', x: 45, y: 8, solid: true });
  prop({ kind: 'planter', x: 54, y: 8, solid: true });
  prop({ kind: 'bookdrop', x: 52, y: 9, solid: true });

  // grocery lot
  prop({ kind: 'carts', x: 56, y: 32, solid: true });
  prop({ kind: 'lamp', x: 52, y: 35 });

  // construction site
  prop({ kind: 'framing', x: 18, y: 43, tw: 5, th: 3, solid: true });
  prop({ kind: 'mixer', x: 31, y: 44, tw: 2, solid: true });
  prop({ kind: 'portapotty', x: 34, y: 43, solid: true });
  prop({ kind: 'pallets', x: 24, y: 45, tw: 2, solid: true });
  prop({ kind: 'cone', x: 24, y: 41 });
  prop({ kind: 'cone', x: 27, y: 41 });
  prop({ kind: 'bucket', x: 28, y: 43 });
  world.overheads.push({ kind: 'tent', x: 29, y: 45, w: 2 });

  // parked cars: {x, y, dir: 'v' (1x2) or 'h' (2x1)}
  const car = (c) => {
    world.cars.push(c);
    if (c.dir === 'v') block(c.x, c.y, 1, 2); else block(c.x, c.y, 2, 1);
    return c;
  };
  const lotColors = ['#c9452f', '#e8e2d6', '#3d6fa8', '#2f2f36', '#9aa3ab', '#5f8a4f', '#e2b04a', '#7b4a8f'];
  [44, 46, 47, 52, 55, 57].forEach((x, i) => car({ x, y: 33, dir: 'v', color: lotColors[i] }));
  [45, 48, 51, 54, 58].forEach((x, i) => car({ x, y: 36, dir: 'v', color: lotColors[(i + 3) % 8] }));
  world.dogCar = car({ x: 50, y: 33, dir: 'v', color: '#3d6fa8', dog: true });
  car({ x: 3, y: 19, dir: 'h', color: '#9aa3ab' });
  car({ x: 33, y: 20, dir: 'h', color: '#c9452f' });
  car({ x: 54, y: 40, dir: 'h', color: '#e8e2d6' });

  // ---- things you can walk up to ----
  const spot = (s) => { world.spots.push(s); return s; };

  spot({ kind: 'hat', x: 2, y: 37, label: 'Look in the free box' });
  prop({ kind: 'freebox', x: 2, y: 37, solid: true });

  const flyerAt = [
    [10, 37], [14, 29], [17, 12], [27, 12], [23, 37], [43, 32], [36, 31], [11, 22],
  ];
  flyerAt.forEach(([x, y], i) => {
    spot({ kind: 'flyer', tip: i, x, y, label: 'Read the sign' });
    prop({ kind: 'pole', x, y });
  });

  const waters = [
    { x: 29, y: 36, sprite: 'fountain', label: 'Drink from the fountain' },
    { x: 30, y: 22, sprite: 'watertable', label: 'Grab water from the table' },
    { x: 48, y: 32, sprite: 'watertable', label: 'Grab water from the table' },
    { x: 29, y: 43, sprite: 'cooler', label: 'Refill from the cooler', locked: 'luis' },
  ];
  waters.forEach(w => {
    spot({ kind: 'water', ...w });
    prop({ kind: w.sprite, x: w.x, y: w.y, solid: true });
  });

  spot({ kind: 'store', x: 5.5, y: 8.6, label: 'Step inside the corner store' });
  spot({ kind: 'snowball', x: 34, y: 8.6, label: 'Order a snowball' });

  // ---- people ----
  // `fix` is where they end up after you help (null = they leave)
  world.npcs = [
    { id: 'okafor', x: 19, y: 35.4, dir: 'left', look: 'okafor', encounter: true, fix: { x: 16.5, y: 35.6, pose: 'sit', dir: 'down' } },
    { id: 'jayden', x: 26.5, y: 33.6, dir: 'down', look: 'jayden', encounter: true, fix: { x: 25.6, y: 35.7, pose: 'stand', dir: 'down' } },
    { id: 'dana', x: 32, y: 27.6, dir: 'left', look: 'dana', encounter: true, wobble: true, fix: null },
    { id: 'delgado', x: 26.5, y: 17.95, dir: 'down', look: 'delgado', pose: 'sit', encounter: true, fix: null },
    { id: 'dog', x: 50.5, y: 35.3, dir: 'up', look: null, encounter: true, car: world.dogCar, fix: null },
    { id: 'luis', x: 28.5, y: 44.05, dir: 'down', look: 'luis', pose: 'sit', encounter: true, fix: { x: 30, y: 45.8, pose: 'sit', dir: 'down' } },

    { id: 'mom', x: 24.5, y: 35.95, dir: 'down', look: 'mom', pose: 'sit', talk: 'mom' },
    { id: 'volunteer', x: 31, y: 22.4, dir: 'down', look: 'volunteer', talk: 'volunteer' },
    { id: 'vendor', x: 34, y: 7.9, dir: 'down', look: 'vendor', inKiosk: true },
    { id: 'kid2', x: 32.5, y: 32.2, dir: 'right', look: 'kid2', splash: true },
  ];

  world.start = { x: 6 * 16, y: 37 * 16 + 10 };
  return world;
}

if (typeof module !== 'undefined') module.exports = { buildWorld, G, MAP_W, MAP_H };
