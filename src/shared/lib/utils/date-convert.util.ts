/**
 * Конвертирует дату в строку в формате «01 августа 2025» по календарю Europe/Moscow; при неразборчивой строке — как есть.
 * @param raw - Дата в формате ISO 8601.
 * @returns Дата в формате «01 августа 2025» по календарю Europe/Moscow.
 */
export enum ETimeZone {
    EUROPE_MOSCOW = 'Europe/Moscow',
    ASIA_IRKUTSK = 'Asia/Irkutsk',
    ASIA_NOVOSIBIRSK = 'Asia/Novosibirsk',
    ASIA_YEKATERINBURG = 'Asia/Yekaterinburg',
    ASIA_KALININGRAD = 'Asia/Kaliningrad',
    ASIA_MAGADAN = 'Asia/Magadan',
    ASIA_SAKHALIN = 'Asia/Sakhalin',
    ASIA_SREDNEKOLYMSK = 'Asia/Srednekolymsk',
    ASIA_TAJIKISTAN = 'Asia/Tajikistan',
    ASIA_TASHKENT = 'Asia/Tashkent',
}
export function formatRuCalendarDateTimeZone(
    raw: string,
    timeZone: ETimeZone = ETimeZone.EUROPE_MOSCOW,
): string {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
        return raw;
    }
    const s = new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: timeZone,
    }).format(d);
    return s.replace(/\s*г\.?\s*$/u, '').trim();
}
