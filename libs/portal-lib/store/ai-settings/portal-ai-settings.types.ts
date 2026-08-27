/**
 * Настройки AI-отчётности по звонкам на портал.
 *
 * КЛЮЧЕВОЙ ИНВАРИАНТ: `null` в любом поле означает «на портале не задано»,
 * и значение берётся из глобальных env приложения (CALL_REPORT_*). Поэтому
 * тип насквозь nullable, а смысловых дефолтов здесь нет — они живут в
 * резолвере, который склеивает БД, env и дефолты кода.
 *
 * Имена полей совпадают с полями Prisma-модели `PortalAiSettings`
 * (в БД — snake_case через @map).
 */
export interface PortalAiSettingsRecord {
    /** Обрабатывать ли звонки этого портала вообще (главный выключатель). */
    enabled: boolean | null;
    /** Глубокий разбор: 7 разделов, спич, оценки. */
    deepAnalysisEnabled: boolean | null;
    /** Создавать элемент смарт-процесса «AI-анализ звонков». */
    createSmartEnabled: boolean | null;
    /** Дешёвая классификация типа звонка. */
    classifyEnabled: boolean | null;
    /** Анализировать только менеджеров отдела продаж. */
    salesOnly: boolean | null;

    /** Минимальная длительность звонка для анализа, сек. */
    minDurationSec: number | null;
    /** Окно поиска звонков назад, часов. */
    windowHours: number | null;
    /** Максимум звонков в очередь за один скан. */
    maxPerRun: number | null;
    /** Порог реанимации зависших обработок, минут. */
    staleMinutes: number | null;

    /** Модель первичного анализа (резюме и рекомендации). */
    llmModel: string | null;
    /** Модель глубокого разбора звонка. */
    deepAnalysisModel: string | null;

    /**
     * Интервал сканирования портала в дневные часы, минут. Крон тикает с
     * фиксированной частотой, а портал пропускается, пока с lastScanAt не
     * прошло этого интервала — чаще самого тика всё равно не выйдет.
     */
    scanIntervalMinutes: number | null;
    /** Интервал в ночные часы (основная работа дешевле ночью). */
    nightScanIntervalMinutes: number | null;
    /** Начало ночного окна, час 0-23 по московскому времени. */
    nightStartHour: number | null;
    /** Конец ночного окна, час 0-23. Окно может пересекать полночь. */
    nightEndHour: number | null;
    /** Когда портал сканировали в последний раз (пишет планировщик). */
    lastScanAt: Date | null;

    /** ДЕМО-режим: bitrix-id сотрудников, чьи звонки анализируем. */
    allowedUserIds: number[] | null;

    // --- Параметры из JSON-колонки `settings` (добавляются без миграции) ---

    /**
     * Порог уверенности гейта нерелевантности (0..1): классификатор счёл
     * разговор посторонним с confidence >= порога → анализ останавливается
     * после дешёвой классификации. NULL — дефолт кода (0.7).
     */
    irrelevantConfidence: number | null;
    /**
     * Ночной РЕВИЗОР (свод по сделкам/лидам за день). NULL — выключен:
     * ревизия удваивает LLM-расход и включается сознательно.
     */
    revisorEnabled: boolean | null;
    /**
     * Утренняя СВЕРКА ПО ПРЕЗЕНТАЦИЯМ: отчёт менеджера («ОП Хвост»,
     * «ОП Пять К», комментарии) против AI-разбора звонка. NULL — выключена.
     */
    presentationAuditEnabled: boolean | null;
    /**
     * Строгость определения ПРЕЗЕНТАЦИИ (тип звонка и всё вытекающее:
     * presentationDone, хвост/5К, сверка): strict — только показ или
     * предметный рассказ под задачи клиента; normal — плюс содержательный
     * рассказ о продукте без привязки каждого инструмента к задачам;
     * soft — любое содержательное обсуждение продукта. NULL — strict.
     */
    presentationStrictness: PresentationStrictnessLevel | null;
    /**
     * Недельный EXCEL-отчёт по звонкам (пятница вечером): всё, что не
     * помещается в карточку смарта — полные разборы, транскрипты, сверка
     * с отчётами менеджеров. NULL — выключен.
     */
    weeklyReportEnabled: boolean | null;
    /**
     * Получатели недельного отчёта: bitrix-id сотрудников (в админке
     * вводятся через запятую). Пусто — отчёт собирается, но не рассылается
     * (лежит на Диске портала).
     */
    weeklyReportRecipients: number[] | null;
    /**
     * ID папки на Диске портала, куда класть файл (папка группы «Продажи»
     * и т.п.). NULL — папка приложения на Диске.
     */
    weeklyReportFolderId: number | null;
    /**
     * Как получателю приходит файл: chat — сообщением в личный чат с
     * вложенным xlsx (по умолчанию); task — задачей с прикреплённым
     * файлом; notify — уведомлением со ссылкой на Диск.
     */
    weeklyReportDelivery: WeeklyReportDeliveryMode | null;
}

/** Способы доставки недельного отчёта (runtime-константа для DTO). */
export const WEEKLY_REPORT_DELIVERY_MODES = ['chat', 'task', 'notify'] as const;
export type WeeklyReportDeliveryMode =
    (typeof WEEKLY_REPORT_DELIVERY_MODES)[number];

/** Уровни строгости определения презентации (runtime-константа для DTO). */
export const PRESENTATION_STRICTNESS_LEVELS = [
    'strict',
    'normal',
    'soft',
] as const;
export type PresentationStrictnessLevel =
    (typeof PRESENTATION_STRICTNESS_LEVELS)[number];

/**
 * Частичное обновление настроек из админки. Отсутствие поля означает
 * «не трогать», явный `null` — «сбросить на глобальное значение».
 * Служебные поля (lastScanAt) снаружи не редактируются.
 */
export type PortalAiSettingsUpdate = Partial<
    Omit<PortalAiSettingsRecord, 'lastScanAt'>
>;

/** Пустой набор: ни одна настройка не задана — действуют дефолты кода. */
export const EMPTY_PORTAL_AI_SETTINGS: PortalAiSettingsRecord = {
    enabled: null,
    deepAnalysisEnabled: null,
    createSmartEnabled: null,
    classifyEnabled: null,
    salesOnly: null,
    minDurationSec: null,
    windowHours: null,
    maxPerRun: null,
    staleMinutes: null,
    llmModel: null,
    deepAnalysisModel: null,
    scanIntervalMinutes: null,
    nightScanIntervalMinutes: null,
    nightStartHour: null,
    nightEndHour: null,
    lastScanAt: null,
    allowedUserIds: null,
    irrelevantConfidence: null,
    revisorEnabled: null,
    presentationAuditEnabled: null,
    presentationStrictness: null,
    weeklyReportEnabled: null,
    weeklyReportRecipients: null,
    weeklyReportFolderId: null,
    weeklyReportDelivery: null,
};

/** Настройки портала вместе с его идентификацией — для обхода в кроне. */
export interface PortalAiSettingsWithDomain extends PortalAiSettingsRecord {
    portalId: number;
    domain: string;
}
