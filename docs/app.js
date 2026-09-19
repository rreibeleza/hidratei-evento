import { CONFIG } from './config.js';
import { TERMO } from './termo.js';
import { listar, atualizar, inserir } from './banco.js';
import {
  validarCadastro, dataBRparaISO, parseTempo, formatTempo, resultado, ranking,
  nomePublico, nomeProprio, paraCSV, pendentes, payloadEnvio, confirmarEnvio,
} from './logica.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const digitos = (s) => String(s ?? '').replace(/\D/g, '');
const normalizar = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const num3 = (n) => String(n).padStart(3, '0');
const el = (tag, classe, texto) => {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto != null) e.textContent = texto;
  return e;
};

// ---------- navegação ----------
const TELAS_PROMOTORA = ['promotora', 'tempo', 'resultado'];
const INATIVIDADE_MS = { cadastro: 180e3, termo: 180e3, pronto: 20e3, pin: 60e3 }; // demais: 15 min
let telaAtual = 'inicio';
let promotoraLogada = false;
let cadastro = null;     // dados do participante entre a tela de cadastro e a assinatura
let selecionado = null;  // id do participante na tela de tempo
let recarregarNoInicio = false;

const aoEntrar = {
  inicio() {
    cadastro = null;
    $('#form-cadastro').reset();
    limparErros();
    if (recarregarNoInicio) location.reload();
  },
  termo: renderTermo,
  pin() { $('#pin-campo').value = ''; $('#pin-erro').textContent = ''; },
  promotora: renderLista,
  ranking: renderRanking,
};

function ir(tela) {
  if (TELAS_PROMOTORA.includes(tela) && !promotoraLogada) tela = 'pin';
  if (tela === 'termo' && !cadastro) tela = 'cadastro';
  $$('.tela').forEach((t) => t.classList.toggle('ativa', t.id === tela));
  telaAtual = tela;
  window.scrollTo(0, 0);
  aoEntrar[tela]?.();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ir]');
  if (b) ir(b.dataset.ir);
});

// Tablet esquecido no meio de um cadastro volta sozinho ao início (e não expõe dados do anterior).
let ultimoToque = Date.now();
for (const t of ['pointerdown', 'keydown']) addEventListener(t, () => { ultimoToque = Date.now(); }, true);
setInterval(() => {
  if (telaAtual === 'inicio') return;
  if (Date.now() - ultimoToque > (INATIVIDADE_MS[telaAtual] ?? 900e3)) {
    promotoraLogada = false;
    ir('inicio');
  }
}, 5000);

// ---------- cadastro ----------
const MASCARAS = {
  cpf: (d) => d.slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'),
  data: (d) => {
    d = d.slice(0, 8);
    if (d.length > 4) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
    return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  },
  celular: (d) => {
    d = d.slice(0, 11);
    if (d.length <= 2) return d ? `(${d}` : '';
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  },
};
for (const input of $$('[data-mascara]')) {
  input.addEventListener('input', () => { input.value = MASCARAS[input.dataset.mascara](digitos(input.value)); });
}
for (const input of $$('input')) input.autocomplete = 'off';

function limparErros() {
  for (const s of $$('[data-erro]')) { s.textContent = ''; s.closest('.campo').classList.remove('invalido'); }
}
function mostrarErros(erros) {
  limparErros();
  for (const [campo, msg] of Object.entries(erros)) {
    const s = $(`[data-erro="${campo}"]`);
    s.textContent = msg;
    s.closest('.campo').classList.add('invalido');
  }
  const primeiro = Object.keys(erros)[0];
  if (primeiro) $(`#form-cadastro [name="${primeiro}"]`).focus();
}

$('#form-cadastro').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const dados = {
    nome: nomeProprio(f.get('nome')),
    cpf: digitos(f.get('cpf')),
    nascimento: dataBRparaISO(f.get('nascimento')) ?? '',
    celular: digitos(f.get('celular')),
    email: f.get('email').trim().toLowerCase(),
  };
  const { erros } = validarCadastro(dados);
  if (!erros.cpf) {
    const repetido = (await listar()).find((p) => p.cpf === dados.cpf);
    if (repetido) erros.cpf = `Este CPF já assinou o termo (participante nº ${num3(repetido.numero)}).`;
  }
  mostrarErros(erros);
  if (Object.keys(erros).length) return;
  cadastro = dados;
  ir('termo');
});

