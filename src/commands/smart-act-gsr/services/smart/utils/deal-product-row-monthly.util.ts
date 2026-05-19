import type { IBXProductRowRow } from '@/modules/bitrix';

/**
 * Утилиты для перевода товарных строк СДЕЛКИ в строки СМАРТ-АКТА (один месяц).
 *
 * Важно про ownerType / ownerId:
 * - У строк, пришедших со сделки, в Bitrix обычно ownerType = "D" (Deal), ownerId = ID сделки.
 * - У строк смарт-процесса нужно ownerType = "DYNAMIC_{entityTypeId}" и ownerId = ID элемента смарта.
 * Эти два поля подставляются в buildMonthlyProductRowsForSmart — см. комментарии у присваивания.
 *
 * Проверка «нужно ли вызывать productRow.set»: см. monthlyProductRowsMatch + snapshotRowForCompare —
 * сравниваем состав строк (имя, количество на акте = 1, цены, скидки по сумме и типу/ставке).
 */

/** Ищем в названии единицы измерения месячный множитель; длинная цифра раньше короткой (24 до 12). */
const MEASURE_MONTH_FACTORS = [24, 12, 6, 3] as const;

export function measureMonthFactorFromName(measureName?: string): number {
    if (!measureName) {
        return 1;
    }
    for (const n of MEASURE_MONTH_FACTORS) {
        if (measureName.includes(String(n))) {
            return n;
        }
    }
    return 1;
}

/**
 * Сколько календарных месяцев покрытия заложено в одной строке сделки:
 * `quantity` × коэффициент из названия единицы (6 / 12 / 24 / 3 в `measureName`, иначе 1).
 * Пример: qty 1 и «…6 мес…» → 6 месяцев; qty 4 и «шт» → 4 месяца.
 */
export function effectiveDealMonthsFromFirstRow(row: IBXProductRowRow): number {
    const qty = Math.max(Number(row.quantity ?? 1), 1);
    const factor = measureMonthFactorFromName(row.measureName);
    const months = qty * factor;
    return Math.max(1, Math.floor(months));
}

/** Поля цены за единицу в Bitrix: на акте — доля месяца = (значение × qty строки сделки) / месяцы покрытия. */
const PER_UNIT_MONEY_KEYS = [
    'price',
    'priceNetto',
    'priceExclusive',
    'priceAccount',
    'priceBrutto',
] as const;

/** Сумма скидки по строке целиком: доля месяца = значение / месяцы покрытия. */
const LINE_LEVEL_MONEY_KEYS = ['discountSum'] as const;

/** Все денежные поля для сравнения снимков и set (порядок важен для snapshot). */
const MONEY_KEYS = [...PER_UNIT_MONEY_KEYS, ...LINE_LEVEL_MONEY_KEYS] as const;

export { MONEY_KEYS };

function scaleNumber(n: number, divisor: number): number {
    if (!Number.isFinite(n) || divisor <= 0) {
        return n;
    }
    return Math.round((n / divisor) * 10_000) / 10_000;
}

/**
 * Строим набор строк для ОДНОГО смарт-акта (один календарный слот = 1 месяц):
 * 1) Копируем поля строки сделки (название, мера, сортировка, тип скидки и т.д.).
 * 2) Месяцы покрытия по **этой** строке: `effectiveDealMonthsFromFirstRow(row)` (qty × коэф. из меры).
 * 3) Цены за единицу в Bitrix — умножаем на qty строки сделки (сумма строки), делим на месяцы покрытия.
 *    `discountSum` — уже по строке целиком, делим только на месяцы покрытия.
 * 4) Владелец смарта: ownerType (crmId смарта), ownerId = элемент акта.
 * 5) quantity на акте всегда 1.
 * 6) Убираем id — для set новый набор привязки к элементу.
 */
export function buildMonthlyProductRowsForSmart(
    dealRows: IBXProductRowRow[],
    smartOwnerType: string,
    smartItemId: number,
): IBXProductRowRow[] {
    return dealRows.map((row, index) => {
        const months = effectiveDealMonthsFromFirstRow(row);
        const qty = Math.max(Number(row.quantity ?? 1), 1);
        const base = { ...row } as Record<string, unknown>;

        for (const key of PER_UNIT_MONEY_KEYS) {
            const v = base[key];
            if (typeof v === 'number' && Number.isFinite(v)) {
                base[key] = scaleNumber(v * qty, months);
            }
        }
        for (const key of LINE_LEVEL_MONEY_KEYS) {
            const v = base[key];
            if (typeof v === 'number' && Number.isFinite(v)) {
                base[key] = scaleNumber(v, months);
            }
        }

        const out = base as unknown as IBXProductRowRow & {
            ownerType: string;
            ownerId: number;
        };
        // Привязка строк к смарт-элементу (не к сделке): иначе Bitrix не сохранит строки на акте.
        out.ownerType = smartOwnerType;
        out.ownerId = smartItemId;
        out.quantity = 1;
        out.sort = row.sort ?? index;
        delete (out as { id?: number }).id;
        return out;
    });
}

/**
 * Снимок строки для сравнения «уже как надо» vs «надо записать».
 * Учитываем: productName, quantity (на смарте ждём 1), цены из MONEY_KEYS,
 * discountTypeId и discountRate (как в сделке; сумму скидки уже в discountSum),
 * measureName, sort. Если снимки всех строк совпадают — productRow.set не вызываем.
 */
export function snapshotRowForCompare(row: IBXProductRowRow): string {
    const r = row as Record<string, unknown>;
    const parts = [
        String(row.productName ?? ''),
        String(row.quantity ?? ''),
        ...MONEY_KEYS.map(k => num(r[k])),
        num(r.discountTypeId),
        num(r.discountRate),
        String(row.measureName ?? ''),
        String(row.sort ?? ''),
    ];
    return parts.join('|');
}

function num(v: unknown): string {
    if (typeof v === 'number' && Number.isFinite(v)) {
        return String(Math.round(v * 10_000) / 10_000);
    }
    return '';
}

/**
 * Нужно ли перезаписывать товарные строки смарта:
 * - Читаем текущие строки через list по ownerType смарта + ownerId элемента.
 * - Строим «желаемое» состояние из строк сделки (buildMonthlyProductRowsForSmart).
 * - Сортируем оба набора одинаково и сравниваем построчные snapshotRowForCompare.
 * Совпало → править нечего (меньше запросов, не обновляется «дата изменения» у сущности из‑за лишнего set).
 */
export function monthlyProductRowsMatch(
    existing: IBXProductRowRow[] | undefined,
    desired: IBXProductRowRow[],
): boolean {
    if (!existing || existing.length !== desired.length) {
        return false;
    }
    const a = [...existing]
        .sort(compareRows)
        .map(snapshotRowForCompare)
        .join('\n');
    const b = [...desired]
        .sort(compareRows)
        .map(snapshotRowForCompare)
        .join('\n');
    return a === b;
}

function compareRows(x: IBXProductRowRow, y: IBXProductRowRow): number {
    const s = (x.sort ?? 0) - (y.sort ?? 0);
    if (s !== 0) {
        return s;
    }
    return String(x.productName ?? '').localeCompare(
        String(y.productName ?? ''),
    );
}
