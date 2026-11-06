/* =========================================================================
   boss.js v2 — boss gigante, Expansão de Domínio, tiro contínuo (F), ULTRA (U),
   escada de saída e espinhos. Fica ao lado do jogo.html (e do boss.png) e é ligado
   por UMA linha antes de </body>:   <script src="boss.js"></script>
   ========================================================================= */
(() => {
const CFG = {
  BOSS_HP: 100, BOSS_TAM: 520, BOSS_OLHA_PARA: "direita",   // para onde o boss.png olha
  DANO_TIRO: 0.6, CD_TIRO: 0.085,         // segure F: ~12 tiros/s
  DANO_ULTRA: 25, ULTRA_POR_ACERTO: 2.5,  // a barra do ULTRA enche acertando o boss (40 acertos)
  DOMINIO_EM: 65,                         // o boss abre a Expansão de Domínio quando chega a 65 de vida
  ESCADA: { x: 1424, y: 1215, meia: 480 },
  DESENHAR_ESPINHOS: true,
  EXPANSAO_MODO: "cobrir",   // expansao.png: "cobrir" (corta as sobras, sem distorcer) ou "esticar" (mostra tudo, pode distorcer)
  EXPANSAO_PISO: null,       // piso andável na expansão: null = igual às salas; ou 4 pontos [[x,y],...] em frações (0 a 1)
  CURAS_NO_DOMINIO: 2        // quantas curas o gato tem em cada Expansão de Domínio
};
const ESC = CFG.ESCADA, sg = v => (v < 0 ? -1 : 1), TAU = Math.PI * 2;
const bossImg = new Image(); bossImg.src = "boss.png";
const expansaoImg = new Image(); expansaoImg.src = "expansao.png";   // cenário da Expansão de Domínio (opcional)
let arma = false, boss = null, bossMorto = false, trap = null, trapFase = "";
let cdTiro = 0, tiros = [], part = [], ondas = [], aneis = [], cortes = [], ult = 0, ultra = null, dom = null, orig = null, arena = null;
let segMouse = false, segJ = false, segF = false, mouseDir = 1, debugOn = false, clique = null, avisoT = 0, sHit = 0;
let cura = { cargas: 0, cd: 0, canal: 0, v0: 3, flash: 0 }, arenaImg = null, modoToque = false, segT = false, ui = null;

/* ---------- mapa: escada do salão, sala3 sem fantasmas, chave só com o boss morto ---------- */
const z2 = ZONAS[2];
z2.bloq = z2.bloq.filter(r => !(r[0] === 870 && r[1] === 1200 && r[2] === 1965 && r[3] === 1480));
z2.bloq.push([870, 1200, 944, 1480], [1904, 1200, 1965, 1480]); z2.ok.push([944, 1195, 1904, 1480]);
SAIDA.y = 1e9; ITENS[5].length = 0;
document.getElementById("dica").textContent = "W A S D andar · SHIFT/ESPAÇO pular · segure F (ou clique) para atirar · U ultra · 2 chaves + suba a escada do salão";
const _ci = criarInimigos; criarInimigos = function () { _ci(); INIM[5] = []; }; criarInimigos();
alarme = function () { dica(nChaves() === 2 ? "Você tem as duas chaves! Volte ao salão e SUBA A ESCADA" : "Chave prata! Falta a dourada (corredor roxo)", 7000); };

/* ---------- sons e voz ---------- */
function som(t) {
  if (!audio || mudo) return;
  if (t === "tiro") tom("sine", 1100, 500, 0.06, 0.02);
  else if (t === "orbe") tom("square", 300, 110, 0.3, 0.06);
  else if (t === "rugido") { tom("sawtooth", 110, 45, 0.9, 0.12); ruido(0.7, 0.2, 500); }
  else if (t === "onda") { tom("sine", 120, 30, 0.7, 0.2); ruido(0.5, 0.25, 250); }
  else if (t === "corte") { tom("sawtooth", 1200, 200, 0.14, 0.08); ruido(0.14, 0.18, 4000); }
  else if (t === "ultra1") tom("sawtooth", 80, 900, 0.7, 0.1);
  else if (t === "ultra2") { tom("sawtooth", 300, 50, 1, 0.14); ruido(1, 0.3, 2500); }
  else if (t === "cura1") tom("sine", 330, 660, 1.1, 0.06);
  else if (t === "cura2") { tom("triangle", 660, 1320, 0.3, 0.12); tom("sine", 990, 1980, 0.4, 0.1, 0.12); }
}
function falar() {   // o boss realmente fala (voz do navegador, grave e lenta)
  if (mudo || typeof speechSynthesis === "undefined") return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance("Expansão de Domínio. Santuário Maligno."); u.lang = "pt-BR"; u.pitch = 0.05; u.rate = 0.7; speechSynthesis.speak(u); } catch (e) {}
}

/* ---------- tiros: F contínuo + mouse + J ---------- */
const alvoBoss = () => boss && cena === 5 && !["morto", "intro", "dominio"].includes(boss.estado) ? boss : null;
function novoTiro(o) { const p = Object.assign({ proj: true, vivo: false, morte: 0, cena, t: 0, vy: 0 }, o); tiros.push(p); INIM[cena].push(p); return p; }
function removerTiro(p) { const k = INIM[p.cena].indexOf(p); if (k >= 0) INIM[p.cena].splice(k, 1); const j = tiros.indexOf(p); if (j >= 0) tiros.splice(j, 1); }
function limparTiros() { tiros.slice().forEach(removerTiro); }
function atirar(lado) {
  if (!arma || fim || transicao || emerge || debugOn || ultra || (dom && dom.fase === "cena") || cdTiro > 0 || cura.canal > 0) return;
  const alvo = alvoBoss(), dir = lado || (teclas.a ? -1 : teclas.d ? 1 : alvo ? sg(alvo.x - gato.x) : gato.dir);
  gato.dir = dir;
  const py = gato.y + PES, S = Sf(py);
  novoTiro({ dono: "g", x: gato.x + dir * 70 * S, y: py + rand(-12, 12), z: gato.z + 85 * S + rand(-10, 10), vx: dir * 1100, vy: rand(-60, 60), r: 9 * S + 5, dano: CFG.DANO_TIRO });
  cdTiro = CFG.CD_TIRO; if (Math.random() < 0.5) som("tiro");
}
function curar() {   // só funciona durante a Expansão de Domínio
  if (fim || transicao || emerge || ultra) return;
  if (!(dom && dom.fase === "ativo")) { if (avisoT <= 0) { avisoT = 1.5; dica("A cura só funciona durante a Expansão de Domínio!", 2500); } return; }
  if (cura.canal > 0 || cura.cd > 0) return;
  if (cura.cargas <= 0) { dica("Sem curas restantes neste Domínio", 2500); return; }
  if (vidas >= 3) { dica("Sua vida já está cheia", 2000); return; }
  cura.canal = 1.1; cura.v0 = vidas; som("cura1");   // 1,1 s concentrado: se levar dano, a cura é interrompida
}
function usarUltra() {
  if (!arma || fim || transicao || emerge || ultra || debugOn || (dom && dom.fase === "cena")) return;
  if (ult < 100) { if (avisoT <= 0) { avisoT = 1.5; dica(`ULTRA carregando — acerte o boss! (${Math.floor(ult)}%)`, 2000); } return; }
  const alvo = alvoBoss(), dir = alvo ? sg(alvo.x - gato.x) : gato.dir; gato.dir = dir; ult = 0;
  ultra = { t: 0, dir, x: gato.x, y: gato.y + PES, fez: false }; inv = Math.max(inv, 2.4); som("ultra1");
}
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "f") { iniciarSom(); segF = true; }
  if (k === "j") { iniciarSom(); segJ = true; }
  if (k === "u" && !e.repeat) { iniciarSom(); usarUltra(); }
  if (k === "c" && !e.repeat) curar();
  if (k === "h" && !e.repeat) debugOn = !debugOn;
  if (k === "b" && !e.repeat && cena !== 5 && !fim && !transicao && !dom) { iniciarSom(); trocar(5); dica("Atalho de teste (B): indo direto para o quarto do boss", 5000); }
});
addEventListener("keyup", (e) => { const k = e.key.toLowerCase(); if (k === "f") segF = false; if (k === "j") segJ = false; });
addEventListener("blur", () => { segJ = segF = segMouse = false; });
addEventListener("mouseup", () => { segMouse = false; });
canvas.addEventListener("mousedown", (e) => {
  if (modoToque) return;
  iniciarSom();
  if (debugOn) { clique = { x: Math.round(cam.x + e.clientX / escala), y: Math.round(cam.y + e.clientY / escala) }; console.log("mundo:", clique); return; }
  segMouse = true; mouseDir = e.clientX > (gato.x - cam.x) * escala ? 1 : -1;
});
canvas.addEventListener("mousemove", (e) => { if (segMouse) mouseDir = e.clientX > (gato.x - cam.x) * escala ? 1 : -1; });

