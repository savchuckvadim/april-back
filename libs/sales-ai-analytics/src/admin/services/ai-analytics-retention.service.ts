/**
 * Ретенция снапшотов AI-аналитики (план Фазы 3, П5; решения владельца
 * B7/B10 и В8 от 22.09.2026): читает записи домена, считает план удаления
 * чистой политикой (`ai-analytics-retention.policy.ts`) и отдаёт сводку.
 *
 * `dryRun` по умолчанию `true` — ручка считает и ничего не трогает.
 *
 * `dryRun: false` удаляет записи плана физически
 * (`AiService.deleteByIds`, порции внутри репозитория) и отдаёт число
 * удалённых строк. Сервис `AiService` необязателен: без него ручка
 * остаётся расчётной и отвечает статусом `delete-not-available`, а не
 * ложным «удалено 0».
 *
 * Решение В8: при запуске с `dryRun: false` в чат админов уходит одна
 * строка сводки (`TelegramService` глобальный) — предупреждение, что
 * ручку дёрнули всерьёз, и след для разбора.
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { AiService } from '@lib/call-lib';
import { TelegramService } from '@lib/telegram';
import {
    AI_ANALYTICS_SNAPSHOT_TYPES,
    isAiAnalyticsSnapshotType,
} from '../../contracts/snapshot-kinds.const';
import { AiAnalyticsAdminSnapshotStore } from '../ai-analytics-admin-snapshot.store';
import {
    planRetention,
    RetentionCandidate,
    RetentionPlan,
    RetentionTypeSummary,
    RetentionVictim,
} from '../ai-analytics-retention.policy';

/** Статус запуска ретенции. */
export const RETENTION_RUN_STATUSES = {
    /** Только посчитано (dryRun = true). */
    planned: 'planned',
    /** Записи плана удалены. */
    deleted: 'deleted',
    /** Запрошено удаление, но сервис записей ais сервису ретенции не дан. */
    deleteNotAvailable: 'delete-not-available',
} as const;
export type RetentionRunStatus =
    (typeof RETENTION_RUN_STATUSES)[keyof typeof RETENTION_RUN_STATUSES];

/** Ответ ручки `POST admin/ai-analytics/retention/run`. */
export interface RetentionRunResult {
    domain: string;
    dryRun: boolean;
    status: RetentionRunStatus;
    /** Момент расчёта, ISO (UTC). */
    checkedAt: string;
    /** Просмотрено записей окна. */
    scanned: number;
    /** Записей под удаление по политике. */
    total: number;
    /** Фактически удалено (пока всегда 0 — delete недоступен). */
    deleted: number;
    byType: RetentionTypeSummary[];
    /** Примеры записей под удаление (не больше sampleLimit). */
    sample: RetentionVictim[];
    /** Одна строка сводки — она же уходит в чат админов. */
    summary: string;
}

export interface RetentionRunOptions {
    domain: string;
    /** Считать, не удаляя (по умолчанию true). */
    dryRun?: boolean;
    /** Момент отсчёта сроков; по умолчанию «сейчас». */
    now?: Date;
    /** Сколько примеров вернуть в ответе (по умолчанию 20). */
    sampleLimit?: number;
    /** Верхняя граница читаемых записей окна (по умолчанию 5000). */
    readLimit?: number;
}

/** Умолчания запуска ретенции. */
export const AI_ANALYTICS_RETENTION_DEFAULTS = {
    dryRun: true,
    sampleLimit: 20,
    readLimit: 5000,
} as const;

@Injectable()
export class AiAnalyticsRetentionService {
    private readonly logger = new Logger(AiAnalyticsRetentionService.name);

    constructor(
        private readonly store: AiAnalyticsAdminSnapshotStore,
        @Optional() private readonly ai?: AiService,
        @Optional() private readonly telegram?: TelegramService,
    ) {}

