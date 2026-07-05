/* =====================================================================
   PROTOCOL :: 1v1 TACTICAL SHOOTER
   game-ui.js - All UI: HUD, menus, screens, game loop, init
   ~5500 lines
   ===================================================================== */
'use strict';

/* ============================================================
   SCORE / KILLFEED / KILL SCREENS
   ~300 lines
   ============================================================ */
function updateScoreUI() {
  const sy = $('scoreYou'); if (sy) sy.textContent = G.score.you;
  const se = $('scoreEnemy'); if (se) se.textContent = G.score.enemy;
  const hr = $('hudRound'); if (hr) hr.textContent = `ROUND ${G.round}`;
  sendNet({t:'score', you:G.score.you, enemy:G.score.enemy});
}
window.updateScoreUI = updateScoreUI;

function onKill(target, head, weapon) {
  Audio.kill();
  G.stats.kills++;
  G.stats.currentMulti++;
  if (G.stats.currentMulti > 1) G.stats.multiKills++;
  G.stats.killsHistory.push({t:performance.now(), weapon:weapon||G.player.weapon});
  // track multi-kill
  const now = performance.now();
  if (G.stats.currentMulti >= 2 && now - G.lastKillTime < 4000) {
    const m = G.stats.currentMulti;
    if (m === 2) { Audio.multikill(); showKillBanner('DOUBLE KILL', 2000); }
    else if (m === 3) { Audio.multikill(); showKillBanner('TRIPLE KILL', 2000); }
    else if (m === 4) { Audio.multikill(); showKillBanner('QUAD KILL', 2000); }
    else if (m >= 5) { Audio.ace(); showKillBanner('ACE!', 2500); }
  }
  G.lastKillTime = now;
  addKillfeed('YOU', target.name, WEAPONS[G.player.weapon].name, head);
  $('ksKiller').textContent = 'YOU ELIMINATED ' + target.name;
  $('ksWeapon').textContent = (head ? '[HEADSHOT] ' : '') + 'WITH ' + WEAPONS[G.player.weapon].name;
  $('killScreen').classList.add('show');
  G.phase = 'dead';
  if (G.playerAbil) G.playerAbil.ultPoints = Math.min(8, G.playerAbil.ultPoints + 1);
  sendNet({t:'abilityState', state:G.playerAbil});
  checkAchievements();
  saveStats();
  setTimeout(() => {
    $('killScreen').classList.remove('show');
    startSpectating();
  }, 2500);
}
function onKilledBy(killer, weapon, head) {
  G.stats.deaths++;
  G.stats.currentMulti = 0;
  addKillfeed(killer, 'YOU', (WEAPONS[weapon] || WEAPONS.vandal).name, head);
  $('ksKiller').textContent = 'KILLED BY ' + killer;
  $('ksWeapon').textContent = (head ? '[HEADSHOT] ' : '') + 'WITH ' + (WEAPONS[weapon] || WEAPONS.vandal).name;
  $('killScreen').classList.add('show');
  G.phase = 'dead';
  Audio.hitTaken();
  // phoenix ult: respawn at mark
  if (G.playerAbil && G.playerAbil.markPos && G.myAgent === 'phoenix') {
    G.player.setPos(G.playerAbil.markPos.x, G.playerAbil.markPos.y, G.playerAbil.markPos.z);
    G.player.alive = true; G.player.hp = 100;
    G.playerAbil.markPos = null;
    $('killScreen').classList.remove('show');
    G.phase = 'playing';
    G.killstreak = 0;
    speak('I came back!');
    return;
  }
  setTimeout(() => {
    $('killScreen').classList.remove('show');
    startSpectating();
  }, 2500);
}
function startSpectating() {
  G.spectating = true;
  $('spectateScreen').classList.add('show');
  $('specName').textContent = G.enemy ? G.enemy.name : 'ENEMY';
  setTimeout(() => {
    $('spectateScreen').classList.remove('show');
    G.spectating = false;
    respawnPlayer();
  }, 3500);
}
function respawnPlayer() {
  if (G.player) {
    const mapName = G.map;
    const isHostSide = (G.isHost || G.mode === 'bot');
    const spawns = SPAWNS[mapName] || SPAWNS.ascent;
    const ownSpawns = spawns.filter(s => isHostSide ? s.x < 0 : s.x > 0);
    const sp = ownSpawns[Math.floor(Math.random() * ownSpawns.length)] || spawns[0];
    G.player.setPos(sp.x, FPC.height, sp.z);
    G.player.hp = 100; G.player.alive = true; G.player.armor = 0;
    const yawTarget = isHostSide ? Math.atan2(-sp.x, -sp.z) : Math.atan2(-sp.x, -sp.z);
    G.player.mesh.rotation.set(0, yawTarget, 0);
    FPC.yaw = yawTarget; FPC.pitch = 0;
    $('hpFill').style.width = '100%';
    $('hpArmor').style.width = '0%';
    $('hpText').textContent = '100 / 100';
  }
  G.phase = 'playing';
  G.killstreak = 0;
}
function checkRoundEnd() {
  if (G.score.you >= G.ft) { G.stats.roundsWon++; G.stats.matches++; saveStats(); checkAchievements(); endMatch(); return; }
  if (G.score.enemy >= G.ft) { endMatch(); return; }
  setTimeout(() => startRound(), 1500);
}
function startRound() {
  G.round++;
  G.roundTimer = G.roundTime;
  G.score.you = 0; G.score.enemy = 0;
  G.spikePlanted = false; G.spikeTimer = 0; G.defusing = false;
  $('spikeHud').classList.remove('active');
  $('spikeIcon').classList.remove('active');
  $('defuseBtn').classList.remove('active');
  if (G.player) {
    G.player.setWeapon('classic');
    G.player.hp = 100; G.player.alive = true; G.player.armor = 0;
    G.player.ammo = WEAPONS.classic.mag;
    G.player.reserve = WEAPONS.classic.reserve;
  }
  if (G.enemy) {
    G.enemy.setWeapon('classic');
    G.enemy.hp = 100; G.enemy.alive = true; G.enemy.armor = 0;
    G.enemy.ammo = WEAPONS.classic.mag;
    G.enemy.reserve = WEAPONS.classic.reserve;
  }
  if (G.playerAbil) G.playerAbil.refundAll();
  $('hpFill').style.width = '100%';
  $('hpArmor').style.width = '0%';
  $('hpText').textContent = '100 / 100';
  respawnPlayer();
  $('roundScreen').classList.remove('show');
  Audio.roundStart();
  announce(`ROUND ${G.round}`);
  updateScoreUI();
  $('hudAmmo').textContent = G.player.ammo;
  $('hudReserve').textContent = G.player.reserve;
  $('hudWeapon').textContent = 'CLASSIC';
  // start buy phase
  if (G.round > 1 || G.mode === 'online') startBuyPhase();
}
function endMatch() {
  G.phase = 'round';
  G.replay.recording = []; // stop recording
  const won = G.score.you >= G.ft;
  $('rsTitle').textContent = won ? 'VICTORY' : 'DEFEAT';
  $('rsTitle').className = 'rs-title ' + (won ? 'win' : 'lose');
  $('rsScore').textContent = `${G.score.you} - ${G.score.enemy}`;
  $('rsTip').textContent = won ? '+ 200 RR · MATCH COMPLETE' : 'TRY AGAIN · BETTER LUCK NEXT TIME';
  $('roundScreen').classList.add('show');
  Audio.roundEnd();
  if (won) speak('Victory!');
  else speak('Defeat.');
  setTimeout(() => showStats(), 3500);
}
function endRound(reason) {
  G.phase = 'round';
  $('rsTitle').textContent = reason === 'win' ? 'ROUND WON' : 'ROUND LOST';
  $('rsTitle').className = 'rs-title ' + (reason === 'win' ? 'win' : 'lose');
  $('rsScore').textContent = `${G.score.you} - ${G.score.enemy}`;
  $('roundScreen').classList.add('show');
  Audio.roundEnd();
  setTimeout(() => checkRoundEnd(), 3000);
}
window.onKill = onKill;
window.onKilledBy = onKilledBy;
window.startSpectating = startSpectating;
window.respawnPlayer = respawnPlayer;
window.checkRoundEnd = checkRoundEnd;
window.startRound = startRound;
window.endMatch = endMatch;
window.endRound = endRound;