/* ---------- boss ---------- */
const mudar = (b, e) => { b.estado = e; b.est_t = 0; };
function criarBoss() {
  boss = { boss: true, vivo: false, morte: 0, x: ML * 0.70, y: MA * 0.86, hp: CFG.BOSS_HP, lag: 1, estado: "intro", est_t: 0, t: 0, dir: -1, flash: 0, ult: "", dd: 1, tm: 0, rugiu: false, domUsado: false, rastro: [], tontoDur: 1.2 };
  INIM[5].push(boss);
}
const faisca = (b, n, v, c) => { for (let i = 0; i < n; i++) part.push({ x: b.x + rand(-60, 60), y: b.y - rand(40, 300) * Sf(b.y), vx: rand(-v, v), vy: rand(-v, 0), t: 0, vida: rand(0.3, 0.8), g: 500, s: rand(5, 10), c }); };
function dano(b, d, forte) {
  if (b.estado === "morto") return;
  b.hp = Math.max(0, b.hp - d); b.flash = Math.max(b.flash, forte ? 1 : 0.45);
  if (forte) { faisca(b, 45, 320, "#9ff0ff"); if (b.hp > 0) { mudar(b, "tonto"); b.tontoDur = 2.4; } }
  if (b.hp <= 0) matarBoss();
}
function golpe(p) {
  const b = boss; dano(b, p.dano * (b.estado === "tonto" ? 1.5 : 1));
  if (!ultra) ult = Math.min(100, ult + CFG.ULTRA_POR_ACERTO);
  part.push({ x: p.x, y: p.y - p.z * Sf(p.y), vx: rand(-150, 150), vy: rand(-200, 0), t: 0, vida: 0.35, g: 500, s: 6, c: "#9ff0ff" });
  if (tempo - sHit > 0.1) { sHit = tempo; sfx("esmaga"); }
}
function matarBoss() {
  const b = boss; b.estado = "morto"; b.tm = 0; bossMorto = true; ondas = []; cortes = [];
  tiros.filter(p => p.dono === "b").forEach(removerTiro);
  shake = 1; flashBranco = 0.8; flashRed = 0.4; sfx("fim"); sfx("trovao"); som("onda");
  faisca(b, 90, 380, "#ff7a3a"); faisca(b, 40, 300, "#fff2d0");
  for (let i = 0; i < 4; i++) aneis.push({ x: b.x, y: b.y, r: 20, d: i * 0.18 });
  const chave = { id: 2, fx: lim(b.x / ML, 0.3, 0.7), fy: lim(b.y / MA, 0.72, 0.93) };
  if (dom) { dom.fase = "colapso"; dom.t = 0; dom.troca = false; dom.chave = chave; dom.px = b.x; dom.py = b.y; } else darChave(chave);
}
const darChave = (it) => { ITENS[5].push(it); dica("O Guardião caiu! Pegue a CHAVE PRATA que ele deixou", 8000); };

function iniciarDominio() {
  const b = boss; b.domUsado = true; mudar(b, "dominio");
  dom = { fase: "cena", t: 0, fala: false, troca: false, corteT: 1.2 };
  cura = { cargas: CFG.CURAS_NO_DOMINIO, cd: 0, canal: 0, v0: 3, flash: 0 };
  tiros.filter(p => p.dono === "b").forEach(removerTiro); ondas = []; sfx("rumble"); som("rugido"); shake = Math.max(shake, 0.6);
}
function renderExpansao() {   // ajusta expansao.png ao tamanho das salas (2492x1600) sem distorcer
  const L = 2492, A = MA, c = document.createElement("canvas"); c.width = L; c.height = A;
  const g = c.getContext("2d"), iw = expansaoImg.naturalWidth, ih = expansaoImg.naturalHeight;
  if (CFG.EXPANSAO_MODO === "esticar") g.drawImage(expansaoImg, 0, 0, L, A);
  else { const k = Math.max(L / iw, A / ih), w = iw * k, h = ih * k; g.drawImage(expansaoImg, (L - w) / 2, (A - h) / 2, w, h); }
  return c;
}
function ativarFundo() {
  const img = pronto(expansaoImg), cv = img ? (arenaImg = arenaImg || renderExpansao()) : (arena = arena || criarArena());
  orig = { s: salaImg[5], f: fundos[5], t: TINTA[5], b: BRILHOS[5], img, piso: null };
  salaImg[5] = { complete: false, naturalWidth: 0 }; fundos[5] = cv;
  TINTA[5] = img ? "#f2e2de" : "#e8b0a8";
  BRILHOS[5] = img ? [] : [[0.5, 0.52, "255,50,40"], [0.2, 0.6, "255,40,30"], [0.8, 0.6, "255,40,30"]];
  if (CFG.EXPANSAO_PISO) { orig.piso = FPOLY.map(p => p.slice()); CFG.EXPANSAO_PISO.forEach((p, i) => { FPOLY[i][0] = p[0]; FPOLY[i][1] = p[1]; }); }
}
function restaurarFundo() {
  if (!orig) return; salaImg[5] = orig.s; fundos[5] = orig.f; TINTA[5] = orig.t; BRILHOS[5] = orig.b;
  if (orig.piso) orig.piso.forEach((p, i) => { FPOLY[i][0] = p[0]; FPOLY[i][1] = p[1]; });
  orig = null;
}
function atualizarDom(dt, py, ok) {
  if (!dom) return;
  dom.t += dt;
  if (dom.fase === "cena") {
    if (dom.t > 0.7 && !dom.fala) { dom.fala = true; falar(); shake = Math.max(shake, 0.4); }
    if (dom.t > 2.9 && !dom.troca) { dom.troca = true; ativarFundo(); flashBranco = 1; shake = 1; sfx("trovao"); sfx("susto"); }
    if (dom.t > 3.7) { dom.fase = "ativo"; dom.t = 0; dica("Santuário Maligno: pule os cortes e derrote o Guardião!", 6000); }
  } else if (dom.fase === "ativo" && boss && boss.estado !== "morto" && ok) {
    dom.corteT -= dt;
    if (dom.corteT <= 0) {   // rajada de cortes: faixa no chão (horizontal) ou coluna (vertical) — pule ou saia da linha
      dom.corteT = boss.hp < 30 ? 0.85 : 1.25;
      for (let n = boss.hp < 30 ? 2 : 1; n > 0; n--) {
        const h = Math.random() < 0.5;
        cortes.push({ h, pos: h ? lim(py + rand(-80, 80), SALA_Y_FUNDO * MA + 60, SALA_Y_PERTO * MA - 30) : lim(gato.x + rand(-140, 140), 200, ML - 200), t: 0, ang: rand(-0.5, 0.5), feito: false });
      }
    }
  } else if (dom.fase === "colapso") {
    if (dom.t > 1.5 && !dom.troca) { dom.troca = true; restaurarFundo(); flashBranco = 1; }
    if (dom.t > 2.6) { darChave(dom.chave); dom = null; cortes = []; cura.cargas = 0; cura.canal = 0; }
  }
  cortes.forEach(c => {
    c.t += dt;
    if (!c.feito && c.t >= 0.85) {
      c.feito = true; som("corte"); shake = Math.max(shake, 0.35);
      const hit = c.h ? Math.abs(py - c.pos) < 42 * Sf(py) + 16 : Math.abs(gato.x - c.pos) < 52;
      if (hit && gato.z < 80 && inv <= 0 && ok) ferir(gato.vx || 1);
    }
  });
  cortes = cortes.filter(c => c.t < 1.3);
}

