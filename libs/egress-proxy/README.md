# @lib/egress-proxy — исходящий прокси за рубеж

Зачем: часть внешних API (OpenAI, Groq, Anthropic, Telegram…) не отвечает
серверам из РФ. Библиотека переписывает такие вызовы на наш обратный прокси
на европейском сервере (nginx за Traefik, см.
`ai/tasks/2026-10-29-ai-providers-per-portal-byok-plan.md`, раздел «Прокси»):

```
https://api.openai.com/v1/chat/completions
→ https://<EGRESS_PROXY_URL>/api.openai.com/v1/chat/completions
  + заголовок X-Egress-Token: <EGRESS_PROXY_TOKEN>
```

Хосты вне списка (Битрикс, Яндекс, VibeCode, Cloud.ru) идут напрямую.

## Env

| Переменная | Что |
|---|---|
| `EGRESS_PROXY_URL` | адрес прокси с префиксом пути, например `https://eu-proxy.example.com/p` |
| `EGRESS_PROXY_TOKEN` | токен из `/opt/ai-egress-proxy/.env` на сервере прокси |
| `EGRESS_PROXY_HOSTS` | хосты через запятую: `api.telegram.org,api.openai.com,api.groq.com`; `.googleapis.com` — вместе с поддоменами |

Нет адреса или списка — прокси выключен, поведение прежнее. Список на
сервере прокси (`allowed-hosts.conf`) должен содержать те же хосты.

## Как пользоваться

```ts
constructor(private readonly egress: EgressProxyService) {}

// fetch
const response = await this.egress.fetch(url, { method: 'POST', headers, body });

// axios
const route = this.egress.route(url);
await firstValueFrom(this.http.post(route.url, payload, { headers: { ...route.headers } }));
```

Потребители: адаптер `openai-compatible` шлюза LLM, Whisper-совместимая
транскрибация, Telegram (тревоги и бот поддержки). Чек-лист готовности
провайдеров в админке показывает, какие endpoint'ы пойдут через прокси.
