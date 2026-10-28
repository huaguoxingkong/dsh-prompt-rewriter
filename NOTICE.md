# NOTICE — Third-party material

This project reproduces visual assets from outside this repository **verbatim**
(never redrawn, approximated or recoloured), so the plugin's controls look and
move exactly like the DeepSeek Harness UI they sit in.

**This is an unofficial, community project.** It is not affiliated with,
authorized by, sponsored by, or endorsed by DeepSeek. No trademark license is
granted. All brand names and marks remain the property of their owners.

---

## 1. Whale-tail contours — MIT, verified

| | |
|---|---|
| Where | `client.js` → `TWIST_VIEWBOX`, `TWIST_FRAMES` (36 contours), `TWIST_STATIC_MASK` (one frame, as an SVG mask) |
| Used for | the busy/spinner state; the Settings navigation glyph |
| Source | npm package **`dsh-status-rotator` v0.38.0**, `lib/client.js` → `TAIL_TWIST_POSES` |
| Author | **01Virex** — https://github.com/01Virex/dsh-status-rotator |
| License | **MIT** (`"license": "MIT"` in the published manifest; `LICENSE` reads *Copyright (c) 2026 01Virex*) |

### Verification performed

The shipped contours were compared against the published package rather than
assumed:

- Downloaded `dsh-status-rotator@0.38.0` from the npm registry
- Extracted `TAIL_TWIST_POSES` from `lib/client.js`
- Normalised whitespace and compared all 36 paths against `TWIST_FRAMES`

Result: **36/36 identical, in the same shape set.** The full MIT text of the
source is reproduced inside `LICENSE` to satisfy its retention clause.

### Frame order

`TWIST_FRAMES` preserves the source's rotation exactly:

```js
TAIL_TWIST_POSES.slice(29).concat(TAIL_TWIST_POSES.slice(0, 29))
```

That rotation moves the loop seam onto a matched junction (the source documents
frame 29 as the twist junction); using the raw table order would jump once per
cycle.

### Note on "official" motion

The source plugin ships **four** tail motions. Its *“official”* one (`wag`,
`sway`, `twist`, `official`) is a separate **150-frame** animation decoded from
the DSH host, labelled 「官方原版晃动」. **This project uses `twist` (36 frames),
not that 150-frame official motion.** The source's own comment for the
`twist`/`wag` tables says they were *"traced from the supplied 24-frame GIF"*
without naming whose GIF it is, so whether those contours themselves derive
from DeepSeek artwork is **not established by the available material**. If that
provenance matters to you, ask upstream.

## 2. DeepSeek 「大肥鱼」 brand mark — NOT MIT

| | |
|---|---|
| Where | `client.js` → `FISH_VIEWBOX`, `FISH_PATH` |
| Used for | the resting state of the composer button |
| Source | the DeepSeek Harness frontend package `dsh-web-frontend`, exported as `FISH_LOGO_PATH` / `FISH_LOGO_VIEWBOX` and drawn by its `FishLogo` component |
| Owner | DeepSeek |
| License as found | **no license file accompanied the source package** |

The path data is copied byte-for-byte; the only runtime transformation is
filling it with `currentColor` so it inherits the button foreground.

**This asset is excluded from the MIT grant** (see `LICENSE`).

---

## Summary

| Material | License | Included in MIT? |
|---|---|---|
| Plugin code (`index.js`, `client.js` logic, locale, styles) | MIT | yes |
| Whale-tail contours (01Virex) | MIT | yes, with attribution retained |
| DeepSeek brand mark | none found | **no** |

## Takedown

If you hold rights to any material listed above and object to its inclusion,
open an issue in this repository. The affected artwork will be removed or
replaced promptly, without requiring justification.
