
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const hud = document.getElementById('hud');
  const startOv = document.getElementById('startOv');
  const shopOv = document.getElementById('shopOv');
  const shopCoins = document.getElementById('shopCoins');
  const shopList = document.getElementById('shopList');
  const continueBtn = document.getElementById('continueBtn');
  const tiltBtn = document.getElementById('tiltBtn');

  function vibrate(ms){ if(navigator.vibrate) navigator.vibrate(ms); }

  const store = {
    best: Number(localStorage.getItem('sd_best') || 0),
    coins: Number(localStorage.getItem('sd_coins') || 0),
    weapon: localStorage.getItem('sd_weapon') || 'single', // single->double->spread->laser
    levelUnlocked: Number(localStorage.getItem('sd_levelUnlocked') || 1)
  };
  function saveStore(){
    localStorage.setItem('sd_best', String(store.best));
    localStorage.setItem('sd_coins', String(store.coins));
    localStorage.setItem('sd_weapon', store.weapon);
    localStorage.setItem('sd_levelUnlocked', String(store.levelUnlocked));
  }

  // sizes
  function resize(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // difficulty
  let DIFF = 'easy';
  const diffCfg = {
    easy:   { enemySpeed: 110, enemyCount: 2, shootChance: 0.001, playerLives: 4 },
    medium: { enemySpeed: 140, enemyCount: 3, shootChance: 0.002, playerLives: 3 },
    hard:   { enemySpeed: 170, enemyCount: 4, shootChance: 0.003, playerLives: 2 },
  };

  // game state
  const SPEED = 240; // px/s
  const BULLET_SPEED = 520;
  const EN_BULLET_SPEED = 320;
  const PLAYER_R = 12;
  const ENEMY_R = 14;
  const STAR_R = 8;
  const COIN_R = 7;
  const POWER_R = 10;
  const BOSS_R = 26;
  const LEVELS = 15;

  let level = 1;
  let score = 0;
  let lives = 3;
  let invTimer = 0;
  let playing = false;
  let useTilt = false;

  const player = { x: canvas.width/2, y: canvas.height/2, dx: 1, dy: 0, bombs: 1 };
  const stars = [];
  const enemies = [];
  const bullets = [];
  const enemyBullets = [];
  const coins = [];
  const powers = [];
  let boss = null;
  const particles = [];

  // helpers
  function rand(min,max){ return Math.random()*(max-min)+min; }
  function ri(min,max){ return Math.floor(rand(min,max+1)); }
  function wrap(e,r){
    if(e.x < -r) e.x = canvas.width + r;
    if(e.x > canvas.width + r) e.x = -r;
    if(e.y < -r) e.y = canvas.height + r;
    if(e.y > canvas.height + r) e.y = -r;
  }
  function spawnParticle(x,y,color,count=12,sp=120){
    for(let i=0;i<count;i++){
      const a = rand(0,Math.PI*2);
      particles.push({x,y,vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life: 400, color});
    }
  }

  function resetLevel(){
    // increase unlock
    store.levelUnlocked = Math.max(store.levelUnlocked, level);
    saveStore();

    player.x = canvas.width/2; player.y = canvas.height/2;
    player.dx = 1; player.dy = 0;
    invTimer = 1200;
    enemies.length = 0;
    bullets.length = 0;
    enemyBullets.length = 0;
    coins.length = 0;
    stars.length = 0;
    powers.length = 0;
    particles.length = 0;
    boss = null;

    // stars to collect to finish non-boss levels
    const starsGoal = 2 + Math.floor(level/3);
    for(let i=0;i<starsGoal;i++){
      stars.push({x: rand(40, canvas.width-40), y: rand(40, canvas.height-40)});
    }

    // enemies
    const base = diffCfg[DIFF].enemyCount;
    const extra = Math.floor(level/2);
    for(let i=0;i<base+extra;i++){
      const type = ['chaser','patrol','shooter'][i%3];
      enemies.push({
        x: rand(20, canvas.width-20), y: rand(20, canvas.height-20),
        vx: (Math.random()<.5?-1:1) * diffCfg[DIFF].enemySpeed,
        vy: (Math.random()<.5?-1:1) * diffCfg[DIFF].enemySpeed,
        type
      });
    }

    // power-up chance
    if(Math.random() < 0.7){
      powers.push({x: rand(40, canvas.width-40), y: rand(40, canvas.height-40), kind: Math.random()<0.5?'shield':'bomb', ttl: 12000});
    }

    // boss every 5 levels
    if(level % 5 === 0){
      boss = {
        x: canvas.width*0.75, y: canvas.height*0.5, hp: 12 + level*2, phase: 0, t:0
      };
    }
  }

  function shoot(){
    const angle = Math.atan2(player.dy, player.dx);
    function addBullet(ax, ay, a){
      bullets.push({x: ax, y: ay, vx: Math.cos(a)*BULLET_SPEED, vy: Math.sin(a)*BULLET_SPEED, life: 1200});
    }
    const nx = player.x + Math.cos(angle)*(PLAYER_R+4);
    const ny = player.y + Math.sin(angle)*(PLAYER_R+4);
    if(store.weapon==='single'){
      addBullet(nx,ny,angle);
    }else if(store.weapon==='double'){
      addBullet(nx,ny,angle+0.08);
      addBullet(nx,ny,angle-0.08);
    }else if(store.weapon==='spread'){
      addBullet(nx,ny,angle);
      addBullet(nx,ny,angle+0.18);
      addBullet(nx,ny,angle-0.18);
    }else if(store.weapon==='laser'){
      // laser: longer life + faster
      bullets.push({x:nx,y:ny,vx:Math.cos(angle)*(BULLET_SPEED*1.2),vy:Math.sin(angle)*(BULLET_SPEED*1.2),life:1600, laser:true});
    }
    vibrate(10);
  }

  function bomb(){
    if(player.bombs<=0) return;
    player.bombs -= 1;
    spawnParticle(player.x, player.y, '#fff', 40, 200);
    enemies.length = 0;
    enemyBullets.length = 0;
    if(boss) boss.hp = Math.max(1, boss.hp - 8);
    vibrate([50,50,50]);
  }

  // input
  const keys = new Set();
  window.addEventListener('keydown', (e)=>{
    const k = e.key.toLowerCase();
    if(k===' '){ e.preventDefault(); shoot(); return; }
    if(k==='b'){ e.preventDefault(); bomb(); return; }
    keys.add(k);
    if(!playing) playing = true;
  });
  window.addEventListener('keyup', (e)=>keys.delete(e.key.toLowerCase()));

  // Mobile buttons
  document.querySelectorAll('.controls .btn').forEach(btn=>{
    const dir = btn.dataset.dir;
    const on = ()=>{
      if(dir==='up'){ player.dx=0; player.dy=-1; }
      if(dir==='down'){ player.dx=0; player.dy=1; }
      if(dir==='left'){ player.dx=-1; player.dy=0; }
      if(dir==='right'){ player.dx=1; player.dy=0; }
      playing = true;
    };
    btn.addEventListener('touchstart', e=>{ e.preventDefault(); on(); }, {passive:false});
  });
  const shootBtn = document.getElementById('shootBtn');
  const bombBtn = document.getElementById('bombBtn');
  shootBtn.addEventListener('touchstart', e=>{ e.preventDefault(); shoot(); }, {passive:false});
  bombBtn.addEventListener('touchstart', e=>{ e.preventDefault(); bomb(); }, {passive:false});

  // Tilt
  if(tiltBtn){
    tiltBtn.addEventListener('touchstart', async (e)=>{
      e.preventDefault();
      useTilt = !useTilt;
      if(useTilt && window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission){
        try{ await DeviceOrientationEvent.requestPermission(); }catch(err){ useTilt=false; }
      }
      tiltBtn.textContent = useTilt ? '🎯✓' : '🎯';
    }, {passive:false});
  }
  window.addEventListener('deviceorientation', (ev)=>{
    if(!useTilt) return;
    const gamma = ev.gamma || 0; // left-right
    const beta = ev.beta || 0;   // front-back
    const ax = Math.max(-1, Math.min(1, gamma/30));
    const ay = Math.max(-1, Math.min(1, beta/30));
    if(Math.abs(ax) > Math.abs(ay)){ player.dx = Math.sign(ax) || 1; player.dy = 0; }
    else { player.dy = Math.sign(ay) || 1; player.dx = 0; }
    playing = true;
  });

  // Start overlay difficulty
  startOv.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-diff]');
    if(!btn) return;
    DIFF = btn.dataset.diff;
    lives = diffCfg[DIFF].playerLives;
    startOv.style.display = 'none';
    playing = true;
    level = Math.max(1, store.levelUnlocked); // continue from unlocked if you want
    resetLevel();
  });

  // Shop items
  const shopItems = [
    { id:'w_double', name:'Weapon: Double Shot',  desc:'Two bullets per shot', cost: 40, action:()=>{ store.weapon='double'; } , available:()=>store.weapon==='single' },
    { id:'w_spread', name:'Weapon: Spread Shot',  desc:'Triple spread shot',   cost: 80, action:()=>{ store.weapon='spread'; } , available:()=>store.weapon==='double' },
    { id:'w_laser',  name:'Weapon: Laser Beam',   desc:'Fast, piercing beam',  cost:120, action:()=>{ store.weapon='laser'; } , available:()=>store.weapon==='spread' },
    { id:'bomb',     name:'+1 Bomb',              desc:'Clear screen / dmg boss', cost:30, action:()=>{ player.bombs+=1; }, available:()=>true },
    { id:'shield',   name:'Shield Boost',         desc:'Longer invulnerability',  cost:40, action:()=>{ invTimer+=2000; }, available:()=>true },
    { id:'heart',    name:'+1 Life',              desc:'Extra life',              cost:70, action:()=>{ lives+=1; }, available:()=>lives<6 },
  ];
  function renderShop(){
    shopCoins.textContent = `Coins: ${store.coins}`;
    shopList.innerHTML = '';
    shopItems.forEach(it=>{
      if(!it.available()) return;
      const row = document.createElement('div');
      row.className = 'shop-item';
      const left = document.createElement('div');
      left.innerHTML = `<div><strong>${it.name}</strong></div><div class="muted">${it.desc}</div>`;
      const right = document.createElement('div');
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `Buy (${it.cost})`;
      btn.onclick = ()=>{
        if(store.coins >= it.cost){
          store.coins -= it.cost;
          it.action();
          saveStore();
          renderShop();
          vibrate(20);
        }
      };
      right.appendChild(btn);
      row.appendChild(left); row.appendChild(right);
      shopList.appendChild(row);
    });
  }
  continueBtn.addEventListener('click', ()=>{
    shopOv.style.display='none';
    playing = true;
  });

  // controls from keys
  function updateDirFromKeys(){
    if(keys.has('arrowup') || keys.has('w')) { player.dx=0; player.dy=-1; }
    else if(keys.has('arrowdown') || keys.has('s')){ player.dx=0; player.dy=1; }
    else if(keys.has('arrowleft') || keys.has('a')){ player.dx=-1; player.dy=0; }
    else if(keys.has('arrowright') || keys.has('d')){ player.dx=1; player.dy=0; }
  }

  let last = performance.now();
  function loop(){
    const now = performance.now();
    const dt = Math.min(60, now-last);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function spawnCoin(x,y){
    coins.push({x,y,vx: rand(-20,20), vy: rand(-20,20), ttl: 6000});
  }

  function update(dt){
    // background starfield anim seed in draw()

    if(!startOv.style.display || startOv.style.display==='flex'){ return; }

    if(playing){
      updateDirFromKeys();
      const sec = dt/1000;

      // player move + wrap
      player.x += player.dx * SPEED * sec;
      player.y += player.dy * SPEED * sec;
      wrap(player, PLAYER_R+2);

      // bullets
      for(let i=bullets.length-1;i>=0;i--){
        const b = bullets[i];
        b.x += b.vx*sec; b.y += b.vy*sec; b.life -= dt;
        if(b.life<=0){ bullets.splice(i,1); continue; }
        wrap(b, 4);
      }

      // enemy bullets
      for(let i=enemyBullets.length-1;i>=0;i--){
        const b = enemyBullets[i];
        b.x += b.vx*sec; b.y += b.vy*sec; b.life -= dt;
        if(b.life<=0){ enemyBullets.splice(i,1); continue; }
        wrap(b, 4);
      }

      // enemies
      enemies.forEach((en, idx)=>{
        if(en.type==='chaser'){
          const a = Math.atan2(player.y-en.y, player.x-en.x);
          en.vx = Math.cos(a) * diffCfg[DIFF].enemySpeed * (0.9 + level*0.03);
          en.vy = Math.sin(a) * diffCfg[DIFF].enemySpeed * (0.9 + level*0.03);
        }else if(en.type==='patrol'){
          if(Math.random()<0.01) en.vx*=-1;
          if(Math.random()<0.01) en.vy*=-1;
        }else if(en.type==='shooter'){
          if(Math.random() < diffCfg[DIFF].shootChance + level*0.0005){
            const a = Math.atan2(player.y-en.y, player.x-en.x);
            enemyBullets.push({x: en.x, y: en.y, vx: Math.cos(a)*EN_BULLET_SPEED, vy: Math.sin(a)*EN_BULLET_SPEED, life: 2000});
          }
        }
        en.x += en.vx*sec; en.y += en.vy*sec;
        wrap(en, ENEMY_R+2);
      });

      // bullets vs enemies
      for(let i=enemies.length-1;i>=0;i--){
        const en = enemies[i];
        let hit = false;
        for(let j=bullets.length-1;j>=0;j--){
          const b = bullets[j];
          if((en.x-b.x)**2 + (en.y-b.y)**2 < (ENEMY_R+4)**2){
            bullets.splice(j,1); hit = true /* hit */
            spawnParticle(en.x,en.y,'#ff4d4d', 18, 150);
            if(Math.random()<0.6) spawnCoin(en.x,en.y);
            enemies.splice(i,1);
            score += 30;
            break;
          }
        }
      }

      // bullets vs boss
      if(boss){
        for(let j=bullets.length-1;j>=0;j--){
          const b = bullets[j];
          if((boss.x-b.x)**2 + (boss.y-b.y)**2 < (BOSS_R+6)**2){
            bullets.splice(j,1);
            boss.hp -= (store.weapon==='laser'?2:1);
            spawnParticle(boss.x,boss.y,'#fff', 10, 140);
            score += 5;
            if(boss.hp<=0){
              spawnParticle(boss.x,boss.y,'#ffd33d', 40, 220);
              store.coins += 30;
              saveStore();
              boss = null;
            }
          }
        }
      }

      // boss behaviour
      if(boss){
        boss.t += dt;
        // simple orbit/zigzag
        boss.x += Math.cos(boss.t*0.002) * 60 * (dt/1000);
        boss.y += Math.sin(boss.t*0.0018) * 40 * (dt/1000);
        // shoot rings
        if(Math.random()<0.02){
          for(let k=0;k<8;k++){
            const a = k*Math.PI/4 + boss.t*0.002;
            enemyBullets.push({x: boss.x, y: boss.y, vx: Math.cos(a)*EN_BULLET_SPEED*0.8, vy: Math.sin(a)*EN_BULLET_SPEED*0.8, life: 2200});
          }
        }
        wrap(boss, BOSS_R+4);
      }

      // collect stars (level objective)
      for(let i=stars.length-1;i>=0;i--){
        const s = stars[i];
        if((s.x-player.x)**2 + (s.y-player.y)**2 < (STAR_R+PLAYER_R)**2){
          stars.splice(i,1);
          score += 15;
          vibrate(15);
        }
      }

      // coins
      for(let i=coins.length-1;i>=0;i--){
        const c = coins[i];
        c.x += c.vx*(dt/1000); c.y += c.vy*(dt/1000);
        c.vx *= 0.98; c.vy *= 0.98; c.ttl -= dt;
        if(c.ttl<=0){ coins.splice(i,1); continue; }
        wrap(c, COIN_R+2);
        if((c.x-player.x)**2 + (c.y-player.y)**2 < (COIN_R+PLAYER_R)**2){
          coins.splice(i,1);
          store.coins += 5;
          saveStore();
          vibrate(10);
        }
      }

      // powerups
      for(let i=powers.length-1;i>=0;i--){
        const p = powers[i]; p.ttl -= dt;
        if(p.ttl<=0){ powers.splice(i,1); continue; }
        if((p.x-player.x)**2 + (p.y-player.y)**2 < (POWER_R+PLAYER_R)**2){
          if(p.kind==='shield'){ invTimer = Math.max(invTimer, 4000); }
          if(p.kind==='bomb'){ player.bombs += 1; }
          powers.splice(i,1);
          vibrate(20);
        }
      }

      // enemy bullets hit player
      if(invTimer>0) invTimer -= dt;
      if(invTimer<=0){
        for(const b of enemyBullets){
          if((b.x-player.x)**2 + (b.y-player.y)**2 < (PLAYER_R+5)**2){
            takeHit();
            break;
          }
        }
        for(const en of enemies){
          if((en.x-player.x)**2 + (en.y-player.y)**2 < (ENEMY_R+PLAYER_R)**2){
            takeHit();
            break;
          }
        }
        if(boss && ((boss.x-player.x)**2 + (boss.y-player.y)**2 < (BOSS_R+PLAYER_R)**2)){
          takeHit();
        }
      }

      // level complete?
      if(!boss && stars.length===0){
        level++;
        store.best = Math.max(store.best, score);
        saveStore();
        // open shop between levels
        playing = false;
        renderShop();
        shopOv.style.display='flex';
        resetLevel();
      }
      if(boss===null && level % 5 === 1){ /* boss defeated led to next */ }

      // win loop
      if(level>LEVELS){
        level = 1;
      }
    }

    hud.innerHTML = `Lvl ${level}/${LEVELS} — ${DIFF.toUpperCase()}<br>` +
                    `Score: ${score} (Best: ${store.best})<br>` +
                    `Lives: ${lives} — Bombs: ${player.bombs} — Coins: ${store.coins}<br>` +
                    (invTimer>0?`<span style="color:#6cf">Shield: ${(invTimer/1000).toFixed(1)}s</span>`:'') +
                    (!playing?`<br><span style="color:#ccc">Tap/press to start — Space to shoot, B to bomb</span>`:'');
  }

  function takeHit(){
    vibrate([80,40,80]);
    lives -= 1;
    spawnParticle(player.x,player.y,'#fff', 30, 200);
    if(lives<=0){
      // game over -> show start overlay again
      store.best = Math.max(store.best, score);
      saveStore();
      lives = diffCfg[DIFF].playerLives;
      score = 0;
      level = 1;
      player.bombs = 1;
      startOv.style.display='flex';
      playing = false;
    }else{
      // respawn with invulnerability
      player.x = canvas.width/2; player.y = canvas.height/2;
      invTimer = 1500;
    }
  }

  // Draw helpers
  function drawShip(x,y,dx,dy,r,color){
    const ang = Math.atan2(dy,dx);
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(ang);
    // body
    ctx.beginPath();
    ctx.moveTo(r,0);
    ctx.lineTo(-r*0.7, r*0.6);
    ctx.lineTo(-r*0.4, 0);
    ctx.lineTo(-r*0.7, -r*0.6);
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    // thruster
    ctx.beginPath();
    ctx.moveTo(-r*0.7,0);
    ctx.lineTo(-r, r*0.25);
    ctx.lineTo(-r, -r*0.25);
    ctx.closePath();
    ctx.fillStyle = '#ff8'; ctx.fill();
    ctx.restore();
  }

  function drawStar(x,y,r){
    ctx.save(); ctx.translate(x,y);
    ctx.fillStyle = '#ffd33d';
    ctx.beginPath();
    for(let i=0;i<5;i++){
      const a = i*2*Math.PI/5 - Math.PI/2;
      ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
      const a2 = a + Math.PI/5;
      ctx.lineTo(Math.cos(a2)*r*0.5, Math.sin(a2)*r*0.5);
    }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  function draw(){
    // Scrolling background
    const t = performance.now()/1000;
    ctx.fillStyle = '#05060b'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#121425';
    for(let i=0;i<120;i++){
      const x = (i*73 + (t*40)) % canvas.width;
      const y = (i*97 + (t*22)) % canvas.height;
      ctx.fillRect(canvas.width-x, y, 2, 2);
    }

    // particles
    for(let i=particles.length-1;i>=0;i--){
      const p = particles[i];
      p.x += p.vx*(1/60); p.y += p.vy*(1/60); p.life -= 1000/60;
      ctx.globalAlpha = Math.max(0, p.life/400);
      ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 2, 2);
      ctx.globalAlpha = 1;
      if(p.life<=0) particles.splice(i,1);
    }

    // stars/coins/powers
    stars.forEach(s=> drawStar(s.x,s.y,STAR_R));
    ctx.fillStyle = '#ffd700'; coins.forEach(c=>{ ctx.beginPath(); ctx.arc(c.x,c.y,COIN_R,0,Math.PI*2); ctx.fill(); });
    powers.forEach(p=>{
      ctx.save(); ctx.translate(p.x,p.y);
      ctx.fillStyle = p.kind==='shield' ? '#6cf' : '#9f6';
      ctx.beginPath(); ctx.arc(0,0, POWER_R, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle='#000'; ctx.font='bold 12px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(p.kind==='shield'?'S':'B',0,1);
      ctx.restore();
    });

    // player/enemies/boss/bullets
    drawShip(player.x,player.y,player.dx,player.dy,PLAYER_R, invTimer>0?'#59d4ff':'#16b3ff');
    enemies.forEach(en=> drawShip(en.x,en.y,en.vx,en.vy,ENEMY_R,'#ff4d4d'));
    if(boss){
      ctx.save(); ctx.translate(boss.x,boss.y);
      ctx.fillStyle = '#ff6666'; ctx.beginPath(); ctx.arc(0,0,BOSS_R,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#000'; ctx.fillRect(-BOSS_R*0.6, -4, BOSS_R*1.2, 8);
      const hpFrac = Math.max(0, boss.hp / (12 + level*2));
      ctx.fillStyle = '#0f0'; ctx.fillRect(-BOSS_R*0.6, -4, BOSS_R*1.2*hpFrac, 8);
      ctx.restore();
    }
    ctx.fillStyle = '#fff'; bullets.forEach(b=>{ ctx.beginPath(); ctx.arc(b.x,b.y, b.laser?2:3, 0, Math.PI*2); ctx.fill(); });
    ctx.fillStyle = '#f66'; enemyBullets.forEach(b=>{ ctx.beginPath(); ctx.arc(b.x,b.y,3,0,Math.PI*2); ctx.fill(); });
  }

  // initial shop preload
  renderShop();
})();
