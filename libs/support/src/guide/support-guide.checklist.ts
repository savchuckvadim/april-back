import { SupportMonitorOptions } from '../monitor/application/support-monitor-options';
import {
    SupportGuideCheck,
    SupportGuideCheckStatus,
    SupportGuideLink,
} from './support-guide.types';

export interface SupportChecklistContext {
    lineDomain: string;
    portalId: number | null;
    /** Настройки приложений портала линии в админке; null — портала нет в БД. */
    settingsLink: SupportGuideLink | null;
    kbRootUrl: string | null;
    /**
     * Почему серверному ИИ-помощнику не на чём работать (ни один провайдер
     * шлюза LLM не настроен для портала линии); null — провайдер есть.
     */
    llmIssue: string | null;
}

const done = (ok: boolean): SupportGuideCheckStatus => (ok ? 'done' : 'todo');

/**
 * «Что осталось, чтобы заработало»: то, что видно по настройкам портала
 * линии, — с живым статусом; то, что живёт в env приложения bot или на
 * порталах, — `manual` с подсказкой, как проверить.
 */
export function buildSupportChecklist(
    options: SupportMonitorOptions,
    context: SupportChecklistContext,
): SupportGuideCheck[] {
    const settings = context.settingsLink;
    return [
        {
            key: 'portal_known',
            title: `Портал линии ${context.lineDomain} есть в базе April`,
            status: done(context.portalId !== null),
            hint: 'Без него настройки монитора не сохранить. Добавить портал — раздел «Portal».',
            link: null,
        },
        {
            key: 'code_deployed',
            title: 'Код выложен на серверы: приложения bot и admin',
            status: 'manual',
            hint:
                'Эта страница открылась — admin выложен. bot при старте пишет разработчику в Telegram ' +
                '«Мониторинг поддержки включён: …», если монитор включён хотя бы на одном портале.',
            link: null,
        },
        {
            key: 'line_id',
            title: 'Указан номер линии',
            status: done(options.lineId > 0),
            hint:
                '«Поддержка Апрель» на april-dev — линия 9. 0 — все линии портала, ' +
                'включая тестовую линию 1.',
            link: settings,
        },
        {
            key: 'bell_recipients',
            title: 'Указаны получатели колокольчика',
            status: done(options.notifyUserIds.length > 0),
            hint:
                `Портал колокольчика сейчас: ${options.notifyDomain}. На april-garant Вадим Савчук — ID 1. ` +
                'Юлия Муравьева на april-garant — ID 77. Чтобы напоминание «клиент ждёт» шло только ' +
                'взявшему диалог оператору, заполните «оператор линии → сотрудник колокольчика» ' +
                '(на april-dev Юлия — 135, Вадим — 1): «135:77, 1:1».',
            link: settings,
        },
        {
            key: 'telegram_chat',
            title: 'Telegram-бот и чат поддержки заданы в env bot',
            status: 'manual',
            hint:
                '`SUPPORT_TELEGRAM_BOT_TOKEN` и `SUPPORT_TELEGRAM_CHAT_ID` в env приложения bot. ' +
                'Проверка: сообщение bot при старте — «Telegram-чат поддержки» или «Telegram не настроен на сервере».',
            link: null,
        },
        {
            key: 'monitor_enabled',
            title: 'Мониторинг включён',
            status: done(options.enabled),
            hint: 'Настройка «Поддержка: следить за диалогами линии».',
            link: settings,
        },
        {
            key: 'live_mode',
            title: 'Режим «только считать» выключен — оповещения уходят людям',
            status: done(options.enabled && !options.dryRun),
            hint:
                'Сначала включить с «только считать» и посмотреть журнал bot и кнопку «Проверить линию сейчас», ' +
                'потом выключить «только считать».',
            link: settings,
        },
        {
            key: 'knowledge_base',
            title: 'База знаний поддержки выложена на april-dev',
            status: done(context.kbRootUrl !== null),
            hint: 'Правила ответа, шаблоны, частые проблемы, правила для ИИ.',
            link: context.kbRootUrl
                ? { title: 'База знаний на april-dev', href: context.kbRootUrl }
                : null,
        },
        {
            key: 'support_api_key',
            title: 'Ключ Support API — только для ИИ из терминала',
            status: 'manual',
            hint:
                '`SUPPORT_API_KEYS=vadim:<строка>` в env bot и та же строка в `APRIL_SUPPORT_KEY` у себя. ' +
                'Мониторингу не нужен.',
            link: null,
        },
        {
            key: 'assistant_llm',
            title: 'Серверный ИИ-помощник: модель настроена для портала линии',
            status: done(context.llmIssue === null),
            hint:
                context.llmIssue ??
                'Шлюз LLM готов: разбор диалогов работает в Telegram-боте и через `POST /api/support/dialogs/:chatId/analyze`.',
            link: context.portalId
                ? {
                      title: 'Ключи портала линии (VibeCode)',
                      href: `/portal/${context.portalId}/keys`,
                  }
                : null,
        },
        {
            key: 'telegram_webhook',
            title: 'Telegram-бот принимает команды (вебхук)',
            status: 'manual',
            hint:
                '`SUPPORT_TELEGRAM_WEBHOOK_URL` и `SUPPORT_TELEGRAM_WEBHOOK_SECRET` в env bot; при старте bot пишет ' +
                '«вебхук установлен». Проверка: написать боту «помощь». В группе бот видит только команды вида ' +
                '`/analyze 769`, пока в BotFather не выключен режим приватности (`/setprivacy` → Disable).',
            link: null,
        },
        {
            key: 'reply_tested',
            title: 'Ответ клиенту проверен вживую (Claude Code или кнопка в Telegram)',
            status: 'manual',
            hint: 'Первую отправку — в тестовом диалоге №71 (клиент — сам Вадим с портала alfacentr).',
            link: null,
        },
    ];
}
