# Hello, dinosaur

A one-model inline-3D page built with [@displayxr/inline3d](https://www.npmjs.com/package/@displayxr/inline3d) and PlayCanvas.

- **Viewer:** a cartoon dinosaur you can turn by dragging, or with an Ultraleap hand.
- **3D display:** in the DisplayXR Browser it shows in depth. Everywhere else it falls back to 2D.

Live: https://hello-dino-2612.vercel.app (`?debug` shows the hand-pinch readout).

It's a static site with no build step. Every push to `main` deploys to Vercel.

## Assets

| File | What |
|---|---|
| `assets/dino.glb` | The page model, with one looping `idle` clip on a parent node, facing +Z. |
| `assets/dino-static.glb` | The unanimated original. |

The model was generated with Tripo H3.1 (text to 3D), with a light cleanup in Blender. Prompt: "a friendly cartoon baby dinosaur, standing, waving, green with a yellow belly".

## Notes

- **Close other inline-3D tabs.** Keep only this tab open in the DisplayXR Browser: another inline-3D tab can hold the panel and switch it to 2D.
- **Pins are exact.** The import map pins playcanvas and @displayxr/inline3d. Bump them together, and only after reading the SDK changelog.
