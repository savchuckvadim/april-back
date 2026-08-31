import { EnumEventSmartFlow, findSmartKindByFlow } from '@lib/portal-lib/pbx';
import { PresentationFlowJobData } from '../../../presentation-flow/dto/presentation-flow-job.dto';
import {
    derivePresentationOutcome,
    isPresentationMoveOutcome,
} from '../../../presentation-flow/lib/presentation-outcome';
import { buildPresentationSurveySnapshot } from '../../../presentation-flow/lib/presentation-survey-snapshot';
import {
    buildSideFlowJobBase,
    buildSmartAnswers,
    coveredAnswerPurposes,
    SideFlowJobBuildInput,
    SideFlowJobKind,
    warnOrphanAnswers,
} from './side-flow-job.base';

/**
 * Смарт, элемент которого ведёт сайд-очередь презентаций. Читаем из
 * реестра типов события, а не пишем строкой: связь «тип события ↔ смарт ↔
 * поток» обязана жить в одном месте.
 */
const PRESENTATION_SMART_KIND = findSmartKindByFlow(
    EnumEventSmartFlow.presentation,
);

/**
 * Джобы сайд-очереди презентаций — зеркало `buildZprFlowJobs`.
 *
 * Отчёт по презентации закрывает (или переносит) открытый элемент, план
 * презентации создаёт новый — оба могут случиться в одном отчёте
 * (отчитались и назначили следующую), тогда джобов два, и порядок
 * «сначала report, потом plan» обязателен: иначе новый элемент стал бы
 * «открытым» для собственного же отчёта.
 *
 * Спонтанная презентация (`isUnplannedPresentation`) тоже даёт report-джоб:
 * факт «презентация проведена» обязан фиксироваться всегда, даже когда
 * отчёт пришёл не по презентационной задаче.
 */
export function buildPresentationFlowJobs(
    input: SideFlowJobBuildInput,
): PresentationFlowJobData[] {
    const { ctx, questionnaire } = input;

    // Отчёт «по презентации»: либо презентацию провели (в т.ч. спонтанно),
    // либо отчитались по презентационной задаче (перенос/срыв/отказ).
    const isPresentationReport =
        ctx.isPresentationDone || ctx.reportEventType === 'presentation';
    const kinds: SideFlowJobKind[] = [];
    if (isPresentationReport) kinds.push('report');
    /*
     * Перенос (isExpired) — задача та же, элемент тот же: report-джоб
     * двинет его в «Перенос» (outcome moved), а plan-джоб создал бы
     * ВТОРОЙ открытый элемент, и pending-элемент утёк бы навсегда
     * вместе со счётчиком переносов (находка ревью).
     */
    const isMove = ctx.isExpired && isPresentationReport;
    if (!isMove && ctx.planEventType === 'presentation' && ctx.isPlanned) {
        kinds.push('plan');
    }

    /*
     * Исход считаем ЗДЕСЬ, а не только в теле джоба: по нему поток
     * выбирает ветку «перенос или закрытие», а от неё зависит, чьи
     * ответы анкеты элемент унесёт. Флаг `isMove` выше для этого не
     * годится: «перенос + отказ» даёт исход `fail`, элемент
     * закрывается и плановую анкету не принимает.
     */
    const outcome = derivePresentationOutcome(ctx);
    const answers = buildSmartAnswers(questionnaire, PRESENTATION_SMART_KIND);
    warnOrphanAnswers(
        'presentation-flow',
        ctx,
        answers,
        coveredAnswerPurposes(kinds, isPresentationMoveOutcome(outcome)),
    );
    if (!kinds.length) return [];

    // Снимок анкеты — из УЖЕ загруженных сущностей контекста, без
    // единого лишнего вызова Bitrix (фрейм пишет анкету до отчёта).
    // Считается один раз на оба джоба: он одинаков и для отчёта, и для плана.
    const survey = buildPresentationSurveySnapshot({
        portal: ctx.portal,
        lead: ctx.lead as Record<string, unknown> | null,
        baseDeal: ctx.currentBaseDeal as Record<string, unknown> | null,
    });
    const base = buildSideFlowJobBase(input, answers);

    return kinds.map(
        kind =>
            ({
                ...base,
                kind,
                outcome,
                isSpontaneous: ctx.isUnplannedPresentation,
                /*
                 * ТМЦ-сделка: из привязок задачи (`currentTmcDeal`), иначе —
                 * найденная по обратной ссылке `UF_CRM_TO_PRESENTATION_SALES`
                 * с pres-сделки. Оба пути дают сделку воронки `tmc_base`;
                 * второй работает там, где задача к ТМЦ-сделке не привязана.
                 */
                tmcDealId:
                    Number(
                        ctx.currentTmcDeal?.ID ??
                            ctx.currentTmcFromPresentation?.ID,
                    ) || null,
                // Кто назначил презентацию (лидоген ≠ менеджер).
                planResponsibleId: ctx.planCreatedById || ctx.planResponsibleId,
                /*
                 * Причина отказа — только та, что менеджер ДЕЙСТВИТЕЛЬНО выбрал:
                 * геттер контекста отсекает дефолты селекта на нефинальных
                 * отчётах, иначе элемент получал бы «Не было времени» на каждой
                 * проведённой презентации.
                 */
                failReasonCode: ctx.failReasonCode,
                /*
                 * Снимок анкеты «5К»/«Хвост» лежит РЯДОМ с ответами портальной
                 * анкеты (`answers` в общей базе), а не вместо: у снимка ключ —
                 * код нашего реестра полей, у ответов — UF-имя произвольного
                 * поля портала. Слияние заставило бы один из ключей врать.
                 */
                survey,
                // Строки KPI/History своего назначения: элемент допишет в
                // их crm-поле ссылку на себя (T{hex}_{id}).
                kpiRows: input.kpiRowRefs?.[kind]?.length
                    ? input.kpiRowRefs[kind]
                    : undefined,
            }) satisfies PresentationFlowJobData,
    );
}
