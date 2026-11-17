import { Injectable, Logger } from '@nestjs/common';
import {
    DEAL_MOVEMENT_NIGHT_DEFAULTS,
    emptyDealMovementCounts,
    planDealMovementNight,
    type DealMovementNightPlan,
    type DealMovementRunMode,
    type DealMovementRunPhase,
    type DealMovementRunStatus,
} from '@lib/sales-ai-analytics';
import { resolveTimezoneByDomain } from '@lib/shared/lib/date';
import { getErrorString } from '@/shared/lib/utils/get-error-string.util';
import { DEAL_MOVEMENT_MIN_DAYS_BETWEEN_NOTES } from '../constants/deal-movement.const';
import {
    buildDealMovementSnapshot,
    formatDealMovementFailure,
    formatDealMovementRun,
} from '../lib/deal-movement-report';
import {
    dealMovementDayKey,
    isDealMovementStateStale,
} from '../lib/deal-movement-schedule';
import type { DealMovementRunOutcome } from '../types/deal-movement.types';
import {
    DealMovementEvaluator,
    type DealMovementEvaluation,
} from './deal-movement-evaluator.service';
import { DealMovementRunState } from './deal-movement-run-state';
import { DealMovementSettingsService } from './deal-movement-settings.service';
import { DealMovementSnapshotStore } from './deal-movement-snapshot.store';
import { DealMovementStateStore } from './deal-movement-state.store';

/**
 * Прогон портала: замок, оценка открытых сделок, план ночи, сохранение и
 * итог нам в Telegram. Режимы этой волны (решение 17.11.2026):
 * - «Посчитать» (`dry-run`) — ничего не сохраняет, итог в состоянии прогона;
 * - ночной счёт (`count`) — состояние по сделкам в Redis, дневной снимок в
 *   ais, `notifiedStatus` сдвигается молча; в сделки не пишется ничего.
 *
 * Счёт старше трёх суток (или его нет) — базовая линия заново. Ошибка —
 * итог «не удался», метка последнего счёта не ставится: следующий тик
 * ночного окна попробует снова.
 *
 * `@Injectable` без bitrix-состояния: Битрикс — внутри оценщика на вызов.
 */
@Injectable()
export class DealMovementRunService {
    private readonly logger = new Logger(DealMovementRunService.name);

    constructor(
        private readonly settings: DealMovementSettingsService,
        private readonly evaluator: DealMovementEvaluator,
        private readonly runState: DealMovementRunState,
        private readonly stateStore: DealMovementStateStore,
        private readonly snapshots: DealMovementSnapshotStore,
    ) {}

    async run(
        domain: string,
        mode: DealMovementRunMode,
        requestedBy: string,
        now: Date = new Date(),
    ): Promise<DealMovementRunOutcome> {
        const token = await this.runState.lock(domain);
        if (token === null) return { kind: 'busy', domain };
        const status = initialStatus(domain, mode, requestedBy, now);
        try {
            await this.runState.saveStatus(status);
            const evaluation = await this.evaluator.evaluate(
                domain,
                await this.settings.resolve(domain),
                now,
                phase => this.progress(status, phase, token),
            );
            const plan = await this.plan(domain, evaluation, status, now);
            if (mode === 'count') {
                await this.persist(domain, evaluation, plan, status, now);
            }
            status.phase = 'done';
            status.finished = true;
            status.updatedAt = new Date().toISOString();
            await this.runState.saveStatus(status);
            this.logger.log(formatDealMovementRun(status), { telegram: true });
            return { kind: 'ran', status };
        } catch (error) {
            const message = getErrorString(error);
            status.phase = 'failed';
            status.finished = true;
            status.error = message;
            status.updatedAt = new Date().toISOString();
            await this.runState.saveStatus(status);
            this.logger.error(formatDealMovementFailure(domain, message), {
                telegram: true,
                domain,
            });
            return { kind: 'failed', domain, error: message };
        } finally {
            await this.runState.unlock(domain, token);
        }
    }

    /** План ночи по прошлому состоянию (устаревшее — базовая линия). */
    private async plan(
        domain: string,
        evaluation: DealMovementEvaluation,
        status: DealMovementRunStatus,
        now: Date,
    ): Promise<DealMovementNightPlan> {
        const lastRun = await this.runState.lastRun(domain);
        const baseline = isDealMovementStateStale(lastRun?.at ?? null, now);
        const previous = baseline ? null : await this.stateStore.load(domain);
        const plan = planDealMovementNight({
            previous,
            deals: evaluation.deals,
            carryOver: evaluation.carryOver,
            // Записи в сделки в этой волне нет: notifiedStatus — молча.
            mode: 'silent',
            limits: {
                ...DEAL_MOVEMENT_NIGHT_DEFAULTS,
                minDaysBetween: DEAL_MOVEMENT_MIN_DAYS_BETWEEN_NOTES,
            },
            now: now.toISOString(),
        });
        Object.assign(status, {
            openTotal: evaluation.openTotal,
            evaluated: evaluation.deals.length,
            capped: evaluation.capped,
            baseline: baseline || previous?.size === 0,
            firstSeen: plan.firstSeen,
            byStatus: plan.byStatus,
            changed: plan.changes.length,
            warnings: [...evaluation.warnings],
        });
        return plan;
    }

    /** Ночной счёт: состояние, снимок дня, метка последнего счёта. */
    private async persist(
        domain: string,
        evaluation: DealMovementEvaluation,
        plan: DealMovementNightPlan,
        status: DealMovementRunStatus,
        now: Date,
    ): Promise<void> {
        const day = dealMovementDayKey(now, resolveTimezoneByDomain(domain));
        await this.stateStore.save(domain, plan.state);
        status.updatedAt = new Date().toISOString();
        await this.snapshots.save(
            domain,
            buildDealMovementSnapshot({
                status,
                day,
                changes: plan.changes,
                verdicts: evaluation.verdicts,
            }),
        );
        await this.runState.markRun(domain, { day, at: now.toISOString() });
        status.snapshotDay = day;
        status.phase = 'saved';
    }

    /** Фаза прогона: ход в Redis и продление замка портала. */
    private async progress(
        status: DealMovementRunStatus,
        phase: DealMovementRunPhase,
        token: string,
    ): Promise<void> {
        status.phase = phase;
        status.updatedAt = new Date().toISOString();
        await this.runState.extend(status.domain, token);
        await this.runState.saveStatus(status);
    }
}

function initialStatus(
    domain: string,
    mode: DealMovementRunMode,
    requestedBy: string,
    now: Date,
): DealMovementRunStatus {
    const startedAt = now.toISOString();
    return {
        domain,
        mode,
        requestedBy,
        phase: 'started',
        startedAt,
        updatedAt: startedAt,
        finished: false,
        openTotal: 0,
        evaluated: 0,
        capped: false,
        baseline: false,
        firstSeen: 0,
        byStatus: emptyDealMovementCounts(),
        changed: 0,
        snapshotDay: null,
        warnings: [],
        error: null,
    };
}
