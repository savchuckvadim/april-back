import { IBXTask } from '@/modules/bitrix/domain/tasks/task';
import { PresentationStateCount } from './presentation-types';
import { IBXDeal } from 'src/modules/bitrix/domain';
import { EnumTaskEventType } from '../dto/event-sale-flow/task.dto';

export interface IEventTask extends IBXTask {
    name: string;
    type: EV_TYPE;
    isExpired: 'no' | 'almost' | 'yes';
    /** Источник истины набора — `EnumTaskEventType` (DTO контракта фрейма). */
    eventType: EnumTaskEventType;

    presentation: null | PresentationStateCount;
    dealBase: null | IBXDeal;
    originalEventType?: 'presentation' | null;
    isPresentationCanceled?: boolean;
}

export enum EV_TYPE {
    XO = 'Холодный',
    WARM = 'Звонок',
    PRES = 'Презентация',
    HOT = 'Решение',
    MONEY = 'Оплата',
    SS = 'Сервисный сигнал',
    SUPPLY = 'Поставка',
}
