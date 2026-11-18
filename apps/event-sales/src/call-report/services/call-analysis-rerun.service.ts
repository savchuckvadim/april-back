/**
 * Повторный фокус-разбор уже разобранного звонка — общий шаг test-retest
 * (CallReportRetestUseCase) и переразбора истории
 * (CallReportReanalyzeUseCase): вход тот же, что у штатного конвейера —
 * расшифровка с таймкодами (П6), паспорт звонка тем же построителем, тип
 * звонка из старой записи (приор классификатора, как видел его конвейер) и
 * модель портала. Расход модели считается в колонки ais по цене портала.
 *
 * В Битрикс не пишет и записей ais не создаёт — это делает вызывающий
 * use-case (разные типы записей и правила замещения).
 * `@Injectable` без bitrix-состояния.
 */
import { Injectable } from '@nestjs/common';
import {
    renderTranscriptWithTimecodes,
    TranscriptionStoreService,
    type TranscriptionPipelineView,
} from '@lib/call-lib';
import type { AgentCallAnalysisDto } from '../../agent-gate/dto/agent-analysis-request.dto';
import {
    analysisUsageColumns,
    type AnalysisUsageColumns,
} from '../../agent-gate/services/agent-analysis-usage.util';
import { LlmPriceResolverService } from '../../agent-gate/services/llm-price-resolver.service';
import { CallContextBuilderService } from './call-context-builder.service';
import { CallFocusAnalysisService } from './call-focus-analysis.service';
import type { StoredFocusPasses } from './call-focus-stored.util';

export interface CallAnalysisRerunInput {
    transcriptionId: string;
    /** user_result старой записи разбора — источник типа звонка. */
    source: unknown;
    /** Модель глубокого разбора портала; null — модель провайдера по умолчанию. */
    model: string | null;
    /**
     * Сохранённые ответы проходов неполного разбора (догон): эти проходы
     * заново не вызываются. Не задано — разбор целиком.
     */
    stored?: StoredFocusPasses;
    /**
     * Задание с цитатами (focus-v3.4) — проверка разбора на звонке включает
     * его явно; не задано — по выключателю.
     */
    quoteEvidence?: boolean;
}

export interface CallAnalysisRerunOutcome {
    row: TranscriptionPipelineView;
    /** Сырой ответ фокус-разбора (без нормализации приёма). */
    dto: AgentCallAnalysisDto;
    /** Колонки расхода ais (tokens_count / price); без учёта — пусто. */
    usage: AnalysisUsageColumns;
}

/**
 * Тип звонка для повторного прогона: приор классификатора, который видел
 * штатный конвейер (`classifierCallType`), иначе итоговый `callType`.
 */
export function callTypeOfAnalysis(source: unknown): string | null {
    if (typeof source !== 'object' || source === null) return null;
    const record = source as Record<string, unknown>;
    if (typeof record.classifierCallType === 'string') {
        return record.classifierCallType;
    }
    return typeof record.callType === 'string' ? record.callType : null;
}

@Injectable()
export class CallAnalysisRerunService {
    constructor(
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly focusAnalysis: CallFocusAnalysisService,
        private readonly contextBuilder: CallContextBuilderService,
        private readonly llmPrice: LlmPriceResolverService,
    ) {}

    /**
     * Повтор разбора; null — пустая расшифровка или модель не ответила.
     * Ошибки хранилища/модели пробрасываются — вызывающий решает, как
     * считать сбой.
     */
    async rerun(
        input: CallAnalysisRerunInput,
    ): Promise<CallAnalysisRerunOutcome | null> {
        const row = await this.transcriptionStore.findPipelineById(
            input.transcriptionId,
        );
        const transcript =
            renderTranscriptWithTimecodes(row.segments ?? []) ||
            (row.text ?? '');
        if (!transcript.trim()) return null;
        const domain = row.domain as string;
        // Без модели портала и без сохранённых проходов опции не передаются.
        const hasOptions =
            input.model !== null ||
            input.stored !== undefined ||
            input.quoteEvidence !== undefined;
        const dto = await this.focusAnalysis.run(
            domain,
            transcript,
            callTypeOfAnalysis(input.source),
            await this.passportBlock(row),
            hasOptions
                ? {
                      ...(input.model === null ? {} : { model: input.model }),
                      ...(input.stored ? { stored: input.stored } : {}),
                      ...(input.quoteEvidence === undefined
                          ? {}
                          : { quoteEvidence: input.quoteEvidence }),
                  }
                : undefined,
        );
        if (dto === null) return null;
        const usage = dto.usage
            ? analysisUsageColumns(
                  dto.usage,
                  await this.llmPrice.resolvePricing(domain),
              )
            : {};

        return { row, dto, usage };
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
