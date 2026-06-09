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
}
