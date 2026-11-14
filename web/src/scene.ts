
export const COLS = 88, ROWS = 74;
export const CW = 9, CH = 14;
export const WIN_W = COLS * CW, WIN_H = ROWS * CH;
export const BG = "rgb(8,10,20)";
export const FONT = "Consolas, Menlo, 'DejaVu Sans Mono', 'Courier New', monospace";
export const HINT = "Space pause · R restart · S screenshot · G glow · ↑↓ volume · M mute · Esc stop";
export const DIM = "rgb(90,96,114)";

export const TREE_H = 2.4;
export const CAM_D = 4.6;
export const FOCAL = 1000.0;
export const Y_CENTER = 0.95;
export const ROW_CENTER = ROWS * 0.45;
export const ROT_SPEED = 0.45;
const L = [-0.45, 0.55, -0.7];
const LN = Math.hypot(L[0], L[1], L[2]);
export const LIGHT_DIR = [L[0] / LN, L[1] / LN, L[2] / LN];

export const K_NEEDLE = 0, K_INNER = 1, K_TRUNK = 2, K_GARLAND = 3, K_BALL = 4,
  K_LIGHT = 5, K_STAR = 6, K_GIFT = 7, K_RIBBON = 8, K_FLOOR = 9;

export const RAMPS = [".:-~^vx*%&#W@", ".:-=x%", ".:|!I#", ".-=~*#@", ".:oO0@",
  ".:o*@", ".+*#@", ".:x%#", ".:+xX#", " ..-"].map(r => Array.from(r, c => c.charCodeAt(0)));
export const DEPTH_BIAS = [0, 0, 0, 0.03, 0.05, 0.08, 0.10, 0, 0.01, -0.6];

export const MESSAGE = "M E R R Y   C H R I S T M A S   2 0 2 6";
export const TEXT_T0 = 13.0, TEXT_STEP = 0.06;
export const RED = [225, 45, 50], GOLD = [250, 196, 70], GREEN = [60, 200, 90];
export const hueCycle = (i: number, t: number) =>
  [RED, GOLD, GREEN][(Math.floor(i / 2) + Math.floor(t * 1.5)) % 3];

export const GLOW_GAIN = new Float32Array(128);
{
  const chars = " .:-~^vx*+%&#W@oO0|!I=X/\\";
  const gains = [0, .08, .12, .15, .18, .2, .25, .3, .35, .3, .4, .42, .45, .5, .55,
    .35, .45, .5, .2, .2, .3, .25, .4, .3, .3];
  for (let i = 0; i < chars.length; i++) GLOW_GAIN[chars.charCodeAt(i)] = gains[i];
  for (let c = 65; c <= 90; c++) GLOW_GAIN[c] = 0.5;
  for (let c = 48; c <= 57; c++) GLOW_GAIN[c] = 0.5;
}

export interface Snow { x: Float32Array; y: Float32Array; v: Float32Array; ph: Float32Array; b: Float32Array; ch: Uint8Array }

export interface Scene {
  n: number; nCore: number; nLights: number; nSnow: number;
  pos: Float32Array; nor: Float32Array; col: Float32Array;
  t0: Float32Array; dur: Float32Array; phase: Float32Array;
  kind: Int8Array; jit: Int8Array;
  snow: Snow;
}

export async function loadScene(base = "./"): Promise<Scene> {
  const meta = await (await fetch(base + "scene.json")).json();
  const buf = await (await fetch(base + "scene.bin")).arrayBuffer();
  const N: number = meta.n, S: number = meta.snow;
  let off = 0;
  const f = (len: number) => { const a = new Float32Array(buf, off, len); off += len * 4; return a; };
  const i8 = (len: number) => { const a = new Int8Array(buf, off, len); off += len; return a; };
  const pos = f(3 * N), nor = f(3 * N), col = f(3 * N), t0 = f(N), dur = f(N), phase = f(N);
  const sx = f(S), sy = f(S), sv = f(S), sph = f(S), sb = f(S);
  const kind = i8(N), jit = i8(N);
  const sch = new Uint8Array(buf, off, S);
  return {
    n: N, nCore: N, nLights: meta.n_lights, nSnow: S, pos, nor, col, t0, dur, phase, kind, jit,
    snow: { x: sx, y: sy, v: sv, ph: sph, b: sb, ch: sch },
  };
}

export function extendFloor(sc: Scene, rIn = 2.8, rOut = 7.0, step = 0.085, yFloor = -0.37): Scene {
  const pts: number[] = [];
  const k0 = Math.ceil((rOut - rIn) / step), n = 2 * k0 + Math.ceil(2 * rIn / step);
  for (let ix = 0; ix < n; ix++)
    for (let iz = 0; iz < n; iz++) {
      const gx = -rIn + (ix - k0) * step, gz = -rIn + (iz - k0) * step;
      const r2 = gx * gx + gz * gz;
      if (r2 >= rIn * rIn && r2 < rOut * rOut) pts.push(gx, gz);
    }
  const m = pts.length / 2, N = sc.n + m;
  const grow = <T extends Float32Array | Int8Array>(a: T, per: number, ctor: new (n: number) => T): T => {
    const o = new ctor(N * per); o.set(a); return o;
  };
  const pos = grow(sc.pos, 3, Float32Array), nor = grow(sc.nor, 3, Float32Array), col = grow(sc.col, 3, Float32Array);
  const t0 = grow(sc.t0, 1, Float32Array), dur = grow(sc.dur, 1, Float32Array), phase = grow(sc.phase, 1, Float32Array);
  const kind = grow(sc.kind, 1, Int8Array), jit = grow(sc.jit, 1, Int8Array);
  for (let j = 0; j < m; j++) {
    const i = sc.n + j;
    pos.set([pts[2 * j], yFloor, pts[2 * j + 1]], i * 3);
    nor.set([0, 1, 0], i * 3);
    col.set([70, 80, 110], i * 3);
    t0[i] = 0; dur[i] = 1.5; kind[i] = K_FLOOR;
  }
  return { ...sc, n: N, pos, nor, col, t0, dur, phase, kind, jit };
}
