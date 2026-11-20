import * as THREE from 'three';

export interface ProceduralTextureSet {
  sandstoneAlbedo: THREE.CanvasTexture;
  sandstoneBump: THREE.CanvasTexture;
  hullPanelAlbedo: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  // 1. Stratified sandstone canyon rock & desert floor texture
  const sandCanvas = document.createElement('canvas');
  sandCanvas.width = 512;
  sandCanvas.height = 512;
  const sctx = sandCanvas.getContext('2d')!;

  const grad = sctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#c86f4b');
  grad.addColorStop(0.25, '#d88b5e');
  grad.addColorStop(0.5, '#b85b3b');
  grad.addColorStop(0.75, '#dc9868');
  grad.addColorStop(1, '#c86f4b');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 512, 512);

  // Horizontal sedimentary rock strata bands
  for (let y = 0; y < 512; y += 6) {
    const wave = Math.sin(y * 0.08) * 14 + Math.cos(y * 0.03) * 10;
    const tone = Math.floor(155 + wave + (Math.random() - 0.5) * 26);
    const r = Math.min(240, tone + 45);
    const g = Math.max(60, Math.floor(tone * 0.62));
    const b = Math.max(40, Math.floor(tone * 0.42));
    sctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.24)`;
    sctx.fillRect(0, y, 512, 3 + Math.random() * 4);
  }

  // Fine mineral grain speckles
  for (let i = 0; i < 4200; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const bright = Math.random() > 0.5;
    sctx.fillStyle = bright ? 'rgba(255, 224, 190, 0.14)' : 'rgba(68, 28, 18, 0.16)';
    sctx.fillRect(x, y, 2, 2);
  }

  const sandstoneAlbedo = new THREE.CanvasTexture(sandCanvas);
  sandstoneAlbedo.colorSpace = THREE.SRGBColorSpace;
  sandstoneAlbedo.wrapS = THREE.RepeatWrapping;
  sandstoneAlbedo.wrapT = THREE.RepeatWrapping;
  sandstoneAlbedo.repeat.set(8, 14);
  sandstoneAlbedo.anisotropy = maxAnisotropy;

  // 2. Sandstone linear bump/roughness detail map (NoColorSpace)
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 256;
  bumpCanvas.height = 256;
  const bctx = bumpCanvas.getContext('2d')!;
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 4) {
    const v = Math.floor(105 + Math.sin(y * 0.14) * 35 + Math.random() * 25);
    bctx.fillStyle = `rgb(${v},${v},${v})`;
    bctx.fillRect(0, y, 256, 3);
  }
  const sandstoneBump = new THREE.CanvasTexture(bumpCanvas);
  sandstoneBump.wrapS = THREE.RepeatWrapping;
  sandstoneBump.wrapT = THREE.RepeatWrapping;
  sandstoneBump.repeat.set(8, 14);
  sandstoneBump.anisotropy = maxAnisotropy;

  // 3. Carbon-alloy & racing stripe panel texture for player craft
  const hullCanvas = document.createElement('canvas');
  hullCanvas.width = 256;
  hullCanvas.height = 256;
  const hctx = hullCanvas.getContext('2d')!;
  hctx.fillStyle = '#f2ece4';
  hctx.fillRect(0, 0, 256, 256);

  // Subtle panel seams
  hctx.strokeStyle = 'rgba(40, 42, 54, 0.22)';
  hctx.lineWidth = 2;
  for (let i = 32; i < 256; i += 64) {
    hctx.beginPath();
    hctx.moveTo(0, i);
    hctx.lineTo(256, i);
    hctx.stroke();
    hctx.beginPath();
    hctx.moveTo(i, 0);
    hctx.lineTo(i, 256);
    hctx.stroke();
  }
  // Burnt-orange & teal aerospace accent stripes
  hctx.fillStyle = '#e86f38';
  hctx.fillRect(0, 108, 256, 22);
  hctx.fillStyle = '#14b8a6';
  hctx.fillRect(0, 134, 256, 8);

  const hullPanelAlbedo = new THREE.CanvasTexture(hullCanvas);
  hullPanelAlbedo.colorSpace = THREE.SRGBColorSpace;
  hullPanelAlbedo.wrapS = THREE.RepeatWrapping;
  hullPanelAlbedo.wrapT = THREE.RepeatWrapping;
  hullPanelAlbedo.anisotropy = maxAnisotropy;

  // 4. Soft radial contact shadow texture
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const shctx = shadowCanvas.getContext('2d')!;
  const rad = shctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  rad.addColorStop(0, 'rgba(18, 10, 8, 0.85)');
  rad.addColorStop(0.55, 'rgba(18, 10, 8, 0.35)');
  rad.addColorStop(1, 'rgba(18, 10, 8, 0.0)');
  shctx.fillStyle = rad;
  shctx.fillRect(0, 0, 128, 128);

  const contactShadow = new THREE.CanvasTexture(shadowCanvas);
  contactShadow.colorSpace = THREE.SRGBColorSpace;

  return {
    sandstoneAlbedo,
    sandstoneBump,
    hullPanelAlbedo,
    contactShadow,
    dispose: () => {
      sandstoneAlbedo.dispose();
      sandstoneBump.dispose();
      hullPanelAlbedo.dispose();
      contactShadow.dispose();
    },
  };
}