function bossIA(dt, py, ok) {
  const b = boss; b.t += dt; b.flash = Math.max(0, b.flash - dt * 4); b.lag = Math.max(b.hp / CFG.BOSS_HP, b.lag - dt * 0.3);
  b.rastro.forEach(r => r.t += dt); b.rastro = b.rastro.filter(r => r.t < 0.3);
  if (b.estado === "morto") { b.tm += dt; if (b.tm > 2.0) { const k = INIM[5].indexOf(b); if (k >= 0) INIM[5].splice(k, 1); boss = null; part = []; aneis = []; } return; }
  if (emerge || !ok) return;
  b.est_t += dt;
  const S = Sf(b.y), [xl, xr] = bordas(b.y), dx = gato.x - b.x, f2 = b.hp <= 50, fu = dom && dom.fase === "ativo" ? 1.25 : 1, m = 130 * S, h = CFG.BOSS_TAM * S;
  if (b.estado !== "dash") b.dir = sg(dx);
  if (part.length < 350 && Math.random() < dt * 55) part.push({ x: b.x + rand(-0.28, 0.28) * h, y: b.y - rand(0.05, 0.8) * h, vx: rand(-25, 25), vy: rand(-140, -60), t: 0, vida: rand(0.7, 1.3), g: -30, s: rand(4, 8), c: dom ? "#ff3030" : "#ff7a3a" });
  const andaY = (v) => { b.y = lim(b.y + v, 0.66 * MA, 0.97 * MA); };
  const tocou = (rx, ry) => inv <= 0 && gato.z < 100 && Math.abs(gato.x - b.x) < rx * S && Math.abs(py - b.y) < ry * S + 16;
  if (!b.domUsado && b.hp <= CFG.DOMINIO_EM && b.estado === "andar") iniciarDominio();
  switch (b.estado) {
    case "intro":
      if (!b.rugiu && b.est_t > 1.0) { b.rugiu = true; som("rugido"); shake = Math.max(shake, 0.7); }
      if (b.est_t > 2.3) mudar(b, "andar");
      break;
    case "dominio": if (dom && dom.fase === "ativo") mudar(b, "andar"); break;
    case "andar": {
      const vx = (f2 ? 150 : 110) * fu * S;
      if (Math.abs(dx) > 300 * S) b.x += sg(dx) * vx * dt; else if (Math.abs(dx) < 200 * S) b.x -= sg(dx) * vx * 0.6 * dt;
      andaY(sg(py - b.y) * Math.min(90, Math.abs(py - b.y) * 3) * dt);
      if (tocou(110, 50)) ferir(dx);
      if (b.est_t > (f2 ? 0.9 : 1.4) / fu) {
        const pool = ["orbe", "dash", "pisao"].filter(a => a !== b.ult || Math.random() < 0.25), a = pool[Math.floor(Math.random() * pool.length)];
        b.ult = a; mudar(b, "aviso_" + a);
      }
      break;
    }
    case "aviso_dash":
      b.flash = 0.5 + 0.5 * Math.sin(b.est_t * 30); b.y += (py - b.y) * Math.min(1, dt * 6);
      if (b.est_t > 0.75 / fu) { b.dd = sg(dx); mudar(b, "dash"); som("rugido"); }
      break;
    case "dash":
      b.x += b.dd * (f2 ? 1050 : 900) * fu * S * dt; b.dir = b.dd; b.rastro.push({ x: b.x, y: b.y, d: b.dd, t: 0 });
      if (tocou(170, 55)) ferir(gato.x - b.x);
      if (b.x < xl + m || b.x > xr - m) { b.x = lim(b.x, xl + m, xr - m); shake = Math.max(shake, 0.6); mudar(b, "tonto"); }
      else if (b.est_t > 0.9) mudar(b, "tonto");
      break;
    case "tonto": if (b.est_t > b.tontoDur) { b.tontoDur = 1.2; mudar(b, "andar"); } break;   // zonzo: +50% de dano
    case "aviso_orbe":
      b.flash = 0.4 + 0.4 * Math.sin(b.est_t * 24);
      if (b.est_t > 0.6 / fu) {
        const base = Math.atan2(py - b.y, gato.x - b.x);
        (f2 ? [-0.32, 0, 0.32] : [0]).forEach(a => novoTiro({ dono: "b", x: b.x + b.dir * 0.45 * h, y: b.y, z: 0.5 * h, vx: Math.cos(base + a) * 430, vy: Math.sin(base + a) * 430, r: 26 * S + 8 }));
        som("orbe"); mudar(b, "andar");
      }
      break;
    case "aviso_pisao":
      b.flash = 0.3 + 0.3 * Math.sin(b.est_t * 20);
      if (b.est_t > 0.9 / fu) { ondas.push({ x: b.x, y: b.y, r: 40, t: 0 }); som("onda"); shake = Math.max(shake, 0.8); mudar(b, "andar"); }
      break;
  }
  b.x = lim(b.x, xl + m, xr - m);
}

/* ---------- armadilha da sala1 ---------- */
const TR = { primeiro: 1.6, aviso: 1.0, sobe: 1.4, desce: 2.4 };
function estadoTrap(t) {
  if (t < TR.primeiro) return { f: "aviso", u: t / TR.primeiro };
  const c = (t - TR.primeiro) % (TR.sobe + TR.desce + TR.aviso);
  if (c < TR.sobe) return { f: "sobe", u: c / TR.sobe };
  if (c < TR.sobe + TR.desce) return { f: "desce", u: 0 };
  return { f: "aviso", u: (c - TR.sobe - TR.desce) / TR.aviso };
}
desenharEspinhos = function (antes, py) {
  if (!trap || !CFG.DESENHAR_ESPINHOS) return;
  const yF = SALA_Y_FUNDO * MA, yN = SALA_Y_PERTO * MA, e = estadoTrap(trap.t);
  for (let i = 0; i < 15; i++) {
    const y = yF + (yN - yF) * Math.pow(i / 14, 1.35);
    if ((y <= py) !== antes) continue;
    let hf = 0;
    if (e.f === "sobe") { const v = e.u - (i / 14) * 0.2; hf = v < 0 ? 0 : v < 0.15 ? v / 0.15 : v > 0.8 ? Math.max(0, (1 - v) / 0.2) : 1; }
    else if (e.f === "aviso") hf = 0.07 * (0.5 + 0.5 * Math.sin(tempo * 30 + i)) * Math.min(1, e.u * 3);
    if (hf < 0.01) continue;
    const S = Sf(y), [xl, xr] = bordas(y), n = Math.max(2, Math.floor((xr - xl) / (115 * S))), w = (xr - xl) / n, bw = 30 * S, h = 130 * S * hf;
    for (let k = 0; k < n; k++) {
      const x = xl + (k + 0.5 + (i % 2 ? 0.5 : 0)) * w; if (x > xr - bw) continue;
      ctx.fillStyle = "#6d7682"; ctx.beginPath(); ctx.moveTo(x - bw, y); ctx.lineTo(x, y - h); ctx.lineTo(x, y); ctx.fill();
      ctx.fillStyle = "#c3ccd6"; ctx.beginPath(); ctx.moveTo(x + bw, y); ctx.lineTo(x, y - h); ctx.lineTo(x, y); ctx.fill();
    }
  }
};
function armadilha(dt, py, ok) {
  if (!trap) return;
  trap.t += dt; const e = estadoTrap(trap.t);
  if (e.f !== trapFase) { trapFase = e.f; if (e.f === "sobe") { sfx("espinhos"); shake = Math.max(shake, 0.5); } if (e.f === "aviso") sfx("rumble"); }
  if (e.f === "aviso") shake = Math.max(shake, 0.08 + 0.2 * e.u);
  if (e.f === "sobe" && e.u > 0.08 && e.u < 0.85 && ok && gato.z < 70 && inv <= 0) { ferir(gato.vx || 1); if (vidas > 0) dica("Espinhos! Pule por cima ou saia pela porta"); }
}

