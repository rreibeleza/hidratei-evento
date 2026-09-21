// Regras puras do app — sem DOM, sem armazenamento. Testadas em test/logica.test.js.

export const LIMITE_BRINDE_SEG = 6 * 60; // "menos de 6 minutos" ganha brinde
export const IDADE_MINIMA = 18;

const digitos = (s) => String(s ?? '').replace(/\D/g, '');

export function cpfValido(cpf) {
  const d = digitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function idade(nascimentoISO, hoje = new Date()) {
  const [a, m, d] = nascimentoISO.split('-').map(Number);
  let anos = hoje.getFullYear() - a;
  const mes = hoje.getMonth() + 1;
  if (mes < m || (mes === m && hoje.getDate() < d)) anos--;
  return anos;
}

export const celularValido = (s) => /^[1-9]{2}9\d{8}$/.test(digitos(s));

export const emailValido = (s) => !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export function validarCadastro(dados, hoje = new Date()) {
  const erros = {};
  if (dados.nome.trim().split(/\s+/).length < 2) erros.nome = 'Informe nome e sobrenome.';
  if (!cpfValido(dados.cpf)) erros.cpf = 'CPF inválido.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.nascimento)) erros.nascimento = 'Informe a data de nascimento.';
  else if (idade(dados.nascimento, hoje) < IDADE_MINIMA) erros.nascimento = `Participação só para maiores de ${IDADE_MINIMA} anos.`;
  if (!celularValido(dados.celular)) erros.celular = 'Celular com DDD, ex.: (31) 99876-5432.';
  if (!emailValido(dados.email)) erros.email = 'E-mail inválido.';
  return { ok: Object.keys(erros).length === 0, erros };
}

export function parseTempo(min, seg) {
  if (!/^\d+$/.test(String(min)) || !/^\d+$/.test(String(seg))) return null;
  const m = Number(min), s = Number(seg);
  if (s > 59 || m * 60 + s === 0) return null;
  return m * 60 + s;
}

export function formatTempo(seg) {
  if (seg == null) return '';
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
}

export function resultado(seg) {
  if (seg == null) return null;
  return seg < LIMITE_BRINDE_SEG ? 'brinde' : 'desculpa';
}

export function ranking(participantes) {
  return participantes
    .filter((p) => p.tempoSeg != null)
    .sort((a, b) => a.tempoSeg - b.tempoSeg || a.tempoEm.localeCompare(b.tempoEm))
    // tempo igual = mesma posição (1, 1, 3): a promotora vê o empate em vez de o app decidir por quem registrou antes
    .map((p, i, lista) => ({ ...p, posicao: lista.findIndex((q) => q.tempoSeg === p.tempoSeg) + 1 }));
}

export function nomePublico(nome) {
  const partes = nome.trim().split(/\s+/);
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const ultimo = partes.length > 1 ? ` ${partes.at(-1)[0].toUpperCase()}.` : '';
  return cap(partes[0]) + ultimo;
}

const mascaraCPF = (cpf) => cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
const mascaraCelular = (cel) => cel.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');

// CPF e celular vão com máscara: só dígitos, o Excel abre como número e come o zero à esquerda do CPF.
const COLUNAS_CSV = [
  ['numero', (p) => p.numero],
  ['nome', (p) => p.nome],
  ['cpf', (p) => mascaraCPF(p.cpf)],
  ['nascimento', (p) => p.nascimento],
  ['celular', (p) => mascaraCelular(p.celular)],
  ['email', (p) => p.email],
  ['termo_versao', (p) => p.termoVersao],
  ['aceito_em', (p) => p.aceitoEm],
  ['tempo', (p) => formatTempo(p.tempoSeg)],
  ['resultado', (p) => resultado(p.tempoSeg) ?? ''],
  ['tempo_registrado_em', (p) => p.tempoEm ?? ''],
];

export function paraCSV(participantes) {
  const cel = (v) => {
    const s = String(v ?? '');
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhas = [COLUNAS_CSV.map(([c]) => c).join(';')];
  for (const p of participantes) linhas.push(COLUNAS_CSV.map(([, f]) => cel(f(p))).join(';'));
  return '﻿' + linhas.join('\r\n') + '\r\n';
}

// Fila de envio à planilha. Cada gravação local sobe `rev`; a planilha confirma a `rev` que recebeu.
// A assinatura (imagem) só viaja até a planilha confirmar que a guardou.

export const pendentes = (lista) =>
  lista.filter((p) => p.rev > (p.revSincronizada ?? 0)).sort((a, b) => a.numero - b.numero);

export function payloadEnvio(p) {
  const { rev, revSincronizada, assinaturaSincronizada, assinatura, ...resto } = p;
  const dados = { ...resto, tempo: formatTempo(p.tempoSeg), resultado: resultado(p.tempoSeg) ?? '' };
  return assinaturaSincronizada ? dados : { ...dados, assinatura };
}

export function confirmarEnvio(p, revEnviada, resposta) {
  if (!resposta?.ok) return p;
  return {
    ...p,
    revSincronizada: Math.max(p.revSincronizada ?? 0, revEnviada),
    assinaturaSincronizada: p.assinaturaSincronizada || !!resposta.assinaturaSalva,
  };
}

export function dataBRparaISO(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const [, d, mes, a] = m.map(Number);
  const dt = new Date(a, mes - 1, d);
  if (a < 1900 || dt.getFullYear() !== a || dt.getMonth() !== mes - 1 || dt.getDate() !== d) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
export const nomeProprio = (nome) => nome.trim().toLowerCase().split(/\s+/)
  .map((p, i) => (i > 0 && PARTICULAS.has(p) ? p : p.replace(/(^|-)(\p{L})/gu, (_, h, l) => h + l.toUpperCase())))
  .join(' ');

// Termo assinado para baixar. Cada registro guarda a VERSÃO que a pessoa aceitou, não o texto: se o texto do
// aparelho já é de outra versão, o documento diz isso em vez de imprimir o texto atual como se fosse o assinado.
export function documentoTermo(p, termo) {
  const textoDisponivel = p.termoVersao === termo.versao;
  const [a, m, d] = p.nascimento.split('-');
  return {
    titulo: termo.titulo,
    rascunho: textoDisponivel && !!termo.rascunho,
    identificacao: [
      ['Participante nº', String(p.numero).padStart(3, '0')],
      ['Nome', p.nome],
      ['CPF', mascaraCPF(p.cpf)],
      ['Nascimento', `${d}/${m}/${a}`],
      ['Celular', mascaraCelular(p.celular)],
      ...(p.email ? [['E-mail', p.email]] : []),
    ],
    paragrafos: textoDisponivel
      ? termo.texto.split(/\n\s*\n/).map((t) => t.trim())
      : [`Este participante assinou a versão "${p.termoVersao}" do termo. O texto guardado neste aparelho já é o da versão "${termo.versao}", por isso não é reproduzido aqui: consulte o texto arquivado da versão "${p.termoVersao}".`],
    aceite: `Li e concordo com o termo acima. Aceito e assinado em ${new Date(p.aceitoEm).toLocaleString('pt-BR')}.`,
    rodape: `Versão do termo: ${p.termoVersao} · Registro: ${p.id}`,
  };
}

export const nomeArquivoTermo = (p) =>
  `termo-${String(p.numero).padStart(3, '0')}-${p.nome.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.pdf`;

// PDF mínimo: uma imagem JPEG por folha A4 (o navegador já entrega o JPEG do canvas; o PDF o embute como está).
export function montarPDF(paginas) {
  const enc = new TextEncoder();
  const partes = [];
  const posicoes = [];
  let tamanho = 0;
  const por = (dado) => { const b = typeof dado === 'string' ? enc.encode(dado) : dado; partes.push(b); tamanho += b.length; };
  const objeto = (n, corpo, stream) => {
    posicoes[n] = tamanho;
    por(`${n} 0 obj\n${corpo}\n`);
    if (stream) { por('stream\n'); por(stream); por('\nendstream\n'); }
    por('endobj\n');
  };
  por('%PDF-1.4\n');
  const filhos = paginas.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  objeto(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objeto(2, `<< /Type /Pages /Kids [${filhos}] /Count ${paginas.length} >>`);
  paginas.forEach(({ jpeg, largura, altura }, i) => {
    const n = 3 + i * 3;
    const conteudo = enc.encode('q 595 0 0 842 0 0 cm /Im0 Do Q');
    objeto(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${n + 1} 0 R /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> >>`);
    objeto(n + 1, `<< /Length ${conteudo.length} >>`, conteudo);
    objeto(n + 2, `<< /Type /XObject /Subtype /Image /Width ${largura} /Height ${altura} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
  });
  const total = 2 + paginas.length * 3;
  const inicioXref = tamanho;
  por(`xref\n0 ${total + 1}\n0000000000 65535 f \n`);
  for (let n = 1; n <= total; n++) por(`${String(posicoes[n]).padStart(10, '0')} 00000 n \n`);
  por(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`);
  const pdf = new Uint8Array(tamanho);
  let pos = 0;
  for (const b of partes) { pdf.set(b, pos); pos += b.length; }
  return pdf;
}

// Quebra de linha para a folha do termo. `medir` devolve a largura do texto (no app, a do canvas).
// Palavra sozinha mais larga que a coluna — e-mail comprido — é partida por caractere em vez de vazar da folha.
export function quebrarLinhas(texto, largura, medir) {
  const linhas = [];
  let atual = '';
  for (let palavra of texto.split(/\s+/).filter(Boolean)) {
    while (medir(palavra) > largura) {
      let n = palavra.length - 1;
      while (n > 1 && medir(palavra.slice(0, n)) > largura) n--;
      if (atual) { linhas.push(atual); atual = ''; }
      linhas.push(palavra.slice(0, n));
      palavra = palavra.slice(n);
    }
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (atual && medir(tentativa) > largura) { linhas.push(atual); atual = palavra; } else atual = tentativa;
  }
  return atual ? [...linhas, atual] : linhas;
}
