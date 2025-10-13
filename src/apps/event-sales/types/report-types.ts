export enum EEventItemResultType {
    RESULT = 'result',
    NORESULT = 'noresult',
    EXPIRED = 'expired',
    NEW = 'new',
    CANCEL = 'cancel',
}

export type WorkStatus = {
    id: number;
    code: 'inJob' | 'setAside' | 'success' | 'fail';
    name: 'В работе' | 'Отложено' | 'Продажа' | 'Отказ';
    isActive: boolean;
};

export type NoresultReason = {
    id: number;
    code:
        | 'secretar'
        | 'nopickup'
        | 'nonumber'
        | 'busy'
        | 'noresult_notime'
        | 'nocontact'
        | 'giveup'
        | 'bay'
        | 'wrong'
        | 'auto';
    name:
        | 'Секретарь'
        | 'Недозвон - трубку не берут'
        | 'Занято'
        | 'Перенос - не было времени'
        | 'Контактера нет на месте'
        | 'Просят оставить свой номер'
        | 'Не интересует, до свидания'
        | 'По телефону отвечает не та организация'
        | 'Автоответчик';
    isActive: boolean;
};

export type FailType = {
    id: number;
    code:
        | 'garant'
        | 'go'
        | 'territory'
        | 'accountant'
        | 'autsorc'
        | 'depend'
        | 'op_prospects_nophone'
        | 'op_prospects_company'
        | 'failure';
    name:
        | 'Гарант/Запрет'
        | 'Покупает ГО'
        | 'Чужая территория'
        | 'Бухприх'
        | 'Аутсорсинг'
        | 'Несамостоятельная организация'
        | 'Недозвон'
        | 'Компания не существует'
        | 'Отказ';
    isActive: boolean;
};

export type FailReason = {
    id: number;
    code:
        | 'fail_notime'
        | 'c_habit'
        | 'c_prepay'
        | 'c_price'
        | 'to_expensive'
        | 'to_cheap'
        | 'nomoney'
        | 'noneed'
        | 'lpr'
        | 'employee'
        | 'fail_off';
    name:
        | 'Не было времени'
        | 'Конкуренты - привыкли'
        | 'Конкуренты - оплачено'
        | 'Конкуренты - цена'
        | 'Дорого/нет Денег'
        | 'Слишком дешево'
        | 'Нет денег'
        | 'Не видят надобности'
        | 'ЛПР против'
        | 'Ключевой сотрудник против'
        | 'Не хотят общаться';
    isActive: boolean;
};
