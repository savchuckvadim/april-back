export enum QueueNames {
    ACTIVITY = 'activity',
    EVENT = 'event',
    DOCUMENT = 'document',
    TELEGRAM = 'telegram',
    SILENT = 'silent', // новая универсальная
    SALES_KPI_REPORT = 'sales-kpi-report',
    ORK_KPI_REPORT = 'ork-kpi-report',
    PING = 'ping',
    TRANSCRIBE_AUDIO = 'transcribe-audio',
    // добавишь по мере надобности

    //event service
    SERVICE_DEALS_SCHEDULE = 'service-deals-schedule',
    SERVICE_DEALS = 'service-deals',

    /** Offer Word: PDF в Redis, файлы на диске не храним */
    OFFER_WORD_EPHEMERAL_PDF = 'offer-word-ephemeral-pdf',
    ZAKUPKI_OFFER = 'zakupki-offer',
    KONSTRUCTOR = 'konstructor',
}
