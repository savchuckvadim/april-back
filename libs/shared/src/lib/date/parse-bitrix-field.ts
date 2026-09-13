import dayjs, { Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { Logger } from '@nestjs/common';
import { ETimeZone } from './timezone';

dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

const logger = new Logger('parseBitrixField');

/**
 * Форматы, в которых Bitrix отдаёт значение БЕЗ таймзоны — их разбираем как
 * локальное время портала. `DD.MM.YYYY*` — CRM datetime/date-поля в локали
 * портала, `YYYY-MM-DD*` — вид, в котором возвращаются некоторые системные
 * поля. Смещения тут нет ни у одного: строки со смещением обрабатывает
 * вторая ветка {@link parseBitrixField}.
 */
const NAIVE_FORMATS = [
    'DD.MM.YYYY HH:mm:ss',
    'DD.MM.YYYY HH:mm',
    'DD.MM.YYYY',
    'YYYY-MM-DD HH:mm:ss',
    'YYYY-MM-DDTHH:mm:ss',
    'YYYY-MM-DD',
];

/**
 * Значение datetime/date-поля Bitrix → абсолютный момент.
 *
 * ЧЕМ ОТЛИЧАЕТСЯ ОТ `parsePortalInput`. Тот разбирает СЫРОЙ ВВОД хука/фронта
 * — строку без таймзоны, которую по договорённости трактуем как локальное
 * время портала. Здесь вход другой: значение, которое Bitrix ВЕРНУЛ из
 * карточки, и приходит оно в двух несовместимых видах:
 *
 *  - `13.09.2026 16:16:12` — локаль портала, смещения в строке нет;
 *  - `2026-09-13T16:16:12+03:00` — ISO СО СМЕЩЕНИЕМ, момент уже абсолютный.
 *
 * Прогонять второй через `parsePortalInput` нельзя вдвойне: strict-парсер
 * dayjs на таком формате возвращает INVALID (токен `Z` в strict-режиме не
 * срабатывает), то есть `fromPortalInput` не «слегка ошибётся», а БРОСИТ.
 *
 * Разбор строк без смещения идёт через strict-парсинг + повторный штамп
 * wall-clock в TZ портала, а НЕ через `dayjs.tz(raw, NAIVE_FORMATS, tz)`:
 * `dayjs.tz` со СПИСКОМ форматов теряет целевую таймзону и отдаёт момент,
 * сдвинутый на смещение СЕРВЕРА (на сервере в Europe/Berlin
 * `13.09.2026 16:16:12` при портале в Москве разбирался в 11:16 UTC вместо
 * 13:16 UTC). С одиночным форматом баг не воспроизводится, но список нам
 * нужен — поэтому путь через wall-clock.
 *
 * @returns null, если значение пустое или не разобралось ни одним способом
 *   (поле не заполнено / робот записал мусор). Читатели полей обязаны
 *   переживать это молча, поэтому НЕ бросаем — в отличие от `parsePortalInput`.
 */
export function parseBitrixField(
    raw: unknown,
    portalTz: ETimeZone,
): Dayjs | null {
    if (typeof raw !== 'string' && typeof raw !== 'number') return null;
    const value = String(raw).trim();
    if (!value) return null;

    const naive = dayjs(value, NAIVE_FORMATS, true);
    if (naive.isValid()) {
        const wallClock = naive.format('YYYY-MM-DDTHH:mm:ss');
        const instant = dayjs.tz(wallClock, portalTz);
        logger.debug(
            `[DEADLINE][field] raw="${value}" → без смещения, wallClock="${wallClock}" ` +
                `в TZ портала ${portalTz} → instant(UTC)="${instant.toISOString()}"`,
        );
        return instant;
    }

    // ISO со смещением (`...+03:00`, `...Z`) — момент абсолютный, TZ портала
    // к нему НЕ применяем, иначе сдвинем на разницу TZ сервера и портала.
    const iso = dayjs(value);
    if (iso.isValid()) {
        logger.debug(
            `[DEADLINE][field] raw="${value}" → ISO со смещением ` +
                `→ instant(UTC)="${iso.toISOString()}"`,
        );
        return iso;
    }

    logger.warn(
        `[DEADLINE][field] значение "${value}" не распознано ни как ` +
            `локальное время портала (${NAIVE_FORMATS.join(' / ')}), ни как ISO`,
    );
    return null;
}
