/**
 * Procedural PBR Material Maps & Real-Time Schlieren Video Feed Generator.
 * Ensures architectural basalt, honed slate, brushed titanium, and spatial displays
 * have distinct, grounded physical response rather than flat uniform plastic.
 */
import * as THREE from 'three';

export function createBasaltTextures() {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  colorCanvas.width = roughCanvas.width = bumpCanvas.width = size;
  colorCanvas.height = roughCanvas.height = bumpCanvas.height = size;

  const cCtx = colorCanvas.getContext('2d');
  const rCtx = roughCanvas.getContext('2d');
  const bCtx = bumpCanvas.getContext('2d');

  cCtx.fillStyle = '#06121a';
  cCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#c8c8c8';
  rCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  // Horizontal split-stone basalt strata + micro fracture grain
  let seed = 4219;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 1600; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const w = 14 + rand() * 68;
    const h = 4 + rand() * 20;
    const v = Math.floor(8 + rand() * 18);
    cCtx.fillStyle = `rgb(${Math.floor(v * 0.45)}, ${Math.floor(v * 0.85)}, ${v + 8})`;
    cCtx.fillRect(x, y, w, h);

    const bVal = Math.floor(70 + rand() * 115);
    bCtx.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
    bCtx.fillRect(x, y, w, h * 0.65);

    const rVal = Math.floor(175 + rand() * 65);
    rCtx.fillStyle = `rgb(${rVal},${rVal},${rVal})`;
    rCtx.fillRect(x, y, w, h);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  for (const t of [map, roughnessMap, bumpMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 2);
  }
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, roughnessMap, bumpMap };
}

export function createHonedSlateFloorTextures() {
  const size = 1024;
  const colorCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  colorCanvas.width = roughCanvas.width = size;
  colorCanvas.height = roughCanvas.height = size;

  const cCtx = colorCanvas.getContext('2d');
  const rCtx = roughCanvas.getContext('2d');

  cCtx.fillStyle = '#050e15';
  cCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#5c666d';
  rCtx.fillRect(0, 0, size, size);

  let seed = 9913;
  const rand = () => {
    seed = (seed * 48271) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 3200; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 6 + rand() * 44;
    const shade = Math.floor(6 + rand() * 14);
    cCtx.fillStyle = `rgba(${shade}, ${shade + 7}, ${shade + 12}, 0.22)`;
    cCtx.beginPath();
    cCtx.arc(x, y, r, 0, Math.PI * 2);
    cCtx.fill();

    const rv = Math.floor(68 + rand() * 75);
    rCtx.fillStyle = `rgba(${rv}, ${rv}, ${rv}, 0.24)`;
    rCtx.beginPath();
    rCtx.arc(x, y, r * 1.1, 0, Math.PI * 2);
    rCtx.fill();
  }

  // Architectural slab expansion joints
  cCtx.strokeStyle = 'rgba(2, 5, 8, 0.85)';
  cCtx.lineWidth = 3;
  for (let g = 0; g <= size; g += 256) {
    cCtx.beginPath(); cCtx.moveTo(g, 0); cCtx.lineTo(g, size); cCtx.stroke();
    cCtx.beginPath(); cCtx.moveTo(0, g); cCtx.lineTo(size, g); cCtx.stroke();
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  map.wrapS = map.wrapT = roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  map.repeat.set(7, 7);
  roughnessMap.repeat.set(7, 7);
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, roughnessMap };
}

/**
 * Remaps bright white inner-blouse pixels on Avaturn's suit texture to a tailored
 * midnight-slate knit (#0E1822) and deepens suit charcoal (#1C252E) to match our approved storyboard.
 */
export function tailorSuitAlbedoTexture(sourceTex) {
  if (!sourceTex || !sourceTex.image) return sourceTex;
  const img = sourceTex.image;
  const w = img.width || 1024;
  const h = img.height || 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);

    if (lum > 145 && sat < 38) {
      // Inner white shirt -> deep midnight mock-neck knit (#0E1822) preserving fold shading
      const shade = lum / 255;
      d[i] = Math.round(14 * shade);
      d[i + 1] = Math.round(25 * shade);
      d[i + 2] = Math.round(36 * shade);
    } else {
      // Tailor grey suit -> rich architectural charcoal-slate (#1D2630)
      const factor = 0.62;
      d[i] = Math.min(255, Math.round(r * factor * 0.92));
      d[i + 1] = Math.min(255, Math.round(g * factor * 0.98));
      d[i + 2] = Math.min(255, Math.round(b * factor * 1.08));
    }
  }
  ctx.putImageData(imgData, 0, 0);
  const out = new THREE.CanvasTexture(canvas);
  out.flipY = sourceTex.flipY;
  out.colorSpace = THREE.SRGBColorSpace;
  out.needsUpdate = true;
  return out;
}

