import { PlanDto } from '../../dto/event-sale-flow/plan.dto';
import {
    EnumTaskEventType,
    EventTaskDto,
} from '../../dto/event-sale-flow/task.dto';
import { EnumEventPlanCode } from '../../types/plan-types';

export class EventTitleService {
    constructor() {}

    public getReportEventName(currentTask?: EventTaskDto) {
        let eventType = 'new';
        let typeName = '';
        let currentTaskTitle = '';
        if (currentTask) {
            eventType = currentTask.eventType;
            currentTaskTitle = currentTask.title;
            switch (eventType) {
                case EnumTaskEventType.XO:
                    typeName = 'Холодный звонок';
                    break;
                case EnumTaskEventType.WARM:
                    typeName = 'Звонок';
                    break;
                case EnumTaskEventType.PRESENTATION:
                    typeName = 'Презентация';
                    break;
                case EnumTaskEventType.IN_PROGRESS:
                    typeName = 'Звонок по решению';
                    break;
                case EnumTaskEventType.MONEY_AWAIT:
                    typeName = 'Звонок по оплате';
                    break;
                case EnumTaskEventType.EVENT:
                    typeName = 'Событие';
                    break;
                case EnumTaskEventType.SUPPLY:
                    typeName = 'Поставка';
                    break;
                default:
                    break;
            }
        }

        return {
            eventType,
            typeName,
            currentTaskTitle,
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
