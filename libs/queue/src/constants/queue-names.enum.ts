export enum QueueNames {
    ACTIVITY = 'activity',
    EVENT = 'event',
    DOCUMENT = 'document',
    TELEGRAM = 'telegram',
    MAIL = 'mail',
    SILENT = 'silent', // новая универсальная
    EVENT_SILENT = 'event-silent', // новая универсальная
    SALES_KPI_REPORT = 'sales-kpi-report',
    ORK_KPI_REPORT = 'ork-kpi-report',
    PING = 'ping',
    TRANSCRIBE_AUDIO = 'transcribe-audio',
    // добавишь по мере надобности

    //event sales
    EVENT_SALES_COLD_CALL = 'event-sales-cold-call',
    /** Отчёт менеджера из приложения «Звонки»: batch Битрикса уходит в воркер */
    EVENT_SALES_FLOW = 'event-sales-flow',
    /**
     * Операции sales-хуков (лид в работу, merge, передача, буфер отказников):
     * единая очередь исполнения для обоих путей — робот (после окна тишины
     * event-silent) и кнопка фрейма. Джобы различаются JobNames.SALES_HOOK_*.
     */
    EVENT_SALES_HOOK_OPS = 'event-sales-hook-ops',
    //event service
    SERVICE_DEALS_SCHEDULE = 'service-deals-schedule',
    SERVICE_DEALS = 'service-deals',
    SERVICE_DEALS_ORDER = 'service-deals-order',
    SERVICE_GENERATE_ACTS = 'service-generate-acts',
    SERVICE_CALL_EVENT = 'service-call-event',

    /** Offer Word: PDF в Redis, файлы на диске не храним */
    OFFER_WORD_EPHEMERAL_PDF = 'offer-word-ephemeral-pdf',
    ZAKUPKI_OFFER = 'zakupki-offer',
    KONSTRUCTOR = 'konstructor',
    CALL_ANALYSIS = 'call-analysis',

    /** AI-отчётность по звонкам: cron-сканер → транскрибация → анализ → смарт/БД (воркер в event-sales) */
    CALL_REPORT = 'call-report',

    /** Provisioning pbx-сущностей маркетплейс-продуктов (воркер в pbx-install) */
    MARKETPLACE_PROVISION = 'marketplace-provision',
}
