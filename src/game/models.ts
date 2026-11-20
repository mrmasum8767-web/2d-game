import * as THREE from 'three';
import { ProceduralTextureSet } from './textures';

export interface PlayerCraftParts {
  root: THREE.Group;
  thrusterFlames: THREE.Mesh[];
  thrusterGlows: THREE.Mesh[];
  hullMeshes: THREE.Mesh[];
  shieldBubble: THREE.Mesh;
  contactShadow: THREE.Mesh;
}

export function createPlayerCraft(
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
): PlayerCraftParts {
  const root = new THREE.Group();

  // Materials with clear roughness/metalness contrast (>= 0.25 difference)
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0xf6efe6,
    map: textures.hullPanelAlbedo,
    roughness: 0.36,
    metalness: 0.28,
  });

  const darkCarbonMat = new THREE.MeshStandardMaterial({
    color: 0x22262e,
    roughness: 0.72,
    metalness: 0.15,
  });

  const brushedTitaniumMat = new THREE.MeshPhysicalMaterial({
    color: 0x9aa4b2,
    metalness: 0.92,
    roughness: 0.18,
    anisotropy: 0.8,
    anisotropyRotation: Math.PI * 0.5,
  });

  const trimAccentMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    roughness: 0.3,
    metalness: 0.45,
  });

  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    metalness: 0.05,
    roughness: 0.06,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    transmission: isSoftwareGl ? 0 : 0.82,
    transparent: true,
    opacity: isSoftwareGl ? 0.55 : 1.0,
    ior: 1.55,
    thickness: 0.6,
    attenuationColor: new THREE.Color(0x0ea5e9),
  });

  const thrusterCoreMat = new THREE.MeshStandardMaterial({
    color: 0x2dd4bf,
    emissive: 0x14b8a6,
    emissiveIntensity: 2.2,
    roughness: 0.2,
    metalness: 0.1,
  });

  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x5eead4,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });

  // 1. Primary Silhouette: Sculpted beveled fuselage via ExtrudeGeometry
  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, 1.95);
  hullShape.lineTo(0.56, 0.3);
  hullShape.lineTo(0.46, -1.45);
  hullShape.lineTo(-0.46, -1.45);
  hullShape.lineTo(-0.56, 0.3);
  hullShape.closePath();

  const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
    depth: 0.38,
    bevelEnabled: true,
    bevelThickness: 0.14,
    bevelSize: 0.1,
    bevelSegments: 3,
  });
  hullGeo.rotateX(Math.PI / 2);
  hullGeo.translate(0, 0.24, 0);
  hullGeo.computeTangents();
  const fuselage = new THREE.Mesh(hullGeo, hullMat);
  fuselage.castShadow = true;
  fuselage.receiveShadow = true;
  root.add(fuselage);

  // 2. Forward Nose Splitter / Spine
  const noseGeo = new THREE.ConeGeometry(0.32, 1.1, 6);
  noseGeo.rotateX(-Math.PI / 2);
  noseGeo.scale(1.0, 0.52, 1.0);
  const nose = new THREE.Mesh(noseGeo, trimAccentMat);
  nose.position.set(0, 0.05, -1.92);
  nose.castShadow = true;
  root.add(nose);

  // 3. Tinted Optical Canopy Cockpit
  const canopyGeo = new THREE.SphereGeometry(0.42, 20, 16);
  canopyGeo.scale(0.84, 0.62, 1.85);
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.set(0, 0.34, -0.25);
  canopy.renderOrder = 2;
  root.add(canopy);

  // 4. Swept Delta Wings (Port & Starboard beveled ExtrudeGeometry)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0.38, 0.2);
  wingShape.lineTo(2.05, -0.75);
  wingShape.lineTo(2.15, -1.22);
  wingShape.lineTo(0.42, -1.1);
  wingShape.closePath();

  const rightWingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.08,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  rightWingGeo.rotateX(Math.PI / 2);
  const rightWing = new THREE.Mesh(rightWingGeo, hullMat);
  rightWing.position.set(0, 0.06, 0.18);
  rightWing.castShadow = true;
  rightWing.receiveShadow = true;
  root.add(rightWing);

  const leftWing = rightWing.clone();
  leftWing.scale.x = -1;
  root.add(leftWing);

  // 5. Wingtip Stabilizer Winglets (accent trim)
  const wingletGeo = new THREE.BoxGeometry(0.08, 0.42, 0.58);
  const rightWinglet = new THREE.Mesh(wingletGeo, trimAccentMat);
  rightWinglet.position.set(2.08, 0.22, 1.12);
  rightWinglet.rotation.z = -0.22;
  rightWinglet.castShadow = true;
  root.add(rightWinglet);

  const leftWinglet = new THREE.Mesh(wingletGeo, trimAccentMat);
  leftWinglet.position.set(-2.08, 0.22, 1.12);
  leftWinglet.rotation.z = 0.22;
  leftWinglet.castShadow = true;
  root.add(leftWinglet);

  // 6 & 7. Twin Brushed-Titanium Turbine Nacelles (LatheGeometry) + Thruster Cores & Flames
  const lathePoints = [
    new THREE.Vector2(0.18, 0),
    new THREE.Vector2(0.28, 0.14),
    new THREE.Vector2(0.31, 0.7),
    new THREE.Vector2(0.27, 1.25),
    new THREE.Vector2(0.2, 1.42),
    new THREE.Vector2(0.16, 1.42),
  ];
  const nacelleGeo = new THREE.LatheGeometry(lathePoints, 18);
  nacelleGeo.rotateX(Math.PI / 2);
  nacelleGeo.computeTangents();

  const coreGeo = new THREE.CylinderGeometry(0.16, 0.14, 0.16, 14);
  coreGeo.rotateX(Math.PI / 2);

  const flameGeo = new THREE.ConeGeometry(0.18, 1.35, 12);
  flameGeo.rotateX(Math.PI / 2);
  flameGeo.translate(0, 0, 0.68);

  const thrusterFlames: THREE.Mesh[] = [];
  const thrusterGlows: THREE.Mesh[] = [];

  for (const side of [-1, 1]) {
    const nacelle = new THREE.Mesh(nacelleGeo, brushedTitaniumMat);
    nacelle.position.set(side * 0.72, 0.14, 0.48);
    nacelle.castShadow = true;
    root.add(nacelle);

    const core = new THREE.Mesh(coreGeo, thrusterCoreMat);
    core.position.set(side * 0.72, 0.14, 1.48);
    root.add(core);
    thrusterGlows.push(core);

    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(side * 0.72, 0.14, 1.54);
    root.add(flame);
    thrusterFlames.push(flame);
  }

  // 8. Dorsal Intake Spine & Tail Fins
  const spineGeo = new THREE.BoxGeometry(0.26, 0.22, 1.35);
  const spine = new THREE.Mesh(spineGeo, darkCarbonMat);
  spine.position.set(0, 0.32, 0.62);
  spine.castShadow = true;
  root.add(spine);

  const finGeo = new THREE.BoxGeometry(0.06, 0.56, 0.68);
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(finGeo, darkCarbonMat);
    fin.position.set(side * 0.36, 0.48, 1.15);
    fin.rotation.z = side * -0.28;
    fin.castShadow = true;
    root.add(fin);
  }

  // 9. Twin Forward Plasma Cannon Barrels under wings
  const barrelGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.72, 10);
  barrelGeo.rotateX(Math.PI / 2);
  for (const side of [-1, 1]) {
    const barrel = new THREE.Mesh(barrelGeo, darkCarbonMat);
    barrel.position.set(side * 0.96, -0.05, -0.35);
    root.add(barrel);
  }

  // 10. Translucent Energy Shield Bubble (visible during boost/invuln/overcharge)
  const shieldGeo = new THREE.SphereGeometry(2.35, 22, 16);
  shieldGeo.scale(1.05, 0.58, 1.18);
  const shieldMat = new THREE.MeshBasicMaterial({
    color: 0x2dd4bf,
    transparent: true,
    opacity: 0.0,
    wireframe: true,
    depthWrite: false,
  });
  const shieldBubble = new THREE.Mesh(shieldGeo, shieldMat);
  shieldBubble.position.set(0, 0.14, 0.05);
  root.add(shieldBubble);

  // Soft Ground Contact Shadow
  const shadowGeo = new THREE.PlaneGeometry(4.8, 5.4);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: textures.contactShadow,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.set(0, 0.04, 0);

  return {
    root,
    thrusterFlames,
    thrusterGlows,
    hullMeshes: [fuselage, rightWing, leftWing, nose],
    shieldBubble,
    contactShadow,
  };
}

