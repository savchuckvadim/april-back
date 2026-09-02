export enum JobNames {
    //event sales
    EVENT_COLD_CALL = 'cold-call',
    /**
     * Холодный старт v2 (cold-hook-v2, 02.09.2026): своё имя джоба, иначе
     * оба модуля подписались бы на одно silence-событие и обработали бы
     * каждое окно тишины дважды.
     */
    EVENT_COLD_CALL_V2 = 'cold-call-v2',
    EVENT_SALES_FLOW = 'event-sales-flow',
    /** Сайд-flow ЗПР: создание/закрытие элементов смарта «Звонки По решению». */
    EVENT_SALES_ZPR_FLOW = 'event-sales-zpr-flow',
    /** Сайд-flow презентаций: создание/закрытие элементов смарта «Презентации». */
    EVENT_SALES_PRESENTATION_FLOW = 'event-sales-presentation-flow',

    //sales-хуки: одно и то же имя служит и именем silence-события
    //(silence:<job> в event-silent), и именем джобы в EVENT_SALES_HOOK_OPS
    SALES_HOOK_LEAD_TO_WORK = 'sales-hook-lead-to-work',
    SALES_HOOK_MERGE_DUPLICATES = 'sales-hook-merge-duplicates',
    SALES_HOOK_TRANSFER_WORK = 'sales-hook-transfer-work',
    SALES_HOOK_REJECT_BUFFER = 'sales-hook-reject-buffer',
    //нормализатор ручной конвертации: onCrmDealAdd → self-healing графа связей
    SALES_HOOK_CONVERT_NORMALIZER = 'sales-hook-convert-normalizer',
    //глубокая проверка дублей из сущности + красивый итог в её timeline
    SALES_HOOK_DUPLICATE_CHECK = 'sales-hook-duplicate-check',
    //принятие заявки менеджером (вебхук робота — через silence от бурстов)
    SALES_HOOK_LEAD_ACCEPT = 'sales-hook-lead-accept',

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
    /** Первичное обучение + Поставка менеджеру ОРК (воркер в event-service) */
    SERVICE_ORK_SUPPLY_TASKS = 'service-ork-supply-tasks',

    OFFER_WORD_EPHEMERAL_PDF_GENERATE = 'offer-word-ephemeral-pdf-generate',

    //marketplace
    MARKETPLACE_PROVISION_PRODUCT = 'marketplace-provision-product',

    //call report (AI-отчётность по звонкам): две стадии конвейера —
    //транскрибация и анализ идут отдельными джобами, чтобы транскрибация
    //звонка N+1 шла параллельно с анализом звонка N
    CALL_REPORT_TRANSCRIBE = 'call-report-transcribe',
    CALL_REPORT_ANALYZE = 'call-report-analyze',

    /** Импорт СКАП: один run-джоб на домен (скан Диска + обработка файлов с тайм-бюджетом) */
    SKAP_IMPORT_RUN = 'skap-import-run',
}
