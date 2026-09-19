# Desafio 1 km Hidratei — app do tablet

PWA offline do evento de 24/09/2026: o participante preenche os dados, lê e assina o termo; a promotora
(PIN) registra o tempo do 1 km — abaixo de 6:00 ganha brinde. Tudo fica salvo no tablet (IndexedDB) e sobe
para uma Google Sheet quando há internet. Plano B: **Exportar CSV** na área da promotora.

- `docs/` — o site (GitHub Pages publica esta pasta). Sem build.
- `docs/termo.js` — **o texto do termo** (único lugar). `docs/config.js` — URL da planilha, token, PIN.
- `planilha/Codigo.gs` — Apps Script da planilha (recebe os registros; assinatura vira PNG no Drive).
- Mudou qualquer arquivo de `docs/`? Suba `VERSAO` em `docs/sw.js`, senão o tablet segue com a versão antiga.

## Testes

```sh
npm test                 # regras (CPF, idade, tempo, brinde, ranking, fila de envio)
npx playwright test      # fluxo no tablet: cadastro → termo → tempo → ranking, envio e offline
```

## Planilha (uma vez)

1. Nova Google Sheet → Extensões → Apps Script → cole `planilha/Codigo.gs` e ponha o `TOKEN`.
2. Rode `autorizar` (▶) e aceite as permissões.
3. Implantar → Nova implantação → App da Web · Executar como **eu** · Acesso **qualquer pessoa**.
4. Cole a URL `/exec` e o mesmo token em `docs/config.js`, suba `VERSAO` no `sw.js` e publique.

## No tablet (antes do evento, com internet)

Abra o link no Chrome (Android) ou Safari (iPad) → **Adicionar à tela inicial** → abra pelo ícone uma vez
com internet. Daí em diante funciona sem sinal.