/* ---------- arena do Domínio (desenhada uma vez, em código) ---------- */
function criarArena() {
  const L = 2492, A = MA, hz = SALA_Y_FUNDO * A, c = document.createElement("canvas"); c.width = L; c.height = A;
  const g = c.getContext("2d"), cx = L / 2; let gr;
  gr = g.createLinearGradient(0, 0, 0, hz); gr.addColorStop(0, "#040001"); gr.addColorStop(0.65, "#3a0507"); gr.addColorStop(1, "#8a1512"); g.fillStyle = gr; g.fillRect(0, 0, L, hz + 2);
  gr = g.createRadialGradient(cx, hz * 0.42, 20, cx, hz * 0.42, 380); gr.addColorStop(0, "rgba(255,120,90,.9)"); gr.addColorStop(0.4, "rgba(200,30,30,.45)"); gr.addColorStop(1, "rgba(120,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, L, hz);
  g.fillStyle = "rgba(0,0,0,.35)"; for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse((i * 330 + 90) % L, 120 + (i % 4) * 110, 260, 40, 0, 0, TAU); g.fill(); }
  const telhado = (w, h, y) => { g.beginPath(); g.moveTo(cx - w / 2 - 90, y); g.quadraticCurveTo(cx - w / 2 + 10, y - 12, cx - w / 2 + 60, y - h); g.lineTo(cx + w / 2 - 60, y - h); g.quadraticCurveTo(cx + w / 2 - 10, y - 12, cx + w / 2 + 90, y); g.closePath(); g.fillStyle = "#0a0204"; g.fill(); g.strokeStyle = "#ff3a2a"; g.lineWidth = 3; g.stroke(); };
  g.fillStyle = "#0e0306"; g.fillRect(cx - 340, hz - 230, 680, 230); telhado(760, 90, hz - 230);
  g.fillStyle = "#0e0306"; g.fillRect(cx - 210, hz - 380, 420, 150); telhado(520, 80, hz - 380);
  g.fillStyle = "#0e0306"; g.fillRect(cx - 120, hz - 470, 240, 90); telhado(300, 80, hz - 470);
  g.strokeStyle = "#ff3a2a"; g.lineWidth = 4; g.beginPath(); g.moveTo(cx, hz - 550); g.lineTo(cx, hz - 640); g.stroke();
  [-1, 1].forEach(s => {   // costelas e chifres
    g.strokeStyle = "#cfc4b6"; g.lineWidth = 12; g.lineCap = "round";
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(cx + s * 420, hz - 20 - i * 34); g.quadraticCurveTo(cx + s * (560 + i * 25), hz - 70 - i * 34, cx + s * 430, hz - 120 - i * 34); g.stroke(); }
    g.fillStyle = "#d9cfc2"; g.beginPath(); g.moveTo(cx + s * 70, hz - 170); g.quadraticCurveTo(cx + s * 175, hz - 230, cx + s * 150, hz - 310); g.quadraticCurveTo(cx + s * 120, hz - 225, cx + s * 40, hz - 190); g.fill();
  });
  g.fillStyle = "#d9cfc2"; g.beginPath(); g.ellipse(cx, hz - 120, 95, 85, 0, 0, TAU); g.fill();   // caveira do santuário
  g.fillStyle = "#1a0a0c"; [-1, 1].forEach(s => { g.beginPath(); g.ellipse(cx + s * 38, hz - 125, 20, 26, 0, 0, TAU); g.fill(); });
  gr = g.createRadialGradient(cx, hz - 125, 0, cx, hz - 125, 90); gr.addColorStop(0, "rgba(255,40,30,.6)"); gr.addColorStop(1, "rgba(255,0,0,0)"); g.fillStyle = gr; g.fillRect(cx - 90, hz - 215, 180, 180);
  g.fillStyle = "#1a0a0c"; g.beginPath(); g.moveTo(cx, hz - 100); g.lineTo(cx - 12, hz - 72); g.lineTo(cx + 12, hz - 72); g.fill();
  g.fillStyle = "#f0e6da"; for (let i = -4; i <= 4; i++) g.fillRect(cx + i * 15 - 6, hz - 60, 12, 26);
  gr = g.createLinearGradient(0, hz, 0, A); gr.addColorStop(0, "#3a0509"); gr.addColorStop(1, "#0a0001"); g.fillStyle = gr; g.fillRect(0, hz, L, A - hz);
  gr = g.createLinearGradient(0, hz, 0, hz + 140); gr.addColorStop(0, "rgba(255,70,50,.5)"); gr.addColorStop(1, "rgba(255,70,50,0)"); g.fillStyle = gr; g.fillRect(0, hz, L, 140);
  g.strokeStyle = "rgba(255,60,50,.14)"; g.lineWidth = 2; for (let i = 0; i <= 24; i++) { g.beginPath(); g.moveTo(cx + (i - 12) * 40, hz); g.lineTo(cx + (i - 12) * 260, A); g.stroke(); }
  g.lineCap = "round"; g.strokeStyle = "#cfc3b4"; g.fillStyle = "#cfc3b4";
  for (let i = 0; i < 70; i++) {   // ossos espalhados
    const x = (i * 7919) % L, y = hz + 40 + (i * 104729) % (A - hz - 70), s = 6 + (y - hz) / (A - hz) * 26, a = i * 2.3;
    g.lineWidth = s * 0.35; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * s * 2, y + Math.sin(a) * s * 0.7); g.stroke();
    g.beginPath(); g.arc(x, y, s * 0.3, 0, TAU); g.arc(x + Math.cos(a) * s * 2, y + Math.sin(a) * s * 0.7, s * 0.3, 0, TAU); g.fill();
  }
  return c;
}