/* ============================================================
   MINIMAP
   ~80 lines
   ============================================================ */
function drawMinimap() {
  const cnv = $('minimapCanvas'); if (!cnv) return;
  const ctx = cnv.getContext('2d');
  const W = cnv.width, H = cnv.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,70,85,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(2, 2, W-4, H-4);
  if (G.world) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    const range = 80;
    for (const c of G.world.colliders) {
      const x = (c.minX + range/2) / range * W, y = (c.maxZ + range/2) / range * H;
      const w = (c.maxX - c.minX) / range * W, h = (c.maxZ - c.minZ) / range * H;
      if (x < W && y < H && x+w > 0 && y+h > 0) ctx.fillRect(x, y, w, h);
    }
  }
  if (G.player) {
    const x = (G.player.position.x + 40) / 80 * W, y = (G.player.position.z + 40) / 80 * H;
    ctx.fillStyle = '#00ff7f';
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#00ff7f'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.sin(FPC.yaw)*12, y + Math.cos(FPC.yaw)*12);
    ctx.stroke();
  }
  if (G.enemy) {
    const x = (G.enemy.position.x + 40) / 80 * W, y = (G.enemy.position.z + 40) / 80 * H;
    ctx.fillStyle = '#ff4655';
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#ff4655'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.sin(G.enemy.yaw)*12, y + Math.cos(G.enemy.yaw)*12);
    ctx.stroke();
  }
  if (G.spikePlanted && G.spikePos) {
    const x = (G.spikePos.x + 40) / 80 * W, y = (G.spikePos.z + 40) / 80 * H;
    ctx.fillStyle = '#ff4655';
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#ff4655'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI*2); ctx.stroke();
  }
}
window.drawMinimap = drawMinimap;

/* ============================================================
   ABILITY UI UPDATER
   ~100 lines
   ============================================================ */
function updateAbilityUI() {
  if (!G.playerAbil) return;
  const def = AGENTS[G.myAgent]; if (!def) return;
  const root = $('hudAbilities');
  if (!root) return;
  if (root.children.length !== 4) {
    root.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const ab = def.abilities[i];
      const d = document.createElement('div'); d.className = 'hud-ab';
      d.innerHTML = `<div class="ai">${ab.icon}</div><div class="ak">${ab.key}</div><div class="charges">${i<3 ? G.playerAbil.charges[i] : (G.playerAbil.ultPoints + '/' + ab.ultPoints)}</div>`;
      d.addEventListener('click', () => useAbility(i));
      root.appendChild(d);
    }
  }
  for (let i = 0; i < 4; i++) {
    const ab = def.abilities[i];
    const el = root.children[i];
    if (!el) continue;
    const cd = G.playerAbil.cooldowns[i];
    const isUlt = i === 3;
    el.classList.toggle('ready', isUlt ? G.playerAbil.hasUlt() : G.playerAbil.charges[i] > 0 && cd <= 0);
    el.classList.toggle('cooldown', !isUlt && cd > 0);
    if (isUlt) el.querySelector('.charges').textContent = `${G.playerAbil.ultPoints}/${ab.ultPoints}`;
    else el.querySelector('.charges').textContent = G.playerAbil.charges[i];
  }
}
window.updateAbilityUI = updateAbilityUI;

/* ============================================================
   BUY PHASE
   ~200 lines
   ============================================================ */