/**
 * Real-time procedural Schlieren optical stator test feed for the Media Wall
 * when playing the built-in benchmark clip (owner-uploaded MP4/WebM overrides via VideoTexture).
 */
export class SchlierenFeedRenderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 960;
    this.canvas.height = 540;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.currentTime = 14.2;
    this.playing = false;
    this.duration = 24.0;
    this.renderFrame(14.2);
  }

  update(dt) {
    if (this.playing) {
      this.currentTime = (this.currentTime + dt) % this.duration;
      this.renderFrame(this.currentTime);
    }
  }

  seek(t) {
    this.currentTime = Math.max(0, Math.min(this.duration, t));
    this.renderFrame(this.currentTime);
  }

  renderFrame(t) {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    // High-contrast monochrome/ice Schlieren optical wind-tunnel field
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#071017');
    grad.addColorStop(0.5, '#172733');
    grad.addColorStop(1, '#060d13');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.48;
    const cy = h * 0.5;
    const outerR = 185;
    const hubR = 72;

    // Outer shroud & rotor hub rings
    ctx.strokeStyle = '#c8e4ec';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, outerR, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, hubR, 0, Math.PI * 2); ctx.stroke();

    // 18 radial stator blades + animated Schlieren shock/density wakes
    const vortexSurge = Math.exp(-Math.pow(t - 14.2, 2) / 6.5);
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * Math.PI * 2 + t * 0.65;
      const x1 = cx + Math.cos(ang) * hubR;
      const y1 = cy + Math.sin(ang) * hubR;
      const x2 = cx + Math.cos(ang + 0.14) * outerR;
      const y2 = cy + Math.sin(ang + 0.14) * outerR;

      ctx.strokeStyle = 'rgba(221, 251, 255, 0.86)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(
        cx + Math.cos(ang + 0.09) * ((hubR + outerR) * 0.52),
        cy + Math.sin(ang + 0.09) * ((hubR + outerR) * 0.52),
        x2,
        y2
      );
      ctx.stroke();

      // Wake density striation
      ctx.strokeStyle = vortexSurge > 0.45 && i % 3 === 0
        ? `rgba(231, 174, 91, ${0.35 + 0.5 * vortexSurge})`
        : 'rgba(98, 230, 242, 0.26)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx, cy, hubR + 18 + (i % 5) * 18, ang, ang + 0.24 + vortexSurge * 0.22);
      ctx.stroke();
    }

    // Highlight critical detachment zone around 14.2s
    if (vortexSurge > 0.35) {
      const vx = cx + 92;
      const vy = cy - 42;
      ctx.strokeStyle = `rgba(231, 174, 91, ${vortexSurge})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(vx - 38, vy - 38, 76, 76);
      ctx.fillStyle = '#e7ae5b';
      ctx.font = '13px monospace';
      ctx.fillText('DETACHMENT LOCUS · dP/dr SPIKE', vx + 46, vy - 12);
    }

    // Frame telemetry overlay
    ctx.fillStyle = 'rgba(2, 7, 11, 0.78)';
    ctx.fillRect(0, h - 42, w, 42);
    ctx.fillStyle = '#62e6f2';
    ctx.fillRect(0, h - 42, (t / this.duration) * w, 2);

    ctx.fillStyle = '#ddfbff';
    ctx.font = '13px monospace';
    ctx.fillText(`SCHLIEREN OPTICAL BENCH · TC ${t.toFixed(2).padStart(5, '0')}s / ${this.duration.toFixed(1)}s`, 20, h - 16);
    ctx.fillStyle = '#7799a5';
    ctx.fillText(this.playing ? 'PLAYING · 60 HZ' : 'PAUSED FOR 3D EXTRACTION', w - 245, h - 16);

    this.texture.needsUpdate = true;
  }
}
