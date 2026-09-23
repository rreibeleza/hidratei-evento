import { test, expect } from '@playwright/test';
import http from 'node:http';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const TELAS = 'test-results/telas';

// Cópia de docs/ num servidor só deste teste: dá para "publicar" uma versão nova por cima sem mexer no que os outros servem.
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
async function servirCopia() {
  const dir = await mkdtemp(path.join(tmpdir(), 'hidratei-'));
  await cp('docs', dir, { recursive: true });
  let buscasDoSW = 0;
  const servidor = http.createServer(async (req, res) => {
    const caminho = new URL(req.url, 'http://x').pathname;
    if (caminho === '/sw.js') buscasDoSW++;
    const arq = path.join(dir, caminho.replace(/\/$/, '/index.html'));
    try {
      const corpo = await readFile(arq);
      res.writeHead(200, { 'content-type': TIPOS[path.extname(arq)] ?? 'application/octet-stream' });
      res.end(corpo);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  const publicar = async (arquivo, de, para) => writeFile(path.join(dir, arquivo), (await readFile(path.join(dir, arquivo), 'utf8')).replace(de, para));
  return {
    url: `http://127.0.0.1:${servidor.address().port}/`, publicar, buscasDoSW: () => buscasDoSW,
    fechar: async () => { servidor.close(); await rm(dir, { recursive: true, force: true }); },
  };
}

async function cadastrar(page, { nome = 'Ana Souza', cpf = '52998224725', nasc = '10031995', cel = '31998765432' } = {}) {
  await page.getByRole('button', { name: 'Quero participar' }).click();
  await page.getByLabel('Nome completo').fill(nome);
  await page.getByLabel('CPF').fill(cpf);
  await page.getByLabel('Data de nascimento').fill(nasc);
  await page.getByLabel('Celular').fill(cel);
  await page.getByRole('button', { name: 'Continuar' }).click();
}

async function assinar(page) {
  const box = await page.locator('#assinatura-canvas').boundingBox();
  await page.mouse.move(box.x + 40, box.y + 100);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 40 + i * 30, box.y + 100 + (i % 2 ? 35 : -35));
  await page.mouse.up();
}

async function tirarFoto(page) {
  await page.getByRole('button', { name: 'Abrir câmera' }).click();
  await page.getByRole('button', { name: 'Tirar foto' }).click();
  await expect(page.locator('#foto-miniatura')).toBeVisible();
}

// Espera a tela do termo antes de rolar: o "Continuar" é assíncrono, e rolar antes do texto chegar não libera o aceite.
async function lerEAceitar(page) {
  await expect(page.locator('#termo')).toBeVisible();
  await page.locator('#termo-texto').evaluate((e) => e.scrollTo(0, e.scrollHeight));
  await page.getByLabel('Li e concordo').check();
}

async function lerAceitarAssinar(page) {
  await lerEAceitar(page);
  await tirarFoto(page);
  await assinar(page);
  await page.getByRole('button', { name: 'Assinar e confirmar' }).click();
}

// Largura × altura da foto guardada no registro do 1º participante.
const fotoGuardada = (page) => page.evaluate(async () => {
  const { listar } = await import('./banco.js');
  const [p] = await listar();
  const img = await createImageBitmap(await (await fetch(p.foto)).blob());
  return { tipo: p.foto.slice(0, 23), largura: img.width, altura: img.height };
});

async function entrarPromotora(page) {
  await page.getByRole('button', { name: 'Promotora' }).click();
  await page.getByPlaceholder('PIN').fill('2424');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

async function registrarTempo(page, nome, min, seg) {
  await page.locator('#lista-participantes li', { hasText: nome }).click();
  await page.locator('#tempo-min').fill(min);
  await page.locator('#tempo-seg').fill(seg);
  await page.getByRole('button', { name: 'Salvar tempo' }).click();
}

test.describe('sem service worker', () => {
  test.use({ serviceWorkers: 'block' });

  test('termo: confirmar só libera depois de ler até o fim, aceitar, assinar e tirar a foto', async ({ page }) => {
    await page.goto('/');
    await cadastrar(page);
    const confirmar = page.getByRole('button', { name: 'Assinar e confirmar' });
    const aceite = page.getByLabel('Li e concordo');
    const texto = page.locator('#termo-texto');
    await expect(texto).toContainText('Participante: Ana Souza — CPF 529.982.247-25');
    await expect(texto).toContainText('Termo de Responsabilidade e Ciência de Riscos e Participação Voluntária'); // o título longo abre o texto, não aperta o cabeçalho
    await expect(texto.locator('h3')).not.toHaveCount(0); // títulos de seção viram título na tela…
    expect(await texto.innerText()).not.toMatch(/^#/m); // …e o marcador "# " não aparece para o participante
    await expect(aceite).toBeDisabled();
    await texto.evaluate((e) => e.scrollTo(0, e.scrollHeight));
    await expect(aceite).toBeEnabled();
    await aceite.check();
    await expect(confirmar).toBeDisabled(); // falta assinar
    await page.screenshot({ path: `${TELAS}/02-termo.png` });
    await assinar(page);
    await expect(confirmar).toBeDisabled(); // falta a foto
    await tirarFoto(page);
    await expect(confirmar).toBeEnabled();
    await page.screenshot({ path: `${TELAS}/02c-termo-com-foto.png`, fullPage: true });
    await page.getByRole('button', { name: 'Limpar' }).click();
    await expect(confirmar).toBeDisabled(); // limpou a assinatura
  });

  test('foto: a câmera do app abre, tira a foto, desliga e a foto fica no registro', async ({ page }) => {
    await page.addInitScript(() => {
      // espião, não dublê: a câmera continua a (falsa) do Chromium; só guarda os fluxos que ela entregou
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      window.fluxosAbertos = [];
      navigator.mediaDevices.getUserMedia = async (c) => { const s = await original(c); window.fluxosAbertos.push(s); return s; };
    });
    await page.goto('/');
    await cadastrar(page);
    await lerEAceitar(page);
    await expect(page.locator('#foto-miniatura')).toBeHidden();
    await page.getByRole('button', { name: 'Abrir câmera' }).dblclick(); // toque duplo não abre duas câmeras
    await expect(page.locator('#camera')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tirar foto' })).toBeEnabled(); // habilita quando a imagem chega
    await page.screenshot({ path: `${TELAS}/02b-camera.png` });
    await page.getByRole('button', { name: 'Tirar foto' }).click();
    await expect(page.locator('#camera')).toBeHidden();
    await expect(page.locator('#foto-miniatura')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
    const estados = () => page.evaluate(() => window.fluxosAbertos.flatMap((s) => s.getTracks()).map((t) => t.readyState));
    expect(await estados()).toEqual(['ended']); // uma câmera só, desligada depois da foto

    await page.getByRole('button', { name: 'Tirar outra' }).click(); // refazer abre a câmera de novo
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('#camera')).toBeHidden();
    expect(await estados()).toEqual(['ended', 'ended']); // cancelar também desliga
    await expect(page.locator('#foto-miniatura')).toBeVisible(); // e não apaga a foto já tirada

    await assinar(page);
    await page.getByRole('button', { name: 'Assinar e confirmar' }).click();
    await expect(page.locator('#pronto-numero')).toHaveText('001');
    expect(await fotoGuardada(page)).toEqual({ tipo: 'data:image/jpeg;base64,', largura: 640, altura: 480 });
  });

  test('foto: câmera do app bloqueada — a câmera do tablet (arquivo) tira a foto, que é reduzida para 640 px', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    });
    await page.goto('/');
    await cadastrar(page);
    await lerEAceitar(page);
    // foto grande como a da câmera do tablet (2000×1500), feita no próprio navegador
    const jpeg = Buffer.from(await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 2000; c.height = 1500;
      const g = c.getContext('2d');
      g.fillStyle = '#803000';
      g.fillRect(0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg').split(',')[1];
    }), 'base64');
    const seletor = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Abrir câmera' }).click();
    await (await seletor).setFiles({ name: 'foto.jpg', mimeType: 'image/jpeg', buffer: jpeg });
    await expect(page.locator('#foto-miniatura')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
    await expect(page.locator('#camera')).toBeHidden();
    await assinar(page);
    await page.getByRole('button', { name: 'Assinar e confirmar' }).click();
    await expect(page.locator('#pronto-numero')).toHaveText('001');
    expect(await fotoGuardada(page)).toEqual({ tipo: 'data:image/jpeg;base64,', largura: 640, altura: 480 });
  });

  test('foto: uma falha da câmera do app não manda o dia inteiro para a câmera do tablet', async ({ page }) => {
    await page.addInitScript(() => {
      // a câmera do app falha só na 1ª vez (ocupada, permissão dispensada); depois volta a ser a (falsa) do Chromium
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      let chamadas = 0;
      navigator.mediaDevices.getUserMedia = (c) => (++chamadas === 1 ? Promise.reject(new DOMException('ocupada', 'NotReadableError')) : original(c));
    });
    await page.goto('/');
    await cadastrar(page);
    await lerEAceitar(page);
    const seletor = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Abrir câmera' }).click();
    await (await seletor).setFiles({ name: 'foto.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 40; c.height = 30;
      return c.toDataURL('image/jpeg').split(',')[1];
    }), 'base64') });
    await expect(page.locator('#foto-miniatura')).toBeVisible();
    await assinar(page);
    await page.getByRole('button', { name: 'Assinar e confirmar' }).click();
    await page.getByRole('button', { name: 'Concluir' }).click();

    await cadastrar(page, { nome: 'Bruno Lima', cpf: '11144477735' });
    await lerEAceitar(page);
    await page.getByRole('button', { name: 'Abrir câmera' }).click();
    await expect(page.locator('#camera')).toBeVisible(); // o 2º participante volta a usar a câmera do app
  });

  test('fluxo completo: brinde em 6:00 cravado (o termo diz "em até 6 minutos"), desculpa em 6:01, ranking em ordem', async ({ page }) => {
    await page.goto('/');
    await page.screenshot({ path: `${TELAS}/00-inicio.png` });
    await cadastrar(page);
    await page.screenshot({ path: `${TELAS}/01-cadastro-ok.png` });
    await lerAceitarAssinar(page);
    await expect(page.locator('#pronto-numero')).toHaveText('001');
    await page.screenshot({ path: `${TELAS}/03-pronto.png` });
    await page.getByRole('button', { name: 'Concluir' }).click();

    await cadastrar(page, { nome: 'bruno lima', cpf: '11144477735', nasc: '01011990', cel: '11987654321' });
    await lerAceitarAssinar(page);
    await expect(page.locator('#pronto-numero')).toHaveText('002');
    await page.getByRole('button', { name: 'Concluir' }).click();

    await entrarPromotora(page);
    await expect(page.locator('#lista-participantes li')).toHaveCount(2);
    await expect(page.locator('#barra-envio')).toContainText('Planilha não configurada');
    await page.screenshot({ path: `${TELAS}/04-lista.png` });

    await registrarTempo(page, 'Ana Souza', '6', '00');
    await expect(page.locator('#resultado-titulo')).toHaveText('BRINDE!');
    await expect(page.locator('#resultado-tempo')).toHaveText('6:00');
    await page.screenshot({ path: `${TELAS}/05-brinde.png` });
    await page.getByRole('button', { name: 'Voltar à lista' }).click();

    await registrarTempo(page, 'bruno lima', '6', '01');
    await expect(page.locator('#resultado-titulo')).toHaveText('DESCULPA');
    await page.screenshot({ path: `${TELAS}/06-desculpa.png` });
    await page.getByRole('button', { name: 'Voltar à lista' }).click();

    await page.getByRole('button', { name: 'Ranking' }).click();
    await expect(page.locator('#lista-ranking li')).toHaveText([/1º\s*Ana S\.\s*6:00/, /2º\s*Bruno L\.\s*6:01/]);
    await page.getByRole('button', { name: 'Voltar' }).click();
    await expect(page.locator('#lista-participantes li', { hasText: '002' })).toContainText('Bruno Lima'); // digitado em minúsculas
    await page.screenshot({ path: `${TELAS}/07-ranking.png` });
  });

  test('cadastro barra menor de 18, CPF inválido e CPF que já assinou', async ({ page }) => {
    await page.goto('/');
    const hoje = new Date();
    const menor = `${String(hoje.getDate()).padStart(2, '0')}${String(hoje.getMonth() + 1).padStart(2, '0')}${hoje.getFullYear() - 17}`;
    await cadastrar(page, { nasc: menor, cpf: '52998224724' });
    await expect(page.locator('[data-erro="nascimento"]')).toContainText('maiores de 18');
    await expect(page.locator('[data-erro="cpf"]')).toHaveText('CPF inválido.');
    await page.screenshot({ path: `${TELAS}/08-erros.png` });

    await page.getByLabel('CPF').fill('52998224725');
    await page.getByLabel('Data de nascimento').fill('10031995');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await lerAceitarAssinar(page);
    await page.getByRole('button', { name: 'Concluir' }).click();

    await cadastrar(page, { nome: 'Outra Pessoa' }); // mesmo CPF
    await expect(page.locator('[data-erro="cpf"]')).toContainText('já assinou o termo (participante nº 001)');
  });

  test('exportar CSV traz os participantes', async ({ page }) => {
    await page.addInitScript(() => { navigator.canShare = () => false; });
    await page.goto('/');
    await cadastrar(page);
    await lerAceitarAssinar(page);
    await page.getByRole('button', { name: 'Concluir' }).click();
    await entrarPromotora(page);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar CSV' }).click();
    const arq = await download;
    expect(arq.suggestedFilename()).toMatch(/^hidratei-1km-\d{12}\.csv$/);
    const fs = await import('node:fs/promises');
    const csv = await fs.readFile(await arq.path(), 'utf8');
    expect(csv).toContain('numero;nome;cpf');
    expect(csv).toContain('1;Ana Souza;529.982.247-25;1995-03-10;(31) 99876-5432;;advogada-2026-09-22;'); // versão que não parece data: o Excel não a converte
  });

  test('baixar o termo assinado: PDF por participante, sem abrir a tela de tempo', async ({ page }) => {
    await page.addInitScript(() => { navigator.canShare = () => false; });
    await page.goto('/');
    await cadastrar(page);
    await lerAceitarAssinar(page);
    await page.getByRole('button', { name: 'Concluir' }).click();
    await entrarPromotora(page);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar termo de Ana Souza', exact: true }).click(); // a linha também é botão e engloba este nome
    const arq = await download;
    expect(arq.suggestedFilename()).toBe('termo-001-ana-souza.pdf');
    await expect(page.locator('#promotora')).toBeVisible(); // o toque no botão não é um toque na linha
    const fs = await import('node:fs/promises');
    await fs.mkdir(TELAS, { recursive: true });
    await arq.saveAs(`${TELAS}/termo-001-ana-souza.pdf`);
    const pdf = await fs.readFile(`${TELAS}/termo-001-ana-souza.pdf`, 'latin1');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.match(/\/Filter \/DCTDecode/g)).toHaveLength(Number(/\/Count (\d+)/.exec(pdf)[1])); // uma imagem por folha
    expect(Number(/\/Filter \/DCTDecode \/Length (\d+)/.exec(pdf)[1])).toBeGreaterThan(30_000); // folha desenhada, não em branco
  });

  test('termo baixado: identificação, aceite, assinatura e foto estão no papel; nada vaza da margem', async ({ page }) => {
    await page.addInitScript(() => { navigator.canShare = () => false; });
    await page.goto('/');
    await cadastrar(page);
    await lerAceitarAssinar(page);
    await page.getByRole('button', { name: 'Concluir' }).click();
    await entrarPromotora(page);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar termo de Ana Souza', exact: true }).click();
    const fs = await import('node:fs/promises');
    const pdf = await fs.readFile(await (await download).path(), 'latin1');
    const jpegs = [...pdf.matchAll(/\/Filter \/DCTDecode \/Length \d+ >>\nstream\n([\s\S]*?)\nendstream/g)]
      .map((j) => Buffer.from(j[1], 'latin1').toString('base64'));

    // Pixels das folhas BAIXADAS contra as mesmas folhas redesenhadas com uma coisa só trocada: se o desenho pular a
    // assinatura, a foto, a identificação ou o aceite, a variante sai idêntica à original e a diferença dá zero.
    // A identificação abre a 1ª folha; aceite, assinatura e foto fecham a última.
    const m = await page.evaluate(async (jpegsB64) => {
      const [{ desenharTermo }, { documentoTermo }, { TERMO }, { listar }] = await Promise.all(
        ['./termo-pdf.js', './logica.js', './termo.js', './banco.js'].map((a) => import(a)));
      const [p] = await listar();
      const doc = documentoTermo(p, TERMO);
      const pixels = (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const emCanvas = (img, w = img.width, h = img.height) => {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, w, h);
        if (img) g.drawImage(img, 0, 0);
        return c;
      };
      const imagem = async (dataURL) => createImageBitmap(await (await fetch(dataURL)).blob());
      const baixadas = await Promise.all(jpegsB64.map(async (b64) => pixels(emCanvas(
        await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))], { type: 'image/jpeg' }))))));
      const ultima = baixadas.length - 1;
      const emBranco = async (dataURL) => { const img = await imagem(dataURL); return emCanvas(null, img.width, img.height).toDataURL('image/png'); };
      const diferenca = async (d, assinatura, foto, i) => {
        const folha = pixels((await desenharTermo(d, assinatura, foto))[i]);
        let n = 0;
        for (let k = 1; k < folha.length; k += 4) if (Math.abs(folha[k] - baixadas[i][k]) > 80) n++;
        return n;
      };
      const trocar = (rotulo, valor) => ({ ...doc, identificacao: doc.identificacao.map(([r, v]) => (r === rotulo ? [r, valor] : [r, v])) });
      const comEmail = await desenharTermo(
        { ...doc, identificacao: [...doc.identificacao, ['E-mail', 'maria.eduarda.albuquerque.nascimento@estudante.universidadefederaldeminasgerais.edu.br']] }, p.assinatura, p.foto);
      let tintaForaDaMargem = 0;
      for (const folha of comEmail) {
        const px = pixels(folha);
        for (let y = 0; y < folha.height; y++) for (let x = 1131; x < folha.width; x++) if (px[(y * folha.width + x) * 4 + 1] < 200) tintaForaDaMargem++;
      }
      const iguais = [];
      for (let i = 0; i < baixadas.length; i++) iguais.push(await diferenca(doc, p.assinatura, p.foto, i));
      return {
        iguais,
        semAssinatura: await diferenca(doc, await emBranco(p.assinatura), p.foto, ultima),
        semFoto: await diferenca(doc, p.assinatura, await emBranco(p.foto), ultima),
        outroNascimento: await diferenca(trocar('Nascimento', '00/00/0000'), p.assinatura, p.foto, 0),
        outroAceite: await diferenca({ ...doc, aceite: 'Xxxxxxx xx xxxxxxx xxxxxxx.' }, p.assinatura, p.foto, ultima),
        tintaForaDaMargem,
      };
    }, jpegs);
    console.log('medidas do termo baixado:', JSON.stringify(m));
    // Medido em 20/09 (1 folha, sem foto): igual 0 · sem assinatura 2392 · outro nascimento 1246 · outro aceite 6438.
    expect(Math.max(...m.iguais)).toBeLessThan(50); // cada folha baixada É a deste participante (só ruído de JPEG)
    expect(m.semAssinatura).toBeGreaterThan(500);
    expect(m.semFoto).toBeGreaterThan(500);
    expect(m.outroNascimento).toBeGreaterThan(300);
    expect(m.outroAceite).toBeGreaterThan(500);
    expect(m.tintaForaDaMargem).toBe(0);
  });

  test('termo que não gera: o aviso diz que é a assinatura e não some quando a lista se redesenha', async ({ page }) => {
    await page.goto('/');
    await cadastrar(page);
    await lerAceitarAssinar(page);
    await page.getByRole('button', { name: 'Concluir' }).click();
    await page.evaluate(async () => {
      const { listar, atualizar } = await import('./banco.js');
      const [p] = await listar();
      await atualizar(p.id, (x) => ({ ...x, assinatura: 'data:image/png;base64,QUJD' })); // bytes que não são imagem
    });
    await entrarPromotora(page);
    await page.getByRole('button', { name: 'Baixar termo de Ana Souza', exact: true }).click();
    const aviso = page.locator('#termo-erro');
    await expect(aviso).toContainText('Ana Souza');
    await expect(aviso).toContainText('assinatura');
    await expect(page.locator('#barra-envio')).toContainText('Planilha não configurada'); // a barra de envio segue falando de envio
    await page.locator('#busca').fill('ana'); // redesenha a lista e a barra
    await expect(page.locator('#lista-participantes li')).toHaveCount(1);
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText('assinatura');
  });

  test('baixar o termo: texto longo (como o da advogada) vira mais de uma folha', async ({ page }) => {
    const clausula = 'Declaro estar ciente e de acordo com todas as condições desta atividade, assumindo os riscos inerentes à prática esportiva. '.repeat(4);
    const texto = Array.from({ length: 22 }, (_, i) => `${i + 1}. ${clausula}`).join('\n\n');
    await page.route('**/termo.js', (r) => r.fulfill({
      contentType: 'text/javascript',
      body: `export const TERMO = ${JSON.stringify({ versao: 'longo-1', rascunho: false, titulo: 'Termo de Ciência e Responsabilidade', texto })};`,
    }));
    await page.addInitScript(() => { navigator.canShare = () => false; });
    await page.goto('/');
    await cadastrar(page);
    await lerAceitarAssinar(page);
    await page.getByRole('button', { name: 'Concluir' }).click();
    await entrarPromotora(page);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar termo de Ana Souza', exact: true }).click();
    const fs = await import('node:fs/promises');
    await fs.mkdir(TELAS, { recursive: true });
    await (await download).saveAs(`${TELAS}/termo-longo.pdf`);
    const pdf = await fs.readFile(`${TELAS}/termo-longo.pdf`, 'latin1');
    const folhas = Number(/\/Count (\d+)/.exec(pdf)[1]);
    expect(folhas).toBeGreaterThan(1);
    expect(pdf.match(/\/Filter \/DCTDecode/g)).toHaveLength(folhas);
  });

  test('envio: 1ª ida leva a assinatura; o tempo vai depois sem reenviar a imagem; sem rede fica guardado', async ({ page }) => {
    await page.route('**/config.js', (r) => r.fulfill({
      contentType: 'application/javascript',
      body: "export const CONFIG = { evento: 'x', planilhaUrl: 'https://planilha.teste/exec', token: 'tk', pinPromotora: '2424' };",
    }));
    const recebidos = [];
    let redeNoAr = false;
    await page.route('https://planilha.teste/**', async (r) => {
      if (!redeNoAr) return r.abort('internetdisconnected');
      expect(r.request().headers()['content-type']).toMatch(/^text\/plain/); // sem preflight no Apps Script
      recebidos.push(JSON.parse(r.request().postData()));
      await r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true,"assinaturaSalva":true}' });
    });

    await page.goto('/');
    await cadastrar(page);
    await lerAceitarAssinar(page);
    await page.getByRole('button', { name: 'Concluir' }).click();
    await entrarPromotora(page);
    await expect(page.locator('#barra-envio')).toContainText('1 registro(s) aguardando envio');
    await expect(page.locator('#barra-envio')).not.toContainText('Failed');
    await page.screenshot({ path: `${TELAS}/09-sem-rede.png` });

    redeNoAr = true;
    await page.getByRole('button', { name: 'Enviar agora' }).click();
    await expect(page.locator('#barra-envio')).toContainText('tudo na planilha');
    expect(recebidos).toHaveLength(1);
    expect(recebidos[0].token).toBe('tk');
    expect(recebidos[0].participante.assinatura).toMatch(/^data:image\/png;base64,/);
    expect(recebidos[0].participante.cpf).toBe('52998224725');
    expect(recebidos[0].participante.rev).toBeUndefined();

    await registrarTempo(page, 'Ana Souza', '5', '32');
    await page.getByRole('button', { name: 'Voltar à lista' }).click();
    await expect.poll(() => recebidos.length).toBe(2);
    expect(recebidos[1].participante.assinatura).toBeUndefined();
    expect(recebidos[1].participante).toMatchObject({ tempo: '5:32', resultado: 'brinde', tempoSeg: 332 });
    await expect(page.locator('#barra-envio')).toContainText('tudo na planilha');
  });
});

