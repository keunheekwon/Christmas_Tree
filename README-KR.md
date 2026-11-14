# Christmas_Tree

[English](README.md) | 한국어

수만 개의 파티클로 렌더링하는 회전 3D ASCII 크리스마스 트리.
데스크톱 버전(Python + numpy + pygame)과 웹 버전(TypeScript + Canvas 2D)이 있습니다.

## 데스크톱 (Python)

```
pip install -r requirements.txt
python christmas_tree.py
```

## 웹

```
cd web
npm install
npm run dev
```

`web/public/scene.bin`은 Python 씬을 그대로 내보낸 파일이라 두 버전이 완전히 같은 트리를 그립니다.
`christmas_tree.py`에서 트리를 수정했다면 다시 내보내세요:

```
python web/tools/export_scene.py
```

## Docker

```
docker build -t christmas-tree web
docker run -p 3000:3000 christmas-tree
```

컨테이너는 `serve`로 정적 빌드를 3000번 포트에서 서빙합니다 (Dokploy / Traefik 뒤에서 동작).
Dokploy에서는 Build Path를 `web`, 컨테이너 포트를 `3000`으로 설정하면 됩니다.

## 조작

| 키 | 동작 |
| --- | --- |
| Space | 일시정지 / 재개 |
| R | 재시작 |
| S | 스크린샷 |
| G | 글로우 켜기/끄기 |
| ↑ / ↓ | 볼륨 (웹) |
| M | 음소거 (웹) |
| Esc | 종료 (데스크톱) / 정지 (웹) |

## 음악

이 저장소에는 음원 파일이 포함되어 있지 않습니다.
음악을 재생하려면 직접 MP3 파일을 아래 위치에 넣으세요:

- 데스크톱: `christmas_tree.py`와 같은 폴더에 `Wham! - Last Christmas.mp3`
- 웹: `web/public/music.mp3`

파일이 없어도 두 버전 모두 정상 동작합니다.
