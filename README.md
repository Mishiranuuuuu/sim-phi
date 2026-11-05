# Phigros Simulator (Modded)

> An enhanced web-based Phigros, PEC & RPE chart simulator built with TypeScript, HTML5 Canvas, and WebGL.  
> Originally created by [lchzh3473](https://github.com/lchzh3473/sim-phi) &bull; Modded by **WakaranaiDesu**.

---

## What This Mod Offers

This fork brings extensive chart compatibility, official Phigros & RPE-Next noise field mechanics, WebGL post-processing shaders, engine optimizations, and quality-of-life features to the web simulator:

### Broad Chart & Package Support

- **Multi-Format Charts**: Native playback for official Phigros JSON (`PGS` v1/v3), `PEC` (`.pec`), and **Re:PhiEdit (`RPE`)** JSON charts.
- **Archives & Folders**: Load `.zip` and Phira `.pez` packages (including nested archives), upload entire chart directories, or select loose files.
- **Metadata Auto-Fill**: Automatically reads chart metadata and line textures from `info.yml` / `info.yaml` (Phira), `info.txt` / `Settings.txt` (PEC/RPE), `info.csv`, and `line.csv`.

### Full Block Area & Noise Field System

Supports all three major noise field specifications alongside authentic audio-visual feedback:

- **Official Phigros `blockAreaList`**:
  - Percentage-based coordinates with `moveEvents`, `rotateEvents`, and `scaleEvents` using official `blockEasing` curves.
  - Cumulative pivot transformations across independent rotation and scale anchors.
  - Smooth `appearTime`, `enableTime`, `disableTime`, and `disappearTime` lifecycle transitions.
- **RPE-Next `blockAreaList`**:
  - 1350&times;900 RPE canvas space with beat-fraction timing via `BPMList` (`RPETempo`).
  - Robert Penner easing curves (`1`–`29`) with easing clipping (`easingLeft` / `easingRight`) and cubic Bézier curves.
  - Multi-interval `activeIntervals` with configurable `readyFlash` warning durations.
- **`Line2Area` Marker Lines**:
  - Converts RPE judge lines with `isSubtract0.*` (normal) or `isSubtract1.*` (subtract/invert) marker textures into dynamic noise fields.
  - Supports lifecycle control via speed event codes (`1` = appear, `2` = enable, `3` = disable, `4` = disappear) or alpha thresholds (`<= 0` hidden, `<= 128` disabled, `> 128` active), custom anchors, and `scaleXEvents` / `scaleYEvents`.
- **Touch Blockage & Audio Low-Pass Muffling**:
  - Active noise fields block touches persistently until the finger/pointer is released, respecting odd/even parity subtract cutouts (or `noiseAreaOptions.ignoreTripleInversion`).
  - **Low-Pass Audio Filter (`BlockAudio`)**: Applies a smooth 2nd-order Butterworth `1500 Hz` low-pass filter sweep on the chart BGM while a touch contacts an active noise field (ported from Phigros v4.0.1 / Phira-Pro).

### Dual-Mode Noise Field Renderer

Switch rendering styles dynamically from the in-game **More Settings** menu:

- **WebGL Shader Mode (`Noise field WebGL shader` ON)**:
  - Two-pass WebGL pipeline rendering disabled background sparkles behind judge lines and active field distortion above notes.
  - Optimized CPU scanline mask rasterization and edge-glow dilation (`BlockMask`).
  - Screen-space displacement (`BlockNoise1`), animated particle sparks (`PointNoise`), atmospheric noise tint (`FD_Noise_00000`), ready-flash highlights, and interactive touch dissolution ripples.
  - Automatically falls back to scanline-tessellated 2D quads (`BlockSimple`) if WebGL is unavailable.
- **2D Canvas Fallback Mode (`Noise field WebGL shader` OFF)**:
  - Lightweight 2D canvas symmetric-difference renderer (`destination-out` normal/subtract masking).
  - Distinct pulsating white ready-flash warning prior to activation and vibrant red active fields.

### Post-Processing Shaders & `extra.json` Effects

- **Phira `extra.json` Compatibility**: Beat-synchronized WebGL post-processing effects with animated `float`, `vec2`, and `vec4` uniform keyframe tracks (supporting RPE `1`–`29` easings, clipping, and cubic Bézier curves), custom `order` sorting, and `global` vs. non-global pass separation.
- **Built-In Preset Shaders**: Includes `chromatic`, `radialBlur` (`radial_blur`), `vignette`, `circleBlur` (`circle_blur`), `fisheye`, `glitch`, `grayscale`, `noise`, `pixel`, and `shockwave`.
- **Custom GLSL Shaders**: Loads custom `.glsl`, `.frag`, `.vert`, `.fs`, and `.vs` shaders bundled in chart archives, parsing `// %default%` uniform annotations and built-in uniforms (`time`, `screenSize`, `screenTexture`, `UVScale`).
- **UI/HUD Pass Control**: Toggle `All shaders affect UI/HUD` in Settings to force non-global post-processing shaders to apply over HUD elements as well.

### Extended RPE Chart Features

- **Extended Judge Line Events**: Full support for `scaleXEvents`, `scaleYEvents`, `colorEvents` (RGB line and cached custom texture tinting), `textEvents` (multiline `\n` text with anchor-aware alignment), custom line `anchor` (`[x, y]`), `zOrder` layer sorting, `isCover` note masking, `bpmfactor`, parent-child `father` hierarchies, and custom RPE judge line textures.
- **UI Attachment (`attachUI`)**: Bind judge lines to HUD elements (`pause`, `comboNumber`, `combo`, `score`, `bar`, `name`, `level`) to dynamically animate their position, rotation, scale, opacity, color, or text.
- **Note Controls & Properties**: Per-line distance-based `posControl`, `sizeControl`, `alphaControl`, `yControl`, and `skewControl` tracks, plus `isFake`, `size`, `yOffset`, `visibleTime`, and `alpha` note properties.

### Performance, Localization & Debugging Suite

- **Engine Optimizations**: Fast scanline mask rasterization, downscaled scene capture & zone pooling, tinted-texture caching, monotonic binary-search track sampling, and cursor-based note judgement scanning. Chart playback speed (`Slowest`–`Fastest`) stays synchronized across notes, noise fields, and shader timelines.
- **Debug blockArea**: Real-time oriented bounding-box outlines (cyan for subtract, red for normal) and pivot markers.
- **Show blockArea debug text**: Live HUD telemetry for visibility/active state, subtract mode, coordinates, dimensions, scale, and rotation degrees.
- **Show anchor point**: Visualizes judge line IDs and note anchor pivots.
- **English UI Localization**: All menus, settings, modals, warnings, and HUD messages localized into English with **Saira** and **Noto Sans SC** typography.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm`

### Installation & Development

1. Clone the repository:

   ```bash
   git clone https://github.com/Mishiranuuuuu/sim-phi.git
   cd sim-phi
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the local development server:

   ```bash
   npm run dev
   ```

   Open `http://localhost:5173/` in your browser.

4. Build & preview for production:

   ```bash
   npm run build
   npm run preview
   ```

   The production bundle is compiled into the `dist/` directory.

---

## How to Play

1. **Load a Chart**:
   - Upload or drag-and-drop a `.zip` or `.pez` chart archive, upload a chart folder, or select individual chart (`.json` / `.pec`), metadata (`info.yml` / `info.csv` / `info.txt` / `line.csv`), shader (`extra.json` / `.glsl` / `.frag`), audio/video (`.mp3` / `.ogg` / `.wav` / `.mp4` / `.webm`), and illustration (`.png` / `.jpg` / `.webp`) files.
2. **Configure Parameters**:
   - Adjust aspect ratio, note scale, background dim, playback speed, mirror mode, and audio offset from the main panel, or open **More Settings** for shader, resolution, statistics, and debugging toggles.
3. **Controls During Playback**:
   - **Double-click top-left** (or press `Shift`): Pause / Resume.
   - **Double-click top-right**: Restart.
   - **Double-click bottom-left**: Toggle real-time statistics overlay.
   - **Double-click bottom-right**: Toggle Fullscreen.

---

## Credits & Acknowledgements

- **Original Project**: [lchzh3473/sim-phi](https://github.com/lchzh3473/sim-phi) by [lchzh3473](https://github.com/lchzh3473).
- **Noise Shader, Preset Shaders & RPE Mechanics Inspiration**: [Phira](https://github.com/TeamFlos/phira), [Phira-Pro](https://github.com/Phira-Pro/Phira-Pro), & [RPE next](https://github.com/kclg-YSJ/rpe-next).
- **Fonts**:
  - [Saira](https://github.com/Omnibus-Type/Saira) by Omnibus-Type (SIL Open Font License).
  - [Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC) by Google.

---

## Disclaimer & License

- This project is a non-commercial, personal-interest fan simulator intended for learning and testing purposes only.
- This project and its contributors are **not affiliated with, endorsed by, or sponsored by Pigeon Games**.
- This repository does not distribute proprietary game assets, official music, or copyrighted charts.
- Open-sourced under the **[GNU General Public License v3.0 (GPL-3.0)](LICENSE.txt)**.
