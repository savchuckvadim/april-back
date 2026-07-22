import { Logger } from '@nestjs/common';
import { BitrixService, BitrixOwnerTypeId } from '@lib/bitrix';
import { IBXItem } from '@lib/bitrix/domain/crm/item/interface/item.interface';
import {
    buildCallReportItemFieldName,
    CALL_REPORT_SMART_TITLE,
    CallReportLinkStatusCode,
    CallReportSectionCode,
    splitTranscriptForSmart,
} from '../config/call-report-smart.config';
import { CallReportSmartInfo } from './call-report-smart-resolver.service';

/** Разбор одного раздела разговора для записи в смарт. */
export interface CallReportSectionInput {
    section: CallReportSectionCode;
    relevance: number;
    score?: number;
    analysis?: string;
    advice?: string;
}

/** Привязка к элементу списка отчётности. */
export interface CallReportListItemLink {
    itemId: string;
    status: CallReportLinkStatusCode;
}

/** Данные для записи элемента смарта «AI-анализ звонков». */
export interface CallReportSmartItemInput {
    activityId: string;
    dealId?: number;
    companyId?: number;
    contactId?: number;
    callId?: string;
    callStartedAt?: Date | string;
    durationSec?: number;
    managerId?: number;
    /** Код типа звонка (xmlId enum-значения из конфига). */
    callType?: string;
    productive?: boolean;
    interlocutorRole?: string;
    sentiment?: string;
    nextStepSet?: boolean;
    nextStep?: string;
    nextStepDate?: string;
    priceDiscussed?: boolean;
    competitorMentioned?: boolean;
    competitors?: string[];
    objectionCategories?: string[];
    riskFlags?: string[];
    refusalCategory?: string;
    talkRatioPct?: number;
    questionsCount?: number;
    weightedScore?: number;
    scriptCompliance?: number;
    coachingPriority?: string;
    transcriptionId?: string;
    /** Полный транскрипт — будет разложен кусками по TRANSCRIPT_N. */
    transcript?: string;
    summary?: string;
    resumeGigachat?: string;
    recomendationGigachat?: string;
    needsFound?: boolean;
    needs?: string;
    presentationDone?: boolean;
    productsOffered?: string;
    objections?: string;
    objectionsHandling?: string;
    recommendations?: string;
    score?: number;
    scoreExplanation?: string;
    speechAnalysis?: string;
    employeeRecommendations?: string;
    sections?: CallReportSectionInput[];
    /** Связи с воронками (id сделок). */
    mainDealId?: number;
    presentationDealId?: number;
    xoDealId?: number;
    /** Привязка к элементам списков отчётности. */
    kpiItem?: CallReportListItemLink;
    historyItem?: CallReportListItemLink;
    relatedReports?: string;
    agentName?: string;
    agentVersion?: string;
}

/**
 * Писатель элементов смарт-процесса «AI-анализ звонков».
 *
 * НЕ Injectable: создаётся через `new CallReportSmartWriterService(bitrix, info)`
 * под конкретный домен (правило CLAUDE.md — никакого this.bitrix в Injectable).
 *
 * Запись — строго одиночным crm.item.add (POST JSON), НЕ батчем:
 * batch-путь библиотеки не URL-кодирует значения, длинные тексты
 * анализа с '&'/'=' молча ломают команду.
 *
 * Форматы значений (проверено по боевому коду):
 * - crm-поля (DEAL_*) — массив строк-ссылок ['D_123'] (smart-report-flow);
 * - enumeration — числовой id значения (маппинг из resolver'а);
 * - boolean — 1/0; связи parentId{etid}/companyId/contactId — числа.
 */
export class CallReportSmartWriterService {
    private readonly logger = new Logger(CallReportSmartWriterService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly smartInfo: CallReportSmartInfo,
    ) {}

    /** Создаёт элемент смарта, возвращает его id. */
    async addItem(input: CallReportSmartItemInput): Promise<number> {
        const fields = this.buildFields(input);
        const response = await this.bitrix.item.add(
            String(this.smartInfo.entityTypeId),
            fields,
        );
        const itemId = Number(
            (response?.result as { item?: { id?: number } })?.item?.id,
        );
        if (!itemId) {
            throw new Error(
                `crm.item.add не вернул id элемента (activity ${input.activityId})`,
            );
        }
        this.logger.log(
            `Создан элемент смарта #${itemId} (activity ${input.activityId})`,
        );
        return itemId;
    }

