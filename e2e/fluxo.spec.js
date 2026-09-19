import { test, expect } from '@playwright/test';

const TELAS = 'test-results/telas';

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

async function lerAceitarAssinar(page) {
  await expect(page.locator('#termo')).toBeVisible();
  await page.locator('#termo-texto').evaluate((e) => e.scrollTo(0, e.scrollHeight));
  await page.getByLabel('Li e concordo').check();
  await assinar(page);
  await page.getByRole('button', { name: 'Assinar e confirmar' }).click();
}

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

  test('termo: confirmar só libera depois de ler até o fim, aceitar e assinar', async ({ page }) => {
    await page.goto('/');
    await cadastrar(page);
    const confirmar = page.getByRole('button', { name: 'Assinar e confirmar' });
    const aceite = page.getByLabel('Li e concordo');
    await expect(page.getByText('RASCUNHO')).toBeVisible();
    await expect(page.locator('#termo-texto')).toContainText('Participante: Ana Souza — CPF 529.982.247-25');
    await expect(aceite).toBeDisabled();
    await page.locator('#termo-texto').evaluate((e) => e.scrollTo(0, e.scrollHeight));
    await expect(aceite).toBeEnabled();
    await aceite.check();
    await expect(confirmar).toBeDisabled(); // falta assinar
    await page.screenshot({ path: `${TELAS}/02-termo.png` });
    await assinar(page);
    await expect(confirmar).toBeEnabled();
    await page.getByRole('button', { name: 'Limpar' }).click();
    await expect(confirmar).toBeDisabled(); // limpou a assinatura
  });

  test('fluxo completo: brinde abaixo de 6:00, desculpa em 6:00 cravado, ranking em ordem', async ({ page }) => {
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

    await registrarTempo(page, 'Ana Souza', '5', '59');
    await expect(page.locator('#resultado-titulo')).toHaveText('BRINDE!');
    await expect(page.locator('#resultado-tempo')).toHaveText('5:59');
    await page.screenshot({ path: `${TELAS}/05-brinde.png` });
    await page.getByRole('button', { name: 'Voltar à lista' }).click();

    await registrarTempo(page, 'bruno lima', '6', '00');
    await expect(page.locator('#resultado-titulo')).toHaveText('DESCULPA');
    await page.screenshot({ path: `${TELAS}/06-desculpa.png` });
    await page.getByRole('button', { name: 'Voltar à lista' }).click();

    await page.getByRole('button', { name: 'Ranking' }).click();
    await expect(page.locator('#lista-ranking li')).toHaveText([/1º\s*Ana S\.\s*5:59/, /2º\s*Bruno L\.\s*6:00/]);
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
    expect(csv).toContain('1;Ana Souza;52998224725;1995-03-10;31998765432;;rascunho-1;');
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
