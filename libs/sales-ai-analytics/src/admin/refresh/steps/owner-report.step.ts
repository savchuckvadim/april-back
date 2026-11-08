import { Injectable } from '@nestjs/common';
import { AiOwnerReportExportService } from '../../services/ai-owner-report-export.service';
import type { AiRefreshStepOutcome } from '../refresh.types';
import {
    errorOutcome,
    type AiRefreshStepContext,
    type AiRefreshStepHandler,
} from './refresh-step.types';

const MONTH_KIND = 'month' as const;
const KB = 1024;

/**
 * PDF отчёта собственнику за месяц сценария — заново (forceRefresh), чтобы
 * отчёт видел переразбор и пересчёт. Файл живёт сутки в Redis; скачать —
 * карточкой «Отчёт собственнику: PDF». Клиенту ничего не уходит.
 */
@Injectable()
export class AiRefreshOwnerReportStep implements AiRefreshStepHandler {
    readonly code = 'owner-report' as const;

    constructor(private readonly exporter: AiOwnerReportExportService) {}

    async start({
        scenario,
        now,
    }: AiRefreshStepContext): Promise<AiRefreshStepOutcome> {
        try {
            await this.exporter.start(
                {
                    domain: scenario.domain,
                    kind: MONTH_KIND,
                    periodKey: scenario.monthKey,
                    forceRefresh: true,
                    ...(scenario.requestedBy
                        ? { requestedBy: scenario.requestedBy }
                        : {}),
                },
                now,
            );
            return {
                state: 'running',
                text: 'Собираю PDF отчёта собственнику…',
            };
        } catch (error) {
            return errorOutcome('PDF не поставлен', error);
        }
    }

    async probe({
        scenario,
    }: AiRefreshStepContext): Promise<AiRefreshStepOutcome> {
        try {
            const state = await this.exporter.state({
                domain: scenario.domain,
                kind: MONTH_KIND,
                periodKey: scenario.monthKey,
            });
            if (state === null) {
                return {
                    state: 'error',
                    text: 'Состояние выгрузки PDF пропало — сформируйте отчёт кнопкой в карточке.',
                };
            }
            if (state.status === 'ready') {
                const size = state.sizeBytes
                    ? `, ${Math.max(1, Math.round(state.sizeBytes / KB))} КБ`
                    : '';
                return {
                    state: 'done',
                    text: `PDF готов${size}: скачать — в карточке «Отчёт собственнику: PDF» (хранится сутки).`,
                };
            }
            if (state.status === 'error') {
                return {
                    state: 'error',
                    text: `PDF не собрался: ${state.message ?? 'причина не указана'}`,
                };
            }
            return {
                state: 'running',
                text: 'Собираю PDF отчёта собственнику…',
            };
        } catch (error) {
            return errorOutcome('Состояние PDF не прочитано', error);
        }
    }
}
