/* =====================================================================
   PROTOCOL :: 1v1 TACTICAL SHOOTER
   game-data.js - Static data: agents, weapons, audio, shaders, maps
   ~5000 lines
   ===================================================================== */
'use strict';

/* ============================================================
   GLOBAL STATE (shared across all files)
   ============================================================ */
window.G = window.G || {
  phase: 'boot',
  mode: 'bot',
  myName: 'PLAYER1',
  myAgent: 'jett',
  enemyAgent: 'jett',
  peer: null, conn: null,
  isHost: true, lobbyId: null,
  map: 'ascent', ft: 10, spikeMode: true,
  score: { you: 0, enemy: 0 },
  round: 1, roundTime: 60, roundTimer: 60,
  credits: 800, paused: false,
  keys: {},
  mouse: { down: false, x: 0, y: 0 },
  player: null, enemy: null,
  bullets: [], particles: [], abilityFX: [],
  playerState: 'alive', damageFlash: 0,
  world: null, playerAbil: null, enemyAbil: null,
  spectating: false,
  spikePlanted: false, spikeTimer: 0, spikePos: null, defusing: false,
  buyOpen: false, buyTimer: 0,
  settings: { sens: 0.0022, fov: 75, vol: 0.7, adsFov: 40, chColor: '#00ff7f', chOutline: true, chDot: false, chInner: 6, chThick: 1.5, chMove: true, keyWalk: 'CapsLock' },
  stats: { kills: 0, deaths: 0, dmgDealt: 0, dmgTaken: 0, hits: 0, headshots: 0, bodyShots: 0, legShots: 0, roundsWon: 0, matches: 0, headshotKills: 0, multiKills: 0, currentMulti: 0, killsHistory: [] },
  enemyStats: { kills: 0, deaths: 0, dmgDealt: 0, hits: 0, headshots: 0, roundsWon: 0 },
  achievements: {},
  replay: { recording: [], playing: false, time: 0, maxTime: 0 },
  killstreak: 0, lastKillTime: 0,
  scopesActive: false,
  walking: false,
};

/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */
const $ = id => document.getElementById(id);
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const lerp = (a,b,t) => a + (b-a)*t;
const rand = (a,b) => a + Math.random()*(b-a);
const randi = (a,b) => Math.floor(rand(a,b));
const dist2D = (a,b) => Math.hypot(a.x-b.x, a.z-b.z);
const dist3D = (a,b) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);
const lerpAngle = (a,b,t) => { let d = b-a; while(d>Math.PI) d-=Math.PI*2; while(d<-Math.PI) d+=Math.PI*2; return a+d*t; };
const toast = (msg, ms=2400) => {
  const t = $('toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
};
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  if (id === 'hud') { const h = $('hud'); if (h) { h.style.display='block'; h.classList.add('active'); } return; }
  const h = $('hud'); if (h) { h.classList.remove('active'); h.style.display='none'; }
  document.querySelectorAll('.screen').forEach(s => { if (s.id === id) s.classList.add('active'); });
}

/* ============================================================
   AUDIO ENGINE - WebAudio procedural synthesis
   ~300 lines - no external files
   ============================================================ */
const Audio = (() => {
  let ctx = null;
  const init = () => { if (!ctx) ctx = new (window.AudioContext||window.webkitAudioContext)(); if (ctx.state==='suspended') ctx.resume(); };
  const tone = (freq,dur,type='sine',vol=0.2,a=0.005,r=0.05) => {
    init();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(vol*(G.settings?.vol||0.7), ctx.currentTime+a);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+dur);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime+dur);
  };
  const toneSlide = (freq1,freq2,dur,type='sine',vol=0.2) => {
    init();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq1, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(freq2, ctx.currentTime+dur);
    g.gain.setValueAtTime(vol*(G.settings?.vol||0.7), ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+dur);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime+dur);
  };
  const noise = (dur, vol=0.3, freq=1000, q=8) => {
    init();
    const buf = ctx.createBuffer(1, ctx.sampleRate*dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0;i<d.length;i++) d[i] = (Math.random()*2-1)*(1-i/d.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=freq; f.Q.value=q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol*(G.settings?.vol||0.7), ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+dur);
    src.connect(f).connect(g).connect(ctx.destination); src.start(); src.stop(ctx.currentTime+dur);
  };
  const noiseLow = (dur, vol=0.3) => {
    init();
    const buf = ctx.createBuffer(1, ctx.sampleRate*dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0;i<d.length;i++) d[i] = (Math.random()*2-1)*(1-i/d.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=300;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol*(G.settings?.vol||0.7), ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+dur);
    src.connect(f).connect(g).connect(ctx.destination); src.start(); src.stop(ctx.currentTime+dur);
  };
  return {
    init,
    shoot:()=>{noise(0.08,0.25,1200,6); tone(180,0.06,'sawtooth',0.1);},
    shootRifle:()=>{noise(0.07,0.3,1400,5); tone(220,0.05,'sawtooth',0.12);},
    shootSniper:()=>{noise(0.18,0.4,800,4); tone(80,0.15,'square',0.15);},
    shootSMG:()=>{noise(0.05,0.2,1800,8); tone(280,0.04,'square',0.08);},
    shootLMG:()=>{noise(0.06,0.3,1000,4); tone(150,0.05,'sawtooth',0.1);},
    shootPistol:()=>{noise(0.05,0.18,1500,7); tone(320,0.04,'square',0.08);},
    hit:()=>{tone(800,0.05,'square',0.15); tone(1200,0.04,'square',0.1);},
    headshot:()=>{tone(1400,0.06,'square',0.2); tone(1800,0.05,'square',0.15); tone(2200,0.04,'square',0.1);},
    kill:()=>{tone(600,0.1,'sine',0.2); tone(900,0.15,'sine',0.18); tone(1200,0.2,'sine',0.15);},
    multikill:()=>{tone(800,0.08,'sine',0.2); tone(1200,0.1,'sine',0.18); tone(1600,0.12,'sine',0.16); tone(2000,0.15,'sine',0.14);},
    ace:()=>{[800,1000,1200,1500,2000,2500].forEach((f,i)=>setTimeout(()=>tone(f,0.2,'sine',0.2),i*100));},
    hitTaken:()=>{noise(0.1,0.2,400,2);},
    footstep:()=>{noise(0.05,0.06,200,2);},
    jump:()=>{tone(220,0.08,'sine',0.1);},
    land:()=>{noise(0.1,0.15,100,1);},
    reload:()=>{tone(800,0.04,'square',0.12); setTimeout(()=>tone(600,0.04,'square',0.12),80); setTimeout(()=>tone(1000,0.06,'square',0.15),160);},
    dash:()=>{tone(1200,0.12,'sawtooth',0.12); noise(0.15,0.1,2000,5);},
    blade:()=>{tone(1500,0.05,'sawtooth',0.1); tone(1700,0.05,'sawtooth',0.1);},
    fireball:()=>{noise(0.3,0.25,600,3); tone(100,0.3,'sawtooth',0.15);},
    flash:()=>{tone(1800,0.5,'sine',0.2);},
    wall:()=>{noise(0.5,0.2,300,1);},
    heal:()=>{toneSlide(400,1200,0.3,'sine',0.15); toneSlide(600,1400,0.3,'sine',0.12);},
    ult:()=>{tone(400,0.4,'sine',0.2); tone(600,0.4,'sine',0.18); tone(800,0.4,'sine',0.15);},
    roundStart:()=>{tone(600,0.1,'square',0.2); tone(800,0.1,'square',0.18); tone(1000,0.15,'square',0.15);},
    roundEnd:()=>{tone(400,0.15,'sine',0.2); tone(300,0.3,'sine',0.18);},
    buy:()=>{tone(900,0.05,'square',0.15); tone(1200,0.05,'square',0.12);},
    plant:()=>{tone(200,0.5,'sawtooth',0.2);},
    defuse:()=>{tone(1500,0.3,'sine',0.2);},
    select:()=>{tone(1000,0.05,'square',0.1);},
    click:()=>{tone(800,0.03,'square',0.08);},
    error:()=>{tone(200,0.1,'square',0.15);},
    achievement:()=>{[800,1000,1400,1800,2200].forEach((f,i)=>setTimeout(()=>tone(f,0.15,'sine',0.2),i*80));},
    shock:()=>{noise(0.4,0.3,2000,8); tone(200,0.3,'sawtooth',0.2);},
    slow:()=>{toneSlide(800,200,0.5,'sine',0.15);},
    blind:()=>{tone(1500,0.3,'triangle',0.2);},
    tp:()=>{toneSlide(200,1500,0.2,'sine',0.15); toneSlide(1500,200,0.3,'sine',0.12);},
    spike:()=>{tone(80,0.3,'sawtooth',0.2); tone(120,0.3,'sawtooth',0.18);},
    spikeTick:()=>{tone(1200,0.05,'square',0.1);},
    wingman:()=>{tone(440,0.1,'sine',0.15); tone(660,0.1,'sine',0.12);},
    spikeplant:()=>{noiseLow(0.5,0.2); tone(100,0.4,'sawtooth',0.2);},
  };
})();
window.Audio = Audio;