export function createSolarRingGroup(): THREE.Group {
  const group = new THREE.Group();

  const bronzeMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    metalness: 0.82,
    roughness: 0.24,
  });
  const energyMat = new THREE.MeshStandardMaterial({
    color: 0x2dd4bf,
    emissive: 0x14b8a6,
    emissiveIntensity: 1.8,
    roughness: 0.25,
    metalness: 0.1,
  });
  const slateMat = new THREE.MeshStandardMaterial({
    color: 0x27272a,
    metalness: 0.45,
    roughness: 0.68,
  });

  // 1. Outer structural bronze halo
  const outerGeo = new THREE.TorusGeometry(3.2, 0.22, 12, 32);
  const outerRing = new THREE.Mesh(outerGeo, bronzeMat);
  outerRing.castShadow = true;
  group.add(outerRing);

  // 2. Inner glowing cyan energy hoop
  const innerGeo = new THREE.TorusGeometry(2.78, 0.09, 10, 32);
  const innerRing = new THREE.Mesh(innerGeo, energyMat);
  group.add(innerRing);

  // 3-6. Four stabilizer pylons around the perimeter
  const pylonGeo = new THREE.BoxGeometry(0.42, 0.95, 0.48);
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    const pylon = new THREE.Mesh(pylonGeo, slateMat);
    pylon.position.set(Math.cos(angle) * 3.25, Math.sin(angle) * 3.25, 0);
    pylon.rotation.z = angle + Math.PI / 2;
    group.add(pylon);
  }

  return group;
}

