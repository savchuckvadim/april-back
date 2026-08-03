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
}

/**
 * Частичное обновление настроек из админки. Отсутствие поля означает
 * «не трогать», явный `null` — «сбросить на глобальное значение».
 * Служебные поля (lastScanAt) снаружи не редактируются.
 */
export type PortalAiSettingsUpdate = Partial<
    Omit<PortalAiSettingsRecord, 'lastScanAt'>
>;

/** Пустой набор: ни одна настройка не задана — портал живёт на глобальных. */
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
};

/** Настройки портала вместе с его идентификацией — для обхода в кроне. */
export interface PortalAiSettingsWithDomain extends PortalAiSettingsRecord {
    portalId: number;
    domain: string;
}
