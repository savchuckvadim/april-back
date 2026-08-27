import { BitrixDateTime } from '@/shared/lib/date';
import { PBXDateTime } from '@lib/portal-lib/pbx-domain/date/pbx-datetime';
import {
    EventReportEventType,
    normalizeEventReportEventType,
} from '../../../types/event-report.event-codes';
import { ClientEvent } from './event-field-policy.types';

/**
 * Компактное открытое дело клиента, как его присылает фрейм.
 *
 * Структурный тип, а не сам DTO: модуль чистый, тестируется без
 * class-validator и без Nest. DTO ему структурно соответствует.
 */
export interface OpenEventTaskLike {
    readonly id?: number | string;
    /** Код типа события (алфавит `EnumTaskEventType`). */
    readonly eventType?: string;
    /** Дедлайн: ISO со смещением либо `DD.MM.YYYY HH:mm:ss` (локаль портала). */
    readonly deadline?: string | null;
    readonly name?: string | null;
    readonly responsibleId?: number | string | null;
}

/** Событие, которое ставит ЭТОТ отчёт (план либо перенос). */
export interface PlannedEventInput {
    readonly eventType: EventReportEventType;
    readonly name: string;
    readonly deadline: BitrixDateTime;
    readonly responsibleId: number | null;
}

export interface ClientEventAxisInput {
    /**
     * Открытые дела клиента с фрейма. `undefined` — фрейм список НЕ прислал
     * (старая сборка): ось не строится вовсе, и поля остаются на прежнем
     * слепом поведении. Пустой массив — честное «других дел нет».
     */
    readonly openTasks?: readonly OpenEventTaskLike[] | null;
    /** id закрываемой этим отчётом задачи — из оси исключается. */
    readonly closingTaskId: number | null;
    /** Событие, которое ставит отчёт; `null` — не ставит. */
    readonly planned: PlannedEventInput | null;
    readonly dateTime: PBXDateTime;
}

/**
 * ISO-строка с ЯВНЫМ смещением — абсолютный момент.
 *
 * Читать её как «локальное время портала» нельзя: дедлайны задач Bitrix
 * отдаёт в server-time (`2026-08-05T15:00:00+03:00`), и на не-московском
 * портале час уехал бы. Всё остальное (`DD.MM.YYYY HH:mm:ss` и т.п.) —
 * ввод портала, у него смещения нет и трактуется он как локальное время.
 */
const ISO_WITH_OFFSET =
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * Дедлайн дела как момент времени; `null` — дедлайна нет или строка не
 * разбирается. Без дедлайна дело не может быть «следующим» — молча
 * пропускаем, а не роняем отчёт из-за одной кривой задачи.
 */
export const parseEventDeadline = (
    raw: string | null | undefined,
    dateTime: PBXDateTime,
): BitrixDateTime | null => {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) return null;
    try {
        return ISO_WITH_OFFSET.test(value)
            ? dateTime.fromInstant(new Date(value))
            : dateTime.fromInput(value);
    } catch {
        return null;
    }
};

const toId = (value: unknown): number | null => {
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
};

const toClientEvent = (
    task: OpenEventTaskLike,
    dateTime: PBXDateTime,
): ClientEvent | null => {
    const deadline = parseEventDeadline(task.deadline, dateTime);
    if (!deadline) return null;
    return {
        taskId: toId(task.id),
        // Тот же алфавит, что у отчёта и плана: неизвестный код падает в
        // `warm`, а не теряется (см. normalizeEventReportEventType).
        eventType: normalizeEventReportEventType(String(task.eventType ?? '')),
        name: typeof task.name === 'string' ? task.name : '',
        at: deadline.toDayjs().valueOf(),
        crmDateTime: deadline.toCrmDateTime(),
        responsibleId: toId(task.responsibleId),
    };
};

/**
 * Ось событий клиента ПОСЛЕ применения отчёта: открытые дела без той
 * задачи, которую отчёт закрывает, плюс то событие, которое отчёт ставит.
 *
 * `null` — фрейм списка не прислал: считать нечего, вызывающий обязан
 * остаться на прежнем поведении.
 *
 * Закрываемая задача исключается ВСЕГДА, включая перенос: при переносе
 * задача остаётся той же, но с новой датой — старая её дата на оси была бы
 * призраком, а новая приезжает планом.
 */
export const buildClientEventAxis = (
    input: ClientEventAxisInput,
): ClientEvent[] | null => {
    if (!input.openTasks) return null;

    const events: ClientEvent[] = [];
    for (const task of input.openTasks) {
        const taskId = toId(task.id);
        if (taskId !== null && taskId === input.closingTaskId) continue;
        const event = toClientEvent(task, input.dateTime);
        if (event) events.push(event);
    }

    /*
     * Планируемое событие идёт ПОСЛЕДНИМ: при равных датах `nearestEvent`
     * оставляет первое, и уже существующее дело не вытесняется только что
     * созданным. Практический смысл — тема (`call_next_name`) описывает то
     * дело, которое менеджер увидит в списке.
     */
    if (input.planned) {
        events.push({
            taskId: null,
            eventType: input.planned.eventType,
            name: input.planned.name,
            at: input.planned.deadline.toDayjs().valueOf(),
            crmDateTime: input.planned.deadline.toCrmDateTime(),
            responsibleId: input.planned.responsibleId,
        });
    }

    return events;
};
