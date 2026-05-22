import { EBxMethod } from 'src/modules/bitrix/core';
import { IBXField } from '../../crm';
import { IBXUser } from '../../interfaces/bitrix.interface';
import { CrmGetRequestType } from '../../crm/type/crm-request.type';
import {
    AddRequestType,
    ListRequestType,
    UpdateRequestType,
} from '../../type/request.type';

export type UserSchema = {
    [EBxMethod.ADD]: {
        request: AddRequestType<IBXUser>;
        response: number;
    };
    [EBxMethod.GET]: {
        request: ListRequestType<IBXUser>;
        response: IBXUser[];
    };
    [EBxMethod.SEARCH]: {
        request: AddRequestType<IBXUser>;
        response: IBXUser[];
    };
    [EBxMethod.CURRENT]: {
        request: {};
        response: IBXUser;
    };
    [EBxMethod.UPDATE]: {
        request: UpdateRequestType<IBXUser>;
        response: boolean;
    };
    [EBxMethod.FIELDS]: {
        //получить список имен полей пользователя
        request: undefined;
        response: { [key in keyof IBXUser & string]?: string };
    };

    [EBxMethod.USER_FIELD_LIST]: {
        //получить список имен полей пользователя
        request: { id: number | string; select?: string[] };
        response: IBXField[];
    };
    [EBxMethod.USER_FIELD_ADD]: {
        //получить список имен полей пользователя
        request: { fields: AddRequestType<IBXField> };
        response: number;
    };
    [EBxMethod.USER_FIELD_UPDATE]: {
        //получить список имен полей пользователя
        request: { id: number | string; fields: AddRequestType<IBXField> };
        response: boolean;
    };
    [EBxMethod.USER_FIELD_DELETE]: {
        //получить список имен полей пользователя
        request: { id: number | string };
        response: { fields: IBXField[] };
    };
};
