/**
 * Общие примитивы отправки в Telegram: троттлинг-окно и подготовка текста.
 *
 * Живут отдельно от сервисов, потому что отправителей ДВА
 * (TelegramService и TelegramOriginalService) и оба обязаны вести себя
 * одинаково — иначе защита канала обходится через второй сервис.
 */

/** Максимум сообщений в минуту — как у Telegram-транспорта логгера. */
export const TELEGRAM_MAX_MESSAGES_PER_MINUTE = 20;

/** Скользящее окно троттлинга, мс. */
export const TELEGRAM_THROTTLE_WINDOW_MS = 60_000;

/**
 * Обрезка текста сообщения. Лимит Telegram — 4096 символов; берём с запасом
 * под префиксы, которые сервисы дописывают («NEST Monorepo: » и т.п.).
 */
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4000;

/**
 * Скользящее окно «не больше N отправок в минуту» — тот же принцип, что у
 * `TelegramTransport` логгера, но на уровне СЕРВИСА: накрывает все входы
 * разом (публичная ручка, логгер-транспорт, внутренние вызовы), а не только
 * путь через Next-прокси.
 *
 * Зачем: ручка /telegram публичная, каждый вызов — исходящий HTTP-запрос.
 * Без потолка зацикленный клиент упирает бота в лимиты Telegram API (429),
 * и настоящие тревоги перестают доходить у ВСЕХ приложений — бот общий.
 */
export class TelegramSendWindow {
    private sentAt: number[] = [];

    constructor(
        private readonly maxPerMinute: number = TELEGRAM_MAX_MESSAGES_PER_MINUTE,
    ) {}

    /** true — отправка разрешена и учтена; false — лимит окна исчерпан. */
    tryConsume(now: number = Date.now()): boolean {
        this.sentAt = this.sentAt.filter(
            ts => now - ts < TELEGRAM_THROTTLE_WINDOW_MS,
        );
        if (this.sentAt.length >= this.maxPerMinute) {
            return false;
        }
        this.sentAt.push(now);
        return true;
    }
}

/**
 * Текст → безопасный для `parse_mode: 'Markdown'` (legacy v1) + обрезка.
 *
 * Экранируются ТОЛЬКО четыре символа, открывающие сущности Markdown v1
 * (`_`, `*`, `` ` ``, `[`) — ровно те, из-за которых Telegram отвечает
 * 400 «can't parse entities» и сообщение теряется. Остальные символы
 * трогать нельзя: v1 не понимает экранирование прочего, и `\.`/`\!`
 * приезжали в чат мусорными обратными слешами.
 *
 * Историческая реализация экранировала в ДВА прохода (сначала `_*[` +
 * бэктик, потом «всё подряд» включая свежедобавленные слеши) — стек-трейс
 * фронта превращался в частокол `\\\_`. Теперь проход один, двойного
 * экранирования нет.
 */
export function toTelegramMarkdownText(text: string): string {
    return text
        .replace(/[_*[`]/g, '\\$&')
        .slice(0, TELEGRAM_MAX_MESSAGE_LENGTH);
}
