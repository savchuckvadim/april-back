import { Injectable, Logger } from '@nestjs/common';
import {
    normalizeClientPortal,
    planDialogHistory,
} from '../domain/support-dialog-history';
import {
    SupportDialogStats,
    summarizeDialogHistory,
} from '../domain/support-dialog-stats';
import {
    isSupportHistoryTableMissing,
    SupportDialogHistoryRepository,
} from '../infrastructure/support-dialog-history.repository';
import type { SupportMonitorRunReport } from './support-monitor.report';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Сколько последних обращений отдавать в сводке портала. */
const RECENT_LIMIT = 10;
/** Предупреждение о недоступной истории — не чаще раза в час. */
const WARN_EVERY_MS = 60 * 60 * 1000;

export const SUPPORT_HISTORY_TABLE_MISSING =
    'История обращений ещё не ведётся: таблица support_dialogs не создана ' +
    '(миграция online 2026_11_08_120000 не применена).';

/** Статистика обращений портала-клиента для админки. */
export interface SupportDialogStatsResult extends SupportDialogStats {
    /** false — истории нет (таблица не создана), цифры пустые. */
    available: boolean;
    reason: string | null;
    clientPortal: string;
    days: number;
    /** С какого момента монитор ведёт учёт; null — ещё ни одной записи. */
    trackedSince: Date | null;
}

/**
 * История обращений линии поддержки: запись тактов крона и сводка по
 * порталу-клиенту. Запись — по возможности: статистика не должна мешать
 * оповещениям, поэтому ошибки БД здесь только в журнал.
 */
@Injectable()
export class SupportDialogHistoryService {
    private readonly logger = new Logger(SupportDialogHistoryService.name);
    private warnedAt = 0;

    constructor(private readonly repository: SupportDialogHistoryRepository) {}

    /** Отметить такт: открытые диалоги — в историю, пропавшие — закрыть. */
    async record(report: SupportMonitorRunReport, now: Date): Promise<void> {
        try {
            const known = await this.repository.findKnown(
                report.domain,
                report.dialogs.map(dialog => dialog.sessionId),
            );
            const plan = planDialogHistory(
                known,
                report.dialogs,
                now,
                report.warnings.length === 0,
            );
            await this.repository.apply(report.domain, plan, now);
        } catch (error) {
            this.warn(error, now);
        }
    }

    async stats(
        clientPortal: string,
        days: number,
        now: Date = new Date(),
    ): Promise<SupportDialogStatsResult> {
        const portal = normalizeClientPortal(clientPortal) ?? '';
        const base = { clientPortal: portal, days };
        try {
            const [rows, trackedSince] = await Promise.all([
                this.repository.findByClientPortal(
                    portal,
                    new Date(now.getTime() - days * DAY_MS),
                ),
                this.repository.trackedSince(),
            ]);
            return {
                ...base,
                available: true,
                reason: null,
                trackedSince,
                ...summarizeDialogHistory(rows, RECENT_LIMIT),
            };
        } catch (error) {
            if (!isSupportHistoryTableMissing(error)) throw error;
            return {
                ...base,
                available: false,
                reason: SUPPORT_HISTORY_TABLE_MISSING,
                trackedSince: null,
                ...summarizeDialogHistory([], RECENT_LIMIT),
            };
        }
    }

    private warn(error: unknown, now: Date): void {
        if (now.getTime() - this.warnedAt < WARN_EVERY_MS) return;
        this.warnedAt = now.getTime();
        this.logger.warn(
            isSupportHistoryTableMissing(error)
                ? SUPPORT_HISTORY_TABLE_MISSING
                : `История обращений не записана: ${(error as Error).message}`,
        );
    }
}
