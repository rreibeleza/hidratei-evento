import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cpfValido, idade, celularValido, emailValido, validarCadastro,
  parseTempo, formatTempo, resultado, ranking, nomePublico, paraCSV,
} from '../docs/logica.js';

const HOJE = new Date(2026, 8, 24); // 24/09/2026

test('cpf: aceita CPF válido com ou sem máscara', () => {
  assert.equal(cpfValido('529.982.247-25'), true);
  assert.equal(cpfValido('52998224725'), true);
});

test('cpf: recusa dígito verificador errado, dígitos repetidos e tamanho errado', () => {
  assert.equal(cpfValido('529.982.247-24'), false);
  assert.equal(cpfValido('529.982.247-09'), false); // só o 1º dígito verificador errado
  assert.equal(cpfValido('111.111.111-11'), false);
  assert.equal(cpfValido('5299822472'), false);
  assert.equal(cpfValido(''), false);
});

test('idade: conta anos completos, sem arredondar o aniversário que ainda não chegou', () => {
  assert.equal(idade('2008-09-24', HOJE), 18); // faz 18 hoje
  assert.equal(idade('2008-09-25', HOJE), 17); // faz 18 amanhã
  assert.equal(idade('1990-01-01', HOJE), 36);
});

test('celular: exige DDD + 9 dígitos começando com 9', () => {
  assert.equal(celularValido('(31) 99876-5432'), true);
  assert.equal(celularValido('31998765432'), true);
  assert.equal(celularValido('(31) 3876-5432'), false); // fixo
  assert.equal(celularValido('998765432'), false);      // sem DDD
});

test('email: vazio é aceito (opcional), mal formado não', () => {
  assert.equal(emailValido(''), true);
  assert.equal(emailValido('ana@gmail.com'), true);
  assert.equal(emailValido('ana@gmail'), false);
});

test('cadastro: aprova dados completos de maior de idade', () => {
  const r = validarCadastro({
    nome: 'Ana Souza', cpf: '529.982.247-25', nascimento: '1995-03-10',
    celular: '(31) 99876-5432', email: '',
  }, HOJE);
  assert.deepEqual(r, { ok: true, erros: {} });
});

test('cadastro: barra menor de 18 com mensagem no campo nascimento', () => {
  const r = validarCadastro({
    nome: 'Ana Souza', cpf: '529.982.247-25', nascimento: '2008-09-25',
    celular: '(31) 99876-5432', email: '',
  }, HOJE);
  assert.equal(r.ok, false);
  assert.match(r.erros.nascimento, /18 anos/);
});

test('cadastro: exige nome com sobrenome e aponta cada campo inválido', () => {
  const r = validarCadastro({ nome: 'Ana', cpf: '123', nascimento: '', celular: '', email: 'x' }, HOJE);
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.erros).sort(), ['celular', 'cpf', 'email', 'nascimento', 'nome']);
});

test('tempo: minutos e segundos viram segundos; segundos fora de 0-59 ou total zero são recusados', () => {
  assert.equal(parseTempo('5', '32'), 332);
  assert.equal(parseTempo('6', '0'), 360);
  assert.equal(parseTempo('5', '60'), null);
  assert.equal(parseTempo('0', '0'), null);
  assert.equal(parseTempo('', '30'), null);
  assert.equal(parseTempo('a', '10'), null);
});

test('tempo: formata como m:ss', () => {
  assert.equal(formatTempo(332), '5:32');
  assert.equal(formatTempo(307), '5:07');
  assert.equal(formatTempo(null), '');
});

test('resultado: brinde até 6:00 inclusive — o termo diz "em até 6 (seis) minutos"; 6:01 é desculpa', () => {
  assert.equal(resultado(359), 'brinde');
  assert.equal(resultado(360), 'brinde');
  assert.equal(resultado(361), 'desculpa');
  assert.equal(resultado(null), null);
});

test('ranking: só quem tem tempo, do mais rápido ao mais lento; tempo igual divide a posição (empate visível)', () => {
  const r = ranking([
    { id: 'a', tempoSeg: 400, tempoEm: '2026-09-24T10:00:00Z' },
    { id: 'b', tempoSeg: null },
    { id: 'c', tempoSeg: 300, tempoEm: '2026-09-24T10:05:00Z' },
    { id: 'd', tempoSeg: 300, tempoEm: '2026-09-24T10:01:00Z' },
  ]);
  assert.deepEqual(r.map((p) => [p.posicao, p.id]), [[1, 'd'], [1, 'c'], [3, 'a']]);
});

test('nome público: primeiro nome + inicial do último sobrenome', () => {
  assert.equal(nomePublico('Ana Maria de Souza'), 'Ana S.');
  assert.equal(nomePublico('  ana   souza '), 'Ana S.');
});

test('csv: separador ; com BOM, aspas escapadas e sem a imagem da assinatura', () => {
  const csv = paraCSV([{
    numero: 1, nome: 'Ana "Rápida" Souza', cpf: '52998224725', nascimento: '1995-03-10',
    celular: '31998765432', email: '', termoVersao: 'v1', aceitoEm: '2026-09-24T10:00:00Z',
    tempoSeg: 332, tempoEm: '2026-09-24T10:30:00Z', assinatura: 'data:image/png;base64,AAAA',
  }]);
  assert.ok(csv.startsWith('﻿'));
  const [cab, linha] = csv.slice(1).trim().split('\r\n');
  assert.equal(cab.split(';')[0], 'numero');
  assert.ok(!csv.includes('base64'));
  assert.ok(linha.includes('"Ana ""Rápida"" Souza"'));
  assert.ok(linha.includes(';5:32;'));
  assert.ok(linha.includes(';brinde;'));
});

test('csv: CPF e celular saem com máscara — o Excel não come o zero à esquerda', () => {
  const csv = paraCSV([{
    numero: 2, nome: 'Bia Lima', cpf: '01234567890', nascimento: '1990-01-01',
    celular: '31998765432', email: '', termoVersao: 'v1', aceitoEm: '2026-09-24T10:00:00Z',
  }]);
  assert.ok(csv.includes(';012.345.678-90;'));
  assert.ok(csv.includes(';(31) 99876-5432;'));
});