const BUY_CATS = [
  { id: 'pistols', name: 'PISTOLS', items: ['classic','shorty','ghost','sheriff'] },
  { id: 'smgs', name: 'SMGS', items: ['stinger','spectre'] },
  { id: 'shotguns', name: 'SHOTGUNS', items: ['bucky','judge'] },
  { id: 'rifles', name: 'RIFLES', items: ['vandal','phantom','bulldog','guardian'] },
  { id: 'snipers', name: 'SNIPERS', items: ['marshall','operator'] },
  { id: 'lmgs', name: 'LMGS', items: ['ares','odin'] },
  { id: 'armor', name: 'ARMOR', items: ['light','heavy'] },
];
let buyCat = 'rifles';
function startBuyPhase() {
  G.buyOpen = true;
  G.buyTimer = 30;
  $('buyMenu').classList.add('active');
  $('buyCredits').textContent = '$ ' + G.credits;
  renderBuy();
  setTimeout(() => {
    G.buyOpen = false;
    $('buyMenu').classList.remove('active');
    Audio.roundStart();
    // start recording
    REPLAY.startRecording();
  }, 30000);
}
function renderBuy() {
  const cats = $('buyCats'); if (!cats) return;
  cats.innerHTML = '';
  for (const c of BUY_CATS) {
    const b = document.createElement('button');
    b.className = 'buy-cat' + (c.id === buyCat ? ' active' : '');
    b.textContent = c.name;
    b.addEventListener('click', () => { buyCat = c.id; renderBuy(); });
    cats.appendChild(b);
  }
  const items = $('buyItems');
  items.innerHTML = '';
  const cat = BUY_CATS.find(c => c.id === buyCat);
  if (cat.id === 'armor') {
    for (const a of ['light','heavy']) {
      const ar = ARMOR[a];
      const d = document.createElement('div');
      d.className = 'buy-item' + (G.player.armor >= ar.armor ? ' owned' : '');
      d.innerHTML = `<div class="bi-name">${ar.name}</div><div class="bi-cost">$${ar.cost}</div><div class="bi-desc">+${ar.armor} ARMOR</div>`;
      d.addEventListener('click', () => buyArmor(a));
      items.appendChild(d);
    }
  } else {
    for (const w of cat.items) {
      const wp = WEAPONS[w];
      const owned = G.player.weapon === w;
      const d = document.createElement('div');
      d.className = 'buy-item' + (owned ? ' owned' : '');
      d.innerHTML = `<div class="bi-name">${wp.name}</div><div class="bi-cost">$${wp.cost || '—'}</div><div class="bi-desc">${wp.type.toUpperCase()}</div>`;
      d.addEventListener('click', () => buyWeapon(w));
      items.appendChild(d);
    }
  }
}
function buyWeapon(w) {
  const wp = WEAPONS[w];
  if (G.credits < wp.cost) { toast('NOT ENOUGH CREDITS'); Audio.error(); return; }
  if (G.player.weapon === w) { toast('ALREADY OWNED'); return; }
  G.credits -= wp.cost;
  G.player.setWeapon(w);
  Audio.buy();
  $('buyCredits').textContent = '$ ' + G.credits;
  $('hudWeapon').textContent = wp.name;
  $('hudAmmo').textContent = wp.mag;
  $('hudReserve').textContent = wp.reserve;
  renderBuy();
  toast('PURCHASED ' + wp.name);
  d.classList.add('buy-flash');
  setTimeout(() => d.classList.remove('buy-flash'), 400);
}
function buyArmor(a) {
  const ar = ARMOR[a];
  if (G.credits < ar.cost) { toast('NOT ENOUGH CREDITS'); Audio.error(); return; }
  if (G.player.armor >= ar.armor) { toast('ALREADY OWNED'); return; }
  G.credits -= ar.cost;
  G.player.armor = ar.armor;
  Audio.buy();
  $('buyCredits').textContent = '$ ' + G.credits;
  $('hpArmor').style.width = G.player.armor + '%';
  renderBuy();
  toast('PURCHASED ' + ar.name);
}
function buyAbility() {
  if (!G.playerAbil) return;
  const def = AGENTS[G.myAgent];
  for (let i = 0; i < 3; i++) {
    if (G.playerAbil.charges[i] >= (def.abilities[i].maxCharges || 0)) continue;
    if (G.credits >= def.abilities[i].cost) {
      G.credits -= def.abilities[i].cost;
      G.playerAbil.charges[i]++;
      Audio.buy();
      $('buyCredits').textContent = '$ ' + G.credits;
      toast('PURCHASED ' + def.abilities[i].name);
      return;
    }
  }
  toast('CANNOT BUY ABILITY');
}
window.startBuyPhase = startBuyPhase;
window.renderBuy = renderBuy;
window.buyWeapon = buyWeapon;
window.buyArmor = buyArmor;
window.buyAbility = buyAbility;

/* ============================================================
   SPIKE / BOMB SYSTEM
   ~150 lines
   ============================================================ */
function tryPlantSpike() {
  if (!G.spikeMode || G.spikePlanted || G.round < 1) return;
  if (G.player && G.enemy) {
    const dist = dist3D(G.player.position, G.enemy.position);
    if (G.world && G.world.spikeSpots && G.world.spikeSpots.length > 0) {
      let closestSpot = null, closestDist = Infinity;
      for (const s of G.world.spikeSpots) {
        const d = G.player.position.distanceTo(s);
        if (d < closestDist) { closestDist = d; closestSpot = s; }
      }
      if (closestSpot && closestDist < 8) {
        G.spikePlanted = true;
        G.spikeTimer = 45;
        G.spikePos = G.player.position.clone();
        $('spikeHud').classList.add('active');
        $('spikeIcon').classList.add('active');
        Audio.plant();
        sendNet({t:'plant', px:G.player.position.x, pz:G.player.position.z});
        toast('SPIKE PLANTED');
      }
    }
  }
}
function tryDefuseSpike() {
  if (!G.spikePlanted || !G.spikePos) return;
  if (G.player.position.distanceTo(G.spikePos) > 3) return;
  Audio.defuse();
  G.spikePlanted = false;
  $('spikeHud').classList.remove('active');
  $('spikeIcon').classList.remove('active');
  $('defuseBtn').classList.remove('active');
  G.score.you++; updateScoreUI();
  G.stats.roundsWon++;
  endRound('win');
  sendNet({t:'defuse'});
}
window.tryPlantSpike = tryPlantSpike;
window.tryDefuseSpike = tryDefuseSpike;

/* ============================================================
   SETTINGS / STATS / ACHIEVEMENTS SCREENS
   ~300 lines
   ============================================================ */
