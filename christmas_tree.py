import time
from pathlib import Path
import numpy as np
import pygame

COLS, ROWS = 88, 74
CW, CH = 9, 14
WIN_W, WIN_H = COLS * CW, ROWS * CH
FPS = 60
BG = (8, 10, 20)
FONT_NAMES = "consolas,menlo,dejavusansmono,couriernew"
HINT = "Space pause · R restart · S screenshot · Esc quit"
DIM = (90, 96, 114)

TREE_H = 2.4
R0 = 0.95
Y_GROUND = -0.35
CAM_D = 4.6
FOCAL = 1000.0
Y_CENTER = 0.95
ROW_CENTER = ROWS * 0.45
ROT_SPEED = 0.45
LIGHT_DIR = np.array([-0.45, 0.55, -0.70])
LIGHT_DIR /= np.linalg.norm(LIGHT_DIR)
MUSIC = Path(__file__).with_name("Wham! - Last Christmas.mp3")
GLOW = True

(K_NEEDLE, K_INNER, K_TRUNK, K_GARLAND, K_BALL, K_LIGHT,
 K_STAR, K_GIFT, K_RIBBON, K_FLOOR) = range(10)
RAMPS = [".:-~^vx*%&#W@",
         ".:-=x%",
         ".:|!I#",
         ".-=~*#@",
         ".:oO0@",
         ".:o*@",
         ".+*#@",
         ".:x%#",
         ".:+xX#",
         " ..-"]
RAMP_LEN = np.array([len(r) for r in RAMPS])
RAMP_TAB = np.zeros((len(RAMPS), RAMP_LEN.max()), np.int32)
for _k, _r in enumerate(RAMPS):
    RAMP_TAB[_k, :len(_r)] = [ord(c) for c in _r]
DEPTH_BIAS = np.array([0, 0, 0, 0.03, 0.05, 0.08, 0.10, 0, 0.01, -0.6], np.float32)

N_SNOW = 600
MESSAGE = "M E R R Y   C H R I S T M A S   2 0 2 6"
TEXT_T0, TEXT_STEP = 13.0, 0.06
GLOW_GAIN = np.zeros((128, 1), np.float32)
for _c, _g in zip(" .:-~^vx*+%&#W@oO0|!I=X/\\", [0, .08, .12, .15, .18, .2, .25, .3, .35, .3, .4, .42, .45, .5, .55,
                                                    .35, .45, .5, .2, .2, .3, .25, .4, .3, .3]):
    GLOW_GAIN[ord(_c)] = _g
GLOW_GAIN[ord('A'):ord('Z') + 1] = GLOW_GAIN[ord('0'):ord('9') + 1] = 0.5
RED, GOLD, GREEN = (225, 45, 50), (250, 196, 70), (60, 200, 90)


def envelope(y):
    u = np.clip(y / TREE_H, 0.0, 1.0)
    return R0 * (1.0 - u) ** 0.9


def fib_sphere(n):
    i = np.arange(n) + 0.5
    phi = np.arccos(1 - 2 * i / n)
    th = np.pi * (1 + 5 ** 0.5) * i
    return np.stack([np.cos(th) * np.sin(phi), np.cos(phi), np.sin(th) * np.sin(phi)], 1)


def normalize(v):
    return v / np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-9)


def grow_t0(y):
    return 2.0 + 4.0 * np.clip((y - Y_GROUND) / (TREE_H - Y_GROUND), 0, 1)


def box_points(rng, center, size, n):
    w, h, d = size
    u, v = rng.random(n) - 0.5, rng.random(n) - 0.5
    f = rng.choice(5, n, p=np.array([w * d, h * d, h * d, w * h, w * h]) / (w * d + 2 * h * d + 2 * w * h))
    loc, nor = np.zeros((n, 3)), np.zeros((n, 3))
    full = lambda m, val: np.full(m.sum(), val)
    m = f == 0; loc[m] = np.stack([u[m] * w, full(m, h / 2), v[m] * d], 1); nor[m] = (0, 1, 0)
    m = f == 1; loc[m] = np.stack([full(m, w / 2), u[m] * h, v[m] * d], 1); nor[m] = (1, 0, 0)
    m = f == 2; loc[m] = np.stack([full(m, -w / 2), u[m] * h, v[m] * d], 1); nor[m] = (-1, 0, 0)
    m = f == 3; loc[m] = np.stack([u[m] * w, v[m] * h, full(m, d / 2)], 1); nor[m] = (0, 0, 1)
    m = f == 4; loc[m] = np.stack([u[m] * w, v[m] * h, full(m, -d / 2)], 1); nor[m] = (0, 0, -1)
    rib = (np.abs(loc[:, 0]) < 0.08 * w) | (np.abs(loc[:, 2]) < 0.08 * d)
    return loc + center, nor, rib


