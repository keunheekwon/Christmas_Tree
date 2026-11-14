# Christmas_Tree

English | [한국어](README-KR.md)

Rotating 3D ASCII Christmas tree, rendered from tens of thousands of particles.
Available as a desktop app (Python + numpy + pygame) and a web version (TypeScript + Canvas 2D).

## Desktop (Python)

```
pip install -r requirements.txt
python christmas_tree.py
```

## Web

```
cd web
npm install
npm run dev
```

`web/public/scene.bin` is exported from the Python scene so both versions render the exact same tree.
After changing the tree in `christmas_tree.py`, regenerate it:

```
python web/tools/export_scene.py
```

## Docker

```
docker build -t christmas-tree web
docker run -p 3000:3000 christmas-tree
```

The container serves the static build with `serve` on port 3000 (works behind Dokploy / Traefik).

## Controls

| Key | Action |
| --- | --- |
| Space | Pause / resume |
| R | Restart |
| S | Screenshot |
| G | Toggle glow |
| ↑ / ↓ | Volume (web) |
| M | Mute (web) |
| Esc | Quit (desktop) / stop (web) |
