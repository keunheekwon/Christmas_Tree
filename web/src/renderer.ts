import {
  CAM_D, CH, COLS, CW, Snow, DEPTH_BIAS, DIM, FOCAL, FONT, GLOW_GAIN, HINT, K_BALL, K_FLOOR, K_GARLAND,
  K_LIGHT, K_NEEDLE, K_STAR, K_TRUNK, LIGHT_DIR, MESSAGE, RAMPS, ROT_SPEED, ROW_CENTER, ROWS, Scene,
  TEXT_STEP, TEXT_T0, TREE_H, WIN_H, Y_CENTER, hueCycle,
} from "./scene";

const BG_R = 8, BG_G = 10, BG_B = 20;
const BG_PACKED = (0xff000000 | (BG_B << 16) | (BG_G << 8) | BG_R) >>> 0;
function widenSnow(base: Snow, cols: number): Snow {
  const off = Math.floor((cols - COLS) / 2);
  const extra = Math.round(base.x.length * (cols - COLS) / COLS);
  const n = base.x.length + extra;
  const out: Snow = { x: new Float32Array(n), y: new Float32Array(n), v: new Float32Array(n),
    ph: new Float32Array(n), b: new Float32Array(n), ch: new Uint8Array(n) };
  for (let i = 0; i < base.x.length; i++) {
    out.x[i] = base.x[i] + off; out.y[i] = base.y[i]; out.v[i] = base.v[i];
    out.ph[i] = base.ph[i]; out.b[i] = base.b[i]; out.ch[i] = base.ch[i];
  }
  let seed = 7;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = base.x.length; i < n; i++) {
    let x = rnd() * (cols - COLS);
    if (x >= off) x += COLS;
    const r = rnd(), kind = r < 0.55 ? 0 : r < 0.8 ? 1 : 2;
    out.x[i] = x; out.y[i] = rnd() * ROWS; out.v[i] = 3 + rnd() * 7; out.ph[i] = rnd() * 6.283;
    out.ch[i] = ".*+".charCodeAt(kind); out.b[i] = 0.35 + rnd() * 0.45 + (kind === 2 ? 0.25 : 0);
  }
  return out;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const roundEven = (v: number) => {
  const r = Math.round(v);
  return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
};

export class Renderer {
  private _glow = true;
  get glow() { return this._glow; }
  set glow(v: boolean) { this._glow = v; this.glowCanvas.classList.toggle("off", !v); }
  progress = 0;
  private ctx: CanvasRenderingContext2D;
  private atlas: HTMLCanvasElement;
  private mask = new Uint8Array(95 * CW * CH);
  private frameImg!: ImageData;
  private frame32!: Uint32Array;
  cols = COLS;
  w = COLS * CW;
  private ncell = ROWS * COLS;
  private gch!: Int32Array;
  private gcol!: Float32Array;
  private zbuf!: Float32Array;
  private cb!: Float32Array;
  private ckind!: Int8Array;
  private cjit!: Int8Array;
  private chot!: Uint8Array;
  private crgb!: Float32Array;
  private cset!: Uint8Array;
  private snow!: Snow;
  private sx!: Float64Array; private sy!: Float64Array;
  private glowCanvas: HTMLCanvasElement;
  private glowCtx: CanvasRenderingContext2D;
  private glowImg!: ImageData;
  private gImg!: Float32Array;
  private gTmp!: Float32Array;
  private gWide!: Float32Array;

  constructor(private canvas: HTMLCanvasElement, private scene: Scene, glowCanvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.atlas = document.createElement("canvas");
    this.atlas.width = 95 * CW; this.atlas.height = CH;
    const a = this.atlas.getContext("2d")!;
    a.font = `13px ${FONT}`; a.fillStyle = "#fff"; a.textAlign = "center"; a.textBaseline = "middle";
    for (let i = 0; i < 95; i++) a.fillText(String.fromCharCode(32 + i), i * CW + CW / 2, CH / 2 + 0.5);
    const ad = a.getImageData(0, 0, 95 * CW, CH).data;
    for (let gi = 0; gi < 95; gi++)
      for (let y = 0; y < CH; y++)
        for (let x = 0; x < CW; x++)
          this.mask[(gi * CH + y) * CW + x] = ad[(y * 95 * CW + gi * CW + x) * 4 + 3];
    this.glowCanvas = glowCanvas;
    this.glowCtx = this.glowCanvas.getContext("2d")!;
    this.resize(COLS);
  }

