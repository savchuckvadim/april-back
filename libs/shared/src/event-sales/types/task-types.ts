import { IBXTask } from '@lib/bitrix/domain/tasks/task';
import { PresentationStateCount } from './presentation-types';
import { IBXDeal } from '@lib/bitrix/domain';

export interface IEventTask extends IBXTask {
    name: string;
    type: EV_TYPE;
    isExpired: 'no' | 'almost' | 'yes';
    eventType:
        | 'xo'
        | 'warm'
        | 'presentation'
        | 'in_progress'
        | 'money_await'
        | 'event'
        | 'supply';

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
