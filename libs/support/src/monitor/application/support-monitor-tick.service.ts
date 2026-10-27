import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import {
    SupportDecision,
    SupportDialog,
    SupportDialogMemory,
    SupportSignal,
} from '../domain/support-dialog.types';
import {
    decideSupportDialog,
    isSameMemory,
} from '../domain/support-signal.rules';
import { SupportLineReader } from '../infrastructure/support-line.reader';
import {
    SupportMemoryMode,
    SupportMonitorStore,
} from '../infrastructure/support-monitor.store';
import { SupportMonitorOptions } from './support-monitor-options';
import {
    formatRunSummary,
    SupportMonitorRunReport,
    SupportSignalReport,
    toDialogReport,
} from './support-monitor.report';
import {
    SUPPORT_NOT_SENT,
    SupportSignalDispatcher,
    toSignalReport,
} from './support-signal.dispatcher';

/** Что решено по линии за один просмотр. */
interface SupportEvaluation {
    dialogs: SupportDialog[];
    decisions: Map<number, SupportDecision>;
    memories: Map<number, SupportDialogMemory>;
    warnings: string[];
}

const memoryModeOf = (options: SupportMonitorOptions): SupportMemoryMode =>
    options.dryRun ? 'dry' : 'live';

/**
 * Один такт мониторинга линии: прочитать → решить → разослать → запомнить.
 *
 * Инстанс Битрикса портала линии берётся per-call через PBXService и в
 * `this` не хранится: race condition между порталами исключён (CLAUDE.md).
 */
@Injectable()
export class SupportMonitorTickService {
    private readonly logger = new Logger(SupportMonitorTickService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly store: SupportMonitorStore,
        private readonly dispatcher: SupportSignalDispatcher,
    ) {}

    /** Боевой такт крона. «Только считать» — разбор и журнал без отправки. */
    async run(
        domain: string,
        options: SupportMonitorOptions,
        now: Date = new Date(),
    ): Promise<SupportMonitorRunReport> {
        const mode = memoryModeOf(options);
        const evaluation = await this.evaluate(domain, options, now);
        const hasSignals = evaluation.dialogs.some(
            dialog => evaluation.decisions.get(dialog.sessionId)?.signal,
        );
        const channels =
            hasSignals && !options.dryRun
                ? await this.dispatcher.openChannels(
                      options,
                      evaluation.warnings,
                  )
                : null;

        const signals: SupportSignalReport[] = [];
        for (const dialog of evaluation.dialogs) {
            const decision = evaluation.decisions.get(dialog.sessionId);
            if (!decision) continue;
            const previous = evaluation.memories.get(dialog.sessionId) ?? null;
            if (!decision.signal) {
                if (!isSameMemory(previous, decision.memory)) {
                    await this.store.saveMemory(
                        mode,
                        domain,
                        dialog.sessionId,
                        decision.memory,
                    );
                }
                continue;
            }
            // Пробный прогон запоминает «как будто разослал»: в журнале каждое
            // событие видно один раз, как оно и пришло бы людям.
            const report = channels
                ? await this.dispatcher.dispatch(
                      decision.signal,
                      domain,
                      options,
                      channels,
                  )
                : toSignalReport(decision.signal, domain, {
                      ...SUPPORT_NOT_SENT,
                      remembered: options.dryRun,
                  });
            if (report.remembered) {
                await this.store.saveMemory(
                    mode,
                    domain,
                    dialog.sessionId,
                    decision.memory,
                );
            }
            signals.push(report);
        }

        const result = this.reportOf(domain, options, evaluation, signals, now);
        this.log(result);
        return result;
    }

    /**
     * Предпросмотр для админки: что ушло бы сейчас при текущей памяти
     * крона. Ничего не отправляет и не запоминает.
     */
    async preview(
        domain: string,
        options: SupportMonitorOptions,
        now: Date = new Date(),
    ): Promise<SupportMonitorRunReport> {
        const evaluation = await this.evaluate(domain, options, now);
        const signals = evaluation.dialogs
            .map(dialog => evaluation.decisions.get(dialog.sessionId)?.signal)
            .filter((signal): signal is SupportSignal => Boolean(signal))
            .map(signal => toSignalReport(signal, domain));
        return this.reportOf(domain, options, evaluation, signals, now);
    }

    private async evaluate(
        domain: string,
        options: SupportMonitorOptions,
        now: Date,
    ): Promise<SupportEvaluation> {
        const { bitrix } = await this.pbx.initWebhook(domain);
        const { dialogs, warnings } = await new SupportLineReader(
            bitrix,
        ).readOpenDialogs({ lineId: options.lineId, now });
        const memories = await this.store.loadMemories(
            memoryModeOf(options),
            domain,
            dialogs.map(dialog => dialog.sessionId),
        );
        const decisions = new Map<number, SupportDecision>(
            dialogs.map(dialog => [
                dialog.sessionId,
                decideSupportDialog(
                    dialog,
                    memories.get(dialog.sessionId) ?? null,
                    now,
                    options.thresholds,
                ),
            ]),
        );
        return { dialogs, decisions, memories, warnings };
    }

    private reportOf(
        domain: string,
        options: SupportMonitorOptions,
        evaluation: SupportEvaluation,
        signals: SupportSignalReport[],
        now: Date,
    ): SupportMonitorRunReport {
        return {
            domain,
            dryRun: options.dryRun,
            dialogs: evaluation.dialogs.map(dialog =>
                toDialogReport(dialog, domain, now),
            ),
            signals,
            warnings: evaluation.warnings,
        };
    }

    private log(report: SupportMonitorRunReport): void {
        if (!report.signals.length && !report.warnings.length) {
            this.logger.debug(formatRunSummary(report));
            return;
        }
        this.logger.log(formatRunSummary(report));
        for (const signal of report.signals) {
            const delivery = report.dryRun
                ? 'только считать, не отправлено'
                : `колокольчиков ${signal.bellDelivered}, Telegram ${signal.telegramDelivered ? 'да' : 'нет'}` +
                  (signal.remembered
                      ? ''
                      : ' — НЕ доставлено, повторим в следующий просмотр');
            this.logger.log(
                `Поддержка ${report.domain}: ${signal.kind} по диалогу ${signal.sessionId}, ${delivery}\n${signal.telegramText}`,
            );
        }
    }
}
