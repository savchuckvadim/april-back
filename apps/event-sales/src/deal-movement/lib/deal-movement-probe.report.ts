import {
    effectiveDealLastActivityAt,
    type DealMovementProbeMoments,
    type DealMovementProbeResult,
} from '@lib/sales-ai-analytics';

/** Вид записи проверки — для текста вывода. */
const PROBE_KINDS = {
    logMessage: 'Служебная запись журнала',
    comment: 'Комментарий',
} as const;

/** Сдвиг попал в окно своей записи — ночной счёт его отбросит. */
const insideOwnWindow = (
    after: string | null,
    before: string | null,
    writtenAt: string | null,
): boolean =>
    effectiveDealLastActivityAt(after, {
        lastActivityAt: before,
        notifiedAt: writtenAt,
    }) === before;

function conclusion(
    kind: string,
    shifts: boolean,
    insideWindow: boolean,
): string[] {
    if (!shifts) {
        return [`${kind} не сдвигает «последнюю активность» сделки.`];
    }
    return [
        `${kind} сдвигает «последнюю активность» сделки.`,
        insideWindow
            ? `Сдвиг попал в окно своей записи (от 2 минут до неё до 15 минут после) — ночной счёт не примет его за работу по сделке.`
            : `Сдвиг вне окна своей записи (от 2 минут до неё до 15 минут после) — ночной счёт примет запись за работу по сделке; окно нужно пересмотреть.`,
    ];
}

/**
 * Выводы проверки записи в ленту словами: сдвигает ли каждая запись
 * «последнюю активность» и узнает ли ночной счёт в сдвиге свою запись.
 * Чистая функция.
 */
export function concludeDealMovementProbe(
    moments: DealMovementProbeMoments,
): Pick<
    DealMovementProbeResult,
    'logMessageShifts' | 'commentShifts' | 'conclusions'
> {
    const logMessageShifts = moments.afterLogMessage !== moments.before;
    const commentShifts = moments.afterComment !== moments.afterLogMessage;
    return {
        logMessageShifts,
        commentShifts,
        conclusions: [
            ...conclusion(
                PROBE_KINDS.logMessage,
                logMessageShifts,
                insideOwnWindow(
                    moments.afterLogMessage,
                    moments.before,
                    moments.logMessageAt,
                ),
            ),
            ...conclusion(
                PROBE_KINDS.comment,
                commentShifts,
                insideOwnWindow(
                    moments.afterComment,
                    moments.afterLogMessage,
                    moments.commentAt,
                ),
            ),
        ],
    };
}