def hue_cycle(i, t):
    return (RED, GOLD, GREEN)[(i // 2 + int(t * 1.5)) % 3]


def build():
    rng = np.random.default_rng(7)
    P, N, C, T0, DUR, KIND, PH = [], [], [], [], [], [], []

    def add(pos, nor, col, t0, dur, kind):
        n = len(pos)
        P.append(pos); N.append(normalize(nor))
        C.append(np.asarray(col, float).reshape(-1, 3) * np.ones((n, 1)))
        T0.append(np.broadcast_to(t0, (n,)).astype(float)); DUR.append(np.full(n, dur))
        KIND.append(np.full(n, kind)); PH.append(rng.random(n) * 6.283)

    g = np.arange(-2.8, 2.8, 0.085)
    fx, fz = np.meshgrid(g, g)
    fx, fz = fx.ravel(), fz.ravel()
    keep = fx ** 2 + fz ** 2 < 2.8 ** 2
    fx, fz = fx[keep], fz[keep]
    add(np.stack([fx, np.full(fx.size, Y_GROUND - 0.02), fz], 1), np.tile([0, 1, 0], (fx.size, 1)),
        (70, 80, 110), 0.0, 1.5, K_FLOOR)

    L, n = 16, 26000
    w = np.linspace(2.2, 0.6, L); w /= w.sum()
    layer = rng.choice(L, n, p=w)
    u = layer / (L - 1)
    yl = 0.08 + u * TREE_H * 0.9
    nb = (26 - 18 * u).astype(int)
    b = (rng.random(n) * nb).astype(int)
    s = rng.random(n) ** 0.6
    ang = b / nb * 2 * np.pi + layer * 2.399 + rng.normal(0, 0.06, n) / (s + 0.3)
    r = s * envelope(yl) * (1.12 - 0.15 * u) + rng.normal(0, 0.015, n)
    droop = (0.32 * (1 - u) + 0.05) * s ** 2
    y = yl - droop + rng.normal(0, 0.02, n)
    pos = np.stack([r * np.cos(ang), y, r * np.sin(ang)], 1)
    nor = np.stack([np.cos(ang), 0.35 + 0 * ang, np.sin(ang)], 1)
    gv = rng.uniform(0.6, 1.3, n)[:, None]
    col = np.clip(np.array([30, 120, 48]) * gv + (s[:, None] > 0.85) * np.array([30, 55, 12])
                  + rng.normal(0, 8, (n, 3)), 0, 255)
    add(pos, nor, col, grow_t0(y), 0.35, K_NEEDLE)
    tips = pos[s > 0.92]

    n = 7000
    y = rng.random(n) * TREE_H * 0.92
    ang = rng.random(n) * 2 * np.pi
    r = envelope(y) * 0.55
    add(np.stack([r * np.cos(ang), y, r * np.sin(ang)], 1),
        np.stack([np.cos(ang), 0 * ang + 0.2, np.sin(ang)], 1), (12, 48, 24), grow_t0(y), 0.35, K_INNER)

    n = 1800
    y = rng.uniform(Y_GROUND, 0.3, n)
    ang = rng.random(n) * 2 * np.pi
    add(np.stack([0.13 * np.cos(ang), y, 0.13 * np.sin(ang)], 1),
        np.stack([np.cos(ang), 0 * ang, np.sin(ang)], 1),
        np.array([110, 66, 30]) * rng.uniform(0.7, 1.2, (n, 1)), grow_t0(y), 0.35, K_TRUNK)

    n, turns, swags = 6000, 3.6, 7
    s = np.sort(rng.random(n))
    th = s * turns * 2 * np.pi
    y = TREE_H * 0.85 - s * (TREE_H * 0.8) - 0.08 * np.abs(np.sin(th * swags / 2)) + rng.normal(0, 0.012, n)
    r = envelope(y) * 1.04 + 0.025
    col = np.array([245, 195, 70]) * rng.uniform(0.75, 1.15, (n, 1))
    add(np.stack([r * np.cos(th), y, r * np.sin(th)], 1), np.stack([np.cos(th), 0 * th + 0.3, np.sin(th)], 1),
        col, 6.0 + 2.0 * s, 0.3, K_GARLAND)

    nball, per = 34, 90
    sph = fib_sphere(per)
    by = rng.uniform(0.15, TREE_H * 0.78, nball)
    ba = rng.random(nball) * 2 * np.pi
    br = envelope(by) * 0.98
    cen = np.stack([br * np.cos(ba), by - 0.03, br * np.sin(ba)], 1)
    rad = rng.uniform(0.05, 0.075, nball)
    pos = (cen[:, None, :] + sph[None] * rad[:, None, None]).reshape(-1, 3)
    bc = np.where(rng.random(nball)[:, None] < 0.55, [RED], [GOLD])
    add(pos, np.tile(sph, (nball, 1)), np.repeat(bc, per, 0),
        np.repeat(8.0 + rng.random(nball) * 1.5, per), 0.3, K_BALL)

    nl = 170
    pick = tips[rng.choice(len(tips), nl, replace=False)]
    pal = np.array([[255, 60, 60], [255, 210, 70], [80, 160, 255], [255, 120, 220], [120, 255, 140], [255, 250, 225]])
    add(pick * [1.03, 1, 1.03], pick * [1, 0, 1] + [0, 0.3, 0], pal[rng.integers(0, len(pal), nl)],
        8.5 + rng.random(nl) * 1.5, 0.2, K_LIGHT)

    n = 1100
    sp = fib_sphere(n)
    az = np.arctan2(sp[:, 1], sp[:, 0])
    k = 0.42 + 0.58 * np.abs(np.cos(2.5 * (az - np.pi / 2))) ** 4
    pos = np.stack([sp[:, 0] * k * 0.24, sp[:, 1] * k * 0.24, sp[:, 2] * 0.06], 1) + [0, TREE_H + 0.1, 0]
    add(pos, sp, (255, 215, 80), 12.0, 0.4, K_STAR)

    gifts = [((0.55, 1.05), (0.46, 0.36, 0.42), RED, GOLD),
             ((1.75, 1.15), (0.36, 0.30, 0.36), (45, 85, 220), (235, 235, 245)),
             ((3.30, 1.10), (0.50, 0.40, 0.40), GOLD, RED),
             ((4.70, 1.00), (0.34, 0.26, 0.34), RED, GREEN),
             ((5.60, 1.25), (0.28, 0.22, 0.28), GREEN, GOLD)]
    loop = fib_sphere(80)
    for i, ((ga, gr), size, gc, rc) in enumerate(gifts):
        c = np.array([gr * np.cos(ga), Y_GROUND + size[1] / 2, gr * np.sin(ga)])
        t0 = 10.0 + i * 0.35
        area = size[0] * size[2] + 2 * size[1] * (size[0] + size[2])
        pos, nor, rib = box_points(rng, c, size, int(5500 * area))
        add(pos[~rib], nor[~rib], gc, t0, 0.4, K_GIFT)
        add(pos[rib], nor[rib], rc, t0, 0.4, K_RIBBON)
        top = c + [0, size[1] / 2 + 0.03, 0]
        bs = 0.045 + size[0] * 0.06
        for sx in (-1, 1):
            add(top + loop * [bs, bs * 0.7, bs * 0.5] + [sx * bs * 0.9, 0, 0], loop, rc, t0 + 0.3, 0.3, K_RIBBON)

    f32 = lambda L: np.concatenate(L).astype(np.float32)
    return dict(pos=f32(P), nor=f32(N), col=f32(C), t0=f32(T0), dur=f32(DUR),
                kind=np.concatenate(KIND).astype(np.int8), phase=f32(PH), jit=rng.integers(-1, 2, sum(len(p) for p in P)),
                n_lights=nl)


class Renderer:
    def __init__(self, screen, scene):
        self.screen, self.scene = screen, scene
        font = pygame.font.SysFont(FONT_NAMES, 13)
        self.hud_font = pygame.font.SysFont(FONT_NAMES, 12)
        self.atlas = pygame.Surface((95 * CW, CH), pygame.SRCALPHA)
        for i in range(95):
            g = font.render(chr(32 + i), True, (255, 255, 255))
            self.atlas.blit(g, (i * CW + (CW - g.get_width()) // 2, (CH - g.get_height()) // 2))
        self.cache = {}
        self.progress = 0.0
        self.glow = GLOW
        self.reset()

    def reset(self):
        rng = np.random.default_rng(7)
        self.snow_x = rng.random(N_SNOW) * COLS
        self.snow_y = rng.random(N_SNOW) * ROWS
        self.snow_v = rng.uniform(3, 10, N_SNOW)
        self.snow_ph = rng.random(N_SNOW) * 6.283
        kind = rng.choice(3, N_SNOW, p=[0.55, 0.25, 0.20])
        self.snow_ch = np.array([ord(c) for c in ".*+"])[kind]
        self.snow_b = rng.uniform(0.35, 0.8, N_SNOW) + 0.25 * (kind == 2)

    def glyph(self, key):
        s = self.cache.get(key)
        if s is None:
            ch, q = key >> 12, key & 4095
            rgb = (((q >> 8) & 15) * 17, ((q >> 4) & 15) * 17, (q & 15) * 17)
            s = self.atlas.subsurface(((ch - 32) * CW, 0, CW, CH)).copy()
            s.fill(rgb + (255,), special_flags=pygame.BLEND_RGBA_MULT)
            self.cache[key] = s
        return s

    def update_snow(self, dt, t):
        self.snow_y += self.snow_v * dt
        self.snow_x += np.sin(t * 1.3 + self.snow_ph) * 2.0 * dt
        self.snow_y[self.snow_y >= ROWS] -= ROWS
        self.snow_x %= COLS

    @staticmethod
    def to_cell(x, y, z):
        zc = z + CAM_D
        ci = np.floor(COLS / 2 + x / zc * FOCAL / CW).astype(np.int32)
        ri = np.floor(ROW_CENTER - (y - Y_CENTER) / zc * FOCAL / CH).astype(np.int32)
        return ci, ri, zc

    def project(self, t):
        S = self.scene
        a = np.clip((t - S['t0']) / S['dur'], 0, 1)
        self.progress = float(a.mean())
        m = a > 0
        if not m.any():
            return None
        names = ('pos', 'nor', 'kind', 'phase', 'col', 'jit')
        if m.all():
            p, n, kind, ph, col, jit = (S[k] for k in names)
        else:
            p, n, kind, ph, col, jit = (S[k][m] for k in names)
            a = a[m]
        th = t * ROT_SPEED
        c, s = np.cos(th), np.sin(th)
        x = p[:, 0] * c + p[:, 2] * s
        z = -p[:, 0] * s + p[:, 2] * c
        y = p[:, 1]
        nx = n[:, 0] * c + n[:, 2] * s
        nz = -n[:, 0] * s + n[:, 2] * c
        ci, ri, zc = self.to_cell(x, y, z)
        lam = np.clip(nx * LIGHT_DIR[0] + n[:, 1] * LIGHT_DIR[1] + nz * LIGHT_DIR[2], 0, 1)
        depth = np.clip(0.9 - z * 0.35, np.float32(0.35), np.float32(1.2))
        b = (0.15 + 0.62 * lam) * depth
        rgb = col * (0.35 + 0.85 * b)[:, None]
        lk = kind == K_LIGHT
        blink = 0.5 + 0.5 * np.sin(t * 3.0 + ph[lk])
        b[lk] = 0.35 + 0.65 * blink
        rgb[lk] = col[lk] * (0.4 + 0.8 * blink)[:, None]
        sk = kind == K_STAR
        flash = 2.5 * np.exp(-(t - 12.0) * 2.5) if t >= 12.0 else 0.0
        b[sk] = 0.75 + 0.25 * np.sin(t * 7 + ph[sk]) + flash
        rgb[sk] = col[sk] * (1.0 + 0.5 * flash) + 60 * flash
        gk = kind == K_GARLAND
        sh = 0.5 + 0.5 * np.sin(t * 5 + ph[gk])
        b[gk] = b[gk] * 0.7 + 0.25 + 0.2 * sh
        rgb[gk] *= (0.85 + 0.3 * sh)[:, None]
        bk = kind == K_BALL
        spec = (lam[bk] > 0.93)
        rgb[bk] = np.where(spec[:, None], [255, 245, 225], rgb[bk])
        b[bk] = np.where(spec, 1.0, b[bk] + 0.1)
        fk = kind == K_FLOOR
        b[fk] = 0.6 * depth[fk]
        b *= a
        hot = (kind <= K_TRUNK) & (a < 1)
        heat = 1 - a[hot]
        rgb[hot] = rgb[hot] * a[hot, None] + np.array([235, 245, 255]) * heat[:, None]
        b[hot] = np.maximum(b[hot], 0.85)
        rgb = np.clip(rgb, 0, 255)

        ok = (ci >= 0) & (ci < COLS) & (ri >= 0) & (ri < ROWS) & (zc > 0.1) & (b > 0.02)
        idx = (ri * COLS + ci)[ok]
        zb = (zc - DEPTH_BIAS[kind])[ok]
        okn = np.nonzero(ok)[0]
        order = np.argsort(-zb, kind='stable')
        buf = np.full(ROWS * COLS, -1, np.int64)
        buf[idx[order]] = okn[order]
        sel = buf[buf >= 0]
        k, bb = kind[sel], b[sel]
        ln = RAMP_LEN[k]
        ri_ = np.clip(np.round(bb * (ln - 1)).astype(np.int32) + np.where(k == K_NEEDLE, jit[sel], 0), 1, ln - 1)
        ch = RAMP_TAB[k, ri_]
        ch = np.where(hot[sel] & (bb > 0.5), ord('#'), ch)
        return (ri * COLS + ci)[sel], ch, rgb[sel], int(m.sum())

    def star_rays(self, t, gch, gcol):
        if t < 12.0:
            return
        ci, ri, _ = self.to_cell(np.array([0.0]), np.array([TREE_H + 0.1]), np.array([0.0]))
        cx, cy = int(ci[0]), int(ri[0])
        flash = 2.5 * np.exp(-(t - 12.0) * 2.5)
        dirs = [(0, -1, '|'), (1, -1, '/'), (-1, -1, '\\'), (1, 0, '-'), (-1, 0, '-'),
                (1, 1, '\\'), (-1, 1, '/')]
        for j, (dx, dy, c) in enumerate(dirs):
            length = int(3 + 2 * np.sin(t * 4 + j * 1.7) + 6 * flash) + (2 if dx == 0 or dy == 0 else 0)
            for st in range(3, 3 + length):
                x, y = cx + dx * (st + st // 2 if dy == 0 else st), cy + dy * st
                if 0 <= x < COLS and 0 <= y < ROWS and gch[y * COLS + x] == 0:
                    fade = 1 - (st - 3) / max(length, 1)
                    gch[y * COLS + x] = ord(c)
                    gcol[y * COLS + x] = np.array([255, 205, 90]) * min(1.0, 0.25 + 0.6 * fade + flash * 0.3)

    def progress_bar(self, t, gch, gcol):
        pct = self.progress
        width = 30
        fill = int(round(pct * width))
        text = f"BUILD [{'#' * fill}{'-' * (width - fill)}] {pct * 100:5.1f}%"
        row, c0 = ROWS - 5, (COLS - len(text)) // 2
        done = pct >= 0.999
        for i, c in enumerate(text):
            k = row * COLS + c0 + i
            gch[k] = ord(c)
            if done:
                gcol[k] = hue_cycle(i, t)
            elif c == '#':
                gcol[k] = (90 + 150 * pct, 200, 110)
            else:
                gcol[k] = (120, 128, 150)

    def draw(self, t, fps):
        gch = np.zeros(ROWS * COLS, np.int32)
        gcol = np.zeros((ROWS * COLS, 3), np.float64)
        si = (self.snow_y.astype(np.int32) % ROWS) * COLS + self.snow_x.astype(np.int32) % COLS
        gch[si] = self.snow_ch
        tw = 0.65 + 0.35 * np.sin(t * 3 + self.snow_ph * 5)
        gcol[si] = np.array([205, 215, 240]) * np.clip(self.snow_b * tw, 0, 1)[:, None]
        res = self.project(t)
        nvis = 0
        if res is not None:
            idx, ch, rgb, nvis = res
            gch[idx] = ch
            gcol[idx] = rgb
        self.star_rays(t, gch, gcol)
        self.progress_bar(t, gch, gcol)
        row = ROWS - 7
        c0 = (COLS - len(MESSAGE)) // 2
        letters = 0
        for i, letter in enumerate(MESSAGE):
            if t < TEXT_T0 + i * TEXT_STEP:
                break
            if letter == ' ':
                continue
            k = row * COLS + c0 + i
            pop = np.exp(-(t - TEXT_T0 - i * TEXT_STEP) * 4)
            gch[k] = ord(letter)
            gcol[k] = np.minimum(np.array(hue_cycle(i, t)) * (0.85 + 0.15 * np.sin(t * 3 + i)) + 200 * pop, 255)
            letters += 1
        occ = np.nonzero(gch)[0]
        q = np.clip(gcol[occ], 0, 255).astype(np.int32) >> 4
        keys = (gch[occ] << 12) | (q[:, 0] << 8) | (q[:, 1] << 4) | q[:, 2]
        self.screen.fill(BG)
        g = self.glyph
        self.screen.blits([(g(k), ((i % COLS) * CW, (i // COLS) * CH))
                           for k, i in zip(keys.tolist(), occ.tolist())], False)
        if self.glow:
            img = (np.clip(gcol, 0, 255) * GLOW_GAIN[gch]).reshape(ROWS, COLS, 3)
            wide = img.copy()
            for ax in (0, 1):
                wide = (wide + np.roll(wide, 1, ax) + np.roll(wide, -1, ax)
                        + np.roll(wide, 2, ax) + np.roll(wide, -2, ax)) / 5
            img = np.clip(img * 0.6 + wide * 1.2, 0, 255)
            cells = pygame.surfarray.make_surface(img.astype(np.uint8).transpose(1, 0, 2))
            self.screen.blit(pygame.transform.smoothscale(cells, (WIN_W, WIN_H)), (0, 0),
                             special_flags=pygame.BLEND_ADD)
        deg = np.degrees(t * ROT_SPEED) % 360
        lines = [f"rotation {deg:6.2f}°    lights {self.scene['n_lights']}",
                 f"letters {len(occ):,}    particles {nvis + N_SNOW:,}/{len(self.scene['pos']) + N_SNOW:,}"
                 f"    fps {fps:4.1f}"]
        for j, s in enumerate(lines):
            self.screen.blit(self.hud_font.render(s, True, DIM), (8, WIN_H - 36 + j * 16))
        self.screen.blit(self.hud_font.render(HINT, True, DIM), (8, 6))
        tt = self.hud_font.render(f"t {t:5.1f}", True, DIM)
        self.screen.blit(tt, (WIN_W - tt.get_width() - 8, 6))


def main():
    pygame.init()
    screen = pygame.display.set_mode((WIN_W, WIN_H))
    pygame.display.set_caption("Christmas Tree")
    renderer = Renderer(screen, build())
    music = False
    try:
        pygame.mixer.init()
        pygame.mixer.music.load(str(MUSIC))
        pygame.mixer.music.play(-1)
        music = True
    except (pygame.error, FileNotFoundError) as err:
        print("music disabled:", err)
    clock = pygame.time.Clock()
    t, paused, running = 0.0, False, True
    while running:
        dt = min(clock.tick(FPS) / 1000.0, 0.05)
        for e in pygame.event.get():
            if e.type == pygame.QUIT:
                running = False
            elif e.type == pygame.KEYDOWN:
                if e.key == pygame.K_ESCAPE:
                    running = False
                elif e.key == pygame.K_SPACE:
                    paused = not paused
                    if music:
                        (pygame.mixer.music.pause if paused else pygame.mixer.music.unpause)()
                elif e.key == pygame.K_r:
                    t = 0.0
                    renderer.reset()
                    if music:
                        pygame.mixer.music.play(-1)
                        if paused:
                            pygame.mixer.music.pause()
                elif e.key == pygame.K_g:
                    renderer.glow = not renderer.glow
                elif e.key == pygame.K_s:
                    name = time.strftime("tree_%Y%m%d_%H%M%S.png")
                    pygame.image.save(screen, name)
                    print("saved", name)
        if not paused:
            t += dt
            renderer.update_snow(dt, t)
        renderer.draw(t, clock.get_fps())
        pygame.display.flip()
    pygame.quit()


if __name__ == "__main__":
    main()
