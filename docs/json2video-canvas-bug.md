# JSON2Video: rendered composition only fills 75% of the declared canvas height

**Account:** client `PoTQREmesJ`
**API:** v2 (`https://api.json2video.com/v2/movies`)
**Reported:** 23 August 2026

## Summary

For every movie we render, the composed content occupies exactly the **top 75% of the
declared canvas height**, full width. The remaining bottom 25% is pure black (max
luminance 0). The output file has the correct dimensions — only the composition inside
it is short.

This reproduces on **every resolution mode we tried**, so it is not preset-specific.

## Measurements

Frames were extracted with ffmpeg and measured pixel-by-pixel. "Content extent" is the
bounding box of any non-black pixel.

| `resolution` | Output frame | Content extent | Vertical fill |
|---|---|---|---|
| `custom` (width 1080, height 1920) | 1080×1920 | 1080×1441 | **75.1%** |
| `instagram-story` | 1080×1920 | 1080×1440 | **75.0%** |
| `instagram-feed` | 1080×1350 | 1080×1013 | **75.0%** |
| `squared` | 1080×1080 | 1080×811 | **75.1%** |

The `GET /movies?project=...` response reports the correct dimensions in every case
(e.g. `width: 1080, height: 1920`), so the metadata and the pixels disagree.

0.75 is the 72/96 dpi ratio, which may point at a CSS-pixel vs device-pixel scaling
step in the compositor.

## Minimal reproduction

A scene with a solid background colour and no elements is enough — no images or fonts
involved:

```json
{
  "resolution": "custom",
  "width": 1080,
  "height": 1920,
  "quality": "low",
  "cache": false,
  "scenes": [
    { "duration": 2, "background-color": "#FF0000", "cache": false, "elements": [] }
  ]
}
```

**Expected:** a 1080×1920 video that is red edge to edge.
**Actual:** a 1080×1920 video where the red fills only `y = 0 … 1439`; `y = 1440 … 1919`
is pure black.

## Secondary observations

While isolating the above we hit several behaviours that differ from the documentation.
These may share a root cause.

1. **`position` presets.** The docs for the text element list `top-left`, `top-right`,
   `bottom-left`, `bottom-right`, `center-center`, `custom`. There is no `top-center` or
   `bottom-center`; passing one is silently accepted and appears to fall back to
   `custom`, at which point the supplied `y` is treated as an absolute coordinate. A
   validation error would have saved a lot of time here.

2. **`x` / `y` on text elements.** With `position: "custom"`, three text elements
   requested at `y = 100`, `900` and `1700` rendered as only **two** visible bands,
   centred at `y ≈ 797` and `y ≈ 1397`. One element did not appear at all.

3. **`width` / `height` on image elements ignored.** An image given
   `width: 600, height: 600, position: "custom", x: 240, y: 100` rendered at
   `1080×1441` positioned at `(0,0)` — it filled the composition area instead of
   honouring the requested box.

4. **`width` / `height` on `html` elements ignored.** An HTML element containing a
   `400px × 400px` circle (`border-radius: 50%`) rendered as `1080×300` at `(0,0)`
   rather than a 400×400 circle at the requested position.

## Impact

Every video we generate loses the bottom quarter of the frame, and any overlay
positioned for the lower part of the canvas is either clipped or lands somewhere
unexpected. For vertical 1080×1920 social video this makes the output unusable without
manual correction.

## What we tried

- Switching between `custom` and every relevant preset — no change (all 75%).
- Disabling `cache` at movie, scene and element level — no change.
- Replacing text elements with a single full-canvas `html` element — same 75% ceiling.
- Cropping and rescaling the result with ffmpeg afterwards — does not recover the
  missing composition, since the content was never rendered there.
