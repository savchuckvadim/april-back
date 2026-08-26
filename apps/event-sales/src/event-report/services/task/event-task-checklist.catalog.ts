import { IBXChecklistItem } from '@/modules/bitrix/domain/tasks/checklist-item';
import { PbxSalesEventFieldCode } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
import { EventReportEventType } from '../../types/event-report.event-codes';

/**
 * Семантические коды пунктов чек-листа задачи обзвона.
 *
 * Код — единственное, чем оперирует бизнес-логика; TITLE менеджер видит в
 * задаче и по нему же пункт опознаётся при чтении (Битрикс не хранит наших
 * кодов в пункте — только текст). Поэтому TITLE'ы менять НЕЛЬЗЯ без переноса
 * старых задач: переименованный пункт перестанет опознаваться и уедет в
 * «дописано менеджером».
 */
export const EVENT_TASK_CHECKLIST_ITEM = {
    presentationDone: 'presentationDone',
    decisionConfirmed: 'decisionConfirmed',
    nextCommunicationSet: 'nextCommunicationSet',
    objectionRecorded: 'objectionRecorded',
} as const;

export type EventTaskChecklistItemCode =
    (typeof EVENT_TASK_CHECKLIST_ITEM)[keyof typeof EVENT_TASK_CHECKLIST_ITEM];

/** Описатель пункта каталога. */
export interface EventTaskChecklistItemDef {
    code: EventTaskChecklistItemCode;
    /** Текст пункта в задаче — он же ключ опознания при чтении. */
    title: string;
    /**
     * Типы планируемого события, которым пункт нужен; `null` — общий пункт
     * (ставится любому типу). Тип берётся из ПЛАНА: чек-лист живёт на
     * создаваемой задаче, а не на закрываемой.
     */
    eventTypes: readonly EventReportEventType[] | null;
    /**
     * Поле реестра pbx, куда ложится результат пункта при закрытии задачи;
     * `null` — подходящего поля на порталах НЕТ, итог уходит только в
     * историю карточки и комментарий задачи (список для владельца — см.
     * {@link EVENT_TASK_CHECKLIST_FIELDLESS_CODES}).
     */
    fieldCode: PbxSalesEventFieldCode | null;
    /** Порядок в задаче: чем меньше, тем выше (SORT_INDEX Битрикса). */
    sort: number;
}

/**
 * Каталог чек-листов задач обзвона — единственный источник состава.
 *
 * Требование владельца (todo2508 §13): «задачу делать с чеклистом, а при
 * закрытии понимать, что из чеклиста сделано, и записывать: презентация —
 * была/нет; решение подтверждено?; дата следующей коммуникации; возражение».
 *
 * Данные отдельно от логики — по канону фронтового каталога
 * (`modules/features/CallChecklist/data/checklist-catalog.ts`): состав
 * правится здесь, сервисы его только читают.
 */
export const EVENT_TASK_CHECKLIST_CATALOG: readonly EventTaskChecklistItemDef[] =
    [
        {
            code: EVENT_TASK_CHECKLIST_ITEM.presentationDone,
            title: 'Презентация проведена',
            eventTypes: ['presentation'],
            // Дата последней проведённой презентации уже есть на всех трёх
            // сущностях — отдельного поля «презентация была/нет» не нужно.
            fieldCode: 'last_pres_done_date',
            sort: 10,
        },
        {
            code: EVENT_TASK_CHECKLIST_ITEM.decisionConfirmed,
            title: 'Решение подтверждено',
            // `hot` — «Звонок по решению» во внутреннем алфавите событий.
            eventTypes: ['hot'],
            // Поля «решение подтверждено» на порталах НЕТ: есть только даты
            // хвоста (op_xvost_decision_call_date / _date_agreement), а они
            // про «когда звоним», а не про «клиент подтвердил».
            fieldCode: null,
            sort: 20,
        },
        {
            code: EVENT_TASK_CHECKLIST_ITEM.nextCommunicationSet,
            title: 'Дата следующей коммуникации назначена',
            eventTypes: null,
            fieldCode: 'call_next_date',
            sort: 30,
        },
        {
            code: EVENT_TASK_CHECKLIST_ITEM.objectionRecorded,
            title: 'Возражения зафиксированы',
            eventTypes: null,
            // `op_efield_fail_reason` — справочник ПРИЧИН ОТКАЗА; писать в
            // него возражение живого клиента нельзя (перетрёт финальную
            // причину). Текстового поля возражения на порталах нет.
            fieldCode: null,
            sort: 40,
        },
    ];

/**
 * Пункты, под которые поля на порталах НЕ заведены — их итог уходит только
 * в историю и комментарий задачи. Список для владельца: пока эти поля не
 * появятся в реестре, результат чек-листа по ним не станет фильтруемым.
 */
