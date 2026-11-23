# Hello, dinosaur: how the page works and how to run it

An inline-3D page for a glasses-free 3D display (DisplayXR, `@displayxr/inline3d` 1.56.2 on PlayCanvas 2.24.0).
A child can pinch and turn a friendly dinosaur with tracked hands, and talk to him.

## Deploying

- Pushing to `main` deploys production on Vercel (project `hello-dino-2612`, git-connected). Pushing a branch gives an SSO-gated preview.
- The GLBs are committed. Nothing is built: the site is static, plus one serverless function (`api/session.js`).
- Local test, with the voice endpoint working: `OPENAI_API_KEY=… node tools/dev_server.mjs`, then open `http://127.0.0.1:8137/`. Localhost counts as a secure context, so the microphone works.

## What's on the page

| Piece | Where | Notes |
|---|---|---|
| Model | `assets/dino-rigged-wave.glb` | Tripo humanoid rig, 41 joints. Clips: `wave`, `greet`, `idle_relax`, `cheer`, `jump`. Original eye texture (a blue recolour was tried and rejected). |
| Animation | `app.js` → `startAnimation` | `idle_relax` loops. `wave` plays on load and when a hand first appears (15 s cooldown). `jump` plays on every pinch release. `?clip=<name>` loops one clip. |
| Arm fix | `app.js` → `startPoseFix` | After every clip, each upper arm turns 15° outward, so the paws don't sink into the belly. Tune with `?armout=<deg>`. Runs in `app.on('update')`, which fires after the anim system. |
| Screen plane | `app.js` → `dinoFrame` | The area-weighted 75th-percentile depth of the surface sits on the glass, so about 25% of the dino is in front of it. The box centre put 65% in front, because the tail drags the box centre back. Override with `?zdp=box\|median`. Being upstreamed as the SDK default: DisplayXR/displayxr-web#327. |
| Slow relax | `app.js` → `startRelax` | After a drag or pinch release, he eases back to his start pose (τ = 1.5 s, shortest way round). Turning is free while dragging. Zoom is untouched. |
| Backdrop | `app.js` → `addBackdrop` | A pre-blurred meadow on an unlit plane parented to `viewer.rigNode`, 0.8 virtual-display heights behind the glass, so it has real rear depth and stays still while he turns. A CSS layer would sit at the glass and cut the tail. `?bdz=<vH>` tunes the depth. |
| Talk to Dino | `voice.js`, `api/session.js` | See below. The chip is top right, away from the 3D model. |

**Why `viewer.rigNode`:** `addModel` keeps the model still and orbits a camera rig around it. The rig node's local frame is the display frame: the screen at the origin, `virtualDisplayHeight` tall, +z toward the viewer. Anything that must stay fixed on screen goes under it, in those units.

## Talk to Dino (OpenAI Realtime)

- `api/session.js` mints a 60-second OpenAI Realtime client secret (`gpt-realtime-2.1`, voice `coral`). The child-safe persona, semantic turn detection (tuned for children who pause) and an `animate` tool (`wave` / `jump` / `greet`) are all fixed on the server.
- The API key lives only in the Vercel environment variable `OPENAI_API_KEY` (Sensitive). It is never in the page.
- `voice.js` opens one WebRTC call: microphone in, Dino's voice out. `animate` tool calls drive the rig, and the loudness of his voice drives a small head-bob.
- **Limits:**
  - a conversation ends after 4 minutes, or after 45 s with nobody talking
  - each reply is capped at 300 tokens
  - 8 sessions per IP per 10 minutes (best effort, per server instance)
  - same-site origin only, POST only
- **Kill switch:** set `DINO_VOICE=off` in the Vercel project to turn voice off.
- **Recommended hard ceilings:**
  - a monthly budget on the OpenAI project, ideally with a dedicated key restricted to Realtime
  - a Vercel Firewall rate-limit rule on `/api/session`, available on the Pro plan

## Running it on the panel

- **Open only the dino tab in the DisplayXR Browser.** A second inline-3D tab that rarely redraws (a test page, for instance) can hold the panel and keep switching the lens to 2D for every page. That looks like "the 3D is flat" even though tracking works.
- Hands: a Leap camera flat on the desk, 20–30 cm in front of the panel, with hands 20–40 cm above it.

## Asset provenance

See `README.md`. The model is Tripo H3.1, rigged and animated with Tripo. The backdrop is a GPT-Image sunburst, Gaussian-blurred.