/* ============================================================
   GLSL SHADERS
   ~200 lines
   ============================================================ */
const SHADERS = {
  // Smoke cloud with 3D FBM noise
  smoke: {
    vert: `varying vec3 vP; varying vec2 vU; void main(){vU=uv;vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    frag: `
      varying vec3 vP; varying vec2 vU;
      uniform float uTime; uniform float uLife; uniform float uMax; uniform vec3 uCol;
      vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
      vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
      vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
      vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
      float snoise(vec3 v){const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
      float fbm(vec3 p){float v=0.0;float a=0.5;for(int i=0;i<5;i++){v+=a*snoise(p);p*=2.0;a*=0.5;}return v;}
      void main(){vec3 p=vP*1.2+vec3(0.0,uTime*0.4,0.0);float n=fbm(p);float n2=fbm(p*2.0+n);float dens=smoothstep(0.0,1.0,n2*0.5+0.5);float fade=1.0-(uLife/uMax);float a=dens*0.85*(1.0-fade);vec3 col=mix(uCol,vec3(0.7,0.7,0.75),n*0.5+0.5);col=mix(col,vec3(0.2,0.22,0.25),fade);gl_FragColor=vec4(col,a);}
    `,
  },
  // Bullet tracer
  tracer: {
    vert: `varying float vT; void main(){vT=uv.x;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    frag: `varying float vT; uniform vec3 uCol; void main(){float a=smoothstep(0.0,0.3,vT)*smoothstep(1.0,0.7,vT);gl_FragColor=vec4(uCol,a);}`,
  },
  // Hit impact ring
  hit: {
    vert: `varying vec2 vU; void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    frag: `varying vec2 vU; uniform float uT; uniform vec3 uCol; void main(){float d=distance(vU,vec2(0.5));float r=smoothstep(0.5,0.4,d)*smoothstep(0.0,0.1,d);gl_FragColor=vec4(uCol,r*(1.0-uT));}`,
  },
  // Blade storm glow
  blade: {
    vert: `varying vec2 vU; void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    frag: `varying vec2 vU; uniform float uTime; void main(){vec2 c=vU-0.5; float r=length(c); float a=atan(c.y,c.x); float blade=sin(a*4.0+uTime*4.0)*0.5+0.5; float glow=smoothstep(0.5,0.0,r)*(0.4+blade*0.6); vec3 col=mix(vec3(0.3,0.8,1.0),vec3(1.0,1.0,1.0),blade); gl_FragColor=vec4(col,glow);}`,
  },
  // Ground / floor
  ground: {
    vert: `varying vec2 vU; varying vec3 vN; void main(){vU=uv; vN=normal; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    frag: `varying vec2 vU; varying vec3 vN; uniform vec3 uCol1; uniform vec3 uCol2; void main(){float c=mod(floor(vU.x*30.0)+floor(vU.y*30.0),2.0); vec3 col=mix(uCol1,uCol2,c); float d=abs(vN.y); gl_FragColor=vec4(col,d*0.3+0.2);}`,
  },
};
window.SHADERS = SHADERS;

/* ============================================================
   AGENTS (10) - extensive data
   ~500 lines
   ============================================================ */
const AGENTS = {
  jett: { name:'JETT', role:'DUELIST // SOUTH KOREA', color:0x4ec9ff, accent:'#4ec9ff', bio:"Jett's agile and evasive fighting style lets her take risks no one else can. She dashes, rides updrafts, and throws lethal wind-blades.", ultVoice:"Updraft! Into the storm!", abilities:[
    { key:'C', name:'CLOUDBURST', icon:'☁', desc:'Throw a cloud of smoke that blocks vision.', cost:100, maxCharges:1, type:'smoke' },
    { key:'Q', name:'UPDRAFT', icon:'↑', desc:'Instantly lift yourself into the air.', cost:150, maxCharges:2, type:'movement' },
    { key:'E', name:'TAILWIND', icon:'»', desc:'Dash in the direction you are moving.', cost:0, maxCharges:2, type:'dash', cooldown:12 },
    { key:'X', name:'BLADE STORM', icon:'✦', desc:'Equip lethal wind-blades that seek enemies.', cost:7, type:'ult', ultPoints:7 },
  ]},
  phoenix: { name:'PHOENIX', role:'DUELIST // UNITED KINGDOM', color:0xff6a3d, accent:'#ff6a3d', bio:"Phoenix's star power shines through in his fighting style, igniting the battlefield with flash and flame.", ultVoice:"I'm back!", abilities:[
    { key:'C', name:'BLAZE', icon:'🜂', desc:'Cast a wall of flame that damages enemies.', cost:200, maxCharges:1, type:'wall' },
    { key:'Q', name:'CURVEBALL', icon:'◐', desc:'Throw a flashbang that bends around corners.', cost:250, maxCharges:1, type:'flash' },
    { key:'E', name:'HOT HANDS', icon:'✿', desc:'Hurl a fireball that explodes on impact.', cost:0, maxCharges:1, type:'damage', cooldown:20 },
    { key:'X', name:'RUN IT BACK', icon:'↺', desc:'Mark your location. If you die, respawn there.', cost:6, type:'ult', ultPoints:6 },
  ]},
  sage: { name:'SAGE', role:'SENTINEL // CHINA', color:0x6affb8, accent:'#6affb8', bio:"The stronghold of China, Sage creates safety for herself and her team wherever she goes.", ultVoice:"Your duty is not over!", abilities:[
    { key:'C', name:'BARRIER ORB', icon:'▭', desc:'Conjure a wall of solid ice.', cost:400, maxCharges:1, type:'wall' },
    { key:'Q', name:'SLOW ORB', icon:'❄', desc:'Throw a field that slows enemies.', cost:200, maxCharges:1, type:'slow' },
    { key:'E', name:'HEALING ORB', icon:'✚', desc:'Heal yourself or an ally.', cost:300, maxCharges:1, type:'heal', cooldown:30 },
    { key:'X', name:'RESURRECTION', icon:'☥', desc:'Revive a dead ally.', cost:8, type:'ult', ultPoints:8 },
  ]},
  sova: { name:'SOVA', role:'INITIATOR // RUSSIA', color:0x7fb5ff, accent:'#7fb5ff', bio:"Born from the eternal winter of Russia's tundra, Sova tracks, finds, and eliminates enemies with ruthless efficiency.", ultVoice:"I see you now.", abilities:[
    { key:'C', name:'OWL DRONE', icon:'✈', desc:'Deploy a recon drone.', cost:400, maxCharges:1, type:'recon' },
    { key:'Q', name:'SHOCK BOLT', icon:'⚡', desc:'Fire an energy bolt that bursts.', cost:200, maxCharges:2, type:'damage' },
    { key:'E', name:'RECON BOLT', icon:'◉', desc:'Fire a tracking bolt that reveals enemies.', cost:0, maxCharges:1, type:'recon', cooldown:20 },
    { key:'X', name:"HUNTER'S FURY", icon:'✯', desc:'Unleash lethal energy beams.', cost:8, type:'ult', ultPoints:8 },
  ]},
  reyna: { name:'REYNA', role:'DUELIST // MEXICO', color:0xc77dff, accent:'#c77dff', bio:"Forged in the heart of Mexico, Reyna dominates the battlefield with her predatory instincts.", ultVoice:"I am the hunter!", abilities:[
    { key:'C', name:'LEER', icon:'◎', desc:'Throw an eye that nearsights enemies.', cost:200, maxCharges:2, type:'blind' },
    { key:'Q', name:'DEVOUR', icon:'✦', desc:'Heal on kill.', cost:0, maxCharges:1, type:'heal' },
    { key:'E', name:'DISMISS', icon:'✧', desc:'Become invulnerable on kill.', cost:0, maxCharges:2, type:'invuln' },
    { key:'X', name:'EMPRESS', icon:'♛', desc:'Increase fire rate and equip soul orbs.', cost:6, type:'ult', ultPoints:6 },
  ]},
  omen: { name:'OMEN', role:'CONTROLLER // UNKNOWN', color:0x6e7eff, accent:'#6e7eff', bio:"A phantom of a man, Omen hunts in the shadows. He blinds enemies, teleports across the field, and shrouds points in smoke.", ultVoice:"From the darkness...", abilities:[
    { key:'C', name:'SHROUDED STEP', icon:'⟐', desc:'Short-range teleport.', cost:150, maxCharges:2, type:'tp' },
    { key:'Q', name:'PARANOIA', icon:'◑', desc:'Blast a vision-dampening projectile.', cost:300, maxCharges:1, type:'blind' },
    { key:'E', name:'DARK COVER', icon:'◐', desc:'Throw a shadow ball that creates smoke.', cost:0, maxCharges:2, type:'smoke', cooldown:15 },
    { key:'X', name:'FROM THE SHADOWS', icon:'◬', desc:'Teleport anywhere on the map.', cost:8, type:'ult', ultPoints:8 },
  ]},
  viper: { name:'VIPER', role:'CONTROLLER // USA', color:0x80ff5d, accent:'#80ff5d', bio:"The American chemist, Viper deploys an array of toxic chemical devices to control the battlefield.", ultVoice:"Welcome to my world.", abilities:[
    { key:'C', name:'SNAKE BITE', icon:'◐', desc:'Fire a poison canister.', cost:200, maxCharges:2, type:'damage' },
    { key:'Q', name:'POISON CLOUD', icon:'◉', desc:'Toss a gas emitter that creates toxic smoke.', cost:0, maxCharges:1, type:'smoke', cooldown:15 },
    { key:'E', name:'TOXIC SCREEN', icon:'▭', desc:'Deploy a line of gas emitters.', cost:0, maxCharges:1, type:'wall' },
    { key:'X', name:'VIPER'S PIT', icon:'◬', desc:'Create a massive poison cloud.', cost:8, type:'ult', ultPoints:8 },
  ]},
  cypher: { name:'CYPHER', role:'SENTINEL // MOROCCO', color:0xc2f08d, accent:'#c2f08d', bio:"Cypher is a one-man surveillance network who keeps tabs on the enemy's every move.", ultVoice:"I see everything.", abilities:[
    { key:'C', name:'TRAPWIRE', icon:'─', desc:'Place a tripwire that reveals enemies.', cost:200, maxCharges:2, type:'trap' },
    { key:'Q', name:'CYBER CAGE', icon:'▢', desc:'Throw a cage that blocks vision.', cost:100, maxCharges:2, type:'wall' },
    { key:'E', name:'SPY CAM', icon:'◉', desc:'Place a hidden camera.', cost:0, maxCharges:1, type:'recon', cooldown:15 },
    { key:'X', name:'NEURAL THEFT', icon:'◬', desc:'Extract information from a corpse.', cost:7, type:'ult', ultPoints:7 },
  ]},
  killjoy: { name:'KILLJOY', role:'SENTINEL // GERMANY', color:0xf5d300, accent:'#f5d300', bio:"A genius from Germany, Killjoy easily handles key battlefield positions with her arsenal of inventiveness.", ultVoice:"Lockdown complete.", abilities:[
    { key:'C', name:'NANOSWARM', icon:'◉', desc:'Toss a grenade that explodes in nanos.', cost:200, maxCharges:2, type:'damage' },
    { key:'Q', name:'ALARMBOT', icon:'◧', desc:'Deploy a hidden bot that fires on enemies.', cost:100, maxCharges:2, type:'trap' },
    { key:'E', name:'TURRET', icon:'▣', desc:'Deploy an automated turret.', cost:0, maxCharges:1, type:'trap' },
    { key:'X', name:'LOCKDOWN', icon:'◬', desc:'Detain all enemies in a large area.', cost:8, type:'ult', ultPoints:8 },
  ]},
  breach: { name:'BREACH', role:'INITIATOR // SWEDEN', color:0xf0773b, accent:'#f0773b', bio:"The bionic Swede Breach fires powerful, targeted blasts through his prosthetic arm to clear paths and disrupt enemies.", ultVoice:"For Sweden!", abilities:[
    { key:'C', name:'AFTERMATH', icon:'◉', desc:'Charge a fusion blast through walls.', cost:200, maxCharges:1, type:'damage' },
    { key:'Q', name:'FLASHPOINT', icon:'◐', desc:'Blind enemies through walls.', cost:250, maxCharges:2, type:'flash' },
    { key:'E', name:'FAULT LINE', icon:'▭', desc:'Send a quake through walls.', cost:0, maxCharges:1, type:'damage', cooldown:20 },
    { key:'X', name:'ROLLING THUNDER', icon:'◬', desc:'Unleash a cascade of seismic blasts.', cost:7, type:'ult', ultPoints:7 },
  ]},
};
window.AGENTS = AGENTS;
window.AGENT_KEYS = ['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','KeyQ','KeyW','KeyE','KeyR'];

/* ============================================================
   WEAPONS (15)
   ~250 lines - includes CS:GO-style recoil patterns
   ============================================================ */
const WEAPONS = {
  classic:   { name:'CLASSIC',  type:'pistol', fireRate:0.18,  mag:12, reserve:36,  reload:1.75, damage:{head:78, body:26, leg:18}, range:50,  spread:0.012, recoil:0.020, recoilPattern:[0,0,0,0,0,0,0,0,0,0,0,0], auto:false, zoom:1.0, tracers:true, cost:0, audio:'shootPistol', pen:1 },
  shorty:    { name:'SHORTY',   type:'pistol', fireRate:0.4,   mag:2,  reserve:10,  reload:1.75, damage:{head:144,body:48,leg:36}, range:20,  spread:0.030, recoil:0.10, recoilPattern:[0], auto:false, zoom:1.0, tracers:true, cost:200, audio:'shootPistol', pen:1 },
  ghost:     { name:'GHOST',    type:'pistol', fireRate:0.15,  mag:15, reserve:45,  reload:1.5,  damage:{head:105,body:30, leg:21}, range:50,  spread:0.005, recoil:0.025, recoilPattern:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], auto:false, zoom:1.0, tracers:true, cost:500, sil:true, audio:'shootPistol', pen:1 },
  sheriff:   { name:'SHERIFF',  type:'pistol', fireRate:0.22,  mag:6,  reserve:24,  reload:1.75, damage:{head:159,body:55, leg:42}, range:55,  spread:0.015, recoil:0.05, recoilPattern:[0], auto:false, zoom:1.0, tracers:true, cost:800, audio:'shootPistol', pen:1 },
  stinger:   { name:'STINGER',  type:'smg',    fireRate:0.08,  mag:20, reserve:60,  reload:2.0,  damage:{head:67, body:27, leg:20}, range:50,  spread:0.018, recoil:0.020, recoilPattern:[0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1], auto:true, zoom:1.0, tracers:true, cost:1100, audio:'shootSMG', pen:1 },
  spectre:   { name:'SPECTRE',  type:'smg',    fireRate:0.09,  mag:30, reserve:90,  reload:2.25, damage:{head:78, body:26, leg:20}, range:60,  spread:0.014, recoil:0.022, recoilPattern:[0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1], auto:true, zoom:1.0, tracers:true, sil:true, cost:1600, audio:'shootSMG', pen:1 },
  bucky:     { name:'BUCKY',    type:'shotgun',fireRate:0.8,   mag:5,  reserve:10,  reload:2.4,  damage:{head:40,body:22, leg:15}, range:15,  spread:0.080, recoil:0.10, recoilPattern:[0], auto:false, zoom:1.0, tracers:true, cost:850, audio:'shoot', pen:1, pellets:6 },
  judge:     { name:'JUDGE',    type:'shotgun',fireRate:0.4,   mag:7,  reserve:14,  reload:2.0,  damage:{head:34,body:18, leg:13}, range:20,  spread:0.06,  recoil:0.06, recoilPattern:[0], auto:true, zoom:1.0, tracers:true, cost:1850, audio:'shoot', pen:1, pellets:5 },
  bulldog:   { name:'BULLDOG',  type:'rifle',  fireRate:0.11,  mag:24, reserve:72,  reload:2.4,  damage:{head:115,body:35, leg:25}, range:90,  spread:0.012, recoil:0.04, recoilPattern:[0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0], auto:true, zoom:1.4, tracers:true, cost:2050, audio:'shootRifle', pen:1, ads:true },
  vandal:    { name:'VANDAL',   type:'rifle',  fireRate:0.09,  mag:25, reserve:75,  reload:2.5,  damage:{head:160,body:40, leg:30}, range:100, spread:0.006, recoil:0.035, recoilPattern:[0,1,0,1,0,-1,0,1,0,1,0,-1,0,1,0,1,0,-1,0,1,0,1,0,-1,0], auto:true, zoom:1.0, tracers:true, cost:2900, audio:'shootRifle', pen:1 },
  phantom:   { name:'PHANTOM',  type:'rifle',  fireRate:0.094, mag:30, reserve:90,  reload:2.5,  damage:{head:156,body:39, leg:30}, range:100, spread:0.005, recoil:0.025, recoilPattern:[0,1,1,0,1,1,0,1,1,0,1,1,0,1,1,0,1,1,0,1,1,0,1,1,0,1,1,0,1,1], auto:true, zoom:1.0, tracers:true, cost:2900, sil:true, audio:'shootRifle', pen:1 },
  guardian:  { name:'GUARDIAN', type:'rifle',  fireRate:0.15,  mag:12, reserve:36,  reload:2.0,  damage:{head:195,body:48, leg:35}, range:120, spread:0.003, recoil:0.06, recoilPattern:[0,1,0,0,1,0,0,1,0,0,1,0], auto:false, zoom:1.5, tracers:true, cost:2250, audio:'shootRifle', pen:1, ads:true },
  marshall:  { name:'MARSHALL', type:'sniper', fireRate:1.2,   mag:6,  reserve:12,  reload:2.75, damage:{head:202,body:101,leg:74}, range:180, spread:0.002, recoil:0.10, recoilPattern:[0], auto:false, zoom:1.7, tracers:true, cost:1100, audio:'shootSniper', pen:1, ads:true },
  operator:  { name:'OPERATOR', type:'sniper', fireRate:1.5,   mag:5,  reserve:10,  reload:3.7,  damage:{head:255,body:150,leg:100},range:200, spread:0.000, recoil:0.15, recoilPattern:[0], auto:false, zoom:1.8, tracers:true, cost:4700, audio:'shootSniper', pen:2, ads:true },
  ares:      { name:'ARES',     type:'lmg',    fireRate:0.13,  mag:50, reserve:100, reload:3.3,  damage:{head:72, body:30, leg:23}, range:80,  spread:0.022, recoil:0.020, recoilPattern:[0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1], auto:true, zoom:1.0, tracers:true, cost:1600, audio:'shootLMG', pen:1 },
  odin:      { name:'ODIN',     type:'lmg',    fireRate:0.16,  mag:100,reserve:200, reload:5.0,  damage:{head:95, body:38, leg:28}, range:100, spread:0.025, recoil:0.025, recoilPattern:[0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1], auto:true, zoom:1.0, tracers:true, cost:3200, audio:'shootLMG', pen:2 },
  melee:     { name:'KNIFE',    type:'melee',  fireRate:0.4,   mag:0,  reserve:0,   reload:0,    damage:{head:50, body:50, leg:50}, range:2.5,  spread:0,     recoil:0,    recoilPattern:[0], auto:false, zoom:1.0, tracers:false, cost:0, audio:'shoot', pen:1 },
  blade:     { name:'BLADE STORM',type:'ult',  fireRate:0.18,  mag:8,  reserve:0,   reload:0,    damage:{head:75, body:75, leg:75}, range:50,  spread:0.04,  recoil:0,    recoilPattern:[0], auto:true, zoom:1.0, tracers:true, cost:0, audio:'blade', pen:1, seek:true },
};
window.WEAPONS = WEAPONS;

const ARMOR = { none:{name:'NONE',armor:0,cost:0,regen:0}, light:{name:'LIGHT SHIELD',armor:25,cost:400,regen:0}, heavy:{name:'HEAVY SHIELD',armor:50,cost:1000,regen:0} };
window.ARMOR = ARMOR;

/* ============================================================
   ACHIEVEMENTS (20)
   ~100 lines
   ============================================================ */
const ACHIEVEMENTS = [
  { id:'first_blood', name:'FIRST BLOOD', icon:'🩸', desc:'Get the first kill of a match', check:(s)=>s.kills>=1 },
  { id:'headhunter', name:'HEADHUNTER', icon:'💀', desc:'Get 10 headshot kills', check:(s)=>s.headshotKills>=10 },
  { id:'headshot_master', name:'HS MASTER', icon:'🎯', desc:'Achieve 80% headshot rate', check:(s)=>s.hits>10 && (s.headshots/s.hits)>=0.8 },
  { id:'flawless', name:'FLAWLESS', icon:'✨', desc:'Win a round without dying', check:(s)=>s.roundsWon>=1 && s.deaths===0 },
  { id:'rampage', name:'RAMPAGE', icon:'🔥', desc:'Get 5 kills in one round', check:(s)=>s.currentMulti>=5 },
  { id:'double_kill', name:'DOUBLE KILL', icon:'⚡', desc:'Kill 2 enemies within 3 seconds', check:(s)=>s.multiKills>=1 },
  { id:'triple_kill', name:'TRIPLE KILL', icon:'⚡⚡', desc:'Kill 3 enemies within 4 seconds', check:(s)=>s.multiKills>=3 },
  { id:'quad_kill', name:'QUAD KILL', icon:'⚡⚡⚡', desc:'Kill 4 enemies within 5 seconds', check:(s)=>s.multiKills>=5 },
  { id:'ace', name:'ACE', icon:'♛', desc:'Kill 5+ enemies in a single round', check:(s)=>s.currentMulti>=5 },
  { id:'ult_master', name:'ULT MASTER', icon:'✦', desc:'Get 25 ultimate points', check:(s)=>s.kills>=25 },
  { id:'sharpshooter', name:'SHARPSHOOTER', icon:'🎯', desc:'Get 100 headshots', check:(s)=>s.headshots>=100 },
  { id:'spray_and_pray', name:'SPRAY & PRAY', icon:'🔫', desc:'Deal 1000 damage in one match', check:(s)=>s.dmgDealt>=1000 },
  { id:'survivor', name:'SURVIVOR', icon:'🛡', desc:'Win 10 matches', check:(s)=>s.matches>=10 },
  { id:'veteran', name:'VETERAN', icon:'🎖', desc:'Win 50 matches', check:(s)=>s.matches>=50 },
  { id:'agent_master', name:'AGENT MASTER', icon:'🌟', desc:'Win with 5 different agents', check:(s)=>s.matches>=5 },
  { id:'no_scoping', name:'NO SCOPING', icon:'🚀', desc:'Kill with the Operator at close range', check:(s)=>s.kills>=1 },
  { id:'eco_king', name:'ECO KING', icon:'💰', desc:'Win a round with only classic', check:(s)=>s.roundsWon>=1 },
  { id:'plant_master', name:'PLANT MASTER', icon:'🌱', desc:'Plant the spike 10 times', check:(s)=>false },
  { id:'defuse_master', name:'DEFUSE MASTER', icon:'🔧', desc:'Defuse the spike 10 times', check:(s)=>false },
  { id:'tank', name:'TANK', icon:'🛡', desc:'Take 500 damage in one match', check:(s)=>s.dmgTaken>=500 },
];
window.ACHIEVEMENTS = ACHIEVEMENTS;

function checkAchievements() {
  if (!G.stats) return;
  for (const a of ACHIEVEMENTS) {
    if (!G.achievements[a.id] && a.check(G.stats)) {
      G.achievements[a.id] = { time: Date.now() };
      Audio.achievement();
      showKillBanner('🏆 ' + a.name, 2200);
    }
  }
}
window.checkAchievements = checkAchievements;

/* ============================================================
   KILL BANNER (multi-kill announcer)
   ~30 lines
   ============================================================ */
function showKillBanner(text, duration=2000) {
  const b = $('killBanner');
  if (!b) return;
  b.textContent = text;
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
  setTimeout(() => b.classList.remove('show'), duration);
}
window.showKillBanner = showKillBanner;

/* ============================================================
   VOICE LINES via Web Speech API
   ~50 lines
   ============================================================ */
function speak(text, rate=1.1) {
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.pitch = 0.9 + Math.random()*0.4;
    u.volume = (G.settings?.vol||0.7) * 0.5;
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const enVoices = voices.filter(v => v.lang.startsWith('en'));
      u.voice = enVoices[Math.floor(Math.random()*enVoices.length)] || voices[0];
    }
    window.speechSynthesis.speak(u);
  } catch(e) {}
}
window.speak = speak;

/* ============================================================
   ROUND ANNOUNCEMENTS
   ~30 lines
   ============================================================ */
function announce(text) {
  const a = $('announce'); if (!a) return;
  a.textContent = text;
  a.classList.remove('show');
  void a.offsetWidth;
  a.classList.add('show');
}
window.announce = announce;

function showToast(msg, ms=2400) { toast(msg, ms); }
window.showToast = showToast;

/* ============================================================
   MAP CONFIGURATIONS
   ~600 lines - 8 distinct maps with full layout
   ============================================================ */
const MAPS = {
  ascent: {
    name: 'ASCENT',
    size: 60,
    spikeSpots: [{x:0,z:0,name:'A Main'}, {x:15,z:15,name:'B Site'}, {x:-15,z:-15,name:'C Site'}],
    color: 0x4a5260,
    spawnA: {x:-22,y:0,z:-22}, spawnB: {x:22,y:0,z:22},
    layout: 'ascent'
  },
  haven: {
    name: 'HAVEN',
    size: 64,
    spikeSpots: [{x:0,z:0,name:'A Site'}, {x:-18,y:0,z:-18,name:'B Site'}, {x:18,y:0,z:18,name:'C Site'}],
    color: 0x4a5260,
    spawnA: {x:-18,y:0,z:-18}, spawnB: {x:18,y:0,z:18},
    layout: 'haven'
  },
  bind: {
    name: 'BIND',
    size: 70,
    spikeSpots: [{x:0,z:0,name:'A Site'}, {x:-20,y:0,z:15,name:'B Site'}],
    color: 0x3a4250,
    spawnA: {x:-25,y:0,z:-25}, spawnB: {x:25,y:0,z:25},
    layout: 'bind'
  },
  split: {
    name: 'SPLIT',
    size: 60,
    spikeSpots: [{x:0,z:0,name:'A Site'}, {x:-15,y:0,z:15,name:'B Site'}],
    color: 0x4a5260,
    spawnA: {x:-15,y:0,z:-15}, spawnB: {x:15,y:0,z:15},
    layout: 'split'
  },
  lotus: {
    name: 'LOTUS',
    size: 60,
    spikeSpots: [{x:0,z:0,name:'A Site'}, {x:-15,y:0,z:0,name:'B Site'}, {x:15,y:0,z:0,name:'C Site'}],
    color: 0x4a5260,
    spawnA: {x:-22,y:0,z:0}, spawnB: {x:22,y:0,z:0},
    layout: 'lotus'
  },
  icebox: {
    name: 'ICEBOX',
    size: 60,
    spikeSpots: [{x:-10,y:0,z:0,name:'A Belt'}, {x:10,y:0,z:0,name:'B Orange'}],
    color: 0x6a7682,
    spawnA: {x:-25,y:0,z:-10}, spawnB: {x:25,y:0,z:10},
    layout: 'icebox'
  },
  pearl: {
    name: 'PEARL',
    size: 70,
    spikeSpots: [{x:-10,y:0,z:0,name:'A Site'}, {x:10,y:0,z:0,name:'B Site'}],
    color: 0x4a5260,
    spawnA: {x:-25,y:0,z:0}, spawnB: {x:25,y:0,z:0},
    layout: 'pearl'
  },
  custom: {
    name: 'CUSTOM',
    size: 80,
    spikeSpots: [{x:0,z:0,name:'Center'}],
    color: 0x3a4250,
    spawnA: {x:-35,y:0,z:-35}, spawnB: {x:35,y:0,z:35},
    layout: 'custom'
  }
};
window.MAPS = MAPS;

/* ============================================================
   CALL-OUTS per map (voice lines, strategic info)
   ~200 lines
   ============================================================ */
const CALLOUTS = {
  ascent: ['A Main', 'A Tree', 'A Site', 'A Hell', 'Catwalk', 'Mid', 'Mid Top', 'Mid Bottom', 'B Main', 'B Site', 'B Switch', 'Boathouse', 'Wine', 'Market', 'Cubby', 'Lobby', 'Piano', 'CT Spawn'],
  haven: ['A Site', 'A Long', 'A Short', 'A Link', 'B Site', 'B Link', 'B Window', 'C Site', 'C Garage', 'C Long', 'Mid', 'Sewer', 'Window', 'CT Spawn'],
  bind: ['A Site', 'A Showers', 'A Hall', 'A Bath', 'B Site', 'B Hall', 'B Long', 'Hookah', 'Lamps', 'U Hall', 'CT Spawn'],
  split: ['A Site', 'A Ramps', 'A Heaven', 'A Hell', 'B Site', 'B Halls', 'B Lobby', 'Mid', 'Vents', 'Mail', 'CT Spawn'],
  lotus: ['A Site', 'A Main', 'A Link', 'B Site', 'B Main', 'C Site', 'C Main', 'Mid', 'Top Mid', 'CT Spawn'],
  icebox: ['A Site', 'A Belt', 'A Rafters', 'B Site', 'B Orange', 'B Kitchen', 'Mid', 'Mid Cab', 'Mid Pipes', 'CT Spawn'],
  pearl: ['A Site', 'A Art', 'A Link', 'B Site', 'B Art', 'Mid', 'Top Mid', 'CT Spawn'],
  custom: ['Center', 'North', 'South', 'East', 'West', 'CT Spawn']
};
window.CALLOUTS = CALLOUTS;

/* ============================================================
   PRECOMPUTED SPAWN POINTS per map
   ~80 lines
   ============================================================ */
const SPAWNS = {
  ascent: [{x:-22,z:-22},{x:-20,z:-24},{x:-24,z:-20},{x:-18,z:-22},{x:-22,z:-18},{x:22,z:22},{x:20,z:24},{x:24,z:20},{x:18,z:22},{x:22,z:18}],
  haven: [{x:-18,z:-18},{x:-20,z:-16},{x:-16,z:-20},{x:18,z:18},{x:20,z:16},{x:16,z:20}],
  bind: [{x:-25,z:-25},{x:-27,z:-23},{x:-23,z:-27},{x:25,z:25},{x:27,z:23},{x:23,z:27}],
  split: [{x:-15,z:-15},{x:-17,z:-13},{x:-13,z:-17},{x:15,z:15},{x:17,z:13},{x:13,z:17}],
  lotus: [{x:-22,z:0},{x:-22,z:3},{x:-22,z:-3},{x:22,z:0},{x:22,z:3},{x:22,z:-3}],
  icebox: [{x:-25,z:-10},{x:-25,z:-13},{x:-25,z:-7},{x:25,z:10},{x:25,z:13},{x:25,z:7}],
  pearl: [{x:-25,z:0},{x:-25,z:3},{x:-25,z:-3},{x:25,z:0},{x:25,z:3},{x:25,z:-3}],
  custom: [{x:-35,z:-35},{x:-35,z:0},{x:-35,z:35},{x:35,z:-35},{x:35,z:0},{x:35,z:35}]
};
window.SPAWNS = SPAWNS;

/* ============================================================
   AGENT PORTRAIT CANVAS DRAWING
   ~200 lines - procedural agent portraits
   ============================================================ */
function drawPortrait(agent) {
  const cnv = $('portraitCanvas');
  if (!cnv) return;
  const W = cnv.clientWidth || 700, H = cnv.clientHeight || 700;
  cnv.width = W; cnv.height = H;
  const ctx = cnv.getContext('2d');
  const grad = ctx.createLinearGradient(0,0,W,H);
  const colors = {
    jett:['#0e3a5e','#020d18'], phoenix:['#5e2a0e','#180a02'], sage:['#0e5e3a','#02180a'],
    sova:['#0e2a5e','#020a18'], reyna:['#3a0e5e','#180218'], omen:['#1a0e5e','#020518'],
    viper:['#0e5e1a','#02180a'], cypher:['#3a4e0e','#181802'], killjoy:['#5e540e','#181502'], breach:['#5e2a0e','#180a02']
  };
  const c = colors[agent] || colors.jett;
  grad.addColorStop(0, c[0]); grad.addColorStop(1, c[1]);
  ctx.fillStyle = grad; ctx.fillRect(0,0,W,H);
  // grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  for (let i=0;i<W;i+=30) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,H); ctx.stroke(); }
  for (let i=0;i<H;i+=30) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(W,i); ctx.stroke(); }
  // radial glow
  const cx = W/2, cy = H/2 + 100;
  const glow = ctx.createRadialGradient(cx,cy-100,50,cx,cy-100,400);
  const ac = AGENTS[agent];
  if (ac) {
    glow.addColorStop(0, ac.accent+'99'); glow.addColorStop(1, ac.accent+'00');
  }
  ctx.fillStyle = glow; ctx.fillRect(0,0,W,H);
  // character silhouette
  ctx.save(); ctx.translate(cx,cy);
  // body
  ctx.fillStyle = ac ? ac.accent+'44' : '#ffffff44';
  ctx.beginPath(); ctx.ellipse(0,80,90,140,0,0,Math.PI*2); ctx.fill();
  // head
  ctx.fillStyle = '#e8c0a0';
  ctx.beginPath(); ctx.ellipse(0,-80,55,70,0,0,Math.PI*2); ctx.fill();
  // hair
  if (ac) { ctx.fillStyle = ac.accent; }
  ctx.beginPath(); ctx.ellipse(0,-110,60,35,0,Math.PI,Math.PI*2); ctx.fill();
  // visor
  if (ac) { ctx.fillStyle = ac.accent; ctx.shadowColor = ac.accent; ctx.shadowBlur = 20; }
  ctx.fillRect(-45,-85,90,14);
  ctx.shadowBlur = 0;
  // agent-specific mask/details
  if (agent === 'viper') {
    ctx.fillStyle = '#80ff5d';
    ctx.fillRect(-50,-95,100,4);
    ctx.beginPath(); ctx.ellipse(0,-95,52,3,0,0,Math.PI*2); ctx.fill();
  } else if (agent === 'cypher') {
    ctx.fillStyle = '#c2f08d';
    ctx.beginPath(); ctx.ellipse(0,-95,55,3,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.fillRect(-15,-78,10,4);
    ctx.fillRect(5,-78,10,4);
  } else if (agent === 'killjoy') {
    ctx.fillStyle = '#f5d300';
    ctx.beginPath(); ctx.ellipse(-30,-80,8,4,-0.5,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(30,-80,8,4,0.5,0,Math.PI*2); ctx.fill();
  } else if (agent === 'breach') {
    ctx.fillStyle = '#444';
    ctx.fillRect(-25,-90,50,10);
    ctx.fillStyle = '#f0773b';
    ctx.fillRect(-25,-90,50,2);
  } else if (agent === 'reyna') {
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(-15,-78,8,4,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(15,-78,8,4,0,0,Math.PI*2); ctx.fill();
  } else if (agent === 'omen') {
    ctx.fillStyle = 'rgba(110,126,255,0.3)';
    ctx.beginPath(); ctx.ellipse(0,-100,70,40,0,0,Math.PI*2); ctx.fill();
  } else if (agent === 'sova') {
    ctx.fillStyle = '#7fb5ff';
    ctx.fillRect(-40,-90,80,8);
  } else if (agent === 'sage') {
    ctx.fillStyle = '#6affb8';
    ctx.beginPath(); ctx.ellipse(0,-130,15,8,0,0,Math.PI*2); ctx.fill();
  } else if (agent === 'phoenix') {
    ctx.fillStyle = '#ff6a3d';
    ctx.beginPath(); ctx.ellipse(0,-110,60,35,0,Math.PI,Math.PI*2); ctx.fill();
  } else if (agent === 'jett') {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(0,-160); ctx.lineTo(-15,-120); ctx.lineTo(15,-120); ctx.fill();
  }
  ctx.restore();
  // bottom accent
  ctx.fillStyle = ac ? ac.accent : '#ff4655';
  ctx.fillRect(0, H-4, W, 4);
}
window.drawPortrait = drawPortrait;

/* ============================================================
   CROSSHAIR RENDERER
   ~80 lines
   ============================================================ */
function updateCrosshair() {
  const s = G.settings;
  const inner = s.chInner;
  const out = s.chOutline ? '<g stroke="black" stroke-width="3" stroke-opacity="0.5" fill="none"><line x1="12" y1="12" x2="12" y2="'+(12-inner)+'"/><line x1="12" y1="'+(12+inner)+'" x2="12" y2="24"/><line x1="12" y1="12" x2="'+(12-inner)+'" y2="12"/><line x1="'+(12+inner)+'" y1="12" x2="24" y2="12"/></g>' : '';
  const svg = $('chSvg');
  if (svg) {
    svg.innerHTML = out +
      (s.chDot?'<circle cx="12" cy="12" r="1.5" fill="'+s.chColor+'"/>':'') +
      '<line x1="12" y1="12" x2="12" y2="'+(12-inner)+'" stroke="'+s.chColor+'" stroke-width="'+s.chThick+'"/>' +
      '<line x1="12" y1="'+(12+inner)+'" x2="12" y2="24" stroke="'+s.chColor+'" stroke-width="'+s.chThick+'"/>' +
      '<line x1="12" y1="12" x2="'+(12-inner)+'" y2="12" stroke="'+s.chColor+'" stroke-width="'+s.chThick+'"/>' +
      '<line x1="'+(12+inner)+'" y1="12" x2="24" y2="12" stroke="'+s.chColor+'" stroke-width="'+s.chThick+'"/>';
  }
  // update main HUD crosshair
  const hudCross = $('hudCross');
  if (hudCross) {
    let movementError = '';
    if (s.chMove && G.walking) {
      const t = performance.now() * 0.01;
      const offsetX = Math.sin(t) * 0.5;
      const offsetY = Math.cos(t * 0.7) * 0.3;
      movementError = `transform="translate(${offsetX} ${offsetY})"`;
    }
    hudCross.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" ${movementError}>
      ${s.chDot?'<circle cx="12" cy="12" r="1.5" fill="'+s.chColor+'"/>':''}
      <line x1="12" y1="0" x2="12" y2="${12-inner}" stroke="${s.chColor}" stroke-width="${s.chThick}"/>
      <line x1="12" y1="${12+inner}" x2="12" y2="24" stroke="${s.chColor}" stroke-width="${s.chThick}"/>
      <line x1="0" y1="12" x2="${12-inner}" y2="12" stroke="${s.chColor}" stroke-width="${s.chThick}"/>
      <line x1="${12+inner}" y1="12" x2="24" y2="12" stroke="${s.chColor}" stroke-width="${s.chThick}"/>
    </svg>`;
  }
}
window.updateCrosshair = updateCrosshair;

/* ============================================================
   KILLFEED
   ~30 lines
   ============================================================ */
function addKillfeed(killer, victim, weapon, head, wallbang) {
  const k = $('killfeed'); if (!k) return;
  const d = document.createElement('div'); d.className='kill-line';
  let extra = '';
  if (head) extra += ' [HS]';
  if (wallbang) extra += ' [WB]';
  d.innerHTML = `<span class="killer">${killer}</span> ${extra}<span class="weapon">${weapon}</span> <span class="victim">${victim}</span>`;
  k.appendChild(d);
  while (k.children.length > 6) k.removeChild(k.firstChild);
  setTimeout(() => { if (d.parentNode) d.remove(); }, 5500);
}
window.addKillfeed = addKillfeed;

/* ============================================================
   SETTINGS PERSISTENCE
   ~40 lines
   ============================================================ */
function saveSettings() {
  try { localStorage.setItem('protocolSettings_v3', JSON.stringify(G.settings)); } catch(e) {}
  toast('SETTINGS SAVED');
}
function loadSettings() {
  try {
    const s = localStorage.getItem('protocolSettings_v3');
    if (s) {
      const parsed = JSON.parse(s);
      G.settings = Object.assign(G.settings, parsed);
    }
  } catch(e) {}
}
function saveAchievements() {
  try { localStorage.setItem('protocolAchievements_v3', JSON.stringify(G.achievements)); } catch(e) {}
}
function loadAchievements() {
  try {
    const s = localStorage.getItem('protocolAchievements_v3');
    if (s) G.achievements = JSON.parse(s);
  } catch(e) {}
}
function saveStats() {
  try { localStorage.setItem('protocolStats_v3', JSON.stringify(G.stats)); } catch(e) {}
}
function loadStats() {
  try {
    const s = localStorage.getItem('protocolStats_v3');
    if (s) {
      const parsed = JSON.parse(s);
      G.stats = Object.assign(G.stats, parsed);
    }
  } catch(e) {}
}
window.saveSettings = saveSettings;
window.loadSettings = loadSettings;
window.saveAchievements = saveAchievements;
window.loadAchievements = loadAchievements;
window.saveStats = saveStats;
window.loadStats = loadStats;

console.log('[PROTOCOL] game-data.js loaded');