/* ---------- desenho no mundo (na ordem de profundidade dos fantasmas) ---------- */
const _di = desenharInim;
desenharInim = function (e) { if (e.boss) return drawBoss(e); if (e.proj) return drawProj(e); _di(e); };
function drawProj(p) {
  const S = Sf(p.y), x = p.x, y = p.y - p.z * S, cor = p.dono === "b" ? "255,60,90" : "120,230,255", r = p.r;
  ctx.save();
  ctx.globalAlpha = 0.3; ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(x, p.y, r * 0.8, r * 0.25, 0, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 5; i++) {
    const tx = x - p.vx * 0.012 * i, ty = y - p.vy * 0.012 * i, g = ctx.createRadialGradient(tx, ty, 0, tx, ty, r * (2.6 - i * 0.35));
    g.addColorStop(0, `rgba(${cor},${0.75 - i * 0.14})`); g.addColorStop(1, `rgba(${cor},0)`);
    ctx.fillStyle = g; ctx.fillRect(tx - r * 3, ty - r * 3, r * 6, r * 6);
  }
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, TAU); ctx.fill();
  ctx.restore();
}
function sprite(b, x, y, dir, h, alpha, tint) {
  const resp = 1 + Math.sin(b.t * 3) * 0.015, sy = b.estado === "tonto" ? 0.95 : b.estado === "aviso_pisao" ? 0.9 : 1;
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y - 8 * Sf(y));
  ctx.scale(dir * (CFG.BOSS_OLHA_PARA === "direita" ? 1 : -1) * resp * (b.estado === "dash" ? 1.08 : 1), resp * sy);
  if (pronto(bossImg)) {
    const w = h * bossImg.naturalWidth / bossImg.naturalHeight; ctx.drawImage(bossImg, -w / 2, -h, w, h);
    if (tint && b.flash > 0) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = alpha * b.flash * 0.7; ctx.drawImage(bossImg, -w / 2, -h, w, h); }
  } else {   // cachorro de reserva até existir boss.png
    ctx.fillStyle = tint && b.flash > 0.5 ? "#6a2a3a" : "#1b0f16";
    ctx.beginPath(); ctx.ellipse(0, -h * 0.4, h * 0.55, h * 0.3, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(h * 0.45, -h * 0.58, h * 0.22, h * 0.19, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(h * 0.4, -h * 0.72); ctx.lineTo(h * 0.46, -h * 0.95); ctx.lineTo(h * 0.55, -h * 0.72); ctx.fill();
    ctx.fillStyle = "#ff2a2a"; ctx.beginPath(); ctx.arc(h * 0.52, -h * 0.62, h * 0.03, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function drawBoss(b) {
  const S = Sf(b.y), h = CFG.BOSS_TAM * S, morto = b.estado === "morto", a = morto ? Math.max(0, 1 - b.tm / 1.7) : 1;
  ctx.save();
  ondas.forEach(o => { const al = Math.max(0, 0.9 - o.r / 1500); ctx.strokeStyle = `rgba(255,80,60,${al})`; ctx.lineWidth = 16 * S + 4; ctx.beginPath(); ctx.ellipse(o.x, o.y, o.r, o.r * 0.35, 0, 0, TAU); ctx.stroke(); ctx.strokeStyle = `rgba(255,230,200,${al * 0.7})`; ctx.lineWidth = 4; ctx.stroke(); });
  aneis.forEach(r => { if (r.d > 0) return; ctx.strokeStyle = `rgba(255,200,150,${Math.max(0, 1 - r.r / 1700)})`; ctx.lineWidth = 12; ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.35, 0, 0, TAU); ctx.stroke(); });
  if (b.estado === "aviso_dash") {   // faixa de perigo com setas correndo
    const dd = sg(gato.x - b.x), x2 = dd > 0 ? ML : 0;
    ctx.fillStyle = `rgba(255,30,30,${0.12 + 0.1 * Math.sin(tempo * 30)})`; ctx.fillRect(Math.min(b.x, x2), b.y - 55 * S, Math.abs(x2 - b.x), 110 * S);
    ctx.strokeStyle = "rgba(255,120,100,.8)"; ctx.lineWidth = 5; for (let k = 0; k < 12; k++) { const x = b.x + dd * (160 + k * 130 + (tempo * 500) % 130); ctx.beginPath(); ctx.moveTo(x, b.y - 24 * S); ctx.lineTo(x + dd * 30 * S, b.y); ctx.lineTo(x, b.y + 24 * S); ctx.stroke(); }
  }
  if (b.estado === "aviso_pisao") { ctx.strokeStyle = `rgba(255,70,50,${0.4 + 0.4 * Math.sin(tempo * 20)})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(b.x, b.y, h * 0.6, h * 0.2, 0, 0, TAU); ctx.stroke(); }
  ctx.globalAlpha = a * 0.4; ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(b.x, b.y, h * 0.42, h * 0.07, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = a; ctx.globalCompositeOperation = "lighter";   // aura
  const gx = b.x, gy = b.y - h * 0.5, gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, h * (0.78 + 0.05 * Math.sin(tempo * 4)));
  gr.addColorStop(0, `rgba(${dom ? "255,30,30" : "255,90,50"},${(dom ? 0.38 : 0.26) * a})`); gr.addColorStop(1, "rgba(255,0,0,0)"); ctx.fillStyle = gr; ctx.fillRect(gx - h, gy - h, h * 2, h * 2);
  ctx.globalCompositeOperation = "source-over";
  b.rastro.forEach(r => sprite(b, r.x, r.y, r.d, h, 0.35 * (1 - r.t / 0.3) * a, false));
  sprite(b, b.x + (morto ? rand(-8, 8) : 0), b.y, b.dir, h, a, true);
  ctx.restore();
  if (b.estado === "aviso_orbe") {   // orbe carregando na boca
    const u = Math.min(1, b.est_t / 0.6), ox = b.x + b.dir * 0.45 * h, oy = b.y - 0.55 * h, rr = h * 0.2 * u, g2 = ctx.createRadialGradient(ox, oy, 0, ox, oy, rr + 1);
    ctx.save(); ctx.globalCompositeOperation = "lighter"; g2.addColorStop(0, "rgba(255,230,230,.95)"); g2.addColorStop(0.4, "rgba(255,60,90,.7)"); g2.addColorStop(1, "rgba(255,0,60,0)"); ctx.fillStyle = g2; ctx.fillRect(ox - rr, oy - rr, rr * 2, rr * 2); ctx.restore();
  }
  if (b.estado === "tonto") for (let i = 0; i < 3; i++) {
    const an = tempo * 5 + i * 2.1, sx = b.x + Math.cos(an) * 55 * S, sy = b.y - h * 1.02 + Math.sin(an) * 14 * S;
    ctx.fillStyle = "#ffe36a"; ctx.fillRect(sx - 6, sy - 2, 12, 4); ctx.fillRect(sx - 2, sy - 6, 4, 12);
  }
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  part.forEach(q => { ctx.globalAlpha = Math.max(0, 1 - q.t / q.vida); ctx.fillStyle = q.c; ctx.fillRect(q.x, q.y, q.s, q.s); });
  ctx.restore();
}
desenharCadeado = function () {
  const ok = nChaves() === 2, P = 9, x = ESC.x - 4 * P, y = ESC.y - 150 + Math.sin(tempo * 2) * 3;
  ctx.save(); ctx.globalAlpha = 0.9;
  const g = ctx.createRadialGradient(ESC.x, y + 4 * P, 0, ESC.x, y + 4 * P, 170);
  g.addColorStop(0, ok ? "rgba(80,255,130,.32)" : "rgba(255,50,50,.28)"); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(ESC.x - 170, y - 120, 340, 340);
  pixels(PX_CADEADO, x, y - (ok ? 6 : 0), P, ok ? "#46d977" : "#d0222c", true);
  ctx.restore();
};

/* ---------- efeitos de tela: cinema, Domínio, ULTRA ---------- */
const mundo = () => ctx.setTransform(DPR * escala, 0, 0, DPR * escala, -cam.x * escala * DPR, -cam.y * escala * DPR);
const tela = () => ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
const telaXY = (x, y) => [(x - cam.x) * escala, (y - cam.y) * escala];
function efeitosTela() {
  if (fade > 0.6) return;
  tela(); ctx.save();
  const b = boss, intro = cena === 5 && b && b.estado === "intro", cn = dom && dom.fase === "cena";
  let bar = 0;
  if (intro) bar = lim(Math.min(b.est_t / 0.4, (2.7 - b.est_t) / 0.4), 0, 1);
  if (cn) bar = lim(Math.min(dom.t / 0.4, (3.9 - dom.t) / 0.4), 0, 1);
  if (cena === 5 && dom && dom.fase !== "cena") dominioTela();
  if (cn) cenaDominioTela();
  if (intro) bannerIntro(b.est_t);
  if (ultra) ultraTela();
  if (cura.canal > 0 || cura.flash > 0) curaTela();
  if (bar > 0) { tela(); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H * 0.11 * bar); ctx.fillRect(0, H - H * 0.11 * bar, W, H * 0.11 * bar); }
  ctx.restore();
}
function curaTela() {
  const [sx, sy] = telaXY(gato.x, gato.y + PES - 80 * Sf(gato.y + PES)), u = cura.canal > 0 ? 1 - cura.canal / 1.1 : 1;
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  if (cura.canal > 0) {
    const r = escala * (70 + 70 * u), g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r); g.addColorStop(0, `rgba(160,255,190,${0.6 * u})`); g.addColorStop(1, "rgba(60,220,120,0)"); ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    for (let i = 0; i < 7; i++) { const m = (tempo * 90 + i * 41) % 130, x = sx + Math.sin(i * 2.1 + tempo * 2) * 55 * escala, y = sy + 50 * escala - m * escala, k = 5 * escala; ctx.fillStyle = `rgba(190,255,210,${0.9 - m / 150})`; ctx.fillRect(x - k, y - k / 3, k * 2, k * 0.66); ctx.fillRect(x - k / 3, y - k, k * 0.66, k * 2); }
  }
  if (cura.flash > 0) { ctx.fillStyle = `rgba(120,255,170,${cura.flash * 0.28})`; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = `rgba(190,255,210,${cura.flash})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(sx, sy, escala * 300 * (1 - cura.flash) + 20, 0, TAU); ctx.stroke(); }
  ctx.restore();
  if (cura.canal > 0) { ctx.textAlign = "center"; ctx.font = "bold 16px Georgia, serif"; ctx.fillStyle = "#c8ffd8"; ctx.shadowColor = "#000"; ctx.shadowBlur = 6; ctx.fillText("CURANDO…", sx, sy - escala * 120); ctx.shadowBlur = 0; }
}
function bannerIntro(u) {
  const al = Math.sin(Math.PI * lim((u - 0.3) / 2.0, 0, 1));
  ctx.textAlign = "center"; ctx.shadowColor = "#a00"; ctx.shadowBlur = 20; ctx.fillStyle = `rgba(235,215,205,${al})`;
  ctx.font = `bold ${Math.round(Math.min(W / 12, 72))}px Georgia, serif`; ctx.fillText("O GUARDIÃO", W / 2 + (1 - al) * 40, H * 0.5);
  ctx.font = `italic ${Math.round(Math.min(W / 34, 24))}px Georgia, serif`; ctx.fillText("o cão que vigia a chave", W / 2, H * 0.5 + 40); ctx.shadowBlur = 0;
}
function cenaDominioTela() {
  const t = dom.t, b = boss, al = t < 2.9 ? 1 : lim(1 - (t - 2.9) / 0.6, 0, 1);
  ctx.fillStyle = `rgba(30,0,0,${0.55 * lim(t / 1.2, 0, 1) * al})`; ctx.fillRect(0, 0, W, H);
  if (b && t > 1.2) {   // círculo mágico em volta do boss
    const [sx, sy] = telaXY(b.x, b.y), R0 = escala * 190 * Math.min(1, t - 1.2) * (1 + (t > 2.5 ? (t - 2.5) * 2 : 0));
    ctx.save(); ctx.translate(sx, sy); ctx.strokeStyle = `rgba(255,70,50,${al})`; ctx.lineWidth = 3; ctx.shadowColor = "#f00"; ctx.shadowBlur = 20;
    for (let k = 0; k < 3; k++) {
      const R = R0 * (1 - k * 0.2); ctx.save(); ctx.rotate(tempo * (k % 2 ? -1 : 1) * 0.8); ctx.beginPath(); ctx.ellipse(0, 0, R, R * 0.35, 0, 0, TAU); ctx.stroke();
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.32); ctx.lineTo(Math.cos(a) * R * 1.1, Math.sin(a) * R * 0.38); ctx.stroke(); }
      ctx.restore();
    }
    ctx.restore();
  }
  const txt = "EXPANSÃO DE DOMÍNIO", n = Math.floor(lim((t - 0.7) / 1.2, 0, 1) * txt.length), fs = Math.min(W / 10, 96);
  ctx.textAlign = "center"; ctx.shadowColor = "#f00"; ctx.shadowBlur = 30; ctx.fillStyle = `rgba(255,70,60,${al})`;
  ctx.font = `bold ${Math.round(fs)}px Georgia, serif`; ctx.fillText(txt.slice(0, n), W / 2 + rand(-2, 2), H * 0.42 + rand(-2, 2));
  if (t > 2.0) { ctx.fillStyle = `rgba(240,220,210,${al * lim((t - 2.0) / 0.5, 0, 1)})`; ctx.font = `italic ${Math.round(Math.min(W / 24, 40))}px Georgia, serif`; ctx.fillText("SANTUÁRIO MALIGNO", W / 2, H * 0.42 + fs * 0.7); }
  ctx.shadowBlur = 0;
}
function dominioTela() {
  const [sx, sy] = telaXY(ML / 2, MA * 0.45), r = Math.max(W, H) * 0.6;
  ctx.globalCompositeOperation = "lighter";
  let g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r); g.addColorStop(0, `rgba(255,50,30,${(0.16 + 0.05 * Math.sin(tempo * 4)) * (orig && orig.img ? 0.5 : 1)})`); g.addColorStop(1, "rgba(255,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 45; i++) {   // brasas
    const x = (i * 977 + tempo * (20 + (i % 5) * 9)) % W, y = H - ((tempo * (40 + (i % 4) * 25) + i * 131) % H);
    ctx.fillStyle = `rgba(255,${90 + (i % 3) * 40},40,${0.35 + 0.3 * Math.sin(tempo * 3 + i)})`; ctx.fillRect(x, y, 2 + i % 3, 2 + i % 3);
  }
  ctx.globalCompositeOperation = "source-over";
  mundo();
  const yF = SALA_Y_FUNDO * MA, yN = SALA_Y_PERTO * MA;
  cortes.forEach(c => {   // cortes: aviso na faixa, depois o talho
    const av = c.t < 0.85, u = av ? c.t / 0.85 : (c.t - 0.85) / 0.4;
    if (av) {
      ctx.fillStyle = `rgba(255,40,40,${0.06 + 0.12 * u})`; if (c.h) ctx.fillRect(0, c.pos - 36, ML, 72); else ctx.fillRect(c.pos - 50, yF, 100, yN - yF);
      ctx.fillStyle = `rgba(255,${120 + 100 * u},${100 + 80 * u},${0.3 + 0.6 * u * (0.6 + 0.4 * Math.sin(tempo * 40))})`; if (c.h) ctx.fillRect(0, c.pos - 3, ML, 6); else ctx.fillRect(c.pos - 3, yF, 6, yN - yF);
    } else if (u < 1) {
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
      for (let k = 0; k < 3; k++) {
        const o = (k - 1) * 28, tilt = c.ang * 160 + o; ctx.beginPath();
        if (c.h) { ctx.moveTo(-50, c.pos + o - tilt); ctx.lineTo(ML + 50, c.pos + o + tilt); } else { ctx.moveTo(c.pos + o - tilt, yF - 80); ctx.lineTo(c.pos + o + tilt, yN + 60); }
        ctx.strokeStyle = `rgba(255,60,50,${1 - u})`; ctx.lineWidth = 34 * (1 - u) + 4; ctx.stroke();
        ctx.strokeStyle = `rgba(255,240,235,${1 - u})`; ctx.lineWidth = 10 * (1 - u) + 1; ctx.stroke();
      }
      ctx.restore();
    }
  });
  tela();
  g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, "rgba(80,0,0,0)"); g.addColorStop(1, `rgba(90,0,0,${0.45 + 0.1 * Math.sin(tempo * 5)})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (dom.fase === "colapso") {   // o domínio racha
    const [cx, cy] = telaXY(dom.px || ML / 2, (dom.py || MA / 2) - 150), len = Math.min(1, dom.t / 1.2) * Math.max(W, H);
    ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 3;
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + Math.sin(i * 12.9) * 0.2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); ctx.stroke(); }
  }
}
function ultraTela() {
  const u = ultra, S = Sf(u.y);
  if (u.t < 0.7) {
    const k = u.t / 0.7, [sx, sy] = telaXY(gato.x, gato.y + PES - 80 * Sf(gato.y + PES)), r = escala * (50 + 190 * k);
    ctx.fillStyle = `rgba(0,10,30,${0.4 * k})`; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r); g.addColorStop(0, `rgba(255,255,255,${0.9 * k})`); g.addColorStop(0.4, `rgba(100,230,255,${0.6 * k})`); g.addColorStop(1, "rgba(60,150,255,0)"); ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    ctx.strokeStyle = `rgba(160,240,255,${0.8 * k})`; ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + tempo * 3, r1 = r * (1.6 - k * 0.8); ctx.beginPath(); ctx.moveTo(sx + Math.cos(a) * r1, sy + Math.sin(a) * r1); ctx.lineTo(sx + Math.cos(a) * r1 * 0.6, sy + Math.sin(a) * r1 * 0.6); ctx.stroke(); }
    ctx.globalCompositeOperation = "source-over";
  } else if (u.t < 1.6) {   // o raio
    const k = (u.t - 0.7) / 0.9, yc = u.y - 85 * S, hh = 150 * S * (1 - k * k * 0.7), x0 = u.x, x1 = u.dir > 0 ? ML + 100 : -100;
    mundo(); ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(0, yc - hh, 0, yc + hh); g.addColorStop(0, "rgba(60,150,255,0)"); g.addColorStop(0.3, "rgba(100,230,255,.85)"); g.addColorStop(0.5, "rgba(255,255,255,1)"); g.addColorStop(0.7, "rgba(100,230,255,.85)"); g.addColorStop(1, "rgba(60,150,255,0)");
    ctx.fillStyle = g; ctx.fillRect(Math.min(x0, x1), yc - hh, Math.abs(x1 - x0), hh * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - k)})`; ctx.fillRect(Math.min(x0, x1), yc - hh * 0.18, Math.abs(x1 - x0), hh * 0.36);
    ctx.globalCompositeOperation = "source-over"; tela();
    ctx.fillStyle = `rgba(200,240,255,${0.25 * (1 - k)})`; ctx.fillRect(0, 0, W, H);
  }
}

