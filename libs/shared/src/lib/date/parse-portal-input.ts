import dayjs, { Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { Logger } from '@nestjs/common';
import { ETimeZone } from './timezone';

dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

const logger = new Logger('parsePortalInput');

/**
 * Форматы, в которых дата может прийти из hook'а Bitrix или с фронта.
 * Порядок важен: dayjs strict-парсит по первому подходящему формату.
 */
const ACCEPTED_FORMATS = [
    'DD.MM.YYYY HH:mm:ss',
    'DD.MM.YYYY HH:mm',
    'DD.MM.YYYY',
    'YYYY-MM-DD HH:mm:ss',
    'YYYY-MM-DDTHH:mm:ss',
    'YYYY-MM-DDTHH:mm:ssZ',
    'YYYY-MM-DDTHH:mm:ss.SSSZ',
    'YYYY-MM-DD',
];

/**
 * Парсит строку даты, пришедшую из hook/фронта, как локальное время в таймзоне портала.
 *
 * Зачем: legacy всегда трактовал входной `deadline` как локальное время клиентского
 * портала (Carbon::createFromFormat(..., $portalTz)), а уже потом конвертировал
 * в формат целевого поля Bitrix. Здесь та же семантика.
 *
 * @throws Error если строка не парсится ни одним из ACCEPTED_FORMATS.
 */
export function parsePortalInput(raw: string, portalTz: ETimeZone): Dayjs {
    const parsed = dayjs(raw, ACCEPTED_FORMATS, true);
    if (!parsed.isValid()) {
        throw new Error(
            `parsePortalInput: не удалось распарсить дату "${raw}". Ожидаемые форматы: ${ACCEPTED_FORMATS.join(', ')}`,
        );
    }
    const wallClock = parsed.format('YYYY-MM-DDTHH:mm:ss');
    const instant = dayjs.tz(wallClock, portalTz);
    logger.debug(
        `[DEADLINE][parse] raw="${raw}" → wallClock="${wallClock}" ` +
            `портал TZ=${portalTz} → instant(UTC)="${instant.toISOString()}"`,
    );
    return instant;
}