function openSettings() {
  $('settingsScreen').classList.add('show');
  $('setSens').value = G.settings.sens;
  $('setSensVal').textContent = G.settings.sens.toFixed(4);
  $('setFov').value = G.settings.fov;
  $('setFovVal').textContent = G.settings.fov;
  $('setVol').value = G.settings.vol;
  $('setVolVal').textContent = Math.round(G.settings.vol * 100) + '%';
  $('setAdsFov').value = G.settings.adsFov;
  $('setAdsFovVal').textContent = G.settings.adsFov;
  $('setChColor').value = G.settings.chColor;
  $('setChOutline').checked = G.settings.chOutline;
  $('setChDot').checked = G.settings.chDot;
  $('setChInner').value = G.settings.chInner;
  $('setChThick').value = G.settings.chThick;
  $('setChMove').checked = G.settings.chMove;
  updateCrosshair();
}
function saveSettingsFromUI() {
  G.settings.sens = parseFloat($('setSens').value);
  G.settings.fov = parseInt($('setFov').value);
  G.settings.vol = parseFloat($('setVol').value);
  G.settings.adsFov = parseInt($('setAdsFov').value);
  G.settings.chColor = $('setChColor').value;
  G.settings.chOutline = $('setChOutline').checked;
  G.settings.chDot = $('setChDot').checked;
  G.settings.chInner = parseInt($('setChInner').value);
  G.settings.chThick = parseFloat($('setChThick').value);
  G.settings.chMove = $('setChMove').checked;
  if (camera) { camera.fov = G.settings.fov; camera.updateProjectionMatrix(); }
  updateCrosshair();
  saveSettings();
}
function openAchievements() {
  $('achievementsScreen').classList.add('show');
  renderAchievements();
}
function renderAchievements() {
  const grid = $('achGrid'); if (!grid) return;
  grid.innerHTML = '';
  let unlocked = 0;
  for (const a of ACHIEVEMENTS) {
    const isUnlocked = !!G.achievements[a.id];
    if (isUnlocked) unlocked++;
    const d = document.createElement('div');
    d.className = 'ach-item' + (isUnlocked ? ' unlocked' : '');
    d.innerHTML = `<div class="ach-icon">${isUnlocked ? a.icon : '🔒'}</div>
                   <div class="ach-name">${a.name}</div>
                   <div class="ach-desc">${a.desc}</div>`;
    grid.appendChild(d);
  }
  $('achUnlocked').textContent = unlocked;
  $('achTotal').textContent = ACHIEVEMENTS.length;
}
function showStats() {
  $('roundScreen').classList.remove('show');
  G.phase = 'menu';
  const s = G.stats;
  const adr = (s.kills + s.deaths) > 0 ? Math.floor(s.dmgDealt / (s.kills + s.deaths)) : 0;
  const hsPct = s.hits > 0 ? Math.floor(s.headshots / s.hits * 100) : 0;
  const acc = s.hits > 0 ? Math.floor(s.hits / (s.hits + s.bodyShots * 0 + s.kills * 0) * 100) : 0;
  $('statsBody').innerHTML = `
    <div class="stat-row"><span class="lbl">KILLS</span><span class="val">${s.kills}</span></div>
    <div class="stat-row"><span class="lbl">DEATHS</span><span class="val">${s.deaths}</span></div>
    <div class="stat-row"><span class="lbl">K/D RATIO</span><span class="val">${s.deaths ? (s.kills/s.deaths).toFixed(2) : s.kills}</span></div>
    <div class="stat-row"><span class="lbl">DAMAGE DEALT</span><span class="val">${s.dmgDealt}</span></div>
    <div class="stat-row"><span class="lbl">DAMAGE TAKEN</span><span class="val">${s.dmgTaken}</span></div>
    <div class="stat-row"><span class="lbl">ADR</span><span class="val">${adr}</span></div>
    <div class="stat-row"><span class="lbl">HEADSHOTS</span><span class="val">${s.headshots} (${hsPct}%)</span></div>
    <div class="stat-row"><span class="lbl">HS KILLS</span><span class="val">${s.headshotKills}</span></div>
    <div class="stat-row"><span class="lbl">ROUNDS WON</span><span class="val">${s.roundsWon}</span></div>
    <div class="stat-row"><span class="lbl">MATCHES</span><span class="val">${s.matches}</span></div>
  `;
  // damage over time graph
  const graph = $('statGraph');
  if (graph && s.killsHistory.length > 0) {
    graph.innerHTML = '';
    const maxDmg = 255;
    const recentKills = s.killsHistory.slice(-30);
    for (let i = 0; i < recentKills.length; i++) {
      const k = recentKills[i];
      const wp = WEAPONS[k.weapon] || WEAPONS.classic;
      const h = (wp.damage.body / maxDmg) * 80;
      const bar = document.createElement('div');
      bar.className = 'stat-bar';
      bar.style.height = h + 'px';
      bar.title = k.weapon;
      graph.appendChild(bar);
    }
  } else if (graph) {
    graph.innerHTML = '<div style="color:#768079;text-align:center;margin:auto">No data yet</div>';
  }
  $('statsScreen').classList.add('show');
}
window.openSettings = openSettings;
window.saveSettingsFromUI = saveSettingsFromUI;
window.openAchievements = openAchievements;
window.renderAchievements = renderAchievements;
window.showStats = showStats;

/* ============================================================
   CHAT
   ~40 lines
   ============================================================ */
function addChat(name, msg) {
  const log = $('chatLog'); if (!log) return;
  const d = document.createElement('div');
  d.className = 'chat-msg';
  d.innerHTML = `<span class="cn">${name}:</span> ${msg}`;
  log.appendChild(d);
  while (log.children.length > 50) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}
function sendChat() {
  const inp = $('chatInput');
  const msg = (inp.value || '').trim();
  if (!msg) return;
  addChat(G.myName, msg);
  sendNet({t:'chat', name:G.myName, msg});
  inp.value = '';
}
window.addChat = addChat;
window.sendChat = sendChat;

/* ============================================================
   AGENT SELECT UI
   ~150 lines
   ============================================================ */
function buildAgentList() {
  const list = $('agentList'); if (!list) return;
  list.innerHTML = '';
  Object.keys(AGENTS).forEach((k, idx) => {
    const a = AGENTS[k];
    const d = document.createElement('div');
    d.className = 'agent-card' + (G.myAgent === k ? ' active' : '');
    d.dataset.agent = k;
    d.innerHTML = `<div class="aname">${a.name}</div><div class="arole">${a.role}</div><div class="apick"></div>`;
    d.addEventListener('click', () => selectAgent(k));
    list.appendChild(d);
  });
}
function selectAgent(agent) {
  G.myAgent = agent;
  document.querySelectorAll('.agent-card').forEach(c => c.classList.toggle('active', c.dataset.agent === agent));
  const def = AGENTS[agent];
  if (!def) return;
  $('pName').textContent = def.name;
  $('pRole').textContent = def.role;
  $('pBio').textContent = def.bio;
  const ab = $('pAbilities');
  ab.innerHTML = '';
  def.abilities.forEach((a, i) => {
    const d = document.createElement('div');
    d.className = 'pab';
    d.innerHTML = `<div class="ak">${a.key}</div><div class="ai">${a.icon}</div><div class="alabel">${a.name}</div>`;
    d.title = a.desc;
    ab.appendChild(d);
  });
  drawPortrait(agent);
  $('lbAgent1').textContent = agent.toUpperCase();
  Audio.select();
}
window.buildAgentList = buildAgentList;
window.selectAgent = selectAgent;

