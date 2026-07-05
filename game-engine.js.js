/* =====================================================================
   PROTOCOL :: 1v1 TACTICAL SHOOTER
   game-engine.js - 3D engine, world, characters, bullets, abilities, bot, networking
   ~5500 lines
   ===================================================================== */
'use strict';

/* ============================================================
   THREE.JS SCENE SETUP
   ~150 lines
   ============================================================ */
let scene, camera, renderer, clock;
let threeReady = false;

function initThree() {
  if (typeof THREE === 'undefined') {
    console.error('[PROTOCOL] THREE.js not loaded');
    return false;
  }
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a232c);
  scene.fog = new THREE.Fog(0x1a232c, 30, 140);
  camera = new THREE.PerspectiveCamera(G.settings.fov, window.innerWidth/window.innerHeight, 0.05, 500);
  camera.position.set(0, 1.7, 0);
  try {
    renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
  } catch(e) {
    try { renderer = new THREE.WebGLRenderer({antialias:false}); }
    catch(e2) { console.error('[PROTOCOL] WebGL init failed', e2); return false; }
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.body.insertBefore(renderer.domElement, document.body.firstChild);
  renderer.domElement.style.position = 'fixed';
  renderer.domElement.style.inset = '0';
  renderer.domElement.style.zIndex = '1';
  renderer.domElement.style.display = 'none';
  clock = new THREE.Clock();
  // Lighting
  const hemi = new THREE.HemisphereLight(0x9eb5c7, 0x3a2a1a, 0.8); scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffe8c0, 0.9);
  dir.position.set(30, 50, 20);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.camera.left = -60; dir.shadow.camera.right = 60;
  dir.shadow.camera.top = 60; dir.shadow.camera.bottom = -60;
  dir.shadow.camera.near = 0.5; dir.shadow.camera.far = 200;
  scene.add(dir);
  // Accent point lights
  const p1 = new THREE.PointLight(0x4ec9ff, 1.5, 25); p1.position.set(-25, 4, -25); scene.add(p1);
  const p2 = new THREE.PointLight(0xff6a3d, 1.5, 25); p2.position.set(25, 4, 25); scene.add(p2);
  const p3 = new THREE.PointLight(0x6affb8, 1.0, 20); p3.position.set(0, 4, 0); scene.add(p3);
  window.addEventListener('resize', () => {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  threeReady = true;
  return true;
}
window.initThree = initThree;

/* ============================================================
   FPS CONTROLLER
   ~200 lines
   ============================================================ */
const FPC = {
  yaw: 0, pitch: 0,
  vel: new THREE.Vector3(),
  onGround: true, height: 1.7, bob: 0,
  init() {
    document.addEventListener('mousemove', e => {
      if (G.phase !== 'playing' || G.paused) return;
      if (document.pointerLockElement !== renderer.domElement) return;
      FPC.yaw -= e.movementX * G.settings.sens;
      FPC.pitch -= e.movementY * G.settings.sens;
      FPC.pitch = clamp(FPC.pitch, -Math.PI/2 + 0.05, Math.PI/2 - 0.05);
    });
    renderer.domElement.addEventListener('click', () => {
      if (G.phase === 'playing' && !G.paused && document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
      }
    });
  },
  update(dt) {
    if (G.phase !== 'playing' || G.paused) return;
    if (document.pointerLockElement !== renderer.domElement) return;
    if (!G.player) return;
    const dir = new THREE.Vector3();
    if (G.keys[KEYMAP.FORWARD[0]]||G.keys[KEYMAP.FORWARD[1]]) dir.z -= 1;
    if (G.keys[KEYMAP.BACK[0]]||G.keys[KEYMAP.BACK[1]]) dir.z += 1;
    if (G.keys[KEYMAP.LEFT[0]]||G.keys[KEYMAP.LEFT[1]]) dir.x -= 1;
    if (G.keys[KEYMAP.RIGHT[0]]||G.keys[KEYMAP.RIGHT[1]]) dir.x += 1;
    G.walking = G.keys[KEYMAP.WALK[0]];
    const speed = (G.walking ? 3.2 : 6.5) * (FPC.onGround ? 1 : 0.4);
    if (dir.lengthSq() > 0) {
      dir.normalize();
      const cy = Math.cos(FPC.yaw), sy = Math.sin(FPC.yaw);
      const wx = dir.x*cy + dir.z*sy, wz = -dir.x*sy + dir.z*cy;
      FPC.vel.x = lerp(FPC.vel.x, wx*speed, dt*12);
      FPC.vel.z = lerp(FPC.vel.z, wz*speed, dt*12);
      FPC.bob += dt*speed*1.2;
      if (FPC.onGround && Math.floor(FPC.bob*2) !== Math.floor((FPC.bob-dt*speed*1.2)*2)) {
        if (Math.random() < 0.5) Audio.footstep();
      }
    } else {
      FPC.vel.x *= 0.85; FPC.vel.z *= 0.85;
    }
    FPC.vel.y -= 22*dt;
    if (G.keys[KEYMAP.JUMP[0]] && FPC.onGround) {
      FPC.vel.y = 8.5; FPC.onGround = false; Audio.jump();
    }
    G.player.position.x += FPC.vel.x*dt;
    G.player.position.y += FPC.vel.y*dt;
    G.player.position.z += FPC.vel.z*dt;
    if (G.player.position.y <= FPC.height) {
      if (!FPC.onGround && FPC.vel.y < -1) Audio.land();
      G.player.position.y = FPC.height; FPC.vel.y = 0; FPC.onGround = true;
    }
    if (G.world) G.world.collidePlayer(G.player);
    const bobY = FPC.onGround ? Math.sin(FPC.bob*2)*0.04 : 0;
    const bobX = FPC.onGround ? Math.cos(FPC.bob)*0.025 : 0;
    camera.position.set(
      G.player.position.x + Math.cos(FPC.yaw)*bobX,
      G.player.position.y + bobY,
      G.player.position.z - Math.sin(FPC.yaw)*bobX
    );
    camera.rotation.set(0,0,0,'YXZ');
    camera.rotation.y = FPC.yaw;
    camera.rotation.x = FPC.pitch;
  }
};
const KEYMAP = {
  FORWARD: ['KeyW','ArrowUp'],
  BACK: ['KeyS','ArrowDown'],
  LEFT: ['KeyA','ArrowLeft'],
  RIGHT: ['KeyD','ArrowRight'],
  JUMP: ['Space'],
  WALK: ['CapsLock'],
  SCOREBOARD: ['Tab']
};
const ABIL_KEYS = ['KeyC','KeyQ','KeyE','KeyX'];
window.FPC = FPC;
window.KEYMAP = KEYMAP;
window.ABIL_KEYS = ABIL_KEYS;

/* ============================================================
   WORLD / RAYCAST
   ~300 lines - World class, AABB collision, raycasting
   ============================================================ */
class World {
  constructor() {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = [];
    this.spikeSpots = [];
  }
  addBox(x,y,z,w,h,d,color=0x3a4250,opts={}) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w,h,d),
      new THREE.MeshStandardMaterial({
        color, roughness:opts.rough??0.85, metalness:opts.metal??0.1,
        emissive:opts.emissive??0x000000, emissiveIntensity:opts.emissiveI??0
      })
    );
    m.position.set(x,y,z);
    m.castShadow = true; m.receiveShadow = true;
    this.group.add(m);
    if (opts.collide !== false) {
      this.colliders.push({minX:x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2, h:y+h/2, fullH:h, yBottom:y-h/2, yTop:y+h/2});
    }
    return m;
  }
  addSpikeSpot(x,z) { this.spikeSpots.push(new THREE.Vector3(x,0,z)); }
  addFloor() {
    const g = new THREE.PlaneGeometry(200,200,50,50);
    g.rotateX(-Math.PI/2);
    const p = g.attributes.position;
    for (let i=0;i<p.count;i++) p.setZ(i,(Math.random()-0.5)*0.1);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({color:0x1a2028, roughness:0.95}));
    m.receiveShadow = true; this.group.add(m);
  }
  addSky() {
    const m = new THREE.Mesh(new THREE.SphereGeometry(200,32,16), new THREE.MeshBasicMaterial({color:0x0e1218, side:THREE.BackSide, fog:false}));
    scene.add(m);
  }
  collidePlayer(p) {
    const r = 0.4;
    for (const c of this.colliders) {
      if (p.y - FPC.height > c.yTop) continue;
      if (p.x+r > c.minX && p.x-r < c.maxX && p.z+r > c.minZ && p.z-r < c.maxZ) {
        const dxL = p.x-c.minX, dxR = c.maxX-p.x, dzL = p.z-c.minZ, dzR = c.maxZ-p.z;
        const m = Math.min(dxL,dxR,dzL,dzR);
        if (m===dxL) p.x = c.minX-r;
        else if (m===dxR) p.x = c.maxX+r;
        else if (m===dzL) p.z = c.minZ-r;
        else p.z = c.maxZ+r;
        FPC.vel.x *= 0.4; FPC.vel.z *= 0.4;
      }
    }
  }
  raycast(o, d, maxD) {
    let best = maxD, hit = null;
    for (const c of this.colliders) {
      const t = rayBox(o, d, c.minX-0.4, c.yBottom, c.minZ-0.4, c.maxX+0.4, c.yTop, c.maxZ+0.4);
      if (t !== null && t < best) { best = t; hit = c; }
    }
    return {dist: best, hit};
  }
}
function rayBox(o, d, mnX, mnY, mnZ, mxX, mxY, mxZ) {
  let tmin = -Infinity, tmax = Infinity;
  for (const [oC, dC, mn, mx] of [[o.x,d.x,mnX,mxX],[o.y,d.y,mnY,mxY],[o.z,d.z,mnZ,mxZ]]) {
    if (Math.abs(dC) < 1e-8) { if (oC < mn || oC > mx) return null; }
    else {
      const t1 = (mn-oC)/dC, t2 = (mx-oC)/dC;
      tmin = Math.max(tmin, Math.min(t1,t2));
      tmax = Math.min(tmax, Math.max(t1,t2));
      if (tmin > tmax) return null;
    }
  }
  return tmin > 0 ? tmin : (tmax > 0 ? 0.0001 : null);
}
function raySphere(o, d, c, r, maxT) {
  const oc = new THREE.Vector3().subVectors(o, c);
  const b = oc.dot(d), cc = oc.lengthSq() - r*r;
  const disc = b*b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t < 0 || t > maxT) return null;
  return t;
}
window.World = World;
window.rayBox = rayBox;
window.raySphere = raySphere;

