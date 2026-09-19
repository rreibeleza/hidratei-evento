// Recebe os registros do app do tablet e grava na planilha: uma linha por participante.
// O app reenvia o mesmo participante quando o tempo é registrado — a linha é ATUALIZADA pelo id, nunca duplicada.
// A assinatura vira um PNG numa pasta do Drive; a linha guarda o link.

const TOKEN = 'COLE_AQUI_O_MESMO_TOKEN_DO_APP'; // igual a CONFIG.token em public/config.js
const ABA = 'Participantes';
const PASTA = 'Hidratei 1 km — assinaturas';
const COLUNAS = [
  'id', 'numero', 'nome', 'cpf', 'nascimento', 'celular', 'email', 'termo_versao', 'aceito_em',
  'assinatura', 'tempo', 'resultado', 'tempo_registrado_em', 'dispositivo', 'atualizado_em',
];
const COL_ASSINATURA = COLUNAS.indexOf('assinatura');

function doPost(e) {
  const trava = LockService.getScriptLock();
  trava.waitLock(20000);
  try {
    const { token, participante: p } = JSON.parse(e.postData.contents);
    if (token !== TOKEN) return json({ ok: false, erro: 'token inválido' });
    if (!p || !p.id) return json({ ok: false, erro: 'registro sem id' });

    const aba = abaParticipantes();
    const ids = aba.getRange(2, 1, Math.max(aba.getLastRow() - 1, 1), 1).getValues().map((r) => r[0]);
    const linha = ids.indexOf(p.id) + 2; // 1 = não existe ainda
    const atual = linha > 1 ? aba.getRange(linha, 1, 1, COLUNAS.length).getValues()[0] : null;

    let assinatura = atual ? atual[COL_ASSINATURA] : '';
    if (!assinatura && p.assinatura) assinatura = salvarAssinatura(p);

    const valores = [
      p.id, p.numero, p.nome, texto(p.cpf), texto(p.nascimento), texto(p.celular), p.email || '',
      p.termoVersao, new Date(p.aceitoEm), assinatura, texto(p.tempo), p.resultado || '',
      p.tempoEm ? new Date(p.tempoEm) : '', p.dispositivo || '', new Date(),
    ];
    if (linha > 1) aba.getRange(linha, 1, 1, valores.length).setValues([valores]);
    else aba.appendRow(valores);

    return json({ ok: true, assinaturaSalva: !!assinatura });
  } catch (err) {
    return json({ ok: false, erro: String(err && err.message || err) });
  } finally {
    trava.releaseLock();
  }
}

// Abrir a URL /exec no navegador responde isto — serve para conferir que o deploy está no ar.
function doGet() {
  return json({ ok: true, app: 'hidratei-evento', linhas: Math.max(abaParticipantes().getLastRow() - 1, 0) });
}

// Rode UMA vez pelo editor (Executar ▶ autorizar) para dar as permissões de Planilha e Drive.
function autorizar() {
  abaParticipantes();
  pastaAssinaturas();
  Logger.log('Planilha: ' + planilha().getUrl());
}

// Funciona dos dois jeitos: script criado DENTRO da planilha (Extensões → Apps Script) usa ela; script avulso
// (script.google.com) cria a planilha na primeira execução e guarda o id.
function planilha() {
  const ativa = SpreadsheetApp.getActiveSpreadsheet();
  if (ativa) return ativa;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PLANILHA_ID');
  if (id) return SpreadsheetApp.openById(id);
  const nova = SpreadsheetApp.create('Desafio 1 km Hidratei — participantes');
  props.setProperty('PLANILHA_ID', nova.getId());
  return nova;
}

function abaParticipantes() {
  const p = planilha();
  let aba = p.getSheetByName(ABA);
  if (!aba) {
    aba = p.insertSheet(ABA);
    aba.appendRow(COLUNAS);
    aba.setFrozenRows(1);
    aba.getRange(1, 1, 1, COLUNAS.length).setFontWeight('bold');
  }
  return aba;
}

function pastaAssinaturas() {
  const achadas = DriveApp.getFoldersByName(PASTA);
  return achadas.hasNext() ? achadas.next() : DriveApp.createFolder(PASTA);
}

function salvarAssinatura(p) {
  const base64 = String(p.assinatura).split(',')[1];
  const nome = `${String(p.numero).padStart(3, '0')} - ${p.nome} - ${p.cpf}.png`;
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/png', nome);
  return pastaAssinaturas().createFile(blob).getUrl();
}

// Apóstrofo: a planilha guarda como texto (CPF e celular não perdem o zero; data e tempo não viram número).
function texto(v) {
  return v ? "'" + v : '';
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
