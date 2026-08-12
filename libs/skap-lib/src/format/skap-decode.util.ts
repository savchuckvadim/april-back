import iconv from 'iconv-lite';
import { SkapFileKind } from './skap-format.types';

/** Декодирование выгрузок СКАП: UTF-8 BOM либо cp1251 (легаси АРМ). */
export function decodeSkapBuffer(buffer: Buffer): string {
    if (
        buffer.length >= 3 &&
        buffer[0] === 0xef &&
        buffer[1] === 0xbb &&
        buffer[2] === 0xbf
    ) {
        return buffer.subarray(3).toString('utf8');
    }
    return iconv.decode(buffer, 'win1251');
}

/** CSV-текст → строки ячеек (разделитель `;`, пустые строки отбрасываются). */
export function skapCsvToRows(text: string): string[][] {
    return text
        .split(/\r?\n/)
        .filter(line => line.trim().length > 0)
        .map(line => line.split(';').map(cell => cell.trim()));
}

/**
 * Вид файла по имени: `*Online.csv` / `*Online_detail.csv` /
 * `*Prime_lent.csv` (регистр не важен). null — не файл СКАП.
 */
export function detectSkapFileKind(fileName: string): SkapFileKind | null {
    const name = fileName.toLowerCase();
    if (name.includes('online_detail')) return 'online_detail';
    if (name.includes('prime_lent')) return 'prime_lent';
    if (name.includes('online')) return 'online';
    return null;
}

/** «02:34:11.408» / «5 days 03:22:11» (python timedelta) → миллисекунды. */
export function parseSkapTimedeltaToMs(timeStr: string): number {
    let days = 0;
    let rest = timeStr.trim();
    const daysMatch = rest.match(/^(\d+)\s+days?\s+/i);
    if (daysMatch) {
        days = parseInt(daysMatch[1], 10);
        rest = rest.slice(daysMatch[0].length);
    }
    const timeParts = rest.split(':');
    if (timeParts.length < 3) {
        return days * 24 * 60 * 60 * 1000;
    }
    const hours = parseInt(timeParts[0], 10) || 0;
    const minutes = parseInt(timeParts[1], 10) || 0;
    let seconds = 0;
    let ms = 0;
    const secPart = timeParts[2];
    if (secPart.includes('.')) {
        const [s, m] = secPart.split('.');
        seconds = parseInt(s, 10) || 0;
        ms = parseInt((m || '0').padEnd(3, '0').slice(0, 3), 10) || 0;
    } else {
        seconds = parseInt(secPart, 10) || 0;
    }
    return (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000 + ms;
}

/** «13.08.2024 12:43» / «27.11.2019» → Date (локальное время портала). */
export function parseSkapRuDateTime(value: string): Date | null {
    const match = value
        .trim()
        .match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
    if (!match) return null;
    const [, dd, mm, yyyy, hh, min] = match;
    const date = new Date(
        Number(yyyy),
        Number(mm) - 1,
        Number(dd),
        Number(hh ?? '0'),
        Number(min ?? '0'),
    );
    return Number.isNaN(date.getTime()) ? null : date;
}

/** Русские названия месяцев (папки вида «август 2024»). */
const RU_MONTHS: Record<string, number> = {
    январь: 0,
    февраль: 1,
    март: 2,
    апрель: 3,
    май: 4,
    июнь: 5,
    июль: 6,
    август: 7,
    сентябрь: 8,
    октябрь: 9,
    ноябрь: 10,
    декабрь: 11,
};

/**
 * Отчётный месяц из имени папки/файла: «август 2024», «2024-08»,
 * «2024.08». null — месяц не извлекается (error_no_period выше по стеку).
 * Дата выгрузки в имени файла (2024.09.03.Online.csv) месяцем НЕ считается.
 */
export function parseSkapPeriod(name: string): Date | null {
    const normalized = name.trim().toLowerCase();
    const ruMatch = normalized.match(/([а-яё]+)\s+(\d{4})/);
    if (ruMatch && RU_MONTHS[ruMatch[1]] !== undefined) {
        return new Date(Number(ruMatch[2]), RU_MONTHS[ruMatch[1]], 1);
    }
    // (?![-.]?\d) отсекает даты выгрузки «2024.09.03…», но пропускает
    // «2024-08.xlsx» (после месяца не цифра и не «.цифра»)
    const isoMatch = normalized.match(/(\d{4})[-.](\d{2})(?![-.]?\d)/);
    if (isoMatch) {
        const month = Number(isoMatch[2]);
        if (month >= 1 && month <= 12) {
            return new Date(Number(isoMatch[1]), month - 1, 1);
        }
    }
    return null;
}

/** Код периода YYYY-MM (для dedup-ключей и поля PERIOD_CODE). */
export function formatSkapPeriodCode(period: Date): string {
    const month = String(period.getMonth() + 1).padStart(2, '0');
    return `${period.getFullYear()}-${month}`;
}

/**
 * Fallback отчётного месяца из ДАТЫ ВЫГРУЗКИ в имени файла
 * («2024.09.03.Online.csv»): АРМ выгружает статистику в первые дни
 * СЛЕДУЮЩЕГО месяца → отчётный месяц = месяц выгрузки минус 1
 * (проверено на всех 12 месяцах примера, включая декабрь→январь).
 *
 * Нужен, когда пользователь загрузил файлы БЕЗ папок месяцев (веб-загрузка
 * Битрикса расплющивает структуру). Применяется только если месяц не
 * извлёкся из пути/имени явно — вызывающий код добавляет ворнинг.
 */
export function parseSkapPeriodFromUnloadDate(name: string): Date | null {
    const match = name.match(/(\d{4})\.(\d{2})\.(\d{2})/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    // месяц выгрузки минус 1 (Date сам переносит январь → декабрь-1 года)
    return new Date(year, month - 2, 1);
}