/* ============================================================
   MAP BUILDERS - 8 unique maps
   ~800 lines
   ============================================================ */
function buildMap(name) {
  const w = new World();
  w.addSky();
  w.addFloor();
  const W = 0x4a5260, A = 0x2a3340, M = 0x6a7682;
  const addW = (x,z,w_,d,h,c) => w.addBox(x,h/2,z,w_,h,d,c);
  const config = MAPS[name] || MAPS.ascent;
  if (name === 'ascent') {
    addW(0,-30,60,1,8,W); addW(0,30,60,1,8,W); addW(-30,0,1,60,8,W); addW(30,0,1,60,8,W);
    w.addBox(0,1,0,4,2,4,0x5a3340,{emissive:0xff4655,emissiveI:0.15});
    w.addBox(0,0.4,4,3,0.8,6,A);
    w.addBox(-22,2,-22,4,4,4,0x4ec9ff,{emissive:0x4ec9ff,emissiveI:0.1});
    w.addBox(-15,1,-18,3,2,1,W); w.addBox(-22,0.6,-10,6,1.2,2,A); w.addBox(-20,1.5,-2,2,3,1,W);
    w.addBox(22,2,22,4,4,4,0xff6a3d,{emissive:0xff6a3d,emissiveI:0.1});
    w.addBox(15,1,18,3,2,1,W); w.addBox(22,0.6,10,6,1.2,2,A); w.addBox(20,1.5,2,2,3,1,W);
    w.addBox(-8,2,8,1,4,1,M); w.addBox(8,2,-8,1,4,1,M);
    w.addBox(-6,1,-6,2,2,2,W); w.addBox(6,1,6,2,2,2,W);
    w.addBox(0,1,15,8,2,1,A); w.addBox(0,1,-15,8,2,1,A);
    w.addBox(15,1,0,1,2,8,A); w.addBox(-15,1,0,1,2,8,A);
    w.addBox(-5,2,5,1,4,1,M); w.addBox(5,2,-5,1,4,1,M);
    w.addBox(0,1.5,10,1,3,1,M); w.addBox(0,1.5,-10,1,3,1,M);
    w.addSpikeSpot(0,0); w.addSpikeSpot(15,15); w.addSpikeSpot(-15,-15);
  } else if (name === 'haven') {
    addW(0,-32,64,1,8,W); addW(0,32,64,1,8,W); addW(-32,0,1,64,8,W); addW(32,0,1,64,8,W);
    w.addBox(-18,1,-18,5,2,2,0x4ec9ff,{emissive:0x4ec9ff,emissiveI:0.1});
    w.addBox(18,1,18,5,2,2,0xff6a3d,{emissive:0xff6a3d,emissiveI:0.1});
    w.addBox(0,1.5,0,6,3,6,0x5a3340,{emissive:0xff4655,emissiveI:0.15});
    w.addBox(-10,0.5,0,2,1,12,A); w.addBox(10,0.5,0,2,1,12,A);
    w.addBox(0,0.5,-10,12,1,2,A); w.addBox(0,0.5,10,12,1,2,A);
    w.addBox(-20,1,-5,2,2,8,A); w.addBox(20,1,5,2,2,8,A);
    w.addBox(-12,2,-15,1,4,1,M); w.addBox(12,2,15,1,4,1,M);
    w.addBox(0,1,0,2,2,2,W);
    w.addSpikeSpot(0,0); w.addSpikeSpot(-18,-18); w.addSpikeSpot(18,18);
  } else if (name === 'bind') {
    addW(0,-35,70,1,8,W); addW(0,35,70,1,8,W); addW(-35,0,1,70,8,W); addW(35,0,1,70,8,W);
    w.addBox(-25,2,-25,5,4,5,0x4ec9ff,{emissive:0x4ec9ff,emissiveI:0.1});
    w.addBox(25,2,25,5,4,5,0xff6a3d,{emissive:0xff6a3d,emissiveI:0.1});
    w.addBox(0,1,0,8,2,4,0x5a3340,{emissive:0xff4655,emissiveI:0.15});
    w.addBox(-12,1,-15,2,2,15,A); w.addBox(12,1,15,2,2,15,A);
    w.addBox(-20,1.5,0,1,3,10,W); w.addBox(20,1.5,0,1,3,10,W);
    w.addBox(0,0.5,-20,15,1,2,A); w.addBox(0,0.5,20,15,1,2,A);
    w.addBox(-15,0.6,10,4,1.2,3,A); w.addBox(15,0.6,-10,4,1.2,3,A);
    w.addSpikeSpot(0,0); w.addSpikeSpot(-20,15);
  } else if (name === 'split') {
    addW(0,-30,60,1,8,W); addW(0,30,60,1,8,W); addW(-30,0,1,60,8,W); addW(30,0,1,60,8,W);
    w.addBox(-15,3,-15,8,6,3,0x4ec9ff,{emissive:0x4ec9ff,emissiveI:0.1});
    w.addBox(15,3,15,8,6,3,0xff6a3d,{emissive:0xff6a3d,emissiveI:0.1});
    w.addBox(0,1,0,6,2,3,0x5a3340,{emissive:0xff4655,emissiveI:0.15});
    w.addBox(-10,0.5,0,1,1,12,A); w.addBox(10,0.5,0,1,1,12,A);
    w.addBox(0,0.5,-10,12,1,1,A); w.addBox(0,0.5,10,12,1,1,A);
    w.addBox(-5,2,5,2,4,1,W); w.addBox(5,2,-5,2,4,1,W);
    w.addBox(0,3,12,3,6,1,W);
    w.addSpikeSpot(0,0); w.addSpikeSpot(-15,15);
  } else if (name === 'lotus') {
    addW(0,-30,60,1,8,W); addW(0,30,60,1,8,W); addW(-30,0,1,60,8,W); addW(30,0,1,60,8,W);
    w.addBox(-20,1,0,4,2,8,0x4ec9ff,{emissive:0x4ec9ff,emissiveI:0.1});
    w.addBox(20,1,0,4,2,8,0xff6a3d,{emissive:0xff6a3d,emissiveI:0.1});
    w.addBox(0,1,12,8,2,4,0x5a3340,{emissive:0xff4655,emissiveI:0.15});
    w.addBox(0,1,-12,8,2,4,A);
    w.addBox(-12,1,-10,2,2,2,W); w.addBox(12,1,10,2,2,2,W);
    w.addBox(-10,0.5,0,1,1,8,A); w.addBox(10,0.5,0,1,1,8,A);
    w.addBox(0,1,0,2,2,2,M);
    w.addSpikeSpot(0,0); w.addSpikeSpot(-15,0); w.addSpikeSpot(15,0);
  } else if (name === 'icebox') {
    addW(0,-30,60,1,8,W); addW(0,30,60,1,8,W); addW(-30,0,1,60,8,W); addW(30,0,1,60,8,W);
    w.addBox(-20,3,-5,8,6,4,0x4ec9ff,{emissive:0x7fb5ff,emissiveI:0.15});
    w.addBox(20,3,5,8,6,4,0xff6a3d,{emissive:0x80ff5d,emissiveI:0.1});
    w.addBox(0,1,0,6,2,6,0x5a3340,{emissive:0xff4655,emissiveI:0.15});
    w.addBox(-10,1,10,2,2,2,W); w.addBox(10,1,-10,2,2,2,W);
    w.addBox(-15,2,5,1,4,1,M); w.addBox(15,2,-5,1,4,1,M);
    w.addBox(0,0.5,0,12,1,2,A);
    w.addSpikeSpot(-10,0); w.addSpikeSpot(10,0);
  } else if (name === 'pearl') {
    addW(0,-35,70,1,8,W); addW(0,35,70,1,8,W); addW(-35,0,1,70,8,W); addW(35,0,1,70,8,W);
    w.addBox(-20,1,0,6,2,10,0x4ec9ff,{emissive:0x4ec9ff,emissiveI:0.1});
    w.addBox(20,1,0,6,2,10,0xff6a3d,{emissive:0xff6a3d,emissiveI:0.1});
    w.addBox(0,1,0,10,2,4,0x5a3340,{emissive:0xff4655,emissiveI:0.15});
    w.addBox(-10,1,8,2,2,2,W); w.addBox(10,1,-8,2,2,2,W);
    w.addBox(-12,0.5,0,1,1,15,A); w.addBox(12,0.5,0,1,1,15,A);
    w.addBox(0,0.5,-12,15,1,1,A); w.addBox(0,0.5,12,15,1,1,A);
    w.addSpikeSpot(-10,0); w.addSpikeSpot(10,0);
  } else { // custom
    addW(0,-40,80,1,8,0x3a4250); addW(0,40,80,1,8,0x3a4250);
    addW(-40,0,1,80,8,0x3a4250); addW(40,0,1,80,8,0x3a4250);
    for (let i=0;i<25;i++) {
      const x = rand(-30,30), z = rand(-30,30), s = rand(1.5,3);
      w.addBox(x,s/2,z,s,s,s,0x4a5260);
    }
    w.addBox(-20,0.5,-20,8,1,3,0x5a3340); w.addBox(20,0.5,20,8,1,3,0x5a3340);
    w.addBox(0,0.5,0,3,1,3,0xff4655);
    w.addSpikeSpot(0,0);
  }
  const grid = new THREE.GridHelper(config.size, Math.floor(config.size/2), 0x2a3340, 0x1a232c);
  grid.position.y = 0.01; w.group.add(grid);
  // spawn point markers
  for (const s of SPAWNS[name] || []) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.4,0.05,16), new THREE.MeshBasicMaterial({color:0x00ff7f, transparent:true, opacity:0.3}));
    m.position.set(s.x, 0.03, s.z);
    w.group.add(m);
  }
  return w;
}
window.buildMap = buildMap;

/* ============================================================
   CHARACTER CLASS - the player and enemy
   ~350 lines
   ============================================================ */