test('versão nova: com o app aberto o dia todo, ela entra sozinha ao voltar ao início e ao reabrir a tela', async ({ page }) => {
  const site = await servirCopia();
  try {
    // Todo carregamento de página faz o Chrome checar o sw.js ~1,5 s depois (medido em 23/09). O teste espera essa checagem
    // passar antes de publicar: senão é ela que acha a versão nova, e o teste fica verde sem o app pedir nada.
    const esperarChecagemDoNavegador = async () => {
      const antes = site.buscasDoSW();
      await expect.poll(site.buscasDoSW, { timeout: 8000 }).toBeGreaterThan(antes);
    };
    await page.goto(site.url);
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await page.reload(); // como no tablet: o app já abre sob o service worker
    await esperarChecagemDoNavegador();
    await expect(page.locator('.hero-sub').first()).toContainText('em até');

    await site.publicar('sw.js', /const VERSAO = '[^']+'/, "const VERSAO = 'v-nova'");
    await site.publicar('index.html', 'e ganhe um brinde.', 'e ganhe um brinde. VERSÃO NOVA');
    await page.getByRole('button', { name: 'Quero participar' }).click();
    await page.getByRole('button', { name: 'Voltar' }).click(); // participante desiste: volta ao início
    await expect(page.locator('.hero-sub').first()).toContainText('VERSÃO NOVA', { timeout: 10_000 });
    await esperarChecagemDoNavegador(); // a troca recarregou a página: de novo, deixa a checagem do navegador passar

    await site.publicar('sw.js', "const VERSAO = 'v-nova'", "const VERSAO = 'v-nova-2'");
    await site.publicar('index.html', 'VERSÃO NOVA', 'VERSÃO NOVA 2');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); // tablet acordado já na tela inicial
    await expect(page.locator('.hero-sub').first()).toContainText('VERSÃO NOVA 2', { timeout: 10_000 });
  } finally {
    await site.fechar();
  }
});

