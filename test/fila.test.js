import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendentes, payloadEnvio, confirmarEnvio } from '../docs/logica.js';

const base = { id: 'a', numero: 1, nome: 'Ana Souza', assinatura: 'data:image/png;base64,AAAA' };

test('pendentes: registro com revisão acima da sincronizada, em ordem de número', () => {
  const lista = [
    { ...base, id: 'b', numero: 2, rev: 1 },
    { ...base, id: 'a', numero: 1, rev: 2, revSincronizada: 1 },
    { ...base, id: 'c', numero: 3, rev: 1, revSincronizada: 1 },
  ];
  assert.deepEqual(pendentes(lista).map((p) => p.id), ['a', 'b']);
});

test('payload: leva a assinatura só enquanto a planilha não confirmou que guardou', () => {
  assert.equal(payloadEnvio({ ...base, rev: 1 }).assinatura, base.assinatura);
  assert.equal('assinatura' in payloadEnvio({ ...base, rev: 2, assinaturaSincronizada: true }), false);
});

test('payload: não carrega campos internos de controle da fila', () => {
  const p = payloadEnvio({ ...base, rev: 3, revSincronizada: 2, assinaturaSincronizada: true });
  for (const k of ['rev', 'revSincronizada', 'assinaturaSincronizada']) assert.equal(k in p, false);
});

test('confirmar: marca a revisão enviada e a assinatura guardada', () => {
  const r = confirmarEnvio({ ...base, rev: 2 }, 2, { ok: true, assinaturaSalva: true });
  assert.equal(r.revSincronizada, 2);
  assert.equal(r.assinaturaSincronizada, true);
  assert.equal(pendentes([r]).length, 0);
});

test('confirmar: edição feita durante o envio continua pendente', () => {
  // enviou rev 2; enquanto a resposta viajava, a promotora gravou o tempo (rev 3)
  const r = confirmarEnvio({ ...base, rev: 3 }, 2, { ok: true, assinaturaSalva: true });
  assert.equal(r.revSincronizada, 2);
  assert.equal(pendentes([r]).length, 1);
});

test('confirmar: resposta de erro não muda nada', () => {
  const antes = { ...base, rev: 2, revSincronizada: 1 };
  assert.deepEqual(confirmarEnvio(antes, 2, { ok: false, erro: 'x' }), antes);
});

test('payload: leva tempo formatado e resultado prontos — a regra do brinde mora só no app', () => {
  const p = payloadEnvio({ ...base, rev: 2, tempoSeg: 359 });
  assert.equal(p.tempo, '5:59');
  assert.equal(p.resultado, 'brinde');
  const semTempo = payloadEnvio({ ...base, rev: 1, tempoSeg: null });
  assert.equal(semTempo.tempo, '');
  assert.equal(semTempo.resultado, '');
});