/* ---------- laço do jogo ---------- */
const _ap = aplicarTroca;
aplicarTroca = function (para, final) {
  _ap(para, final); limparTiros(); part = []; ondas = [];
  if (para === 5) {
    if (!arma) { arma = true; flashBranco = 0.6; sfx("chave"); dica("ARMA MÁGICA obtida!  Segure F ou CLIQUE para atirar · U = ULTRA", 9000); }
    if (!bossMorto && !boss) criarBoss();
  }
};
const _tr = trocar;
trocar = function (p, f) {   // não há saída durante o Domínio
  if (dom && cena === 5) { if (avisoT <= 0) { avisoT = 1.5; dica("Não há saída do Domínio!", 2000); sfx("trancada"); } gato.vy = 520; return; }
  _tr(p, f);
};
const _re = reiniciar;
reiniciar = function () {
  const total = fimTipo === "vitoria"; _re(); limparTiros(); part = []; ondas = []; cortes = []; aneis = []; boss = null; trap = null; ultra = null; dom = null; ult = 0; cura = { cargas: 0, cd: 0, canal: 0, v0: 3, flash: 0 }; restaurarFundo();
  if (total) { bossMorto = false; arma = false; ITENS[5].length = 0; INIM[5] = []; } else if (!bossMorto) INIM[5] = [];
};
const _at = atualizar;
atualizar = function (dt) {
  if (dom && dom.fase === "cena") { teclas.w = teclas.a = teclas.s = teclas.d = false; inv = Math.max(inv, 1); }   // congela durante a cena do Domínio
  _at(dt);
  if (orig) lanterna = 1.9;                                  // arena do Domínio bem iluminada
  cdTiro = Math.max(0, cdTiro - dt); avisoT -= dt;
  if (arm) { trap = { t: 0 }; trapFase = ""; arm = null; }
  if (cena !== 3) trap = null;
  const py = gato.y + PES, ok = !transicao && !fim && !emerge;
  if (ok && cena === 2 && py < ESC.y && Math.abs(gato.x - ESC.x) < ESC.meia) {   // saída: topo da escada
    if (nChaves() === 2) trocar(1, true);
    else if (cdAviso <= 0) { cdAviso = 2; sfx("trancada"); gato.vy = 520; dica(`A saída no alto da escada está trancada — faltam ${2 - nChaves()} chave(s)`); }
  }
  cura.cd = Math.max(0, cura.cd - dt); cura.flash = Math.max(0, cura.flash - dt * 1.5);
  if (cura.canal > 0) {   // curando: anda devagar, não atira; dano interrompe
    cura.canal -= dt; const kf = Math.exp(-6 * dt); gato.vx *= kf; gato.vy *= kf;
    if (vidas < cura.v0 || fim) { cura.canal = 0; dica("Cura interrompida!", 2000); }
    else if (cura.canal <= 0) { vidas = Math.min(3, vidas + 1); cura.cargas--; cura.cd = 2; cura.flash = 1; som("cura2"); }
  }
  if (segMouse) atirar(mouseDir); else if (segF || segJ || segT) atirar(0);
  armadilha(dt, py, ok);
  atualizarDom(dt, py, ok);
  if (boss && cena === 5) bossIA(dt, py, ok);
  if (ultra) {
    const u = ultra, alvo = alvoBoss(); u.t += dt;
    if (u.t < 0.7) { u.x = gato.x; u.y = alvo && sg(alvo.x - gato.x) === u.dir ? alvo.y : gato.y + PES; shake = Math.max(shake, 0.12 + 0.2 * u.t); }
    else if (!u.fez) {
      u.fez = true; som("ultra2"); shake = 1; flashBranco = Math.max(flashBranco, 0.45);
      INIM[cena].filter(e => e.vivo && !e.boss && !e.proj && sg(e.x - u.x) === u.dir && Math.abs(e.y - u.y) < 160 * Sf(e.y) + 60).forEach(e => { e.vivo = false; e.morte = 0; abates++; });
      if (alvo && sg(alvo.x - u.x) === u.dir && Math.abs(alvo.y - u.y) < 170 * Sf(alvo.y) + 70) dano(alvo, CFG.DANO_ULTRA, true);
    }
    if (u.t > 1.7) ultra = null;
  }
  ondas.forEach(o => {
    o.t += dt; o.r += 640 * dt;
    if (ok && inv <= 0 && gato.z < 60 && Math.abs(Math.hypot(gato.x - o.x, (py - o.y) / 0.35) - o.r) < 40) ferir(gato.x - o.x);
  }); ondas = ondas.filter(o => o.r < 1800);
  aneis.forEach(r => { r.d -= dt; if (r.d <= 0) r.r += 900 * dt; }); aneis = aneis.filter(r => r.r < 1800);
  part.forEach(q => { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += (q.g ?? 500) * dt; }); part = part.filter(q => q.t < q.vida);
  for (const p of tiros.slice()) {
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
    const alvo = p.cena === 5 ? alvoBoss() : null;
    if (p.dono === "g") {
      if (alvo && sg(alvo.x - p.x) === sg(p.vx)) p.vy = lim(p.vy + lim((alvo.y - p.y) / 60, -1, 1) * 900 * dt, -180, 180);   // mira leve em profundidade
      if (alvo && Math.abs(p.x - alvo.x) < CFG.BOSS_TAM * 0.28 * Sf(alvo.y) + p.r && Math.abs(p.y - alvo.y) < 65 * Sf(alvo.y) + 28) { golpe(p); removerTiro(p); continue; }
      const f = INIM[p.cena].find(e => e.vivo && !e.boss && !e.proj && Math.abs(p.x - e.x) < 60 * Sf(e.y) + p.r && Math.abs(p.y - e.y) < 50 * Sf(e.y) + 20);
      if (f) { f.vivo = false; f.morte = 0; abates++; sfx("esmaga"); removerTiro(p); continue; }
    } else if (ok && inv <= 0 && gato.z < 110 && Math.abs(p.x - gato.x) < 55 * Sf(py) + 14 && Math.abs(p.y - py) < 38 * Sf(py) + 14) { ferir(p.vx); removerTiro(p); continue; }
    const [xl, xr] = p.cena >= 3 ? bordas(lim(p.y, SALA_Y_FUNDO * MA, SALA_Y_PERTO * MA)) : [60, ML - 60];
    if (p.t > 3 || p.x < xl - 60 || p.x > xr + 60 || p.y < SALA_Y_FUNDO * MA - 20 || p.y > MA + 40) removerTiro(p);
  }
};

