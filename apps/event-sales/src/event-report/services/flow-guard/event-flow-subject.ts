import { EventSalesFlowDto } from '../../dto/event-sale-flow/event-sales-flow.dto';
import {
    EnumEventFlowStatus,
    EventFlowOperationDto,
} from '../../dto/response/event-flow-operation.dto';
import { EnumWorkStatusCode } from '../../types/report-types';
import {
    reportClosesTask,
    reportTaskFlagsOf,
} from '../task/report-closes-task';

/**
 * Предмет отчёта — то, по чему второй такой же отчёт подряд был бы дублем.
 *
 * Случай garant 06.10.2026: отчёт шёл долго, руководитель вернулся к списку,
 * где дело ещё висело открытым, и отправил его второй раз — у сделки две
 * пары записей KPI, два комментария и две строки истории. Повтор с тем же
 * номером операции бэк и раньше не выполнял, но второй отчёт — это новая
 * операция.
 *
 *  - `task` — отчёт закрывает дело: второй отчёт, закрывающий то же дело, —
 *    дубль всегда;
 *  - `outcome` — итог без дела (кнопки «Продажа» / «Отказ»): дубль — тот же
 *    итог по той же сделке (компании, лиду). Другой итог дублем не считается:
 *    исправить ошибочный отказ продажей можно сразу.
 *
 * Перенос, новое событие, недозвон и нерезультативный звонок без финала
 * предмета не имеют: таких отчётов по одному делу бывает несколько подряд.
 */
export const EVENT_FLOW_SUBJECT_KIND = {
    task: 'task',
    outcome: 'outcome',
} as const;

export type EventFlowSubjectKind =
    (typeof EVENT_FLOW_SUBJECT_KIND)[keyof typeof EVENT_FLOW_SUBJECT_KIND];

export interface EventFlowSubject {
    kind: EventFlowSubjectKind;
    /** Часть ключа замка: `task:769671`, `outcome:deal:27537:fail`. */
    key: string;
    /** Итог — для текста отказа; только у `outcome`. */
    outcome?: EnumWorkStatusCode;
}

const positiveId = (raw: unknown): number | null => {
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
};

/**
 * Чья работа. Сделка точнее компании: руководитель закрывает сделки одной
 * компании одну за другой, и итог по второй сделке дублем не является.
 */
const ownerOf = (dto: EventSalesFlowDto): string | null => {
    const dealId = positiveId(dto.context?.dealId);
    if (dealId) return `deal:${dealId}`;
    const companyId = positiveId(dto.context?.companyId);
    if (companyId) return `company:${companyId}`;
    const leadId = positiveId(dto.context?.leadId);
    if (leadId) return `lead:${leadId}`;
    return null;
};

export const eventFlowSubjectOf = (
    dto: EventSalesFlowDto,
): EventFlowSubject | null => {
    const flags = reportTaskFlagsOf(dto);
    const taskId = positiveId(dto.currentTask?.id);
    if (taskId) {
        return reportClosesTask(flags)
            ? { kind: EVENT_FLOW_SUBJECT_KIND.task, key: `task:${taskId}` }
            : null;
    }

    const workStatus = dto.report?.workStatus?.current?.code;
    if (!workStatus || !flags.isFinal) return null;
    const owner = ownerOf(dto);
    return owner
        ? {
              kind: EVENT_FLOW_SUBJECT_KIND.outcome,
              key: `outcome:${owner}:${workStatus}`,
              outcome: workStatus,
          }
        : null;
};

const OUTCOME_NAME: Partial<Record<EnumWorkStatusCode, string>> = {
    [EnumWorkStatusCode.fail]: '«Отказ»',
    [EnumWorkStatusCode.success]: '«Продажа»',
};

/** «только что» / «3 мин назад» — от момента, когда первый отчёт приняли. */
const agoText = (fromIso: string | null, now: Date): string => {
    const from = fromIso ? Date.parse(fromIso) : NaN;
    if (!Number.isFinite(from)) return 'недавно';
    const minutes = Math.floor((now.getTime() - from) / 60_000);
    return minutes < 1 ? 'только что' : `${minutes} мин назад`;
};

/**
 * Текст отказа для менеджера — его покажет экран отправки. Без кодов и
 * без «повторите»: второй отчёт не нужен, первый уже принят.
 */
export const duplicateReportMessage = (
    subject: EventFlowSubject,
    holder: Pick<EventFlowOperationDto, 'status' | 'queuedAt' | 'finishedAt'>,
    now: Date,
): string => {
    const isDone = holder.status === EnumEventFlowStatus.DONE;
    if (subject.kind === EVENT_FLOW_SUBJECT_KIND.task) {
        return isDone
            ? `Отчёт по этому делу уже принят ${agoText(holder.finishedAt ?? holder.queuedAt, now)}. ` +
                  'Второй не записан — обновите список событий'
            : 'Отчёт по этому делу уже отправляется — дождитесь, список ' +
                  'обновится сам. Второй не записан';
    }
    const name = (subject.outcome && OUTCOME_NAME[subject.outcome]) ?? 'Итог';
    return isDone
        ? `${name} по этому клиенту уже записан ${agoText(holder.finishedAt ?? holder.queuedAt, now)}. ` +
              'Второй раз не записываем'
        : `${name} по этому клиенту уже отправляется — дождитесь. Второй ` +
              'раз не записываем';
};