test('offline: o app abre sem internet e o cadastro sobrevive a recarregar', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  // sem isto o cache HTTP comum do Chrome responde offline e esconde falha do cache do app
  await (await context.newCDPSession(page)).send('Network.clearBrowserCache');
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Quero participar' })).toBeVisible();
  await cadastrar(page);
  await lerAceitarAssinar(page);
  await expect(page.locator('#pronto-numero')).toHaveText('001');
  await page.reload();
  await entrarPromotora(page);
  await expect(page.locator('#lista-participantes li', { hasText: 'Ana Souza' })).toBeVisible();
});

test.describe('html', () => {
  test.use({ serviceWorkers: 'block' });
  test('envio: planilha que responde página de erro (HTML) vira mensagem legível, e o registro segue guardado', async ({ page }) => {
  await page.route('**/config.js', (r) => r.fulfill({
    contentType: 'application/javascript',
    body: "export const CONFIG = { evento: 'x', planilhaUrl: 'https://planilha.teste/exec', token: 'tk', pinPromotora: '2424' };",
  }));
  await page.route('https://planilha.teste/**', (r) => r.fulfill({
    contentType: 'text/html', headers: { 'access-control-allow-origin': '*' }, body: '<html><body>Erro do Google</body></html>',
  }));
  await page.goto('/');
  await cadastrar(page);
  await lerAceitarAssinar(page);
  await page.getByRole('button', { name: 'Concluir' }).click();
  await entrarPromotora(page);
  await page.getByRole('button', { name: 'Enviar agora' }).click();
  await expect(page.locator('#barra-envio')).toContainText('1 registro(s) aguardando envio à planilha — resposta inesperada da planilha');
});
});
