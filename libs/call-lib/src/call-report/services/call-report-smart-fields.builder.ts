import { Logger } from '@nestjs/common';
import { BitrixOwnerTypeId } from '@lib/bitrix';
import { IBXItem } from '@lib/bitrix/domain/crm/item/interface/item.interface';
import {
    CALL_REPORT_SMART_TITLE,
    splitTranscriptForSmart,
} from '../config/call-report-smart.config';
import { CallReportSmartFieldSet } from './call-report-smart-field-set';
import { CallReportSmartInfo } from './call-report-smart-resolver.service';
import { CallReportSmartItemInput } from './call-report-smart-writer.types';

/**
 * Раскладка входа разбора по полям элемента смарта (какое поле каким
 * форматом) — вынесена из writer'а по лимиту файла; состав и порядок прежние.
 */

/**
 * Название элемента в духе записей телефонии:
 * «Исходящий звонок от 24.06.2026 15:02 · 12 мин». Без даты/длительности —
 * null: паспорта звонка в этом проходе нет (fallback решает сборка полей).
 */
export function buildCallReportSmartTitle(
    input: CallReportSmartItemInput,
): string | null {
    const direction =
        input.callDirection === 'incoming'
            ? 'Входящий звонок'
            : input.callDirection === 'outgoing'
              ? 'Исходящий звонок'
              : 'Звонок';
    const startedAt = input.callStartedAt
        ? new Date(input.callStartedAt)
        : null;
    const date =
        startedAt && !Number.isNaN(startedAt.getTime())
            ? startedAt.toLocaleString('ru-RU', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Europe/Moscow',
              })
            : null;
    const minutes = input.durationSec
        ? `${Math.max(1, Math.round(input.durationSec / 60))} мин`
        : null;
    // Ни даты, ни длительности — паспорта звонка в этом проходе нет:
    // название не строим (решение о fallback принимает сборка полей).
    if (!date && !minutes) return null;
    return [
        direction,
        date ? `от ${date}` : null,
        minutes ? `· ${minutes}` : null,
    ]
        .filter(Boolean)
        .join(' ');
}