// ---------- termo + assinatura ----------
const textoTermo = $('#termo-texto');
const aceite = $('#termo-aceite');
const botaoConfirmar = $('#termo-confirmar');
const dica = $('#termo-dica');

function renderTermo() {
  $('#termo-titulo').textContent = TERMO.titulo;
  $('#termo-rascunho').hidden = !TERMO.rascunho;
  const cpf = MASCARAS.cpf(cadastro.cpf);
  textoTermo.replaceChildren(
    el('p', 'declarante', `Participante: ${cadastro.nome} — CPF ${cpf}`),
    ...TERMO.texto.split(/\n\s*\n/).map((t) => el('p', null, t.trim())),
  );
  textoTermo.scrollTop = 0;
  aceite.checked = false;
  aceite.disabled = true;
  dica.textContent = 'Role até o fim do texto para continuar.';
  dica.classList.remove('ok');
  assinatura.limpar();
  verificarLeitura();
}

function verificarLeitura() {
  if (textoTermo.scrollTop + textoTermo.clientHeight < textoTermo.scrollHeight - 8) return;
  aceite.disabled = false;
  dica.textContent = '✓ Texto lido até o fim.';
  dica.classList.add('ok');
}
textoTermo.addEventListener('scroll', verificarLeitura);

const atualizarBotaoConfirmar = () => {
  botaoConfirmar.disabled = !(aceite.checked && !assinatura.vazia());
};
aceite.addEventListener('change', atualizarBotaoConfirmar);

function criarAssinatura(canvas, aoMudar) {
  const ctx = canvas.getContext('2d');
  let desenhando = false;
  let ultimo = null;
  let tracado = 0; // comprimento total em px — um toque solto não conta como assinatura

  function preparar() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ctx.fillStyle = '#10202a';
  }
  const ponto = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    desenhando = true;
    ultimo = ponto(e);
    ctx.beginPath();
    ctx.arc(ultimo[0], ultimo[1], 1.3, 0, 2 * Math.PI);
    ctx.fill();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!desenhando) return;
    const p = ponto(e);
    ctx.beginPath();
    ctx.moveTo(...ultimo);
    ctx.lineTo(...p);
    ctx.stroke();
    tracado += Math.hypot(p[0] - ultimo[0], p[1] - ultimo[1]);
    ultimo = p;
  });
  for (const t of ['pointerup', 'pointercancel']) {
    canvas.addEventListener(t, () => { desenhando = false; aoMudar(); });
  }
  addEventListener('resize', () => { if (tracado === 0) preparar(); });

  return {
    limpar() { preparar(); tracado = 0; aoMudar(); },
    vazia: () => tracado < 40,
    // PNG em 1x com fundo branco: legível na planilha e leve para subir em 4G fraco.
    png() {
      const r = canvas.getBoundingClientRect();
      const out = document.createElement('canvas');
      out.width = Math.round(r.width);
      out.height = Math.round(r.height);
      const o = out.getContext('2d');
      o.fillStyle = '#fff';
      o.fillRect(0, 0, out.width, out.height);
      o.drawImage(canvas, 0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    },
  };
}
const assinatura = criarAssinatura($('#assinatura-canvas'), () => atualizarBotaoConfirmar());
$('#assinatura-limpar').addEventListener('click', () => assinatura.limpar());

botaoConfirmar.addEventListener('click', async () => {
  botaoConfirmar.disabled = true; // evita duplo toque gravar duas vezes
  const lista = await listar();
  const p = {
    id: crypto.randomUUID(),
    numero: lista.reduce((m, x) => Math.max(m, x.numero), 0) + 1,
    ...cadastro,
    termoVersao: TERMO.versao,
    aceitoEm: new Date().toISOString(),
    assinatura: assinatura.png(),
    tempoSeg: null,
    tempoEm: null,
    dispositivo: navigator.userAgent,
    rev: 1,
    revSincronizada: 0,
  };
  await inserir(p);
  $('#pronto-nome').textContent = p.nome.split(' ')[0];
  $('#pronto-numero').textContent = num3(p.numero);
  ir('pronto');
  enviarPendentes();
});

