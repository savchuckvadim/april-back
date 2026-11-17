import {
    DEAL_MOVEMENT_CALC_VERSION,
    DEAL_MOVEMENT_DIGEST_SKIP_TITLES,
    DEAL_MOVEMENT_RUN_MODE_TITLES,
    DEAL_MOVEMENT_SNAPSHOT_CHANGES_LIMIT,
    DEAL_MOVEMENT_STATUS_TITLES,
    dealMovementDaysText,
    dealMovementReasonTexts,
    type DealMovementDigestSummary,
    type DealMovementNightChange,
    type DealMovementNotesSummary,
    type DealMovementRunMode,
    type DealMovementRunStatus,
    type DealMovementSnapshotPayload,
    type DealMovementStatus,
    type DealMovementVerdict,
} from '@lib/sales-ai-analytics';
import { DEAL_MOVEMENT_MIN_DAYS_BETWEEN_NOTES } from '../constants/deal-movement.const';

/**
 * Тексты итога ночи (нам в Telegram) и дневной снимок для ais. По-русски,
 * без кодов статусов (правило UI-текстов). Чистые функции.
 */

/** Порядок статусов в итоге: от спокойных к тревожным, как читает человек. */
const STATUS_ORDER: readonly DealMovementStatus[] = [
    'moving',
    'stuck',
    'rolled_back',
    'at_risk',
];

const countsLine = (byStatus: Record<DealMovementStatus, number>): string =>
    STATUS_ORDER.map(
        status =>
            `${DEAL_MOVEMENT_STATUS_TITLES[status]} — ${byStatus[status]}`,
    ).join(' · ');

const quietText = (notes: DealMovementNotesSummary): string =>
    `не чаще раза в ${dealMovementDaysText(DEAL_MOVEMENT_MIN_DAYS_BETWEEN_NOTES)} — ${notes.deferredQuiet}`;

const deferredText = (notes: DealMovementNotesSummary): string =>
    `лимит ночи — ${notes.deferredLimit}, ${quietText(notes)}`;

/**
 * Записи в ленту словами: выключено; у «Посчитать» — сколько записали бы;
 * у ручного счёта — сколько ждёт ночи; у ночного — записано, не удалось,
 * отложено и подсказки модели.
 */
export function dealMovementNotesLines(
    notes: DealMovementNotesSummary,
    mode: DealMovementRunMode,
): string[] {
    if (!notes.enabled) return ['Запись в ленту сделок выключена'];
    if (mode === 'dry-run') {
        return [
            `Записали бы в ленту: ${notes.planned}; отложили бы: ${deferredText(notes)}`,
        ];
    }
    if (notes.heldForNight) {
        return [
            `Ручной счёт в ленту не пишет: до ночи отложено записей — ` +
                `${notes.deferredLimit}; ${quietText(notes)}`,
        ];
    }
    return [
        `Записи в ленту: записано ${notes.written} из ${notes.planned}, ` +
            `не удалось ${notes.failed}; отложено: ${deferredText(notes)}`,
        `Подсказки «что сделать»: ${notes.texts}, без подсказки по вине модели: ${notes.textsFailed}`,
    ];
}

/** Сводка руководителям словами: пропуск с причиной или сколько ушло. */
export function dealMovementDigestLine(
    digest: DealMovementDigestSummary,
): string {
    if (digest.skipped !== null) {
        return `Сводка руководителям: ${DEAL_MOVEMENT_DIGEST_SKIP_TITLES[digest.skipped]}`;
    }
    return (
        `Сводка руководителям: получателей ${digest.recipients}, ` +
        `ушло ${digest.sent}, не доставлено ${digest.failed}`
    );
}

/** Итог прогона портала для Telegram. */
export function formatDealMovementRun(status: DealMovementRunStatus): string {
    const lines = [
        `📊 Движение сделок · ${status.domain} · ${DEAL_MOVEMENT_RUN_MODE_TITLES[status.mode]}`,
        `Открытых сделок: ${status.openTotal}, оценено: ${status.evaluated}`,
        countsLine(status.byStatus),
        status.baseline
            ? `Базовая линия: прошлого счёта нет или он старше трёх суток — ` +
              `смены статуса не считались. Впервые увидели сделок: ${status.firstSeen}`
            : `Сменили статус за ночь: ${status.changed}, впервые увидели: ${status.firstSeen}`,
    ];
    if (status.notes !== undefined) {
        lines.push(...dealMovementNotesLines(status.notes, status.mode));
    }
    if (status.digest !== undefined) {
        lines.push(dealMovementDigestLine(status.digest));
    }
    if (status.warnings.length > 0) {
        lines.push(`⚠️ ${status.warnings.join('; ')}`);
    }
    return lines.join('\n');
}

/** Сбой прогона портала для Telegram. */
export const formatDealMovementFailure = (
    domain: string,
    error: string,
): string => `❌ Движение сделок · ${domain}: счёт не удался — ${error}`;

/**
 * Дневной снимок счёта: итог, записи в ленту и смены статуса словами с
 * пометкой «записано в ленту». Причины — по вердикту ночи; смен больше
 * лимита — остаток числом.
 */
export function buildDealMovementSnapshot(input: {
    status: DealMovementRunStatus;
    day: string;
    changes: readonly DealMovementNightChange[];
    verdicts: ReadonlyMap<string, DealMovementVerdict>;
    /** Сделки, которым запись в ленту ушла этим прогоном. */
    notified?: ReadonlySet<string>;
}): DealMovementSnapshotPayload {
    const { status, day, changes, verdicts } = input;
    const notified = input.notified ?? new Set<string>();
    return {
        day,
        mode: status.mode,
        calcVersion: DEAL_MOVEMENT_CALC_VERSION,
        generatedAt: status.updatedAt,
        openTotal: status.openTotal,
        evaluated: status.evaluated,
        baseline: status.baseline,
        firstSeen: status.firstSeen,
        byStatus: { ...status.byStatus },
        changes: changes
            .slice(0, DEAL_MOVEMENT_SNAPSHOT_CHANGES_LIMIT)
            .map(change => {
                const verdict = verdicts.get(change.dealId);
                return {
                    dealId: change.dealId,
                    title: change.title,
                    assignedById: change.assignedById,
                    amount: change.amount,
                    from: change.from,
                    to: change.to,
                    reasons: verdict ? dealMovementReasonTexts(verdict) : [],
                    notified: notified.has(change.dealId),
                };
            }),
        changesTotal: changes.length,
        ...(status.notes === undefined ? {} : { notes: { ...status.notes } }),
        ...(status.digest === undefined
            ? {}
            : { digest: { ...status.digest } }),
        warnings: [...status.warnings],
    };
}
