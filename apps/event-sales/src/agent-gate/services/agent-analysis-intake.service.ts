import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import {
    AiService,
    TranscriptionPipelineView,
    TranscriptionStoreService,
} from '@lib/call-lib';
import { CallReportSmartResolverService } from '@lib/call-lib/call-report/services/call-report-smart-resolver.service';
import { CallReportSmartWriterService } from '@lib/call-lib/call-report/services/call-report-smart-writer.service';
import { CallReportDealFamilyService } from '@lib/call-lib/call-report/services/call-report-deal-family.service';
import { CallReportDealVerifyService } from '@lib/call-lib/call-report/services/call-report-deal-verify.service';
import { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';
import { AgentAnalysisResponseDto } from '../dto/agent-response.dto';
import {
    AGENT_ANALYSIS_TYPE,
    CALL_CLASSIFY_TYPE,
} from './agent-call-package.service';
import {
    AgentAnalysisCrmContextLoader,
    callOwnerIds,
} from './agent-analysis-crm-context.loader';
import { SmartItemWriteResult } from './agent-analysis-intake.types';
import { AgentAnalysisLinkResolver } from './agent-analysis-link.resolver';
import {
    clampObjectionTimecodes,
    normalizeAgentAnalysis,
} from './agent-analysis-normalize.util';
import {
    buildAgentAnalysisRecord,
    buildAgentSmartItemInput,
    pickGigachatResults,
    resolveCallDirection,
} from './agent-analysis-smart-input.mapper';
import { AgentAnalysisTimelineWriter } from './agent-analysis-timeline.writer';

/**
 * Приём результата глубокого анализа от внешнего агента:
 * 1) запись анализа в ais (provider = имя агента по ключу);
 * 2) создание элемента смарт-процесса «AI-анализ звонков» со связями
 *    (сделка/компания/контакт) и всеми полями анализа;
 * 3) привязка элемента к ais (report_item_id, in_report).
 *
 * Если смарт не установлен на портале — анализ сохраняется только в БД
 * (graceful: конвейер не падает, клиент ставит смарт позже).
 *
 * Оркестратор (лимит файла): нормализация — agent-analysis-normalize,
 * CRM-контекст — crm-context.loader, связи — link.resolver, раскладка в
 * ais/поля — smart-input.mapper, таймлайны — timeline.writer.
 */
@Injectable()
export class AgentAnalysisIntakeService {
    private readonly logger = new Logger(AgentAnalysisIntakeService.name);

    constructor(
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly aiService: AiService,
        private readonly pbxService: PBXService,
        private readonly smartResolver: CallReportSmartResolverService,
        private readonly dealFamily: CallReportDealFamilyService,
        private readonly dealVerify: CallReportDealVerifyService,
    ) {}

    async intake(
        transcriptionId: string,
        agentName: string,
        dto: AgentCallAnalysisDto,
        allowedDomains: string[] | null = null,
    ): Promise<AgentAnalysisResponseDto> {
        dto = normalizeAgentAnalysis(
            transcriptionId,
            agentName,
            dto,
            this.logger,
        );
        const row =
            await this.transcriptionStore.findPipelineById(transcriptionId);
        if (!row.domain) {
            throw new NotFoundException(
                `У транскрипции ${transcriptionId} нет домена — пакет некорректен`,
            );
        }
        // Изоляция порталов: чужой звонок для этого ключа не существует.
        if (
            allowedDomains &&
            !allowedDomains.includes(row.domain.toLowerCase())
        ) {
            throw new NotFoundException(
                `Транскрипция ${transcriptionId} не найдена`,
            );
        }

        // Таймкоды цитат (П6) — только внутри длительности записи.
        dto = clampObjectionTimecodes(
            transcriptionId,
            dto,
            row.durationSec === null ? null : Number(row.durationSec),
            this.logger,
        );

        // Идемпотентность: ретрай push-back (потерянный ответ, повтор скилла)
        // не должен плодить дубликаты ais-записей и смарт-элементов.
        const records = await this.aiService.findByTranscriptionIds([row.id]);
        const existing = records.find(
            record => record.type === AGENT_ANALYSIS_TYPE,
        );
        if (existing) {
            return this.completeExisting(existing, row, agentName, dto);
        }

        // Кросс-валидация: расхождение типа звонка агента с дешёвым
        // классификатором конвейера — маркер качества обоих (копится в
        // user_result для мониторинга, поведение не меняет: тип агента —
        // финальный, он видел полный контекст).
        const classifierCallType =
            records.find(
                record => record.type === CALL_CLASSIFY_TYPE && record.result,
            )?.result ?? null;
        const classifierMismatch =
            classifierCallType !== null && classifierCallType !== dto.callType;
        if (classifierMismatch) {
            this.logger.log(
                `Тип звонка: классификатор=${classifierCallType}, агент=${dto.callType} (transcription ${row.id})`,
            );
        }

        const aiRecord = await this.aiService.create(
            buildAgentAnalysisRecord({
                row,
                agentName,
                dto,
                classifierCallType,
                classifierMismatch,
            }),
        );

        const written = await this.writeSmartItem(row, agentName, dto);
        if (written) {
            await this.attachSmartItem(String(aiRecord.id), row, written, dto);
        }
        await this.duplicateToTimeline(row, dto, written?.managerId).catch(
            error =>
                this.logger.warn(
                    `Дубль анализа в таймлайн не записан: ${(error as Error).message}`,
                ),
        );

        return {
            aiId: String(aiRecord.id),
            smartItemId: written?.itemId ?? null,
            smartInstalled: written !== null,
        };
    }

    /**
     * Повторный push-back по уже проанализированному звонку: новую ais-запись
     * не создаём; если смарт-элемента ещё нет (смарт не был установлен) —
     * доливаем его сейчас и привязываем к существующей записи.
     */
    private async completeExisting(
        existing: { id: string; report_item_id?: string | null },
        row: TranscriptionPipelineView,
        agentName: string,
        dto: AgentCallAnalysisDto,
    ): Promise<AgentAnalysisResponseDto> {
        if (existing.report_item_id) {
            this.logger.log(
                `Повторный push-back по транскрипции ${row.id} — возвращаю существующий анализ`,
            );
            return {
                aiId: String(existing.id),
                smartItemId: Number(existing.report_item_id),
                smartInstalled: true,
            };
        }

        const written = await this.writeSmartItem(row, agentName, dto);
        if (written) {
            await this.attachSmartItem(String(existing.id), row, written, dto);
        }
        return {
            aiId: String(existing.id),
            smartItemId: written?.itemId ?? null,
            smartInstalled: written !== null,
        };
    }

    /** Связка ais ↔ элемент и таймлайн элемента — общий хвост обеих веток. */
    private async attachSmartItem(
        aiId: string,
        row: TranscriptionPipelineView,
        written: SmartItemWriteResult,
        dto: AgentCallAnalysisDto,
    ): Promise<void> {
        await this.aiService
            .update(aiId, {
                report_item_id: String(written.itemId),
                in_report: true,
            })
            .catch(error =>
                this.logger.warn(
                    `ais.report_item_id не обновлён: ${(error as Error).message}`,
                ),
            );
        await this.writeSmartElementTimeline(row, written, dto).catch(error =>
            this.logger.warn(
                `Таймлайн смарт-элемента не записан: ${(error as Error).message}`,
            ),
        );
    }

    /** Создание смарт-элемента; null — смарт не установлен на портале. */
    private async writeSmartItem(
        row: TranscriptionPipelineView,
        agentName: string,
        dto: AgentCallAnalysisDto,
    ): Promise<SmartItemWriteResult | null> {
        const domain = row.domain as string;
        const smartInfo = await this.smartResolver.resolve(domain);
        if (!smartInfo) {
            this.logger.warn(
                `Смарт не установлен на ${domain} — анализ сохранён только в БД`,
            );
            return null;
        }

        const { bitrix } = await this.pbxService.init(domain);
        const writer = new CallReportSmartWriterService(bitrix, smartInfo);
        const loader = new AgentAnalysisCrmContextLoader(bitrix, this.logger);
        const links = new AgentAnalysisLinkResolver(
            this.dealFamily,
            this.dealVerify,
        );

        const gigachat = pickGigachatResults(
            await this.aiService.findByTranscriptionIds([row.id]),
        );
        const context = await loader.loadEntityContext(row);
        const activity = await loader.loadActivity(row);
        const { family, managerId } = await links.resolve(
            domain,
            row,
            context,
            dto,
        );

        try {
            const itemId = await writer.addItem(
                buildAgentSmartItemInput({
                    row,
                    rowLeadId: callOwnerIds(row).leadId,
                    family,
                    dealContext: { ...context, managerId },
                    callDirection: resolveCallDirection(activity),
                    gigachat,
                    agentName,
                    dto,
                }),
            );
            return { itemId, managerId, activity };
        } catch (error) {
            // { telegram: true } — форс-алерт админам (транспорт логгера)
            this.logger.error(
                `Смарт-элемент НЕ создан (${domain}, transcription ${row.id}): ${(error as Error).message}`,
                { telegram: true, domain, transcriptionId: row.id },
            );
            throw error;
        }
    }

    /** Таймлайн элемента — под тем же смартом и инстансом Битрикса домена. */
    private async writeSmartElementTimeline(
        row: TranscriptionPipelineView,
        written: SmartItemWriteResult,
        dto: AgentCallAnalysisDto,
    ): Promise<void> {
        const domain = row.domain as string;
        const smartInfo = await this.smartResolver.resolve(domain);
        if (!smartInfo) return;
        const { bitrix } = await this.pbxService.init(domain);
        await new AgentAnalysisTimelineWriter(
            bitrix,
            this.logger,
        ).writeSmartElement(smartInfo, row, written, dto);
    }

    /** Дубль разбора в таймлайн сущности-владельца звонка (сделка/лид). */
    private async duplicateToTimeline(
        row: TranscriptionPipelineView,
        dto: AgentCallAnalysisDto,
        managerId: number | undefined,
    ): Promise<void> {
        if (!row.domain || !row.entityId) return;
        const { bitrix } = await this.pbxService.init(row.domain);
        await new AgentAnalysisTimelineWriter(
            bitrix,
            this.logger,
        ).duplicateToEntity(row, dto, managerId);
    }
}
