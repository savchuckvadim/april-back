import { IBXTask } from '@lib/bitrix/domain/tasks/task';
import { PresentationStateCount } from './presentation-types';
import { IBXDeal } from '@lib/bitrix/domain';
import { EnumTaskEventType } from '../dto/task.dto';

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