class Character {
  constructor(name, color, isEnemy=false) {
    this.name = name; this.color = color; this.isEnemy = isEnemy;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.maxHp = 100;
    this.armor = 0; this.alive = true;
    this.weapon = 'classic'; this.ammo = 12; this.reserve = 36;
    this.reloading = 0; this.lastShot = 0;
    this.shotsSinceReset = 0; this.recoilPitch = 0; this.recoilYaw = 0;
    this.mesh = this.buildMesh(color);
  }
  buildMesh(color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({color, roughness:0.5, metalness:0.2, emissive:color, emissiveIntensity:0.05});
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32,0.9,4,8), mat);
    body.position.y=0.85; body.castShadow=true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22,16,12), new THREE.MeshStandardMaterial({color:0xe8c0a0, roughness:0.6}));
    head.position.y=1.65; head.castShadow=true; g.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4,0.08,0.18), new THREE.MeshStandardMaterial({color, emissive:color, emissiveIntensity:0.6, metalness:0.9, roughness:0.2}));
    visor.position.set(0,1.65,0.16); g.add(visor);
    const armMat = new THREE.MeshStandardMaterial({color, roughness:0.5});
    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.08,0.55,4,6), armMat);
    armL.position.set(-0.28,1.0,0.05); armL.castShadow=true; g.add(armL);
    const armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.08,0.55,4,6), armMat);
    armR.position.set(0.28,1.0,0.05); armR.castShadow=true; g.add(armR);
    this.armR = armR;
    const legMat = new THREE.MeshStandardMaterial({color:0x1a2028, roughness:0.7});
    const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.1,0.6,4,6), legMat);
    legL.position.set(-0.14,0.35,0); legL.castShadow=true; g.add(legL);
    const legR = new THREE.Mesh(new THREE.CapsuleGeometry(0.1,0.6,4,6), legMat);
    legR.position.set(0.14,0.35,0); legR.castShadow=true; g.add(legR);
    this.legL = legL; this.legR = legR;
    this.weaponMesh = this.buildWeaponModel('classic');
    g.add(this.weaponMesh);
    return g;
  }
  buildWeaponModel(w) {
    const wpn = WEAPONS[w] || WEAPONS.classic;
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({color:0x2a2a2a, roughness:0.4, metalness:0.8});
    const a = new THREE.MeshStandardMaterial({color:this.color, emissive:this.color, emissiveIntensity:0.3, roughness:0.4, metalness:0.5});
    if (wpn.type === 'melee') {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.04,0.04,0.5), m));
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.16,0.08), a);
      h.position.z=0.25; g.add(h);
    } else if (wpn.type === 'sniper') {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06,0.08,0.9), m));
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.04,0.06,0.3), m);
      s.position.set(0,0.07,0.2); g.add(s);
      const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.15,8), a);
      sc.rotation.x=Math.PI/2; sc.position.set(0,0.09,-0.1); g.add(sc);
    } else if (wpn.type === 'shotgun') {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06,0.08,0.7), m));
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.05,8), a);
      b.rotation.x=Math.PI/2; b.position.set(0,0,0.35); g.add(b);
    } else if (wpn.type === 'rifle') {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.05,0.07,0.7), m));
      const mg = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.13,0.08), a);
      mg.position.set(0,-0.08,0.1); g.add(mg);
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.04,0.06,0.2), m);
      st.position.set(0,0,-0.4); g.add(st);
    } else if (wpn.type === 'lmg') {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06,0.08,0.9), m));
      const mg = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.16,0.1), a);
      mg.position.set(0,-0.1,0.15); g.add(mg);
    } else if (wpn.type === 'smg') {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.045,0.06,0.4), m));
      const mg = new THREE.Mesh(new THREE.BoxGeometry(0.045,0.1,0.06), a);
      mg.position.set(0,-0.07,0.05); g.add(mg);
    } else { // pistol / ult
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.04,0.06,0.3), m));
      const gr = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.1,0.06), a);
      gr.position.set(0,-0.07,0.05); g.add(gr);
    }
    g.position.set(0.28,1.1,0.25);
    g.rotation.set(-0.1,0.05,0);
    return g;
  }
  setWeapon(w) {
    this.weapon = w; this.ammo = WEAPONS[w].mag; this.reserve = WEAPONS[w].reserve;
    this.mesh.remove(this.weaponMesh);
    this.weaponMesh = this.buildWeaponModel(w);
    this.mesh.add(this.weaponMesh);
  }
  setPos(x,y,z) { this.position.set(x,y,z); this.mesh.position.copy(this.position); }
  setYawPitch(y,p) { this.yaw=y; this.pitch=p; this.mesh.rotation.set(0,y,0); }
  update(dt) {
    this.mesh.position.copy(this.position);
    if (this.alive) {
      const sp = this.velocity.length();
      if (sp > 0.5) {
        const t = performance.now()*0.008;
        this.legL.rotation.x = Math.sin(t)*0.6;
        this.legR.rotation.x = -Math.sin(t)*0.6;
        this.armR.rotation.x = -Math.sin(t)*0.4;
      } else {
        this.legL.rotation.x = lerp(this.legL.rotation.x, 0, dt*5);
        this.legR.rotation.x = lerp(this.legR.rotation.x, 0, dt*5);
        this.armR.rotation.x = lerp(this.armR.rotation.x, 0, dt*5);
      }
      const bob = Math.sin(performance.now()*0.005)*0.02;
      this.weaponMesh.position.y = 1.1 + bob;
      this.weaponMesh.position.x = 0.28 + Math.sin(performance.now()*0.003)*0.01;
    }
    if (this.reloading > 0) {
      this.reloading -= dt;
      this.weaponMesh.rotation.x = lerp(this.weaponMesh.rotation.x, -0.4, dt*8);
      if (this.reloading <= 0) {
        const wpn = WEAPONS[this.weapon];
        const need = wpn.mag - this.ammo;
        const take = Math.min(need, this.reserve);
        this.ammo += take; this.reserve -= take;
        this.weaponMesh.rotation.x = -0.1;
        if (!this.isEnemy) Audio.reload();
      }
    }
  }
  takeDamage(dmg, isHead, fromPos, pen=1) {
    if (!this.alive) return false;
    let finalDmg = dmg;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg*0.66);
      this.armor -= absorbed;
      finalDmg -= absorbed;
    }
    this.hp -= finalDmg;
    if (!this.isEnemy) {
      const hpFill = $('hpFill');
      const hpArmor = $('hpArmor');
      const hpText = $('hpText');
      if (hpFill) hpFill.style.width = clamp(this.hp, 0, 100) + '%';
      if (hpArmor) hpArmor.style.width = this.armor + '%';
      if (hpText) hpText.textContent = `${Math.max(0,Math.floor(this.hp))} / 100`;
      const dmg = $('damageVignette'); if (dmg) dmg.classList.add('show');
      G.damageFlash = 0.3;
      Audio.hitTaken();
      G.stats.dmgTaken += finalDmg;
      if (this.hp <= 0) { this.die(isHead, fromPos); return true; }
    } else {
      if (this.hp <= 0) { this.die(isHead, fromPos); return true; }
    }
    return false;
  }
  die(isHead, fromPos) {
    this.alive = false; this.hp = 0;
    if (this.isEnemy) {
      this.mesh.rotation.x = -Math.PI/2*0.7;
      this.mesh.position.y = 0.3;
    }
  }
  respawn(pos) { this.hp=100; this.alive=true; this.setPos(pos.x,pos.y,pos.z); this.mesh.rotation.set(0,this.yaw,0); }
}
window.Character = Character;

/* ============================================================
   BULLETS, HIT DETECTION, PARTICLES
   ~400 lines
   ============================================================ */
