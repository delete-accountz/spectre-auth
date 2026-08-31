# Client Dashboard API (Rotas `/v1/client`)

Esta documentação cobre as rotas necessárias para uma dashboard de usuário final com gestão de conta, licenças, produtos, suporte e billing.

## Autenticação obrigatória (todas as rotas client)

Enviar headers:

- `x-discord-id`: Discord do usuário (17-19 dígitos)
- `x-license-key`: key ativa do usuário
- `x-product-hash`: hash SHA-256 (hex) do produto da key

Middlewares aplicados:

- `clientLimiter` em `/v1/client/*`
- `requireClientAccess` (valida headers)
- `requireActiveClient` (bloqueia key expirada/banida/pausada/dono incorreto)
- `ensureClientHasProduct` (somente onde necessário)

## Padrão de resposta

### Sucesso

```json
{
  "success": true,
  "message": "OK",
  "data": {},
  "requestId": "...",
  "timestamp": "..."
}
```

### Erro

```json
{
  "success": false,
  "message": "...",
  "error": { "code": "BAD_REQUEST" },
  "requestId": "...",
  "timestamp": "..."
}
```

---

## 1) Conta e perfil

### GET `/v1/client/me`
Resumo rápido para home da dashboard:
- usuário + badges
- licença atual (`currentLicense`)
- resumo de licenças (ativas/expiradas/inativas)
- conta portal vinculada (se existir)

### GET `/v1/client/account`
Informações completas da conta final:
- perfil Discord
- perfil custom
- conta portal (email/status)
- estatísticas de chaves
- key atual

### PUT `/v1/client/profile`
Atualiza perfil custom do usuário.

Body:
```json
{
  "displayName": "string|null",
  "avatarUrl": "https://...",
  "bannerUrl": "https://..."
}
```

### POST `/v1/client/sync-discord`
Sincroniza username/avatar/tag via API do Discord.

---

## 2) Licenças e produtos

### GET `/v1/client/licenses?status=all|active|expired|inactive`
Lista todas as keys do usuário (`usedBy = discordId`) e separa por status:
- `active`
- `expired`
- `inactive` (pausada/banida/pending)

Retorna:
- `totals`
- `activeProducts`
- `groups` (separado)
- `items` (filtrado por `status`)

### GET `/v1/client/products/active`
Lista produtos ativos e as keys ativas por produto.

### POST `/v1/client/license/reset-hwid`
Reseta HWID da própria key (somente se pertence ao usuário autenticado).

Body opcional:
```json
{ "licenseKey": "AAAA-BBBB-CCCC" }
```

Sem body, usa a key dos headers.

---

## 3) Renovação, compras e histórico

### POST `/v1/client/billing/checkout`
Cria checkout Efí para renovação da licença.

Body:
```json
{
  "licenseKey": "AAAA-BBBB-CCCC",
  "days": 30
}
```

Regras:
- licença deve pertencer ao usuário (`usedBy`)
- precisa existir conta portal vinculada ao Discord
- cria `Order` com status `PENDING`
- retorna `paymentUrl`

> Ao pagamento ser confirmado no webhook `/v1/webhooks/efi`, os dias são adicionados automaticamente na licença existente.

### GET `/v1/client/billing/history?limit=50`
Histórico de compras/renovações do usuário (por keys dele):
- status do pedido
- valor
- produto
- licença mascarada
- `renewal.days`

### GET `/v1/client/billing/orders/:id`
Detalhe de um pedido específico, com validação de ownership da licença.

---

## 4) Suporte (tickets)

### POST `/v1/client/tickets`
Abre ticket (`HWID_RESET` ou `SUPPORT`).

Body:
```json
{
  "type": "HWID_RESET|SUPPORT",
  "message": "texto"
}
```

### GET `/v1/client/tickets?status=open|in_progress|closed`
Lista tickets do usuário.

### GET `/v1/client/tickets/:id`
Detalhe de ticket (somente do próprio usuário).

### POST `/v1/client/tickets/:id/message`
Envia mensagem em ticket aberto.

---

## 5) Configs de usuário (cloud)

### POST `/v1/client/configs`
Cria metadado de config (produto atual do usuário).

### GET `/v1/client/configs`
Lista configs públicas do produto atual.

### GET `/v1/client/configs/:id/download`
Resolve URL de download (valida produto).

### DELETE `/v1/client/configs/:id`
Remove config própria (`ownerDiscordId == discordId`).

---

## Mapeamento dos requisitos solicitados

- Resetar o próprio HWID: `POST /v1/client/license/reset-hwid`
- Renovar licença atual e somar dias: `POST /v1/client/billing/checkout` + webhook Efí
- Abrir ticket de suporte: `POST /v1/client/tickets`
- Visualizar todas as keys e separação por status: `GET /v1/client/licenses`
- Visualizar produtos ativos: `GET /v1/client/products/active`
- Verificar tempo restante: `currentLicense.timeRemaining` e itens em `/licenses`
- Histórico de renovações/compras: `GET /v1/client/billing/history`
- Informações da conta: `GET /v1/client/account` e `GET /v1/client/me`

---

## Notas de segurança

- Todas as consultas sensíveis filtram por ownership (Discord/License).
- Nenhuma rota client expõe dados de outro usuário.
- Respostas seguem contrato estruturado para frontend.
- Dados sensíveis são mascarados conforme modo de censura (`x-censor`).

## Política de reset HWID do cliente

Rota: `POST /v1/client/license/reset-hwid`

Regra aplicada:

- 1º reset HWID do cliente: gratuito
- A partir do 2º reset: cobrança de R$ 5,00 por reset

Comportamento da resposta:

- Se gratuito: retorna `mode: "free"` e já reseta o HWID
- Se pago: retorna `mode: "paid"`, `orderId`, `paymentUrl`, `amountCents: 500`

Após pagamento confirmado no webhook Efí:

- o pedido é marcado como `PAID`
- o HWID da licença é resetado automaticamente (idempotente)
