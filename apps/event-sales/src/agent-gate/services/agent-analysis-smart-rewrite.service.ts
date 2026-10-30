import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { AiService, TranscriptionStoreService } from '@lib/call-lib';
import { CallReportSmartResolverService } from '@lib/call-lib/call-report/services/call-report-smart-resolver.service';
import { CallReportSmartWriterService } from '@lib/call-lib/call-report/services/call-report-smart-writer.service';
import { CallReportDealFamilyService } from '@lib/call-lib/call-report/services/call-report-deal-family.service';
import { CallReportDealVerifyService } from '@lib/call-lib/call-report/services/call-report-deal-verify.service';
import { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';
import {
    durationSecOf,
    prepareAgentAnalysis,
} from './agent-analysis-prepare.util';
import { AgentAnalysisSmartInputAssembler } from './agent-analysis-smart-input.assembler';

/** Имя аналитика, если запись его не сохранила (внутренний конвейер). */
const DEFAULT_AGENT_NAME = 'call-report-analyzer';

/** Запись ais разбора в объёме, нужном дописыванию полей карточки. */
export interface AgentAnalysisRewriteSource {
    id: string;
    transcription_id: string | null;
    /** Разбор, как его сохранил приём (dto + agentName). */
    user_result: unknown;
    provider?: string | null;
}

/** Чем кончилось дописывание одной карточки. */
export type AgentAnalysisRewriteOutcome =
    | { kind: 'written'; itemId: number }
    /** Элемента по активности на портале нет (удалён) — создавать нельзя. */
    | { kind: 'itemMissing' }
    /** Смарт «AI-анализ звонков» на портале не установлен. */
    | { kind: 'smartMissing' }
    /** В записи нет разбора или транскрипции. */
    | { kind: 'noPayload' }
    | { kind: 'failed'; error: string; itemId: number | null };

/** Разбор из user_result записи; чужая форма — null. */
export function analysisOfRecord(
    value: unknown,
): (AgentCallAnalysisDto & { agentName?: string }) | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }
    return value as AgentCallAnalysisDto & { agentName?: string };
}

/**
 * Дописывание полей СУЩЕСТВУЮЩЕГО элемента смарта по записи ais без
 * вызова модели: разбор уже в БД, его достаточно разложить по полям так же,
 * как это делает приём (общая сборка AgentAnalysisSmartInputAssembler).
 * Элемент ищется по xmlId активности; новый элемент не создаётся никогда
 * (прод-урок ревизора 16.08.2026 — пустые карточки). Успех отмечается в
 * ais: in_report = true. Таймлайн элемента не трогается — диалог и разделы
 * там с момента приёма, writer допостит только выброшенные по лимиту
 * строки тексты полей.
 *
 * `@Injectable` без bitrix-состояния: инстанс берётся у PBXService на вызов.
 */
@Injectable()
export class AgentAnalysisSmartRewriteService {
    private readonly logger = new Logger(AgentAnalysisSmartRewriteService.name);

    constructor(
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly aiService: AiService,
        private readonly pbxService: PBXService,
        private readonly smartResolver: CallReportSmartResolverService,
        private readonly dealFamily: CallReportDealFamilyService,
        private readonly dealVerify: CallReportDealVerifyService,
    ) {}

    async rewrite(
        record: AgentAnalysisRewriteSource,
    ): Promise<AgentAnalysisRewriteOutcome> {
        const stored = analysisOfRecord(record.user_result);
        if (stored === null || !record.transcription_id) {
            return { kind: 'noPayload' };
        }
        const row = await this.transcriptionStore.findPipelineById(
            record.transcription_id,
        );
        if (!row.domain) {
            return {
                kind: 'failed',
                error: `у транскрипции ${row.id} нет домена`,
                itemId: null,
            };
        }
        const smartInfo = await this.smartResolver.resolve(row.domain);
        if (!smartInfo) return { kind: 'smartMissing' };

        const agentName =
            stored.agentName ?? record.provider ?? DEFAULT_AGENT_NAME;
        // Та же подготовка, что у приёма: нормализация, схлопывание дублей
        // разделов, таймкоды цитат — старые записи получают свежие правила.
        const dto = prepareAgentAnalysis(
            row.id,
            agentName,
            stored,
            durationSecOf(row),
            this.logger,
        );
        const { bitrix } = await this.pbxService.init(row.domain);
        const writer = new CallReportSmartWriterService(bitrix, smartInfo);
        const { input } = await new AgentAnalysisSmartInputAssembler(
            bitrix,
            this.logger,
            {
                aiService: this.aiService,
                dealFamily: this.dealFamily,
                dealVerify: this.dealVerify,
            },
        ).assemble(row.domain, row, agentName, dto);

        // Диалог в таймлайне элемента уже есть с приёма — транскрипт,
        // выброшенный из полей по лимиту строки, второй раз не постится.
        const itemId = await writer.updateExisting({
            ...input,
            transcriptInTimeline: true,
        });
        if (itemId === null) return { kind: 'itemMissing' };
        const failure = writer.lastUpdateFailure;
        if (failure !== null) {
            return { kind: 'failed', error: failure, itemId };
        }
        await this.aiService.update(record.id, {
            in_report: true,
            report_item_id: String(itemId),
        });
        return { kind: 'written', itemId };
    }
}
