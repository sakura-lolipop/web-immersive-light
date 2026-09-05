# web-immersive-light

**Immersive Light for the Web** — a zero-dependency, two-file implementation of pointer-as-light-source proximity lighting with **light-domain occlusion**, inspired by HarmonyOS [Immersive Light Sense](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/arkts-immersive-light-sense) (沉浸光感) and [Point Light](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ui-design-visual-effect-point-light) (点光源).

> HarmonyOS has `systemMaterial` + `pointLight` + `lightEffect` natively. The web has nothing — this fills the gap.

Extracted from [HotifyNEXT-Server](https://github.com/sakura-lolipop/HotifyNEXT-Server) /console (15-iteration R&D 2026-08, canvas rewrite + light-domain CP 2026-09-01). Full pitfall ledger: source repo `webuipath.md` W8–W16.

## v2 (2026-09-01): canvas renderer + light domain

v1 rendered with CSS (blob div + `::before`/`::after` pseudo-elements + inline gradients) — four rendering owners. **v2 is a single full-screen `<canvas>` drawing loop** (the source repo's production architecture), and adds **light-domain occlusion**:

```
k = clamp(1 − dist(light, element-rect-nearest-point) / 2R)
  k=1 inside element · 0<k<1 proximity glow · k≤0 off
```

| Channel | Mechanism | Visual |
|---|---|---|
| ① Wash blob | Pre-rendered 128px sprite, `drawImage` GPU path | Continuous light around the pointer |
| ② Surface spot | Per-element clip (border-radius aware) + radial | Light falls on the face |
| ③ Edge band | Perimeter segmented (straight + corner arcs), per-segment α with micro-gradients | Near-light edges catch light (the perceptually dominant channel) |
| ④ Input ring+spot | Same band primitives inside inputs; focus defers to the native ring | Inputs read as lit surfaces |

Plus:

- **Light domain (the headline rule)**: a modal is a *well* — while open, light reaches only the modal; the page below stays dark. And the page canvas sits at z1049, **below any overlay you add** (panels, toasts, future containers) — they physically occlude light with zero registration. Modal open → canvas z2000 floats light on the modal surface.
- **Occlusion between overlapping surfaces** (2026-09-06, ported from the source repo's 9th revision): give any floating surface the `light-over` class and it casts a shadow — a covered element's ink is clipped out of the overlap, and while the pointer rests on the covering element the covered one stays fully dark (exposed sliver included). Purely adjacent surfaces keep normal proximity lighting. Same-stacking-context DOM order decides who covers whom; cross-context stacking needs the source repo's dual-canvas build.
- **Row mode**: top-edge-only band for table/list rows — adjacent boundaries don't double up
- **Touch**: dedicated touch channel (gesture capture kills `pointermove`), finger-stack caching at 40px threshold
- **Scroll-follow**: compositor-phase repaint loop while scrolling (event-driven paint lags one frame on mobile = trailing ghost)
- **Theme blend**: dark=`screen` / light=`normal` (screen on white is mathematically invisible)
- **`prefers-reduced-motion`**: skips entirely
- **Built-in fps HUD** (`?light=bench`) and self-proof mode (`?light=boost`)

## Quick start

1. Copy the `<style>` blocks from `index.html`: `:root` recipe vars + `#light-canvas`
2. Add `<canvas id="light-canvas"></canvas>` (first child of `<body>`)
3. Register your lit surfaces in the `SEL` registry at the top of `light.js` (`.card`, rows → also `SEL_ROW`, inputs → `INPUTS`)
4. `<script src="light.js">`
5. **When you open/close a modal (any `.modal.in`), call `window.__lightRepaint()`** — domain switches repaint and invalidate the touch stack

Tune appearance via `:root` `--light-*` variables — one definition, four channels consume.

## The 7 hard-won rules (skip one = rework cycle)

| Pitfall | Symptom | Rule |
|---|---|---|
| var-in-var freeze | Gradients in `:root` custom properties → per-element vars stuck at defaults | Read raw values in JS, one recipe in `:root` |
| screen on light surface | Light-theme glow invisible | Theme-tiered `--light-a-base`/`--light-blend` |
| Gesture capture | Touch drag has no light | Touch channel; guard `pointerleave` with `touchActive` |
| Full-viewport repaint | Drag not smooth | Sprite + `drawImage` + segmented-band fast path + scroll-follow loop |
| Dual registry | CSS enumeration and JS list drift apart | Registry lives solely in JS `SEL` |
| Event passthrough | `addEventListener('scroll', queue)` → Event as candidates → all lights off | Zero-arg closure + `capture:true` (inner scroll containers don't bubble) |
| **Light bleeding through overlays** | **Modal open → page surfaces under/next to it still light up (flat distance field has no z concept); canvas above everything → light floats over the modal** | **Light domain: modal = well (only well + descendants lit); canvas z follows domain (1049 page / 2000 modal) — any overlay above 1049 occludes for free** |

## Multi-modal stacks

The sample's domain truth is a DOM query (`.modal.in`) — fine for single-modal layers. If you stack modals (confirm over dialog) and need *top-of-stack* authority with open/close ordering, see the source repo's `modalStack`-backed `scopeOf()` (`internal/webui/js/15-light.js`).

## Demo

Open `index.html` directly. Space toggles theme. **"Open modal" demonstrates the light domain** — move the pointer inside the modal and watch the page stay dark. Bottom-left shows fps with `?light=bench`.

## Framework integration notes

> The v1 memos integration (`examples/memos`) targeted the **v1 CSS architecture** — treat it as a reference for anchor strategy (stable `data-*` attributes, no conditional `className` on lit surfaces); the CSS/pseudo-element specifics are obsolete under v2. A v2 refresh is pending real integrator demand.

### Theming without Tabler

The sample ships its own `html[data-theme=light]` override block. Adapt the selector to your theme mechanism (`data-bs-theme`, `.dark`, `prefers-color-scheme`, …) — override `--light-a-base` + `--light-blend`.

### Canvas layering in your app

`#light-canvas` must sit above normal content and below your overlays. The built-in z policy: page domain 1049 / modal domain 2000. If your app uses a different z-scale, adjust `applyScope()` and keep overlays above the page value — that's the whole contract.

## License

GPL-3.0 — see `LICENSE`.
