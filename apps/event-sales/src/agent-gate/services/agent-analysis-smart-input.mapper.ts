import { Prisma } from 'generated/prisma';
import { AiService, TranscriptionPipelineView } from '@lib/call-lib';
import { CallReportDealFamily } from '@lib/call-lib/call-report/services/call-report-deal-family.service';
import { CallReportSmartItemInput } from '@lib/call-lib/call-report/services/call-report-smart-writer.service';
import { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';
import { AGENT_ANALYSIS_TYPE } from './agent-call-package.service';
import {
    AgentCallActivity,
    AgentCallDirection,
    AgentCrmEntityContext,
    AgentGigachatResults,
} from './agent-analysis-intake.types';
import { renderDialogText } from './agent-analysis-text-render.util';

/**
 * Раскладка разбора агента в запись ais и в поля/связи элемента смарта
 * (маппер) — вынесена из intake по лимиту файла; чистые функции.
 */

/** Запись ais типа agent-analysis по разбору и строке транскрипции. */
export function buildAgentAnalysisRecord(source: {
    row: TranscriptionPipelineView;
    agentName: string;
    dto: AgentCallAnalysisDto;
    classifierCallType: string | null;
    classifierMismatch: boolean;
}): Parameters<AiService['create']>[0] {
    const { row, agentName, dto, classifierCallType, classifierMismatch } =
        source;
    return {
        provider: agentName,
        model: agentName,
        type: AGENT_ANALYSIS_TYPE,
        status: 'done',
        result: dto.summary,
        // Черновик события (plan+report) для будущего /event-sales/flow —
        // копится в БД, в endpoint сейчас не отправляется.
        report_result: dto.flow ? JSON.stringify(dto.flow) : undefined,
        user_result: JSON.parse(
            JSON.stringify({
                ...dto,
                agentName,
                classifierCallType,
                classifierMismatch,
            }),
        ) as Prisma.JsonValue,
        activity_id: row.activityId ?? undefined,
        entity_type: row.entityType ?? undefined,
        entity_id: row.entityId ? Number(row.entityId) : undefined,
        domain: row.domain as string,
        app: 'agent-gate',
        transcription_id: row.id,
    };
}

/** Резюме и рекомендации первичного RAG (GigaChat) из записей ais звонка. */
export function pickGigachatResults(
    records: { type: string | null; result?: string | null }[],
): AgentGigachatResults {
    return {
        resume:
            records.find(record => record.type === 'call-resume')?.result ??
            undefined,
        recomendation:
            records.find(record => record.type === 'call-recomendation')
                ?.result ?? undefined,
    };
}

/** Всё, что нужно для сборки входа writer'а: звонок, связи, разбор. */
export interface AgentSmartItemInputSource {
    row: TranscriptionPipelineView;
    /** Лид-владелец звонка (entityType='lead'). */
    rowLeadId: number | undefined;
    /** Сведённые связи: раскладка по CRM + проверенные догадки агента. */
    family: CallReportDealFamily;
    /** Клиент звонка и уже сведённый ответственный разбора. */
    dealContext: AgentCrmEntityContext;
    callDirection: AgentCallDirection | undefined;
    gigachat: AgentGigachatResults;
    agentName: string;
    dto: AgentCallAnalysisDto;
}

export function buildAgentSmartItemInput(
    source: AgentSmartItemInputSource,
): CallReportSmartItemInput {
    const { row, family, dealContext, gigachat, agentName, dto } = source;
    return {
        activityId: row.activityId ?? '',
        // Родитель-сделка элемента — только «ОП Основная» (writer
        // ставит parentId{DEAL} из mainDealId): сделка-владелец звонка
        // чужой воронки в связь не идёт (решение владельца 08.09.2026).
        leadId: source.rowLeadId,
        companyId: dealContext.companyId,
        contactId: dealContext.contactId,
        managerId: dealContext.managerId,
        callId: row.callId ?? undefined,
        callStartedAt: row.callStartedAt ?? undefined,
        callDirection: source.callDirection,
        durationSec: row.durationSec ? Number(row.durationSec) : undefined,
        callType: dto.callType,
        productive: resolveProductive(dto),
        interlocutorRole: dto.interlocutorRole,
        specialist: dto.specialist ?? undefined,
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
        objectionCategories: resolveObjectionCategories(dto),
        riskFlags: dto.riskFlags,
        refusalCategory: dto.refusalCategory,
        // Причина отказа словами клиента: слой «AI» четвёрки полей
        // (менеджер · расхождение · объяснение дописывает утренняя
        // сверка причин отказа, CallRefusalAuditService).
        refusalReasonAi: dto.refusalReason ?? undefined,
        talkRatioPct: dto.talkRatioPct,
        questionsCount: dto.questionsCount,
        weightedScore: dto.weightedScore ?? computeWeightedScore(dto),
        scriptCompliance: dto.scriptCompliance,
        coachingPriority: dto.coachingPriority,
        transcriptionId: row.id,
        // Размеченный по ролям диалог (если агент прислал) информативнее
        // сырого текста — он же уходит в поля TRANSCRIPT_N.
        transcript: renderDialogText(dto.dialog) ?? row.text ?? undefined,
        // Диалог intake постит в таймлайн сам (renderDialogComments) —
        // writer в этом случае не дублирует транскрипт в таймлайн.
        transcriptInTimeline: Boolean(dto.dialog?.length),
        summary: dto.summary,
        resumeGigachat: gigachat.resume,
        recomendationGigachat: gigachat.recomendation,
        needsFound: dto.needsFound,
        needs: dto.needs?.join('\n'),
        presentationDone: dto.presentationDone,
        hvostDone: dto.hvostDone ?? undefined,
        hvostAnalysis: dto.hvostAnalysis ?? undefined,
        hvostSteps: dto.hvostSteps ?? undefined,
        fiveKAnalysis: dto.fiveKAnalysis ?? undefined,
        fiveKDone: dto.fiveKDone ?? undefined,
        fiveKItems: dto.fiveKItems ?? undefined,
        productsOffered: dto.productsOffered?.join('\n'),
        objections: dto.objections
            ?.map(objection => objection.objection)
            .join('\n'),
        objectionsHandling: dto.objections
            ?.filter(objection => objection.handling)
            .map(objection => `${objection.objection} → ${objection.handling}`)
            .join('\n'),
        recommendations: dto.recommendations?.join('\n'),
        score: dto.score,
        scoreExplanation: dto.scoreExplanation,
        speechAnalysis: dto.speechAnalysis,
        employeeRecommendations: dto.employeeRecommendations,
        sections: dto.sections,
        // Связи уже сведены оркестратором: раскладка по CRM, а где она
        // молчит — ПРОВЕРЕННАЯ по воронке догадка агента. Сделка-владелец
        // в «основную» не подставляется никогда.
        mainDealId: family.mainDealId,
        presentationDealId: family.presentationDealId,
        xoDealId: family.xoDealId,
        kpiItem: dto.kpiItem,
        historyItem: dto.historyItem,
        relatedReports: dto.relatedReportIds?.join(', '),
        agentName,
        agentVersion: dto.agentVersion,
    };
}

/** Категории возражений: явное поле, иначе собираем из objections[].category. */
export function resolveObjectionCategories(
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
export function computeWeightedScore(
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
        (sum, section) => sum + (section.score as number) * section.relevance,
        0,
    );
    return Math.round((weighted / weightSum) * 10);
}

/** productive: явное поле агента, иначе выводим из flow-черновика. */
export function resolveProductive(
    dto: AgentCallAnalysisDto,
): boolean | undefined {
    if (dto.productive !== undefined) return dto.productive;
    if (dto.flow?.report?.resultStatus) {
        return dto.flow.report.resultStatus === 'result';
    }
    return undefined;
}

/** Направление звонка из активности (DIRECTION: 1 — входящий, 2 — исходящий). */
export function resolveCallDirection(
    activity: AgentCallActivity | undefined,
): AgentCallDirection | undefined {
    const direction = Number(
        (activity as { DIRECTION?: string | number } | null)?.DIRECTION,
    );
    if (direction === 2) return 'outgoing';
    if (direction === 1) return 'incoming';
    return undefined;
}
