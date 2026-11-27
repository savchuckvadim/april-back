import { basename, extname } from 'path';
import { InvoiceSetKind } from '../types/invoice-set.types';

/**
 * Имена документов КП и счетов на Диске Битрикса.
 *
 * Файл на нашем сервере остаётся с техническим именем (`offer-<uuid>.docx`):
 * от него зависят хранилище, LibreOffice, склейка PDF и публичные ссылки.
 * Читаемое имя получает только копия на Диске, так же, как у договора: оно
 * без пробелов, потому что попадает в адрес ссылки (`DETAIL_URL`), а
 * читаемым текст становится только внутри `<a>` — {@link diskNameToLinkText}.
 */

/** Сколько символов имени (без расширения) пропускаем на Диск. */
export const DISK_NAME_MAX_LENGTH = 100;

/** Строка Гаранта в том минимуме, который нужен имени файла. */
export interface DiskNameRow {
    name?: string;
    shortName?: string;
    alternativeName?: string;
    supply?: { name?: string };
}

/** Наборы запроса: любой тип строк в наборе может отсутствовать. */
export type DiskNameSets = {
    [kind in InvoiceSetKind]?: Array<
        { rows?: { garant?: DiskNameRow[] } } | undefined
    >;
};

/**
 * Скрытый знак: управляющий (C0, DEL, C1), нулевой ширины и управление
 * направлением текста. Пробельные знаки сюда не попадают: они уже стали
 * подчёркиваниями.
 */
const isHiddenChar = (char: string): boolean => {
    const code = char.codePointAt(0) ?? 0;
    return (
        code <= 0x1f ||
        (code >= 0x7f && code <= 0x9f) ||
        (code >= 0x200b && code <= 0x200f) ||
        (code >= 0x202a && code <= 0x202e) ||
        code === 0x2060
    );
};

/** Запрещены Диском Битрикса или ломают адрес ссылки и batch-команду. */
const FORBIDDEN_CHARS = /[\\/:*?"<>|%#&+]/g;

/** Расширения, которые {@link resolveDiskFileName} не даёт удвоить. */
const FILE_EXTENSION = /\.(docx|pdf)$/i;

/**
 * Имя без расширения, безопасное для Диска и адреса ссылки.
 *
 * Любые пробелы — одно подчёркивание, запрещённые и скрытые символы
 * вырезаются, повторные подчёркивания схлопываются, ведущие и хвостовые
 * точки и подчёркивания отбрасываются, длина ограничена. Пустой результат
 * значит «имени нет»: вызывающий оставляет прежнее имя файла.
 */
export const sanitizeDiskName = (
    raw: string | null | undefined,
    maxLength: number = DISK_NAME_MAX_LENGTH,
): string => {
    const visible = Array.from(String(raw ?? '').replace(/\s+/g, '_'))
        .filter(char => !isHiddenChar(char))
        .join('');
    const text = visible
        .replace(FORBIDDEN_CHARS, '')
        .replace(/_+/g, '_')
        .replace(/^[._]+/, '');
    return Array.from(text)
        .slice(0, maxLength)
        .join('')
        .replace(/_+/g, '_')
        .replace(/[._]+$/, '');
};

/** Читаемый текст ссылки по имени на Диске: «КП_Гарант-Юрист_1_ОД» → «КП Гарант-Юрист 1 ОД». */
export const diskNameToLinkText = (diskName: string): string =>
    diskName.replace(FILE_EXTENSION, '').replace(/_+/g, ' ').trim();

/**
 * Имя файла для загрузки на Диск.
 *
 * `diskName` приходит без расширения; расширение берётся у самого файла
 * (`.docx`, а при сбое перевода в PDF у счёта и КП тоже `.docx`), поэтому
 * оно не удваивается и не расходится с содержимым. Имени нет или оно после
 * очистки пустое — прежнее имя файла на сервере.
 */
export const resolveDiskFileName = (
    absolutePath: string,
    diskName?: string | null,
): string => {
    const base = sanitizeDiskName(
        String(diskName ?? '').replace(FILE_EXTENSION, ''),
    );
    return base ? `${base}${extname(absolutePath)}` : basename(absolutePath);
};

/** Комплект и доступ из первой строки Гаранта: «Гарант-Юрист», «Интернет 1 ОД». */
const rowParts = (row: DiskNameRow | undefined): string[] => {
    if (!row) {
        return [];
    }
    // как в подписи документа: альтернативное название главнее обычного;
    // короткое — запасное, если полного нет
    const complect = row.alternativeName || row.name || row.shortName || '';
    return [complect, row.supply?.name ?? ''];
};

const joinParts = (...parts: string[]): string =>
    parts.filter(part => part && part.trim()).join(' ');

/**
 * Имя КП на Диске по первой строке Гаранта главного набора:
 * «КП_Гарант-Юрист_Интернет_1_ОД». Строки Гаранта нет — «КП».
 */
export const getOfferDiskName = (dto: {
    sets?: { general?: DiskNameSets['general'] };
}): string => {
    const row = dto.sets?.general?.[0]?.rows?.garant?.[0];
    return sanitizeDiskName(joinParts('КП', ...rowParts(row))) || 'КП';
};

/**
 * Имя счёта на Диске: «Счёт_<номер счёта>», если номер есть, иначе по первой
 * строке Гаранта набора, из которого собран счёт: «Счёт_Гарант-Юрист_Интернет_1_ОД».
 * Строки нет — «Счёт» для первого счёта списка и «Счёт_N» для следующих
 * (`position` — место счёта в списке с нуля).
 */
export const getInvoiceDiskName = (
    dto: { sets?: DiskNameSets },
    setKind: InvoiceSetKind,
    setIndex: number,
    invoiceNumber: string | null | undefined,
    position: number,
): string => {
    // номер из одних запрещённых знаков после очистки пуст: тогда имя
    // строится по комплекту и доступу
    const number = sanitizeDiskName(invoiceNumber);
    if (number) {
        return sanitizeDiskName(`Счёт ${number}`);
    }
    const row = dto.sets?.[setKind]?.[setIndex]?.rows?.garant?.[0];
    if (row) {
        return sanitizeDiskName(joinParts('Счёт', ...rowParts(row))) || 'Счёт';
    }
    return position <= 0 ? 'Счёт' : `Счёт_${position + 1}`;
};
