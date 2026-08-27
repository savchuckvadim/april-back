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
     * Сайд-flow ЗПР-смарта: основной event-report отвечает «предварительно
     * готово», а элемент «Звонки По решению» доезжает отдельной очередью —
     * дополнительные flow не удлиняют основной (решение владельца, 2508).
     */
    EVENT_SALES_ZPR_FLOW = 'event-sales-zpr-flow',
    /**
     * Сайд-flow смарта «Презентации»: зеркало сделок «ОП Презентации».
     * Та же схема, что у ЗПР — основной event-report только ставит джоб,
     * элемент смарта доезжает отдельной очередью и не удлиняет отчёт.
     */
    EVENT_SALES_PRESENTATION_FLOW = 'event-sales-presentation-flow',
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
    /**
     * Задачи ОРК по поставке: konstructor доводит поставку до сервисной
     * сделки и ставит джобу, воркер — в event-service. Отдельная очередь,
     * а не SERVICE_DEALS: у той потребитель в konstructor, и джобы делились
     * бы между двумя воркерами.
     */
    SERVICE_ORK_TASKS = 'service-ork-tasks',

    /** Offer Word: PDF в Redis, файлы на диске не храним */
    OFFER_WORD_EPHEMERAL_PDF = 'offer-word-ephemeral-pdf',
    ZAKUPKI_OFFER = 'zakupki-offer',
    KONSTRUCTOR = 'konstructor',
    CALL_ANALYSIS = 'call-analysis',

    /** AI-отчётность по звонкам: cron-сканер → транскрибация → анализ → смарт/БД (воркер в event-sales) */
    CALL_REPORT = 'call-report',

    /** Provisioning pbx-сущностей маркетплейс-продуктов (воркер в pbx-install) */
    MARKETPLACE_PROVISION = 'marketplace-provision',

    /** Импорт статистики СКАП с Диска в смарт (воркер в event-service) */
    SKAP_IMPORT = 'skap-import',
}
