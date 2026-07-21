import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { PBXService } from '@lib/pbx/pbx.service';
import {
    AiService,
    TranscriptionPipelineView,
    TranscriptionStoreService,
} from '@lib/call-lib';
import { CallReportSmartResolverService } from '../../call-report/services/call-report-smart-resolver.service';
import { CallReportSmartWriterService } from '../../call-report/services/call-report-smart-writer.service';
import { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';
import { AgentAnalysisResponseDto } from '../dto/agent-response.dto';
import { AGENT_ANALYSIS_TYPE } from './agent-call-package.service';

/**
 * Приём результата глубокого анализа от внешнего агента:
 * 1) запись анализа в ais (provider = имя агента по ключу);
 * 2) создание элемента смарт-процесса «AI-анализ звонков» со связями
 *    (сделка/компания/контакт) и всеми полями анализа;
 * 3) привязка элемента к ais (report_item_id, in_report).
 *
 * Если смарт не установлен на портале — анализ сохраняется только в БД
 * (graceful: конвейер не падает, клиент ставит смарт позже).
 */
@Injectable()
export class AgentAnalysisIntakeService {
    private readonly logger = new Logger(AgentAnalysisIntakeService.name);

    constructor(
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly aiService: AiService,
        private readonly pbxService: PBXService,
        private readonly smartResolver: CallReportSmartResolverService,
    ) {}

    async intake(
        transcriptionId: string,
        agentName: string,
        dto: AgentCallAnalysisDto,
    ): Promise<AgentAnalysisResponseDto> {
        const row =
            await this.transcriptionStore.findPipelineById(transcriptionId);
        if (!row.domain) {
            throw new NotFoundException(
                `У транскрипции ${transcriptionId} нет домена — пакет некорректен`,
            );
        }

        // Идемпотентность: ретрай push-back (потерянный ответ, повтор скилла)
        // не должен плодить дубликаты ais-записей и смарт-элементов.
        const existing = (
            await this.aiService.findByTranscriptionIds([row.id])
        ).find(record => record.type === AGENT_ANALYSIS_TYPE);
        if (existing) {
            return this.completeExisting(existing, row, agentName, dto);
        }

        const aiRecord = await this.aiService.create({
            provider: agentName,
            model: agentName,
            type: AGENT_ANALYSIS_TYPE,
            status: 'done',
            result: dto.summary,
            // Черновик события (plan+report) для будущего /event-sales/flow —
            // копится в БД, в endpoint сейчас не отправляется.
            report_result: dto.flow ? JSON.stringify(dto.flow) : undefined,
            user_result: JSON.parse(
                JSON.stringify({ ...dto, agentName }),
            ) as Prisma.JsonValue,
            activity_id: row.activityId ?? undefined,
            entity_type: row.entityType ?? undefined,
            entity_id: row.entityId ? Number(row.entityId) : undefined,
            domain: row.domain,
            app: 'agent-gate',
            transcription_id: row.id,
        });

        const smartItemId = await this.writeSmartItem(row, agentName, dto);

        if (smartItemId) {
            await this.aiService
                .update(String(aiRecord.id), {
                    report_item_id: String(smartItemId),
                    in_report: true,
                })
                .catch(error =>
                    this.logger.warn(
                        `ais.report_item_id не обновлён: ${(error as Error).message}`,
                    ),
                );
        }

        await this.duplicateToTimeline(row, agentName, dto).catch(error =>
            this.logger.warn(
                `Дубль анализа в таймлайн не записан: ${(error as Error).message}`,
            ),
        );

        return {
            aiId: String(aiRecord.id),
            smartItemId: smartItemId ?? null,
            smartInstalled: smartItemId !== null,
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

        const smartItemId = await this.writeSmartItem(row, agentName, dto);
        if (smartItemId) {
            await this.aiService
                .update(String(existing.id), {
                    report_item_id: String(smartItemId),
                    in_report: true,
                })
                .catch(error =>
                    this.logger.warn(
                        `ais.report_item_id не обновлён: ${(error as Error).message}`,
                    ),
                );
        }
        return {
            aiId: String(existing.id),
            smartItemId: smartItemId ?? null,
            smartInstalled: smartItemId !== null,
        };
    }

    /** Создание смарт-элемента; null — смарт не установлен на портале. */
    private async writeSmartItem(
        row: TranscriptionPipelineView,
        agentName: string,
        dto: AgentCallAnalysisDto,
    ): Promise<number | null> {
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

        const gigachat = await this.loadGigachatResults(row.id);
        const dealContext = await this.loadDealContext(
            bitrix.api,
            row.entityId,
        );
        const rowDealId = row.entityId ? Number(row.entityId) : undefined;

        return writer.addItem({
            activityId: row.activityId ?? '',
            dealId: rowDealId,
            companyId: dealContext.companyId,
            contactId: dealContext.contactId,
            managerId: dealContext.managerId,
            callId: row.callId ?? undefined,
            callStartedAt: row.callStartedAt ?? undefined,
            durationSec: row.durationSec ? Number(row.durationSec) : undefined,
            callType: dto.callType,
            productive: this.resolveProductive(dto),
            transcriptionId: row.id,
            transcript: row.text ?? undefined,
            summary: dto.summary,
            resumeGigachat: gigachat.resume,
            recomendationGigachat: gigachat.recomendation,
            needsFound: dto.needsFound,
            needs: dto.needs?.join('\n'),
            presentationDone: dto.presentationDone,
            productsOffered: dto.productsOffered?.join('\n'),
            objections: dto.objections
                ?.map(objection => objection.objection)
                .join('\n'),
            objectionsHandling: dto.objections
                ?.filter(objection => objection.handling)
                .map(
                    objection =>
                        `${objection.objection} → ${objection.handling}`,
                )
                .join('\n'),
            recommendations: dto.recommendations?.join('\n'),
            score: dto.score,
            scoreExplanation: dto.scoreExplanation,
            speechAnalysis: dto.speechAnalysis,
            employeeRecommendations: dto.employeeRecommendations,
            sections: dto.sections,
            mainDealId: dto.relatedDeals?.mainDealId ?? rowDealId,
            presentationDealId: dto.relatedDeals?.presentationDealId,
            xoDealId: dto.relatedDeals?.xoDealId,
            kpiItem: dto.kpiItem,
            historyItem: dto.historyItem,
            relatedReports: dto.relatedReportIds?.join(', '),
            agentName,
            agentVersion: dto.agentVersion,
        });
    }

    /** productive: явное поле агента, иначе выводим из flow-черновика. */
    private resolveProductive(dto: AgentCallAnalysisDto): boolean | undefined {
        if (dto.productive !== undefined) return dto.productive;
        if (dto.flow?.report?.resultStatus) {
            return dto.flow.report.resultStatus === 'result';
        }
        return undefined;
    }

    /**
     * Дубль анализа в таймлайн сделки (по требованию задачи): руководитель
     * и менеджер видят разбор в привычной ленте, не открывая смарт.
     */
    private async duplicateToTimeline(
        row: TranscriptionPipelineView,
        agentName: string,
        dto: AgentCallAnalysisDto,
    ): Promise<void> {
        if (!row.domain || !row.entityId) return;
        const { bitrix } = await this.pbxService.init(row.domain);
        const dealContext = await this.loadDealContext(
            bitrix.api,
            row.entityId,
        );

        const sectionLines = (dto.sections ?? [])
            .filter(section => section.relevance > 0)
            .map(section => {
                const score =
                    section.score !== undefined ? `${section.score}/10` : '—';
                return `• ${section.section}: ${score} (актуальность ${section.relevance}%)`;
            })
            .join('\n');

        const comment =
            `🤖 [b]Глубокий AI-анализ звонка[/b] (активность #${row.activityId ?? '?'}, агент ${agentName})\n\n` +
            `[b]Тип:[/b] ${dto.callType}\n` +
            (dto.score !== undefined
                ? `[b]Оценка:[/b] ${dto.score}/10${dto.scoreExplanation ? ` — ${dto.scoreExplanation.slice(0, 500)}` : ''}\n`
                : '') +
            `\n[b]Резюме:[/b]\n${dto.summary.slice(0, 1500)}\n` +
            (sectionLines ? `\n[b]Разделы:[/b]\n${sectionLines}\n` : '') +
            (dto.recommendations?.length
                ? `\n[b]Рекомендации:[/b]\n${dto.recommendations
                      .map(r => `• ${r}`)
                      .join('\n')
                      .slice(0, 1000)}\n`
                : '') +
            (dto.employeeRecommendations
                ? `\n[b]Сотруднику:[/b] ${dto.employeeRecommendations.slice(0, 500)}`
                : '');

        await bitrix.timeline.addTimelineComment({
            ENTITY_ID: Number(row.entityId),
            ENTITY_TYPE: 'deal',
            COMMENT: comment,
            AUTHOR_ID: String(dealContext.managerId ?? 1),
        });
    }

    private async loadGigachatResults(transcriptionId: string): Promise<{
        resume?: string;
        recomendation?: string;
    }> {
        const records = await this.aiService.findByTranscriptionIds([
            transcriptionId,
        ]);
        return {
            resume:
                records.find(record => record.type === 'call-resume')?.result ??
                undefined,
            recomendation:
                records.find(record => record.type === 'call-recomendation')
                    ?.result ?? undefined,
        };
    }

    /** Компания/контакт/ответственный сделки для связей смарт-элемента. */
    private async loadDealContext(
        api: {
            call(
                method: string,
                data: Record<string, unknown>,
            ): Promise<unknown>;
        },
        dealId: string | null,
    ): Promise<{ companyId?: number; contactId?: number; managerId?: number }> {
        if (!dealId) return {};
        try {
            const response = (await api.call('crm.deal.get', {
                id: dealId,
            })) as {
                result?: {
                    COMPANY_ID?: string | number;
                    CONTACT_ID?: string | number;
                    ASSIGNED_BY_ID?: string | number;
                };
            };
            const deal = response?.result;
            if (!deal) return {};
            return {
                companyId: Number(deal.COMPANY_ID) || undefined,
                contactId: Number(deal.CONTACT_ID) || undefined,
                managerId: Number(deal.ASSIGNED_BY_ID) || undefined,
            };
        } catch (error) {
            this.logger.warn(
                `crm.deal.get для контекста не выполнен: ${(error as Error).message}`,
            );
            return {};
        }
    }
}