  resize(cols: number) {
    this.cols = cols; this.w = cols * CW; this.ncell = ROWS * cols;
    const n = this.ncell;
    this.canvas.width = this.w; this.canvas.height = WIN_H;
    this.frameImg = this.ctx.createImageData(this.w, WIN_H);
    this.frame32 = new Uint32Array(this.frameImg.data.buffer);
    this.gch = new Int32Array(n); this.gcol = new Float32Array(n * 3);
    this.zbuf = new Float32Array(n); this.cb = new Float32Array(n);
    this.ckind = new Int8Array(n); this.cjit = new Int8Array(n); this.chot = new Uint8Array(n);
    this.crgb = new Float32Array(n * 3); this.cset = new Uint8Array(n);
    this.gImg = new Float32Array(n * 3); this.gTmp = new Float32Array(n * 3); this.gWide = new Float32Array(n * 3);
    this.glowCanvas.width = cols; this.glowCanvas.height = ROWS;
    this.glowImg = this.glowCtx.createImageData(cols, ROWS);
    this.snow = widenSnow(this.scene.snow, cols);
    this.sx = new Float64Array(this.snow.x.length); this.sy = new Float64Array(this.snow.x.length);
    this.reset();
  }

  reset() {
    this.sx.set(this.snow.x);
    this.sy.set(this.snow.y);
  }

  private blitGlyph(ch: number, col: number, row: number, r: number, g: number, b: number) {
    const m = this.mask, f = this.frame32, base = (ch - 32) * CW * CH;
    let p = row * CH * this.w + col * CW;
    for (let y = 0; y < CH; y++, p += this.w) {
      const mo = base + y * CW;
      for (let x = 0; x < CW; x++) {
        const a = m[mo + x];
        if (!a) continue;
        const k = a / 255;
        f[p + x] = 0xff000000 | ((BG_B + (b - BG_B) * k) << 16) | ((BG_G + (g - BG_G) * k) << 8) | (BG_R + (r - BG_R) * k);
      }
    }
  }

  updateSnow(dt: number, t: number) {
    const { v, ph } = this.snow;
    for (let i = 0; i < this.sx.length; i++) {
      this.sy[i] += v[i] * dt;
      this.sx[i] += Math.sin(t * 1.3 + ph[i]) * 2.0 * dt;
      if (this.sy[i] >= ROWS) this.sy[i] -= ROWS;
      this.sx[i] = ((this.sx[i] % this.cols) + this.cols) % this.cols;
    }
  }

  private project(t: number): number {
    const S = this.scene;
    const { pos, nor, col, t0, dur, phase, kind } = S;
    const th = t * ROT_SPEED, c = Math.cos(th), s = Math.sin(th);
    const flash = t >= 12.0 ? 2.5 * Math.exp(-(t - 12.0) * 2.5) : 0.0;
    const [lx, ly, lz] = LIGHT_DIR;
    this.zbuf.fill(Infinity);
    this.cset.fill(0);
    let sumA = 0, nvis = 0;
    for (let i = 0; i < S.n; i++) {
      const a = clamp((t - t0[i]) / dur[i], 0, 1);
      if (i < S.nCore) sumA += a;
      if (a <= 0) continue;
      nvis++;
      const i3 = i * 3;
      const px = pos[i3], y = pos[i3 + 1], pz = pos[i3 + 2];
      const x = px * c + pz * s, z = -px * s + pz * c;
      const zc = z + CAM_D;
      if (zc <= 0.1) continue;
      const ci = Math.floor(this.cols / 2 + x / zc * FOCAL / CW);
      const ri = Math.floor(ROW_CENTER - (y - Y_CENTER) / zc * FOCAL / CH);
      if (ci < 0 || ci >= this.cols || ri < 0 || ri >= ROWS) continue;
      const k = kind[i];
      const cell = ri * this.cols + ci;
      const zb = zc - DEPTH_BIAS[k];
      if (zb > this.zbuf[cell]) continue;
      const nx = nor[i3] * c + nor[i3 + 2] * s, nz = -nor[i3] * s + nor[i3 + 2] * c;
      const lam = clamp(nx * lx + nor[i3 + 1] * ly + nz * lz, 0, 1);
      const depth = clamp(0.9 - z * 0.35, 0.35, 1.2);
      let b = (0.15 + 0.62 * lam) * depth;
      const m = 0.35 + 0.85 * b;
      let r = col[i3] * m, g = col[i3 + 1] * m, bl = col[i3 + 2] * m;
      if (k === K_LIGHT) {
        const blink = 0.5 + 0.5 * Math.sin(t * 3.0 + phase[i]);
        b = 0.35 + 0.65 * blink;
        const f = 0.4 + 0.8 * blink;
        r = col[i3] * f; g = col[i3 + 1] * f; bl = col[i3 + 2] * f;
      } else if (k === K_STAR) {
        b = 0.75 + 0.25 * Math.sin(t * 7 + phase[i]) + flash;
        const f = 1.0 + 0.5 * flash, add = 60 * flash;
        r = col[i3] * f + add; g = col[i3 + 1] * f + add; bl = col[i3 + 2] * f + add;
      } else if (k === K_GARLAND) {
        const sh = 0.5 + 0.5 * Math.sin(t * 5 + phase[i]);
        b = b * 0.7 + 0.25 + 0.2 * sh;
        const f = 0.85 + 0.3 * sh;
        r *= f; g *= f; bl *= f;
      } else if (k === K_BALL) {
        if (lam > 0.93) { r = 255; g = 245; bl = 225; b = 1.0; } else b += 0.1;
      } else if (k === K_FLOOR) {
        b = 0.6 * depth;
      }
      b *= a;
      const hot = k <= K_TRUNK && a < 1;
      if (hot) {
        const heat = 1 - a;
        r = r * a + 235 * heat; g = g * a + 245 * heat; bl = bl * a + 255 * heat;
        b = Math.max(b, 0.85);
      }
      if (b <= 0.02) continue;
      this.zbuf[cell] = zb;
      this.cset[cell] = 1;
      this.cb[cell] = b; this.ckind[cell] = k; this.cjit[cell] = S.jit[i]; this.chot[cell] = hot ? 1 : 0;
      this.crgb[cell * 3] = clamp(r, 0, 255);
      this.crgb[cell * 3 + 1] = clamp(g, 0, 255);
      this.crgb[cell * 3 + 2] = clamp(bl, 0, 255);
    }
    this.progress = sumA / S.nCore;
    for (let cell = 0; cell < this.ncell; cell++) {
      if (!this.cset[cell]) continue;
      const k = this.ckind[cell], ramp = RAMPS[k], ln = ramp.length, bb = this.cb[cell];
      const ri = clamp(roundEven(bb * (ln - 1)) + (k === K_NEEDLE ? this.cjit[cell] : 0), 1, ln - 1);
      this.gch[cell] = this.chot[cell] && bb > 0.5 ? 35  : ramp[ri];
      this.gcol[cell * 3] = this.crgb[cell * 3];
      this.gcol[cell * 3 + 1] = this.crgb[cell * 3 + 1];
      this.gcol[cell * 3 + 2] = this.crgb[cell * 3 + 2];
    }
    return nvis;
  }

