import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SolarisAudio } from './audio';
import {
  createAetherCrystalGroup,
  createCanyonRiverMaterial,
  createPlayerCraft,
  createSandstonePillarGroup,
  createSentinelDrone,
  createSolarRingGroup,
  PlayerCraftParts,
  SentinelDroneParts,
} from './models';
import { createProceduralTextures, ProceduralTextureSet } from './textures';
import { GAME_CONSTANTS, GameHudSnapshot, GamePhase, SECTORS } from './types';

// Module-level reusable math helpers (zero GC in render loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _color = new THREE.Color();
const _targetSkyColor = new THREE.Color();
const _targetFogColor = new THREE.Color();
const _targetSunColor = new THREE.Color();

interface RingEntity {
  active: boolean;
  group: THREE.Group;
  x: number;
  y: number;
  z: number;
  passed: boolean;
  missed: boolean;
}

interface CrystalEntity {
  active: boolean;
  group: THREE.Group;
  x: number;
  y: number;
  z: number;
  phase: number;
}

interface PillarEntity {
  active: boolean;
  group: THREE.Group;
  x: number;
  z: number;
  radius: number;
  height: number;
}

interface DroneEntity {
  active: boolean;
  parts: SentinelDroneParts;
  x: number;
  y: number;
  z: number;
  baseX: number;
  hoverPhase: number;
  windupTimer: number;
  fired: boolean;
  hp: number;
  flashTimer: number;
}

interface PlayerBolt {
  active: boolean;
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  vz: number;
}

interface EnemyOrb {
  active: boolean;
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

interface BurstParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  color: THREE.Color;
}

interface WindStreak {
  x: number;
  y: number;
  z: number;
  speedMult: number;
  length: number;
}

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function canyonHeightAt(x: number, localZ: number): number {
  const absX = Math.abs(x);
  if (absX <= 12.2) {
    // Gentle valley floor banks near riverbed
    const bank = Math.max(0, (absX - 5.5) / 6.7);
    return bank * bank * 0.85;
  }

  // Periodic along localZ over CHUNK_LENGTH so terrain chunks tile seamlessly
  const period = (localZ / GAME_CONSTANTS.CHUNK_LENGTH) * Math.PI * 2;
  const ridgeA = Math.sin(period * 2 + x * 0.14) * 2.4;
  const ridgeB = Math.cos(period * 3 - x * 0.23) * 1.3;
  const mesaSteps = Math.floor(Math.min(4, (absX - 12.2) / 7.5)) * 4.2;
  const slope = Math.min(28, (absX - 12.2) * 0.72);
  const plateau = absX > 46 ? Math.sin(x * 0.08 + period) * 2.2 : 0;

  return 0.85 + slope + mesaSteps * 0.45 + ridgeA + ridgeB + plateau;
}

export class SolarisEngine {
  private container: HTMLElement;
  private onHudUpdate: (hud: GameHudSnapshot) => void;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private envRT: THREE.WebGLRenderTarget;
  private textures: ProceduralTextureSet;
  private audio: SolarisAudio;

  // Lighting
  private keyLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;
  private fog: THREE.FogExp2;

  // World & Player
  private playerCraft: PlayerCraftParts;
  private terrainChunks: THREE.Group[] = [];
  private riverMesh: THREE.Mesh;
  private riverUniforms: { uTime: { value: number } };
  private sunDisc: THREE.Mesh;

  // Entity Pools
  private rings: RingEntity[] = [];
  private crystals: CrystalEntity[] = [];
  private pillars: PillarEntity[] = [];
  private drones: DroneEntity[] = [];
  private playerBolts: PlayerBolt[] = [];
  private enemyOrbs: EnemyOrb[] = [];

  // Instanced Particle Burst Pool & Speed Lines
  private particleCount = 96;
  private particleMesh!: THREE.InstancedMesh;
  private particles: BurstParticle[] = [];
  private streakCount = 36;
  private streakMesh!: THREE.InstancedMesh;
  private streaks: WindStreak[] = [];

  // Loop & Lifecycle
  private frameId = 0;
  private disposed = false;
  private lastTime = 0;
  private hudEmitAccum = 0;
  private elapsed = 0;

  // Game State
  private phase: GamePhase = 'title';
  private score = 0;
  private bestScore = 0;
  private isNewBest = false;
  private distance = 0;
  private hull = GAME_CONSTANTS.MAX_HULL;
  private shieldCharge = 0;
  private boostEnergy = 100;
  private isBoosting = false;
  private combo = 1;
  private maxCombo = 1;
  private missedRingsStreak = 0;
  private ringsCleared = 0;
  private dronesShattered = 0;
  private crystalsCollected = 0;
  private sectorIndex = 1;

  // Kinematics & Feel
  private playerX = 0;
  private playerY = 3.8;
  private playerVx = 0;
  private playerVy = 0;
  private playerRoll = 0;
  private playerPitch = 0;
  private currentSpeed = GAME_CONSTANTS.BASE_SPEED;
  private craftScaleX = 1;
  private craftScaleY = 1;
  private craftScaleZ = 1;
  private invulnTimer = 0;
  private hitFlashTimer = 0;
  private hitstopTimer = 0;
  private cameraShake = 0;
  private cannonCooldown = 0;
  private spawnTimer = 0.6;
  private waveCounter = 0;
  private scrollOffset = 0;

  // Input State (continuous held + buffered edge actions + virtual/mouse controls)
  private heldKeys = new Set<string>();
  private boostBuffer = 0;
  private fireBuffer = 0;
  private pointerSteerActive = false;
  private pointerDownFiring = false;
  private pointerTargetX = 0;
  private pointerTargetY = 3.8;
  private virtualSteerX = 0;
  private virtualSteerY = 0;
  private virtualBoost = false;
  private virtualFire = false;
  private mouseSteer = false;
  private invertY = false;

  constructor(container: HTMLElement, onHudUpdate: (hud: GameHudSnapshot) => void) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.audio = new SolarisAudio();

    try {
      const saved = localStorage.getItem(GAME_CONSTANTS.BEST_SCORE_KEY);
      this.bestScore = saved ? Math.max(0, parseInt(saved, 10) || 0) : 0;
    } catch {
      this.bestScore = 0;
    }

    this.isSoftwareGl = detectSoftwareWebGL();
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // Scene & Fog
    const initialSector = SECTORS[0];
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(initialSector.skyColor);
    this.fog = new THREE.FogExp2(initialSector.fogColor, 0.0082);
    this.scene.fog = this.fog;

    // Camera
    this.camera = new THREE.PerspectiveCamera(62, width / height, 0.25, 320);
    this.camera.position.set(0, 6.2, 11.5);