    private buildFields(input: CallReportSmartItemInput): Partial<IBXItem> {
        const fields: Record<string, unknown> = {
            title: `${CALL_REPORT_SMART_TITLE}: звонок #${input.activityId}`,
        };

        // — Нативные связи смарта —
        if (input.dealId) {
            fields[`parentId${BitrixOwnerTypeId.DEAL}`] = input.dealId;
        }
        if (input.companyId) fields.companyId = input.companyId;
        if (input.contactId) fields.contactId = input.contactId;
        if (input.managerId) fields.assignedById = input.managerId;

        // — Идентификация звонка —
        this.setUf(fields, 'ACTIVITY_ID', input.activityId);
        this.setUf(fields, 'CALL_ID', input.callId);
        this.setUf(
            fields,
            'CALL_DATE',
            input.callStartedAt instanceof Date
                ? input.callStartedAt.toISOString()
                : input.callStartedAt,
        );
        this.setUf(fields, 'DURATION_SEC', input.durationSec);
        this.setUf(fields, 'MANAGER', input.managerId);
        this.setUf(fields, 'TRANSCRIPTION_ID', input.transcriptionId);

        // — Классификация —
        this.setEnumUf(fields, 'CALL_TYPE', input.callType);
        this.setBoolUf(fields, 'PRODUCTIVE', input.productive);
        this.setEnumUf(fields, 'INTERLOCUTOR_ROLE', input.interlocutorRole);
        this.setEnumUf(fields, 'SENTIMENT', input.sentiment);

        // — Следующий шаг —
        this.setBoolUf(fields, 'NEXT_STEP_SET', input.nextStepSet);
        this.setUf(fields, 'NEXT_STEP', input.nextStep);
        this.setUf(fields, 'NEXT_STEP_DATE', input.nextStepDate);

        // — Событийные флаги и справочники —
        this.setBoolUf(fields, 'PRICE_DISCUSSED', input.priceDiscussed);
        this.setBoolUf(
            fields,
            'COMPETITOR_MENTIONED',
            input.competitorMentioned,
        );
        this.setMultiEnumUf(fields, 'COMPETITORS', input.competitors);
        this.setMultiEnumUf(
            fields,
            'OBJECTION_CATEGORIES',
            input.objectionCategories,
        );
        this.setMultiEnumUf(fields, 'RISK_FLAGS', input.riskFlags);
        this.setEnumUf(fields, 'REFUSAL_CATEGORY', input.refusalCategory);

        // — Метрики речи —
        this.setUf(fields, 'TALK_RATIO_PCT', input.talkRatioPct);
        this.setUf(fields, 'QUESTIONS_COUNT', input.questionsCount);

        // — Связи с воронками (crm-поля: массив ссылок D_id) —
        this.setCrmDealUf(fields, 'DEAL_MAIN', input.mainDealId);
        this.setCrmDealUf(
            fields,
            'DEAL_PRESENTATION',
            input.presentationDealId,
        );
        this.setCrmDealUf(fields, 'DEAL_XO', input.xoDealId);

        // — Привязка к спискам отчётности —
        this.setUf(fields, 'KPI_ITEM_ID', input.kpiItem?.itemId);
        this.setEnumUf(fields, 'KPI_ITEM_STATUS', input.kpiItem?.status);
        this.setUf(fields, 'HISTORY_ITEM_ID', input.historyItem?.itemId);
        this.setEnumUf(
            fields,
            'HISTORY_ITEM_STATUS',
            input.historyItem?.status,
        );
        this.setUf(fields, 'RELATED_REPORTS', input.relatedReports);

        // — Содержание —
        this.setUf(fields, 'SUMMARY', input.summary);
        this.setBoolUf(fields, 'NEEDS_FOUND', input.needsFound);
        this.setUf(fields, 'NEEDS', input.needs);
        this.setBoolUf(fields, 'PRESENTATION_DONE', input.presentationDone);
        this.setUf(fields, 'PRODUCTS_OFFERED', input.productsOffered);
        this.setUf(fields, 'OBJECTIONS', input.objections);
        this.setUf(fields, 'OBJECTIONS_HANDLING', input.objectionsHandling);

        // — Первичный RAG —
        this.setUf(fields, 'RESUME_GIGACHAT', input.resumeGigachat);
        this.setUf(
            fields,
            'RECOMENDATION_GIGACHAT',
            input.recomendationGigachat,
        );

        // — Итоговая оценка —
        this.setUf(fields, 'SCORE', input.score);
        this.setUf(fields, 'WEIGHTED_SCORE', input.weightedScore);
        this.setUf(fields, 'SCRIPT_COMPLIANCE', input.scriptCompliance);
        this.setEnumUf(fields, 'COACHING_PRIORITY', input.coachingPriority);
        this.setUf(fields, 'SCORE_EXPLANATION', input.scoreExplanation);
        this.setUf(fields, 'SPEECH_ANALYSIS', input.speechAnalysis);
        this.setUf(
            fields,
            'EMPLOYEE_RECOMMENDATIONS',
            input.employeeRecommendations,
        );
        this.setUf(fields, 'RECOMMENDATIONS', input.recommendations);

        // — Разделы анализа —
        for (const section of input.sections ?? []) {
            this.setUf(
                fields,
                `${section.section}_RELEVANCE`,
                section.relevance,
            );
            this.setUf(fields, `${section.section}_SCORE`, section.score);
            this.setUf(fields, `${section.section}_ANALYSIS`, section.analysis);
            this.setUf(fields, `${section.section}_ADVICE`, section.advice);
        }

        // — Транскрипт кусками —
        if (input.transcript) {
            const parts = splitTranscriptForSmart(input.transcript);
            parts.forEach((part, index) => {
                this.setUf(fields, `TRANSCRIPT_${index + 1}`, part);
            });
        }

        // — Служебные —
        this.setUf(fields, 'AGENT_NAME', input.agentName);
        this.setUf(fields, 'AGENT_VERSION', input.agentVersion);

        return fields as Partial<IBXItem>;
    }

