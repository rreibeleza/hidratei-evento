// Armazenamento no tablet (IndexedDB): funciona sem internet e aguenta as imagens das assinaturas.
const abrir = () => new Promise((ok, erro) => {
  const r = indexedDB.open('hidratei-evento', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('participantes', { keyPath: 'id' });
  r.onsuccess = () => ok(r.result);
  r.onerror = () => erro(r.error);
});
let conexao;
const db = () => (conexao ??= abrir());

async function transacao(modo, fn) {
  const store = (await db()).transaction('participantes', modo).objectStore('participantes');
  return new Promise((ok, erro) => {
    const tx = store.transaction;
    let resultado;
    fn(store, (v) => { resultado = v; });
    tx.oncomplete = () => ok(resultado);
    tx.onerror = tx.onabort = () => erro(tx.error);
  });
}

export const listar = () =>
  transacao('readonly', (s, fim) => { s.getAll().onsuccess = (e) => fim(e.target.result); });

// Lê, altera e grava na MESMA transação — o envio à planilha e a promotora não se atropelam.
// `fn` recebe o registro e devolve o novo (ou null para não mexer).
export const atualizar = (id, fn) =>
  transacao('readwrite', (s, fim) => {
    s.get(id).onsuccess = (e) => {
      const novo = e.target.result && fn(e.target.result);
      if (novo) { s.put(novo); fim(novo); }
    };
  });

export const inserir = (p) => transacao('readwrite', (s, fim) => { s.add(p); fim(p); });