/* ---------- celular: joystick + botões grandes ---------- */
const TOQUE_CSS = `
:root{--L:clamp(84px,25vmin,135px);--M:clamp(72px,21vmin,112px)}
canvas{position:fixed;inset:0;width:100%!important;height:100%!important}
html,body{overscroll-behavior:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:none}
#dica.toque{bottom:2vmin;max-width:44vw;white-space:normal;text-align:center;font-size:13px}
#toque{position:fixed;inset:0;z-index:20;pointer-events:none;font-family:Georgia,serif}
#toque>*{position:absolute;pointer-events:auto;touch-action:none;-webkit-tap-highlight-color:transparent}
#jstick{left:3vmin;bottom:4vmin;width:clamp(120px,36vmin,190px);height:clamp(120px,36vmin,190px);border-radius:50%;background:rgba(255,255,255,.14);border:3px solid rgba(255,255,255,.85);box-shadow:0 0 14px #000}
#jstick .seta{position:absolute;transform:translate(-50%,-50%);color:#fff;font-size:20px;text-shadow:0 0 6px #000;pointer-events:none}
#jstick .rot{position:absolute;left:0;right:0;top:-24px;text-align:center;color:#fff;font:bold 13px Georgia,serif;text-shadow:0 0 6px #000;pointer-events:none}
#knob{position:absolute;left:50%;top:50%;width:42%;height:42%;margin:-21% 0 0 -21%;border-radius:50%;background:rgba(255,255,255,.8);border:3px solid #fff;box-shadow:0 0 10px #000;pointer-events:none}
.tb{border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;text-align:center;border:3px solid #fff;box-shadow:0 0 14px #000;line-height:1.1;overflow:hidden}
.tb b{font-size:clamp(13px,3.6vmin,19px);text-shadow:0 0 5px #000}
.tb small{font-size:clamp(10px,2.4vmin,13px);text-shadow:0 0 4px #000}
.tb.down{filter:brightness(1.7);transform:scale(.93)}
#bAtirar{right:3vmin;bottom:4vmin;width:var(--L);height:var(--L);background:rgba(205,30,40,.8)}
#bPular{right:calc(5vmin + var(--L));bottom:3vmin;width:var(--M);height:var(--M);background:rgba(40,100,235,.8)}
#bUltra{right:calc(3vmin + (var(--L) - var(--M))/2);bottom:calc(6vmin + var(--L));width:var(--M);height:var(--M);background:linear-gradient(to top,rgba(80,220,255,.92) var(--p,0%),rgba(20,25,40,.75) var(--p,0%))}
#bCurar{right:calc(5vmin + var(--L));bottom:calc(5vmin + var(--M));width:var(--M);height:var(--M);background:rgba(30,150,70,.8)}
#bCurar.off,#bAtirar.off,#bUltra.off{opacity:.4;filter:grayscale(.6)}
#bCurar.on{background:rgba(40,205,95,.95);animation:pulsa 1s infinite}
#bUltra.ok{border-color:#ffe36a;animation:pulsa .6s infinite}
@keyframes pulsa{50%{box-shadow:0 0 26px #fff;transform:scale(1.07)}}
.ic{top:2vmin;width:44px;height:44px;border-radius:12px;background:rgba(20,20,30,.72);border:2px solid #fff;color:#fff;font-size:22px;display:flex;align-items:center;justify-content:center}
#bSom{right:2vmin}#bTela{right:calc(2vmin + 54px)}
#bReiniciar{left:50%;top:62%;transform:translateX(-50%);padding:14px 30px;border-radius:14px;background:rgba(40,160,80,.95);border:3px solid #fff;color:#fff;font:bold 22px Georgia,serif;display:none;white-space:nowrap}
#girar{position:fixed;inset:0;z-index:50;background:#000;color:#fff;display:none;flex-direction:column;align-items:center;justify-content:center;text-align:center;font:bold 22px Georgia,serif}
#girar div{font-size:80px}`;
const acordar = () => { iniciarSom(); try { if (audio && audio.ac.state === "suspended") audio.ac.resume(); } catch (e) {} };
function criarToque() {
  if (ui) return; modoToque = true;
  const st = document.createElement("style"); st.textContent = TOQUE_CSS; document.head.appendChild(st);
  const root = document.createElement("div"); root.id = "toque";
  root.innerHTML = `<div id="jstick"><div class="rot">ANDAR</div><div class="seta" style="top:11%;left:50%">▲</div><div class="seta" style="top:89%;left:50%">▼</div><div class="seta" style="top:50%;left:11%">◀</div><div class="seta" style="top:50%;left:89%">▶</div><div id="knob"></div></div>
   <div class="tb" id="bAtirar"><b>ATIRAR</b><small id="aTxt">segure</small></div><div class="tb" id="bPular"><b>PULAR</b></div>
   <div class="tb" id="bUltra"><b>ULTRA</b><small id="uPct">0%</small></div><div class="tb" id="bCurar"><b>CURAR</b><small id="cTxt">só no Domínio</small></div>
   <div class="ic" id="bTela">⛶</div><div class="ic" id="bSom">🔊</div><div id="bReiniciar">▶ CONTINUAR</div>`;
  document.body.appendChild(root);
  const $ = (id) => document.getElementById(id);
  ui = { bUltra: $("bUltra"), uPct: $("uPct"), bCurar: $("bCurar"), cTxt: $("cTxt"), bAtirar: $("bAtirar"), aTxt: $("aTxt"), bReiniciar: $("bReiniciar") };
  const js = $("jstick"), knob = $("knob"); let jid = null;
  const mover = (e) => {
    const r = js.getBoundingClientRect(), R = r.width / 2, dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R), d = Math.hypot(dx, dy) || 1, k = d > R ? R / d : 1;
    knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
    const on = d > R * 0.22, nx = dx / d, ny = dy / d;
    teclas.a = on && nx < -0.38; teclas.d = on && nx > 0.38; teclas.w = on && ny < -0.38; teclas.s = on && ny > 0.38;
  };
  const larga = (e) => { if (e.pointerId !== jid) return; jid = null; knob.style.transform = ""; teclas.a = teclas.d = teclas.w = teclas.s = false; acordar(); };
  js.addEventListener("pointerdown", (e) => { e.preventDefault(); jid = e.pointerId; try { js.setPointerCapture(jid); } catch (x) {} acordar(); mover(e); });
  js.addEventListener("pointermove", (e) => { if (e.pointerId === jid) mover(e); });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(t => js.addEventListener(t, larga));
  const bind = (id, down, up) => {
    const b = $(id), solta = () => { b.classList.remove("down"); if (up) up(); acordar(); };
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (x) {} b.classList.add("down"); acordar(); down(); });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(t => b.addEventListener(t, solta));
  };
  bind("bAtirar", () => { segT = true; }, () => { segT = false; });
  bind("bPular", () => pular()); bind("bUltra", () => usarUltra()); bind("bCurar", () => curar());
  bind("bSom", () => { alternarSom(); $("bSom").textContent = mudo ? "🔇" : "🔊"; });
  bind("bTela", () => {
    const d = document, e = d.documentElement;
    if (!d.fullscreenElement && !d.webkitFullscreenElement) { (e.requestFullscreen || e.webkitRequestFullscreen || (() => {})).call(e); try { screen.orientation.lock("landscape").catch(() => {}); } catch (x) {} }
    else (d.exitFullscreen || d.webkitExitFullscreen || (() => {})).call(d);
  });
  bind("bReiniciar", () => { if (fim) reiniciar(); });
  const girar = document.createElement("div"); girar.id = "girar"; girar.innerHTML = "<div>↻</div><p>Gire o celular<br>para o modo DEITADO</p>"; document.body.appendChild(girar);
  const ori = () => { girar.style.display = innerHeight > innerWidth ? "flex" : "none"; };
  addEventListener("resize", ori); addEventListener("orientationchange", ori); ori();
  addEventListener("contextmenu", (e) => e.preventDefault());
  const dc = document.getElementById("dica"); dc.classList.add("toque"); dc.textContent = "ANDAR: joystick · PULAR · ATIRAR (segure) · ULTRA · CURAR (só no Domínio)";
}
let tc = {};
function atualizarToque() {
  if (!ui) return;
  const up = Math.floor(ult), dm = !!(dom && dom.fase === "ativo"), cg = cura.cargas;
  if (tc.up !== up) { tc.up = up; ui.bUltra.style.setProperty("--p", up + "%"); ui.uPct.textContent = up >= 100 ? "PRONTO!" : up + "%"; ui.bUltra.classList.toggle("ok", up >= 100); }
  const ct = !dm ? "só no Domínio" : cura.canal > 0 ? "curando…" : cg > 0 ? cg + (cg > 1 ? " curas" : " cura") : "sem curas";
  if (tc.ct !== ct) { tc.ct = ct; ui.cTxt.textContent = ct; }
  const on = dm && cg > 0; if (tc.on !== on) { tc.on = on; ui.bCurar.classList.toggle("on", on); ui.bCurar.classList.toggle("off", !on); }
  if (tc.arma !== arma) { tc.arma = arma; ui.bAtirar.classList.toggle("off", !arma); ui.bUltra.classList.toggle("off", !arma); ui.aTxt.textContent = arma ? "segure" : "sem arma ainda"; }
  if (tc.f !== !!fim) { tc.f = !!fim; ui.bReiniciar.style.display = fim ? "block" : "none"; ui.bReiniciar.textContent = fimTipo === "vitoria" ? "▶ JOGAR DE NOVO" : "▶ CONTINUAR"; }
}
if ((typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches) || "ontouchstart" in window) criarToque();
else addEventListener("touchstart", criarToque, { once: true, passive: true });