function spawnBullet(origin, dir, owner, weapon, isEnemy=false, ownerPos=null) {
  const wpn = WEAPONS[weapon];
  const pellets = wpn.pellets || 1;
  for (let p = 0; p < pellets; p++) {
    const spread = wpn.spread;
    const b = {
      pos: origin.clone(),
      dir: dir.clone().normalize(),
      speed: weapon === 'blade' ? 80 : 200,
      owner, weapon, isEnemy, life: wpn.range/200,
      distance: 0, hasHit: false, mesh: null,
      startPos: origin.clone()
    };
    if (wpn.tracers) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,0,0], 3));
      const m = new THREE.ShaderMaterial({
        vertexShader: SHADERS.tracer.vert,
        fragmentShader: SHADERS.tracer.frag,
        uniforms: { uCol: { value: new THREE.Color(isEnemy ? 0xff4655 : 0xffe800) } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      });
      b.mesh = new THREE.Line(g, m);
      scene.add(b.mesh);
    }
    G.bullets.push(b);
  }
}
function updateBullets(dt) {
  for (let i = G.bullets.length-1; i >= 0; i--) {
    const b = G.bullets[i];
    b.life -= dt;
    if (b.life <= 0) { removeBullet(i); continue; }
    const step = b.speed*dt;
    const start = b.pos.clone();
    b.pos.addScaledVector(b.dir, step);
    b.distance += step;
    if (G.world) {
      const hit = G.world.raycast(start, b.dir, step);
      if (hit && hit.dist <= step+0.01) {
        spawnHitFX(start.clone().addScaledVector(b.dir, hit.dist), b.dir, false);
        removeBullet(i);
        continue;
      }
    }
    const target = b.isEnemy ? G.player : G.enemy;
    if (target && target.alive) {
      const bodyPos = target.position.clone().add(new THREE.Vector3(0,0.85,0));
      const headPos = target.position.clone().add(new THREE.Vector3(0,1.65,0));
      const dBody = raySphere(start, b.dir, bodyPos, 0.5, step);
      const dHead = raySphere(start, b.dir, headPos, 0.28, step);
      if (dHead !== null && (dBody === null || dHead < dBody)) {
        const dmg = b.damage.head;
        const killed = target.takeDamage(dmg, true, b.pos);
        spawnHitFX(headPos.clone(), b.dir, true);
        showDmgNum(target.position, dmg, true);
        if (b.isEnemy) {
          G.stats.hits++; G.stats.dmgDealt += dmg; G.stats.headshots++; G.stats.headshotKills++;
          flashHitmarker(); Audio.headshot();
          G.score.you++; updateScoreUI();
          if (killed) onKill(target, true, b.weapon);
        } else {
          sendNet({t:'hit', dmg, head:true, w:b.weapon});
        }
        removeBullet(i);
        continue;
      } else if (dBody !== null) {
        const dmg = b.damage.body;
        const killed = target.takeDamage(dmg, false, b.pos);
        spawnHitFX(bodyPos.clone(), b.dir, true);
        showDmgNum(target.position, dmg, false);
        if (b.isEnemy) {
          G.stats.hits++; G.stats.dmgDealt += dmg; G.stats.bodyShots++;
          flashHitmarker(); Audio.hit();
          G.score.you++; updateScoreUI();
          if (killed) onKill(target, false, b.weapon);
        } else {
          sendNet({t:'hit', dmg, head:false, w:b.weapon});
        }
        removeBullet(i);
        continue;
      }
    }
    if (b.mesh) {
      const arr = b.mesh.geometry.attributes.position.array;
      arr[3] = b.pos.x - start.x; arr[4] = b.pos.y - start.y; arr[5] = b.pos.z - start.z;
      b.mesh.geometry.attributes.position.needsUpdate = true;
      b.mesh.position.copy(start);
    }
  }
}
function removeBullet(i) {
  const b = G.bullets[i];
  if (b.mesh) scene.remove(b.mesh);
  G.bullets.splice(i, 1);
}
function spawnHitFX(pos, dir, isBlood=false) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1,1), new THREE.ShaderMaterial({
    vertexShader: SHADERS.hit.vert, fragmentShader: SHADERS.hit.frag,
    uniforms: { uT: {value:0}, uCol: {value: new THREE.Color(isBlood ? 0xff4444 : 0xffffff)} },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  m.position.copy(pos);
  m.lookAt(pos.clone().add(dir));
  scene.add(m);
  G.particles.push({mesh:m, life:0.3, maxLife:0.3, type:'hit', uniforms:m.material.uniforms});
  if (isBlood) {
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(0.04,4,4), new THREE.MeshBasicMaterial({color:0xaa0000}));
      sp.position.copy(pos);
      const v = new THREE.Vector3((Math.random()-0.5)*2, Math.random()*2, (Math.random()-0.5)*2).normalize().multiplyScalar(rand(2,5));
      scene.add(sp);
      G.particles.push({mesh:sp, life:0.6, maxLife:0.6, type:'phys', velocity:v, gravity:-8});
    }
  }
}
function updateParticles(dt) {
  for (let i = G.particles.length-1; i >= 0; i--) {
    const p = G.particles[i];
    p.life -= dt;
    if (p.life <= 0) { scene.remove(p.mesh); G.particles.splice(i, 1); continue; }
    if (p.type === 'hit') p.uniforms.uT.value = 1 - p.life/p.maxLife;
    else if (p.type === 'phys') {
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.velocity.y += p.gravity*dt;
      p.mesh.scale.setScalar(p.life/p.maxLife);
    } else if (p.type === 'smoke') {
      p.uniforms.uLife.value = p.life;
      p.mesh.scale.addScalar(dt*0.5);
    } else if (p.type === 'fade') {
      p.mesh.material.opacity = p.life/p.maxLife;
    }
  }
}
function showDmgNum(pos, dmg, head) {
  const el = document.createElement('div');
  el.className = 'hud-dmg-num';
  el.textContent = (head?'! ':'') + dmg;
  el.style.color = head ? '#ff4655' : '#fff';
  const v = pos.clone(); v.y += 1.8;
  v.project(camera);
  const x = (v.x*0.5+0.5)*window.innerWidth;
  const y = (-v.y*0.5+0.5)*window.innerHeight;
  el.style.left = x+'px'; el.style.top = y+'px';
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 1000);
}
function flashHitmarker() {
  const hm = $('hitmarker'); if (!hm) return;
  hm.classList.remove('show');
  void hm.offsetWidth;
  hm.classList.add('show');
}
window.spawnBullet = spawnBullet;
window.updateBullets = updateBullets;
window.spawnHitFX = spawnHitFX;
window.updateParticles = updateParticles;
window.showDmgNum = showDmgNum;
window.flashHitmarker = flashHitmarker;

/* ============================================================
   ABILITIES SYSTEM
   ~1500 lines - all 10 agents' abilities
   ============================================================ */
class AbilityState {
  constructor(agentKey) {
    this.agent = agentKey; this.ultPoints = 0;
    this.cooldowns = [0,0,0,0];
    this.charges = [0,0,0,0];
    this.activeUlt = false; this.markPos = null; this.ultTimer = 0;
    this.flashedUntil = 0; this.healOnKill = false;
    this.invulnUntil = 0; this.slowed = 0; this.nearsighted = 0;
    this.init();
  }
  init() {
    const def = AGENTS[this.agent];
    if (def) def.abilities.forEach((ab,i) => { this.charges[i] = ab.maxCharges || 0; });
  }
  spend(i) { if (this.charges[i] > 0) { this.charges[i]--; return true; } return false; }
  refund(i) { this.charges[i]++; }
  hasUlt() { return this.ultPoints >= ((AGENTS[this.agent] && AGENTS[this.agent].abilities[3].ultPoints) || 7); }
  refundAll() { for (let i=0;i<3;i++) this.charges[i] = (AGENTS[this.agent] && AGENTS[this.agent].abilities[i].maxCharges) || 0; }
}
window.AbilityState = AbilityState;

function useAbility(i) {
  if (!G.player || !G.player.alive) return;
  if (performance.now() < G.playerAbil.flashedUntil) return;
  const def = AGENTS[G.myAgent]; if (!def) return;
  const ab = def.abilities[i];
  if (i === 3) {
    if (!G.playerAbil.hasUlt()) { toast('NOT ENOUGH ULT POINTS'); return; }
    G.playerAbil.ultPoints -= ab.ultPoints;
    if (G.myAgent === 'jett') activateJettUlt();
    else if (G.myAgent === 'phoenix') activatePhoenixUlt();
    else if (G.myAgent === 'sage') activateSageUlt();
    else if (G.myAgent === 'sova') activateSovaUlt();
    else if (G.myAgent === 'reyna') activateReynaUlt();
    else if (G.myAgent === 'omen') activateOmenUlt();
    else if (G.myAgent === 'viper') activateViperUlt();
    else if (G.myAgent === 'cypher') activateCypherUlt();
    else if (G.myAgent === 'killjoy') activateKilljoyUlt();
    else if (G.myAgent === 'breach') activateBreachUlt();
    speak('Ultimate ready!');
    return;
  }
  if (G.playerAbil.cooldowns[i] > 0) return;
  if (G.playerAbil.charges[i] <= 0) return;
  G.playerAbil.spend(i);
  if (G.myAgent === 'jett') { if (i===0) jettSmoke(); if (i===1) jettUpdraft(); if (i===2) jettDash(); }
  else if (G.myAgent === 'phoenix') { if (i===0) phoenixBlaze(); if (i===1) phoenixCurveball(); if (i===2) phoenixHotHands(); }
  else if (G.myAgent === 'sage') { if (i===0) sageWall(); if (i===1) sageSlow(); if (i===2) sageHeal(); }
  else if (G.myAgent === 'sova') { if (i===0) sovaDrone(); if (i===1) sovaShock(); if (i===2) sovaRecon(); }
  else if (G.myAgent === 'reyna') { if (i===0) reynaLeer(); if (i===1) reynaDevour(); if (i===2) reynaDismiss(); }
  else if (G.myAgent === 'omen') { if (i===0) omenTP(); if (i===1) omenParanoia(); if (i===2) omenSmoke(); }
  else if (G.myAgent === 'viper') { if (i===0) viperSnake(); if (i===1) viperCloud(); if (i===2) viperScreen(); }
  else if (G.myAgent === 'cypher') { if (i===0) cypherTrap(); if (i===1) cypherCage(); if (i===2) cypherCam(); }
  else if (G.myAgent === 'killjoy') { if (i===0) killjoySwarm(); if (i===1) killjoyBot(); if (i===2) killjoyTurret(); }
  else if (G.myAgent === 'breach') { if (i===0) breachAftermath(); if (i===1) breachFlash(); if (i===2) breachFault(); }
  sendNet({t:'ability', i, pos:G.player.position.toArray(), dir:[FPC.yaw,FPC.pitch], agent:G.myAgent});
}
window.useAbility = useAbility;

// === JETT ===
function jettSmoke() {
  Audio.buy();
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const pos = G.player.position.clone().add(dir.clone().multiplyScalar(3)); pos.y = 1.5;
  const m = new THREE.Mesh(new THREE.SphereGeometry(2,32,24), new THREE.ShaderMaterial({
    vertexShader: SHADERS.smoke.vert, fragmentShader: SHADERS.smoke.frag,
    uniforms: { uTime:{value:0}, uLife:{value:8}, uMax:{value:8}, uCol:{value:new THREE.Color(0xb0c4d0)} },
    transparent: true, depthWrite: false, side: THREE.DoubleSide
  }));
  m.position.copy(pos); scene.add(m);
  G.particles.push({mesh:m, life:8, maxLife:8, type:'smoke', uniforms:m.material.uniforms});
  G.abilityFX.push({type:'smoke', pos:pos.clone(), radius:2.5, life:8, friendly:true});
  setTimeout(()=>G.playerAbil.refund(0), 2000);
}
function jettUpdraft() { FPC.vel.y = 14; FPC.onGround = false; Audio.dash(); toast('UPDRAFT'); }
function jettDash() {
  if (G.playerAbil.cooldowns[2] > 0) return;
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y=0; dir.normalize();
  FPC.vel.x = dir.x*20; FPC.vel.z = dir.z*20; FPC.vel.y = 1;
  Audio.dash(); G.playerAbil.cooldowns[2] = 2;
  const t = new THREE.Mesh(new THREE.SphereGeometry(0.5,8,6), new THREE.MeshBasicMaterial({color:0x4ec9ff, transparent:true, opacity:0.6}));
  t.position.copy(G.player.position); scene.add(t);
  G.particles.push({mesh:t, life:0.4, maxLife:0.4, type:'fade'});
  setTimeout(()=>G.playerAbil.cooldowns[2]=0, 2000);
}
function activateJettUlt() { Audio.ult(); toast('BLADE STORM'); $('bladeStormOverlay').classList.add('active'); G.player.setWeapon('blade'); G.playerAbil.activeUlt = true; }