/* ============================================================
   LEAVE MATCH / START MATCH
   ~200 lines
   ============================================================ */
function leaveMatch() {
  G.paused = false;
  $('pauseMenu').classList.remove('show');
  G.phase = 'menu';
  // cleanup
  for (let i = G.bullets.length-1; i >= 0; i--) removeBullet(i);
  for (let i = G.particles.length-1; i >= 0; i--) { scene.remove(G.particles[i].mesh); }
  G.particles = []; G.abilityFX = []; G.bullets = [];
  if (G.player) scene.remove(G.player.mesh);
  if (G.enemy) scene.remove(G.enemy.mesh);
  if (G.world) scene.remove(G.world.group);
  G.player = null; G.enemy = null; G.world = null;
  if (renderer) renderer.domElement.style.display = 'none';
  if (G.peer) { try { G.peer.destroy(); } catch(e) {} G.peer = null; }
  $('spikeHud').classList.remove('active');
  $('spikeIcon').classList.remove('active');
  $('defuseBtn').classList.remove('active');
  $('buyMenu').classList.remove('active');
  $('bladeStormOverlay').classList.remove('active');
  $('killScreen').classList.remove('show');
  $('roundScreen').classList.remove('show');
  $('spectateScreen').classList.remove('show');
  $('statsScreen').classList.remove('show');
  showScreen('mainMenu');
}
function startMatch() {
  console.log('[PROTOCOL] Starting match on', G.map, 'mode:', G.mode, 'agent:', G.myAgent);
  if (renderer) renderer.domElement.style.display = 'block';
  // cleanup previous
  if (G.world) { scene.remove(G.world.group); G.world = null; }
  for (let i = G.bullets.length-1; i >= 0; i--) removeBullet(i);
  for (let i = G.particles.length-1; i >= 0; i--) { scene.remove(G.particles[i].mesh); }
  G.particles = []; G.abilityFX = []; G.bullets = [];
  if (G.player) scene.remove(G.player.mesh);
  if (G.enemy) scene.remove(G.enemy.mesh);
  // build map
  G.world = buildMap(G.map);
  // create characters
  G.player = new Character(G.myName, AGENTS[G.myAgent].color, false);
  let enemyName, enemyAgent;
  if (G.mode === 'bot') {
    enemyName = 'BOT-' + (G.stats.matches + 1);
    const choices = Object.keys(AGENTS).filter(k => k !== G.myAgent);
    enemyAgent = choices[Math.floor(Math.random() * choices.length)];
  } else {
    enemyName = (G.conn && G.conn.metadata && G.conn.metadata.name) || 'ENEMY';
    enemyAgent = (G.conn && G.conn.metadata && G.conn.metadata.agent) || 'jett';
  }
  G.enemyAgent = enemyAgent;
  G.enemy = new Character(enemyName, AGENTS[enemyAgent].color, true);
  scene.add(G.player.mesh);
  scene.add(G.enemy.mesh);
  G.playerAbil = new AbilityState(G.myAgent);
  G.enemyAbil = new AbilityState(enemyAgent);
  G.enemyAbil.ultPoints = 4;
  // spawn positions
  const mapName = G.map;
  const spawns = SPAWNS[mapName] || SPAWNS.ascent;
  const isHostSide = (G.isHost || G.mode === 'bot');
  const ownSpawns = spawns.filter(s => isHostSide ? s.x < 0 : s.x > 0);
  const enemySpawns = spawns.filter(s => isHostSide ? s.x > 0 : s.x < 0);
  const pStart = ownSpawns[Math.floor(Math.random() * ownSpawns.length)] || spawns[0];
  const eStart = enemySpawns[Math.floor(Math.random() * enemySpawns.length)] || spawns[spawns.length-1];
  G.player.setPos(pStart.x, FPC.height, pStart.z);
  G.enemy.setPos(eStart.x, FPC.height, eStart.z);
  const pYaw = Math.atan2(-pStart.x, -pStart.z);
  const eYaw = Math.atan2(-eStart.x, -eStart.z);
  G.player.setYawPitch(pYaw, 0);
  G.enemy.setYawPitch(eYaw, 0);
  FPC.yaw = pYaw; FPC.pitch = 0;
  FPC.vel.set(0, 0, 0); FPC.onGround = true;
  G.player.setWeapon('classic');
  G.enemy.setWeapon('classic');
  if (G.mode === 'bot') BOT.init();
  G.credits = 800;
  G.score = { you: 0, enemy: 0 };
  G.round = 1;
  G.roundTimer = G.roundTime;
  G.stats = { kills: 0, deaths: 0, dmgDealt: 0, dmgTaken: 0, hits: 0, headshots: 0, bodyShots: 0, legShots: 0, roundsWon: 0, matches: G.stats.matches, headshotKills: 0, multiKills: 0, currentMulti: 0, killsHistory: [] };
  updateScoreUI();
  G.phase = 'playing';
  showScreen('hud');
  $('hudAbilities').innerHTML = '';
  $('hudAmmo').textContent = G.player.ammo;
  $('hudReserve').textContent = G.player.reserve;
  $('hudWeapon').textContent = 'CLASSIC';
  $('hpArmor').style.width = '0%';
  $('hpFill').style.width = '100%';
  $('hpText').textContent = '100 / 100';
  announce('ROUND 1');
  Audio.roundStart();
  updateCrosshair();
  if (G.mode === 'online') {
    setTimeout(() => renderer.domElement.requestPointerLock(), 300);
  } else {
    setTimeout(() => renderer.domElement.requestPointerLock(), 300);
  }
  // first round: 15s buy phase
  startBuyPhase();
  // start replay recording
  REPLAY.startRecording();
}
window.leaveMatch = leaveMatch;
window.startMatch = startMatch;