    /** Считает план ретенции домена; при dryRun = false ещё и уведомляет. */
    async run(options: RetentionRunOptions): Promise<RetentionRunResult> {
        const now = options.now ?? new Date();
        const dryRun = options.dryRun ?? AI_ANALYTICS_RETENTION_DEFAULTS.dryRun;
        const sampleLimit =
            options.sampleLimit ?? AI_ANALYTICS_RETENTION_DEFAULTS.sampleLimit;
        const plan = await this.plan(options, now);
        const { status, deleted } = await this.apply(plan, dryRun);
        const summary = renderSummary(options.domain, plan, dryRun, status);
        const result: RetentionRunResult = {
            domain: options.domain,
            dryRun,
            status,
            checkedAt: now.toISOString(),
            scanned: plan.scanned,
            total: plan.total,
            deleted,
            byType: plan.byType,
            sample: plan.victims.slice(0, Math.max(sampleLimit, 0)),
            summary,
        };
        this.logger.log(summary);
        if (!dryRun) await this.notify(summary);
        return result;
    }

    /**
     * Исполнение плана: при `dryRun` ничего не трогаем; иначе удаляем
     * записи по id. Сервиса записей нет — честный `delete-not-available`.
     */
    private async apply(
        plan: RetentionPlan,
        dryRun: boolean,
    ): Promise<{ status: RetentionRunStatus; deleted: number }> {
        if (dryRun) {
            return { status: RETENTION_RUN_STATUSES.planned, deleted: 0 };
        }
        if (!this.ai) {
            return {
                status: RETENTION_RUN_STATUSES.deleteNotAvailable,
                deleted: 0,
            };
        }
        const deleted = plan.victims.length
            ? await this.ai.deleteByIds(plan.victims.map(victim => victim.id))
            : 0;
        return { status: RETENTION_RUN_STATUSES.deleted, deleted };
    }

    /** Кандидаты домена → план политики (чистая функция). */
    async plan(
        options: RetentionRunOptions,
        now: Date,
    ): Promise<RetentionPlan> {
        const records = await this.store.readRaw(
            options.domain,
            AI_ANALYTICS_SNAPSHOT_TYPES,
            {
                limit:
                    options.readLimit ??
                    AI_ANALYTICS_RETENTION_DEFAULTS.readLimit,
            },
            now,
        );
        const candidates = records.flatMap(record => toCandidate(record));
        return planRetention(candidates, { now });
    }

    /** Одна строка в чат админов (решение В8); отказ канала не роняет ручку. */
    private async notify(summary: string): Promise<void> {
        if (!this.telegram) return;
        try {
            await this.telegram.sendMessage(summary);
        } catch (error) {
            this.logger.warn(
                `Ретенция: сообщение в чат админов не ушло: ${(error as Error).message}`,
            );
        }
    }
}

function toCandidate(record: {
    id: string;
    type: string;
    periodKey: string;
    managerId: string | null;
    status: string;
    createdAt: Date;
}): RetentionCandidate[] {
    if (!isAiAnalyticsSnapshotType(record.type)) return [];
    return [
        {
            id: record.id,
            type: record.type,
            periodKey: record.periodKey,
            managerId: record.managerId,
            status: record.status,
            createdAt: record.createdAt,
        },
    ];
}

/** Строка сводки: домен, режим, просмотрено/под удаление и топ типов. */
export function renderSummary(
    domain: string,
    plan: RetentionPlan,
    dryRun: boolean,
    status: RetentionRunStatus,
): string {
    const top = [...plan.byType]
        .filter(entry => entry.victims > 0)
        .sort((a, b) => b.victims - a.victims)
        .slice(0, 5)
        .map(entry => `${entry.type} ${entry.victims}`)
        .join(', ');
    const mode = dryRun ? 'расчёт (dryRun)' : `запуск (${status})`;
    return (
        `Ретенция AI-аналитики ${domain}: ${mode}; ` +
        `просмотрено ${plan.scanned}, под удаление ${plan.total}` +
        (top ? `; по типам: ${top}` : '')
    );
}
