/** Разбор ответов Битрикса в этой библиотеке. */
export type InnRow = Record<string, unknown>;

/** Минимум, который нужен от инстанса Битрикса для записи ИНН. */
export interface IInnBitrixApi {
    call(method: string, params: InnRow): Promise<unknown>;
}

/**
 * Структурный порт вместо `BitrixService`: писателя зовут и из хука
 * обогащения, где инстанс объявлен таким же минимальным интерфейсом. Полный
 * `BitrixService` этому порту соответствует.
 */
export interface IInnBitrix {
    api: IInnBitrixApi;
}

/** Непустой текст значения поля. */
export function innText(raw: unknown): string {
    if (typeof raw === 'string') return raw.trim();
    if (typeof raw === 'number') return String(raw);
    return '';
}

/** Значения поля списком: одиночное и множественное к одному виду. */
export function innList(raw: unknown): string[] {
    const values = Array.isArray(raw) ? raw : [raw];
    return values.map(value => innText(value)).filter(Boolean);
}

/** `result` ответа Битрикса массивом строк. */
export function innRows(response: unknown): InnRow[] {
    if (!response || typeof response !== 'object') return [];
    const result = (response as InnRow).result;
    return Array.isArray(result) ? (result as InnRow[]) : [];
}

/** `result` ответа Битрикса одной строкой. */
export function innRow(response: unknown): InnRow | null {
    if (!response || typeof response !== 'object') return null;
    const result = (response as InnRow).result;
    return result && typeof result === 'object' && !Array.isArray(result)
        ? (result as InnRow)
        : null;
}

/** Положительное число из значения Битрикса (id приходят строками). */
export function innId(raw: unknown): number {
    const value = Number(innText(raw));
    return Number.isFinite(value) && value > 0 ? value : 0;
}