    // Mandatory Studio Environment Map on every device
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envRT = pmremGenerator.fromScene(roomEnv, 0.04);
    this.scene.environment = this.envRT.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // Procedural Textures
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);

    // 3-Point Warm/Cool Lighting Rig
    this.hemiLight = new THREE.HemisphereLight(0x93d5ff, 0xa85232, 0.95);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(initialSector.sunColor, 2.35);
    this.keyLight.position.set(28, 44, 18);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 140;
    this.keyLight.shadow.camera.left = -32;
    this.keyLight.shadow.camera.right = 32;
    this.keyLight.shadow.camera.top = 32;
    this.keyLight.shadow.camera.bottom = -32;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(0x38bdf8, 0.65);
    this.rimLight.position.set(-22, 14, -26);
    this.scene.add(this.rimLight);

    // Distant Desert Sun Disc in sky
    const sunGeo = new THREE.CircleGeometry(18, 32);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xfff3d6,
      fog: false,
    });
    this.sunDisc = new THREE.Mesh(sunGeo, sunMat);
    this.sunDisc.position.set(22, 34, -210);
    this.scene.add(this.sunDisc);

    // Build Scrolling Natural Canyon Terrain Chunks + Instanced Cliffs
    this.buildTerrainChunks();

    // Animated Canyon River Strip
    const riverGeo = new THREE.PlaneGeometry(13.5, 420, 16, 80);
    const riverSetup = createCanyonRiverMaterial();
    this.riverUniforms = riverSetup.uniforms;
    this.riverMesh = new THREE.Mesh(riverGeo, riverSetup.material);
    this.riverMesh.rotation.x = -Math.PI / 2;
    this.riverMesh.position.set(0, 0.14, -150);
    this.riverMesh.receiveShadow = true;
    this.scene.add(this.riverMesh);

    // Player Hover Interceptor + Ground Contact Shadow
    this.playerCraft = createPlayerCraft(this.textures, this.isSoftwareGl);
    this.playerCraft.root.position.set(0, this.playerY, 0);
    this.scene.add(this.playerCraft.root);
    this.scene.add(this.playerCraft.contactShadow);

    // Pre-allocate Entity Pools
    this.initEntityPools();

    // Pre-warm shaders on GPU
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.emitHud();

    this.lastTime = performance.now();
    this.scheduleNextFrame();
  }

  private buildTerrainChunks(): void {
    const chunkLen = GAME_CONSTANTS.CHUNK_LENGTH;
    const width = 210;
    const segX = 64;
    const segZ = 42;

    const baseGeo = new THREE.PlaneGeometry(width, chunkLen, segX, segZ);
    baseGeo.rotateX(-Math.PI / 2);

    const pos = baseGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i) + chunkLen * 0.5; // 0..chunkLen
      const vy = canyonHeightAt(vx, vz);
      pos.setY(i, vy);

      // Elevation-based warm desert vertex tint
      const hNorm = THREE.MathUtils.clamp(vy / 26, 0, 1);
      _color.setRGB(
        0.92 - hNorm * 0.14,
        0.74 - hNorm * 0.22,
        0.62 - hNorm * 0.24,
      );
      colors[i * 3] = _color.r;
      colors[i * 3 + 1] = _color.g;
      colors[i * 3 + 2] = _color.b;
    }
    baseGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    baseGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      map: this.textures.sandstoneAlbedo,
      bumpMap: this.textures.sandstoneBump,
      bumpScale: 0.35,
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.04,
    });

    // Instanced Canyon Rim Spires & Outcrops per chunk (natural perimeter, never boxed walls)
    const spireGeo = new THREE.ConeGeometry(2.6, 14, 6);
    spireGeo.translate(0, 7, 0);
    const spireMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0.05,
      flatShading: true,
    });

    const boulderGeo = new THREE.DodecahedronGeometry(1.4, 0);
    boulderGeo.translate(0, 0.9, 0);

    for (let c = 0; c < GAME_CONSTANTS.CHUNK_COUNT; c++) {
      const chunkGroup = new THREE.Group();
      const terrainMesh = new THREE.Mesh(baseGeo, terrainMat);
      terrainMesh.receiveShadow = true;
      chunkGroup.add(terrainMesh);

      const spireCount = 34;
      const spires = new THREE.InstancedMesh(spireGeo, spireMat, spireCount);
      spires.castShadow = !this.isSoftwareGl;
      spires.receiveShadow = true;
      spires.frustumCulled = false;

      const boulders = new THREE.InstancedMesh(boulderGeo, spireMat, 28);
      boulders.receiveShadow = true;
      boulders.frustumCulled = false;

      for (let i = 0; i < spireCount; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        // Deterministic spread across canyon walls
        const seed = (c * 131 + i * 47) % 997;
        const rx = side * (16.5 + (seed % 34));
        const rz = ((i / spireCount) - 0.5) * chunkLen;
        const localZ = rz + chunkLen * 0.5;
        const groundY = canyonHeightAt(rx, localZ) - 0.8;

        const scaleVar = 0.85 + ((seed % 30) / 100); // ±15%
        const heightScale = 0.7 + ((seed % 19) / 15);
        _v1.set(rx, groundY, rz);
        _euler.set(0, (seed * 0.37) % (Math.PI * 2), 0);
        _quat.setFromEuler(_euler);
        _v2.set(scaleVar, scaleVar * heightScale, scaleVar);
        _mat4.compose(_v1, _quat, _v2);
        spires.setMatrixAt(i, _mat4);

        const tintShift = ((seed % 20) - 10) * 0.012;
        _color.setRGB(0.66 + tintShift, 0.34 + tintShift * 0.6, 0.22 + tintShift * 0.4);
        spires.setColorAt(i, _color);
      }
      spires.instanceMatrix.needsUpdate = true;
      if (spires.instanceColor) spires.instanceColor.needsUpdate = true;
      spires.computeBoundingSphere();
      chunkGroup.add(spires);

      for (let i = 0; i < 28; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const seed = (c * 211 + i * 73) % 991;
        const rx = side * (12.8 + (seed % 10));
        const rz = ((i / 28) - 0.5) * chunkLen;
        const localZ = rz + chunkLen * 0.5;
        const groundY = canyonHeightAt(rx, localZ) - 0.3;

        const s = 0.85 + ((seed % 30) / 100);
        _v1.set(rx, groundY, rz);
        _euler.set((seed % 7) * 0.2, seed * 0.5, 0);
        _quat.setFromEuler(_euler);
        _v2.set(s * 1.2, s * 0.8, s);
        _mat4.compose(_v1, _quat, _v2);
        boulders.setMatrixAt(i, _mat4);

        _color.setRGB(0.54 + (seed % 10) * 0.015, 0.29, 0.2);
        boulders.setColorAt(i, _color);
      }
      boulders.instanceMatrix.needsUpdate = true;
      if (boulders.instanceColor) boulders.instanceColor.needsUpdate = true;
      boulders.computeBoundingSphere();
      chunkGroup.add(boulders);

      chunkGroup.position.z = -c * chunkLen;
      this.scene.add(chunkGroup);
      this.terrainChunks.push(chunkGroup);
    }
  }

  private initEntityPools(): void {
    // Solar Rings (pool of 10)
    for (let i = 0; i < 10; i++) {
      const group = createSolarRingGroup();
      group.visible = false;
      this.scene.add(group);
      this.rings.push({ active: false, group, x: 0, y: 0, z: 0, passed: false, missed: false });
    }

    // Aether Crystals (pool of 14)
    for (let i = 0; i < 14; i++) {
      const group = createAetherCrystalGroup();
      group.visible = false;
      this.scene.add(group);
      this.crystals.push({ active: false, group, x: 0, y: 0, z: 0, phase: i * 0.8 });
    }

    // Sandstone Hazard Pillars (pool of 12)
    for (let i = 0; i < 12; i++) {
      const radius = 1.65 + (i % 3) * 0.35;
      const height = 10 + (i % 4) * 2.5;
      const group = createSandstonePillarGroup(height, radius);
      group.visible = false;
      this.scene.add(group);
      this.pillars.push({ active: false, group, x: 0, z: 0, radius, height });
    }

    // Sentinel Drones (pool of 8)
    for (let i = 0; i < 8; i++) {
      const parts = createSentinelDrone();
      parts.root.visible = false;
      this.scene.add(parts.root);
      this.drones.push({
        active: false,
        parts,
        x: 0,
        y: 0,
        z: 0,
        baseX: 0,
        hoverPhase: i * 1.1,
        windupTimer: 0,
        fired: false,
        hp: 1,
        flashTimer: 0,
      });
    }

    // Player Plasma Bolts (pool of 18)
    const boltGeo = new THREE.CapsuleGeometry(0.11, 1.4, 4, 8);
    boltGeo.rotateX(Math.PI / 2);
    const boltMat = new THREE.MeshBasicMaterial({ color: 0x5eead4 });
    for (let i = 0; i < 18; i++) {
      const mesh = new THREE.Mesh(boltGeo, boltMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.playerBolts.push({ active: false, mesh, x: 0, y: 0, z: 0, vz: -155 });
    }

    // Enemy Plasma Orbs (pool of 10)
    const orbGeo = new THREE.SphereGeometry(0.45, 10, 10);
    const orbMat = new THREE.MeshBasicMaterial({ color: 0xff3b5c });
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(orbGeo, orbMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.enemyOrbs.push({ active: false, mesh, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
    }

    // Pooled Instanced Burst Particles (96 faceted sparks)
    const pGeo = new THREE.OctahedronGeometry(0.28, 0);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, this.particleCount);
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);
    for (let i = 0; i < this.particleCount; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.5,
        scale: 0,
        color: new THREE.Color(0xffffff),
      });
      _v1.set(0, -999, 0);
      _quat.identity();
      _v2.set(0, 0, 0);
      _mat4.compose(_v1, _quat, _v2);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _color.setHex(0xffffff));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;

    // Pooled Wind Speed Streaks
    const sGeo = new THREE.BoxGeometry(0.05, 0.05, 3.2);
    const sMat = new THREE.MeshBasicMaterial({
      color: 0xfff1dc,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    this.streakMesh = new THREE.InstancedMesh(sGeo, sMat, this.streakCount);
    this.streakMesh.frustumCulled = false;
    this.scene.add(this.streakMesh);
    for (let i = 0; i < this.streakCount; i++) {
      this.streaks.push({
        x: (Math.random() - 0.5) * 28,
        y: 1.5 + Math.random() * 10,
        z: -Math.random() * 110,
        speedMult: 0.9 + Math.random() * 0.5,
        length: 0.7 + Math.random() * 1.1,
      });
    }
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.handlePointerDown);
    dom.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
      e.preventDefault();
    }

    this.audio.unlock();

    if (code === 'KeyM') {
      this.toggleMute();
      return;
    }

    if (code === 'Escape' || code === 'KeyP') {
      if (this.phase === 'playing') {
        this.pauseGame();
      } else if (this.phase === 'paused') {
        this.resumeGame();
      }
      return;
    }

    if ((this.phase === 'title' || this.phase === 'gameover') && (code === 'Enter' || code === 'Space')) {
      if (!e.repeat) {
        this.startGame();
      }
      return;
    }

    if (this.phase === 'playing') {
      if (code === 'Space' && !e.repeat) {
        this.boostBuffer = 0.16;
      }
      if ((code === 'KeyF' || code === 'KeyJ' || code === 'ShiftLeft' || code === 'ShiftRight') && !e.repeat) {
        this.fireBuffer = 0.16;
      }
    }

    this.heldKeys.add(code);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys.delete(e.code);
  };

  private handleWindowBlur = (): void => {
    this.heldKeys.clear();
    this.pointerSteerActive = false;
    this.pointerDownFiring = false;
    this.virtualSteerX = 0;
    this.virtualSteerY = 0;
    this.virtualBoost = false;
    this.virtualFire = false;
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.heldKeys.clear();
      this.pointerSteerActive = false;
      this.pointerDownFiring = false;
      this.virtualSteerX = 0;
      this.virtualSteerY = 0;
      this.virtualBoost = false;
      this.virtualFire = false;
      if (this.phase === 'playing') {
        this.pauseGame();
      }
    }
  };

  private handlePointerDown = (e: PointerEvent): void => {
    this.audio.unlock();
    if (this.phase !== 'playing') return;
    if (e.button === 0) {
      this.fireBuffer = 0.16;
      this.pointerDownFiring = true;
      if (e.pointerType === 'touch') {
        this.pointerSteerActive = true;
        this.updatePointerTarget(e);
      }
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (this.phase !== 'playing') return;
    if (this.pointerSteerActive || (this.mouseSteer && e.pointerType === 'mouse')) {
      this.updatePointerTarget(e);
    }
  };

  private handlePointerUp = (): void => {
    this.pointerSteerActive = false;
    this.pointerDownFiring = false;
  };

  private updatePointerTarget(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    this.pointerTargetX = THREE.MathUtils.clamp(nx * 12, -11.5, 11.5);
    this.pointerTargetY = THREE.MathUtils.clamp(5.2 - ny * 4.2, GAME_CONSTANTS.MIN_ALTITUDE, GAME_CONSTANTS.MAX_ALTITUDE);
  }

  public startGame(): void {
    this.audio.unlock();
    this.resetWorldEntities();

    this.phase = 'playing';
    this.score = 0;
    this.isNewBest = false;
    this.distance = 0;
    this.hull = GAME_CONSTANTS.MAX_HULL;
    this.shieldCharge = 0;
    this.boostEnergy = 100;
    this.isBoosting = false;
    this.combo = 1;
    this.maxCombo = 1;
    this.missedRingsStreak = 0;
    this.ringsCleared = 0;
    this.dronesShattered = 0;
    this.crystalsCollected = 0;
    this.sectorIndex = 1;

    this.playerX = 0;
    this.playerY = 3.8;
    this.playerVx = 0;
    this.playerVy = 0;
    this.playerRoll = 0;
    this.playerPitch = 0;
    this.currentSpeed = GAME_CONSTANTS.BASE_SPEED;
    this.invulnTimer = 0.6;
    this.hitFlashTimer = 0;
    this.hitstopTimer = 0;
    this.cameraShake = 0;
    this.cannonCooldown = 0;
    this.spawnTimer = 0.4;
    this.waveCounter = 0;
    this.boostBuffer = 0;
    this.fireBuffer = 0;
    this.clearVirtualInputs();

    // Seed initial opening solar ring & crystal ahead so action begins immediately
    this.spawnRing(0, 4.0, -75);
    this.spawnCrystal(0, 4.0, -95);
    this.spawnRing(3.5, 4.4, -120);

    this.emitHud();
  }

  private clearVirtualInputs(): void {
    this.pointerSteerActive = false;
    this.pointerDownFiring = false;
    this.virtualSteerX = 0;
    this.virtualSteerY = 0;
    this.virtualBoost = false;
    this.virtualFire = false;
  }

  public pauseGame(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.heldKeys.clear();
    this.clearVirtualInputs();
    this.audio.updateEngine(0, false, false);
    this.emitHud();
  }

  public resumeGame(): void {
    if (this.phase !== 'paused') return;
    this.audio.unlock();
    this.phase = 'playing';
    this.lastTime = performance.now();
    this.emitHud();
  }

  public returnToTitle(): void {
    this.resetWorldEntities();
    this.heldKeys.clear();
    this.clearVirtualInputs();
    this.phase = 'title';
    this.playerX = 0;
    this.playerY = 3.6;
    this.playerRoll = 0;
    this.playerPitch = 0;
    this.sectorIndex = 1;
    this.audio.updateEngine(0, false, false);
    this.emitHud();
  }

  public toggleMute(): void {
    this.audio.unlock();
    this.audio.toggleMute();
    this.emitHud();
  }

  public setVirtualSteer(x: number, y: number): void {
    this.audio.unlock();
    this.virtualSteerX = THREE.MathUtils.clamp(x, -1, 1);
    this.virtualSteerY = THREE.MathUtils.clamp(y, -1, 1);
  }

  public setVirtualBoost(active: boolean): void {
    this.audio.unlock();
    if (active && !this.virtualBoost && this.phase === 'playing') {
      this.boostBuffer = 0.16;
    }
    this.virtualBoost = active;
  }

  public setVirtualFire(active: boolean): void {
    this.audio.unlock();
    if (active && !this.virtualFire && this.phase === 'playing') {
      this.fireBuffer = 0.16;
    }
    this.virtualFire = active;
  }

  public toggleMouseSteer(): void {
    this.mouseSteer = !this.mouseSteer;
    this.emitHud();
  }

  public toggleInvertY(): void {
    this.invertY = !this.invertY;
    this.emitHud();
  }

  private resetWorldEntities(): void {
    for (const r of this.rings) {
      r.active = false;
      r.group.visible = false;
    }
    for (const c of this.crystals) {
      c.active = false;
      c.group.visible = false;
    }
    for (const p of this.pillars) {
      p.active = false;
      p.group.visible = false;
    }
    for (const d of this.drones) {
      d.active = false;
      d.parts.root.visible = false;
    }
    for (const b of this.playerBolts) {
      b.active = false;
      b.mesh.visible = false;
    }
    for (const o of this.enemyOrbs) {
      o.active = false;
      o.mesh.visible = false;
    }
  }

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    this.update(dt);
    this.renderer.render(this.scene, this.camera);

    this.scheduleNextFrame();
  };

  private update(dt: number): void {
    this.elapsed += dt;
    this.riverUniforms.uTime.value = this.elapsed;

    // Smooth sector sky/fog/sun palette interpolation
    const sector = SECTORS[Math.min(this.sectorIndex - 1, SECTORS.length - 1)];
    _targetSkyColor.setHex(sector.skyColor);
    _targetFogColor.setHex(sector.fogColor);
    _targetSunColor.setHex(sector.sunColor);

    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.lerp(_targetSkyColor, 1 - Math.exp(-1.5 * dt));
    }
    this.fog.color.lerp(_targetFogColor, 1 - Math.exp(-1.5 * dt));
    this.keyLight.color.lerp(_targetSunColor, 1 - Math.exp(-1.5 * dt));

    // Title screen atmospheric idle cruise
    if (this.phase === 'title') {
      const cruiseSpeed = 24;
      this.scrollTerrain(cruiseSpeed, dt);
      this.updateStreaks(cruiseSpeed, dt);
      this.updateParticles(dt);

      const hoverX = Math.sin(this.elapsed * 0.55) * 3.6;
      const hoverY = 3.5 + Math.sin(this.elapsed * 1.4) * 0.45;
      this.playerX = THREE.MathUtils.damp(this.playerX, hoverX, 4, dt);
      this.playerY = THREE.MathUtils.damp(this.playerY, hoverY, 4, dt);
      this.playerRoll = THREE.MathUtils.damp(this.playerRoll, -Math.cos(this.elapsed * 0.55) * 0.22, 5, dt);
      this.playerPitch = THREE.MathUtils.damp(this.playerPitch, Math.cos(this.elapsed * 1.4) * 0.06, 5, dt);

      this.syncPlayerCraftVisuals(0.45, false, dt);

      // Gentle orbiting hero camera looking over the canyon
      const camX = Math.sin(this.elapsed * 0.28) * 5.2;
      const camY = 5.4 + Math.cos(this.elapsed * 0.35) * 0.7;
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, camX, 3.5, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, camY, 3.5, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, 9.8, 3.5, dt);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 58, 4, dt);
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.playerX * 0.45, this.playerY + 0.35, -18);
      return;
    }

    if (this.phase === 'paused' || this.phase === 'gameover') {
      this.updateParticles(dt * 0.4);
      this.audio.updateEngine(0, false, false);
      return;
    }

    // Active Playing Loop with Hitstop
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.updateCamera(dt);
      return;
    }

    // Difficulty Ramp & Sector Progression
    const targetSector = Math.min(4, 1 + Math.floor(this.distance / 1000));
    if (targetSector > this.sectorIndex) {
      this.sectorIndex = targetSector;
      this.audio.playSectorAdvance();
    }

    const rampSpeed = Math.min(
      GAME_CONSTANTS.MAX_BASE_SPEED,
      GAME_CONSTANTS.BASE_SPEED + this.distance * 0.014,
    );

    // Input Buffering & Boost
    if (this.boostBuffer > 0) this.boostBuffer -= dt;
    if (this.fireBuffer > 0) this.fireBuffer -= dt;
    if (this.cannonCooldown > 0) this.cannonCooldown = Math.max(0, this.cannonCooldown - dt);
    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.hitFlashTimer > 0) this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);

    const wantsBoost = this.heldKeys.has('Space') || this.virtualBoost || this.boostBuffer > 0;
    const canStartBoost = this.boostEnergy > 14;
    if (wantsBoost && (this.isBoosting ? this.boostEnergy > 1 : canStartBoost)) {
      if (!this.isBoosting) {
        this.audio.playBoostIgnite();
        this.cameraShake = Math.min(1, this.cameraShake + 0.25);
        this.craftScaleX = 0.86;
        this.craftScaleY = 0.88;
        this.craftScaleZ = 1.2;
        this.spawnBurst(this.playerX, this.playerY, 1.4, 0x2dd4bf, 10, 12);
      }
      this.isBoosting = true;
      this.boostBuffer = 0;
      this.boostEnergy = Math.max(0, this.boostEnergy - GAME_CONSTANTS.BOOST_DRAIN_PER_SEC * dt);
    } else {
      this.isBoosting = false;
      this.boostEnergy = Math.min(100, this.boostEnergy + GAME_CONSTANTS.BOOST_REGEN_PER_SEC * dt);
    }

    const targetSpeed = rampSpeed * (this.isBoosting ? GAME_CONSTANTS.BOOST_SPEED_MULT : 1.0);
    this.currentSpeed = THREE.MathUtils.damp(this.currentSpeed, targetSpeed, 6.5, dt);

    // Distance & Passive Flight Score
    const frameDist = this.currentSpeed * dt;
    this.distance += frameDist;
    this.score += frameDist * 0.45 * this.combo;

    // Player Movement Kinematics (held keys + virtual gimbal pad + optional mouse/touch steering)
    let inputX = 0;
    let inputY = 0;
    if (this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft')) inputX -= 1;
    if (this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight')) inputX += 1;
    if (this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp')) inputY += 1;
    if (this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown')) inputY -= 1;

    if (Math.abs(this.virtualSteerX) > 0.04 || Math.abs(this.virtualSteerY) > 0.04) {
      inputX = THREE.MathUtils.clamp(inputX + this.virtualSteerX, -1, 1);
      inputY = THREE.MathUtils.clamp(inputY + this.virtualSteerY, -1, 1);
    } else if ((this.pointerSteerActive || this.mouseSteer) && inputX === 0 && inputY === 0) {
      inputX = THREE.MathUtils.clamp((this.pointerTargetX - this.playerX) * 0.45, -1, 1);
      inputY = THREE.MathUtils.clamp((this.pointerTargetY - this.playerY) * 0.45, -1, 1);
    }

    if (this.invertY) {
      inputY = -inputY;
    }

    const maxLateralSpeed = 24;
    const maxVerticalSpeed = 14.5;
    this.playerVx = THREE.MathUtils.damp(this.playerVx, inputX * maxLateralSpeed, 11, dt);
    this.playerVy = THREE.MathUtils.damp(this.playerVy, inputY * maxVerticalSpeed, 11, dt);

    this.playerX += this.playerVx * dt;
    this.playerY += this.playerVy * dt;

    // Soft canyon wall cushion bounce at corridor edge
    if (this.playerX < -GAME_CONSTANTS.CORRIDOR_HALF_WIDTH) {
      this.playerX = -GAME_CONSTANTS.CORRIDOR_HALF_WIDTH;
      this.playerVx = Math.max(0, this.playerVx * -0.35);
    } else if (this.playerX > GAME_CONSTANTS.CORRIDOR_HALF_WIDTH) {
      this.playerX = GAME_CONSTANTS.CORRIDOR_HALF_WIDTH;
      this.playerVx = Math.min(0, this.playerVx * -0.35);
    }

    if (this.playerY < GAME_CONSTANTS.MIN_ALTITUDE) {
      this.playerY = GAME_CONSTANTS.MIN_ALTITUDE;
      this.playerVy = Math.max(0, this.playerVy * -0.2);
    } else if (this.playerY > GAME_CONSTANTS.MAX_ALTITUDE) {
      this.playerY = GAME_CONSTANTS.MAX_ALTITUDE;
      this.playerVy = Math.min(0, this.playerVy * -0.2);
    }

    this.playerRoll = THREE.MathUtils.damp(this.playerRoll, -this.playerVx * 0.028, 10, dt);
    this.playerPitch = THREE.MathUtils.damp(this.playerPitch, this.playerVy * 0.025, 10, dt);

    // Fire Pulse Cannon (buffered + continuous hold)
    const wantsFire =
      this.fireBuffer > 0 ||
      this.virtualFire ||
      this.pointerDownFiring ||
      this.heldKeys.has('KeyF') ||
      this.heldKeys.has('KeyJ') ||
      this.heldKeys.has('ShiftLeft') ||
      this.heldKeys.has('ShiftRight');

    if (wantsFire && this.cannonCooldown <= 0) {
      this.fireTwinCannon();
      this.cannonCooldown = GAME_CONSTANTS.CANNON_COOLDOWN;
      this.fireBuffer = 0;
    }

    // Update World & Entities
    this.scrollTerrain(this.currentSpeed, dt);
    this.updateSpawning(dt);
    this.updateRings(this.currentSpeed, dt);
    this.updateCrystals(this.currentSpeed, dt);
    this.updatePillars(this.currentSpeed, dt);
    this.updateDrones(this.currentSpeed, dt);
    this.updatePlayerBolts(dt);
    this.updateEnemyOrbs(this.currentSpeed, dt);
    this.updateParticles(dt);
    this.updateStreaks(this.currentSpeed, dt);

    // Sync Craft Visuals, Engine Audio, & Camera
    const speedRatio = THREE.MathUtils.clamp(
      (this.currentSpeed - GAME_CONSTANTS.BASE_SPEED) / (GAME_CONSTANTS.MAX_BASE_SPEED - GAME_CONSTANTS.BASE_SPEED),
      0,
      1,
    );
    this.syncPlayerCraftVisuals(speedRatio, this.isBoosting, dt);
    this.audio.updateEngine(speedRatio, this.isBoosting, true);
    this.updateCamera(dt);

    // Check high score live
    if (Math.floor(this.score) > this.bestScore) {
      this.bestScore = Math.floor(this.score);
      this.isNewBest = true;
    }

    // Throttled HUD sync (~15Hz) so React never fights 60fps loop
    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.065) {
      this.hudEmitAccum = 0;
      this.emitHud();
    }
  }

  private scrollTerrain(speed: number, dt: number): void {
    const moveZ = speed * dt;
    const chunkLen = GAME_CONSTANTS.CHUNK_LENGTH;
    const totalSpan = chunkLen * GAME_CONSTANTS.CHUNK_COUNT;

    for (const chunk of this.terrainChunks) {
      chunk.position.z += moveZ;
      if (chunk.position.z > chunkLen * 1.15) {
        chunk.position.z -= totalSpan;
      }
    }

    // Scroll sandstone texture offset seamlessly with speed
    this.scrollOffset = (this.scrollOffset + moveZ / chunkLen) % 1;
    this.textures.sandstoneAlbedo.offset.y = -this.scrollOffset * 14;
    this.textures.sandstoneBump.offset.y = -this.scrollOffset * 14;
  }

  private syncPlayerCraftVisuals(speedRatio: number, boosting: boolean, dt: number): void {
    this.craftScaleX = THREE.MathUtils.damp(this.craftScaleX, 1, 9, dt);
    this.craftScaleY = THREE.MathUtils.damp(this.craftScaleY, 1, 9, dt);
    this.craftScaleZ = THREE.MathUtils.damp(this.craftScaleZ, 1, 9, dt);

    const root = this.playerCraft.root;
    root.position.set(this.playerX, this.playerY, 0);
    root.rotation.set(this.playerPitch, 0, this.playerRoll);
    root.scale.set(this.craftScaleX, this.craftScaleY, this.craftScaleZ);

    // Ground contact shadow stays flush on valley floor beneath craft
    const shadow = this.playerCraft.contactShadow;
    const groundY = canyonHeightAt(this.playerX, 0) + 0.16;
    const altRatio = THREE.MathUtils.clamp((this.playerY - groundY) / 9, 0, 1);
    shadow.position.set(this.playerX, groundY, 0.2);
    const shadowScale = 0.85 + altRatio * 0.55;
    shadow.scale.set(shadowScale, 1, shadowScale);
    (shadow.material as THREE.MeshBasicMaterial).opacity = 0.48 * (1 - altRatio * 0.65);

    // Thruster flame stretch & flicker
    const flicker = 0.88 + Math.sin(this.elapsed * 48) * 0.12;
    const flameLen = (0.75 + speedRatio * 0.55 + (boosting ? 1.15 : 0)) * flicker;
    for (const flame of this.playerCraft.thrusterFlames) {
      flame.scale.set(boosting ? 1.28 : 1, boosting ? 1.28 : 1, flameLen);
      (flame.material as THREE.MeshBasicMaterial).color.setHex(boosting ? 0xfbbf24 : 0x5eead4);
    }

    // Shield bubble & invulnerability blink / hit flash
    const shieldMat = this.playerCraft.shieldBubble.material as THREE.MeshBasicMaterial;
    if (boosting) {
      shieldMat.opacity = 0.24;
      shieldMat.color.setHex(0x2dd4bf);
      this.playerCraft.shieldBubble.rotation.y += dt * 2.5;
    } else if (this.invulnTimer > 0) {
      shieldMat.opacity = 0.16 + Math.sin(this.elapsed * 26) * 0.1;
      shieldMat.color.setHex(0xfbbf24);
    } else {
      shieldMat.opacity = 0;
    }

    const flashActive = this.hitFlashTimer > 0;
    for (const m of this.playerCraft.hullMeshes) {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(flashActive ? 0xff6b4a : 0x000000);
      mat.emissiveIntensity = flashActive ? 1.4 : 0;
    }
  }

  private updateCamera(dt: number): void {
    const targetCamX = this.playerX * 0.62;
    const targetCamY = this.playerY + 2.35;
    const targetCamZ = this.isBoosting ? 10.6 : 9.6;
    const targetFov = this.isBoosting ? 74 : 62 + (this.currentSpeed - GAME_CONSTANTS.BASE_SPEED) * 0.14;

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetCamX, 8, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, targetCamY, 8, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, targetCamZ, 7, dt);
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 7, dt);
    this.camera.updateProjectionMatrix();

    if (this.cameraShake > 0) {
      const shakeAmt = this.cameraShake * this.cameraShake * 0.65;
      this.camera.position.x += (Math.random() - 0.5) * shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * shakeAmt;
      this.cameraShake = Math.max(0, this.cameraShake - dt * 2.8);
    }

    this.camera.lookAt(this.playerX * 0.8, this.playerY + 0.55, -24);
  }

  private updateSpawning(dt: number): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;

    this.waveCounter++;
    const difficulty = THREE.MathUtils.clamp(this.distance / 3200, 0, 1);
    this.spawnTimer = THREE.MathUtils.lerp(1.42, 0.85, difficulty);

    const spawnZ = -195;
    const pattern = this.waveCounter % 5;

    if (pattern === 1) {
      // Slalom Solar Rings + flanking rock pillar
      const lane = (Math.random() - 0.5) * 14;
      const alt = 3.2 + Math.random() * 4.2;
      this.spawnRing(lane, alt, spawnZ);
      this.spawnCrystal(lane, alt, spawnZ - 14);
      const pillarX = lane > 0 ? lane - 7.5 : lane + 7.5;
      this.spawnPillar(THREE.MathUtils.clamp(pillarX, -10.5, 10.5), spawnZ - 12);
    } else if (pattern === 2) {
      // Sentinel Drone encounter with escort crystal
      const dx = (Math.random() - 0.5) * 15;
      const dy = 3.0 + Math.random() * 4.5;
      this.spawnDrone(dx, dy, spawnZ);
      if (difficulty > 0.35) {
        this.spawnDrone(THREE.MathUtils.clamp(-dx, -10, 10), 4.2 + Math.random() * 3.0, spawnZ - 20);
      }
      this.spawnCrystal(-dx * 0.5, 3.6, spawnZ - 10);
    } else if (pattern === 3) {
      // Twin Canyon Pillars with central Solar Ring gate
      const gapX = (Math.random() - 0.5) * 9;
      this.spawnPillar(THREE.MathUtils.clamp(gapX - 6.2, -11, 11), spawnZ);
      this.spawnPillar(THREE.MathUtils.clamp(gapX + 6.2, -11, 11), spawnZ);
      this.spawnRing(gapX, 3.5 + Math.random() * 3.5, spawnZ - 4);
    } else if (pattern === 4) {
      // Crystal Ribbon + Drone Ambush
      const startX = (Math.random() - 0.5) * 12;
      const startY = 3.0 + Math.random() * 4.0;
      for (let i = 0; i < 3; i++) {
        this.spawnCrystal(
          THREE.MathUtils.clamp(startX + (i - 1) * 2.2, -10.5, 10.5),
          startY,
          spawnZ - i * 10,
        );
      }
      this.spawnDrone(THREE.MathUtils.clamp(-startX, -10, 10), startY + 0.8, spawnZ - 26);
    } else {
      // High-altitude Ring + Low Crystal + Pillar Slalom
      const rx = (Math.random() - 0.5) * 14;
      this.spawnRing(rx, 6.2, spawnZ);
      this.spawnPillar(rx, spawnZ - 18);
      this.spawnCrystal(THREE.MathUtils.clamp(-rx * 0.7, -10, 10), 2.8, spawnZ - 16);
    }
  }

  private spawnRing(x: number, y: number, z: number): void {
    const slot = this.rings.find((r) => !r.active);
    if (!slot) return;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.passed = false;
    slot.missed = false;
    slot.group.position.set(x, y, z);
    slot.group.scale.setScalar(1);
    slot.group.visible = true;
  }

  private spawnCrystal(x: number, y: number, z: number): void {
    const slot = this.crystals.find((c) => !c.active);
    if (!slot) return;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.group.position.set(x, y, z);
    slot.group.visible = true;
  }

  private spawnPillar(x: number, z: number): void {
    const slot = this.pillars.find((p) => !p.active);
    if (!slot) return;
    slot.active = true;
    slot.x = x;
    slot.z = z;
    const groundY = canyonHeightAt(x, 0) - 0.4;
    slot.group.position.set(x, groundY, z);
    slot.group.visible = true;
  }

  private spawnDrone(x: number, y: number, z: number): void {
    const slot = this.drones.find((d) => !d.active);
    if (!slot) return;
    slot.active = true;
    slot.x = x;
    slot.baseX = x;
    slot.y = y;
    slot.z = z;
    slot.windupTimer = 0;
    slot.fired = false;
    slot.hp = this.sectorIndex >= 3 ? 2 : 1;
    slot.flashTimer = 0;
    slot.parts.root.position.set(x, y, z);
    slot.parts.root.visible = true;
    (slot.parts.telegraphBeam.material as THREE.MeshBasicMaterial).opacity = 0;
  }

  private fireTwinCannon(): void {
    this.audio.playCannonFire();
    for (const side of [-1, 1]) {
      const bolt = this.playerBolts.find((b) => !b.active);
      if (!bolt) continue;
      bolt.active = true;
      bolt.x = this.playerX + side * 0.96;
      bolt.y = this.playerY - 0.05;
      bolt.z = -1.2;
      bolt.vz = -165 - this.currentSpeed * 0.4;
      bolt.mesh.position.set(bolt.x, bolt.y, bolt.z);
      bolt.mesh.visible = true;
    }
    this.craftScaleZ = 0.94;
  }

  private updateRings(speed: number, dt: number): void {
    const moveZ = speed * dt;
    for (const r of this.rings) {
      if (!r.active) continue;
      r.z += moveZ;
      r.group.position.z = r.z;
      r.group.rotation.z += dt * 1.4;

      if (!r.passed && r.z > -1.2 && r.z < 1.6) {
        const dx = this.playerX - r.x;
        const dy = this.playerY - r.y;
        if (dx * dx + dy * dy <= 3.6 * 3.6) {
          r.passed = true;
          this.ringsCleared++;
          this.missedRingsStreak = 0;
          this.combo = Math.min(8, this.combo + 1);
          this.maxCombo = Math.max(this.maxCombo, this.combo);
          this.score += 150 * this.combo;
          this.boostEnergy = Math.min(100, this.boostEnergy + GAME_CONSTANTS.RING_BOOST_BONUS);
          this.craftScaleX = 1.12;
          this.craftScaleY = 1.12;
          this.audio.playRingPass(this.combo);
          this.spawnBurst(r.x, r.y, r.z, 0x2dd4bf, 14, 14);
        }
      }

      if (!r.passed && !r.missed && r.z > 3.0) {
        r.missed = true;
        this.missedRingsStreak++;
        if (this.missedRingsStreak >= 3) {
          this.combo = 1;
          this.missedRingsStreak = 0;
        }
      }

      if (r.z > 18) {
        r.active = false;
        r.group.visible = false;
      }
    }
  }

  private updateCrystals(speed: number, dt: number): void {
    const moveZ = speed * dt;
    for (const c of this.crystals) {
      if (!c.active) continue;
      c.z += moveZ;
      c.phase += dt * 3.2;
      c.group.position.set(c.x, c.y + Math.sin(c.phase) * 0.25, c.z);
      c.group.rotation.y += dt * 2.4;

      const dx = this.playerX - c.x;
      const dy = this.playerY - c.y;
      const dz = c.z;
      if (dx * dx + dy * dy + dz * dz <= 2.4 * 2.4) {
        c.active = false;
        c.group.visible = false;
        this.crystalsCollected++;
        this.score += 100 * this.combo;
        this.boostEnergy = Math.min(100, this.boostEnergy + 12);
        this.shieldCharge += 25;
        if (this.shieldCharge >= 100) {
          if (this.hull < GAME_CONSTANTS.MAX_HULL) {
            this.hull++;
            this.shieldCharge -= 100;
            this.audio.playShieldRestore();
          } else {
            this.shieldCharge = 100;
            this.audio.playCrystalPickup();
          }
        } else {
          this.audio.playCrystalPickup();
        }
        this.spawnBurst(c.x, c.y, 0, 0xfbbf24, 10, 11);
      } else if (c.z > 16) {
        c.active = false;
        c.group.visible = false;
      }
    }
  }

  private updatePillars(speed: number, dt: number): void {
    const moveZ = speed * dt;
    for (const p of this.pillars) {
      if (!p.active) continue;
      p.z += moveZ;
      p.group.position.z = p.z;

      if (p.z > -1.6 && p.z < 1.6) {
        const dx = this.playerX - p.x;
        const groundY = canyonHeightAt(p.x, 0);
        if (Math.abs(dx) < p.radius + 1.05 && this.playerY < groundY + p.height - 0.4) {
          this.applyPlayerDamage(p.x, this.playerY, 0);
        }
      }

      if (p.z > 22) {
        p.active = false;
        p.group.visible = false;
      }
    }
  }

  private updateDrones(speed: number, dt: number): void {
    const moveZ = speed * dt;
    for (const d of this.drones) {
      if (!d.active) continue;
      d.z += moveZ;
      d.hoverPhase += dt * 2.6;
      d.x = d.baseX + Math.sin(d.hoverPhase) * 2.2;
      const bobY = d.y + Math.cos(d.hoverPhase * 1.3) * 0.45;
      d.parts.root.position.set(d.x, bobY, d.z);
      d.parts.gyroRing.rotation.z += dt * 3.4;
      d.parts.gyroRing.rotation.x += dt * 1.6;

      if (d.flashTimer > 0) {
        d.flashTimer -= dt;
        const mat = d.parts.chassisMesh.material as THREE.MeshStandardMaterial;
        mat.emissive.setHex(d.flashTimer > 0 ? 0xffffff : 0x000000);
        mat.emissiveIntensity = d.flashTimer > 0 ? 1.5 : 0;
      }

      // Windup Telegraph when drone enters firing range (-85m to -24m)
      const beamMat = d.parts.telegraphBeam.material as THREE.MeshBasicMaterial;
      if (!d.fired && d.z > -82 && d.z < -22) {
        d.windupTimer += dt;
        const pulse = 0.28 + Math.abs(Math.sin(this.elapsed * 22)) * 0.5;
        beamMat.opacity = pulse;
        d.parts.root.lookAt(this.playerX, this.playerY, 0);

        if (d.windupTimer >= 1.05) {
          d.fired = true;
          beamMat.opacity = 0;
          this.spawnEnemyOrb(d.x, bobY, d.z + 1.2);
        }
      } else {
        beamMat.opacity = 0;
      }

      // Collision with player craft (Boost Ram shatters drone safely!)
      if (d.z > -1.8 && d.z < 1.8) {
        const dx = this.playerX - d.x;
        const dy = this.playerY - bobY;
        if (dx * dx + dy * dy < 2.6 * 2.6) {
          if (this.isBoosting) {
            this.shatterDrone(d, bobY);
          } else {
            this.shatterDrone(d, bobY);
            this.applyPlayerDamage(d.x, bobY, 0);
          }
          continue;
        }
      }

      if (d.z > 16) {
        d.active = false;
        d.parts.root.visible = false;
      }
    }
  }

  private spawnEnemyOrb(x: number, y: number, z: number): void {
    const orb = this.enemyOrbs.find((o) => !o.active);
    if (!orb) return;

    _v1.set(this.playerX - x, this.playerY - y, -z).normalize();
    const orbSpeed = 48;
    orb.active = true;
    orb.x = x;
    orb.y = y;
    orb.z = z;
    orb.vx = _v1.x * orbSpeed;
    orb.vy = _v1.y * orbSpeed;
    orb.vz = _v1.z * orbSpeed;
    orb.mesh.position.set(x, y, z);
    orb.mesh.visible = true;
  }

  private updatePlayerBolts(dt: number): void {
    for (const b of this.playerBolts) {
      if (!b.active) continue;
      b.z += b.vz * dt;
      b.mesh.position.z = b.z;

      // Hit check against active Sentinel Drones
      let hit = false;
      for (const d of this.drones) {
        if (!d.active) continue;
        const dx = b.x - d.x;
        const dy = b.y - d.parts.root.position.y;
        const dz = b.z - d.z;
        if (dx * dx + dy * dy + dz * dz < 2.35 * 2.35) {
          hit = true;
          d.hp--;
          d.flashTimer = 0.09;
          if (d.hp <= 0) {
            this.shatterDrone(d, d.parts.root.position.y);
          } else {
            this.spawnBurst(b.x, b.y, b.z, 0xf97316, 6, 9);
          }
          break;
        }
      }

      if (hit || b.z < -215) {
        b.active = false;
        b.mesh.visible = false;
      }
    }
  }

  private updateEnemyOrbs(speed: number, dt: number): void {
    for (const o of this.enemyOrbs) {
      if (!o.active) continue;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.z += (o.vz + speed * 0.45) * dt;
      o.mesh.position.set(o.x, o.y, o.z);

      if (o.z > -1.4 && o.z < 1.4) {
        const dx = this.playerX - o.x;
        const dy = this.playerY - o.y;
        if (dx * dx + dy * dy < 1.55 * 1.55) {
          o.active = false;
          o.mesh.visible = false;
          this.applyPlayerDamage(o.x, o.y, 0);
          continue;
        }
      }

      if (o.z > 14) {
        o.active = false;
        o.mesh.visible = false;
      }
    }
  }

  private shatterDrone(d: DroneEntity, worldY: number): void {
    d.active = false;
    d.parts.root.visible = false;
    this.dronesShattered++;
    this.score += 250 * this.combo;
    this.hitstopTimer = 0.042; // Crisp 42ms simulation hitstop
    this.cameraShake = Math.min(1, this.cameraShake + 0.42);
    this.audio.playDroneShatter();
    this.spawnBurst(d.x, worldY, d.z, 0xf97316, 18, 18);
    this.spawnBurst(d.x, worldY, d.z, 0xff3b5c, 8, 13);
  }

  private applyPlayerDamage(hx: number, hy: number, hz: number): void {
    if (this.invulnTimer > 0) return;

    this.hull--;
    this.invulnTimer = GAME_CONSTANTS.INVULN_DURATION;
    this.hitFlashTimer = 0.22;
    this.hitstopTimer = 0.065; // Heavy 65ms impact hitstop
    this.cameraShake = 1.0;
    this.combo = 1;
    this.missedRingsStreak = 0;
    this.craftScaleX = 1.24;
    this.craftScaleY = 0.76;
    this.audio.playHullImpact();
    this.spawnBurst(hx, hy, hz, 0xff5a36, 18, 16);

    if (this.hull <= 0) {
      this.hull = 0;
      this.triggerGameOver();
    } else {
      this.emitHud();
    }
  }

  private triggerGameOver(): void {
    this.phase = 'gameover';
    this.heldKeys.clear();
    this.clearVirtualInputs();
    this.audio.updateEngine(0, false, false);

    const finalScore = Math.floor(this.score);
    if (finalScore >= this.bestScore) {
      this.bestScore = finalScore;
      try {
        localStorage.setItem(GAME_CONSTANTS.BEST_SCORE_KEY, String(this.bestScore));
      } catch {
        // ignore storage quota
      }
    }
    this.emitHud();
  }

  private spawnBurst(
    x: number,
    y: number,
    z: number,
    hex: number,
    count: number,
    speed: number,
  ): void {
    let spawned = 0;
    for (const p of this.particles) {
      if (p.active) continue;
      p.active = true;
      p.x = x;
      p.y = y;
      p.z = z;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI - Math.PI / 2;
      const spd = speed * (0.45 + Math.random() * 0.75);
      p.vx = Math.cos(theta) * Math.cos(phi) * spd;
      p.vy = Math.sin(phi) * spd + 2.5;
      p.vz = Math.sin(theta) * Math.cos(phi) * spd;
      p.maxLife = 0.36 + Math.random() * 0.26;
      p.life = p.maxLife;
      p.scale = 0.6 + Math.random() * 0.9;
      p.color.setHex(hex);
      spawned++;
      if (spawned >= count) break;
    }
  }

  private updateParticles(dt: number): void {
    let anyChanged = false;
    for (let i = 0; i < this.particleCount; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyChanged = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _v1.set(0, -999, 0);
        _quat.identity();
        _v2.set(0, 0, 0);
        _mat4.compose(_v1, _quat, _v2);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }

      p.vy -= 18 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const s = p.scale * (p.life / p.maxLife);
      _v1.set(p.x, p.y, p.z);
      _euler.set(p.life * 7, p.life * 5, 0);
      _quat.setFromEuler(_euler);
      _v2.set(s, s, s);
      _mat4.compose(_v1, _quat, _v2);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, p.color);
    }

    if (anyChanged) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  private updateStreaks(speed: number, dt: number): void {
    const boostStretch = this.isBoosting ? 1.9 : 1.0;
    for (let i = 0; i < this.streakCount; i++) {
      const s = this.streaks[i];
      s.z += speed * s.speedMult * 1.45 * dt;
      if (s.z > 14) {
        s.z = -110 - Math.random() * 40;
        s.x = (Math.random() - 0.5) * 28;
        s.y = 1.6 + Math.random() * 9.5;
      }
      _v1.set(s.x, s.y, s.z);
      _quat.identity();
      _v2.set(1, 1, s.length * boostStretch);
      _mat4.compose(_v1, _quat, _v2);
      this.streakMesh.setMatrixAt(i, _mat4);
    }
    this.streakMesh.instanceMatrix.needsUpdate = true;
  }

  private emitHud(): void {
    const sector = SECTORS[Math.min(this.sectorIndex - 1, SECTORS.length - 1)];
    this.onHudUpdate({
      phase: this.phase,
      score: Math.floor(this.score),
      bestScore: this.bestScore,
      distance: Math.floor(this.distance),
      hull: this.hull,
      maxHull: GAME_CONSTANTS.MAX_HULL,
      shieldCharge: Math.floor(this.shieldCharge),
      boostEnergy: Math.floor(this.boostEnergy),
      isBoosting: this.isBoosting,
      combo: this.combo,
      maxCombo: this.maxCombo,
      ringsCleared: this.ringsCleared,
      dronesShattered: this.dronesShattered,
      crystalsCollected: this.crystalsCollected,
      speedKmh: Math.round(this.currentSpeed * 6.4),
      sectorIndex: sector.index,
      sectorName: sector.name,
      isNewBest: this.isNewBest,
      muted: this.audio.isMuted(),
      cannonCooldownRatio: this.cannonCooldown / GAME_CONSTANTS.CANNON_COOLDOWN,
      mouseSteer: this.mouseSteer,
      invertY: this.invertY,
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.handlePointerDown);
    dom.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);

    this.audio.dispose();
    this.textures.dispose();
    this.envRT.dispose();

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