    private setUf(
        fields: Record<string, unknown>,
        code: string,
        value: string | number | undefined,
    ): void {
        if (value === undefined || value === '') return;
        fields[this.ufName(code)] = value;
    }

    private setBoolUf(
        fields: Record<string, unknown>,
        code: string,
        value: boolean | undefined,
    ): void {
        if (value === undefined) return;
        fields[this.ufName(code)] = value ? 1 : 0;
    }

    /** crm-поле со ссылкой на сделку: массив ['D_123'] (формат crm.item). */
    private setCrmDealUf(
        fields: Record<string, unknown>,
        code: string,
        dealId: number | undefined,
    ): void {
        if (!dealId) return;
        fields[this.ufName(code)] = [`D_${dealId}`];
    }

    /** Multi-enum: массив числовых id значений; неизвестные коды — warn и skip. */
    private setMultiEnumUf(
        fields: Record<string, unknown>,
        code: string,
        xmlIds: string[] | undefined,
    ): void {
        if (!xmlIds?.length) return;
        const mapping = this.smartInfo.enumItems[code] ?? {};
        const ids: number[] = [];
        for (const xmlId of xmlIds) {
            const enumId = mapping[xmlId];
            if (enumId === undefined) {
                this.logger.warn(
                    `Неизвестное enum-значение "${xmlId}" для поля ${code} — пропущено`,
                );
                continue;
            }
            ids.push(enumId);
        }
        if (ids.length) fields[this.ufName(code)] = ids;
    }

    /** Enum пишется числовым id значения; неизвестный код — warn и skip. */
    private setEnumUf(
        fields: Record<string, unknown>,
        code: string,
        xmlId: string | undefined,
    ): void {
        if (!xmlId) return;
        const enumId = this.smartInfo.enumItems[code]?.[xmlId];
        if (enumId === undefined) {
            this.logger.warn(
                `Неизвестное enum-значение "${xmlId}" для поля ${code} — пропущено`,
            );
            return;
        }
        fields[this.ufName(code)] = enumId;
    }

    private ufName(code: string): string {
        // Канонический ключ — из зеркала PortalDB/PortalModel (bitrixCamelId);
        // fallback — сборка по typeId (id crm.type.list — основа UF-имён,
        // НЕ entityTypeId; см. доки userfieldconfig).
        return (
            this.smartInfo.ufKeyByCode?.[code] ??
            buildCallReportItemFieldName(
                this.smartInfo.typeId ?? this.smartInfo.entityTypeId,
                code,
            )
        );
    }
}
