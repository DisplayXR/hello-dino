// Hello, dinosaur: one model, display rig, facing the viewer, standing on the glass.
// The dinosaur was generated for DisplayXR (Tripo H3.1 through Runway, November 22, 2026).
import { createInline3D } from '@displayxr/inline3d';
import { addModel } from '@displayxr/inline3d/model';
import { createVoice } from './voice.js';

// Talk to Dino (voice.js): one button; tap to start a conversation, tap again to end it.
const talkBtn = document.getElementById('talk');
const TALK_LABEL = { idle: 'Talk to Dino', connecting: 'Waking Dino up…', listening: 'Dino is listening…', hearing: 'Dino is listening…', thinking: 'Dino is thinking…', speaking: 'Dino is talking…', error: 'Try again' };
const voice = createVoice({
  onAnimate: (clip) => dinoPlay && dinoPlay(clip),
  onState: (s, detail) => {
    if (!talkBtn) return;
    talkBtn.dataset.state = s;
    talkBtn.querySelector('span').textContent = TALK_LABEL[s] || TALK_LABEL.idle;
    if (detail) console.warn('dino voice:', detail);
  },
});
talkBtn && talkBtn.addEventListener('click', () => (voice.active ? voice.stop() : voice.start()));

const canvas = document.getElementById('stage');
const cover = document.getElementById('cover');
const statusEl = document.getElementById('status');

