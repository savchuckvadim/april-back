/** Опции прогона реанимации (из настроек портала, camelCase-ключи схемы). */
export interface RejectReviveOptions {
    /** Сколько дней сделка лежит в отказе до реанимации (от CLOSEDATE). */
    intervalDays: number;
    /** Кому ставить звонок: тому же ответственному или случайному в отделе. */
    assignMode: 'same' | 'random';
    /** Лимит сделок за прогон (досылка «недоехавших» входит в лимит). */
    maxPerRun: number;
    /** post_fail_date перебивает интервал (withPostFail-порталы). */
    usePostFailDate: boolean;
    /** Через сколько минут queued без sent считается «недоехавшей». */
    resendAfterMinutes: number;
}

/** Телеметрия прогона по домену. */
export interface RejectReviveRunResult {
    /** Досланные «недоехавшие» (queued был, sent не был). */
    resent: number;
    /** Новые кандидаты, взятые в очередь (queued поставлен). */
    queued: number;
    /** Успешно отправленные в cold-call хук (sent поставлен). */
    revived: number;
    warnings: string[];
}
