export enum JobNames {
    //event sales
    EVENT_COLD_CALL = 'cold-call',
    EVENT_SALES_FLOW = 'event-sales-flow',

    //mail
    MAIL_SEND_AUTH = 'mail-send-auth',

    //konstructor sales
    DOCUMENT_SUPPLY_REPORT = 'generate-supply-report',
    ZAKUPKI_OFFER_GENERATE = 'zakupki-offer-generate',
    OFFER_GENERATE = 'offer-generate',

    //sales report
    SALES_KPI_REPORT_GENERATE = 'sales-kpi-report-generate',
    SALES_USER_REPORT_GENERATE = 'sales-user-report-generate',
    //счётная статистика звонков (6 бакетов × N сотрудников, result_total)
    SALES_CALLING_STATISTIC = 'sales-calling-statistic',

    //эфирное время (kpi-airtime): сбор месячной партиции по всему порталу
    //и дособор дневного диапазона текущего/краевого месяца
    AIRTIME_MONTH_PARTITION = 'airtime-month-partition',
    AIRTIME_DAY_SPAN = 'airtime-day-span',

    //sales finance (финансовая аналитика отдела продаж)
    SALES_FINANCE_CLOSED_SALES = 'sales-finance-closed-sales',
    SALES_FINANCE_HOT_CLIENTS = 'sales-finance-hot-clients',

    //публичные ссылки на KPI-отчёт: фоновая регенерация снимка
    SHARE_LINK_REFRESH = 'share-link-refresh',

    //ork report
    ORK_USER_REPORT_GENERATE = 'ork-user-report-generate',
    PING = 'ping',
    // и т.д.

    //event service
    SERVICE_DEAL_MOVE_STAGES = 'service-deal-move-stages',
    SERVICE_DEAL_INIT = 'service-deal-init',
    SERVICE_DEALS_ORDER = 'service-deals-order',
    SERVICE_GENERATE_ACTS = 'service-generate-acts',
    SERVICE_CALL_EVENT = 'service-call-event',

    OFFER_WORD_EPHEMERAL_PDF_GENERATE = 'offer-word-ephemeral-pdf-generate',

    //marketplace
    MARKETPLACE_PROVISION_PRODUCT = 'marketplace-provision-product',

    //call report (AI-отчётность по звонкам): две стадии конвейера —
    //транскрибация и анализ идут отдельными джобами, чтобы транскрибация
    //звонка N+1 шла параллельно с анализом звонка N
    CALL_REPORT_TRANSCRIBE = 'call-report-transcribe',
    CALL_REPORT_ANALYZE = 'call-report-analyze',
}
