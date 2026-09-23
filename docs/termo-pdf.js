// Desenha o termo assinado em folhas A4 (canvas → JPEG) e devolve o PDF. Tudo no aparelho: funciona sem internet.
// O QUE vai escrito vem de documentoTermo (logica.js, testado); aqui é só a diagramação.
import { montarPDF, quebrarLinhas } from './logica.js';

const L = 1240, A = 1754, MARGEM = 110; // A4 a ~150 dpi
const VERDE = '#0f3316', SUAVE = '#4a5c2c', LIMA = '#d4d878';
const fonte = (peso, px) => `${peso} ${px}px 'Outfit', sans-serif`;

const imagem = (src, falha) => new Promise((ok, erro) => {
  const i = new Image();
  i.onload = () => ok(i);
  i.onerror = () => erro(new Error(falha));
  i.src = src;
});

// Devolve as folhas (canvas) já desenhadas — separado do PDF para o teste poder olhar o que foi parar no papel.
export async function desenharTermo(doc, assinaturaDataURL, fotoDataURL) {
  await Promise.all([400, 700, 800].map((peso) => document.fonts.load(fonte(peso, 24))));
  const [logo, assinatura, foto] = await Promise.all([
    imagem('logo.svg', 'o logo não carregou'),
    imagem(assinaturaDataURL, 'a assinatura guardada neste aparelho não pôde ser lida'),
    // registro de antes da foto sai sem ela, não com erro
    fotoDataURL && imagem(fotoDataURL, 'a foto guardada neste aparelho não pôde ser lida'),
  ]);

  const folhas = [];
  let ctx, y;
  const novaFolha = () => {
    const c = document.createElement('canvas');
    c.width = L; c.height = A;
    ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, L, A);
    ctx.textBaseline = 'top';
    folhas.push(c);
    y = MARGEM;
  };
  const caber = (altura) => { if (y + altura > A - MARGEM - 50) novaFolha(); };
  const escrever = (texto, { f, cor = VERDE, entrelinha, depois = 0, x = MARGEM, largura = L - MARGEM - x }) => {
    ctx.font = f;
    for (const linha of quebrarLinhas(texto, largura, (t) => ctx.measureText(t).width)) {
      caber(entrelinha);
      ctx.font = f; // a folha pode ter virado: contexto novo
      ctx.fillStyle = cor;
      ctx.fillText(linha, x, y);
      y += entrelinha;
    }
    y += depois;
  };

  novaFolha();
  // Lockup da linha, como na tela inicial: símbolo + HIDRATEI com a tarja SPORT sob o nome. As proporções da tarja
  // são as de .marca-sport (estilo.css) e dependem do desenho do logo.svg — trocou o logo, ajuste nos dois lugares.
  const w = 300, hLogo = w * logo.height / logo.width;
  ctx.drawImage(logo, MARGEM, y, w, hLogo);
  const tarja = { x: MARGEM + w * .275, y: y + hLogo - w * .064, w: w * .725, h: w * .088 };
  ctx.fillStyle = VERDE;
  ctx.fillRect(tarja.x, tarja.y, tarja.w, tarja.h);
  ctx.font = fonte(700, 16);
  ctx.fillStyle = LIMA;
  ctx.textAlign = 'center';
  ctx.letterSpacing = '5px';
  ctx.fillText('SPORT', tarja.x + tarja.w / 2 + 2, tarja.y + 6);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'left';
  y = tarja.y + tarja.h + 50;

  if (doc.rascunho) escrever('RASCUNHO — texto provisório, sem validade.', { f: fonte(700, 22), cor: '#8a5a00', entrelinha: 32, depois: 14 });
  escrever(doc.titulo.toUpperCase(), { f: fonte(800, 36), entrelinha: 46, depois: 22 });
  for (const [rotulo, valor] of doc.identificacao) {
    caber(36);
    ctx.font = fonte(700, 20);
    ctx.fillStyle = SUAVE;
    ctx.fillText(rotulo.toUpperCase(), MARGEM, y + 3);
    escrever(valor, { f: fonte(400, 24), entrelinha: 36, x: MARGEM + 250 });
  }
  y += 14;
  caber(30);
  ctx.fillStyle = VERDE;
  ctx.fillRect(MARGEM, y, L - 2 * MARGEM, 3);
  y += 30;

  for (const p of doc.paragrafos) {
    if (p.titulo) { y += 12; caber(3 * 37); } // título de seção não fica sozinho no pé da folha
    escrever(p.texto, { f: fonte(p.titulo ? 700 : 400, 24), entrelinha: 37, depois: p.titulo ? 8 : 16 });
  }
  y += 10;
  // "Li e concordo", a assinatura, a foto, a linha e o nome ficam na MESMA folha: assinatura sozinha numa página não diz
  // o que aceitou. A foto (até 420×300) fica à direita da assinatura, alinhada ao topo dela.
  const wAss = Math.min(560, assinatura.width), hAss = wAss * assinatura.height / assinatura.width;
  const eFoto = foto ? Math.min(420 / foto.width, 300 / foto.height) : 0;
  const wFoto = foto ? foto.width * eFoto : 0, hFoto = foto ? foto.height * eFoto : 0;
  caber(2 * 37 + 24 + Math.max(hAss + 90, hFoto + 40));
  escrever(doc.aceite, { f: fonte(700, 24), entrelinha: 37, depois: 24 });

  const topo = y;
  ctx.drawImage(assinatura, MARGEM, y, wAss, hAss);
  y += hAss + 6;
  ctx.fillStyle = VERDE;
  ctx.fillRect(MARGEM, y, wAss, 2);
  y += 12;
  const de = (r) => doc.identificacao.find(([rotulo]) => rotulo === r)[1];
  // nome comprido quebra antes da foto em vez de passar por baixo dela
  escrever(`${de('Nome')} — CPF ${de('CPF')}`, { f: fonte(400, 22), cor: SUAVE, entrelinha: 32, largura: L - 2 * MARGEM - (foto ? wFoto + 40 : 0) });
  if (foto) {
    ctx.drawImage(foto, L - MARGEM - wFoto, topo, wFoto, hFoto);
    ctx.font = fonte(400, 18);
    ctx.fillStyle = SUAVE;
    ctx.textAlign = 'right';
    ctx.fillText(doc.legendaFoto, L - MARGEM, topo + hFoto + 8);
    ctx.textAlign = 'left';
  }

  folhas.forEach((c, i) => {
    const g = c.getContext('2d');
    g.font = fonte(400, 17);
    g.fillStyle = SUAVE;
    g.fillText(`${doc.rodape} · página ${i + 1} de ${folhas.length}`, MARGEM, A - MARGEM + 20);
  });

  return folhas;
}

export async function gerarPDFTermo(doc, assinaturaDataURL, fotoDataURL) {
  const folhas = await desenharTermo(doc, assinaturaDataURL, fotoDataURL);
  const paginas = await Promise.all(folhas.map(async (c) => {
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.9));
    return { jpeg: new Uint8Array(await blob.arrayBuffer()), largura: L, altura: A };
  }));
  return montarPDF(paginas);
}
