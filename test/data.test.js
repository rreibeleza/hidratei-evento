import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataBRparaISO } from '../docs/logica.js';

test('data BR: DD/MM/AAAA vira AAAA-MM-DD', () => {
  assert.equal(dataBRparaISO('10/03/1995'), '1995-03-10');
  assert.equal(dataBRparaISO('29/02/2000'), '2000-02-29');
});

test('data BR: recusa data que não existe, ano absurdo e formato incompleto', () => {
  assert.equal(dataBRparaISO('31/02/1990'), null);
  assert.equal(dataBRparaISO('29/02/2001'), null);
  assert.equal(dataBRparaISO('10/13/1990'), null);
  assert.equal(dataBRparaISO('10/03/1850'), null);
  assert.equal(dataBRparaISO('10/03/95'), null);
  assert.equal(dataBRparaISO(''), null);
});