/* ============================================================
   MAIN GAME LOOP
   ~200 lines
   ============================================================ */
let lastTime = 0;
let frameCount = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min((t - lastTime) / 1000, 0.05);
  lastTime = t;
  frameCount++;
  if (!scene || !camera) return;
  // always update FPC if playing
  if (G.phase === 'playing') FPC.update(dt);
  if (G.player) G.player.update(dt);
  if (G.enemy) G.enemy.update(dt);
  if (G.mode === 'bot' && G.phase === 'playing' && G.enemy && G.enemy.alive) BOT.update(dt);
  updateBullets(dt);
  updateParticles(dt);
  if (G.phase === 'playing') processAbilityFX(dt);
  if (G.playerAbil) {
    for (let i = 0; i < 3; i++) {
      if (G.playerAbil.cooldowns[i] > 0) G.playerAbil.cooldowns[i] = Math.max(0, G.playerAbil.cooldowns[i] - dt);
    }
  }
  // player invuln
  if (G.playerAbil && G.playerAbil.invulnUntil > performance.now()) {
    G.player.mesh.visible = Math.floor(performance.now() / 100) % 2 === 0;
  } else if (G.player && G.player.mesh) {
    G.player.mesh.visible = true;
  }
  // round timer
  if (G.phase === 'playing') {
    G.roundTimer -= dt;
    if (G.spikePlanted) {
      G.spikeTimer -= dt;
      const st = $('spikeTimer'); if (st) st.textContent = Math.max(0, Math.floor(G.spikeTimer));
      // tick sound
      if (Math.floor(G.spikeTimer) !== Math.floor(G.spikeTimer + dt)) Audio.spikeTick();
      if (G.spikeTimer <= 0) {
        G.spikePlanted = false;
        $('spikeHud').classList.remove('active');
        $('spikeIcon').classList.remove('active');
        G.score.enemy++; updateScoreUI();
        endRound('lose');
      }
    }
    if (G.buyTimer > 0) {
      G.buyTimer -= dt;
      const bt = $('buyTimer'); if (bt) bt.textContent = Math.max(0, Math.floor(G.buyTimer));
    }
    if (G.roundTimer <= 0 && !G.buyOpen) { G.roundTimer = 0; checkRoundEnd(); }
    const min = Math.floor(G.roundTimer / 60), sec = Math.floor(G.roundTimer % 60);
    const ht = $('hudTimer'); if (ht) ht.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
  }
  // player shoot
  if (G.phase === 'playing' && G.mouse.down && G.player && G.player.alive && !G.buyOpen) {
    const w = G.player.weapon;
    const wpn = WEAPONS[w];
    const now = performance.now();
    if (G.player.ammo > 0 && G.player.reloading <= 0 && now - G.player.lastShot > wpn.fireRate * 1000) {
      G.player.lastShot = now; G.player.ammo--; G.player.shotsSinceReset++;
      FPC.pitch += wpn.recoil * 0.5;
      FPC.yaw += (Math.random() - 0.5) * wpn.recoil;
      // recoil pattern
      const pattern = wpn.recoilPattern || [0];
      const idx = G.player.shotsSinceReset % pattern.length;
      FPC.yaw += pattern[idx] * 0.005;
      // dir with spread
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const spread = wpn.spread + (G.player.shotsSinceReset * 0.0008);
      dir.x += (Math.random() - 0.5) * spread;
      dir.y += (Math.random() - 0.5) * spread;
      dir.z += (Math.random() - 0.5) * spread;
      dir.normalize();
      const origin = G.player.position.clone().add(new THREE.Vector3(0, 1.5, 0));
      spawnBullet(origin, dir, G.player, w, false);
      sendNet({t:'shoot', ox:origin.x, oy:origin.y, oz:origin.z, dx:dir.x, dy:dir.y, dz:dir.z, w});
      const aud = wpn.audio || 'shoot';
      if (Audio[aud]) Audio[aud]();
      if (G.player.shotsSinceReset > (wpn.recoilPattern ? wpn.recoilPattern.length : 10)) G.player.shotsSinceReset = 0;
      $('hudAmmo').textContent = G.player.ammo;
      $('hudReserve').textContent = G.player.reserve;
    } else if (G.player.ammo <= 0 && G.player.reloading <= 0) G.player.reloading = wpn.reload;
  }
  // network state replication
  if (G.phase === 'playing' && G.mode === 'online') {
    sendNet({
      t: 'state',
      px: G.player.position.x, py: G.player.position.y, pz: G.player.position.z,
      vx: FPC.vel.x, vy: FPC.vel.y, vz: FPC.vel.z,
      yaw: FPC.yaw, pitch: FPC.pitch,
      alive: G.player.alive, hp: G.player.hp,
      ammo: G.player.ammo, reserve: G.player.reserve,
      weapon: G.player.weapon, armor: G.player.armor
    });
    if (G.playerAbil) sendNet({t:'abilityState', state: G.playerAbil});
  }
  if (G.damageFlash > 0) { G.damageFlash -= dt; if (G.damageFlash <= 0) $('damageVignette').classList.remove('show'); }
  // record replay
  if (G.phase === 'playing' && REPLAY && !REPLAY.playing) REPLAY.recordFrame();
  if (REPLAY && REPLAY.playing) REPLAY.update(dt);
  drawMinimap();
  updateAbilityUI();
  // re-render buy credits
  if (G.buyOpen) {
    const bc = $('buyCredits');
    if (bc) bc.textContent = '$ ' + G.credits;
  }
  if (renderer) renderer.render(scene, camera);
}
window.loop = loop;

/* ============================================================
   INPUT HANDLERS
   ~250 lines
   ============================================================ */
