# Example: memos (React + TypeScript + Tailwind CSS v4)

Real-world integration demo — full-stack live run against [memos](https://github.com/usememos/memos) v0.24.x.

## What was changed (+94 lines, 7 files)

| File | Change |
|---|---|
| `web/src/light.js` | Library copy; `SEL` adapted to memos selectors |
| `web/src/index.css` | +89 lines: recipe vars + `#light-layer` + `.lit/.lit-row` (in `@layer base`) |
| `web/index.html` | +1 line `<div id="light-layer">` |
| `web/src/main.tsx` | +1 line `import "./light"` |
| `components/MemoView/constants.ts` | Anchor: `lit lit-row` inserted into `MEMO_CARD_BASE_CLASSES` |
| `components/AppSidebar/SidebarRow.tsx` | Anchor: `lit` inserted into sidebar row classes |
| `components/ui/dialog.tsx` | Added missing `data-slot="dialog-content"` (shadcn convention) |

## Files in this directory

- `light.js` — the adapted copy (SEL changed, rest identical to root `light.js`)
- `patches/memos-integration.patch` — full `git diff` from clean clone to working demo
- `shots/` — screenshots (dark/light × card/sidebar/dialog)
- ~~`scripts/`~~ probe scripts removed (they hardcoded local paths; pixel probes described in the source repo `webuipath.md` W15/W16)

## How to reproduce

```bash
git clone https://github.com/usememos/memos
cd memos
git apply examples/memos/patches/memos-integration.patch
# start Go backend (port 8081)
go run ./bin/memos/server --mode dev --port 8081
# start frontend (port 3001)
cd web && pnpm install && pnpm dev
```

## Validation results

13/13 assertions passed:
- `#light-layer.on` toggles on pointermove
- Memo card gets `.lit` + `--light-k: 1.000` inside, `k<1` proximity
- Sidebar rows get `.lit .lit-row` (row separator mode)
- `::before` gradient rendered on lit surfaces
- `::after` 1.5px edge band visible
- Blob `translate3d` on compositor
- Dialog lit + `position:fixed` preserved (Tailwind v4 `@layer base` fix works)
- Lights off when pointer leaves influence radius

Pixel-diff (dark theme):
- Edge band: blue channel avg +28.9, max +43
- Surface spot: max +109
- Blob: max +104
- Far control region: exactly 0 (no leakage)

Light theme: normal-blend semantics confirmed — white card edge (255,255,255)→(227,232,238) blue-gray shift.

## Key pitfalls found (already in main README)

1. **Tailwind v4 cascade layers**: `.lit{position:relative}` must be in `@layer base` — unlayered CSS wins over utilities, breaks `position:fixed`
2. **React conditional className**: `classList.add('lit')` is external DOM mutation; conditional class re-render wipes it. Use stable anchors (`data-slot`) or wrapper elements
3. **No semantic classes in Tailwind-only apps**: insert anchor constants into component templates
