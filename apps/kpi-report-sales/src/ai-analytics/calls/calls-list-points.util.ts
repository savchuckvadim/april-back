/**
 * Статусы пунктов методики в выборке периода раздела «Разборы звонков»:
 * плотная запись — по символу на код пункта, чтобы строка звонка в кэше
 * не несла десятки пар «код — статус». Чистые функции без DI.
 */
import type {
    AnalyticsCallLiteRow,
    AnalyticsLitePoint,
} from '@lib/call-lib/call-report-analytics/types/analytics-lite.types';
import type { CheckpointStatus } from '@lib/call-lib/call-report/methodology/methodology.types';

/** Пункт у звонка не проверялся. */
const NOT_CHECKED = '-';

/** Символ записи по статусу пункта: тип Record не даёт забыть новый статус. */
const SYMBOL_BY_STATUS: Record<CheckpointStatus, string> = {
    done: 'd',
    missed: 'm',
    not_applicable: 'n',
};

const STATUS_BY_SYMBOL: ReadonlyMap<string, CheckpointStatus> = new Map(
    (Object.entries(SYMBOL_BY_STATUS) as [CheckpointStatus, string][]).map(
        ([status, symbol]): [string, CheckpointStatus] => [symbol, status],
    ),
);

/** Коды пунктов методики, встретившиеся в звонках, по алфавиту и без повторов. */
export function collectPointCodes(
    rows: readonly Pick<AnalyticsCallLiteRow, 'methodology'>[],
): string[] {
    const codes = new Set<string>();
    for (const row of rows) {
        for (const point of row.methodology?.points ?? []) {
            codes.add(point.code);
        }
    }
    return [...codes].sort();
}

/**
 * Статусы пунктов звонка одной строкой: символ на каждый код из `codes`
 * (та же позиция). Пункта нет у звонка (или методики нет) — «-».
 */
export function encodePoints(
    points: readonly AnalyticsLitePoint[] | undefined,
    codes: readonly string[],
): string {
    const statusByCode = new Map(
        (points ?? []).map((point): [string, CheckpointStatus] => [
            point.code,
            point.status,
        ]),
    );
    return codes
        .map(code => {
            const status = statusByCode.get(code);
            return status === undefined
                ? NOT_CHECKED
                : SYMBOL_BY_STATUS[status];
        })
        .join('');
}

/**
 * Статус пункта на позиции `index` записи; null — пункт не проверялся
 * или позиции нет (индекса нет, запись короче).
 */
export function pointStatusAt(
    encoded: string,
    index: number,
): CheckpointStatus | null {
    if (!Number.isInteger(index) || index < 0 || index >= encoded.length) {
        return null;
    }
    return STATUS_BY_SYMBOL.get(encoded.charAt(index)) ?? null;
}

/** Код пункта → позиция в записи (позиция кода в `codes`). */
export function pointIndexMap(
    codes: readonly string[],
): ReadonlyMap<string, number> {
    return new Map(codes.map((code, index): [string, number] => [code, index]));
}