const MARGIN = 0.82; // the model's height as a fraction of the canvas height (addModel `margin`)

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
  const handle = addModel(wall, canvas, './assets/dino-rigged-wave.glb', {
    frame: dinoFrame(),
    idleSpin: 0,          // he faces the viewer and waves
    orbit: true,          // a drag still turns him
    margin: MARGIN,
    // No clearColor (transparent): the 3D meadow backdrop (addBackdrop) covers the canvas; the
    // CSS meadow behind it only shows during load and in 2D.
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
  handle.ready.then(startAnimation).catch((err) => console.warn('animation not started', err));
  handle.ready.then(addBackdrop).catch((err) => console.warn('backdrop not added', err));
  handle.ready.then(startRelax).catch((err) => console.warn('relax not wired', err));
  await Promise.race([handle.firstWoven, new Promise((r) => setTimeout(r, 4000))]);
  dropCover();
}

// Where the screen plane (zero disparity) sits in the dinosaur. addModel puts the CENTRE of the
// framing box on the glass (the model viewer's rule). This mesh is front-heavy: the thin tail
// reaches far back, so the box centre is behind the body and 65% of the surface pops out (snout
// ~+0.48 m in a 0.97 m deep box). Same box size (so the 80% fit is unchanged), but its centre is
// moved forward in z to the surface's area-weighted 75th-percentile depth: ~25% of the surface in
// front of the glass (DisplayXR/displayxr-web#327). Measured from dino-rigged.glb in its bind pose
// (feet at y = 0, glTF +z = toward the viewer). ?zdp=box restores the SDK default, ?zdp=median
// puts the middle of the surface on the glass.
const DINO_BOX = { center: [0.0, 0.5, 0.0], extent: [0.72, 1.0, 0.968] };
const DINO_ZDP_Z = { box: 0.0, median: 0.1, p75: 0.222 };
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

// The meadow is a 3D backdrop, not a CSS layer: a flat page layer sits AT the screen plane and cuts
// the tail, which is behind it. An unlit textured plane placed behind the
// dinosaur, in the camera rig's frame (see below) so it never turns with him. Depth: the farthest
// point from the turn pivot is the tail,
// 0.71 model heights; the model is 0.82 vH tall, so 0.58 vH, x 1.25 max zoom = 0.72 vH at any turn.
// BACKDROP_Z_VH = 0.8 (~15 cm behind the glass on the 15.6" panel) keeps clear of every pose. The
// image is pre-blurred, so the lens's softening of rear content costs nothing. Size: covers the
// canvas at that depth, plus head-motion parallax, at the image's 3:2.
const BACKDROP_Z_VH = 0.8;      // behind the screen, in virtual-display heights
const BACKDROP_H_VH = 2.2;      // plane height, in virtual-display heights (3:2 image)
async function addBackdrop(h) {
  const v = h.viewer;
  const app = v && v.app;
  if (!app || !h.model) return;
  const pc = await import('playcanvas');
  // The SDK keeps the model still and moves a camera RIG around it: `viewer.rigNode` sits at the
  // framing centre, scaled 1/fit, and its LOCAL frame is the display frame (screen at the origin,
  // virtualDisplayHeight tall, +z toward the viewer). Parent the backdrop to it in those local
  // units: it then stays put on the screen while a pinch orbits the camera round the dinosaur.
  const rn = v.rigNode;
  const vH = v.vH || 0.24;
  const tex = await new Promise((resolve, reject) => {
    app.assets.loadFromUrl('./assets/bg-meadow.jpg', 'texture', (err, asset) => (err ? reject(err) : resolve(asset.resource)));
  });
  const mat = new pc.StandardMaterial();
  mat.useLighting = false;
  mat.diffuse = new pc.Color(0, 0, 0);
  mat.emissive = new pc.Color(1, 1, 1);
  mat.emissiveMap = tex;
  mat.useFog = false;
  mat.useSkybox = false;
  mat.update();
  const e = new pc.Entity('meadow-backdrop');
  e.addComponent('render', { type: 'plane', material: mat, castShadows: false, receiveShadows: false });
  const hgt = BACKDROP_H_VH * vH;
  e.setLocalScale(hgt * 1.5, 1, hgt);          // pc plane is 1x1 in XZ
  e.setLocalEulerAngles(90, 0, 0);            // face +z (toward the viewer)
  // ?bdz=<vH> tunes the depth by eye on the panel (e.g. 0.6 shallower, 1.0 deeper).
  const bdz = parseFloat(new URLSearchParams(location.search).get('bdz'));
  e.setLocalPosition(0, 0, -(Number.isFinite(bdz) && bdz > 0 ? bdz : BACKDROP_Z_VH) * vH);
  rn.addChild(e);
}

// Slow relax home after a DRAG RELEASE (mouse or pinch), so the dinosaur can't be parked turned
// away or upside down. While dragging he turns freely (addModel's turntable: cumulative, no cap);
// on release the viewer's own orbit easing is pointed back at his starting pose with a slow time
// constant. Grabbing him again mid-relax simply takes over (a drag rewrites the target). Zoom is
// left alone. Uses the PlayCanvas viewer's orbit state (_targetYaw/_targetPitch/_orbitMode, the
// same fields its 'tilt' style relaxes with) because the turntable style has no public relax.
const RELAX_TAU_S = 1.5; // ~95% home in 4.5 s
let relaxHome = null;
function startRelax(h) {
  const v = h.viewer;
  if (!v || !('_targetYaw' in v)) return;
  const restYaw = v._targetYaw, restPitch = v._targetPitch;
  relaxHome = () => {
    // Shortest way round: unwrap the current yaw (degrees) to within half a turn of rest, so he
    // never spins back through every full turn the child gave him.
    v._yaw -= Math.round((v._yaw - restYaw) / 360) * 360;
    v._targetYaw = restYaw;
    v._targetPitch = restPitch;
    if ('_targetRoll' in v) v._targetRoll = 0;
    v.orbitEase.rest = RELAX_TAU_S;
    v._orbitMode = 'rest';
  };
  let dragged = false;
  canvas.addEventListener('pointermove', (ev) => { if (ev.buttons) dragged = true; });
  const onUp = () => {
    if (!dragged) return; // a click is not a drag
    dragged = false;
    setTimeout(relaxHome, 0); // after the SDK's own pointerup (its turntable just stops)
  };
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
}

// dino-rigged-wave.glb is skinned (Tripo humanoid rig, 41 joints) with the clips wave, greet,
// idle_relax, cheer and jump, all in place. (dino-rigged.glb, the 78-joint biped, has no wave and its
// idle drives the right paw into the belly.) addModel loads the clips but plays none, so an anim
// component on the model root (the skeleton lives under it) drives them:
//   - he WAVES hi once he is on screen, and again whenever a hand first appears to the tracker;
//   - otherwise `idle_relax` loops;
//   - every pinch RELEASE plays `jump` once (a little hop each time the child lets go).
// One-shots blend back to the idle. ?clip=<name> loops one clip, for checking it on the panel.
// PlayCanvas path only (the three fallback stays still). Reduced-motion viewers get the still pose.
const BLEND_S = 0.3;
let dinoPlay = null;   // set once the rig is up; the voice's animate tool calls it

// Per-frame pose fixes, applied AFTER the clip has posed the skeleton (PlayCanvas fires the app's
// 'update' event after the anim system), so they hold for every clip:
//  1. Arms out. Tripo's clips keep the short arms tight to the body and the paws sink into the
//     belly. Each upper arm is turned outward, away from the body's centre line, by ARM_OUT_DEG
//     (about the axis perpendicular to the arm and the outward direction, in world space).
//     ?armout=<deg> tunes it on the panel.
//  2. Talking head-bob. While Dino's voice plays, the head nods and tilts a little with its
//     loudness (voice.level(), 0..1).
const ARM_OUT_DEG = 15;
async function startPoseFix(h) {
  const pc = await import('playcanvas');
  const app = h.viewer && h.viewer.app;
  if (!app) return;
  const q = new URLSearchParams(location.search);
  const armDeg = Number.isFinite(parseFloat(q.get('armout'))) ? parseFloat(q.get('armout')) : ARM_OUT_DEG;
  const find = (n) => h.model.findByName(n);
  const arms = [['L_Upperarm', 'L_Hand'], ['R_Upperarm', 'R_Hand']].map(([a, hand]) => [find(a), find(hand)]).filter(([a, b]) => a && b);
  const head = find('Head');
  const spine = find('Spine02') || find('Spine01');
  const rot = new pc.Quat(), inv = new pc.Quat(), world = new pc.Quat(), axis = new pc.Vec3(), dir = new pc.Vec3(), out = new pc.Vec3();
  let bob = 0;
  app.on('update', (dt) => {
    // 1. arms out
    if (armDeg && spine) {
      const mid = spine.getPosition();
      for (const [arm, hand] of arms) {
        const s = arm.getPosition();
        dir.sub2(hand.getPosition(), s).normalize();              // shoulder -> paw
        out.set(Math.sign(s.x - mid.x) || 1, 0, 0);              // away from the centre line (model faces +z)
        axis.cross(dir, out);
        if (axis.lengthSq() < 1e-8) continue;
        axis.normalize();
        rot.setFromAxisAngle(axis, armDeg);
        world.mul2(rot, arm.getRotation());                       // turn in world space ...
        inv.copy(arm.parent.getRotation()).invert();
        arm.setLocalRotation(inv.mul(world));                     // ... written back as local
      }
    }
    // 2. head-bob while talking
    if (head && voice) {
      const lv = voice.level();
      bob += (lv - bob) * Math.min(1, dt * 12);
      if (bob > 0.02) {
        const t = performance.now() / 1000;
        rot.setFromEulerAngles(bob * 9 * Math.sin(t * 9), 0, bob * 4 * Math.sin(t * 5.3));
        head.setLocalRotation(head.getLocalRotation().clone().mul(rot));
      }
    }
  });
}
const IDLE = 'idle_relax', GREET = 'wave', HOP = 'jump';
function startAnimation(h) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const clips = (h.container && h.container.animations) || [];
  if (!h.model || !clips.length || typeof h.model.addComponent !== 'function') return;
  const tracks = Object.fromEntries(clips.map((a) => [a.resource.name, a.resource]));
  const solo = new URLSearchParams(location.search).get('clip');
  const idle = tracks[solo] ? solo : tracks[IDLE] ? IDLE : Object.keys(tracks)[0];
  h.model.addComponent('anim', { activate: true });
  const anim = h.model.anim;
  for (const [name, t] of Object.entries(tracks)) anim.assignAnimation(name, t, undefined, 1, name === idle);
  anim.baseLayer.play(idle);
  if (solo) return;

  // One-shot: blend in, play once, blend back to the idle. Ignored while another is playing.
  let busyUntil = 0;
  const once = (name) => {
    const t = tracks[name];
    if (!t || performance.now() < busyUntil) return;
    anim.baseLayer.transition(name, BLEND_S);
    busyUntil = performance.now() + t.duration * 1000;
    setTimeout(() => anim.baseLayer.transition(idle, BLEND_S), Math.max(0, t.duration - BLEND_S) * 1000);
  };
  window.dinoPlay = once; // console / debug handle
  dinoPlay = once;        // the voice's animate tool
  setTimeout(() => once(GREET), 1200); // hi! once the cover is off
  startPoseFix(h);

  // Hands: a hand appearing -> wave; pinch release (either hand) -> hop + relax home.
  // Polled per frame; inert without a hand provider.
  const wasPinched = [false, false];
  let hadHands = false;
  let lastGreet = performance.now(); // the load greeting counts
  const GREET_COOLDOWN_MS = 15000;   // a flickering hand doesn't make him wave non-stop
  const tick = () => {
    const hs = h.hands;
    const c = hs && hs.controller;
    let n = 0;
    try { n = (hs && hs.state && hs.state.hands) | 0; } catch {}
    if (n > 0 && !hadHands && performance.now() - lastGreet > GREET_COOLDOWN_MS) {
      lastGreet = performance.now();
      once(GREET);
    }
    hadHands = n > 0;
    if (c) {
      for (const i of [0, 1]) {
        let p = false;
        try { p = !!c.pinched(i); } catch {}
        if (wasPinched[i] && !p) {
          once(HOP);
          let other = false;
          try { other = !!c.pinched(1 - i); } catch {}
          if (relaxHome && !other) relaxHome(); // the last pinch let go: relax home
        }
        wasPinched[i] = p;
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

start().catch((err) => {
  console.warn('inline 3D setup failed', err);
  dropCover();
});