  private put(cell: number, ch: number, r: number, g: number, b: number) {
    this.gch[cell] = ch;
    this.gcol[cell * 3] = r; this.gcol[cell * 3 + 1] = g; this.gcol[cell * 3 + 2] = b;
  }

  private starRays(t: number) {
    if (t < 12.0) return;
    const zc = CAM_D;
    const cx = Math.floor(this.cols / 2), cy = Math.floor(ROW_CENTER - (TREE_H + 0.1 - Y_CENTER) / zc * FOCAL / CH);
    const flash = 2.5 * Math.exp(-(t - 12.0) * 2.5);
    const dirs: [number, number, string][] = [[0, -1, "|"], [1, -1, "/"], [-1, -1, "\\"], [1, 0, "-"],
      [-1, 0, "-"], [1, 1, "\\"], [-1, 1, "/"]];
    dirs.forEach(([dx, dy, c], j) => {
      const length = Math.trunc(3 + 2 * Math.sin(t * 4 + j * 1.7) + 6 * flash) + (dx === 0 || dy === 0 ? 2 : 0);
      for (let st = 3; st < 3 + length; st++) {
        const x = cx + dx * (dy === 0 ? st + Math.floor(st / 2) : st), y = cy + dy * st;
        if (x >= 0 && x < this.cols && y >= 0 && y < ROWS && this.gch[y * this.cols + x] === 0) {
          const fade = 1 - (st - 3) / Math.max(length, 1);
          const f = Math.min(1.0, 0.25 + 0.6 * fade + flash * 0.3);
          this.put(y * this.cols + x, c.charCodeAt(0), 255 * f, 205 * f, 90 * f);
        }
      }
    });
  }

  private progressBar(t: number) {
    const pct = this.progress, width = 30, fill = Math.round(pct * width);
    const text = `BUILD [${"#".repeat(fill)}${"-".repeat(width - fill)}] ${(pct * 100).toFixed(1).padStart(5)}%`;
    const row = ROWS - 5, c0 = Math.floor((this.cols - text.length) / 2), done = pct >= 0.999;
    for (let i = 0; i < text.length; i++) {
      const k = row * this.cols + c0 + i;
      if (done) { const h = hueCycle(i, t); this.put(k, text.charCodeAt(i), h[0], h[1], h[2]); }
      else if (text[i] === "#") this.put(k, 35, 90 + 150 * pct, 200, 110);
      else this.put(k, text.charCodeAt(i), 120, 128, 150);
    }
  }

