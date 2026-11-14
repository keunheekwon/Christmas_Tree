import json
import shutil
import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
import christmas_tree as ct

OUT = ROOT / "web" / "public"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sc = ct.build()
    snow = SimpleNamespace()
    ct.Renderer.reset(snow)

    f32 = lambda a: np.ascontiguousarray(a, dtype="<f4").tobytes()
    blob = b"".join([
        f32(sc["pos"]), f32(sc["nor"]), f32(sc["col"]), f32(sc["t0"]), f32(sc["dur"]), f32(sc["phase"]),
        f32(snow.snow_x), f32(snow.snow_y), f32(snow.snow_v), f32(snow.snow_ph), f32(snow.snow_b),
        sc["kind"].astype(np.int8).tobytes(), sc["jit"].astype(np.int8).tobytes(),
        snow.snow_ch.astype(np.uint8).tobytes(),
    ])
    (OUT / "scene.bin").write_bytes(blob)
    meta = {"n": int(len(sc["pos"])), "snow": int(ct.N_SNOW), "n_lights": int(sc["n_lights"])}
    (OUT / "scene.json").write_text(json.dumps(meta))

    music = ROOT / "Wham! - Last Christmas.mp3"
    if music.exists():
        shutil.copyfile(music, OUT / "music.mp3")
    print(f"exported {meta} -> {OUT} ({len(blob) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