export const EVENT_TASK_CHECKLIST_FIELDLESS_CODES: readonly EventTaskChecklistItemCode[] =
    EVENT_TASK_CHECKLIST_CATALOG.filter(def => def.fieldCode === null).map(
        def => def.code,
    );

/**
 * Состав чек-листа для планируемого события: общие пункты + пункты типа.
 * Порядок — по `sort`, он же уезжает в `SORT_INDEX`.
 */
export const buildEventTaskChecklist = (
    planEventType: EventReportEventType | null,
): EventTaskChecklistItemDef[] =>
    EVENT_TASK_CHECKLIST_CATALOG.filter(def => {
        if (def.eventTypes === null) return true;
        return planEventType !== null && def.eventTypes.includes(planEventType);
    }).sort((a, b) => a.sort - b.sort);

/** Прочитанный пункт чек-листа закрываемой задачи. */
export interface EventTaskChecklistItemResult {
    /** Код каталога; `null` — пункт дописан менеджером руками. */
    code: EventTaskChecklistItemCode | null;
    title: string;
    done: boolean;
}

/** Итог чек-листа закрываемой задачи. */
export interface EventTaskChecklistOutcome {
    taskId: number;
    /** Пункты каталога, найденные в задаче. */
    items: EventTaskChecklistItemResult[];
    /** Пункты, дописанные менеджером (каталог их не знает). */
    extra: EventTaskChecklistItemResult[];
}

/** Заголовок к сравнению: регистр и лишние пробелы значения не имеют. */
const normalizeTitle = (raw: string): string =>
    raw.trim().replace(/\s+/g, ' ').toLowerCase();

const CODE_BY_TITLE = new Map<string, EventTaskChecklistItemCode>(
    EVENT_TASK_CHECKLIST_CATALOG.map(def => [
        normalizeTitle(def.title),
        def.code,
    ]),
);

/**
 * Сырые пункты `task.checklistitem.getlist` → типизированный итог.
 *
 * Что отбрасывается: САМ чек-лист (у контейнера `PARENT_ID` = 0 — это его
 * название, а не пункт) и пустые заголовки. Всё остальное, что не опознано
 * каталогом, уезжает в `extra`: менеджер мог дописать свои пункты, и терять
 * их в сводке нельзя.
 */
export const matchEventTaskChecklist = (
    taskId: number,
    rawItems: readonly IBXChecklistItem[],
): EventTaskChecklistOutcome => {
    const items: EventTaskChecklistItemResult[] = [];
    const extra: EventTaskChecklistItemResult[] = [];

    for (const raw of rawItems) {
        const title = String(raw?.TITLE ?? '').trim();
        if (!title) continue;
        // Контейнер чек-листа: PARENT_ID пустой либо 0.
        if (!Number(raw?.PARENT_ID ?? 0)) continue;

        const result: EventTaskChecklistItemResult = {
            code: CODE_BY_TITLE.get(normalizeTitle(title)) ?? null,
            title,
            done: raw?.IS_COMPLETE === 'Y',
        };
        (result.code ? items : extra).push(result);
    }

    return { taskId, items, extra };
};

/** Есть ли что писать в историю — пустой итог не рендерится вовсе. */
export const hasChecklistResults = (
    outcome: EventTaskChecklistOutcome | null,
): outcome is EventTaskChecklistOutcome =>
    Boolean(outcome && (outcome.items.length || outcome.extra.length));

/**
 * Строка итога для истории карточки и комментария задачи:
 *
 *   Чек-лист задачи: выполнено — «Презентация проведена»; не отмечено —
 *   «Возражения зафиксированы»
 *
 * Пустых половин не бывает: нечего написать — половина не рендерится,
 * нечего написать вовсе — возвращается пустая строка (блок пропускается).
 */
export const formatChecklistOutcomeLine = (
    outcome: EventTaskChecklistOutcome | null,
): string => {
    if (!hasChecklistResults(outcome)) return '';

    const all = [...outcome.items, ...outcome.extra];
    const quote = (item: EventTaskChecklistItemResult): string =>
        `«${item.title}»`;
    const done = all.filter(item => item.done).map(quote);
    const undone = all.filter(item => !item.done).map(quote);

    const parts: string[] = [];
    if (done.length) parts.push(`выполнено — ${done.join(', ')}`);
    if (undone.length) parts.push(`не отмечено — ${undone.join(', ')}`);
    return `Чек-лист задачи: ${parts.join('; ')}`;
};

/** Отмечен ли пункт каталога; `false` и когда пункта в задаче не было. */
export const isChecklistItemDone = (
    outcome: EventTaskChecklistOutcome | null,
    code: EventTaskChecklistItemCode,
): boolean =>
    Boolean(outcome?.items.some(item => item.code === code && item.done));
