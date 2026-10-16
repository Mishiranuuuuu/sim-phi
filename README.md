# Phigros Simulator (Modded)

> An enhanced web-based Phigros & PGS simulator built with TypeScript, HTML5 Canvas, and WebGL.  
> Originally created by [lchzh3473](https://github.com/lchzh3473/sim-phi) &bull; Modded by **WakaranaiDesu**.

---

## What This Mod Offers

This fork brings extensive enhancements, official Phigros chart mechanics, custom WebGL shaders, and quality-of-life features to the web simulator:

### Full Phigros Block Area & Noise Field

- **Complete Event Parsing**: Full support for `blockAreaList` including `moveEvents`, `rotateEvents`, and `scaleEvents` with custom easing equations (`blockEasing`).
- **Hierarchical Anchor Mechanics**: Independent rotation anchors and scale anchor pivot points with historical coordinate transformation.
- **Accurate Touch Blockage**: Active normal block areas block player touches from triggering notes, while subtract block areas exempt touches from blockage.
- **Smooth Fade & Timing**: Implements `appearTime`, `enableTime`, `disableTime`, and `disappearTime` transitions.

### Noise Field Renderer

Choose your preferred rendering style dynamically from the in-game **Settings** menu:

- **WebGL Shader Mode (`Noise field WebGL shader` ON)**:
  - Screen-space noise distortion with displacement textures (`BlockNoise1`).
  - Animated sparkling particle effects (`PointNoise`).
  - Atmospheric noise tint (`FD_Noise_00000`) and glowing edge dilation.
  - Interactive touch dissolution ripples (`TouchHover`) that react to player fingers.
- **2D Canvas Fallback Mode (`Noise field WebGL shader` OFF)**:
  - Lightweight, high-performance canvas composite renderer.
  - Distinct pulsating white warning state during the 1-second interval before activation.
  - Vibrant red active field with real-time `destination-out` subtract cutout masks.

### Developer & Debugging Suite

- **Debug blockArea**: Real-time bounding box outline rendering (cyan for subtract, red for normal).
- **Show blockArea debug text**: Live HUD telemetry for active status, local dimensions, anchor coordinates, and rotation degrees.
- **Show anchor point**: Visualizes judge line and block area anchor pivots.
- **English UI Translation**: All menus, settings, toasts, and error dialogues fully localized into English.

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

3. Start local development server:

   ```bash
   npm run dev
   ```

   Open `http://localhost:5173/` in your browser.

4. Build for production:

   ```bash
   npm run build
   ```

   Production bundle is compiled into the `dist/` directory.

---

## How to Play

1. **Load a Chart**:
   - Drag and drop a Phigros chart zip file into the upload zone, or click **Upload** to select individual chart (`.json` / `.csv`), music (`.mp3` / `.ogg`), and illustration (`.png` / `.jpg`) files.
2. **Configure Parameters**:
   - Adjust aspect ratio, note scale, background dim, audio offset, and mirror options directly from the top panel.
3. **Controls during playback**:
   - **Double-click top-left**: Pause / Resume.
   - **Double-click top-right**: Restart.
   - **Double-click bottom-right**: Toggle Fullscreen.

---

## Credits & Acknowledgements

- **Original Project**: [lchzh3473/sim-phi](https://github.com/lchzh3473/sim-phi) by [lchzh3473](https://github.com/lchzh3473).
- **Noise Shader & Asset Inspiration**: [Phira](https://github.com/TeamFlos/phira) & [Phira-Pro](https://github.com/Phira-Pro/Phira-Pro).
- **Fonts**:
  - [Saira](https://github.com/Omnibus-Type/Saira) by Omnibus-Type (SIL Open Font License).
  - [Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC) by Google.

---

## Disclaimer & License

- This project is a non-commercial, personal-interest fan simulator intended for learning and testing purposes only.
- This project and its contributors are **not affiliated with, endorsed by, or sponsored by Pigeon Games**.
- This repository does not distribute proprietary game assets, official music, or copyrighted charts.
- Open-sourced under the **[GNU General Public License v3.0 (GPL-3.0)](LICENSE.txt)**.