// ---------- promotora ----------
$('#form-pin').addEventListener('submit', (e) => {
  e.preventDefault();
  if ($('#pin-campo').value !== CONFIG.pinPromotora) {
    $('#pin-erro').textContent = 'PIN incorreto.';
    $('#pin-campo').value = '';
    return;
  }
  promotoraLogada = true;
  ir('promotora');
});
$('#sair-promotora').addEventListener('click', () => { promotoraLogada = false; ir('inicio'); });
$('#busca').addEventListener('input', renderLista);

function tagResultado(p) {
  const r = resultado(p.tempoSeg);
  if (!r) return el('span', 'tag tag--aguardando', 'Aguardando tempo');
  return el('span', `tag tag--${r}`, `${formatTempo(p.tempoSeg)} · ${r === 'brinde' ? 'Brinde' : 'Desculpa'}`);
}

async function renderLista() {
  const todos = await listar();
  renderBarraEnvio(todos);
  const busca = normalizar($('#busca').value);
  const buscaNum = digitos(busca).replace(/^0+/, '');
  const lista = todos
    .filter((p) => !busca || normalizar(p.nome).includes(busca) || (buscaNum && String(p.numero) === buscaNum))
    .sort((a, b) => b.numero - a.numero);
  const ul = $('#lista-participantes');
  if (!lista.length) {
    ul.replaceChildren(el('li', 'lista-vazia', todos.length ? 'Ninguém encontrado.' : 'Nenhum participante ainda.'));
    return;
  }
  ul.replaceChildren(...lista.map((p) => {
    const li = el('li');
    li.setAttribute('role', 'button');
    li.addEventListener('click', () => abrirTempo(p));
    const nome = el('span', 'nome', p.nome);
    nome.append(el('small', null, `Assinou às ${new Date(p.aceitoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`));
    li.append(el('span', 'num', num3(p.numero)), nome, tagResultado(p));
    return li;
  }));
}

function abrirTempo(p) {
  selecionado = p.id;
  $('#tempo-nome').textContent = p.nome.split(' ')[0];
  $('#tempo-numero').textContent = num3(p.numero);
  $('#tempo-min').value = p.tempoSeg == null ? '' : Math.floor(p.tempoSeg / 60);
  $('#tempo-seg').value = p.tempoSeg == null ? '' : String(p.tempoSeg % 60).padStart(2, '0');
  $('#tempo-erro').textContent = p.tempoSeg == null ? '' : `Já registrado: ${formatTempo(p.tempoSeg)}. Salvar substitui.`;
  ir('tempo');
  $('#tempo-min').focus();
}
$('#tempo-min').addEventListener('input', (e) => {
  e.target.value = digitos(e.target.value).slice(0, 2);
  if (e.target.value.length === 2) $('#tempo-seg').focus();
});
$('#tempo-seg').addEventListener('input', (e) => { e.target.value = digitos(e.target.value).slice(0, 2); });

$('#form-tempo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const seg = parseTempo($('#tempo-min').value.trim(), $('#tempo-seg').value.trim() || '0');
  if (seg == null) {
    $('#tempo-erro').textContent = 'Tempo inválido: minutos e segundos (0 a 59).';
    return;
  }
  const agora = new Date().toISOString();
  const p = await atualizar(selecionado, (x) => ({ ...x, tempoSeg: seg, tempoEm: agora, rev: x.rev + 1 }));
  mostrarResultado(p);
  enviarPendentes();
});

function mostrarResultado(p) {
  const r = resultado(p.tempoSeg);
  const primeiro = p.nome.split(' ')[0];
  const tela = $('#resultado');
  tela.classList.remove('brinde', 'desculpa');
  tela.classList.add(r);
  $('#resultado-emoji').textContent = r === 'brinde' ? '🎁' : '💪';
  $('#resultado-titulo').textContent = r === 'brinde' ? 'BRINDE!' : 'DESCULPA';
  $('#resultado-texto').textContent = r === 'brinde'
    ? `Parabéns, ${primeiro}! Menos de 6 minutos.`
    : `Não foi dessa vez, ${primeiro} — valeu o esforço!`;
  $('#resultado-tempo').textContent = formatTempo(p.tempoSeg);
  ir('resultado');
}