export interface SentinelDroneParts {
  root: THREE.Group;
  gyroRing: THREE.Mesh;
  eyeMesh: THREE.Mesh;
  telegraphBeam: THREE.Mesh;
  chassisMesh: THREE.Mesh;
}

export function createSentinelDrone(): SentinelDroneParts {
  const root = new THREE.Group();

  const armorMat = new THREE.MeshStandardMaterial({
    color: 0x1e2028,
    metalness: 0.72,
    roughness: 0.34,
  });
  const copperTrimMat = new THREE.MeshStandardMaterial({
    color: 0xb45309,
    metalness: 0.85,
    roughness: 0.28,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xff3b5c,
    emissive: 0xef4444,
    emissiveIntensity: 2.2,
    roughness: 0.18,
    metalness: 0.1,
  });

  // 1. Armored main hull core
  const chassisGeo = new THREE.OctahedronGeometry(1.18, 1);
  const chassisMesh = new THREE.Mesh(chassisGeo, armorMat);
  chassisMesh.scale.set(1.15, 0.88, 1.15);
  chassisMesh.castShadow = true;
  root.add(chassisMesh);

  // 2. Glowing crimson sensor eye facing player (+Z)
  const eyeGeo = new THREE.SphereGeometry(0.46, 16, 12);
  const eyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
  eyeMesh.position.set(0, 0, 0.88);
  root.add(eyeMesh);

  // 3. Rotating copper gyro ring
  const gyroGeo = new THREE.TorusGeometry(1.65, 0.12, 10, 24);
  const gyroRing = new THREE.Mesh(gyroGeo, copperTrimMat);
  gyroRing.castShadow = true;
  root.add(gyroRing);

  // 4-6. Three armored interceptor blades
  const bladeGeo = new THREE.BoxGeometry(0.24, 1.3, 0.5);
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const blade = new THREE.Mesh(bladeGeo, armorMat);
    blade.position.set(Math.cos(angle) * 1.35, Math.sin(angle) * 1.35, 0);
    blade.rotation.z = angle;
    blade.castShadow = true;
    root.add(blade);
  }

  // Windup telegraph laser beam projecting toward +Z (player side)
  const beamGeo = new THREE.CylinderGeometry(0.06, 0.18, 28, 8);
  beamGeo.rotateX(Math.PI / 2);
  beamGeo.translate(0, 0, 14);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xff3b5c,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const telegraphBeam = new THREE.Mesh(beamGeo, beamMat);
  root.add(telegraphBeam);

  return {
    root,
    gyroRing,
    eyeMesh,
    telegraphBeam,
    chassisMesh,
  };
}

