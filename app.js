// Hello, dinosaur: one model, display rig, facing the viewer, standing on the glass.
// The dinosaur was generated for DisplayXR (Tripo H3.1 through Runway, November 22, 2026).
import { createInline3D } from '@displayxr/inline3d';
import { addModel } from '@displayxr/inline3d/model';

const canvas = document.getElementById('stage');
const cover = document.getElementById('cover');
const statusEl = document.getElementById('status');

let coverDone = false;
function dropCover() {
  if (coverDone) return;
  coverDone = true;
  cover.remove();
}
setTimeout(dropCover, 4000); // the cover always comes off

async function start() {
  const wall = await createInline3D().catch((err) => {
    console.warn('inline 3D unavailable, showing 2D', err);
    return null;
  });
  statusEl.textContent = wall && wall.supported ? '3D' : '2D';
  const handle = addModel(wall, canvas, './assets/dino.glb', {
    frame: dinoFrame(),
    idleSpin: 0,          // he faces the viewer and waves
    orbit: true,          // a drag still turns him
    margin: 0.82,
    clearColor: '#dfe9e4', // opaque, matches the page behind the canvas
    environment: 'neutral',
    zoom: { min: 0.85, max: 1.25 },
    hands: {
      zoom: false,
      roll: false,
      gestures: { pinchEnterM: 0.03, pinchExitM: 0.045, smoothTauS: 0.08 },
    },
  });
  if (new URLSearchParams(location.search).has('debug')) startDebug(handle);
  if (wall && typeof wall.close === 'function') addEventListener('pagehide', () => wall.close());
  handle.ready.then(playIdle).catch((err) => console.warn('idle animation not started', err));
  await Promise.race([handle.firstWoven, new Promise((r) => setTimeout(r, 4000))]);
  dropCover();
}

// Where the screen plane (zero disparity) sits in the dinosaur. addModel puts the CENTRE of the
// framing box on the glass (the model viewer's rule). This mesh is front-heavy: the thin tail
// reaches far back, so the box centre is behind the body and 65% of the surface pops out (snout
// ~+0.48 m in a 0.98 m deep box). Same box size (so the 80% fit is unchanged), but its centre is
// moved forward in z to the mesh's 75th-percentile depth: ~25% of the surface in front of the
// glass, the stereographer screen-plane rule. Measured from dino.glb (glTF +z = toward viewer).
// ?zdp=box restores the SDK default, ?zdp=median puts the middle vertex on the glass.
const DINO_BOX = { center: [0.012, 0.0, -0.006], extent: [0.719, 1.0, 0.975] };
const DINO_ZDP_Z = { box: -0.006, median: 0.094, p75: 0.207 };
function dinoFrame() {
  const pick = new URLSearchParams(location.search).get('zdp');
  const z = pick in DINO_ZDP_Z ? DINO_ZDP_Z[pick] : DINO_ZDP_Z.p75;
  return { center: [DINO_BOX.center[0], DINO_BOX.center[1], z], extent: DINO_BOX.extent.slice() };
}

// ?debug: a small pill in the top-left corner with the hand gate and both pinch distances, 4 Hz.
function startDebug(h) {
  const el = document.createElement('div');
  el.id = 'debug';
  document.body.appendChild(el);
  const mm = (hand) => {
    try {
      const d = h.hands.controller.tipDistance(hand);
      return Number.isFinite(d) ? `${(d * 1000).toFixed(0)} mm` : '–';
    } catch { return '–'; }
  };
  setInterval(() => {
    const hands = h && h.hands;
    if (!hands) { el.textContent = 'hands: n/a'; return; }
    let gate = '?';
    try { gate = hands.state && hands.state.gate != null ? String(hands.state.gate) : '?'; } catch {}
    const n = (() => { try { return hands.state.hands | 0; } catch { return 0; } })();
    el.textContent = n > 0 && hands.controller
      ? `gate: ${gate} · L ${mm(0)} · R ${mm(1)}`
      : `gate: ${gate} · no hands`;
  }, 250);
}

// The GLB carries one looping clip, "idle" (5 s: breathing bob, a small sway, one hop), keyed on
// the parent node. addModel loads it but does not play it, so attach an anim component (PlayCanvas
// path only; the three fallback stays still). Reduced-motion viewers get the still pose.
function playIdle(h) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const clip = h.container && h.container.animations && h.container.animations[0];
  if (!h.model || !clip || typeof h.model.addComponent !== 'function') return;
  const track = clip.resource;
  h.model.addComponent('anim', { activate: true });
  h.model.anim.assignAnimation(track.name, track); // loops by default
}

start().catch((err) => {
  console.warn('inline 3D setup failed', err);
  dropCover();
});
