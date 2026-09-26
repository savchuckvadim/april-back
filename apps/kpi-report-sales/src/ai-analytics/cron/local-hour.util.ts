/**
 * Локальное время портала для кронов (план Фазы 3, П10 «p3-tz-crons»).
 * С 25.09.2026 реализация живёт в библиотеке (`model/local-clock.ts`):
 * тем же кодом крон ретенции админ-модуля считает локальный час. Здесь —
 * реэкспорт под прежним путём, чтобы планировщики витрины не менялись.
 */
export {
    dueLocalClock,
    isLocalHour,
    localClock,
    portalHour,
    resolveTimeZone,
    type AiLocalClock,
} from '@lib/sales-ai-analytics';