export function createAetherCrystalGroup(): THREE.Group {
  const group = new THREE.Group();

  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: 0xfbbf24,
    emissive: 0xd97706,
    emissiveIntensity: 0.9,
    roughness: 0.12,
    metalness: 0.15,
    clearcoat: 1.0,
  });
  const collarMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.85,
    roughness: 0.3,
  });

  // 1. Primary central crystal shard
  const shardGeo = new THREE.OctahedronGeometry(0.75, 0);
  shardGeo.scale(0.68, 1.45, 0.68);
  const mainShard = new THREE.Mesh(shardGeo, crystalMat);
  mainShard.castShadow = true;
  group.add(mainShard);

  // 2 & 3. Flanking satellite crystal shards
  const miniGeo = new THREE.OctahedronGeometry(0.32, 0);
  miniGeo.scale(0.65, 1.35, 0.65);
  for (const side of [-1, 1]) {
    const mini = new THREE.Mesh(miniGeo, crystalMat);
    mini.position.set(side * 0.68, -0.15, 0);
    mini.rotation.z = side * -0.3;
    group.add(mini);
  }

  // 4. Orbiting alloy stabilizer ring
  const ringGeo = new THREE.TorusGeometry(1.02, 0.06, 8, 24);
  ringGeo.rotateX(Math.PI / 2.6);
  const ring = new THREE.Mesh(ringGeo, collarMat);
  group.add(ring);

  return group;
}

export function createSandstonePillarGroup(height: number, radius: number): THREE.Group {
  const group = new THREE.Group();

  const baseRockMat = new THREE.MeshStandardMaterial({
    color: 0x8c422c,
    roughness: 0.92,
    metalness: 0.04,
    flatShading: true,
  });
  const capRockMat = new THREE.MeshStandardMaterial({
    color: 0xc26c47,
    roughness: 0.88,
    metalness: 0.05,
    flatShading: true,
  });

  // Bottom-center grounded pedestal + tiered natural spire
  const baseGeo = new THREE.CylinderGeometry(radius * 0.85, radius * 1.25, height * 0.45, 7);
  baseGeo.translate(0, height * 0.225, 0);
  const base = new THREE.Mesh(baseGeo, baseRockMat);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const midGeo = new THREE.CylinderGeometry(radius * 0.62, radius * 0.88, height * 0.35, 7);
  midGeo.translate(0, height * 0.6, 0);
  const mid = new THREE.Mesh(midGeo, capRockMat);
  mid.rotation.y = 0.4;
  mid.castShadow = true;
  mid.receiveShadow = true;
  group.add(mid);

  const topGeo = new THREE.ConeGeometry(radius * 0.64, height * 0.28, 6);
  topGeo.translate(0, height * 0.9, 0);
  const top = new THREE.Mesh(topGeo, baseRockMat);
  top.rotation.y = 0.8;
  top.castShadow = true;
  group.add(top);

  return group;
}

export function createCanyonRiverMaterial(): {
  material: THREE.MeshStandardMaterial;
  uniforms: { uTime: { value: number } };
} {
  const uniforms = { uTime: { value: 0 } };
  const material = new THREE.MeshStandardMaterial({
    color: 0x0e7490,
    roughness: 0.16,
    metalness: 0.35,
    envMapIntensity: 1.4,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float waveA = sin(position.y * 0.28 + uTime * 2.8) * 0.08;
        float waveB = cos(position.x * 0.55 - uTime * 2.1) * 0.05;
        transformed.z += waveA + waveB;`,
      );
  };

  return { material, uniforms };
}
