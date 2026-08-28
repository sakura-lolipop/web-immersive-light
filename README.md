# web-immersive-light

**Immersive Light for the Web** — a zero-dependency, two-file implementation of pointer-as-light-source proximity lighting, inspired by HarmonyOS [Immersive Light Sense](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/arkts-immersive-light-sense) (沉浸光感) and [Point Light](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ui-design-visual-effect-point-light) (点光源).

> HarmonyOS has `systemMaterial` + `pointLight` + `lightEffect` natively. The web has nothing — this fills the gap.

Extracted from [HotifyNEXT-Server](https://github.com/sakura-lolipop/HotifyNEXT-Server) /console (15-iteration R&D, 2026-08). Full pitfall ledger: source repo `webuipath.md` W8-W9.

## What it does

The pointer (or finger on touch) acts as a **light source** in a continuous physical field — light is not sliced by element boundaries:

```
k = clamp(1 − dist(light, element-rect-nearest-point) / 2R)
  k=1 inside element · 0<k<1 proximity glow · k≤0 off
```

| Channel | Mechanism | Visual |
|---|---|---|
| ① Wash blob | Pre-rendered radial, `translate3d` compositor | Continuous background light, zero repaint |
| ② Surface spot | `.lit::before` radial ∩ element | Light falls on the face |
| ③ Edge band | `.lit::after` border-mask reveals only 1.5px edge | Near-light edges catch light (the perceptually dominant channel) |
| ④ Input inline | `background-image` radial | Bypasses the no-pseudo-element platform limit on `<input>/<select>` |

Plus:
- **Row mode** (`.lit-row`): top-edge-only band for table/list rows — adjacent boundaries don't double up
- **Touch drag**: `touchstart/touchmove/touchend` channel (browser gesture capture kills `pointermove`; passive listeners don't block scroll)
- **Theme blend**: dark=`screen` / light=`normal` (screen on white is mathematically invisible)
- **`prefers-reduced-motion`**: skips entirely
- **Built-in fps HUD** (demo page)

## Quick start

1. Copy the `<style>` blocks from `index.html`: `:root` recipe vars, `#light-layer`, `.lit/.lit-row`
2. Add `<div id="light-layer"></div>` to your page
3. Tag lit elements: `class="lit"` (rows also get `lit-row`)
4. `<script src="light.js">`; edit the `SEL` registry line at the top to match your page

Tune appearance via `:root` `--light-*` variables (radius / strength / falloff / blend) — one definition, four channels consume.

## The 6 hard-won rules (skip one = rework cycle)

| Pitfall | Symptom | Rule |
|---|---|---|
| var-in-var freeze | Gradient in `:root` custom property → per-element vars stuck at defaults, light dead | Inline `var(--mx)` at the usage-site property |
| screen on light surface | Light theme glow invisible (screen(white,x)=white) | Theme-tiered blend variable |
| Gesture capture | Touch drag has no light (pointermove pointercancel'd) | Add touch channel; guard pointerleave with touchActive |
| Event passthrough | `addEventListener('scroll', queue)` → Event as candidates → all lights off | Wrap in zero-arg closure |
| Full-viewport repaint | Drag not smooth (per-frame main-thread gradient paint) | Pre-rendered blob + translate3d + will-change |
| Dual registry | CSS enumeration + JS list drift apart, surfaces missed | CSS only knows `.lit` class; registry lives solely in JS `SEL` |

## Demo

Open `index.html` directly. Space toggles theme. Drag/hover to see lighting. Bottom-left shows fps.

## License

GPL-3.0 — see [LICENSE](LICENSE).
