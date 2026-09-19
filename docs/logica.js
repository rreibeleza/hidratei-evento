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
    .map((p, i) => ({ ...p, posicao: i + 1 }));
}

export function nomePublico(nome) {
  const partes = nome.trim().split(/\s+/);
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const ultimo = partes.length > 1 ? ` ${partes.at(-1)[0].toUpperCase()}.` : '';
  return cap(partes[0]) + ultimo;
}

const COLUNAS_CSV = [
  ['numero', (p) => p.numero],
  ['nome', (p) => p.nome],
  ['cpf', (p) => p.cpf],
  ['nascimento', (p) => p.nascimento],
  ['celular', (p) => p.celular],
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
