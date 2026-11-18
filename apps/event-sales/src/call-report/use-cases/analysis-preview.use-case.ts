import { Injectable, Logger } from '@nestjs/common';
import {
    AiService,
    TranscriptionStoreService,
    pickActiveAnalysis,
    type TranscriptionPipelineView,
} from '@lib/call-lib';
import {
    AnalysisPreviewStore,
    queuedAnalysisPreview,
    type AnalysisPreviewJobData,
    type AnalysisPreviewResult,
    type AnalysisPreviewState,
} from '@lib/call-lib/call-report/analysis-preview';
import {
    durationSecOf,
    prepareAgentAnalysis,
} from '../../agent-gate/services/agent-analysis-prepare.util';
import { promptVersionFor } from '../contracts/call-report-versions.const';
import {
    CallAnalysisRerunService,
    callTypeOfAnalysis,
} from '../services/call-analysis-rerun.service';
import { CallReportSettingsService } from '../services/call-report-settings.service';
import {
    AnalysisPreviewError,
    buildAnalysisPreviewResult,
} from './analysis-preview.util';

/** Имя «агента» проверочного разбора — в журналах приёма. */
const PREVIEW_AGENT = 'analysis-preview';

/**
 * Проверка разбора на одном звонке (задание focus-v3.4, проект
 * ai/tasks/2026-11-18-quotes-seconds-design.md, §10): фокус-разбор с
 * цитатами по уже разобранному звонку — тем же входом, что у переразбора
 * (расшифровка с метками, паспорт, тип звонка, модель портала), и тот же
 * приём разбора (prepareAgentAnalysis). Итог — места разбора в разговоре и
 * оценки «сейчас → по проверке».
 *
 * Ничего не сохраняет: записей ais не создаёт, Битрикс24 не трогает, оценки
 * звонка не меняет — итог лежит час в Redis и читается админкой. Отказ не
 * бросается наружу: причина пишется в состояние. `@Injectable` без
 * bitrix-состояния.
 */
@Injectable()
export class AnalysisPreviewUseCase {
    private readonly logger = new Logger(AnalysisPreviewUseCase.name);

    constructor(
        private readonly store: AnalysisPreviewStore,
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly aiService: AiService,
        private readonly rerun: CallAnalysisRerunService,
        private readonly settingsService: CallReportSettingsService,
    ) {}

    async execute(data: AnalysisPreviewJobData): Promise<AnalysisPreviewState> {
        const base = queuedAnalysisPreview(data, new Date());
        await this.store.write({ ...base, status: 'running' });
        try {
            const result = await this.compute(data);
            return await this.store.write({
                ...base,
                status: 'done',
                result,
                updatedAt: new Date().toISOString(),
            });
        } catch (error) {
            const message =
                error instanceof AnalysisPreviewError
                    ? error.message
                    : `Проверка не выполнена: ${(error as Error).message}`;
            this.logger.warn(
                `Проверка разбора на звонке (${data.domain}, расшифровка ${data.transcriptionId}): ${message}`,
            );
            return this.store.write({
                ...base,
                status: 'failed',
                error: message,
                updatedAt: new Date().toISOString(),
            });
        }
    }

    private async compute(
        data: AnalysisPreviewJobData,
    ): Promise<AnalysisPreviewResult> {
        const row = await this.rowOf(data);
        // Проверка идёт по разобранному звонку: из действующего разбора —
        // тип звонка (как у переразбора) и оценки для сравнения.
        const active = pickActiveAnalysis(
            await this.aiService.findByTranscriptionIds([row.id]),
        );
        if (!active?.user_result) {
            throw new AnalysisPreviewError(
                'Звонок ещё не разобран: проверка идёт по разобранному звонку. Выберите разобранный звонок.',
            );
        }
        const settings = await this.settingsService.resolve(data.domain);
        const outcome = await this.rerun.rerun({
            transcriptionId: row.id,
            source: active.user_result,
            model: settings.deepAnalysisModel ?? null,
            quoteEvidence: true,
        });
        if (outcome === null) {
            throw new AnalysisPreviewError(
                'Разбор не собрался: расшифровка пустая или модель не ответила. Попробуйте позже.',
            );
        }
        const durationSec = durationSecOf(row);
        const dto = prepareAgentAnalysis(
            row.id,
            PREVIEW_AGENT,
            outcome.dto,
            durationSec,
            this.logger,
        );
        return buildAnalysisPreviewResult({
            dto,
            before: active.user_result,
            callType: callTypeOfAnalysis(active.user_result),
            durationSec,
            promptVersion: promptVersionFor(true),
        });
    }

    /** Расшифровка звонка — только своего портала. */
    private async rowOf(
        data: AnalysisPreviewJobData,
    ): Promise<TranscriptionPipelineView> {
        let row: TranscriptionPipelineView;
        try {
            row = await this.transcriptionStore.findPipelineById(
                data.transcriptionId,
            );
        } catch {
            throw new AnalysisPreviewError(
                `Расшифровка № ${data.transcriptionId} не найдена.`,
            );
        }
        if (row.domain !== data.domain) {
            throw new AnalysisPreviewError(
                `Расшифровка № ${data.transcriptionId} относится к другому порталу.`,
            );
        }
        return row;
    }
}
