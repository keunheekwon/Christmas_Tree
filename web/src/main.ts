import { Renderer } from "./renderer";
import { COLS, CW, WIN_H, extendFloor, loadScene } from "./scene";

const canvas = document.getElementById("screen") as HTMLCanvasElement;
const overlay = document.getElementById("overlay")!;
const title = document.getElementById("overlay-title")!;
const sub = document.getElementById("overlay-sub")!;
const music = document.getElementById("music") as HTMLAudioElement;
const stage = document.getElementById("stage")!;
const volSlider = document.getElementById("vol-slider") as HTMLInputElement;
const volLabel = document.getElementById("vol-label")!;
const volIcon = document.getElementById("vol-icon")!;

let renderer: Renderer;
let t = 0, paused = false, started = false, fps = 0, last = 0;

function showOverlay(main: string, small = "") {
  title.textContent = main;
  sub.textContent = small;
  overlay.classList.remove("hidden");
}

function playMusic() {
  music.play().catch(err => console.warn("music disabled:", err));
}

let volume = 0.7, muted = false;
try {
  const v = localStorage.getItem("tree.volume");
  if (v !== null && !isNaN(+v)) volume = Math.min(1, Math.max(0, +v));
  muted = localStorage.getItem("tree.muted") === "1";
} catch {  }

function applyVolume() {
  music.volume = volume;
  music.muted = muted;
  volSlider.value = String(Math.round(volume * 100));
  volLabel.textContent = muted ? "mute" : `${Math.round(volume * 100)}%`;
  volIcon.textContent = muted || volume === 0 ? "♪̸" : "♪";
  try {
    localStorage.setItem("tree.volume", String(volume));
    localStorage.setItem("tree.muted", muted ? "1" : "0");
  } catch {  }
}

function setVolume(v: number) {
  volume = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
  muted = false;
  applyVolume();
}

volSlider.addEventListener("input", () => setVolume(+volSlider.value / 100));
volIcon.addEventListener("click", () => { muted = !muted; applyVolume(); });
applyVolume();

function fit() {
  const scale0 = innerHeight / WIN_H;
  let cols = Math.max(COLS, Math.floor(innerWidth / scale0 / CW));
  if ((cols - COLS) % 2) cols--;
  if (renderer && cols !== renderer.cols) renderer.resize(cols);
  const w = cols * CW, scale = Math.min(innerHeight / WIN_H, innerWidth / w);
  stage.style.width = `${w * scale}px`;
  stage.style.height = `${WIN_H * scale}px`;
}

function start() {
  overlay.classList.add("hidden");
  if (!started) {
    started = true;
    t = 0;
    music.currentTime = 0;
  }
  paused = false;
  playMusic();
}

function stop() {
  paused = true;
  music.pause();
  showOverlay("stopped", "click or press any key to resume");
}

function screenshot() {
  const d = new Date(), p = (n: number) => String(n).padStart(2, "0");
  const name = `tree_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
  renderer.composite().toBlob(blob => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}

function onKey(e: KeyboardEvent) {
  if (!overlay.classList.contains("hidden")) {
    if (renderer) start();
    e.preventDefault();
    return;
  }
  switch (e.code) {
    case "Escape": stop(); break;
    case "Space":
      paused = !paused;
      if (paused) music.pause(); else playMusic();
      break;
    case "KeyR":
      t = 0;
      renderer.reset();
      music.currentTime = 0;
      if (!paused) playMusic();
      break;
    case "KeyG": renderer.glow = !renderer.glow; break;
    case "KeyS": screenshot(); break;
    case "ArrowUp": setVolume(volume + 0.05); break;
    case "ArrowDown": setVolume(volume - 0.05); break;
    case "KeyM": muted = !muted; applyVolume(); break;
    default: return;
  }
  e.preventDefault();
}

function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (dt > 0) fps = fps ? fps * 0.9 + (1 / dt) * 0.1 : 1 / dt;
  if (started && !paused) {
    t += dt;
    renderer.updateSnow(dt, t);
  }
  renderer.draw(t, fps);
  requestAnimationFrame(frame);
}

async function main() {
  const scene = extendFloor(await loadScene());
  await document.fonts?.ready;
  renderer = new Renderer(canvas, scene, document.getElementById("glow") as HTMLCanvasElement);
  (window as unknown as { tree: Renderer }).tree = renderer;
  fit();
  addEventListener("resize", fit);
  showOverlay("▶ click or press any key to start", "Space pause · R restart · S screenshot · G glow · ↑↓ volume · M mute · Esc stop");
  overlay.addEventListener("click", () => start());
  window.addEventListener("keydown", onKey);
  last = performance.now();
  requestAnimationFrame(frame);
}

main().catch(err => {
  console.error(err);
  showOverlay("failed to load scene", "run: npm run export-scene");
});
