import { toBatchText } from '@lib/bitrix/consts/batch.consts';
import { BitrixDateTime } from '@/shared/lib/date';
import {
    eventDonePhrase,
    eventPlanPhrase,
} from '../../types/event-report.event-codes';
import {
    EventTaskChecklistOutcome,
    formatChecklistOutcomeLine,
} from '../task/event-task-checklist.catalog';

/**
 * Минимум контекста для строки истории — структурно совместим с
 * {@link EventReportContext}, но не тянет его целиком (юнит-тесты и
 * таймлайн-сервис передают узкие моки).
 */
export interface IEventHistoryCommentSource {
    reportEventType: string | null;
    planEventType: string | null;
    reportComment: string;
    planDeadline?: BitrixDateTime | null;
    /**
     * Итог чек-листа закрываемой задачи; null/undefined — чек-листов нет
     * (настройка выключена, задачи не было, пункты не заводились).
     */
    taskChecklist?: EventTaskChecklistOutcome | null;
}

/**
 * Строки записи истории события — общий формат для поля карточки
 * `op_history` / `op_mhistory` и таймлайн-комментария (gsirk):
 *
 *   Звонок совершён: <комментарий менеджера>
 *   Запланирована Презентация на 28 мая 14:30
 *
 * Правила:
 *  - слово «Отчёт» не пишется: тип события склоняется фразой
 *    («Презентация проведена», «Запланирован Звонок»);
 *  - обе части попадают в batch-команды, поэтому каждая строка уже
 *    batch-safe: переносы внутри комментария менеджера заменены на
 *    `%0A` (сырой `\n` доезжает до карточки подчёркиванием);
 *  - дату-время записи (когда событие произошло) вызывающий ставит
 *    первой строкой сам.
 */
export const buildEventHistoryParts = (
    src: IEventHistoryCommentSource,
): string[] => {
    const parts: string[] = [];

    if (src.reportEventType) {
        const done = eventDonePhrase(src.reportEventType);
        parts.push(src.reportComment ? `${done}: ${src.reportComment}` : done);
    } else if (src.reportComment) {
        parts.push(src.reportComment);
    }

    // Чек-лист описывает ЗАКРЫВАЕМУЮ задачу — идёт после «что сделано» и
    // до «что запланировано»; нечего писать — строки не будет вовсе.
    const checklistLine = formatChecklistOutcomeLine(src.taskChecklist ?? null);
    if (checklistLine) parts.push(checklistLine);

    if (src.planEventType) {
        const planned = eventPlanPhrase(src.planEventType);
        const when = src.planDeadline?.toRuHumanDateTime();
        parts.push(when ? `${planned} на ${when}` : planned);
    }

    return parts.map(toBatchText);
};