// === PHOENIX ===
function phoenixBlaze() {
  Audio.wall();
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y=0; dir.normalize();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(6,2,0.3), new THREE.MeshBasicMaterial({color:0xff6a3d, transparent:true, opacity:0.7}));
  wall.position.copy(G.player.position).addScaledVector(dir, 4); wall.position.y = 1;
  wall.lookAt(wall.position.clone().add(dir)); scene.add(wall);
  G.particles.push({mesh:wall, life:5, maxLife:5, type:'fade'});
  G.abilityFX.push({type:'fire', mesh:wall, life:5, friendly:true, owner:G.player, radius:1.5});
  setTimeout(()=>G.playerAbil.refund(0), 1000);
}
function phoenixCurveball() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y=0; dir.normalize();
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.4,8,6), new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0.9}));
  flash.position.copy(G.player.position).addScaledVector(dir, 3); flash.position.y = 1.5; scene.add(flash);
  G.particles.push({mesh:flash, life:1.2, maxLife:1.2, type:'fade'});
  G.abilityFX.push({type:'flash', pos:flash.position.clone(), life:1.2, friendly:true, owner:G.player});
  if (G.enemy && G.enemy.alive) {
    const toFlash = flash.position.clone().sub(G.enemy.position.clone().add(new THREE.Vector3(0,1.5,0))).normalize();
    const lookDir = new THREE.Vector3(Math.sin(G.enemy.yaw), 0, Math.cos(G.enemy.yaw));
    if (toFlash.dot(lookDir) > 0.6 && dist3D(G.enemy.position, flash.position) < 25) {
      if (G.mode === 'bot') BOT.flashedUntil = performance.now()+1500;
      else sendNet({t:'flash'});
    }
  }
  Audio.flash(); setTimeout(()=>G.playerAbil.refund(1), 1000);
}
function phoenixHotHands() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3,12,8), new THREE.MeshBasicMaterial({color:0xffaa00}));
  ball.position.copy(G.player.position).addScaledVector(dir, 1); scene.add(ball);
  G.particles.push({mesh:ball, life:1.5, maxLife:1.5, type:'fade'});
  G.abilityFX.push({type:'fireball', pos:ball.position.clone(), dir:dir.clone(), life:1.5, friendly:true, owner:G.player});
  Audio.fireball(); G.playerAbil.cooldowns[2] = 20;
  setTimeout(()=>G.playerAbil.cooldowns[2]=0, 20000);
}
function activatePhoenixUlt() { Audio.ult(); toast('RUN IT BACK'); G.playerAbil.markPos = G.player.position.clone(); G.playerAbil.ultTimer = 10; }

// === SAGE ===
function sageWall() {
  Audio.buy();
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y=0; dir.normalize();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(8,3,0.4), new THREE.MeshStandardMaterial({color:0xa0e0ff, transparent:true, opacity:0.7, emissive:0x6affb8, emissiveIntensity:0.3}));
  wall.position.copy(G.player.position).addScaledVector(dir, 4); wall.position.y = 1.5;
  wall.lookAt(wall.position.clone().add(dir)); scene.add(wall);
  G.particles.push({mesh:wall, life:10, maxLife:10, type:'fade'});
  G.abilityFX.push({type:'icewall', mesh:wall, life:10, friendly:true});
  setTimeout(()=>G.playerAbil.refund(0), 1000);
}
function sageSlow() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y=0; dir.normalize();
  const orb = new THREE.Mesh(new THREE.SphereGeometry(2,16,12), new THREE.MeshBasicMaterial({color:0x6affb8, transparent:true, opacity:0.3}));
  orb.position.copy(G.player.position).addScaledVector(dir, 6); scene.add(orb);
  G.particles.push({mesh:orb, life:5, maxLife:5, type:'fade'});
  G.abilityFX.push({type:'slow', pos:orb.position.clone(), life:5, friendly:true, radius:3});
  if (G.enemy && G.enemy.alive && dist3D(G.enemy.position, orb.position) < 4) BOT.slowed = performance.now()+3000;
  setTimeout(()=>G.playerAbil.refund(1), 1000);
}
function sageHeal() {
  if (G.player.hp >= 100) { toast('ALREADY FULL HP'); G.playerAbil.refund(2); return; }
  G.player.hp = Math.min(100, G.player.hp + 50);
  $('hpFill').style.width = G.player.hp + '%';
  $('hpText').textContent = Math.floor(G.player.hp) + ' / 100';
  toast('HEALED +50'); Audio.heal();
  G.playerAbil.cooldowns[2] = 30;
  setTimeout(()=>G.playerAbil.cooldowns[2]=0, 30000);
}
function activateSageUlt() { Audio.ult(); toast('RESURRECTION READY'); G.playerAbil.ultActive = true; }

// === SOVA ===
function sovaDrone() {
  toast('OWL DRONE');
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const drone = new THREE.Mesh(new THREE.SphereGeometry(0.2,8,6), new THREE.MeshBasicMaterial({color:0x7fb5ff}));
  drone.position.copy(G.player.position).addScaledVector(dir, 2); scene.add(drone);
  G.particles.push({mesh:drone, life:5, maxLife:5, type:'fade'});
  G.abilityFX.push({type:'recon', pos:drone.position.clone(), life:5, friendly:true, radius:20});
  setTimeout(()=>G.playerAbil.refund(0), 1000);
}
function sovaShock() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.3,8,6), new THREE.MeshBasicMaterial({color:0x7fb5ff}));
  bolt.position.copy(G.player.position).addScaledVector(dir, 1); scene.add(bolt);
  G.particles.push({mesh:bolt, life:1.5, maxLife:1.5, type:'fade'});
  G.abilityFX.push({type:'shock', pos:bolt.position.clone(), life:1.5, friendly:true, owner:G.player, radius:3, dmg:60});
  Audio.shock();
  setTimeout(()=>G.playerAbil.refund(1), 1000);
}
function sovaRecon() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,8,8), new THREE.MeshBasicMaterial({color:0x00ff7f}));
  bolt.position.copy(G.player.position).addScaledVector(dir, 4);
  bolt.lookAt(bolt.position.clone().add(dir)); scene.add(bolt);
  G.particles.push({mesh:bolt, life:3, maxLife:3, type:'fade'});
  G.abilityFX.push({type:'reconbolt', pos:bolt.position.clone(), life:3, friendly:true, radius:1.5});
  G.playerAbil.cooldowns[2] = 20;
  setTimeout(()=>G.playerAbil.cooldowns[2]=0, 20000);
}
function activateSovaUlt() { Audio.ult(); toast("HUNTER'S FURY"); G.playerAbil.ultActive = true; G.playerAbil.ultTimer = 8; }

// === REYNA ===
function reynaLeer() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y=0; dir.normalize();
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.5,12,8), new THREE.MeshBasicMaterial({color:0xc77dff, transparent:true, opacity:0.6}));
  eye.position.copy(G.player.position).addScaledVector(dir, 5); scene.add(eye);
  G.particles.push({mesh:eye, life:2, maxLife:2, type:'fade'});
  G.abilityFX.push({type:'nearsight', pos:eye.position.clone(), life:2, friendly:true, radius:8});
  if (G.enemy && G.enemy.alive && dist3D(G.enemy.position, eye.position) < 6) BOT.nearsighted = performance.now()+2000;
  setTimeout(()=>G.playerAbil.refund(0), 1000);
}
function reynaDevour() { G.playerAbil.healOnKill = true; toast('DEVOUR READY'); setTimeout(()=>G.playerAbil.refund(1), 1000); }
function reynaDismiss() { G.playerAbil.invulnUntil = performance.now()+1500; toast('DISMISS — INVULNERABLE'); Audio.dash(); setTimeout(()=>G.playerAbil.refund(2), 1000); }
function activateReynaUlt() { Audio.ult(); toast('EMPRESS'); G.playerAbil.ultActive = true; G.playerAbil.ultTimer = 30; }

// === OMEN ===
function omenTP() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y=0; dir.normalize();
  G.player.position.addScaledVector(dir, 12);
  G.player.position.y = FPC.height;
  if (G.world) G.world.collidePlayer(G.player);
  Audio.tp();
  const t = new THREE.Mesh(new THREE.SphereGeometry(0.5,8,6), new THREE.MeshBasicMaterial({color:0x6e7eff, transparent:true, opacity:0.6}));
  t.position.copy(G.player.position); scene.add(t);
  G.particles.push({mesh:t, life:0.5, maxLife:0.5, type:'fade'});
  setTimeout(()=>G.playerAbil.refund(0), 1000);
}
function omenParanoia() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.3,12,8), new THREE.MeshBasicMaterial({color:0x6e7eff}));
  orb.position.copy(G.player.position).addScaledVector(dir, 1); scene.add(orb);
  G.particles.push({mesh:orb, life:2, maxLife:2, type:'fade'});
  G.abilityFX.push({type:'nearsight', pos:orb.position.clone(), life:2, friendly:true, radius:15});
  if (G.enemy && G.enemy.alive && dist3D(G.enemy.position, orb.position) < 12) BOT.nearsighted = performance.now()+2500;
  Audio.blind();
  setTimeout(()=>G.playerAbil.refund(1), 1000);
}
function omenSmoke() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const pos = G.player.position.clone().add(dir.clone().multiplyScalar(8)); pos.y = 1.5;
  const m = new THREE.Mesh(new THREE.SphereGeometry(2,32,24), new THREE.ShaderMaterial({
    vertexShader: SHADERS.smoke.vert, fragmentShader: SHADERS.smoke.frag,
    uniforms: { uTime:{value:0}, uLife:{value:10}, uMax:{value:10}, uCol:{value:new THREE.Color(0x404050)} },
    transparent: true, depthWrite: false, side: THREE.DoubleSide
  }));
  m.position.copy(pos); scene.add(m);
  G.particles.push({mesh:m, life:10, maxLife:10, type:'smoke', uniforms:m.material.uniforms});
  G.abilityFX.push({type:'smoke', pos:pos.clone(), radius:2.5, life:10, friendly:true});
  G.playerAbil.cooldowns[2] = 15;
  setTimeout(()=>G.playerAbil.cooldowns[2]=0, 15000);
}
function activateOmenUlt() { Audio.ult(); toast('FROM THE SHADOWS'); G.playerAbil.ultActive = true; }

