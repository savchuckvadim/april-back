import {
    DEAL_MOVEMENT_CALC_VERSION,
    DEAL_MOVEMENT_RUN_MODE_TITLES,
    DEAL_MOVEMENT_SNAPSHOT_CHANGES_LIMIT,
    DEAL_MOVEMENT_STATUS_TITLES,
    dealMovementReasonTexts,
    type DealMovementNightChange,
    type DealMovementRunStatus,
    type DealMovementSnapshotPayload,
    type DealMovementStatus,
    type DealMovementVerdict,
} from '@lib/sales-ai-analytics';

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
 * Дневной снимок ночного счёта: итог и смены статуса словами. Причины
 * пишутся по вердикту ночи; смен больше лимита — остаток числом.
 */
export function buildDealMovementSnapshot(input: {
    status: DealMovementRunStatus;
    day: string;
    changes: readonly DealMovementNightChange[];
    verdicts: ReadonlyMap<string, DealMovementVerdict>;
}): DealMovementSnapshotPayload {
    const { status, day, changes, verdicts } = input;
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
                };
            }),
        changesTotal: changes.length,
        warnings: [...status.warnings],
    };
}
