import { Injectable, Logger } from '@nestjs/common';
import {
    DEAL_MOVEMENT_REQUESTERS,
    planDealMovementNight,
    type DealMovementNightPlan,
    type DealMovementRunMode,
    type DealMovementRunPhase,
    type DealMovementRunStatus,
    type DealMovementStateEntry,
} from '@lib/sales-ai-analytics';
import { resolveTimezoneByDomain, type ETimeZone } from '@lib/shared/lib/date';
import { getErrorString } from '@/shared/lib/utils/get-error-string.util';
import {
    DEAL_MOVEMENT_MIN_DAYS_BETWEEN_NOTES,
    DEAL_MOVEMENT_NOTES,
} from '../constants/deal-movement.const';
import {
    buildDealMovementSnapshot,
    formatDealMovementFailure,
    formatDealMovementRun,
} from '../lib/deal-movement-report';
import {
    applyDealMovementPlan,
    initialDealMovementStatus,
    plannedDealMovementNotes,
} from '../lib/deal-movement-run-status';
import {
    dealMovementDayKey,
    isDealMovementStateStale,
} from '../lib/deal-movement-schedule';
import type {
    DealMovementOptions,
    DealMovementRunOutcome,
} from '../types/deal-movement.types';
import {
    DealMovementEvaluator,
    type DealMovementEvaluation,
} from './deal-movement-evaluator.service';
import { DealMovementNotesService } from './deal-movement-notes.service';
import { DealMovementRunState } from './deal-movement-run-state';
import { DealMovementSettingsService } from './deal-movement-settings.service';
import { DealMovementSnapshotStore } from './deal-movement-snapshot.store';
import { DealMovementStateStore } from './deal-movement-state.store';

/** Прогон портала изнутри: день, пояс, замок и ход. */
interface RunContext {
    readonly domain: string;
    readonly day: string;
    readonly timezone: ETimeZone;
    readonly token: string;
    readonly now: Date;
    readonly status: DealMovementRunStatus;
    /**
     * Ручной счёт из админки: в ленты не пишет — днём пачка записей у
     * сотрудников и вызовы модели недопустимы; расхождения ждут ночи.
     */
    readonly heldForNight: boolean;
}