function setupInput() {
  window.addEventListener('keydown', e => {
    G.keys[e.code] = true;
    if (e.code === 'Escape') {
      if (G.phase === 'playing' && !G.buyOpen) {
        G.paused = !G.paused;
        if (G.paused) {
          $('pauseMenu').classList.add('show');
          try { document.exitPointerLock(); } catch(e) {}
        } else {
          $('pauseMenu').classList.remove('show');
          try { renderer.domElement.requestPointerLock(); } catch(e) {}
        }
      } else if (G.phase === 'agent' || G.phase === 'online') {
        showScreen('mainMenu'); G.phase = 'menu';
        if (G.peer) { try { G.peer.destroy(); } catch(e) {} G.peer = null; }
      } else if (G.phase === 'lobby') {
        $('lbBack').click();
      } else if (G.phase === 'playing' && G.buyOpen) {
        G.buyOpen = false;
        $('buyMenu').classList.remove('active');
      }
    }
    if (G.phase === 'playing' && !G.paused) {
      if (e.code === 'KeyR' && G.player && G.player.reloading <= 0) {
        const w = G.player.weapon;
        if (WEAPONS[w] && WEAPONS[w].mag > 0) G.player.reloading = WEAPONS[w].reload;
        sendNet({t:'reload'});
      }
      // weapon switch
      const wmap = { Digit1:'classic', Digit2:'shorty', Digit3:'ghost', Digit4:'sheriff', Digit5:'stinger', Digit6:'spectre', KeyQ:'bucky', KeyW:'judge', KeyE:'bulldog', KeyR:'vandal', KeyT:'phantom' };
      if (wmap[e.code]) {
        G.player.setWeapon(wmap[e.code]);
        $('hudWeapon').textContent = WEAPONS[wmap[e.code]].name;
        $('hudAmmo').textContent = G.player.ammo;
        $('hudReserve').textContent = G.player.reserve;
      }
      if (e.code === 'Digit7') { G.player.setWeapon('marshall'); $('hudWeapon').textContent='MARSHALL'; $('hudAmmo').textContent=G.player.ammo; $('hudReserve').textContent=G.player.reserve; }
      if (e.code === 'Digit8') { G.player.setWeapon('operator'); $('hudWeapon').textContent='OPERATOR'; $('hudAmmo').textContent=G.player.ammo; $('hudReserve').textContent=G.player.reserve; }
      if (e.code === 'Digit9') { G.player.setWeapon('ares'); $('hudWeapon').textContent='ARES'; $('hudAmmo').textContent=G.player.ammo; $('hudReserve').textContent=G.player.reserve; }
      if (e.code === 'Digit0') { G.player.setWeapon('odin'); $('hudWeapon').textContent='ODIN'; $('hudAmmo').textContent=G.player.ammo; $('hudReserve').textContent=G.player.reserve; }
      if (e.code === 'KeyV') {
        G.player.setWeapon('melee');
        $('hudWeapon').textContent = 'KNIFE';
        $('hudAmmo').textContent = '∞';
        $('hudReserve').textContent = '';
      }
      // abilities
      const idx = ABIL_KEYS.indexOf(e.code);
      if (idx >= 0) useAbility(idx);
      // buy phase
      if (e.code === 'KeyB' && G.buyOpen) buyAbility();
      // spike
      if (e.code === 'KeyE' && G.spikePlanted) tryDefuseSpike();
      if (e.code === 'KeyE' && !G.spikePlanted) tryPlantSpike();
    }
    if (G.phase === 'agent') {
      const k = AGENT_KEYS.indexOf(e.code);
      if (k >= 0 && AGENTS[Object.keys(AGENTS)[k]]) selectAgent(Object.keys(AGENTS)[k]);
    }
    if (G.phase === 'lobby' && e.code === 'Enter') {
      $('chatInput').focus();
    }
  });
  window.addEventListener('keyup', e => { G.keys[e.code] = false; });
  if (renderer && renderer.domElement) {
    renderer.domElement.addEventListener('mousedown', e => { if (e.button === 0) G.mouse.down = true; });
    renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
  }
  window.addEventListener('mouseup', e => { if (e.button === 0) G.mouse.down = false; });
  // defuse button
  const db = $('defuseBtn');
  if (db) db.addEventListener('click', tryDefuseSpike);
  // replay controls
  const rplay = $('replayPlay');
  if (rplay) rplay.addEventListener('click', () => { if (REPLAY.playing) REPLAY.stopPlayback(); else REPLAY.startPlayback(); });
  const rstop = $('replayStop');
  if (rstop) rstop.addEventListener('click', leaveMatch);
  const rscrub = $('replayScrub');
  if (rscrub) rscrub.addEventListener('input', e => { REPLAY.time = (parseFloat(e.target.value) / 100) * REPLAY.maxTime; });
}
window.setupInput = setupInput;

/* ============================================================
   UI WIRING (THE CRITICAL PART - all button clicks)
   ~400 lines
   ============================================================ */