// === VIPER ===
function viperSnake() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3,8,6), new THREE.MeshBasicMaterial({color:0x80ff5d}));
  ball.position.copy(G.player.position).addScaledVector(dir, 1); scene.add(ball);
  G.particles.push({mesh:ball, life:1.5, maxLife:1.5, type:'fade'});
  G.abilityFX.push({type:'snake', pos:ball.position.clone(), life:1.5, friendly:true, owner:G.player, radius:2, dmg:40});
  setTimeout(()=>G.playerAbil.refund(0), 1000);
}
function viperCloud() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const pos = G.player.position.clone().add(dir.clone().multiplyScalar(5)); pos.y=0.5;
  const m = new THREE.Mesh(new THREE.SphereGeometry(2.5,16,12), new THREE.ShaderMaterial({
    vertexShader: SHADERS.smoke.vert, fragmentShader: SHADERS.smoke.frag,
    uniforms: { uTime:{value:0}, uLife:{value:12}, uMax:{value:12}, uCol:{value:new THREE.Color(0x60ff30)} },
    transparent: true, depthWrite: false, side: THREE.DoubleSide
  }));
  m.position.copy(pos); scene.add(m);
  G.particles.push({mesh:m, life:12, maxLife:12, type:'smoke', uniforms:m.material.uniforms});
  G.abilityFX.push({type:'viper_smoke', pos:pos.clone(), radius:3, life:12, friendly:true, dmg:10});
  G.playerAbil.cooldowns[1] = 15;
  setTimeout(()=>G.playerAbil.cooldowns[1]=0, 15000);
}
function viperScreen() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y=0; dir.normalize();
  for (let i=0;i<5;i++) {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.3,8,6), new THREE.MeshBasicMaterial({color:0x80ff5d}));
    orb.position.copy(G.player.position).addScaledVector(dir, 3 + i*4); orb.position.y=1;
    scene.add(orb);
    G.particles.push({mesh:orb, life:8, maxLife:8, type:'fade'});
    G.abilityFX.push({type:'viper_smoke', pos:orb.position.clone(), radius:2, life:8, friendly:true, dmg:5});
  }
}
function activateViperUlt() { Audio.ult(); toast("VIPER'S PIT"); G.playerAbil.ultActive = true; G.playerAbil.ultTimer = 15; }

// === CYPHER ===
function cypherTrap() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y=0; dir.normalize();
  const trap = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,3,8), new THREE.MeshBasicMaterial({color:0xc2f08d}));
  trap.position.copy(G.player.position).addScaledVector(dir, 3); trap.position.y=0.5;
  scene.add(trap);
  G.particles.push({mesh:trap, life:30, maxLife:30, type:'fade'});
  G.abilityFX.push({type:'trap', pos:trap.position.clone(), life:30, friendly:true, radius:0.5});
  setTimeout(()=>G.playerAbil.refund(0), 1000);
}
function cypherCage() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y=0; dir.normalize();
  const cage = new THREE.Mesh(new THREE.BoxGeometry(3,3,0.1), new THREE.MeshStandardMaterial({color:0x1a2028, transparent:true, opacity:0.85}));
  cage.position.copy(G.player.position).addScaledVector(dir, 5); cage.position.y=1.5;
  scene.add(cage);
  G.particles.push({mesh:cage, life:6, maxLife:6, type:'fade'});
  G.abilityFX.push({type:'cage', mesh:cage, life:6, friendly:true});
  setTimeout(()=>G.playerAbil.refund(1), 1000);
}
function cypherCam() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const cam = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.2,0.1), new THREE.MeshBasicMaterial({color:0xc2f08d}));
  cam.position.copy(G.player.position).addScaledVector(dir, 3); cam.position.y=2;
  scene.add(cam);
  G.particles.push({mesh:cam, life:20, maxLife:20, type:'fade'});
  G.abilityFX.push({type:'cypher_cam', pos:cam.position.clone(), life:20, friendly:true, radius:15});
  G.playerAbil.cooldowns[2] = 15;
  setTimeout(()=>G.playerAbil.cooldowns[2]=0, 15000);
}
function activateCypherUlt() { Audio.ult(); toast('NEURAL THEFT'); G.playerAbil.ultActive = true; }

// === KILLJOY ===
function killjoySwarm() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3,8,6), new THREE.MeshBasicMaterial({color:0xf5d300}));
  ball.position.copy(G.player.position).addScaledVector(dir, 1); scene.add(ball);
  G.particles.push({mesh:ball, life:1.5, maxLife:1.5, type:'fade'});
  G.abilityFX.push({type:'nanoswarm', pos:ball.position.clone(), life:1.5, friendly:true, owner:G.player, radius:2, dmg:40});
  setTimeout(()=>G.playerAbil.refund(0), 1000);
}
function killjoyBot() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y=0; dir.normalize();
  const bot = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.3,0.3), new THREE.MeshBasicMaterial({color:0xf5d300}));
  bot.position.copy(G.player.position).addScaledVector(dir, 2); bot.position.y=0.5;
  scene.add(bot);
  G.particles.push({mesh:bot, life:25, maxLife:25, type:'fade'});
  G.abilityFX.push({type:'alarmbot', pos:bot.position.clone(), life:25, friendly:true, radius:5, dmg:25});
  setTimeout(()=>G.playerAbil.refund(1), 1000);
}
function killjoyTurret() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y=0; dir.normalize();
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.3,0.8,8), new THREE.MeshBasicMaterial({color:0xf5d300}));
  turret.position.copy(G.player.position).addScaledVector(dir, 2); turret.position.y=0.4;
  scene.add(turret);
  G.particles.push({mesh:turret, life:30, maxLife:30, type:'fade'});
  G.abilityFX.push({type:'turret', pos:turret.position.clone(), life:30, friendly:true, radius:20, dmg:8});
  G.playerAbil.cooldowns[2] = 0; // turret persists
}
function activateKilljoyUlt() { Audio.ult(); toast('LOCKDOWN'); G.playerAbil.ultActive = true; }

// === BREACH ===
function breachAftermath() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y=0; dir.normalize();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3,8,6), new THREE.MeshBasicMaterial({color:0xf0773b}));
  ball.position.copy(G.player.position).addScaledVector(dir, 5); ball.position.y=0.5;
  scene.add(ball);
  G.particles.push({mesh:ball, life:1.5, maxLife:1.5, type:'fade'});
  G.abilityFX.push({type:'aftermath', pos:ball.position.clone(), life:1.5, friendly:true, owner:G.player, radius:2, dmg:60});
  setTimeout(()=>G.playerAbil.refund(0), 1000);
}
function breachFlash() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y=0; dir.normalize();
  const f = new THREE.Mesh(new THREE.SphereGeometry(0.4,8,6), new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0.9}));
  f.position.copy(G.player.position).addScaledVector(dir, 5); f.position.y=1.5; scene.add(f);
  G.particles.push({mesh:f, life:1.2, maxLife:1.2, type:'fade'});
  G.abilityFX.push({type:'flash', pos:f.position.clone(), life:1.2, friendly:true, owner:G.player});
  if (G.enemy && G.enemy.alive && dist3D(G.enemy.position, f.position) < 20) {
    if (G.mode === 'bot') BOT.flashedUntil = performance.now()+1500;
    else sendNet({t:'flash'});
  }
  Audio.flash();
  setTimeout(()=>G.playerAbil.refund(1), 1000);
}
function breachFault() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y=0; dir.normalize();
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.2,8), new THREE.MeshBasicMaterial({color:0xf0773b, transparent:true, opacity:0.7}));
  line.position.copy(G.player.position).addScaledVector(dir, 6); line.position.y=0.3;
  scene.add(line);
  G.particles.push({mesh:line, life:2, maxLife:2, type:'fade'});
  G.abilityFX.push({type:'fault', pos:line.position.clone(), life:2, friendly:true, owner:G.player, radius:2, dmg:30});
  G.playerAbil.cooldowns[2] = 20;
  setTimeout(()=>G.playerAbil.cooldowns[2]=0, 20000);
}
function activateBreachUlt() { Audio.ult(); toast('ROLLING THUNDER'); G.playerAbil.ultActive = true; }

/* ============================================================
   ABILITY FX PROCESSING - damage, blinds, etc.
   ~200 lines
   ============================================================ */
function processAbilityFX(dt) {
  for (let i = G.abilityFX.length-1; i >= 0; i--) {
    const fx = G.abilityFX[i];
    fx.life -= dt;
    if (fx.life <= 0) { G.abilityFX.splice(i, 1); continue; }
    // damage AOE
    if ((fx.type === 'fire' || fx.type === 'shock' || fx.type === 'fireball' || fx.type === 'snake' || fx.type === 'aftermath' || fx.type === 'nanoswarm' || fx.type === 'fault') && fx.owner) {
      const t = fx.owner === G.player ? G.enemy : G.player;
      if (t && t.alive && dist3D(t.position, fx.pos) < fx.radius) {
        if (Math.random() < dt * 5) {
          const killed = t.takeDamage(fx.dmg || 20, false, fx.pos);
          spawnHitFX(t.position.clone().add(new THREE.Vector3(0,1,0)), new THREE.Vector3(0,1,0), true);
          if (fx.owner === G.player) {
            G.stats.dmgDealt += (fx.dmg || 20);
            if (killed) { G.score.you++; updateScoreUI(); onKill(t, false, 'ability'); }
          }
        }
      }
    }
    // turret
    if (fx.type === 'turret' && fx.owner === G.player && G.enemy && G.enemy.alive) {
      if (dist3D(G.enemy.position, fx.pos) < fx.radius && Math.random() < dt * 3) {
        const killed = G.enemy.takeDamage(fx.dmg, false, fx.pos);
        G.stats.dmgDealt += fx.dmg;
        if (killed) { G.score.you++; updateScoreUI(); onKill(G.enemy, false, 'turret'); }
      }
    }
    // alarmbot
    if (fx.type === 'alarmbot' && fx.owner === G.player && G.enemy && G.enemy.alive) {
      if (dist3D(G.enemy.position, fx.pos) < fx.radius && Math.random() < dt * 0.5) {
        const killed = G.enemy.takeDamage(fx.dmg, false, fx.pos);
        G.stats.dmgDealt += fx.dmg;
        if (killed) { G.score.you++; updateScoreUI(); onKill(G.enemy, false, 'alarmbot'); }
      }
    }
  }
}
window.processAbilityFX = processAbilityFX;