/**
 * Прогон портала: замок, прошлое состояние, оценка открытых сделок, план
 * ночи, запись в ленту, сохранение и итог нам в Telegram (решение
 * 17.11.2026):
 * - «Посчитать» (`dry-run`) — ничего не сохраняет и не пишет; итог (и
 *   сколько записей ушло бы в ленту) — в состоянии прогона;
 * - счёт (`count`) — состояние по сделкам в Redis целиком, затем записи в
 *   ленту (если включены; каждая удачная — сразу одним полем хеша), затем
 *   дневной снимок в ais и метка счёта. Пишет в ленты ТОЛЬКО ночной счёт
 *   по расписанию: у ручного счёта из админки лимит записей 0, расхождения
 *   не теряются и уходят ночью.
 *
 * Прошлое состояние читается ДО оценки: последняя активность сделки
 * считается без нашей записи. Счёт старше трёх суток (или его нет) —
 * базовая линия заново, она ничего не пишет. Ошибка — итог «не удался»,
 * метка счёта не ставится: следующий тик ночного окна попробует снова,
 * а уже записанные сделки помечены и второй раз не получат запись.
 *
 * `@Injectable` без bitrix-состояния: Битрикс — внутри оценщика и записи.
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
        private readonly notes: DealMovementNotesService,
    ) {}

    async run(
        domain: string,
        mode: DealMovementRunMode,
        requestedBy: string,
        now: Date = new Date(),
    ): Promise<DealMovementRunOutcome> {
        const token = await this.runState.lock(domain);
        if (token === null) return { kind: 'busy', domain };
        const timezone = resolveTimezoneByDomain(domain);
        const ctx: RunContext = {
            domain,
            day: dealMovementDayKey(now, timezone),
            timezone,
            token,
            now,
            status: initialDealMovementStatus(domain, mode, requestedBy, now),
            heldForNight:
                mode === 'count' &&
                requestedBy !== DEAL_MOVEMENT_REQUESTERS.nightly,
        };
        try {
            await this.runState.saveStatus(ctx.status);
            const options = await this.settings.resolve(domain);
            const { previous, baseline } = await this.previousState(ctx);
            const evaluation = await this.evaluator.evaluate(
                domain,
                options,
                now,
                phase => this.progress(ctx, phase),
                previous,
            );
            const plan = await this.plan(ctx, options, evaluation, {
                previous,
                baseline,
            });
            if (mode === 'count') {
                await this.persist(ctx, options, evaluation, plan);
            }
            return await this.finish(ctx);
        } catch (error) {
            return await this.fail(ctx, getErrorString(error));
        } finally {
            await this.runState.unlock(domain, token);
        }
    }

    /** Прошлое состояние; счёт устарел или его нет — базовая линия. */
    private async previousState(ctx: RunContext): Promise<{
        previous: Map<string, DealMovementStateEntry> | null;
        baseline: boolean;
    }> {
        const lastRun = await this.runState.lastRun(ctx.domain);
        if (isDealMovementStateStale(lastRun?.at ?? null, ctx.now)) {
            return { previous: null, baseline: true };
        }
        const previous = await this.stateStore.load(ctx.domain);
        return { previous, baseline: previous.size === 0 };
    }

    /** План ночи: запись включена — расхождения в список, иначе молча. */
    private async plan(
        ctx: RunContext,
        options: DealMovementOptions,
        evaluation: DealMovementEvaluation,
        prior: {
            previous: Map<string, DealMovementStateEntry> | null;
            baseline: boolean;
        },
    ): Promise<DealMovementNightPlan> {
        const plan = planDealMovementNight({
            previous: prior.previous,
            deals: evaluation.deals,
            carryOver: evaluation.carryOver,
            mode: options.notes.write ? 'notify' : 'silent',
            limits: {
                // Ручной счёт: план с записью, но лимит 0 — всё ждёт ночи.
                notify: ctx.heldForNight
                    ? 0
                    : await this.notes.remaining(
                          ctx.domain,
                          ctx.day,
                          options.notes,
                      ),
                minDaysBetween: DEAL_MOVEMENT_MIN_DAYS_BETWEEN_NOTES,
            },
            now: ctx.now.toISOString(),
        });
        applyDealMovementPlan(ctx.status, {
            openTotal: evaluation.openTotal,
            evaluated: evaluation.deals.length,
            capped: evaluation.capped,
            baseline: prior.baseline,
            warnings: evaluation.warnings,
            plan,
            notes: plannedDealMovementNotes(
                options.notes,
                plan,
                ctx.heldForNight,
            ),
        });
        return plan;
    }

    /** Счёт: состояние целиком → записи в ленту → снимок дня → метка. */
    private async persist(
        ctx: RunContext,
        options: DealMovementOptions,
        evaluation: DealMovementEvaluation,
        plan: DealMovementNightPlan,
    ): Promise<void> {
        await this.stateStore.save(ctx.domain, plan.state);
        const notified = await this.writeNotes(ctx, options, evaluation, plan);
        ctx.status.updatedAt = new Date().toISOString();
        await this.snapshots.save(
            ctx.domain,
            buildDealMovementSnapshot({
                status: ctx.status,
                day: ctx.day,
                changes: plan.changes,
                verdicts: evaluation.verdicts,
                notified,
            }),
        );
        await this.runState.markRun(ctx.domain, {
            day: ctx.day,
            at: ctx.now.toISOString(),
        });
        ctx.status.snapshotDay = ctx.day;
        ctx.status.phase = 'saved';
    }

    /** Записи в ленту по плану; ничего в плане — ничего не делаем. */
    private async writeNotes(
        ctx: RunContext,
        options: DealMovementOptions,
        evaluation: DealMovementEvaluation,
        plan: DealMovementNightPlan,
    ): Promise<ReadonlySet<string>> {
        const summary = ctx.status.notes;
        if (
            summary === undefined ||
            ctx.heldForNight ||
            plan.toNotify.length === 0
        ) {
            return new Set();
        }
        await this.progress(ctx, 'notes');
        const outcome = await this.notes.write({
            domain: ctx.domain,
            day: ctx.day,
            timezone: ctx.timezone,
            plan,
            verdicts: evaluation.verdicts,
            pointers: evaluation.pointers,
            options: options.notes,
            summary,
            // notifiedAt — момент самой записи, а не старт прогона.
            clock: () => new Date(),
            pauseMs: DEAL_MOVEMENT_NOTES.pauseMs,
            onProgress: () => this.progress(ctx, 'notes'),
        });
        ctx.status.warnings.push(...outcome.warnings);
        return outcome.written;
    }

    private async finish(ctx: RunContext): Promise<DealMovementRunOutcome> {
        ctx.status.phase = 'done';
        ctx.status.finished = true;
        ctx.status.updatedAt = new Date().toISOString();
        await this.runState.saveStatus(ctx.status);
        this.logger.log(formatDealMovementRun(ctx.status), { telegram: true });
        return { kind: 'ran', status: ctx.status };
    }

    private async fail(
        ctx: RunContext,
        message: string,
    ): Promise<DealMovementRunOutcome> {
        ctx.status.phase = 'failed';
        ctx.status.finished = true;
        ctx.status.error = message;
        ctx.status.updatedAt = new Date().toISOString();
        await this.runState.saveStatus(ctx.status);
        this.logger.error(formatDealMovementFailure(ctx.domain, message), {
            telegram: true,
            domain: ctx.domain,
        });
        return { kind: 'failed', domain: ctx.domain, error: message };
    }

    /** Фаза прогона: ход в Redis и продление замка портала. */
    private async progress(
        ctx: RunContext,
        phase: DealMovementRunPhase,
    ): Promise<void> {
        ctx.status.phase = phase;
        ctx.status.updatedAt = new Date().toISOString();
        await this.runState.extend(ctx.domain, ctx.token);
        await this.runState.saveStatus(ctx.status);
    }
}
