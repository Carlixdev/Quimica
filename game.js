(() => {
  'use strict';

  /* ==========================================================
     FINN Y LA FUENTE DE BURBUJAS
     ========================================================== */

  const $ = (selector) => document.querySelector(selector);
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');
  const overlay = $('#overlay');
  const card = $('#card');
  const mission = $('#mission');
  const materialsPanel = $('#materialsPanel');
  const stepLabel = $('#step');
  const taskLabel = $('#task');
  const hint = $('#hint');
  const FONT = '"Lucida Console", "Courier New", monospace';
  const TAU = Math.PI * 2;

  /* ---------- Configuración de sprites (editable / calibrable con la tecla G) ---------- */
  const SPRITE_KEY = 'finn-sprites-v2';
  const DEFAULT_SPRITES = {
    // Hoja de gatos: celdas de 16x16. rowRight / rowLeft = fila de caminar a la derecha / izquierda.
    cat: { frame: 16, frames: 8, rowRight: 5, rowLeft: 6, scale: 4, footPad: 1 },
    // Hoja del lobo: celdas de 88x88, normalmente 8 filas (una por dirección).
    wolf: { frame: 88, rowRight: 6, rowLeft: 2, scale: 2, footPad: 12 },
  };
  // FinnSprite.png: 28 cuadros de 32px. Idle 0-8, caminar 9-14, salto 15.
  const FINN_ANIM = { frame: 32, idle: [0, 8], walk: [9, 14], jump: 15 };

  function loadSpriteConfig() {
    const base = JSON.parse(JSON.stringify(DEFAULT_SPRITES));
    try {
      const saved = JSON.parse(localStorage.getItem(SPRITE_KEY) || 'null');
      if (saved) for (const key of ['cat', 'wolf']) Object.assign(base[key], saved[key] || {});
    } catch (error) { /* sin almacenamiento: se usan los valores por defecto */ }
    return base;
  }
  function saveSpriteConfig() {
    try { localStorage.setItem(SPRITE_KEY, JSON.stringify({ cat: { rowRight: spriteCfg.cat.rowRight, rowLeft: spriteCfg.cat.rowLeft }, wolf: { rowRight: spriteCfg.wolf.rowRight, rowLeft: spriteCfg.wolf.rowLeft } })); } catch (error) { /* ignorar */ }
  }
  const spriteCfg = loadSpriteConfig();

  /* ---------- Carga de assets tolerante: prueba varias rutas y nunca rompe el juego ---------- */
  const missingAssets = new Set();
  function assetImage(...candidates) {
    const list = candidates.flat();
    const image = new Image();
    image.ready = false; image.failed = false;
    let index = 0;
    const tryNext = () => {
      if (index >= list.length) {
        image.failed = true;
        if (!missingAssets.has(list[0])) { missingAssets.add(list[0]); console.warn('[assets] No se encontró:', list[0], '(se usa un dibujo de reemplazo)'); }
        return;
      }
      image.src = encodeURI(list[index++]);
    };
    image.onload = () => { image.ready = image.naturalWidth > 0; };
    image.onerror = tryNext;
    tryNext();
    return image;
  }
  const ok = (image) => !!(image && image.ready && image.naturalWidth > 0);
  const inDirs = (dirs, file) => dirs.map(dir => `${dir}/${file}`);

  const sprite = assetImage('FinnSprite.png');
  const catSprite = assetImage('assets/Free pack/cat 1.6.png', 'assets/Free pack/Cat 1.6.png', 'assets/Free pack/cat1.6.png', 'assets/cat 1.6.png');
  const wolfDirs = ['assets/Werewolf_Berserker_FREE/spritesheets', 'assets/Werewolf_Berserker_FREE/Spritesheets', 'assets/Werewolf_Berserker_FREE'];
  const wolfIdle = assetImage(inDirs(wolfDirs, 'idle.png'));
  const wolfClaw = assetImage(inDirs(wolfDirs, 'skill1_claw_combo.png'));
  const wolfWalk = assetImage(inDirs(wolfDirs, 'walk.png'), inDirs(wolfDirs, 'run.png'));
  const pepsiImg = assetImage('assets/Pepsi.png');

  const lushDirs = ['assets/Lush and Shrubs v1.3.3', 'assets/Lush and Shrubs'];
  const lush = (folders, name) => lushDirs.flatMap(base => folders.map(folder => `${base}/${folder}/${name}`));
  const environment = {
    bushes: ['bush12.png', 'bush16.png'].map(name => assetImage(lush(['bushes', 'bush'], name))),
    ferns: ['fern2.png', 'fern5.png'].map(name => assetImage(lush(['ferns', 'fern'], name))),
    flowers: ['flower3.png', 'flower8.png', 'flower14.png'].map(name => assetImage(lush(['flowers', 'flower'], name))),
    stones: ['stone2.png', 'stone6.png', 'stone9.png'].map(name => assetImage(lush(['stone', 'stones'], name))),
  };

  const cityDirs = ['assets/far city background', 'assets/parallax', 'assets/Far City', 'assets/far-city-background'];
  const fieldDirs = ['assets/stringstar fields', 'assets/stringstar-fields', 'assets/Stringstar Fields', 'assets/parallax'];
  const cityLayers = ['0.png', '-1.png', '-2.png', '-3.png', '-4.png', '-5.png'].map((file, index) => ({
    image: assetImage(inDirs(cityDirs, file)),
    speed: [0.035, 0.07, 0.13, 0.22, 0.31, 0.39][index],
    alpha: [0.34, 0.42, 0.52, 0.64, 0.38, 0.3][index],
  }));
  const citySunset = assetImage(inDirs(cityDirs, '-6.png'));
  const fieldLayers = [0, 1, 2].map(index => ({
    image: assetImage(inDirs(fieldDirs, `background_${index}.png`)),
    speed: [0.025, 0.07, 0.14][index],
  }));

  /* ---------- Mundo ---------- */
  const W = canvas.width, H = canvas.height, WORLD = 4000, FLOOR = 570;
  const DOCTOR_X = 3628, FOUNTAIN_X = 3830, WOLF_X = 2550;
  const levels = [
    { name: 'Valle del CO₂', start: 0, end: 1300, color: 'rgba(255, 190, 105, .11)', goal: 'Resuelve el acertijo del analizador para desbloquear Pepsi.' },
    { name: 'Cañón de las Mentas', start: 1300, end: 2700, color: 'rgba(91, 142, 190, .13)', goal: 'Resuelve el acertijo de la lupa y distrae al lobo guardián.' },
    { name: 'Observatorio del Jardín', start: 2700, end: WORLD, color: 'rgba(102, 164, 112, .12)', goal: 'Consigue las gafas, reúne las pistas y habla con la doctora.' },
  ];
  const keys = Object.create(null);
  const camera = { x: 0 };
  const player = { x: 95, y: FLOOR - 64, vx: 0, vy: 0, w: 60, h: 64, onGround: true, facing: 1 };
  const platforms = [
    { x: 0, y: FLOOR, w: WORLD, h: 200 }, { x: 340, y: 470, w: 140, h: 20 },
    { x: 560, y: 410, w: 140, h: 20 }, { x: 840, y: 470, w: 170, h: 20 },
    { x: 1100, y: 410, w: 170, h: 20 }, { x: 1430, y: 500, w: 180, h: 20 },
    { x: 1730, y: 430, w: 200, h: 20 }, { x: 2070, y: 480, w: 170, h: 20 },
    { x: 2320, y: 410, w: 175, h: 20 },
    // (se eliminó la plataforma que cruzaba el límite entre el cañón y el jardín: era invisible)
    { x: 2950, y: 425, w: 190, h: 20 }, { x: 3280, y: 490, w: 180, h: 20 },
  ];
  const notes = [
    ['PEPSI Y CO₂', 'La Pepsi contiene dióxido de carbono disuelto. Al abrirla, parte del gas puede escapar.'],
    ['MENTOS Y NUCLEACIÓN', 'Las pequeñas cavidades del Mentos ofrecen sitios donde las burbujas pueden empezar a formarse.'],
    ['HIPÓTESIS O EVIDENCIA', 'Una fuente espectacular no demuestra por sí sola que apareciera una sustancia nueva.'],
    ['ELIGE UN LUGAR SEGURO', 'Una demostración se prepara al aire libre, con supervisión adulta y el público a distancia.'],
    ['ANOTA LOS RESULTADOS', 'La bebida, su temperatura y el recipiente también afectan la altura y rapidez de la espuma.'],
  ];
  const items = [
    { x: 420, y: 438, type: 'nota', note: 0 }, { x: 1225, y: 378, type: 'nota', note: 1 },
    { x: 1830, y: 398, type: 'nota', note: 2 }, { x: 2435, y: 378, type: 'nota', note: 3 },
    { x: 3050, y: 393, type: 'nota', note: 4 },
  ];
  const challengeStations = [
    { x: 1040, name: 'ANALIZADOR CO₂', type: 'botella', riddle: 'cola', solved: false },
    { x: 2260, name: 'LUPA DE BURBUJAS', type: 'menta', riddle: 'mentos', solved: false },
    { x: 2870, name: 'CONTROL DE SEGURIDAD', type: 'gafa', riddle: 'gafas', solved: false },
  ];
  const cats = [
    { home: 610, name: 'MIMO', hue: 0, hints: () => hasCola ? 'Ya tienes la Pepsi. Cruza el portal verde al final del valle: el cañón te espera. Y si olvidas una pista, siempre puedes volver.' : 'El analizador pide identificar el gas que ya está disuelto en la bebida. Piensa en qué hay dentro de las burbujas.' },
    { home: 1765, name: 'PIXEL', hue: 70, hints: () => !hasMentos ? 'La lupa de burbujas está más adelante. Fíjate en la superficie rugosa del caramelo.' : !wolfDefeated ? 'El lobo guarda el portal. Habla con él y usa la lata vacía de Pepsi para distraerlo; no hace falta pelear.' : 'El portal está libre. Recuerda que puedes volver al valle si te faltó alguna pista.' },
    { home: 3160, name: 'NUBE', hue: 200, hints: () => !hasGoggles ? 'Antes de la fuente, resuelve el control de seguridad para conseguir las gafas.' : collectedNotes < 5 ? `Te faltan ${5 - collectedNotes} pistas del cuaderno. Algunas pueden estar en mapas anteriores.` : 'Lo tienes todo. Habla con la doctora Burbujas junto al observatorio.' },
  ];
  for (const cat of cats) Object.assign(cat, { x: cat.home, dir: 1, moving: true, pause: Math.random() * 2, seed: Math.random() * 10 });
  const wolf = { x: WOLF_X, state: 'guard', t0: 0, gone: false };
  const can = { active: false, t0: 0, x0: 0, y0: 0, x1: 2640, dur: 0.95 };

  const sortItems = [
    ['Sale espuma por la boca de la botella.', 'veo'],
    ['Se creó un gas nuevo al juntar los dos.', 'creo'],
    ['El chorro sube muy deprisa y la bandeja recoge la espuma.', 'veo'],
    ['El Mentos fabricó el CO₂ de la fuente.', 'creo'],
  ];

  /* ---------- Estado ---------- */
  let mode = 'intro', time = 0, last = 0, collectedNotes = 0, mistakes = 0;
  let inventoryItems = 0, hasCola = false, hasMentos = false, hasGoggles = false, wolfDefeated = false;
  let mapTraveling = false, activeRiddle = null;
  let particles = [], confetti = [], fireworks = [], toast = '', toastUntil = 0;
  let jumpQueued = false, uiKey = '';
  let demo = { start: 0, end: 0, running: false, fountain: false };
  let finale = { start: 0, total: 22, done: false, nextFirework: 0 };
  let labTab = 'wolf';

  /* ---------- Utilidades de dibujo ---------- */
  function rounded(x, y, w, h, radius, color) {
    ctx.fillStyle = color; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
    else { ctx.moveTo(x + radius, y); ctx.arcTo(x + w, y, x + w, y + h, radius); ctx.arcTo(x + w, y + h, x, y + h, radius); ctx.arcTo(x, y + h, x, y, radius); ctx.arcTo(x, y, x + w, y, radius); }
    ctx.fill();
  }
  function circle(x, y, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function shadow(x, w) { ctx.fillStyle = 'rgba(0,0,0,.26)'; ctx.beginPath(); ctx.ellipse(x, FLOOR + 3, w, w * .2, 0, 0, TAU); ctx.fill(); }
  function plate(x, y, text, bg, fg, width) {
    ctx.font = `900 10px ${FONT}`; ctx.textAlign = 'center';
    const w = width || Math.max(54, ctx.measureText(text).width + 18);
    rounded(x - w / 2, y - 14, w, 20, 3, bg); ctx.fillStyle = fg; ctx.fillText(text, x, y); ctx.textAlign = 'left';
  }
  function wrapText(text, maxWidth) {
    const words = text.split(' '), lines = []; let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }
  function caption(title, body, y) {
    ctx.font = `700 15px ${FONT}`;
    const lines = wrapText(body, 760), boxH = 46 + lines.length * 22, boxW = 820, x = (W - boxW) / 2;
    rounded(x - 4, y - 4, boxW + 8, boxH + 8, 4, '#06111b'); rounded(x, y, boxW, boxH, 3, '#10252df2');
    ctx.fillStyle = '#8be2c2'; ctx.font = `900 12px ${FONT}`; ctx.fillText(title, x + 20, y + 26);
    ctx.fillStyle = '#eaf4ef'; ctx.font = `700 15px ${FONT}`;
    lines.forEach((line, i) => ctx.fillText(line, x + 20, y + 52 + i * 22));
  }

  /* ---------- Tarjetas (overlay) ---------- */
  function showCard(html, options = {}) {
    card.innerHTML = html;
    overlay.dataset.lock = options.lock ? '1' : '';
    const title = card.querySelector('h1'); if (title) title.id = 'dialogTitle';
    overlay.classList.remove('hidden'); card.scrollTop = 0;
    const first = card.querySelector('button, a'); if (first && !options.noFocus) first.focus();
  }
  function hideCard() { if (document.activeElement && card.contains(document.activeElement)) document.activeElement.blur(); overlay.classList.add('hidden'); overlay.classList.remove('map-transition'); overlay.dataset.lock = ''; }
  const overlayOpen = () => !overlay.classList.contains('hidden');
  function notify(message) { toast = message; toastUntil = time + 3.4; }
  const levelAt = (x) => { const i = levels.findIndex(level => x < level.end); return i < 0 ? levels.length - 1 : i; };
  function inCurrentLevel(x) { const level = levels[levelAt(player.x)]; return x >= level.start && x < level.end; }
  const playerCenter = () => player.x + player.w / 2;

  function levelTask(index) {
    if (index === 0) return hasCola ? 'Acertijo resuelto · cruza el portal al cañón.' : 'Habla con el analizador y resuelve el acertijo de Pepsi.';
    if (index === 1) return !hasMentos ? 'Usa la lupa de burbujas para desbloquear las mentas.' : !wolfDefeated ? 'Distrae al lobo con la lata para abrir el portal.' : 'Reto y lobo superados · cruza al observatorio.';
    if (!hasGoggles) return 'Resuelve el control de seguridad para desbloquear las gafas.';
    if (collectedNotes < 5) return `Reúne las pistas del cuaderno: ${collectedNotes}/5.`;
    return 'Habla con la doctora para iniciar la demostración.';
  }

  function updateUI() {
    const levelIndex = levelAt(player.x);
    const labels = {
      walk: [`MUNDO ${levelIndex + 1}/3 · ${levels[levelIndex].name.toUpperCase()}`, levelTask(levelIndex)],
      garden: ['MUNDO 3 · OBSERVATORIO', 'Acércate a la fuente y prepara la demostración.'],
      fountain: ['MUNDO 3 · OBSERVATORIO', 'Observa la demostración desde la zona segura.'],
      quiz: ['MUNDO 3 · OBSERVATORIO', 'Piensa como científico.'],
      finale: ['EPÍLOGO', 'La fuente vuelve a cantar.'],
    };
    const missing = Number(!hasCola) + Number(!hasMentos);
    const state = [mode, levelIndex, hasCola, hasMentos, hasGoggles, collectedNotes, wolfDefeated, labels[mode] && labels[mode].join('|')].join('~');
    if (state === uiKey) return;
    uiKey = state;
    materialsPanel.hidden = mode === 'intro' || ['fountain', 'quiz', 'finale'].includes(mode);
    $('#materialsCount').textContent = missing ? `${missing === 1 ? 'FALTA' : 'FALTAN'} ${missing}` : 'LISTOS';
    $('#colaStatus').textContent = hasCola ? 'DESBLOQUEADA' : 'BLOQUEADA';
    $('#mentosStatus').textContent = hasMentos ? 'DESBLOQUEADAS' : 'BLOQUEADAS';
    $('#gogglesStatus').textContent = hasGoggles ? 'LISTAS' : 'POR RESOLVER';
    $('#colaStatus').classList.toggle('unlocked', hasCola);
    $('#mentosStatus').classList.toggle('unlocked', hasMentos);
    $('#gogglesStatus').classList.toggle('unlocked', hasGoggles);
    $('#clueProgress').textContent = `PISTAS ${collectedNotes}/5`;
    if (!labels[mode]) return;
    stepLabel.textContent = labels[mode][0]; taskLabel.textContent = labels[mode][1];
    hint.innerHTML = '<kbd>A</kbd> <kbd>D</kbd> o <kbd>←</kbd> <kbd>→</kbd> caminar <span>·</span> <kbd>ESPACIO</kbd> saltar <span>·</span> <kbd>E</kbd> interactuar <span>·</span> borde izquierdo: volver de mundo';
  }

  /* ---------- Inicio, guía y viajes entre mundos ---------- */
  function startGame() {
    mode = 'walk'; player.x = 95; player.y = FLOOR - player.h; player.vx = player.vy = 0; camera.x = 0;
    $('#homeScreen').classList.add('hidden'); mission.hidden = false; materialsPanel.hidden = false; $('#bottom').hidden = false;
    uiKey = ''; updateUI(); showOpeningBriefing();
  }
  function showOpeningBriefing() {
    showCard(`<div class="eyebrow">PRÓLOGO · COMIENZA LA MISIÓN</div><h1>La fuente<br><span>se quedó sin gas</span></h1>
      <p>En el Observatorio del Jardín, la doctora Burbujas prepara una demostración para explicar de dónde salen las burbujas. Una tormenta dispersó el equipo por tres mundos y dejó la fuente apagada. Finn acepta reunir una Pepsi, mentas y gafas de seguridad antes de que llegue el grupo de visitantes.</p>
      <div class="mission-items"><div><img src="assets/Pepsi.png" alt="Lata de Pepsi" onerror="this.style.display='none'"><b>PEPSI</b></div><div><img src="assets/Mentas.png" alt="Caramelos de menta" onerror="this.style.display='none'"><b>MENTAS</b></div></div>
      <div class="fact"><span class="fact-icon">RUTA</span><span>Valle: resuelve el analizador. Cañón: supera la lupa y distrae al lobo guardián con la lata vacía. Observatorio: consigue las gafas y las cinco pistas. Puedes volver a un mundo anterior caminando hasta su borde izquierdo.</span></div>
      <button class="btn btn-primary" id="beginLevel" type="button">ENTRAR AL MUNDO 1 →</button>`);
    $('#beginLevel').onclick = () => { hideCard(); player.x = 90; camera.x = 0; notify(`MUNDO 1: ${levels[0].name}. ${levels[0].goal}`); };
  }
  function showMapTransition(index, direction = 'forward') {
    const level = levels[index], mapNumber = String(index + 1).padStart(2, '0'), back = direction === 'back';
    overlay.classList.add('map-transition');
    showCard(`<div class="map-arrival"><div class="map-stamp">DESTINO ${mapNumber}<small>MUNDO ${index + 1} / ${levels.length}</small></div>
      <div class="eyebrow">${back ? 'REGRESAS · TODO LO RESUELTO SE CONSERVA' : 'MISIÓN COMPLETADA · HAY QUE SEGUIR'}</div>
      <h1>${back ? 'Volvemos<br><span>a ' : 'Ahora vamos<br><span>a '}${level.name}</span></h1>
      <p>${back ? `Regresas a <b>${level.name}</b>. Tus acertijos resueltos y las pistas del cuaderno siguen contigo.` : `Dejamos este mapa y viajamos a <b>${level.name}</b>. Allí empieza un recorrido nuevo con otro reto.`}</p>
      <div class="fact"><span class="fact-icon">MISIÓN</span><span>${level.goal}</span></div>
      <button class="btn btn-primary" id="enterMap" type="button">${back ? '← VOLVER' : 'VIAJAR'} AL MUNDO ${mapNumber}${back ? '' : ' →'}</button>
      <button class="btn btn-quiet" id="stayMap" type="button">QUEDARME AQUÍ</button></div>`);
    $('#enterMap').onclick = () => travelToMap(index, direction);
    $('#stayMap').onclick = () => { hideCard(); player.x += back ? 90 : -90; };
  }
  function travelToMap(index, direction = 'forward') {
    if (mapTraveling) return;
    mapTraveling = true; overlay.classList.add('map-closing');
    window.setTimeout(() => {
      const level = levels[index];
      const spawn = direction === 'back' ? level.end - player.w - 90 : level.start + 72;
      player.x = spawn; player.y = FLOOR - player.h; player.vx = player.vy = 0;
      camera.x = Math.max(level.start, Math.min(level.end - W, spawn - W * .42));
      for (const key in keys) keys[key] = false;
      jumpQueued = false; card.replaceChildren();
      overlay.classList.remove('map-closing'); overlay.classList.add('map-opening');
      uiKey = ''; updateUI();
      window.setTimeout(() => {
        overlay.classList.add('hidden'); overlay.classList.remove('map-transition', 'map-opening'); overlay.dataset.lock = '';
        mapTraveling = false; notify(`MUNDO ${index + 1}: ${level.name}`);
      }, 680);
    }, 480);
  }
  function showGuide() {
    showCard(`<div class="eyebrow">GUÍA DE AVENTURA</div><h1>Explora los <span>mundos</span></h1>
      <div class="guide-layout"><div class="instruction-art" role="img" aria-label="Finn, explorador pixel art"></div>
      <div><p>Cada mundo tiene su paisaje y su propio reto. Resuelve las estaciones para conseguir los ingredientes; los gatos te orientan.</p>
      <div class="fact"><span class="fact-icon">←→</span><span><b>Camina:</b> A y D o las flechas. Al llegar al borde izquierdo de un mundo puedes regresar al anterior.</span></div>
      <div class="fact"><span class="fact-icon">↑</span><span><b>Salta:</b> Espacio, W o flecha arriba.</span></div>
      <div class="fact"><span class="fact-icon">E</span><span><b>Interactúa:</b> estaciones, gatos, lobo y personajes.</span></div></div></div>
      <button class="btn btn-primary" id="closeGuide" type="button">ENTENDIDO →</button>`);
    $('#closeGuide').onclick = hideCard;
  }
  function toggleFullscreen() {
    const request = document.fullscreenElement ? document.exitFullscreen() : $('#frame').requestFullscreen();
    if (request && request.catch) request.catch(() => notify('No se pudo activar pantalla completa en este navegador.'));
  }

  /* ---------- Sprites: Finn, gatos, lobo ---------- */
  function drawPlayer() {
    const dx = Math.round(playerCenter() - camera.x - 32), dy = Math.round(player.y);
    shadow(playerCenter() - camera.x, 22);
    if (!ok(sprite)) { rounded(dx + 14, dy + 8, 36, 52, 8, '#ffb864'); circle(dx + 26, dy + 24, 3, '#21374a'); return; }
    const columns = Math.floor(sprite.naturalWidth / FINN_ANIM.frame);
    const moving = Math.abs(player.vx) > 1 && player.onGround && mode !== 'finale';
    let frame;
    if (!player.onGround) frame = FINN_ANIM.jump;
    else if (moving) frame = FINN_ANIM.walk[0] + Math.floor(time * 11) % (FINN_ANIM.walk[1] - FINN_ANIM.walk[0] + 1);
    else frame = FINN_ANIM.idle[0] + Math.floor(time * 6) % (FINN_ANIM.idle[1] - FINN_ANIM.idle[0] + 1);
    frame = Math.min(frame, columns - 1);
    ctx.save(); ctx.imageSmoothingEnabled = false;
    if (player.facing < 0) { ctx.translate(dx + 64, 0); ctx.scale(-1, 1); ctx.drawImage(sprite, frame * 32, 0, 32, 32, 0, dy, 64, 64); }
    else ctx.drawImage(sprite, frame * 32, 0, 32, 32, dx, dy, 64, 64);
    ctx.restore();
  }

  function proceduralCat(x, baseY, dir, moving, seed, hue) {
    const u = 4, step = moving ? Math.floor(time * 8 + seed) % 2 : 0;
    const palettes = [{ body: '#e0944a', belly: '#f6d7a8' }, { body: '#8c97a6', belly: '#dfe5ec' }, { body: '#f1ece2', belly: '#ffffff' }];
    const pal = palettes[hue === 0 ? 0 : hue === 70 ? 1 : 2];
    ctx.save(); ctx.translate(Math.round(x), Math.round(baseY)); ctx.scale(dir < 0 ? -1 : 1, 1);
    const px = (gx, gy, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(gx * u, gy * u, w * u, h * u); };
    px(-8, -9 - (step ? 1 : 0), 1, 6, pal.body); px(-9, -10 - (step ? 1 : 0), 1, 2, pal.body);
    px(-6, -6, 9, 4, pal.body); px(-4, -3, 5, 1, pal.belly);
    px(2, -10, 6, 5, pal.body); px(2, -12, 1, 2, pal.body); px(7, -12, 1, 2, pal.body);
    px(4, -8, 1, 1, '#14272f'); px(6, -8, 1, 1, '#14272f'); px(7, -6, 1, 1, '#f08a8a');
    px(-5, -2, 2, 2 - (step ? 1 : 0), pal.body); px(-1, -2, 2, 2 - (step ? 0 : 1), pal.body);
    px(1, -2, 2, 2 - (step ? 1 : 0), pal.body); px(-3, -2, 2, 2 - (step ? 0 : 1), pal.body);
    ctx.restore();
  }
  function drawCatSprite(x, baseY, dir, moving, seed, hue) {
    const c = spriteCfg.cat;
    if (ok(catSprite)) {
      const rows = Math.floor(catSprite.naturalHeight / c.frame);
      const row = dir >= 0 ? c.rowRight : c.rowLeft;
      if (row >= 0 && row < rows) {
        const frames = Math.max(1, Math.min(c.frames, Math.floor(catSprite.naturalWidth / c.frame)));
        const frame = moving ? Math.floor(time * 8 + seed) % frames : 0, size = c.frame * c.scale;
        ctx.save(); ctx.imageSmoothingEnabled = false;
        if (hue && 'filter' in ctx) ctx.filter = `hue-rotate(${hue}deg)`;
        ctx.drawImage(catSprite, frame * c.frame, row * c.frame, c.frame, c.frame, Math.round(x - size / 2), Math.round(baseY - size + c.footPad * c.scale), size, size);
        ctx.restore(); return;
      }
    }
    proceduralCat(x, baseY, dir, moving, seed, hue);
  }
  function updateCats(dt) {
    if (mode === 'finale') return;
    for (const cat of cats) {
      const distance = Math.abs(playerCenter() - cat.x);
      if (['walk', 'garden'].includes(mode) && distance < 115) { cat.moving = false; cat.dir = playerCenter() > cat.x ? 1 : -1; continue; }
      if (cat.pause > 0) { cat.pause -= dt; cat.moving = false; continue; }
      cat.moving = true; cat.x += cat.dir * 32 * dt;
      if (cat.x > cat.home + 90) { cat.x = cat.home + 90; cat.dir = -1; cat.pause = 1 + Math.random() * 2; }
      if (cat.x < cat.home - 90) { cat.x = cat.home - 90; cat.dir = 1; cat.pause = 1 + Math.random() * 2; }
    }
  }
  function drawCats() {
    for (const cat of cats) {
      if (mode !== 'finale' && !inCurrentLevel(cat.home)) continue;
      const x = Math.round(cat.x - camera.x); if (x < -80 || x > W + 80) continue;
      let hop = 0;
      if (mode === 'finale') hop = Math.abs(Math.sin(time * 5 + cat.seed)) * 14 * (time - finale.start > 4.2 ? 1 : 0);
      shadow(x, 20);
      drawCatSprite(x, FLOOR + 2 - hop, cat.dir, mode === 'finale' ? hop > 1 : cat.moving, cat.seed, cat.hue);
      plate(x, FLOOR - 82, cat.name, '#14272fee', '#ffe49b');
      if (['walk', 'garden'].includes(mode) && Math.abs(playerCenter() - cat.x) < 100) plate(x, FLOOR - 104, 'PULSA E', '#fff2cfee', '#19363b', 66);
    }
  }

  const wolfFrames = (sheet) => Math.max(1, Math.floor(sheet.naturalWidth / spriteCfg.wolf.frame));
  function drawWolfSheet(sheet, frame, cx, right, alpha) {
    const c = spriteCfg.wolf, size = c.frame * c.scale;
    const rows = Math.max(1, Math.floor(sheet.naturalHeight / c.frame));
    const row = rows === 1 ? 0 : Math.min(rows - 1, right ? c.rowRight : c.rowLeft);
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = alpha;
    ctx.drawImage(sheet, (frame % wolfFrames(sheet)) * c.frame, row * c.frame, c.frame, c.frame, Math.round(cx - size / 2), Math.round(FLOOR + 3 - size + c.footPad * c.scale), size, size);
    ctx.restore();
  }
  function proceduralWolf(cx, right, moving, alpha) {
    const u = 6, step = moving ? Math.floor(time * 10) % 2 : 0;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(Math.round(cx), FLOOR + 3); ctx.scale(right ? 1 : -1, 1);
    const px = (gx, gy, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(gx * u, gy * u, w * u, h * u); };
    px(-9, -12, 2, 3, '#5b5663'); px(-8, -10, 3, 5, '#5b5663'); px(-6, -11, 10, 6, '#6e6a78'); px(-6, -7, 10, 2, '#8b8796');
    px(3, -14, 6, 6, '#6e6a78'); px(8, -12, 3, 3, '#8b8796'); px(3, -16, 2, 2, '#4d4955'); px(7, -16, 2, 2, '#4d4955');
    px(7, -12, 1, 1, '#ffd36b'); px(10, -12, 1, 1, '#14131a');
    px(-6, -5, 2, 5 - step, '#5b5663'); px(-2, -5, 2, 4 + step, '#5b5663'); px(1, -5, 2, 5 - step, '#5b5663'); px(4, -5, 2, 4 + step, '#5b5663');
    ctx.restore();
  }
  function updateWolf(dt) {
    if (wolf.state === 'fleeing' && !wolf.gone) {
      if (time - wolf.t0 > 0.45) wolf.x += 340 * dt;
      if (wolf.x >= can.x1 - 30) can.active = false;
      if (wolf.x >= 2695) wolf.gone = true;
    }
  }
  function drawWolf() {
    if (wolf.gone || !inCurrentLevel(WOLF_X)) return;
    const sx = wolf.x - camera.x; if (sx < -220 || sx > W + 220) return;
    let sheet = wolfIdle, right = false, frame = 0, alpha = 1, moving = false;
    if (wolf.state === 'guard') {
      right = playerCenter() > wolf.x;
      const near = Math.abs(playerCenter() - wolf.x) < 260;
      sheet = near ? wolfClaw : wolfIdle;
      frame = Math.floor(time * (near ? 12 : 7));
    } else {
      const t = time - wolf.t0; right = true;
      if (t < 0.45) { sheet = wolfIdle; frame = Math.floor(time * 7); }
      else { sheet = wolfWalk; frame = Math.floor((t - 0.45) * 14); moving = true; }
      alpha = Math.max(0, Math.min(1, (2695 - wolf.x) / 90));
    }
    shadow(sx, 46);
    if (ok(sheet)) drawWolfSheet(sheet, frame, sx, right, alpha); else proceduralWolf(sx, right, moving, alpha);
    if (wolf.state === 'guard') {
      plate(sx, FLOOR - 196, 'LOBO GUARDIÁN', '#2b2434ee', '#f6d4c1', 140);
      if (mode === 'walk' && Math.abs(playerCenter() - WOLF_X) < 120) plate(sx, FLOOR - 218, 'PULSA E', '#fff2cfee', '#19363b', 66);
    } else if (time - wolf.t0 < 1.6) plate(sx, FLOOR - 196, '¡CORRE TRAS LA LATA!', '#38564aee', '#e2f3cf', 200);
  }
  function drawCan() {
    if (!can.active) return;
    const t = Math.min(1, (time - can.t0) / can.dur);
    const x = can.x0 + (can.x1 - can.x0) * t - camera.x, y = can.y0 + (FLOOR - 28 - can.y0) * t - Math.sin(Math.PI * t) * 170;
    ctx.save(); ctx.translate(x, y); ctx.rotate(t < 1 ? time * 12 : 1.4);
    if (ok(pepsiImg)) { ctx.imageSmoothingEnabled = false; ctx.drawImage(pepsiImg, -16, -16, 32, 32); }
    else { rounded(-8, -14, 16, 28, 3, '#1d5fb0'); rounded(-8, -3, 16, 6, 0, '#e5372f'); rounded(-8, -14, 16, 4, 2, '#c9d4dc'); }
    ctx.restore();
  }

  /* ---------- Fondo y escenario ---------- */
  function drawFallbackSky(starMap) {
    const g = ctx.createLinearGradient(0, 0, 0, 570);
    if (starMap) { g.addColorStop(0, '#16284a'); g.addColorStop(1, '#4a6f92'); } else { g.addColorStop(0, '#3a3157'); g.addColorStop(.6, '#c4725c'); g.addColorStop(1, '#f2b277'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 570);
    if (starMap) for (let i = 0; i < 70; i++) { ctx.fillStyle = i % 4 ? '#ffffff88' : '#ffe9a8'; ctx.fillRect((i * 97) % W, (i * 53) % 330, 2, 2); }
    for (let layer = 0; layer < 3; layer++) {
      ctx.fillStyle = ['#4a4468aa', '#3b4a66cc', '#2f4a5acc'][layer];
      const par = camera.x * (.1 + layer * .12);
      ctx.beginPath(); ctx.moveTo(0, 570);
      for (let x = 0; x <= W; x += 40) ctx.lineTo(x, 470 - layer * 28 + Math.sin((x + par) * .006 + layer * 2) * (40 + layer * 14));
      ctx.lineTo(W, 570); ctx.fill();
    }
  }
  function drawLayers(layers, localCamera, useAlpha) {
    ctx.save(); ctx.imageSmoothingEnabled = false;
    for (const layer of layers) {
      const image = layer.image; if (!ok(image)) continue;
      const offset = (localCamera * layer.speed) % W;
      ctx.globalAlpha = useAlpha ? layer.alpha : 1;
      ctx.drawImage(image, -offset, 0, W, H); ctx.drawImage(image, W - offset, 0, W, H);
      if (offset > 0) ctx.drawImage(image, -W - offset, 0, W, H);
    }
    ctx.restore();
  }
  function drawBackground() {
    const mapIndex = levelAt(player.x), starMap = mapIndex === 1, gardenMap = mapIndex === 2;
    const localCamera = Math.max(0, camera.x - levels[mapIndex].start);
    ctx.fillStyle = starMap ? '#365b80' : '#302b3a'; ctx.fillRect(0, 0, W, H);
    const layers = starMap ? fieldLayers : cityLayers;
    if (!layers.some(layer => ok(layer.image))) drawFallbackSky(starMap);
    else if (starMap) drawLayers(fieldLayers, localCamera, false);
    else { if (ok(citySunset)) ctx.drawImage(citySunset, 0, 0, W, H); drawLayers(cityLayers, localCamera, true); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = levels[mapIndex].color; ctx.fillRect(0, 0, W, 568);
    ctx.fillStyle = starMap ? '#31475a' : gardenMap ? '#607a4f' : '#728854'; ctx.fillRect(0, 568, W, 152);
    ctx.fillStyle = starMap ? '#8195a1' : gardenMap ? '#a4c58a' : '#c9b880'; ctx.fillRect(0, 570, W, 8);
    for (let i = 0; i < 60; i++) {
      const x = ((i * 157 - camera.x * .78) % (W + 60) + W + 60) % (W + 60);
      ctx.fillStyle = starMap ? (i % 3 ? '#728db1' : '#e8c989') : i % 3 ? '#657b53' : '#f2d195'; ctx.fillRect(x, 603 + (i * 43 % 95), 4, 4);
    }
    ctx.save(); ctx.translate(-camera.x, 0);
    for (let i = 0; i < 30; i++) {
      const x = 40 + i * 145; if (x > WORLD) break;
      if (i % 3 === 0) { circle(x, 545, 26, '#80ac81'); circle(x - 12, 555, 20, '#93b987'); circle(x + 15, 558, 18, '#719c79'); }
      for (let j = 0; j < 3; j++) circle(x + 18 + j * 9, 534 - (j % 2) * 9, 3, ['#ffd594', '#f5a99a', '#f5e295'][j]);
    }
    drawNatureProps(); drawObservatory();
    ctx.restore();
  }
  function drawObservatory() {
    const x = 3500;
    rounded(x, 338, 490, 245, 16, '#eee4bd');
    ctx.fillStyle = '#d3bd91'; ctx.beginPath(); ctx.moveTo(x - 38, 340); ctx.lineTo(x + 235, 220); ctx.lineTo(x + 528, 340); ctx.fill();
    ctx.fillStyle = '#829d7a'; ctx.fillRect(x, 346, 490, 16);
    for (let i = 0; i < 5; i++) { rounded(x + 35 + i * 91, 385, 53, 91, 21, '#80b9ae'); rounded(x + 43 + i * 91, 393, 37, 73, 15, '#c4e5d1'); }
    rounded(x + 210, 462, 69, 119, 18, '#947557'); rounded(x + 225, 493, 40, 88, 16, '#58796b');
  }
  function drawNatureProps() {
    const activeLevel = levels[levelAt(player.x)];
    const inMap = (x) => x >= activeLevel.start && x < activeLevel.end;
    const props = [
      ...[180, 545, 1380, 2550, 2800, 3430].map((x, i) => [x, environment.bushes[i % environment.bushes.length], 64, 48]),
      ...[320, 1120, 1510, 1980, 2370, 3290].map((x, i) => [x, environment.ferns[i % environment.ferns.length], 48, 48]),
      ...[650, 1740, 2310, 3010, 3500].map((x, i) => [x, environment.stones[i % environment.stones.length], 40, 32]),
      ...[490, 770, 1040, 1450, 2190, 2920, 3180, 3620].map((x, i) => [x, environment.flowers[i % environment.flowers.length], 32, 32]),
    ];
    ctx.save(); ctx.imageSmoothingEnabled = false;
    for (const [x, image, width, height] of props) if (inMap(x) && ok(image)) ctx.drawImage(image, x, FLOOR - height, width, height);
    const trees = [[245, 1.08, '#527b58'], [900, .78, '#78965b'], [1518, 1.15, '#526d59'], [2070, .92, '#6f8f61'], [2855, 1.08, '#4e765c'], [3370, .88, '#76985e']];
    trees.forEach(([x, scale, leaves], index) => {
      if (!inMap(x)) return;
      const unit = 8 * scale;
      ctx.fillStyle = '#59473a'; ctx.fillRect(x - unit, FLOOR - 65 * scale, unit * 2, 65 * scale);
      const sway = Math.round(Math.sin(time * 1.35 + index * 1.7) * 2.5);
      ctx.save(); ctx.translate(sway, 0);
      ctx.fillStyle = '#314e4c'; ctx.fillRect(x - unit * 3, FLOOR - 92 * scale, unit * 6, unit * 3);
      ctx.fillStyle = leaves; ctx.fillRect(x - unit * 4, FLOOR - 84 * scale, unit * 8, unit * 5);
      ctx.fillRect(x - unit * 3, FLOOR - 100 * scale, unit * 6, unit * 3); ctx.fillRect(x - unit * 2, FLOOR - 108 * scale, unit * 4, unit * 2);
      ctx.fillStyle = '#9bb86c'; ctx.fillRect(x - unit * 2, FLOOR - 94 * scale, unit, unit);
      ctx.fillStyle = '#243f41'; ctx.fillRect(x - unit * 3, FLOOR - 79 * scale, unit, unit * 2);
      ctx.restore();
    });
    ctx.restore();
  }
  function drawPlatforms() {
    const activeLevel = levels[levelAt(player.x)];
    ctx.save(); ctx.translate(-camera.x, 0);
    for (const p of platforms.slice(1)) {
      if (p.x < activeLevel.start || p.x + p.w > activeLevel.end) continue;
      rounded(p.x, p.y, p.w, p.h, 9, '#739d72'); rounded(p.x + 3, p.y + 2, p.w - 6, 7, 4, '#bfd497');
    }
    ctx.restore();
  }
  function drawLevelGates() {
    ctx.save(); ctx.translate(-camera.x, 0); ctx.textAlign = 'center';
    const forward = [{ x: 1300, open: hasCola, label: 'VALLE / CAÑÓN' }, { x: 2700, open: hasMentos && wolfDefeated, label: 'CAÑÓN / JARDÍN' }];
    for (const gate of forward) {
      if (!inCurrentLevel(gate.x - 1)) continue;
      rounded(gate.x - 13, 397, 26, 173, 10, gate.open ? '#79d6ae' : '#715e51');
      rounded(gate.x - 58, 378, 116, 31, 10, gate.open ? '#174b45' : '#452f38');
      ctx.fillStyle = '#fff4cf'; ctx.font = `800 9px ${FONT}`; ctx.fillText(gate.open ? 'MUNDO DISPONIBLE' : gate.label, gate.x, 397);
      if (!gate.open) { ctx.strokeStyle = '#f2ce85'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(gate.x - 24, 420); ctx.lineTo(gate.x - 24, 545); ctx.moveTo(gate.x + 24, 420); ctx.lineTo(gate.x + 24, 545); ctx.stroke(); }
    }
    // Carteles para regresar al mundo anterior
    levels.forEach((level, index) => {
      if (index === 0 || !inCurrentLevel(level.start)) return;
      const x = level.start + 54;
      rounded(x - 5, 480, 10, 90, 3, '#6f5a46');
      rounded(x - 44, 456, 100, 30, 4, '#173b3e'); rounded(x - 41, 459, 94, 24, 3, '#235558');
      ctx.fillStyle = '#c8f5e2'; ctx.font = `900 9px ${FONT}`; ctx.fillText(`◄ MUNDO ${index}`, x + 6, 475);
    });
    ctx.restore(); ctx.textAlign = 'left';
  }
  function drawChallengeStations() {
    ctx.save(); ctx.translate(-camera.x, 0); ctx.textAlign = 'center';
    for (const station of challengeStations) {
      if (!inCurrentLevel(station.x)) continue;
      const x = station.x, solved = station.solved;
      rounded(x - 31, FLOOR - 91, 62, 91, 12, '#18313a'); rounded(x - 25, FLOOR - 83, 50, 66, 9, '#27464a');
      circle(x, FLOOR - 68, 13, solved ? '#86e3bd' : '#f3c16d'); circle(x, FLOOR - 68, 6, '#17323b');
      rounded(x - 38, FLOOR - 111, 76, 18, 6, solved ? '#174b45' : '#573f2c');
      ctx.fillStyle = '#fff3d6'; ctx.font = `800 8px ${FONT}`; ctx.fillText(station.name, x, FLOOR - 99, 82);
      ctx.fillStyle = solved ? '#78dfb8' : '#f2c777'; ctx.font = `900 8px ${FONT}`; ctx.fillText(solved ? 'DESBLOQUEADO' : 'ACERTIJO · E', x, FLOOR - 8);
      if (!solved && Math.abs(playerCenter() - station.x) < 90) { rounded(x - 33, FLOOR - 145, 66, 24, 8, '#fff3dfee'); ctx.fillStyle = '#183a42'; ctx.font = `900 10px ${FONT}`; ctx.fillText('PULSA E', x, FLOOR - 129); }
    }
    ctx.restore(); ctx.textAlign = 'left';
  }
  function drawItem(o) {
    if (o.type !== 'nota' || !inCurrentLevel(o.x)) return;
    const x = o.x - camera.x, y = o.y; if (x < -70 || x > W + 70) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(time * 2 + o.x) * .08); rounded(-13, -17, 27, 34, 4, '#fff2ce');
    ctx.fillStyle = '#84ab8b'; ctx.fillRect(-7, -7, 13, 3); ctx.fillRect(-7, 0, 16, 2); circle(10, -11, 5, '#ffda78'); ctx.restore();
    circle(x, y - 30 + Math.sin(time * 3 + o.x) * 3, 3, '#fff3b1');
  }
  function drawDoctor() {
    if (!inCurrentLevel(DOCTOR_X)) return;
    const x = DOCTOR_X - camera.x; if (x < -100 || x > W + 100) return;
    const bob = mode === 'finale' && time - finale.start > 4.2 ? -Math.abs(Math.sin(time * 4)) * 8 : 0;
    ctx.save(); ctx.translate(0, bob);
    circle(x + 28, 477, 24, '#715d45'); circle(x + 28, 481, 19, '#efbd8a'); rounded(x + 8, 496, 40, 62, 9, '#3c776f');
    ctx.fillStyle = '#f4f0df'; ctx.beginPath(); ctx.moveTo(x + 10, 498); ctx.lineTo(x + 48, 498); ctx.lineTo(x + 43, 541); ctx.lineTo(x + 29, 533); ctx.lineTo(x + 15, 541); ctx.closePath(); ctx.fill();
    circle(x + 21, 478, 3, '#263f4b'); circle(x + 36, 478, 3, '#263f4b');
    ctx.restore();
    plate(x + 28, 445, 'DRA. BURBUJAS', '#10252def', '#b7f1d9', 130);
    if (mode === 'walk' && Math.abs(player.x - DOCTOR_X) < 190) {
      ctx.fillStyle = '#fff3ce'; ctx.font = `700 10px ${FONT}`; ctx.textAlign = 'center';
      const ready = collectedNotes === 5 && hasCola && hasMentos && hasGoggles;
      ctx.fillText(ready ? 'PISTAS + INGREDIENTES LISTOS' : `PISTAS ${collectedNotes}/5 · COLA ${hasCola ? '✓' : '—'} · MENTOS ${hasMentos ? '✓' : '—'}`, x + 28, 467);
      if (!hasGoggles) ctx.fillText('FALTAN LAS GAFAS DEL OBSERVATORIO', x + 28, 480);
      if (ready) ctx.fillText('PULSA E PARA HABLAR', x + 28, 480);
      ctx.textAlign = 'left';
    }
  }

  /* ---------- Fuente, demostración y epílogo ---------- */
  function drawSafetyZone() {
    const cx = FOUNTAIN_X - camera.x;
    ctx.save(); ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 3; ctx.setLineDash([12, 10]);
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + side * 250, 540); ctx.lineTo(cx + side * 250, 575); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - 250, 578); ctx.lineTo(cx + 250, 578); ctx.stroke(); ctx.setLineDash([]);
    for (const side of [-1, 1]) { ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.moveTo(cx + side * 250 - 9, 575); ctx.lineTo(cx + side * 250 + 9, 575); ctx.lineTo(cx + side * 250, 548); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(cx + side * 250 - 5, 562, 10, 4); }
    ctx.fillStyle = '#ffd36b'; ctx.font = `900 10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('ZONA DE SEGURIDAD · PÚBLICO A DISTANCIA', cx, 596); ctx.textAlign = 'left';
    ctx.restore();
  }
  function drawBottle(x, y) {
    rounded(x - 15, y - 62, 30, 66, 8, '#1d4f9a'); rounded(x - 15, y - 36, 30, 10, 0, '#e5372f'); rounded(x - 15, y - 26, 30, 8, 0, '#f4f4f4');
    rounded(x - 8, y - 82, 16, 24, 3, '#1d4f9a'); rounded(x - 10, y - 88, 20, 8, 2, '#cfd8dc');
  }
  function drawFountain() {
    if (!inCurrentLevel(FOUNTAIN_X)) return;
    const x = FOUNTAIN_X - camera.x;
    if (['garden', 'fountain', 'quiz'].includes(mode)) drawSafetyZone();
    rounded(x - 68, 520, 136, 50, 16, '#628e76'); rounded(x - 53, 512, 106, 18, 7, '#d9cc9c');
    rounded(x - 43, 489, 86, 25, 9, '#83baab');
    if (mode === 'garden') { circle(x, 482, 21, '#d9c991'); circle(x, 482, 9, '#80beb0'); plate(x, 438, 'FUENTE DE DEMOSTRACIÓN', '#10252def', '#b7f1d9', 200); if (Math.abs(player.x - FOUNTAIN_X) < 160) plate(x, 414, 'PULSA E', '#fff2cfee', '#19363b', 66); return; }
    if (mode === 'fountain' || mode === 'quiz') {
      const t = time - demo.start;
      drawBottle(x, 512);
      if (mode === 'fountain' && t < 1.4) { const k = t / 1.4; circle(x, 330 + k * 150, 7, '#f4f4ea'); circle(x, 330 + k * 150, 3, '#c9d9c0'); }
      const strength = mode === 'quiz' ? Math.max(0, .25 - (time - demo.end) * .05) : t < 1.6 ? 0 : t < 7 ? 1 : Math.max(.2, 1 - (t - 7) / 3);
      for (let i = 0; i < 4; i++) circle(x + (i - 1.5) * 30, 506 - Math.sin(time * 6 + i) * 3, (14 + i % 2 * 6) * Math.min(1, strength + .15), '#f4ffff');
    }
    if (mode === 'finale') {
      const t = time - finale.start, on = t > 4.2;
      circle(x, 482, 21, '#d9c991'); circle(x, 482, 9, '#80beb0');
      if (on) for (let i = 0; i < 6; i++) { ctx.globalAlpha = .55; circle(x + (i - 2.5) * 20, 575, 10 + Math.sin(time * 3 + i) * 3, `hsl(${(time * 60 + i * 60) % 360}, 90%, 65%)`); }
      ctx.globalAlpha = 1;
    }
  }
  function emit(x, y, count, extra = {}) {
    for (let i = 0; i < count; i++) particles.push({ x, y, vx: (Math.random() - .5) * 150, vy: -40 - Math.random() * 190, life: .6 + Math.random() * 1.1, size: 2 + Math.random() * 7, color: '#d5ffff', g: 30, ...extra });
    if (particles.length > 1600) particles.splice(0, particles.length - 1600);
  }
  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.life -= dt;
      if (p.life <= 0 || p.y > FLOOR + 20) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(.9, p.life); circle(p.x - camera.x, p.y, Math.max(1, p.size * Math.min(1, p.life + .3)), p.color);
    }
    ctx.globalAlpha = 1;
  }
  function updateFountainEffects(dt) {
    if (mode === 'fountain') {
      const t = time - demo.start;
      if (t >= 1.6 && t < 10) {
        const strength = t < 7 ? 1 : Math.max(.2, 1 - (t - 7) / 3);
        for (let i = 0; i < 4; i++) emit(FOUNTAIN_X + (Math.random() - .5) * 14, 430, 1, { vx: (Math.random() - .5) * 110, vy: -(330 + Math.random() * 260) * strength, g: 620, life: 1.1 + Math.random() * .7, size: 4 + Math.random() * 6, color: Math.random() < .8 ? '#f6ffff' : '#bff0ff' });
        if (Math.random() < .2) emit(FOUNTAIN_X + (Math.random() - .5) * 120, 460, 1, { vx: 0, vy: -60, g: -20, life: 1.5, size: 5, color: '#8be2c2' });
      }
      if (time >= demo.end && demo.running) { demo.running = false; showSorting(); }
    }
    if (mode === 'finale') {
      const t = time - finale.start;
      if (t > 4.2) {
        for (let j = -2; j <= 2; j++) for (let k = 0; k < 2; k++) emit(FOUNTAIN_X + j * 8, 480, 1, { vx: j * 46 + (Math.random() - .5) * 16, vy: -(400 + Math.random() * 70), g: 640, life: 1.5, size: 3 + Math.random() * 3, color: Math.random() < .7 ? '#c9f7ff' : '#ffffff' });
        if (Math.random() < .35) emit(FOUNTAIN_X + (Math.random() - .5) * 240, 560, 1, { vx: 0, vy: -90 - Math.random() * 80, g: -30, life: 2, size: 5 + Math.random() * 5, color: '#e8ffff' });
        finale.nextFirework -= dt;
        if (finale.nextFirework <= 0) { finale.nextFirework = .5 + Math.random() * .5; fireworks.push({ x: 160 + Math.random() * 960, y: 120 + Math.random() * 190, t0: time, hue: Math.random() * 360 }); }
      }
      if (t > 8.4 && confetti.length < 160 && Math.random() < .8) {
        for (let i = 0; i < 3; i++) confetti.push({ x: Math.random() * W, y: -10, vx: (Math.random() - .5) * 60, vy: 70 + Math.random() * 90, rot: Math.random() * TAU, vr: (Math.random() - .5) * 8, color: `hsl(${Math.random() * 360}, 85%, 62%)`, size: 5 + Math.random() * 5 });
      }
      player.facing = -1; player.vx = 0;
      player.y = FLOOR - player.h - (t > 4.2 ? Math.abs(Math.sin(t * 5)) * 16 : 0); player.onGround = t < 4.2;
      if (t >= finale.total && !finale.done) { finale.done = true; showCertificate(); }
    }
  }
  function drawFinaleOverlay(dt) {
    const t = time - finale.start;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(48,24,88,.62)'); g.addColorStop(.55, 'rgba(255,128,86,.32)'); g.addColorStop(1, 'rgba(255,196,120,.12)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(255,244,200,${.35 + .35 * Math.sin(time * 2 + i)})`; ctx.fillRect((i * 211) % W, 90 + (i * 67) % 170, 2, 2); }
    for (let i = fireworks.length - 1; i >= 0; i--) {
      const f = fireworks[i], a = (time - f.t0) / 1.3;
      if (a >= 1) { fireworks.splice(i, 1); continue; }
      for (let k = 0; k < 20; k++) {
        const ang = k / 20 * TAU, r = a * 95;
        ctx.globalAlpha = 1 - a; ctx.strokeStyle = `hsl(${f.hue + k * 4}, 90%, 70%)`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x + Math.cos(ang) * r, f.y + Math.sin(ang) * r + a * a * 34, 3 + (1 - a) * 3, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
  function drawConfetti(dt) {
    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i]; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
      if (c.y > H + 20) { confetti.splice(i, 1); continue; }
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.fillStyle = c.color; ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2); ctx.restore();
    }
  }
  const finaleLines = [
    'Al atardecer, la doctora Burbujas reajusta la válvula que había cerrado para preparar la demostración.',
    'Y la fuente vuelve a cantar. No hubo combustible ni fórmulas secretas: solo agua, luces y buena ciencia.',
    'Finn llegó buscando una reacción química. Se marcha con algo mejor: una pregunta comprobable, observaciones honestas y una explicación más precisa.',
    '—¿Cuál será tu próxima pregunta? —pregunta la doctora.',
    'Finn mira una burbuja que sube por el agua y abre una página nueva…',
  ];
  function drawFinaleCaption() {
    const t = time - finale.start, per = finale.total / (finaleLines.length + .4);
    const index = Math.min(finaleLines.length - 1, Math.floor(t / (per * .92)));
    const lineStart = index * per * .92, chars = Math.floor((t - lineStart) * 42);
    caption('EPÍLOGO · LA FUENTE VUELVE A CANTAR', finaleLines[index].slice(0, Math.max(0, chars)), 112);
    ctx.fillStyle = '#ffffffb0'; ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'right'; ctx.fillText('E · SALTAR', W - 40, H - 30); ctx.textAlign = 'left';
  }
  function drawDemoCaption() {
    const t = time - demo.start;
    const steps = [
      ['1 · OBSERVA', 'El Mentos cae en la bebida. En el modelo todo ocurre en la bandeja, al aire libre y con el público lejos.'],
      ['2 · NUCLEACIÓN', 'Las pequeñas cavidades del caramelo ofrecen muchísimos puntos donde pueden empezar a formarse burbujas.'],
      ['3 · CO₂ QUE YA ESTABA AHÍ', 'El CO₂ disuelto en la bebida pasa deprisa a gas. No aparece humo, ni fuego, ni una sustancia misteriosa.'],
      ['4 · ¿REACCIÓN O ESPECTÁCULO?', 'Es muy vistoso, pero lo que ves es espuma y rapidez. Anótalo en tu cuaderno.'],
    ];
    const step = steps[Math.min(3, Math.floor(t / 2.4))];
    caption(step[0], step[1], 200);
  }

  /* ---------- Diálogos de juego ---------- */
  function portraitCanvas(kind) { return `<canvas class="portrait" data-kind="${kind}" width="${kind === 'wolf' ? 176 : 80}" height="${kind === 'wolf' ? 176 : 80}" aria-hidden="true"></canvas>`; }
  function drawPortraits() {
    for (const canvasEl of document.querySelectorAll('canvas.portrait')) {
      const c = canvasEl.getContext('2d'); c.clearRect(0, 0, canvasEl.width, canvasEl.height); c.imageSmoothingEnabled = false;
      if (canvasEl.dataset.kind === 'cat' && ok(catSprite)) {
        const cc = spriteCfg.cat, frames = Math.max(1, Math.min(cc.frames, Math.floor(catSprite.naturalWidth / cc.frame)));
        c.drawImage(catSprite, (Math.floor(time * 8) % frames) * cc.frame, cc.rowRight * cc.frame, cc.frame, cc.frame, 0, 0, 80, 80);
      } else if (canvasEl.dataset.kind === 'wolf' && ok(wolfIdle)) {
        const wc = spriteCfg.wolf, rows = Math.max(1, Math.floor(wolfIdle.naturalHeight / wc.frame)), row = rows === 1 ? 0 : Math.min(rows - 1, wc.rowRight);
        c.drawImage(wolfIdle, (Math.floor(time * 7) % wolfFrames(wolfIdle)) * wc.frame, row * wc.frame, wc.frame, wc.frame, 0, 0, 176, 176);
      } else if (canvasEl.dataset.kind === 'cat') { c.fillStyle = '#e0944a'; c.fillRect(16, 36, 44, 24); c.fillRect(44, 20, 28, 26); c.fillStyle = '#14272f'; c.fillRect(54, 30, 4, 4); c.fillRect(64, 30, 4, 4); }
    }
  }
  function showCatDialogue(cat) {
    showCard(`<div class="eyebrow">NPC · GATO EXPLORADOR</div>${portraitCanvas('cat')}<h1>${cat.name} <span>te orienta</span></h1><p>${cat.hints()}</p><button class="btn btn-primary" id="catContinue" type="button">VOLVER AL MAPA →</button>`);
    $('#catContinue').onclick = hideCard;
  }
  function showWolfEncounter() {
    if (wolfDefeated) { notify('El lobo ya dejó libre el portal.'); return; }
    showCard(`<div class="eyebrow">RETO DEL MUNDO 2 · GUARDIÁN DEL PORTAL</div>${portraitCanvas('wolf')}<h1>El lobo<br><span>bloquea el paso</span></h1>
      <p>No hace falta pelear. Mimo y Pixel le explicaron a Finn que el ruido de la lata vacía de Pepsi distrae al lobo. Aprovecha el momento y cruza el portal del cañón.</p>
      <button class="btn btn-primary" id="distractWolf" type="button">LANZAR LA LATA →</button>`);
    $('#distractWolf').onclick = () => {
      wolfDefeated = true; wolf.state = 'fleeing'; wolf.t0 = time;
      Object.assign(can, { active: true, t0: time, x0: playerCenter() + 20, y0: player.y + 10 });
      hideCard(); uiKey = ''; updateUI(); notify('¡Cling! El lobo corre tras la lata y el portal queda libre.');
    };
  }
  function openStationRiddle(station) {
    if (!station.riddle || station.solved || overlayOpen()) return;
    activeRiddle = station;
    const puzzles = {
      cola: { title: 'Desafío del analizador', prompt: '¿Qué gas está disuelto en la Pepsi y forma sus burbujas?', answers: ['Oxígeno', 'Dióxido de carbono (CO₂)', 'Vapor de agua'], correct: 1, hint: 'Es el gas que también aparece en las burbujas de muchas bebidas.' },
      mentos: { title: 'Reto de la lupa', prompt: '¿Qué hacen las pequeñas cavidades de la superficie del Mentos?', answers: ['Crean un gas nuevo', 'Ayudan a que se formen burbujas rápidamente', 'Congelan la bebida'], correct: 1, hint: 'Piensa en lugares donde las burbujas pueden empezar a crecer.' },
      gafas: { title: 'Control de seguridad', prompt: '¿Qué equipo ayuda a proteger los ojos durante una demostración supervisada?', answers: ['Gafas de protección', 'Una bufanda', 'Guantes de jardinería solamente'], correct: 0, hint: 'Busca el equipo diseñado para cubrir los ojos.' },
    };
    const puzzle = puzzles[station.riddle];
    showCard(`<div class="eyebrow">RETO DEL MUNDO ${levelAt(player.x) + 1}</div><h1>${puzzle.title}</h1><p>${puzzle.prompt}</p><div class="options">${puzzle.answers.map((answer, index) => `<button class="option" data-choice="${index}">${String.fromCharCode(65 + index)} · ${answer}</button>`).join('')}</div><div id="feedback" aria-live="polite"></div><button class="btn btn-quiet" id="closeRiddle" type="button">VOLVER AL MAPA</button>`);
    $('#closeRiddle').onclick = () => { activeRiddle = null; hideCard(); };
    card.querySelectorAll('.option').forEach(button => button.onclick = () => {
      if (Number(button.dataset.choice) !== puzzle.correct) { mistakes++; button.classList.add('wrong'); $('#feedback').innerHTML = `<p>${puzzle.hint} Inténtalo de nuevo.</p>`; return; }
      station.solved = true; inventoryItems++;
      if (station.type === 'botella') hasCola = true;
      if (station.type === 'menta') hasMentos = true;
      if (station.type === 'gafa') hasGoggles = true;
      activeRiddle = null; emit(station.x, FLOOR - 64, 18); hideCard();
      notify(station.type === 'botella' ? 'Acertijo resuelto: Pepsi desbloqueada. El portal al cañón está abierto.' : station.type === 'menta' ? 'Acertijo resuelto: mentas desbloqueadas. Busca al lobo guardián.' : 'Acertijo resuelto: gafas de protección desbloqueadas.');
      uiKey = ''; updateUI();
    });
  }
  function collect() {
    for (const item of items) {
      if (item.type !== 'nota' || item.got) continue;
      if (!inCurrentLevel(item.x)) continue;
      if (Math.abs(playerCenter() - item.x) > 34 || Math.abs(player.y + player.h / 2 - item.y) > 54) continue;
      item.got = true; collectedNotes++;
      const [title, body] = notes[item.note];
      showCard(`<div class="eyebrow">CUADERNO DE FINN · PISTA ${collectedNotes}/5</div><h1>${title}</h1><p>${body}</p><button class="btn btn-primary" id="continueWalk" type="button">CONTINUAR →</button>`);
      $('#continueWalk').onclick = hideCard; emit(item.x, item.y, 12); uiKey = '';
    }
  }

  function doctorDialogue() {
    showCard(`<div class="eyebrow">CAPÍTULO II · EL OBSERVATORIO</div><h1>¡Has encontrado<br>a <span>la doctora!</span></h1>
      <p>«La pregunta del cuaderno dice Pepsi + Mentos. ¿Se produce una reacción química? Antes de responder, observa: la bebida ya contiene CO₂ disuelto, y la superficie rugosa del caramelo ofrece muchísimos lugares para formar burbujas».</p>
      <div class="fact"><span class="fact-icon">CO₂</span><span><b>Nucleación:</b> el inicio de las burbujas en pequeñas cavidades. La fuente puede ser espectacular sin que se cree un gas nuevo.</span></div>
      <p>Finn sigue creyendo que puede haber una reacción. La doctora lo invita a comprobarlo mediante una demostración segura.</p><button class="btn btn-primary" id="toGarden" type="button">PREPARAR LA MISIÓN →</button>`);
    $('#toGarden').onclick = () => { mode = 'garden'; player.x = 3650; player.y = FLOOR - player.h; camera.x = Math.max(levels[2].start, Math.min(levels[2].end - W, player.x - W * .42)); hideCard(); notify('Camina hasta la fuente y pulsa E.'); };
  }
  function safetyQuiz() {
    showCard(`<div class="eyebrow">CAPÍTULO III · PLANEAR LA MISIÓN</div><h1>¿Dónde hacemos<br>la <span>demostración?</span></h1>
      <p>La misión Pepsi + Mentos se representa con un modelo de la fuente. ¿Qué hace que una demostración así sea más segura?</p>
      <div class="options"><button class="option" data-answer="a">A · Un lugar cerrado y una botella agitada</button><button class="option" data-answer="b">B · El jardín abierto, protección ocular y supervisión adulta</button><button class="option" data-answer="c">C · Apuntar el surtidor hacia el público</button></div><div id="feedback" aria-live="polite"></div>`);
    card.querySelectorAll('.option').forEach(button => button.onclick = () => {
      if (button.dataset.answer !== 'b') { mistakes++; button.classList.add('wrong'); $('#feedback').innerHTML = '<p>Piensa en aire libre, supervisión adulta y distancia segura.</p>'; return; }
      button.classList.add('correct');
      $('#feedback').innerHTML = '<p>¡Exacto! El jardín tiene espacio despejado, la doctora supervisa y el público se queda tras la línea amarilla.</p><button class="btn btn-primary" id="prepare" type="button">ENCENDER EL MODELO →</button>';
      $('#prepare').onclick = startDemo;
    });
  }
  function startDemo() {
    hideCard(); mode = 'fountain'; demo = { start: time, end: time + 10, running: true, fountain: true };
    player.x = Math.min(player.x, FOUNTAIN_X - 330); camera.x = Math.max(levels[2].start, Math.min(levels[2].end - W, FOUNTAIN_X - W * .62));
    uiKey = ''; updateUI();
  }
  function showSorting() {
    mode = 'quiz'; uiKey = ''; updateUI(); let solved = 0;
    showCard(`<div class="eyebrow">CAPÍTULO IV · CUADERNO DE FINN</div><h1>Lo que veo<br><span>y lo que creo</span></h1>
      <p>Un buen científico separa lo que observa de lo que imagina. Clasifica cada frase.</p>
      <div class="sort-list">${sortItems.map(([text], i) => `<div class="sort-row" data-i="${i}"><span>${text}</span><div class="sort-actions"><button class="sort-btn" data-guess="veo" type="button">LO QUE VEO</button><button class="sort-btn" data-guess="creo" type="button">LO QUE CREO</button></div></div>`).join('')}</div>
      <div id="feedback" aria-live="polite"></div><button class="btn btn-primary" id="sortNext" type="button" hidden>CONTINUAR →</button>`);
    card.querySelectorAll('.sort-btn').forEach(button => button.onclick = () => {
      const row = button.closest('.sort-row'), answer = sortItems[Number(row.dataset.i)][1];
      if (button.dataset.guess !== answer) { mistakes++; button.classList.add('wrong'); $('#feedback').innerHTML = `<p>${answer === 'veo' ? 'Eso se puede observar o medir directamente.' : 'Eso es una explicación posible: todavía necesita pruebas.'}</p>`; return; }
      row.classList.add('done'); button.classList.add('correct'); row.querySelectorAll('.sort-btn').forEach(b => b.disabled = true); $('#feedback').innerHTML = ''; solved++;
      if (solved === sortItems.length) { $('#feedback').innerHTML = '<p>¡Muy bien! «Sale espuma» es una observación; «se creó un gas nuevo» todavía necesita pruebas.</p>'; $('#sortNext').hidden = false; $('#sortNext').focus(); }
    });
    $('#sortNext').onclick = scienceQuiz;
  }
  function scienceQuiz() {
    mode = 'quiz'; uiKey = ''; updateUI();
    showCard(`<div class="eyebrow">CAPÍTULO V · PIENSA COMO CIENTÍFICO</div><h1>¿De dónde viene<br>el <span>CO₂?</span></h1>
      <p>La fuente subió después de juntar Pepsi y Mentos en el modelo. ¿Se formó un gas nuevo en una reacción química?</p><div class="options"><button class="option" data-answer="a">A · Sí. El Mentos produjo CO₂ nuevo al reaccionar con la Pepsi.</button><button class="option" data-answer="b">B · No. El CO₂ que ya estaba disuelto salió deprisa; el Mentos facilitó la nucleación.</button><button class="option" data-answer="c">C · Sí. La Pepsi se transformó en oxígeno.</button></div><div id="feedback" aria-live="polite"></div>`);
    card.querySelectorAll('.option').forEach(button => button.onclick = () => {
      if (button.dataset.answer !== 'b') { mistakes++; button.classList.add('wrong'); $('#feedback').innerHTML = '<p>La altura impresiona, pero no prueba que apareciera una sustancia nueva. Busca la explicación del CO₂ disuelto y la nucleación.</p>'; return; }
      button.classList.add('correct');
      $('#feedback').innerHTML = '<p>¡Correcto! La Pepsi ya tenía CO₂ disuelto. Las cavidades del Mentos facilitan la formación rápida de burbujas: es principalmente un proceso físico, no una reacción química que fabrique gas nuevo.</p><button class="btn btn-primary" id="finish" type="button">VER EL EPÍLOGO →</button>';
      $('#finish').onclick = startFinale;
    });
  }
  function startFinale() {
    hideCard(); mode = 'finale'; finale = { start: time, total: 22, done: false, nextFirework: 0 };
    particles = []; confetti = []; fireworks = [];
    player.x = 3730; player.facing = -1; player.vx = player.vy = 0;
    camera.x = Math.max(levels[2].start, Math.min(levels[2].end - W, FOUNTAIN_X - W * .62));
    cats[0].x = 3440; cats[0].dir = 1; cats[1].x = 3510; cats[1].dir = 1; cats[2].x = 3575; cats[2].dir = 1;
    $('#bottom').hidden = true; uiKey = ''; updateUI();
  }
  function showCertificate() {
    const stars = mistakes <= 1 ? 3 : mistakes <= 4 ? 2 : 1;
    const solved = challengeStations.filter(s => s.solved).length;
    showCard(`<div class="certificate"><div class="eyebrow">EPÍLOGO · UNA CIENCIA QUE SIGUE</div>
      <h1>Certificado de<br><span>científico honesto</span></h1>
      <div class="stars" aria-label="${stars} de 3 estrellas">${'★'.repeat(stars)}<i>${'★'.repeat(3 - stars)}</i></div>
      <p>Finn llegó creyendo que Pepsi y Mentos reaccionaban. Se marcha con una conclusión mejor apoyada por lo que observó.</p>
      <div class="cert-stats"><div><b>${collectedNotes}/5</b><small>pistas del cuaderno</small></div><div><b>${solved}/3</b><small>retos resueltos</small></div><div><b>1</b><small>hipótesis corregida</small></div></div>
      <div class="fact"><span class="fact-icon">CO₂</span><span>«Al añadir Mentos a una bebida carbonatada, se forman muchas burbujas con rapidez. La explicación principal es la salida del CO₂ disuelto en sitios de nucleación; esto no prueba que se creara una sustancia nueva».</span></div>
      <label class="next-label" for="nextQ">Tu próxima pregunta de científico:</label>
      <textarea id="nextQ" maxlength="140" rows="2" placeholder="¿Qué cambiaría si comparo dos bebidas distintas?"></textarea>
      <div class="notebook" id="notebookPage" hidden><b>CUADERNO DE FINN · PÁGINA NUEVA</b><span id="notebookText"></span></div>
      <p class="safety-note">Recuerda: esto fue un modelo del juego. Cualquier experimento real se hace al aire libre, con una persona adulta, protección ocular y distancia; nunca cierres ni agites recipientes presurizados.</p>
      <button class="btn btn-primary" id="saveQ" type="button">ANOTAR EN EL CUADERNO</button>
      <button class="btn btn-quiet" id="replayFinale" type="button">VER LA FUENTE OTRA VEZ</button>
      <button class="btn btn-quiet" id="again" type="button">VOLVER A JUGAR ↻</button></div>`, { lock: true, noFocus: true });
    $('#saveQ').onclick = () => {
      const text = $('#nextQ').value.trim() || '¿Qué más puedo descubrir si miro de nuevo?';
      $('#notebookText').textContent = `“${text}”`; $('#notebookPage').hidden = false; $('#saveQ').textContent = '✓ ANOTADA';
      for (let i = 0; i < 40; i++) confetti.push({ x: Math.random() * W, y: -10, vx: (Math.random() - .5) * 60, vy: 70 + Math.random() * 90, rot: 0, vr: (Math.random() - .5) * 8, color: `hsl(${Math.random() * 360}, 85%, 62%)`, size: 5 + Math.random() * 5 });
    };
    $('#replayFinale').onclick = startFinale;
    $('#again').onclick = resetGame;
  }
  function resetGame() {
    for (const item of items) delete item.got;
    for (const station of challengeStations) station.solved = false;
    for (const cat of cats) { cat.x = cat.home; cat.dir = 1; }
    Object.assign(wolf, { x: WOLF_X, state: 'guard', t0: 0, gone: false }); can.active = false;
    mode = 'intro'; player.x = 95; player.y = FLOOR - player.h; player.vx = player.vy = 0; player.facing = 1; camera.x = 0;
    collectedNotes = inventoryItems = mistakes = 0; hasCola = hasMentos = hasGoggles = wolfDefeated = false;
    mapTraveling = false; activeRiddle = null; particles = []; confetti = []; fireworks = []; demo = { start: 0, end: 0, running: false, fountain: false };
    mission.hidden = true; materialsPanel.hidden = true; $('#bottom').hidden = true;
    overlay.classList.remove('map-closing', 'map-opening', 'map-transition');
    $('#homeScreen').classList.remove('hidden'); hideCard(); uiKey = ''; updateUI();
  }

  /* ---------- Calibrador de sprites (tecla G) ---------- */
  function showSpriteLab() {
    const wolfTab = labTab === 'wolf', sheet = wolfTab ? wolfIdle : catSprite, c = spriteCfg[labTab];
    const rows = ok(sheet) ? Math.max(1, Math.floor(sheet.naturalHeight / c.frame)) : 0;
    const tiles = Array.from({ length: Math.min(rows, wolfTab ? 8 : 40) }, (_, r) =>
      `<div class="lab-tile${r === c.rowRight ? ' on-right' : ''}${r === c.rowLeft ? ' on-left' : ''}"><canvas class="lab-canvas" data-row="${r}" width="${wolfTab ? 88 : 64}" height="${wolfTab ? 88 : 64}"></canvas><small>FILA ${r}</small><div class="lab-actions"><button type="button" data-act="right" data-row="${r}">MIRA →</button><button type="button" data-act="left" data-row="${r}">← MIRA</button></div></div>`).join('');
    showCard(`<div class="eyebrow">AJUSTE DE SPRITES · TECLA G</div><h1>Calibrar <span>${wolfTab ? 'lobo' : 'gatos'}</span></h1>
      <p>Elige la fila que mira a la derecha (→) y la que mira a la izquierda (←). Se guarda en este navegador. Actual: derecha = ${c.rowRight}, izquierda = ${c.rowLeft}.</p>
      <div class="lab-tabs"><button class="btn ${wolfTab ? 'btn-primary' : 'btn-quiet'}" data-tab="wolf" type="button">LOBO</button><button class="btn ${wolfTab ? 'btn-quiet' : 'btn-primary'}" data-tab="cat" type="button">GATOS</button></div>
      ${rows ? `<div class="lab-grid">${tiles}</div>` : '<div class="fact"><span class="fact-icon">!</span><span>No se encontró la imagen de esta hoja. Revisa la carpeta assets/ (se usa un dibujo de reemplazo mientras tanto).</span></div>'}
      <button class="btn btn-primary" id="labClose" type="button">LISTO</button><button class="btn btn-quiet" id="labReset" type="button">RESTABLECER</button>`);
    $('#labClose').onclick = hideCard;
    $('#labReset').onclick = () => { Object.assign(spriteCfg[labTab], { rowRight: DEFAULT_SPRITES[labTab].rowRight, rowLeft: DEFAULT_SPRITES[labTab].rowLeft }); saveSpriteConfig(); showSpriteLab(); };
    card.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { labTab = b.dataset.tab; showSpriteLab(); });
    card.querySelectorAll('[data-act]').forEach(b => b.onclick = () => { spriteCfg[labTab][b.dataset.act === 'right' ? 'rowRight' : 'rowLeft'] = Number(b.dataset.row); saveSpriteConfig(); showSpriteLab(); });
  }
  function drawLab() {
    const wolfTab = labTab === 'wolf', sheet = wolfTab ? wolfIdle : catSprite, c = spriteCfg[labTab];
    if (!ok(sheet)) return;
    const frames = wolfTab ? wolfFrames(wolfIdle) : Math.max(1, Math.min(c.frames, Math.floor(sheet.naturalWidth / c.frame)));
    for (const canvasEl of document.querySelectorAll('canvas.lab-canvas')) {
      const g = canvasEl.getContext('2d'); g.clearRect(0, 0, canvasEl.width, canvasEl.height); g.imageSmoothingEnabled = false;
      g.drawImage(sheet, (Math.floor(time * 8) % frames) * c.frame, Number(canvasEl.dataset.row) * c.frame, c.frame, c.frame, 0, 0, canvasEl.width, canvasEl.height);
    }
  }

  /* ---------- Física y bucle ---------- */
  function physics(dt) {
    if (!['walk', 'garden'].includes(mode) || overlayOpen()) { if (mode !== 'finale') player.vx = 0; return; }
    const left = keys.ArrowLeft || keys.KeyA, right = keys.ArrowRight || keys.KeyD;
    player.vx = ((right ? 1 : 0) - (left ? 1 : 0)) * 240;
    if (player.vx) player.facing = Math.sign(player.vx);
    if (jumpQueued && player.onGround) { player.vy = -630; player.onGround = false; }
    jumpQueued = false;
    const oldBottom = player.y + player.h; player.vy += 1550 * dt;
    const activeIndex = levelAt(player.x), activeLevel = levels[activeIndex];
    const attemptedX = player.x + player.vx * dt;
    const lowerBound = Math.max(20, activeLevel.start);
    let nextX = Math.max(lowerBound, Math.min(activeLevel.end - player.w, attemptedX));
    // Salida hacia el siguiente mundo
    if (activeIndex < levels.length - 1 && player.vx > 0 && attemptedX + player.w > activeLevel.end) {
      const reachedExit = player.x + player.w <= activeLevel.end;
      nextX = activeLevel.end - player.w;
      if (reachedExit) {
        const exitReady = activeIndex === 0 ? hasCola : hasMentos && wolfDefeated;
        if (exitReady && player.onGround) showMapTransition(activeIndex + 1, 'forward');
        else if (time >= toastUntil) notify(activeIndex === 0 ? 'Resuelve el analizador para abrir el camino al Cañón.' : 'Consigue las mentas y distrae al lobo para abrir el camino al Observatorio.');
      }
    }
    // Regreso al mundo anterior
    if (mode === 'walk' && activeIndex > 0 && player.vx < 0 && attemptedX < activeLevel.start + 2 && player.onGround && !mapTraveling) {
      nextX = activeLevel.start + 2; showMapTransition(activeIndex - 1, 'back');
    }
    player.x = nextX; player.y += player.vy * dt; player.onGround = false;
    for (const p of platforms) if (player.x + player.w > p.x && player.x < p.x + p.w && oldBottom <= p.y + 5 && player.y + player.h >= p.y && player.vy >= 0) { player.y = p.y - player.h; player.vy = 0; player.onGround = true; }
    camera.x = Math.max(activeLevel.start, Math.min(activeLevel.end - W, player.x - W * .42));
    collect();
  }
  function interact() {
    if (overlayOpen()) return;
    if (mode === 'finale') { if (!finale.done) finale.start = Math.min(finale.start, time - finale.total); return; }
    const near = (x, r) => Math.abs(playerCenter() - x) < r;
    const nearbyStation = challengeStations.find(station => near(station.x, 90));
    const nearbyCat = cats.find(cat => inCurrentLevel(cat.home) && near(cat.x, 80));
    if (mode === 'walk' && nearbyStation) { if (nearbyStation.solved) notify('Este acertijo ya está resuelto. Continúa por el camino.'); else openStationRiddle(nearbyStation); return; }
    if (mode === 'walk' && inCurrentLevel(WOLF_X) && near(WOLF_X, 120) && !wolfDefeated) { showWolfEncounter(); return; }
    if (['walk', 'garden'].includes(mode) && nearbyCat) { showCatDialogue(nearbyCat); return; }
    if (mode === 'walk' && near(DOCTOR_X + 28, 160)) {
      if (collectedNotes < 5) { notify(`Busca las cinco notas antes de hablar con la doctora: ${collectedNotes}/5.`); return; }
      if (!hasCola || !hasMentos) { notify(`Prepara la misión: Pepsi ${hasCola ? '✓' : 'pendiente'} · Mentos ${hasMentos ? '✓' : 'pendiente'}.`); return; }
      if (!hasGoggles) { notify('Resuelve el acertijo de las gafas en este mapa.'); return; }
      doctorDialogue(); return;
    }
    if (mode === 'garden' && near(FOUNTAIN_X, 170)) { safetyQuiz(); return; }
    notify(mode === 'walk' ? 'Acércate a las pistas brillantes, estaciones o personajes.' : 'Acércate a la fuente para interactuar.');
  }
  function render(dt) {
    ctx.clearRect(0, 0, W, H); drawBackground();
    if (mode === 'finale') drawFinaleOverlay(dt);
    drawPlatforms(); drawLevelGates(); drawChallengeStations(); drawFountain();
    for (const item of items) if (!item.got) drawItem(item);
    drawCats(); drawWolf(); drawCan(); drawDoctor(); drawPlayer(); drawParticles(dt);
    if (mode === 'fountain') drawDemoCaption();
    if (mode === 'finale') { drawConfetti(dt); drawFinaleCaption(); }
    else if (confetti.length) drawConfetti(dt);
    if (toast && time < toastUntil) {
      ctx.font = `700 15px ${FONT}`; const text = toast.length > 88 ? `${toast.slice(0, 85)}…` : toast; const width = Math.min(W - 48, ctx.measureText(text).width + 38);
      rounded((W - width) / 2, 120, width, 42, 6, '#fff5deee'); ctx.fillStyle = '#183a42'; ctx.textAlign = 'center'; ctx.fillText(text, W / 2, 146, width - 20); ctx.textAlign = 'left';
    }
    updateUI(); drawPortraits(); if (labOpen()) drawLab();
  }
  const labOpen = () => overlayOpen() && !!card.querySelector('.lab-grid');
  function frame(timestamp) {
    const dt = Math.min(.035, (timestamp - last) / 1000 || 0); last = timestamp; time += dt;
    physics(dt); updateCats(dt); updateWolf(dt); updateFountainEffects(dt);
    render(dt); requestAnimationFrame(frame);
  }

  /* ---------- Eventos ---------- */
  $('#startBtn').addEventListener('click', startGame);
  $('#howBtn').addEventListener('click', showGuide);
  $('#fullscreenBtn').addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', () => {
    const button = $('#fullscreenBtn'), active = !!document.fullscreenElement;
    button.title = active ? 'Salir de pantalla completa' : 'Pantalla completa'; button.setAttribute('aria-label', button.title);
  });
  $('#brandLink').addEventListener('click', event => { event.preventDefault(); resetGame(); });
  document.addEventListener('keydown', event => {
    if (['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
    if (!overlayOpen() && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) event.preventDefault();
    if (event.code === 'KeyF') { toggleFullscreen(); return; }
    if (event.code === 'KeyG' && mode !== 'finale' && !overlayOpen()) { showSpriteLab(); return; }
    if (event.code === 'Escape' && overlayOpen() && !overlay.dataset.lock) { activeRiddle = null; hideCard(); return; }
    if (mode === 'intro' && ['Enter', 'Space'].includes(event.code) && event.target.tagName !== 'BUTTON' && !overlayOpen()) { startGame(); return; }
    if (!keys[event.code] && ['Space', 'ArrowUp', 'KeyW'].includes(event.code)) jumpQueued = true;
    keys[event.code] = true;
    if (event.code === 'KeyE' || (event.code === 'Enter' && event.target.tagName !== 'BUTTON')) interact();
  });
  document.addEventListener('keyup', event => { keys[event.code] = false; });
  window.addEventListener('blur', () => { for (const key in keys) keys[key] = false; jumpQueued = false; });
  for (const button of document.querySelectorAll('.mobile button')) {
    const key = button.dataset.key;
    button.addEventListener('pointerdown', event => { event.preventDefault(); if (key === 'KeyE') { interact(); return; } button.setPointerCapture(event.pointerId); if (!keys[key] && key === 'Space') jumpQueued = true; keys[key] = true; });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, () => { keys[key] = false; });
  }
  updateUI(); requestAnimationFrame(frame);
})();
