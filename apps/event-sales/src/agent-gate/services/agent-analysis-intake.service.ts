import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { PBXService } from '@lib/pbx/pbx.service';
import { BitrixService } from '@lib/bitrix';
import {
    AiService,
    TranscriptionPipelineView,
    TranscriptionStoreService,
} from '@lib/call-lib';
import { CALL_REPORT_SECTIONS } from '@lib/call-lib';
import { CallAnalysisBitrixService } from '@lib/call-lib/call-analysis/services/call-analysis-bitrix.service';
import { CallReportSmartResolverService } from '@lib/call-lib/call-report/services/call-report-smart-resolver.service';
import { CallReportSmartWriterService } from '@lib/call-lib/call-report/services/call-report-smart-writer.service';
import {
    AgentCallAnalysisDto,
    AgentDialogTurnDto,
    AgentSectionAnalysisDto,
} from '../dto/agent-analysis-request.dto';
import { AgentAnalysisResponseDto } from '../dto/agent-response.dto';
import { AGENT_ANALYSIS_TYPE } from './agent-call-package.service';
import { computeSpeechMetrics } from './speech-metrics.util';

/** Итог записи смарт-элемента + контекст для таймлайнов. */
interface SmartItemWriteResult {
    itemId: number;
    managerId?: number;
    /** Активность звонка (для binding записи и fallback-аудио). */
    activity?: Awaited<
        ReturnType<CallAnalysisBitrixService['getActivityById']>
    >;
}

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
        allowedDomains: string[] | null = null,
    ): Promise<AgentAnalysisResponseDto> {
        dto = this.applySpeechMetrics(transcriptionId, dto);
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

        const written = await this.writeSmartItem(row, agentName, dto);

        if (written) {
            await this.aiService
                .update(String(aiRecord.id), {
                    report_item_id: String(written.itemId),
                    in_report: true,
                })
                .catch(error =>
                    this.logger.warn(
                        `ais.report_item_id не обновлён: ${(error as Error).message}`,
                    ),
                );
            await this.writeSmartElementTimeline(row, written, dto).catch(
                error =>
                    this.logger.warn(
                        `Таймлайн смарт-элемента не записан: ${(error as Error).message}`,
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
            smartItemId: written?.itemId ?? null,
            smartInstalled: written !== null,
        };
    }

    /**
     * «Code computes numbers»: talkRatioPct и questionsCount считаются
     * кодом по размеченному агентом диалогу и перекрывают значения LLM
     * (LLM систематически ошибается в арифметике на длинных диалогах).
     * Без диалога метрики остаются агентскими. Исходный dto не мутируем.
     */
    private applySpeechMetrics(
        transcriptionId: string,
        dto: AgentCallAnalysisDto,
    ): AgentCallAnalysisDto {
        const metrics = computeSpeechMetrics(dto.dialog);
        if (!metrics) return dto;
        if (
            dto.talkRatioPct !== undefined &&
            dto.talkRatioPct !== metrics.talkRatioPct
        ) {
            this.logger.log(
                `talkRatioPct агента ${dto.talkRatioPct} → ${metrics.talkRatioPct} (пересчёт кодом, transcription ${transcriptionId})`,
            );
        }
        if (
            dto.questionsCount !== undefined &&
            dto.questionsCount !== metrics.questionsCount
        ) {
            this.logger.log(
                `questionsCount агента ${dto.questionsCount} → ${metrics.questionsCount} (пересчёт кодом, transcription ${transcriptionId})`,
            );
        }
        return {
            ...dto,
            talkRatioPct: metrics.talkRatioPct,
            questionsCount: metrics.questionsCount,
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
            await this.aiService
                .update(String(existing.id), {
                    report_item_id: String(written.itemId),
                    in_report: true,
                })
                .catch(error =>
                    this.logger.warn(
                        `ais.report_item_id не обновлён: ${(error as Error).message}`,
                    ),
                );
            await this.writeSmartElementTimeline(row, written, dto).catch(
                error =>
                    this.logger.warn(
                        `Таймлайн смарт-элемента не записан: ${(error as Error).message}`,
                    ),
            );
        }
        return {
            aiId: String(existing.id),
            smartItemId: written?.itemId ?? null,
            smartInstalled: written !== null,
        };
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

        const gigachat = await this.loadGigachatResults(row.id);
        // Звонок может быть по сделке ИЛИ по лиду — хотя бы одна из связей
        // (сделка/лид/компания) должна встать на элемент.
        const isLead = row.entityType === 'lead';
        const rowDealId =
            !isLead && row.entityId ? Number(row.entityId) : undefined;
        const rowLeadId =
            isLead && row.entityId ? Number(row.entityId) : undefined;
        const context = isLead
            ? await this.loadLeadContext(bitrix.api, row.entityId)
            : await this.loadDealContext(bitrix.api, row.entityId);
        const activity = await this.loadActivity(bitrix, row);

        try {
            const itemId = await this.writeItem(
                writer,
                row,
                rowDealId,
                rowLeadId,
                context,
                this.resolveCallDirection(activity),
                gigachat,
                agentName,
                dto,
            );
            return { itemId, managerId: context.managerId, activity };
        } catch (error) {
            // { telegram: true } — форс-алерт админам (транспорт логгера)
            this.logger.error(
                `Смарт-элемент НЕ создан (${domain}, transcription ${row.id}): ${(error as Error).message}`,
                { telegram: true, domain, transcriptionId: row.id },
            );
            throw error;
        }
    }

    private async writeItem(
        writer: CallReportSmartWriterService,
        row: TranscriptionPipelineView,
        rowDealId: number | undefined,
        rowLeadId: number | undefined,
        dealContext: {
            companyId?: number;
            contactId?: number;
            managerId?: number;
        },
        callDirection: 'incoming' | 'outgoing' | undefined,
        gigachat: { resume?: string; recomendation?: string },
        agentName: string,
        dto: AgentCallAnalysisDto,
    ): Promise<number> {
        return writer.addItem({
            activityId: row.activityId ?? '',
            dealId: rowDealId,
            leadId: rowLeadId,
            companyId: dealContext.companyId,
            contactId: dealContext.contactId,
            managerId: dealContext.managerId,
            callId: row.callId ?? undefined,
            callStartedAt: row.callStartedAt ?? undefined,
            callDirection,
            durationSec: row.durationSec ? Number(row.durationSec) : undefined,
            callType: dto.callType,
            productive: this.resolveProductive(dto),
            interlocutorRole: dto.interlocutorRole,
            sentiment: dto.sentiment,
            nextStepSet: dto.nextStep?.set,
            nextStep: dto.nextStep?.description,
            nextStepDate: dto.nextStep?.date,
            priceDiscussed: dto.priceDiscussed,
            competitorMentioned: dto.competitors?.length
                ? true
                : dto.competitors !== undefined
                  ? false
                  : undefined,
            competitors: dto.competitors,
            objectionCategories: this.resolveObjectionCategories(dto),
            riskFlags: dto.riskFlags,
            refusalCategory: dto.refusalCategory,
            talkRatioPct: dto.talkRatioPct,
            questionsCount: dto.questionsCount,
            weightedScore: dto.weightedScore ?? this.computeWeightedScore(dto),
            scriptCompliance: dto.scriptCompliance,
            coachingPriority: dto.coachingPriority,
            transcriptionId: row.id,
            // Размеченный по ролям диалог (если агент прислал) информативнее
            // сырого текста — он же уходит в поля TRANSCRIPT_N.
            transcript:
                this.renderDialogText(dto.dialog) ?? row.text ?? undefined,
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

    /** Категории возражений: явное поле, иначе собираем из objections[].category. */
    private resolveObjectionCategories(
        dto: AgentCallAnalysisDto,
    ): string[] | undefined {
        if (dto.objectionCategories?.length) return dto.objectionCategories;
        const fromObjections = (dto.objections ?? [])
            .map(objection => objection.category)
            .filter((category): category is NonNullable<typeof category> =>
                Boolean(category),
            );
        return fromObjections.length
            ? Array.from(new Set(fromObjections))
            : undefined;
    }

    /**
     * Взвешенная оценка 0-100 по разделам с relevance>0
     * (Σ score×relevance / Σ relevance × 10) — если агент не прислал свою.
     * Неактуальные разделы исключаются, а не тянут оценку вниз.
     */
    private computeWeightedScore(
        dto: AgentCallAnalysisDto,
    ): number | undefined {
        const scored = (dto.sections ?? []).filter(
            section => section.relevance > 0 && section.score !== undefined,
        );
        if (!scored.length) return undefined;
        const weightSum = scored.reduce(
            (sum, section) => sum + section.relevance,
            0,
        );
        if (!weightSum) return undefined;
        const weighted = scored.reduce(
            (sum, section) =>
                sum + (section.score as number) * section.relevance,
            0,
        );
        return Math.round((weighted / weightSum) * 10);
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
     * Таймлайн созданного смарт-элемента: по одной записи на каждый
     * актуальный раздел разговора («как было / что не самое лучшее / как
     * можно по-другому: 1..3»), а САМОЙ ВЕРХНЕЙ записью — запись разговора
     * (аудио активности). Комменты в таймлайне сортируются новые-сверху,
     * поэтому разделы постятся в обратном порядке, аудио — последним.
     */
    private async writeSmartElementTimeline(
        row: TranscriptionPipelineView,
        written: SmartItemWriteResult,
        dto: AgentCallAnalysisDto,
    ): Promise<void> {
        const domain = row.domain as string;
        const smartInfo = await this.smartResolver.resolve(domain);
        if (!smartInfo) return;
        const { bitrix } = await this.pbxService.init(domain);

        const entityType = `DYNAMIC_${smartInfo.entityTypeId}`;
        const authorId = String(written.managerId ?? 1);
        const sections = (dto.sections ?? []).filter(
            section => section.relevance > 0,
        );

        for (const section of [...sections].reverse()) {
            await bitrix.timeline.addTimelineComment({
                ENTITY_ID: written.itemId,
                ENTITY_TYPE: entityType,
                COMMENT: this.renderSectionComment(section),
                AUTHOR_ID: authorId,
            });
        }

        // Диалог по ролям — между разделами и аудио (частями, в обратном
        // порядке, чтобы часть 1 оказалась выше остальных).
        const dialogParts = this.renderDialogComments(dto.dialog);
        for (const part of [...dialogParts].reverse()) {
            await bitrix.timeline.addTimelineComment({
                ENTITY_ID: written.itemId,
                ENTITY_TYPE: entityType,
                COMMENT: part,
                AUTHOR_ID: authorId,
            });
        }

        // Оригинальная запись звонка с плеером: привязываем СУЩЕСТВУЮЩУЮ
        // активность к смарт-элементу (crm.activity.binding.add) — в
        // таймлайне элемента появляется родная запись телефонии.
        // Fallback (binding не прошёл) — коммент со ссылкой на файл.
        const bound = await this.bindCallActivity(bitrix, row, written);
        if (!bound) {
            const audioComment = await this.buildAudioComment(
                bitrix,
                row,
                written,
            );
            if (audioComment) {
                await bitrix.timeline.addTimelineComment({
                    ENTITY_ID: written.itemId,
                    ENTITY_TYPE: entityType,
                    COMMENT: audioComment,
                    AUTHOR_ID: authorId,
                });
            }
        }
    }

    /** Привязка активности звонка к смарт-элементу; false — не удалось. */
    private async bindCallActivity(
        bitrix: BitrixService,
        row: TranscriptionPipelineView,
        written: SmartItemWriteResult,
    ): Promise<boolean> {
        if (!row.activityId) return false;
        const smartInfo = await this.smartResolver.resolve(
            row.domain as string,
        );
        if (!smartInfo) return false;
        try {
            await bitrix.activity.addBinding(
                Number(row.activityId),
                smartInfo.entityTypeId,
                written.itemId,
            );
            return true;
        } catch (error) {
            this.logger.warn(
                `binding активности ${row.activityId} к смарту не выполнен: ${(error as Error).message}`,
            );
            return false;
        }
    }

    /** Направление звонка из активности (DIRECTION: 1 — входящий, 2 — исходящий). */
    private resolveCallDirection(
        activity: SmartItemWriteResult['activity'],
    ): 'incoming' | 'outgoing' | undefined {
        const direction = Number(
            (activity as { DIRECTION?: string | number } | null)?.DIRECTION,
        );
        if (direction === 2) return 'outgoing';
        if (direction === 1) return 'incoming';
        return undefined;
    }

    /** Активность звонка (для направления, binding и fallback-аудио). */
    private async loadActivity(
        bitrix: BitrixService,
        row: TranscriptionPipelineView,
    ): Promise<SmartItemWriteResult['activity']> {
        if (!row.activityId) return null;
        try {
            const bx = new CallAnalysisBitrixService(bitrix);
            return await bx.getActivityById(Number(row.activityId));
        } catch (error) {
            this.logger.warn(
                `Активность ${row.activityId} не получена: ${(error as Error).message}`,
            );
            return null;
        }
    }

    /** Диалог с ролями одной строкой (для полей TRANSCRIPT_N); null — нет разметки. */
    private renderDialogText(
        dialog: AgentDialogTurnDto[] | undefined,
    ): string | null {
        if (!dialog?.length) return null;
        return dialog
            .map(turn => `${this.dialogRoleLabel(turn.role)}: ${turn.text}`)
            .join('\n');
    }

    /**
     * Диалог для таймлайна: реплики «Менеджер/Клиент» с выделением ролей,
     * разбитые на комменты по ~8к символов (лимиты таймлайна).
     */
    private renderDialogComments(
        dialog: AgentDialogTurnDto[] | undefined,
    ): string[] {
        if (!dialog?.length) return [];
        const lines = dialog.map(
            turn => `[b]${this.dialogRoleLabel(turn.role)}:[/b] ${turn.text}`,
        );
        const chunks: string[] = [];
        let current = '';
        for (const line of lines) {
            if (current && current.length + line.length + 2 > 8000) {
                chunks.push(current);
                current = '';
            }
            current += (current ? '\n\n' : '') + line;
        }
        if (current) chunks.push(current);
        return chunks.map(
            (chunk, index) =>
                `💬 [b]Диалог${chunks.length > 1 ? ` (часть ${index + 1}/${chunks.length})` : ''}[/b]\n\n${chunk}`,
        );
    }

    private dialogRoleLabel(role: AgentDialogTurnDto['role']): string {
        if (role === 'manager') return 'Менеджер';
        if (role === 'client') return 'Клиент';
        return 'Другой участник';
    }

    /** Одна таймлайн-запись раздела: как было / слабые места / варианты. */
    private renderSectionComment(section: AgentSectionAnalysisDto): string {
        const title =
            CALL_REPORT_SECTIONS.find(item => item.code === section.section)
                ?.title ?? section.section;
        const score =
            section.score !== undefined ? ` — ${section.score}/10` : '';
        let text = `[b]${title}[/b]${score}\n`;

        const asWas = section.asWas ?? section.analysis;
        if (asWas) text += `\n[b]Как было:[/b]\n${asWas}\n`;
        if (section.weaknesses) {
            text += `\n[b]Что в таком подходе не самое лучшее:[/b]\n${section.weaknesses}\n`;
        }
        if (section.alternatives?.length) {
            text +=
                `\n[b]Как можно было по-другому:[/b]\n` +
                section.alternatives
                    .map((variant, index) => `${index + 1}) ${variant}`)
                    .join('\n');
        } else if (section.advice) {
            text += `\n[b]Как можно было по-другому:[/b]\n${section.advice}`;
        }
        return text;
    }

    /**
     * Fallback: ссылка на аудио-файл разговора (когда binding активности
     * не прошёл). Название ссылки — человеческое, как у записей телефонии.
     */
    private async buildAudioComment(
        bitrix: BitrixService,
        row: TranscriptionPipelineView,
        written: SmartItemWriteResult,
    ): Promise<string | null> {
        const activity = written.activity;
        if (!activity) return null;
        try {
            const bx = new CallAnalysisBitrixService(bitrix);
            const audio = (await bx.getAudioFiles([activity]))[0];
            if (!audio) return null;
            const direction = this.resolveCallDirection(activity);
            const label =
                direction === 'outgoing'
                    ? 'Исходящий звонок'
                    : direction === 'incoming'
                      ? 'Входящий звонок'
                      : 'Запись разговора';
            const startedAt = row.callStartedAt
                ? new Date(row.callStartedAt).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Europe/Moscow',
                  })
                : null;
            const minutes = row.durationSec
                ? `${Math.max(1, Math.round(Number(row.durationSec) / 60))} мин`
                : null;
            const title = [label, startedAt ? `от ${startedAt}` : null, minutes]
                .filter(Boolean)
                .join(' · ');
            return `🎧 [b]${title}[/b]\n[url=${audio.downloadUrl}]${title}.mp3[/url]`;
        } catch (error) {
            this.logger.warn(
                `Аудио для таймлайна не получено (activity ${row.activityId}): ${(error as Error).message}`,
            );
            return null;
        }
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
        const isLead = row.entityType === 'lead';
        const dealContext = isLead
            ? await this.loadLeadContext(bitrix.api, row.entityId)
            : await this.loadDealContext(bitrix.api, row.entityId);

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
            ENTITY_TYPE: isLead ? 'lead' : 'deal',
            COMMENT: comment,
            AUTHOR_ID: String(dealContext.managerId ?? 1),
        });
    }

    /** Компания/контакт/ответственный лида (звонок по лиду). */
    private async loadLeadContext(
        api: {
            call(
                method: string,
                data: Record<string, unknown>,
            ): Promise<unknown>;
        },
        leadId: string | null,
    ): Promise<{ companyId?: number; contactId?: number; managerId?: number }> {
        if (!leadId) return {};
        try {
            const response = (await api.call('crm.lead.get', {
                id: leadId,
            })) as {
                result?: {
                    COMPANY_ID?: string | number;
                    CONTACT_ID?: string | number;
                    ASSIGNED_BY_ID?: string | number;
                };
            };
            const lead = response?.result;
            if (!lead) return {};
            return {
                companyId: Number(lead.COMPANY_ID) || undefined,
                contactId: Number(lead.CONTACT_ID) || undefined,
                managerId: Number(lead.ASSIGNED_BY_ID) || undefined,
            };
        } catch (error) {
            this.logger.warn(
                `crm.lead.get для контекста не выполнен: ${(error as Error).message}`,
            );
            return {};
        }
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
