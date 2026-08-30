import { EnumEventSmartFlow, findSmartKindByFlow } from '@lib/portal-lib/pbx';
import { ZprFlowJobData } from '../../../zpr-flow/dto/zpr-flow-job.dto';
import {
    buildSideFlowJobBase,
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

    const base = buildSideFlowJobBase(input, answers);
    return kinds.map(
        kind =>
            ({
                ...base,
                kind,
                // Отказ (в т.ч. «не ЦА») закрывает звонок своей стадией.
                isFail: ctx.isFail || ctx.isNotCa,
                isMove: kind === 'report' && isMove ? true : undefined,
            }) satisfies ZprFlowJobData,
    );
}