// ---------- ranking ----------
async function renderRanking() {
  const lista = ranking(await listar());
  const ol = $('#lista-ranking');
  if (!lista.length) {
    ol.replaceChildren(el('li', 'lista-vazia', 'Ninguém correu ainda.'));
    return;
  }
  ol.replaceChildren(...lista.map((p) => {
    const li = el('li');
    li.append(el('span', 'num', `${p.posicao}º`), el('span', 'nome', nomePublico(p.nome)), el('span', 'tempo', formatTempo(p.tempoSeg)));
    return li;
  }));
}
$('#ranking-voltar').addEventListener('click', () => ir(promotoraLogada ? 'promotora' : 'inicio'));

// ---------- envio à planilha ----------
let enviando = false;
let ultimoErro = '';
let ultimoEnvio = null;

async function enviarPendentes() {
  if (!CONFIG.planilhaUrl || enviando) return;
  enviando = true;
  try {
    for (const p of pendentes(await listar())) {
      // corpo como texto puro: requisição "simples", sem preflight de CORS no Apps Script
      const resp = await fetch(CONFIG.planilhaUrl, {
        method: 'POST',
        body: JSON.stringify({ token: CONFIG.token, participante: payloadEnvio(p) }),
      }).then((r) => r.json());
      if (!resp.ok) throw new Error(resp.erro || 'a planilha recusou o registro');
      await atualizar(p.id, (atual) => confirmarEnvio(atual, p.rev, resp));
      ultimoEnvio = new Date();
      ultimoErro = '';
    }
  } catch (e) {
    // fetch que nem chega na planilha (DNS, Wi-Fi sem saída) vira TypeError com texto técnico em inglês
    ultimoErro = !navigator.onLine ? 'sem internet' : e instanceof TypeError ? 'sem conexão com a planilha' : e.message;
  } finally {
    enviando = false;
    if (telaAtual === 'promotora') renderBarraEnvio(await listar());
  }
}
setInterval(enviarPendentes, 30e3);
addEventListener('online', enviarPendentes);
enviarPendentes();

function renderBarraEnvio(todos) {
  const barra = $('#barra-envio');
  const n = pendentes(todos).length;
  barra.className = 'barra-envio';
  if (!CONFIG.planilhaUrl) {
    barra.classList.add('pendente');
    barra.textContent = `Planilha não configurada: ${todos.length} cadastro(s) guardado(s) só neste tablet. Use "Exportar CSV".`;
  } else if (n) {
    barra.classList.add('pendente');
    barra.textContent = `${n} registro(s) aguardando envio à planilha${ultimoErro ? ` — ${ultimoErro}` : ''}. Os dados estão salvos no tablet.`;
  } else {
    barra.classList.add('ok');
    const hora = ultimoEnvio ? ` Último envio às ${ultimoEnvio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.` : '';
    barra.textContent = `✓ ${todos.length} registro(s), tudo na planilha.${hora}`;
  }
}
$('#enviar-agora').addEventListener('click', async () => {
  await enviarPendentes();
  renderBarraEnvio(await listar());
});

$('#exportar-csv').addEventListener('click', async () => {
  const lista = (await listar()).sort((a, b) => a.numero - b.numero);
  const carimbo = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const arquivo = new File([paraCSV(lista)], `hidratei-1km-${carimbo}.csv`, { type: 'text/csv' });
  // No tablet, compartilhar (WhatsApp, e-mail, Drive) é mais útil que baixar.
  if (navigator.canShare?.({ files: [arquivo] })) {
    try { await navigator.share({ files: [arquivo], title: arquivo.name }); return; } catch { /* cancelado: cai no download */ }
  }
  const a = el('a');
  a.href = URL.createObjectURL(arquivo);
  a.download = arquivo.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10e3);
});

// ---------- tablet ----------
navigator.storage?.persist?.(); // pede ao navegador para não apagar os dados sob pressão de espaço

async function manterTelaAcesa() {
  try { await navigator.wakeLock?.request('screen'); } catch { /* sem suporte ou sem gesto: segue */ }
}
addEventListener('pointerdown', manterTelaAcesa, { once: true });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') manterTelaAcesa(); });

if ('serviceWorker' in navigator) {
  const tinhaVersao = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js');
  // Versão nova (ex.: texto do termo trocado) entra quando o tablet voltar à tela inicial — nunca no meio de uma assinatura.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaVersao) return;
    if (telaAtual === 'inicio') location.reload();
    else recarregarNoInicio = true;
  });
}
