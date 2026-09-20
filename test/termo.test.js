import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentoTermo, nomeArquivoTermo, montarPDF, quebrarLinhas } from '../docs/logica.js';

const TERMO = { versao: 'v-final', rascunho: false, titulo: 'Termo de Ciência', texto: 'Primeiro parágrafo.\n\nSegundo parágrafo.' };
const ana = {
  id: 'abc-123', numero: 7, nome: 'Ana Souza', cpf: '52998224725', nascimento: '1995-03-10',
  celular: '31998765432', email: '', termoVersao: 'v-final', aceitoEm: '2026-09-24T13:05:09.000Z',
};
const valor = (doc, rotulo) => doc.identificacao.find(([r]) => r === rotulo)?.[1];

test('documento: identifica o participante com CPF, nascimento e celular legíveis', () => {
  const doc = documentoTermo(ana, TERMO);
  assert.equal(valor(doc, 'Participante nº'), '007');
  assert.equal(valor(doc, 'Nome'), 'Ana Souza');
  assert.equal(valor(doc, 'CPF'), '529.982.247-25');
  assert.equal(valor(doc, 'Nascimento'), '10/03/1995');
  assert.equal(valor(doc, 'Celular'), '(31) 99876-5432');
});

test('documento: e-mail só aparece quando foi informado', () => {
  assert.equal(valor(documentoTermo(ana, TERMO), 'E-mail'), undefined);
  assert.equal(valor(documentoTermo({ ...ana, email: 'ana@x.com' }, TERMO), 'E-mail'), 'ana@x.com');
});

test('documento: traz o texto do termo em parágrafos, a versão e o registro', () => {
  const doc = documentoTermo(ana, TERMO);
  assert.equal(doc.titulo, 'Termo de Ciência');
  assert.deepEqual(doc.paragrafos, ['Primeiro parágrafo.', 'Segundo parágrafo.']);
  assert.match(doc.rodape, /v-final/);
  assert.match(doc.rodape, /abc-123/);
  assert.match(doc.aceite, /Li e concordo/);
  assert.ok(doc.aceite.includes(new Date(ana.aceitoEm).toLocaleString('pt-BR')));
});

test('documento: assinatura de OUTRA versão não recebe o texto atual como se fosse o assinado', () => {
  const doc = documentoTermo({ ...ana, termoVersao: 'rascunho-1' }, TERMO);
  assert.equal(doc.paragrafos.join(' ').includes('Primeiro parágrafo'), false);
  assert.match(doc.paragrafos.join(' '), /rascunho-1/);
  assert.match(doc.rodape, /rascunho-1/);
});

test('documento: termo em rascunho sai marcado como rascunho', () => {
  assert.equal(documentoTermo(ana, TERMO).rascunho, false);
  assert.equal(documentoTermo(ana, { ...TERMO, rascunho: true }).rascunho, true);
});

test('arquivo: nome com número e nome sem acento', () => {
  assert.equal(nomeArquivoTermo({ numero: 7, nome: 'João da Silva-Nunes' }), 'termo-007-joao-da-silva-nunes.pdf');
});

const texto = (bytes) => Buffer.from(bytes).toString('latin1');

test('pdf: cada entrada do xref aponta para o objeto certo e o startxref para o xref', () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
  const pdf = texto(montarPDF([{ jpeg, largura: 1240, altura: 1754 }, { jpeg, largura: 1240, altura: 1754 }]));
  assert.ok(pdf.startsWith('%PDF-1.4'));
  assert.match(pdf, /\/Type \/Pages[^>]*\/Count 2\b/);
  const inicioXref = Number(/startxref\n(\d+)\n%%EOF/.exec(pdf)[1]);
  assert.equal(pdf.slice(inicioXref, inicioXref + 4), 'xref');
  const entradas = [...pdf.slice(inicioXref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.equal(entradas.length, 2 + 3 * 2); // catálogo + páginas + (página, conteúdo, imagem) por folha
  entradas.forEach((pos, i) => assert.equal(pdf.slice(pos, pos + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
});

test('pdf: o JPEG entra inteiro, com tamanho e dimensões declarados', () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 9, 8, 7, 6, 0xff, 0xd9]);
  const pdf = texto(montarPDF([{ jpeg, largura: 300, altura: 200 }]));
  assert.match(pdf, /\/Width 300 \/Height 200\b/);
  assert.match(pdf, /\/Filter \/DCTDecode/);
  assert.match(pdf, new RegExp(`/Length ${jpeg.length}\\b`));
  assert.ok(pdf.includes(`stream\n${texto(jpeg)}\nendstream`));
});

const medir = (s) => s.length * 10; // 10 px por caractere

test('quebra de linha: texto comum quebra nos espaços e cabe na largura', () => {
  assert.deepEqual(quebrarLinhas('um dois tres quatro cinco', 100, medir), ['um dois', 'tres', 'quatro', 'cinco']);
});

test('quebra de linha: palavra mais larga que a coluna (e-mail longo) é partida sem perder caractere', () => {
  const email = 'maria.eduarda.albuquerque.nascimento@estudante.universidadefederaldeminasgerais.edu.br';
  const linhas = quebrarLinhas(`contato ${email} fim`, 300, medir);
  assert.ok(linhas.every((l) => medir(l) <= 300), `linha estoura a coluna: ${JSON.stringify(linhas)}`);
  assert.equal(linhas.join('').replaceAll(' ', ''), `contato${email}fim`);
});