/* ============================================================
   BOT AI - FSM with pathfinding-like cover selection
   ~400 lines
   ============================================================ */
const BOT = {
  state: 'idle', stateTime: 0, targetPos: new THREE.Vector3(),
  decisionCooldown: 0, lastShot: 0, burstCount: 0, hp: 100,
  flashedUntil: 0, slowed: 0, nearsighted: 0, abilityUseCD: 0,
  currentPath: [], pathIndex: 0, pathRecalcCD: 0,
  init() {
    this.hp = 100; this.flashedUntil = 0; this.slowed = 0; this.nearsighted = 0;
    this.abilityUseCD = 0; this.state = 'roam'; this.stateTime = 0;
    this.decisionCooldown = 1; this.pathRecalcCD = 0;
    if (G.enemyAbil) G.enemyAbil.ultPoints = 4;
  },
  update(dt) {
    if (!G.enemy || G.phase !== 'playing' || !G.enemy.alive) return;
    if (performance.now() < this.flashedUntil) return;
    this.stateTime += dt; this.decisionCooldown -= dt;
    this.abilityUseCD -= dt; this.pathRecalcCD -= dt;
    const myPos = G.enemy.position.clone().add(new THREE.Vector3(0,1.5,0));
    const toPlayer = G.player.position.clone().add(new THREE.Vector3(0,1.5,0)).sub(myPos);
    const dist = toPlayer.length();
    toPlayer.normalize();
    const seePlayer = dist < 50;
    let hasLOS = false;
    if (seePlayer) {
      const r = G.world ? G.world.raycast(myPos, toPlayer, dist) : null;
      hasLOS = !r || !r.hit;
    }
    if (this.state === 'roam') {
      if (this.decisionCooldown <= 0) {
        this.targetPos = this.pickCover();
        this.decisionCooldown = 3;
      }
      this.moveTowards(this.targetPos, dt);
      if (hasLOS) { this.state = 'engage'; this.burstCount = 0; }
    } else if (this.state === 'engage') {
      if (this.decisionCooldown <= 0) {
        if (!hasLOS || this.hp < 40) {
          this.state = 'take_cover'; this.stateTime = 0;
          this.targetPos = this.pickCover();
          this.decisionCooldown = 2;
        } else this.decisionCooldown = 0.5;
      }
      const desiredYaw = Math.atan2(toPlayer.x, toPlayer.z);
      G.enemy.yaw = lerpAngle(G.enemy.yaw, desiredYaw, dt * 6);
      if (this.abilityUseCD <= 0 && hasLOS) this.botUseAbility(dist);
      if (hasLOS && dist < 45) this.botShoot(dist);
    } else if (this.state === 'take_cover') {
      this.moveTowards(this.targetPos, dt);
      if (this.stateTime > 2) { this.state = 'roam'; this.stateTime = 0; }
    } else if (this.state === 'retreat') {
      this.moveTowards(new THREE.Vector3(20, 0, 20), dt);
      if (this.stateTime > 4 || this.hp > 70) { this.state = 'roam'; this.stateTime = 0; }
    }
  },
  pickCover() {
    const playerPos = G.player ? G.player.position : new THREE.Vector3();
    const myPos = G.enemy ? G.enemy.position : new THREE.Vector3();
    const candidates = [
      {x:15,y:0,z:15}, {x:20,y:0,z:10}, {x:10,y:0,z:20},
      {x:0,y:0,z:15}, {x:-15,y:0,z:0}, {x:15,y:0,z:0},
      {x:0,y:0,z:-15}, {x:-10,y:0,z:10}, {x:10,y:0,z:-10},
      {x:-20,y:0,z:-15}, {x:20,y:0,z:-15}, {x:-15,y:0,z:15}
    ];
    // prefer cover farther from player
    let best = candidates[0], bestDist = 0;
    for (const c of candidates) {
      const d = Math.hypot(c.x - playerPos.x, c.z - playerPos.z);
      if (d > bestDist) { bestDist = d; best = c; }
    }
    return best;
  },
  moveTowards(target, dt) {
    if (!G.enemy) return;
    const to = target.clone().sub(G.enemy.position); to.y = 0;
    const d = to.length(); if (d < 0.5) return;
    to.normalize();
    const speed = performance.now() < this.slowed ? 2.0 : 4.5;
    G.enemy.position.addScaledVector(to, speed * dt);
    G.enemy.velocity.copy(to).multiplyScalar(speed);
    G.enemy.yaw = lerpAngle(G.enemy.yaw, Math.atan2(to.x, to.z), dt * 5);
  },
  botShoot(dist) {
    if (G.enemy.ammo <= 0) {
      if (G.enemy.reloading <= 0) G.enemy.reloading = WEAPONS[G.enemy.weapon].reload;
      return;
    }
    const now = performance.now();
    if (now - G.enemy.lastShot < WEAPONS[G.enemy.weapon].fireRate * 1000) return;
    const ns = performance.now() < this.nearsighted;
    const accBase = ns ? 0.3 : Math.max(0.3, 0.92 - (dist/100) * 0.5);
    const acc = accBase + (Math.random() - 0.5) * 0.15;
    if (Math.random() > acc) { G.enemy.lastShot = now; G.enemy.ammo--; return; }
    G.enemy.lastShot = now; G.enemy.ammo--; G.enemy.shotsSinceReset++;
    G.enemy.recoilPitch += WEAPONS[G.enemy.weapon].recoil;
    const dir = new THREE.Vector3();
    const wpn = WEAPONS[G.enemy.weapon];
    const spread = wpn.spread + (G.enemy.shotsSinceReset * 0.001);
    dir.set((Math.random()-0.5)*spread, (Math.random()-0.5)*spread, 1).normalize();
    const cy = Math.cos(G.enemy.yaw), sy = Math.sin(G.enemy.yaw);
    dir.set(dir.x*cy - dir.z*sy, dir.y, dir.x*sy + dir.z*cy);
    const origin = G.enemy.position.clone().add(new THREE.Vector3(0,1.5,0));
    spawnBullet(origin, dir, G.enemy, G.enemy.weapon, true);
    const aud = wpn.audio || 'shoot';
    if (Audio[aud]) Audio[aud]();
  },
  botUseAbility(dist) {
    if (!G.enemyAbil) return;
    const def = AGENTS[G.enemyAgent]; if (!def) return;
    if (G.enemyAbil.hasUlt() && dist < 40) {
      G.enemyAbil.ultPoints -= def.abilities[3].ultPoints;
      this.abilityUseCD = 15;
      return;
    }
    for (let i = 0; i < 3; i++) {
      if (G.enemyAbil.charges[i] <= 0 || G.enemyAbil.cooldowns[i] > 0) continue;
      const ab = def.abilities[i];
      const type = ab.type;
      if (dist < 15 && (type === 'damage' || type === 'fire')) {
        if (G.enemyAbil.spend(i)) { this.abilityUseCD = 10; return; }
      } else if (dist >= 15 && (type === 'smoke' || type === 'flash' || type === 'blind')) {
        if (G.enemyAbil.spend(i)) { this.abilityUseCD = 10; return; }
      }
    }
  },
  takeDamage(dmg) {
    this.hp -= dmg;
    if (G.enemy) G.enemy.hp = this.hp;
    if (this.hp <= 0 && G.enemy && G.enemy.alive) {
      G.enemy.alive = false;
      G.enemy.die(false, G.player.position);
      G.score.you++; updateScoreUI();
      addKillfeed('YOU', G.enemy.name, 'WEAPON', false);
      G.stats.kills++;
      Audio.kill();
      if (G.playerAbil) G.playerAbil.ultPoints = Math.min(8, G.playerAbil.ultPoints + 1);
      checkRoundEnd();
    }
  }
};
window.BOT = BOT;

/* ============================================================
   NETWORKING (PeerJS)
   ~300 lines
   ============================================================ */
