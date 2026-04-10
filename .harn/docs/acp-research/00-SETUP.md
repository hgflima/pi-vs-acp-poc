# ACP Runtime Setup

Instalação e configuração do runtime ACP (Agent Client Protocol) no pi-ai-poc.

## O que é ACP

ACP permite que o pi-ai-poc use agentes externos como subprocessos (claude-agent-acp,
codex-acp) falando o Agent Client Protocol via ndjson em stdin/stdout, mantendo a
mesma UI de chat + streaming do modo PI nativo.

- **PI mode** (default): chat direto via `@mariozechner/pi-agent-core` → API do provider.
- **ACP mode**: backend faz spawn de um CLI externo em um tmpdir, abre sessão ACP,
  envia prompt, e converte eventos `session/update` em SSE para o frontend.

## Dependências de CLI

O runtime ACP não embute nenhum agente — ele requer CLIs já instalados no PATH.

### claude-agent-acp (agente Claude rodando ACP)

Verificar disponibilidade:
```bash
which claude-agent-acp
claude-agent-acp --version
```

Instalar via npm: `npm i -g @agentclientprotocol/claude-agent-acp`. O pacote
antigo `@zed-industries/claude-code-acp` está deprecated — o binário continua
chamando `claude-agent-acp`, mas a fonte mudou de organização.

Login (se exigido pelo binário):
```bash
claude-agent-acp login
```

### codex-acp (agente OpenAI Codex rodando ACP)

Verificar disponibilidade:
```bash
which codex-acp
codex-acp --version
```

Login (se exigido):
```bash
codex-acp login
```

## Verificar PATH

Antes de iniciar o servidor, garantir que o `PATH` do shell que inicia
`npm run dev` contém os binários ACP:

```bash
which claude-agent-acp codex-acp
```

Se um binário existir mas não aparecer no backend, é provável que o processo do
backend tenha sido iniciado com um `PATH` reduzido — reiniciar o terminal e
rodar `npm run dev` novamente.

## Configuração do registry de agentes

A lista de agentes ACP é carregada (em ordem de precedência):

1. Variável de ambiente `ACP_AGENTS_JSON` (JSON inline)
2. Arquivo `.harn/config/acp-agents.json`
3. Fallback hardcoded: `claude-acp` → `claude-agent-acp`, `codex-acp` → `codex-acp`

### Exemplo de `.harn/config/acp-agents.json`

```json
{
  "claude-acp": {
    "command": "claude-agent-acp",
    "args": []
  },
  "codex-acp": {
    "command": "codex-acp",
    "args": ["--some-flag"]
  },
  "meu-agente-local": {
    "command": "/usr/local/bin/meu-acp",
    "args": ["--mode", "strict"],
    "env": { "MY_AGENT_KEY": "..." }
  }
}
```

Cada entrada segue a interface `AcpAgentSpec` (ver `src/server/agent/acp-runtime.ts`):

- `command` (obrigatório): nome do binário ou caminho absoluto.
- `args` (opcional): lista de argumentos passados ao spawn.
- `env` (opcional): variáveis extras mescladas ao ambiente do subprocesso.

### Exemplo via env var

```bash
ACP_AGENTS_JSON='{"claude-acp":{"command":"claude-agent-acp"}}' npm run dev
```

## Validar o status pela API

Com o backend rodando (`npm run dev`), consultar o endpoint:

```bash
curl http://localhost:3001/api/runtime/acp/status
```

Resposta esperada (exemplo):
```json
{ "claude-acp": true, "codex-acp": false }
```

- `true` → binário encontrado no PATH (ou caminho absoluto existe).
- `false` → binário não encontrado; o toggle da UI vai desabilitar a opção.

## Usando o RuntimeToggle na UI

1. Abrir http://localhost:5173 (via Vite dev server).
2. No header do chat, clicar no toggle à esquerda do seletor de modelo.
3. Escolher **ACP (subprocess)** (só habilitado se algum agente estiver disponível).
4. Selecionar o agente ACP no submenu.
5. Enviar uma mensagem — o backend vai spawn o subprocesso em um tmpdir
   isolado, abrir sessão ACP e transmitir `session/update` como SSE.

Mudar runtime ou agente limpa o chat atual (histórico não é compartilhado entre
runtimes).

## Gotchas conhecidos

- **Stall detection (60s)**: se o agente não emitir nenhum `session/update` por 60s
  após o `prompt`, o subprocesso é morto e a UI recebe erro "agent stalled".
- **Hard timeout (5min)**: qualquer prompt individual é limitado a 300s.
- **Kill cascade**: SIGTERM → 2s wait → SIGKILL → `rm -rf tmpdir`. Sempre executado
  em abort manual, stall e timeout.
- **Tmpdir vazio**: alguns agentes podem reclamar de tmpdir sem arquivos. Se
  necessário, futuro seed com `README.md` + `hello.js` é a solução documentada em
  DEFINE.
- **Web Streams**: o SDK `@agentclientprotocol/sdk` exige `ReadableStream`/
  `WritableStream` do Web — o backend já converte via `Readable.toWeb`/
  `Writable.toWeb` em `acp-runtime.ts`.
