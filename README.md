
# UNO Online

Versão online do UNO baseada no jogo offline, usando:

- Node.js
- Express
- Socket.IO
- HTML/CSS/JavaScript
- GitHub + Render

## Estrutura

```text
uno-online/
├── public/
│   ├── index.html
│   └── client.js
├── .gitignore
├── package.json
├── render.yaml
├── server.js
└── README.md
```

## Rodar no computador

Instale Node.js 22+.

No terminal, dentro desta pasta:

```bash
npm install
npm start
```

Depois abra:

```text
http://localhost:10000
```

Abra duas ou mais abas/janelas para testar jogadores diferentes.

## GitHub

Envie todos os arquivos do projeto para o repositório.

O `.gitignore` já está configurado para Node.js e impede o envio de `node_modules`.

## Render

Crie um Web Service apontando para este repositório.

Build Command:

```text
npm install
```

Start Command:

```text
npm start
```

O servidor usa `process.env.PORT` automaticamente.

## Observação

O estado das salas fica em memória no servidor. Isso é adequado para esta primeira versão/protótipo, mas as salas serão perdidas se o serviço reiniciar ou for redeployado.