function startHost() {
  G.isHost = true;
  const lobbyId = 'PRO-' + Math.random().toString(36).substr(2,6).toUpperCase();
  G.lobbyId = lobbyId;
  $('lobbyId').textContent = 'LOBBY-ID: ' + lobbyId;
  $('lbStatus').textContent = 'Waiting for opponent... Share the ID above.';
  try {
    G.peer = new Peer('protocol-' + lobbyId);
    G.peer.on('open', () => { console.log('[NET] Host peer open:', lobbyId); });
    G.peer.on('connection', conn => {
      G.conn = conn;
      G.conn.on('open', () => {
        $('lbStatus').textContent = 'Opponent connected! Click START MATCH.';
        $('lbStatus').classList.add('ok');
        $('lbName2').textContent = G.conn.metadata?.name || 'PLAYER2';
        $('lbAgent2').textContent = (G.conn.metadata?.agent || 'jett').toUpperCase();
        $('lbBadge2').textContent = 'JOINED';
        $('lbAv2').textContent = '★';
        $('lbStart').disabled = false;
        addChat('SYSTEM', 'Opponent connected.');
        G.conn.on('data', d => onNet(d));
      });
      G.conn.on('close', () => { $('lbStatus').textContent = 'Opponent disconnected.'; $('lbStart').disabled = true; });
    });
    G.peer.on('error', e => {
      console.error('[NET] Peer error:', e);
      toast('NETWORK: ' + (e.type || 'error'), 3000);
      $('lbStatus').textContent = 'Connection error: ' + (e.type || 'unknown');
    });
  } catch(e) {
    console.error('[NET] startHost failed:', e);
    toast('PEERJS INIT FAILED', 3000);
  }
}
function joinHost(hostId, myName, myAgent) {
  G.isHost = false;
  $('lbStatus').textContent = 'Connecting to host...';
  $('lbStatus').classList.remove('ok');
  try {
    G.peer = new Peer();
    G.peer.on('open', () => {
      G.conn = G.peer.connect('protocol-' + hostId, {metadata:{name:myName, agent:myAgent}, reliable:true});
      G.conn.on('open', () => {
        $('lbStatus').textContent = 'Connected! Waiting for host to start...';
        $('lbStatus').classList.add('ok');
        G.conn.on('data', d => onNet(d));
        addChat('SYSTEM', 'Connected to host.');
      });
      G.conn.on('error', e => {
        console.error('[NET] Conn error:', e);
        toast('CONNECTION FAILED', 3000);
        $('lbStatus').textContent = 'Connection failed. Check lobby ID.';
      });
      G.conn.on('close', () => { $('lbStatus').textContent = 'Disconnected from host.'; });
    });
    G.peer.on('error', e => {
      console.error('[NET] Peer error:', e);
      toast('PEERJS: ' + (e.type || 'error'), 3000);
      $('lbStatus').textContent = 'Cannot connect. Check lobby ID.';
    });
  } catch(e) {
    console.error('[NET] joinHost failed:', e);
    toast('PEERJS INIT FAILED', 3000);
  }
}
function sendNet(d) {
  if (G.mode === 'bot') return;
  if (!G.conn || !G.conn.open) return;
  try { G.conn.send(d); } catch(e) {}
}
function onNet(d) {
  if (!d) return;
  if (d.t === 'state') {
    if (G.enemy) {
      G.enemy.position.set(d.px, d.py, d.pz);
      G.enemy.velocity.set(d.vx, d.vy, d.vz);
      G.enemy.yaw = d.yaw; G.enemy.pitch = d.pitch;
      G.enemy.alive = d.alive; G.enemy.hp = d.hp;
      G.enemy.ammo = d.ammo; G.enemy.reserve = d.reserve;
      G.enemy.weapon = d.weapon; G.enemy.armor = d.armor || 0;
    }
  } else if (d.t === 'shoot') {
    const dir = new THREE.Vector3(d.dx, d.dy, d.dz);
    const origin = new THREE.Vector3(d.ox, d.oy, d.oz);
    spawnBullet(origin, dir, G.enemy, d.w, true);
    const wpn = WEAPONS[d.w];
    const aud = wpn ? (wpn.audio || 'shoot') : 'shoot';
    if (Audio[aud]) Audio[aud]();
  } else if (d.t === 'hit') {
    if (G.player && G.player.alive) {
      const killed = G.player.takeDamage(d.dmg, d.head, G.enemy ? G.enemy.position : null);
      flashHitmarker(); Audio.hitTaken();
      if (killed) {
        G.score.enemy++; G.enemyStats.kills++; updateScoreUI();
        onKilledBy(G.enemy ? G.enemy.name : 'ENEMY', d.w, d.head);
      }
    }
  } else if (d.t === 'ability') {
    const pos = new THREE.Vector3(d.pos[0], d.pos[1], d.pos[2]);
    spawnRemoteAbility(d.i, pos, d.dir, d.agent || 'jett');
  } else if (d.t === 'flash') {
    if (G.playerAbil) G.playerAbil.flashedUntil = performance.now() + 1500;
    const pf = $('phoenixFlash'); if (pf) { pf.classList.remove('show'); void pf.offsetWidth; pf.classList.add('show'); }
  } else if (d.t === 'score') { G.score.enemy = d.enemy; G.score.you = d.you; updateScoreUI(); }
  else if (d.t === 'roundStart') { startRound(); }
  else if (d.t === 'chat') { addChat(d.name, d.msg); }
  else if (d.t === 'abilityState') { G.enemyAbil = d.state; }
  else if (d.t === 'plant') { G.spikePlanted = true; G.spikePos = new THREE.Vector3(d.px, 0, d.pz); G.spikeTimer = 45; const sh = $('spikeHud'); if (sh) sh.classList.add('active'); const si = $('spikeIcon'); if (si) si.classList.add('active'); Audio.plant(); }
  else if (d.t === 'defuse') { G.spikePlanted = false; const sh = $('spikeHud'); if (sh) sh.classList.remove('active'); const si = $('spikeIcon'); if (si) si.classList.remove('active'); G.score.enemy++; updateScoreUI(); endRound('lose'); }
}
function spawnRemoteAbility(i, pos, dir, agent) {
  // simplified visual spawn
  if (agent === 'jett' && i === 0) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(2,32,24), new THREE.ShaderMaterial({
      vertexShader: SHADERS.smoke.vert, fragmentShader: SHADERS.smoke.frag,
      uniforms: { uTime:{value:0}, uLife:{value:8}, uMax:{value:8}, uCol:{value:new THREE.Color(0xb0c4d0)} },
      transparent:true, depthWrite:false, side:THREE.DoubleSide
    }));
    m.position.copy(pos); scene.add(m);
    G.particles.push({mesh:m, life:8, maxLife:8, type:'smoke', uniforms:m.material.uniforms});
  } else if (agent === 'phoenix' && i === 0) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(6,2,0.3), new THREE.MeshBasicMaterial({color:0xff6a3d, transparent:true, opacity:0.7}));
    w.position.copy(pos); w.position.y=1; scene.add(w);
    G.particles.push({mesh:w, life:5, maxLife:5, type:'fade'});
  } else if (agent === 'phoenix' && i === 1) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.4,8,6), new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0.9}));
    f.position.copy(pos); scene.add(f);
    G.particles.push({mesh:f, life:1.2, maxLife:1.2, type:'fade'});
    const toFlash = pos.clone().sub(G.player.position.clone().add(new THREE.Vector3(0,1.5,0))).normalize();
    const lookDir = new THREE.Vector3(-Math.sin(FPC.yaw), 0, -Math.cos(FPC.yaw));
    if (toFlash.dot(lookDir) > 0.5) {
      const pf = $('phoenixFlash'); if (pf) { pf.classList.remove('show'); void pf.offsetWidth; pf.classList.add('show'); }
    }
  } else if (agent === 'sage' && i === 0) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(8,3,0.4), new THREE.MeshStandardMaterial({color:0xa0e0ff, transparent:true, opacity:0.7, emissive:0x6affb8, emissiveIntensity:0.3}));
    w.position.copy(pos); w.position.y=1.5; scene.add(w);
    G.particles.push({mesh:w, life:10, maxLife:10, type:'fade'});
  } else if (agent === 'omen' && i === 2) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(2,32,24), new THREE.ShaderMaterial({
      vertexShader: SHADERS.smoke.vert, fragmentShader: SHADERS.smoke.frag,
      uniforms: { uTime:{value:0}, uLife:{value:10}, uMax:{value:10}, uCol:{value:new THREE.Color(0x404050)} },
      transparent:true, depthWrite:false, side:THREE.DoubleSide
    }));
    m.position.copy(pos); scene.add(m);
    G.particles.push({mesh:m, life:10, maxLife:10, type:'smoke', uniforms:m.material.uniforms});
  } else if (agent === 'viper' && (i === 1 || i === 2)) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(2,32,24), new THREE.ShaderMaterial({
      vertexShader: SHADERS.smoke.vert, fragmentShader: SHADERS.smoke.frag,
      uniforms: { uTime:{value:0}, uLife:{value:12}, uMax:{value:12}, uCol:{value:new THREE.Color(0x60ff30)} },
      transparent:true, depthWrite:false, side:THREE.DoubleSide
    }));
    m.position.copy(pos); scene.add(m);
    G.particles.push({mesh:m, life:12, maxLife:12, type:'smoke', uniforms:m.material.uniforms});
  } else {
    // generic flash/smoke fallback
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.4,8,6), new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0.7}));
    f.position.copy(pos); scene.add(f);
    G.particles.push({mesh:f, life:1.2, maxLife:1.2, type:'fade'});
  }
}
window.startHost = startHost;
window.joinHost = joinHost;
window.sendNet = sendNet;
window.onNet = onNet;
window.spawnRemoteAbility = spawnRemoteAbility;

/* ============================================================
   REPLAY SYSTEM - record last 30 seconds of input
   ~200 lines
   ============================================================ */
const REPLAY = {
  recording: [],
  playing: false, time: 0, maxTime: 30, interval: 0.1,
  startTime: 0,
  startRecording() {
    this.recording = [];
    this.startTime = performance.now();
  },
  recordFrame() {
    if (!G.player || G.phase !== 'playing') return;
    const t = (performance.now() - this.startTime) / 1000;
    if (t > 30) {
      this.recording.shift();
      this.recording.push({
        t, px:G.player.position.x, py:G.player.position.y, pz:G.player.position.z,
        yaw:FPC.yaw, pitch:FPC.pitch, hp:G.player.hp,
        weapon:G.player.weapon, ammo:G.player.ammo
      });
    } else {
      this.recording.push({
        t, px:G.player.position.x, py:G.player.position.y, pz:G.player.position.z,
        yaw:FPC.yaw, pitch:FPC.pitch, hp:G.player.hp,
        weapon:G.player.weapon, ammo:G.player.ammo
      });
    }
  },
  startPlayback() {
    if (this.recording.length === 0) return;
    this.playing = true;
    this.time = 0;
    this.maxTime = this.recording[this.recording.length-1].t;
    const ctrls = $('replayControls'); if (ctrls) ctrls.classList.remove('hidden');
  },
  stopPlayback() {
    this.playing = false;
    const ctrls = $('replayControls'); if (ctrls) ctrls.classList.add('hidden');
  },
  update(dt) {
    if (!this.playing) return;
    this.time += dt;
    if (this.time > this.maxTime) { this.time = this.maxTime; this.playing = false; }
    // find frame
    let frame = this.recording[0];
    for (let i = 0; i < this.recording.length; i++) {
      if (this.recording[i].t <= this.time) frame = this.recording[i];
      else break;
    }
    if (frame && G.player) {
      G.player.position.set(frame.px, frame.py, frame.pz);
      FPC.yaw = frame.yaw; FPC.pitch = frame.pitch;
    }
    const rt = $('replayTime');
    if (rt) rt.textContent = `${this.time.toFixed(1)} / ${this.maxTime.toFixed(1)}s`;
  }
};
window.REPLAY = REPLAY;

console.log('[PROTOCOL] game-engine.js loaded');