function setupUI() {
  console.log('[PROTOCOL] Setting up UI...');
  // Main menu
  $('playOnlineBtn').addEventListener('click', () => {
    Audio.click();
    G.myName = ($('nameInput') ? $('nameInput').value : 'PLAYER1') || 'PLAYER1';
    G.myName = G.myName.toUpperCase();
    showScreen('onlineScreen');
    G.phase = 'online';
  });
  $('playBotBtn').addEventListener('click', () => {
    Audio.click();
    G.myName = ($('nameInput') ? $('nameInput').value : 'PLAYER1') || 'PLAYER1';
    G.myName = G.myName.toUpperCase();
    G.mode = 'bot';
    G.isHost = true;
    showScreen('agentSelect');
    G.phase = 'agent';
    buildAgentList();
    selectAgent(G.myAgent);
  });
  $('settingsBtn').addEventListener('click', () => {
    Audio.click();
    openSettings();
  });
  $('achievementsBtn').addEventListener('click', () => {
    Audio.click();
    openAchievements();
  });
  $('quitBtn').addEventListener('click', () => {
    Audio.click();
    if (confirm('Quit PROTOCOL?')) {
      try { window.close(); } catch(e) {}
      document.body.innerHTML = '<div style="color:#fff;padding:40px;font-family:sans-serif">Thanks for playing PROTOCOL.<br>You can close this tab.</div>';
    }
  });
  // Online screen
  $('osBack').addEventListener('click', () => { Audio.click(); showScreen('mainMenu'); G.phase = 'menu'; });
  $('osHost').addEventListener('click', () => {
    Audio.click();
    showScreen('agentSelect');
    G.phase = 'agent';
    G.mode = 'online';
    G.isHost = true;
    buildAgentList();
    selectAgent(G.myAgent);
  });
  $('osJoin').addEventListener('click', () => {
    Audio.click();
    $('osJoinPanel').classList.add('show');
  });
  $('osJoinGo').addEventListener('click', () => {
    const code = ($('osJoinCode') ? $('osJoinCode').value : '').trim().toUpperCase().replace(/^PRO-?/, '');
    if (!code) { toast('ENTER A LOBBY CODE'); Audio.error(); return; }
    G.myName = ($('nameInput') ? $('nameInput').value : 'PLAYER2') || 'PLAYER2';
    G.myName = G.myName.toUpperCase();
    showScreen('agentSelect');
    G.phase = 'agent';
    G.mode = 'online';
    G.isHost = false;
    buildAgentList();
    selectAgent(G.myAgent);
    G._joinCode = code;
  });
  // Agent select lock-in (THE CRITICAL BUTTON)
  $('lockBtn').addEventListener('click', () => {
    Audio.click();
    console.log('[PROTOCOL] Lock-in clicked, mode:', G.mode, 'isHost:', G.isHost);
    if (G.mode === 'bot') {
      // bot: skip lobby, go directly to match
      G.phase = 'playing';
      showScreen('hud');
      // ensure renderer is ready
      if (renderer) renderer.domElement.style.display = 'block';
      setTimeout(() => startMatch(), 50);
    } else if (G.isHost) {
      // host: go to lobby and start peer
      showScreen('lobbyScreen');
      G.phase = 'lobby';
      startHost();
    } else {
      // joiner: go to lobby, set name/agent, then connect
      showScreen('lobbyScreen');
      G.phase = 'lobby';
      $('lbName1').textContent = G.myName;
      $('lbAgent1').textContent = G.myAgent.toUpperCase();
      $('lbBadge1').textContent = 'GUEST';
      $('lbBadge1').style.background = 'rgba(110,126,255,.15)';
      $('lbBadge1').style.color = '#6e7eff';
      if (G._joinCode) {
        $('lobbyId').textContent = 'CONNECTING TO: ' + G._joinCode;
        $('lbStatus').textContent = 'Connecting...';
        setTimeout(() => joinHost(G._joinCode, G.myName, G.myAgent), 300);
      }
    }
  });
  // Lobby
  $('lbStart').addEventListener('click', () => {
    if (!G.conn) { toast('WAITING FOR OPPONENT'); Audio.error(); return; }
    $('lbStart').disabled = true;
    sendNet({t:'roundStart'});
    startMatch();
  });
  $('lbBack').addEventListener('click', () => {
    if (G.peer) { try { G.peer.destroy(); } catch(e) {} G.peer = null; }
    if (G.mode === 'online' && G.isHost) showScreen('agentSelect');
    else if (G.mode === 'online' && !G.isHost) showScreen('agentSelect');
    else showScreen('mainMenu');
    G.phase = G.mode === 'online' ? 'agent' : 'menu';
  });
  $('lobbyId').addEventListener('click', () => {
    if (G.lobbyId) {
      try { navigator.clipboard.writeText(G.lobbyId); } catch(e) {}
      toast('COPIED: ' + G.lobbyId);
    }
  });
  $('nameInput').addEventListener('input', e => { G.myName = e.target.value.toUpperCase(); const n = $('lbName1'); if (n) n.textContent = G.myName; });
  $('mapSelect').addEventListener('change', e => G.map = e.target.value);
  $('ftSelect').addEventListener('change', e => G.ft = parseInt(e.target.value));
  $('spikeSelect').addEventListener('change', e => G.spikeMode = e.target.value === 'on');
  // Chat
  $('chatSend').addEventListener('click', sendChat);
  $('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
  // Pause menu
  $('pmResume').addEventListener('click', () => {
    G.paused = false;
    $('pauseMenu').classList.remove('show');
    try { renderer.domElement.requestPointerLock(); } catch(e) {}
  });
  $('pmSettings').addEventListener('click', openSettings);
  $('pmStats').addEventListener('click', showStats);
  $('pmAchievements').addEventListener('click', openAchievements);
  $('pmQuit').addEventListener('click', leaveMatch);
  // Settings panel inputs
  $('setSens').addEventListener('input', e => { $('setSensVal').textContent = parseFloat(e.target.value).toFixed(4); });
  $('setFov').addEventListener('input', e => { $('setFovVal').textContent = e.target.value; });
  $('setVol').addEventListener('input', e => { $('setVolVal').textContent = Math.round(e.target.value * 100) + '%'; });
  $('setAdsFov').addEventListener('input', e => { $('setAdsFovVal').textContent = e.target.value; });
  ['setChColor','setChOutline','setChDot','setChInner','setChThick','setChMove'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', updateCrosshair);
  });
  $('settingsClose').addEventListener('click', () => { saveSettingsFromUI(); $('settingsScreen').classList.remove('show'); });
  $('statsClose').addEventListener('click', () => { $('statsScreen').classList.remove('show'); leaveMatch(); });
  $('achievementsClose').addEventListener('click', () => { $('achievementsScreen').classList.remove('show'); });
  $('buyClose').addEventListener('click', () => { G.buyOpen = false; $('buyMenu').classList.remove('active'); });
  console.log('[PROTOCOL] UI setup complete');
}
window.setupUI = setupUI;

/* ============================================================
   INIT - BOOT SEQUENCE
   ~100 lines
   ============================================================ */
function init() {
  console.log('[PROTOCOL] Initializing... v3.0.0');
  try {
    loadSettings();
    loadAchievements();
    loadStats();
  } catch(e) { console.error('Storage load failed', e); }
  // init three.js
  const ok = initThree();
  if (!ok) {
    document.body.innerHTML = '<div style="color:#fff;padding:40px;font-family:sans-serif;background:#0a0e13;height:100vh"><h1 style="color:#ff4655">WebGL Failed</h1><p>Your browser does not support WebGL. Try Chrome or Firefox.</p></div>';
    return;
  }
  FPC.init();
  setupInput();
  setupUI();
  buildAgentList();
  // boot sequence
  setTimeout(() => {
    const bs = $('bootScreen');
    if (bs) {
      bs.classList.add('hidden');
      setTimeout(() => {
        bs.classList.remove('active');
        bs.style.display = 'none';
        showScreen('mainMenu');
        G.phase = 'menu';
        updateCrosshair();
        console.log('[PROTOCOL] Boot complete, main menu shown');
      }, 800);
    }
  }, 3200);
  requestAnimationFrame(loop);
  console.log('[PROTOCOL] Init complete');
}
window.init = init;

console.log('[PROTOCOL] game-ui.js loaded');
