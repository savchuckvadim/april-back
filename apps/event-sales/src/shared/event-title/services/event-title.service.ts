import { EnumEventPlanCode } from '@lib/shared/event-sales/types/plan-types';
import { PlanDto } from '@lib/shared/event-sales/dto/plan.dto';
import {
    EnumTaskEventType,
    EventTaskDto,
} from '@lib/shared/event-sales/dto/task.dto';

/**
 * Русские названия типов события задачи.
 *
 * Таблица, а не switch: TypeScript требует запись для КАЖДОГО значения
 * `EnumTaskEventType`, поэтому новый тип нельзя добавить, забыв про имя, —
 * и `switch` по строке больше не сравнивается с enum'ом «на глаз».
 *
 * Заявка (`xoRequest`/`xoLead`) — НЕ холодный звонок: клиент обратился сам, и
 * в названии события это обязано быть видно.
 */
const TASK_EVENT_TYPE_NAME: Record<EnumTaskEventType, string> = {
    [EnumTaskEventType.XO]: 'Холодный звонок',
    [EnumTaskEventType.XO_REQUEST]: 'Заявка',
    [EnumTaskEventType.XO_LEAD]: 'Лид',
    [EnumTaskEventType.WARM]: 'Звонок',
    [EnumTaskEventType.PRESENTATION]: 'Презентация',
    [EnumTaskEventType.HOT]: 'Звонок по решению',
    [EnumTaskEventType.IN_PROGRESS]: 'Звонок по решению',
    [EnumTaskEventType.MONEY_AWAIT_NEW]: 'Звонок по оплате',
    [EnumTaskEventType.MONEY_AWAIT]: 'Звонок по оплате',
    [EnumTaskEventType.SS]: 'Сервисный сигнал',
    [EnumTaskEventType.EVENT]: 'Событие',
    [EnumTaskEventType.SUPPLY]: 'Поставка',
};

export class EventTitleService {
    constructor() {}

    public getReportEventName(currentTask?: EventTaskDto) {
        if (!currentTask) {
            return { eventType: 'new', typeName: '', currentTaskTitle: '' };
        }
        return {
            eventType: currentTask.eventType,
            // Неизвестный код имени не получает — как и раньше (пустая строка).
            typeName: TASK_EVENT_TYPE_NAME[currentTask.eventType] ?? '',
            currentTaskTitle: currentTask.title,
        };
    }

    public getPlanEventName(plan: PlanDto) {
        let emoji = '';
        let color = '';
        let title = '';

        const type = plan.type.current.code;
        const typeName = plan.type.current.name;
        const name = plan.name;

        switch (type) {
            case EnumEventPlanCode.COLD:
                emoji = '🥶';
                color = 'bg-blue-500';
                title = emoji + ' ' + typeName;
                break;
            case EnumEventPlanCode.WARM:
                emoji = '';
                color = 'bg-red-500';
                title = emoji + ' ' + typeName;
                break;
            case EnumEventPlanCode.PRESENTATION:
                emoji = '⚡';
                color = 'bg-green-500';
                title = emoji + ' ' + typeName;
                break;
            case EnumEventPlanCode.HOT:
                emoji = '🔥';
                color = 'bg-red-500';
                title = emoji + ' ' + typeName;
                break;
            case EnumEventPlanCode.PAY:
                emoji = '💎';
                color = 'bg-yellow-500';
                title = emoji + ' ' + typeName;
                break;
            case EnumEventPlanCode.SUPPLY:
                emoji = '🚚';
                color = 'bg-blue-500';
                title = emoji + ' ' + typeName;
                break;
            default:
                break;
        }
        return {
            type,
            typeName, // без эмоджи
            name, // название плана которое дал юзер
            emoji, // эмоджи
            color, // цвет
            title, // typeName + эмоджи
        };
    }
}
