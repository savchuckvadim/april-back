import { Injectable, Logger } from '@nestjs/common';
import {
    AiService,
    TranscriptionStoreService,
    pickActiveAnalysis,
    renderTranscriptWithTimecodes,
    type TranscriptionPipelineView,
} from '@lib/call-lib';
import {
    MethodologyPreviewStore,
    methodologyVersionTag,
    parseMethodology,
    queuedMethodologyPreview,
    type MethodologyPreviewJobData,
    type MethodologyPreviewResult,
    type MethodologyPreviewState,
    type ResolvedMethodology,
} from '@lib/call-lib/call-report/methodology';
import type { AgentCallAnalysisDto } from '../../agent-gate/dto/agent-analysis-request.dto';
import { callTypeOfAnalysis } from '../services/call-analysis-rerun.service';
import { CallContextBuilderService } from '../services/call-context-builder.service';
import { CallFocusAnalysisService } from '../services/call-focus-analysis.service';
import { CallReportSettingsService } from '../services/call-report-settings.service';
import {
    MethodologyPreviewError,
    buildMethodologyPreviewResult,
} from './methodology-preview.util';

/**
 * Проверка черновика методики на одном готовом звонке (этап 6.6): один
 * проход методики по черновику с тем же контекстом, что у штатного разбора,
 * и расчёт пунктов и ограничителей поверх действующего разбора.
 *
 * Ничего не сохраняет: записей ais не создаёт, Битрикс не трогает, оценки
 * звонка не меняет — итог лежит час в Redis и читается админкой. Отказ не
 * бросается наружу: причина пишется в состояние, повторять задание незачем.
 * `@Injectable` без bitrix-состояния.
 */
@Injectable()
export class MethodologyPreviewUseCase {
    private readonly logger = new Logger(MethodologyPreviewUseCase.name);

    constructor(
        private readonly store: MethodologyPreviewStore,
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly aiService: AiService,
        private readonly focusAnalysis: CallFocusAnalysisService,
        private readonly contextBuilder: CallContextBuilderService,
        private readonly settingsService: CallReportSettingsService,
    ) {}

    async execute(
        data: MethodologyPreviewJobData,
    ): Promise<MethodologyPreviewState> {
        const base = queuedMethodologyPreview(data, new Date());
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
                error instanceof MethodologyPreviewError
                    ? error.message
                    : `Проверка не выполнена: ${(error as Error).message}`;
            this.logger.warn(
                `Проверка черновика методики (${data.domain}, расшифровка ${data.transcriptionId}): ${message}`,
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
        data: MethodologyPreviewJobData,
    ): Promise<MethodologyPreviewResult> {
        const parsed = parseMethodology(data.config);
        if (!parsed.ok) {
            throw new MethodologyPreviewError(
                `Черновик не проходит проверку: ${parsed.errors.join('; ')}`,
            );
        }
        const resolved: ResolvedMethodology = {
            methodology: parsed.value,
            scope: 'portal',
            source: 'table',
            versionTag: methodologyVersionTag(parsed.value),
        };

        const row = await this.rowOf(data);
        const transcript =
            renderTranscriptWithTimecodes(row.segments ?? []) ||
            (row.text ?? '');
        if (!transcript.trim()) {
            throw new MethodologyPreviewError(
                'У этого звонка нет расшифровки — проверять не на чем.',
            );
        }
        const active = pickActiveAnalysis(
            await this.aiService.findByTranscriptionIds([row.id]),
        );
        if (!active?.user_result) {
            throw new MethodologyPreviewError(
                'Звонок ещё не разобран: проверка идёт поверх готового разбора. Выберите разобранный звонок.',
            );
        }
        const callType = callTypeOfAnalysis(active.user_result);
        const settings = await this.settingsService.resolve(data.domain);
        const outcome = await this.focusAnalysis.runMethodologyPass(
            data.domain,
            transcript,
            callType,
            resolved,
            await this.passportBlock(row),
            settings.deepAnalysisModel
                ? { model: settings.deepAnalysisModel }
                : undefined,
        );
        // Копия: действующий разбор звонка проверка не меняет.
        const analysis = JSON.parse(
            JSON.stringify(active.user_result),
        ) as AgentCallAnalysisDto;
        return buildMethodologyPreviewResult(
            analysis,
            callType,
            resolved,
            outcome,
        );
    }

    /** Расшифровка звонка — только своего портала. */
    private async rowOf(
        data: MethodologyPreviewJobData,
    ): Promise<TranscriptionPipelineView> {
        let row: TranscriptionPipelineView;
        try {
            row = await this.transcriptionStore.findPipelineById(
                data.transcriptionId,
            );
        } catch {
            throw new MethodologyPreviewError(
                `Расшифровка № ${data.transcriptionId} не найдена.`,
            );
        }
        if (row.domain !== data.domain) {
            throw new MethodologyPreviewError(
                `Расшифровка № ${data.transcriptionId} относится к другому порталу.`,
            );
        }
        return row;
    }

    /** Паспорт звонка тем же построителем, что у штатного разбора; сбой — без паспорта. */
    private async passportBlock(
        row: TranscriptionPipelineView,
    ): Promise<string | undefined> {
        try {
            const passport = await this.contextBuilder.build(row);

            return this.contextBuilder.renderForPrompt(passport) || undefined;
        } catch {
            return undefined;
        }
    }
}