/* ---------- HUD e depuração ---------- */
function barraBoss(b) {
  const w = Math.min(W * (modoToque ? 0.46 : 0.62), 700), x = (W - w) / 2, y = 30, h = 20, p = b.hp / CFG.BOSS_HP;
  ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.fillRect(x - 8, y - 8, w + 16, h + 16);
  ctx.strokeStyle = dom ? "#ff4030" : "#c9a24a"; ctx.lineWidth = 2; ctx.strokeRect(x - 8, y - 8, w + 16, h + 16);
  ctx.fillStyle = "#1c0508"; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#f4ece4"; ctx.fillRect(x, y, w * b.lag, h);
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, dom ? "#ff6a4a" : "#ff4a5a"); g.addColorStop(1, dom ? "#8a0a0a" : "#a1101c");
  ctx.fillStyle = g; ctx.fillRect(x, y, w * p, h); ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.fillRect(x, y, w * p, 5);
  [0.5, CFG.DOMINIO_EM / 100].forEach(m => { ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(x + w * m - 1, y, 2, h); });
  ctx.fillStyle = "#efe0d6"; ctx.font = "bold 15px Georgia, serif"; ctx.textAlign = "left"; ctx.fillText("O GUARDIÃO", x, y - 14);
  ctx.textAlign = "right"; ctx.fillText(`${Math.ceil(b.hp)} / ${CFG.BOSS_HP}`, x + w, y - 14);
  if (dom) { ctx.textAlign = "center"; ctx.fillStyle = `rgba(255,70,50,${0.7 + 0.3 * Math.sin(tempo * 6)})`; ctx.fillText("DOMÍNIO ATIVO — SANTUÁRIO MALIGNO", W / 2, y + h + 28); }
}
function hudJogador() {
  const x = 18, y = H - 30, w = 220, pr = ult / 100, ok = pr >= 1;
  ctx.fillStyle = "rgba(0,0,0,.65)"; ctx.fillRect(x - 6, y - 40, w + 12, 58);
  ctx.textAlign = "left"; ctx.font = "13px Georgia, serif"; ctx.fillStyle = "#e8f4ff"; ctx.fillText("F / clique: tiro (segure)", x, y - 22);
  ctx.fillStyle = "#101a2a"; ctx.fillRect(x, y, w, 12);
  ctx.fillStyle = ok ? `rgb(${150 + 100 * Math.abs(Math.sin(tempo * 8))},240,255)` : "#3a8aba"; ctx.fillRect(x, y, w * pr, 12);
  ctx.fillStyle = ok ? "#fff" : "#9ac8e8"; ctx.fillText(ok ? "U · ULTRA PRONTO!" : `U · ultra ${Math.floor(ult)}%`, x, y - 6);
}
function painelCura() {
  const x = 18, y = H - 112, ok = cura.cargas > 0 && cura.cd <= 0 && vidas < 3;
  ctx.fillStyle = "rgba(0,0,0,.65)"; ctx.fillRect(x - 6, y - 22, 250, 34); ctx.textAlign = "left"; ctx.font = "bold 14px Georgia, serif";
  ctx.fillStyle = ok ? `rgb(${140 + 100 * Math.abs(Math.sin(tempo * 6))},255,170)` : "#7a9a84";
  ctx.fillText(`C · CURAR  (${cura.cargas} restante${cura.cargas === 1 ? "" : "s"})`, x, y);
}
function extrasHUD() {
  if (fade > 0.7) return; tela(); ctx.save();
  if (boss && cena === 5 && !fim && !["morto", "intro", "dominio"].includes(boss.estado)) barraBoss(boss);
  if (arma && !modoToque) hudJogador();
  if (dom && dom.fase === "ativo" && !modoToque) painelCura();
  ctx.restore();
}
function debugDraw() {
  ctx.save(); mundo(); ctx.lineWidth = 3 / escala;
  if (cena < 3) {
    ZONAS[cena].ok.forEach(r => { ctx.strokeStyle = "lime"; ctx.strokeRect(r[0], r[1], r[2] - r[0], r[3] - r[1]); });
    ZONAS[cena].bloq.forEach(r => { ctx.fillStyle = "rgba(255,0,0,.25)"; ctx.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]); });
  } else { ctx.strokeStyle = "lime"; ctx.beginPath(); FPOLY.forEach(([a, b], i) => i ? ctx.lineTo(a * ML, b * MA) : ctx.moveTo(a * ML, b * MA)); ctx.closePath(); ctx.stroke(); }
  if (cena === 2) { ctx.strokeStyle = "cyan"; ctx.strokeRect(ESC.x - ESC.meia, ESC.y - 80, ESC.meia * 2, 80); }
  ctx.strokeStyle = "yellow"; ctx.beginPath(); ctx.arc(gato.x, gato.y + PES, 10, 0, TAU); ctx.stroke();
  if (boss) { ctx.strokeStyle = "red"; ctx.beginPath(); ctx.arc(boss.x, boss.y, 14, 0, TAU); ctx.stroke(); }
  tela(); ctx.fillStyle = "#fff"; ctx.font = "15px monospace"; ctx.textAlign = "left";
  ctx.fillText("DEBUG (H sai) · clique no jogo para ler as coordenadas do mundo" + (clique ? `  →  x: ${clique.x}  y: ${clique.y}` : ""), 18, H - 12);
  ctx.restore();
}
const _d = desenhar;
desenhar = function () { _d(); efeitosTela(); extrasHUD(); if (debugOn) debugDraw(); atualizarToque(); };
})();
