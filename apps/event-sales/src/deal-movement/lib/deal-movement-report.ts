import {
    DEAL_MOVEMENT_CALC_VERSION,
    DEAL_MOVEMENT_DIGEST_SKIP_TITLES,
    DEAL_MOVEMENT_RUN_MODE_TITLES,
    DEAL_MOVEMENT_SNAPSHOT_CHANGES_LIMIT,
    DEAL_MOVEMENT_SNAPSHOT_FORM,
    dealMovementDaysText,
    dealMovementReasonTexts,
    type DealMovementDigestSummary,
    type DealMovementDealsSnapshotPayload,
    type DealMovementNightChange,
    type DealMovementNightDeal,
    type DealMovementNightPlan,
    type DealMovementNotesSummary,
    type DealMovementProgressCheck,
    type DealMovementRunMode,
    type DealMovementRunStatus,
    type DealMovementSnapshotPayload,
    type DealMovementVerdict,
} from '@lib/sales-ai-analytics';
import { DEAL_MOVEMENT_MIN_DAYS_BETWEEN_NOTES } from '../constants/deal-movement.const';
import { dealMovementCountsText } from './deal-movement-digest.blocks';
import {
    buildDealMovementProblemDeals,
    dealMovementStatusSums,
} from './deal-movement-night-records';

/**
 * Тексты итога ночи (нам в Telegram) и дневной снимок для ais. По-русски,
 * без кодов статусов (правило UI-текстов). Чистые функции.
 */

/**
 * Откуда сроки и сколько сделок проверено по делам Битрикса — для
 * присмотра за нагрузкой; у прогонов до 20.11.2026 строки нет.
 */
function sourcesLine(status: DealMovementRunStatus): string | null {
    if (
        status.stagesByHistory === undefined &&
        status.workProbed === undefined
    ) {
        return null;
    }
    return (
        `Сроки по истории портала — у стадий: ${status.stagesByHistory ?? 0}, ` +
        `у остальных общий порог; звонки и дела Битрикса проверены у ` +
        `сделок: ${status.workProbed ?? 0}`
    );
}

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
    const audit = digest.auditForgotten ?? 0;
    return (
        `Сводка руководителям: получателей ${digest.recipients}, ` +
        `ушло ${digest.sent}, не доставлено ${digest.failed}` +
        (audit > 0 ? `; забыты по аудиту: ${audit}` : '')
    );
}

/** Итог прогона портала для Telegram. */
export function formatDealMovementRun(status: DealMovementRunStatus): string {
    const lines = [
        `📊 Движение сделок · ${status.domain} · ${DEAL_MOVEMENT_RUN_MODE_TITLES[status.mode]}`,
        `Открытых сделок: ${status.openTotal}, оценено: ${status.evaluated}`,
        dealMovementCountsText(code => status.byStatus[code]),
        status.baseline
            ? `Базовая линия: прошлого счёта нет, он старше трёх суток или ` +
              `посчитан прошлой версией правил — смены статуса не считались. ` +
              `Впервые увидели сделок: ${status.firstSeen}`
            : `Сменили статус за ночь: ${status.changed}, впервые увидели: ${status.firstSeen}`,
    ];
    const sources = sourcesLine(status);
    if (sources !== null) lines.push(sources);
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
 * лимита — остаток числом. Форма 2 (20.11.2026): счёт и сумма по статусам
 * всего и по ответственным, отметки проверки продвижения звонков.
 */
export function buildDealMovementSnapshot(input: {
    status: DealMovementRunStatus;
    day: string;
    changes: readonly DealMovementNightChange[];
    verdicts: ReadonlyMap<string, DealMovementVerdict>;
    /** Сделки, которым запись в ленту ушла этим прогоном. */
    notified?: ReadonlySet<string>;
    /** Оценённые сделки ночи — для счёта и суммы по ответственным. */
    deals: readonly DealMovementNightDeal[];
    /** Проверка продвижения звонков 4–5. */
    progressChecks: readonly DealMovementProgressCheck[];
    /** За сколько дней после звонка ждали переход стадии. */
    progressCheckDays: number;
}): DealMovementSnapshotPayload {
    const { status, day, changes, verdicts } = input;
    const notified = input.notified ?? new Set<string>();
    const sums = dealMovementStatusSums(input.deals);
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
        form: DEAL_MOVEMENT_SNAPSHOT_FORM,
        totals: sums.totals,
        byManager: sums.byManager,
        progressChecks: input.progressChecks.map(check => ({ ...check })),
        progressCheckDays: input.progressCheckDays,
    };
}

/** Итог оценки ночи в объёме записей витрины. */
export interface DealMovementNightRecordsEvaluation {
    readonly deals: readonly DealMovementNightDeal[];
    readonly verdicts: ReadonlyMap<string, DealMovementVerdict>;
    readonly stageTitles: ReadonlyMap<string, string>;
    readonly progressChecks: readonly DealMovementProgressCheck[];
}

/**
 * Записи ночи в ais: дневной снимок и список проблемных сделок последней
 * ночи (с какой ночи в статусе — по новому состоянию плана).
 */
export function buildDealMovementNightRecords(input: {
    status: DealMovementRunStatus;
    day: string;
    plan: Pick<DealMovementNightPlan, 'changes' | 'state'>;
    evaluation: DealMovementNightRecordsEvaluation;
    notified: ReadonlySet<string>;
    /** За сколько дней после звонка ждали переход стадии. */
    checkDays: number;
}): {
    snapshot: DealMovementSnapshotPayload;
    problemDeals: DealMovementDealsSnapshotPayload;
} {
    const { status, day, plan, evaluation } = input;
    return {
        snapshot: buildDealMovementSnapshot({
            status,
            day,
            changes: plan.changes,
            verdicts: evaluation.verdicts,
            notified: input.notified,
            deals: evaluation.deals,
            progressChecks: evaluation.progressChecks,
            progressCheckDays: input.checkDays,
        }),
        problemDeals: buildDealMovementProblemDeals({
            deals: evaluation.deals,
            state: plan.state,
            stageTitles: evaluation.stageTitles,
            day,
            generatedAt: status.updatedAt,
        }),
    };
}