  private message(t: number) {
    const row = ROWS - 7, c0 = Math.floor((this.cols - MESSAGE.length) / 2);
    for (let i = 0; i < MESSAGE.length; i++) {
      if (t < TEXT_T0 + i * TEXT_STEP) break;
      if (MESSAGE[i] === " ") continue;
      const pop = Math.exp(-(t - TEXT_T0 - i * TEXT_STEP) * 4);
      const h = hueCycle(i, t), f = 0.85 + 0.15 * Math.sin(t * 3 + i);
      this.put(row * this.cols + c0 + i, MESSAGE.charCodeAt(i),
        Math.min(h[0] * f + 200 * pop, 255), Math.min(h[1] * f + 200 * pop, 255), Math.min(h[2] * f + 200 * pop, 255));
    }
  }

  private bloom() {
    const img = this.gImg;
    for (let cell = 0; cell < this.ncell; cell++) {
      const gain = GLOW_GAIN[this.gch[cell]] ?? 0;
      for (let ch = 0; ch < 3; ch++) img[cell * 3 + ch] = clamp(this.gcol[cell * 3 + ch], 0, 255) * gain;
    }
    let src = img, dst = this.gTmp;
    for (const axis of [0, 1]) {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < this.cols; c++) for (let ch = 0; ch < 3; ch++) {
        let sum = 0;
        for (let d = -2; d <= 2; d++) {
          const rr = axis === 0 ? (r + d + ROWS) % ROWS : r, cc = axis === 1 ? (c + d + this.cols) % this.cols : c;
          sum += src[(rr * this.cols + cc) * 3 + ch];
        }
        dst[(r * this.cols + c) * 3 + ch] = sum / 5;
      }
      src = dst; dst = this.gWide;
    }
    const wide = src, px = this.glowImg.data;
    for (let cell = 0; cell < this.ncell; cell++) {
      for (let ch = 0; ch < 3; ch++) px[cell * 4 + ch] = clamp(img[cell * 3 + ch] * 0.6 + wide[cell * 3 + ch] * 1.2, 0, 255);
      px[cell * 4 + 3] = 255;
    }
    this.glowCtx.putImageData(this.glowImg, 0, 0);
  }

  composite(): HTMLCanvasElement {
    const out = document.createElement("canvas");
    out.width = this.w; out.height = WIN_H;
    const o = out.getContext("2d")!;
    o.drawImage(this.canvas, 0, 0);
    if (this.glow) {
      o.globalCompositeOperation = "lighter";
      o.imageSmoothingEnabled = true;
      o.drawImage(this.glowCanvas, 0, 0, this.w, WIN_H);
    }
    return out;
  }

  draw(t: number, fps: number) {
    const S = this.scene, gch = this.gch;
    gch.fill(0);
    this.gcol.fill(0);
    const sn = this.snow;
    for (let i = 0; i < sn.x.length; i++) {
      const cell = (Math.trunc(this.sy[i]) % ROWS) * this.cols + (Math.trunc(this.sx[i]) % this.cols);
      const tw = 0.65 + 0.35 * Math.sin(t * 3 + sn.ph[i] * 5);
      const f = clamp(sn.b[i] * tw, 0, 1);
      this.put(cell, sn.ch[i], 205 * f, 215 * f, 240 * f);
    }
    const nvis = this.project(t);
    this.starRays(t);
    this.progressBar(t);
    this.message(t);
    const ctx = this.ctx;
    this.frame32.fill(BG_PACKED);
    let letters = 0;
    for (let cell = 0; cell < this.ncell; cell++) {
      const ch = gch[cell];
      if (!ch) continue;
      letters++;
      if (ch === 32) continue;
      const q = (v: number) => ((clamp(v, 0, 255) | 0) >> 4) * 17;
      this.blitGlyph(ch, cell % this.cols, (cell / this.cols) | 0,
        q(this.gcol[cell * 3]), q(this.gcol[cell * 3 + 1]), q(this.gcol[cell * 3 + 2]));
    }
    ctx.putImageData(this.frameImg, 0, 0);
    if (this.glow) this.bloom();
    const deg = ((t * ROT_SPEED * 180) / Math.PI) % 360;
    const fmt = (v: number) => v.toLocaleString("en-US");
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = DIM;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(`rotation ${deg.toFixed(2).padStart(6)}°    lights ${S.nLights}`, 8, WIN_H - 36);
    ctx.fillText(`letters ${fmt(letters)}    particles ${fmt(nvis + sn.x.length)}/${fmt(S.n + sn.x.length)}` +
      `    fps ${fps.toFixed(1).padStart(4)}`, 8, WIN_H - 20);
    ctx.fillText(HINT, 8, 6);
    ctx.textAlign = "right";
    ctx.fillText(`t ${t.toFixed(1).padStart(5)}`, this.w - 8, 6);
  }
}
