import { EnumEventSmartFlow, findSmartKindByFlow } from '@lib/portal-lib/pbx';
import { ZprFlowJobData } from '../../../zpr-flow/dto/zpr-flow-job.dto';
import {
    buildZprSurveySnapshot,
    ZprSurveySnapshot,
} from '../../../zpr-flow/lib/zpr-survey-snapshot';
import {
    buildSideFlowJobBase,
    logger,
    buildSmartAnswers,
    coveredAnswerPurposes,
    SideFlowJobBuildInput,
    SideFlowJobKind,
    warnOrphanAnswers,
} from './side-flow-job.base';

/**
 * Смарт, элемент которого ведёт сайд-очередь ЗПР. Читаем из реестра
 * типов события, а не пишем строкой: связь «тип события ↔ смарт ↔
 * поток» обязана жить в одном месте.
 */
const ZPR_SMART_KIND = findSmartKindByFlow(EnumEventSmartFlow.zpr);

/**
 * Джобы сайд-очереди ЗПР: отчёт по задаче «Решение» закрывает элемент,
 * план «Решения» создаёт новый — оба могут случиться в одном отчёте
 * (отчитались и запланировали следующий), тогда джобов два, в этом же
 * порядке. Не «Решение» — очередь не трогаем (пустой массив).
 */
export function buildZprFlowJobs(
    input: SideFlowJobBuildInput,
): ZprFlowJobData[] {
    const { ctx, questionnaire } = input;

    /*
     * Перенос (isExpired) — ОДИН джоб-move: задача та же, элемент тот же.
     * Пара report+plan здесь дала бы фантомное «не состоялся» плюс второй
     * открытый элемент (находка ревью).
     */
    const isMove = ctx.isExpired;
    const kinds: SideFlowJobKind[] = [];
    if (ctx.reportEventType === 'hot') kinds.push('report');
    if (!isMove && ctx.planEventType === 'hot' && ctx.isPlanned) {
        kinds.push('plan');
    }
    // Перенос план-only (без отчётного типа hot): двигаем по плану.
    if (isMove && !kinds.length && ctx.planEventType === 'hot') {
        kinds.push('report');
    }

    const answers = buildSmartAnswers(questionnaire, ZPR_SMART_KIND);
    warnOrphanAnswers(
        'zpr-flow',
        ctx,
        answers,
        coveredAnswerPurposes(kinds, isMove),
    );
    if (!kinds.length) return [];

    // Снимок клиента (плановая дата покупки) — из УЖЕ загруженных
    // сущностей контекста, без лишних вызовов Bitrix. Один на оба джоба:
    // элемент ЗПР обязан нести дату и на плане, и на закрытии
    // (требование владельца 31.08).
    //
    // Снимок — украшение, а не инвариант: сломанная модель полей портала
    // не имеет права отменить сами джобы (батч уже ушёл, отчёт состоялся).
    let survey: ZprSurveySnapshot = {};
    try {
        survey = buildZprSurveySnapshot({
            portal: ctx.portal,
            baseDeal: ctx.currentBaseDeal as Record<string, unknown> | null,
            company: ctx.company as Record<string, unknown> | null,
            lead: ctx.lead as unknown as Record<string, unknown> | null,
            // Сводки анкеты ЭТОГО отчёта: строки сущностей прочитаны ДО
            // записи батча, поэтому payload точнее их.
            survey: ctx.presentationSurvey,
        });
    } catch (error) {
        logger.warn(
            `[zpr-flow] ${ctx.domain}: снимок клиента не собран — ` +
                `джобы едут без него: ${(error as Error).message}`,
        );
    }

    const base = buildSideFlowJobBase(input, answers);
    return kinds.map(
        kind =>
            ({
                ...base,
                kind,
                // Отказ (в т.ч. «не ЦА») закрывает звонок своей стадией.
                isFail: ctx.isFail || ctx.isNotCa,
                isMove: kind === 'report' && isMove ? true : undefined,
                survey: Object.keys(survey).length ? survey : undefined,
                // Строки KPI/History своего назначения: элемент допишет в
                // их crm-поле ссылку на себя (T{hex}_{id}).
                kpiRows: input.kpiRowRefs?.[kind]?.length
                    ? input.kpiRowRefs[kind]
                    : undefined,
            }) satisfies ZprFlowJobData,
    );
}
