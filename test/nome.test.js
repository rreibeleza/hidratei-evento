import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nomeProprio } from '../docs/logica.js';

test('nome próprio: capitaliza cada nome e mantém as partículas em minúsculas', () => {
  assert.equal(nomeProprio('bruno lima'), 'Bruno Lima');
  assert.equal(nomeProprio('  ANA MARIA   DE SOUZA '), 'Ana Maria de Souza');
  assert.equal(nomeProprio('ana-clara dos santos e silva'), 'Ana-Clara dos Santos e Silva');
  assert.equal(nomeProprio('érica ávila'), 'Érica Ávila');
});