/** Поля элемента по входу разбора; isCreate — ставить fallback-название. */
export function buildCallReportSmartFields(
    input: CallReportSmartItemInput,
    smartInfo: CallReportSmartInfo,
    logger: Logger,
    options?: { isCreate?: boolean },
): Partial<IBXItem> {
    const set = new CallReportSmartFieldSet(smartInfo, logger);
    // Название строится из паспорта звонка (дата/длительность), который
    // есть только у каркаса. Дописывающие проходы (ревизор, сверка
    // презентаций) паспорт не передают — им название трогать НЕЛЬЗЯ,
    // иначе карточка обезличивается («AI-анализ звонков: звонок #101»).
    const title = buildCallReportSmartTitle(input);
    if (title) set.setRaw('title', title);
    else if (options?.isCreate) {
        set.setRaw(
            'title',
            `${CALL_REPORT_SMART_TITLE}: звонок #${input.activityId}`,
        );
    }

    // — Нативные связи смарта (работают при relations.parent у типа) —
    // РОДИТЕЛЬ-СДЕЛКА — только «ОП Основная» (решение владельца
    // 08.09.2026): раньше сюда шёл владелец звонка ЛЮБОЙ воронки, и в
    // карточке разбора стояла чужая сделка. Не нашли основную —
    // родителя не ставим вовсе (пусто честнее неверной связи).
    if (input.mainDealId) {
        set.setRaw(`parentId${BitrixOwnerTypeId.DEAL}`, input.mainDealId);
    }
    if (input.leadId) {
        set.setRaw(`parentId${BitrixOwnerTypeId.LEAD}`, input.leadId);
    }
    if (input.companyId) set.setRaw('companyId', input.companyId);
    if (input.contactId) set.setRaw('contactId', input.contactId);
    if (input.managerId) set.setRaw('assignedById', input.managerId);

    // — Идентификация звонка —
    set.set('ACTIVITY_ID', input.activityId);
    set.set('CALL_ID', input.callId);
    set.set(
        'CALL_DATE',
        input.callStartedAt instanceof Date
            ? input.callStartedAt.toISOString()
            : input.callStartedAt,
    );
    set.set('DURATION_SEC', input.durationSec);
    set.set('MANAGER', input.managerId);
    set.set('TRANSCRIPTION_ID', input.transcriptionId);

    // — Классификация —
    set.setEnum('CALL_TYPE', input.callType);
    set.setBool('PRODUCTIVE', input.productive);
    set.setEnum('INTERLOCUTOR_ROLE', input.interlocutorRole);
    set.setEnum('SPECIALIST', input.specialist);
    set.setEnum('SENTIMENT', input.sentiment);

    // — Следующий шаг —
    set.setBool('NEXT_STEP_SET', input.nextStepSet);
    set.set('NEXT_STEP', input.nextStep);
    set.set('NEXT_STEP_DATE', input.nextStepDate);

    // — Событийные флаги и справочники —
    set.setBool('PRICE_DISCUSSED', input.priceDiscussed);
    set.setBool('COMPETITOR_MENTIONED', input.competitorMentioned);
    set.setMultiEnum('COMPETITORS', input.competitors);
    set.setMultiEnum('OBJECTION_CATEGORIES', input.objectionCategories);
    set.setMultiEnum('RISK_FLAGS', input.riskFlags);
    set.setEnum('REFUSAL_CATEGORY', input.refusalCategory);

    // — Метрики речи —
    set.set('TALK_RATIO_PCT', input.talkRatioPct);
    set.set('QUESTIONS_COUNT', input.questionsCount);

    // — Связи с воронками (crm-поля: ссылка в формате поля) —
    set.setCrmDeal('DEAL_MAIN', input.mainDealId);
    set.setCrmDeal('DEAL_PRESENTATION', input.presentationDealId);
    set.setCrmDeal('DEAL_XO', input.xoDealId);

    // — Привязка к спискам отчётности —
    set.set('KPI_ITEM_ID', input.kpiItem?.itemId);
    set.setEnum('KPI_ITEM_STATUS', input.kpiItem?.status);
    set.set('HISTORY_ITEM_ID', input.historyItem?.itemId);
    set.setEnum('HISTORY_ITEM_STATUS', input.historyItem?.status);
    set.set('RELATED_REPORTS', input.relatedReports);

    // — Содержание —
    set.set('SUMMARY', input.summary);
    set.setBool('NEEDS_FOUND', input.needsFound);
    set.set('NEEDS', input.needs);
    set.setBool('PRESENTATION_DONE', input.presentationDone);
    set.setBool('HVOST_DONE', input.hvostDone);
    set.setBool('FIVE_K_DONE', input.fiveKDone);
    // Гранулярные пункты хвоста/5К (null «не применимо» поле не трогает).
    const steps = input.hvostSteps;
    set.setBool('HVOST_DESIRE', steps?.desire ?? undefined);
    set.setBool('HVOST_OFFERED', steps?.offered ?? undefined);
    set.setBool('HVOST_PRICE_REACTION', steps?.priceReaction ?? undefined);
    set.setBool('HVOST_DECISION_PROCESS', steps?.decisionProcess ?? undefined);
    set.setBool('HVOST_DECISION_WAY', steps?.decisionWay ?? undefined);
    const fiveK = input.fiveKItems;
    set.setBool('FIVE_K_CLIENT', fiveK?.client ?? undefined);
    set.setBool('FIVE_K_COMPANY', fiveK?.company ?? undefined);
    set.setBool('FIVE_K_COLLEAGUES', fiveK?.colleagues ?? undefined);
    set.setBool('FIVE_K_COMPETITOR', fiveK?.competitor ?? undefined);
    set.setBool('FIVE_K_CRITERIA', fiveK?.criteria ?? undefined);
    // Краткие версии в полях (ужаты до <700 байт — row size), полные
    // тексты AI-разбора живут в таймлайне элемента.
    set.setShortText('HVOST_ANALYSIS', input.hvostAnalysis);
    set.setShortText('FIVE_K_ANALYSIS', input.fiveKAnalysis);
    set.setShortText('HVOST_MANAGER', input.hvostManager);
    set.setShortText('FIVE_K_MANAGER', input.fiveKManager);
    set.setBool('AUDIT_MISMATCH', input.auditMismatch);
    set.setShortText('AUDIT_POINTS', input.auditPoints);
    set.setShortText('AUDIT_SUMMARY', input.auditSummary);
    // Причина отказа: AI · менеджер · расхождение · объяснение.
    set.setShortText('REFUSAL_REASON_AI', input.refusalReasonAi);
    set.setShortText('REFUSAL_REASON_MANAGER', input.refusalReasonManager);
    set.setBool('REFUSAL_MISMATCH', input.refusalMismatch);
    set.setShortText('REFUSAL_REASON_NOTE', input.refusalReasonNote);
    set.set('PRODUCTS_OFFERED', input.productsOffered);
    set.set('OBJECTIONS', input.objections);
    set.set('OBJECTIONS_HANDLING', input.objectionsHandling);

    // — Первичный RAG —
    set.set('RESUME_GIGACHAT', input.resumeGigachat);
    set.set('RECOMENDATION_GIGACHAT', input.recomendationGigachat);

    // — Итоговая оценка —
    set.set('SCORE', input.score);
    set.set('WEIGHTED_SCORE', input.weightedScore);
    set.set('SCRIPT_COMPLIANCE', input.scriptCompliance);
    set.setEnum('COACHING_PRIORITY', input.coachingPriority);
    set.set('SCORE_EXPLANATION', input.scoreExplanation);
    set.set('SPEECH_ANALYSIS', input.speechAnalysis);
    set.set('EMPLOYEE_RECOMMENDATIONS', input.employeeRecommendations);
    set.set('RECOMMENDATIONS', input.recommendations);
    // Проверка по регламенту: числа — в поля (по ним фильтруют и
    // считают), полный разбор нарушений — в таймлайн элемента.
    set.setBool('COMPLIANCE_DONE', input.complianceDone);
    set.setEnum('COMPLIANCE_SEVERITY', input.complianceSeverity);
    set.set('COMPLIANCE_VIOLATIONS', input.complianceViolations);
    set.set('SCRIPT_MISSED', input.scriptMissed);
    set.set('PRODUCT_FACT_ERRORS', input.productFactErrors);
    set.setShortText('COMPLIANCE_SUMMARY', input.complianceSummary);

    // — Разделы анализа —
    for (const section of input.sections ?? []) {
        set.set(`${section.section}_RELEVANCE`, section.relevance);
        set.set(`${section.section}_SCORE`, section.score);
        set.set(`${section.section}_ANALYSIS`, section.analysis);
        set.set(`${section.section}_ADVICE`, section.advice);
    }

    // — Транскрипт кусками —
    if (input.transcript) {
        const parts = splitTranscriptForSmart(input.transcript);
        parts.forEach((part, index) => {
            set.set(`TRANSCRIPT_${index + 1}`, part);
        });
        // Диагностика «транскрипт не заполнен»: видно, ушли ли куски
        // и под какими ключами (подозрение на молчаливый дроп длинных
        // значений string-полей на стороне Bitrix REST).
        logger.log(
            `Транскрипт ${input.transcript.length} симв → ${parts.length} частей, ` +
                `ключ первой: ${set.ufName('TRANSCRIPT_1')}`,
        );
    } else {
        logger.warn(
            `Транскрипт пуст в input (activity ${input.activityId}) — TRANSCRIPT_N не заполняются`,
        );
    }

    // — Служебные —
    set.set('AGENT_NAME', input.agentName);
    set.set('AGENT_VERSION', input.agentVersion);

    return set.toItemFields();
}
