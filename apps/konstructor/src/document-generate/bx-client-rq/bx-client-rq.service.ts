import { Injectable } from '@nestjs/common';
import { BxRqDto } from '../dto/bx-rq/bx-rq.dto';
import { ClientTypeEnum } from '../type/client.type';
import {
    ADDRESS_RQ_ITEM_CODE,
    BANK_RQ_ITEM_CODE,
    BX_ADDRESS_TYPE,
    RQ_ITEM_CODE,
} from '../type/bx-rq.type';

/**
 * Прочерки под ручное заполнение: договор печатается и без реквизитов
 * («рыба»), пустое место в нём лучше пустой строки.
 */
export const BLANK_WIDE = '________________________________________';
export const BLANK = '_____________________________';

/** Текст значения поля формы: строка или число; объекты и пустота — ''. */
export const fieldText = (value: unknown): string => {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value);
    if (value && typeof value === 'object') {
        const named = value as { name?: string; title?: string };
        return (named.name ?? named.title ?? '').trim();
    }
    return '';
};

/** Значение или прочерк. */
export const blank = (value: unknown, width: string = BLANK): string =>
    fieldText(value) || width;

/** Порядок частей адреса в строке. */
const ADDRESS_ORDER: ADDRESS_RQ_ITEM_CODE[] = [
    ADDRESS_RQ_ITEM_CODE.ADDRESS_POSTAL_CODE,
    ADDRESS_RQ_ITEM_CODE.ADDRESS_COUNTRY,
    ADDRESS_RQ_ITEM_CODE.ADDRESS_PROVINCE,
    ADDRESS_RQ_ITEM_CODE.ADDRESS_REGION,
    ADDRESS_RQ_ITEM_CODE.ADDRESS_CITY,
    ADDRESS_RQ_ITEM_CODE.ADDRESS_1,
    ADDRESS_RQ_ITEM_CODE.ADDRESS_2,
];

type Fields = Array<{ code: string; value: unknown }> | undefined;

const valueOf = (fields: Fields, code: string): string =>
    fieldText(fields?.find(field => field.code === code)?.value);

/**
 * Блок реквизитов клиента в договоре, построчно: набор легаси PHP
 * (название, адрес, телефон, ИНН, банк), у физлица ещё документ. Любое
 * пустое значение — прочерком, чтобы «рыбу» можно было дописать ручкой.
 */
@Injectable()
export class DocumentClientBxRqService {
    public getClientRq(
        clientRq: BxRqDto | undefined,
        clientType: ClientTypeEnum,
    ): string[] {
        const fields = clientRq?.fields as Fields;
        const isFiz = clientType === ClientTypeEnum.FIZ;
        const name = valueOf(
            fields,
            isFiz ? RQ_ITEM_CODE.PERSON_NAME : RQ_ITEM_CODE.FULLNAME,
        );
        const address = `Адрес: ${blank(this.addressOf(clientRq), BLANK_WIDE)}`;
        const phone = `Телефон: ${blank(valueOf(fields, RQ_ITEM_CODE.PHONE))}`;
        const inn = `ИНН: ${blank(valueOf(fields, RQ_ITEM_CODE.INN))}`;

        return isFiz
            ? [
                  blank(name, BLANK_WIDE),
                  ...this.documentLines(fields),
                  inn,
                  address,
                  phone,
                  ...this.bankLines(clientRq),
              ]
            : [
                  blank(name, BLANK_WIDE),
                  address,
                  phone,
                  inn,
                  ...this.bankLines(clientRq),
              ];
    }

    /** Документ физлица: вид, серия, номер, выдан (дата, кем), код подразделения. */
    private documentLines(fields: Fields): string[] {
        const issuedBy = valueOf(fields, RQ_ITEM_CODE.ISSUED_BY);
        const issued = `Документ выдан: ${blank(valueOf(fields, RQ_ITEM_CODE.DOCUMENT_DATE))}`;
        return [
            `Документ: ${blank(valueOf(fields, RQ_ITEM_CODE.DOCUMENT))}`,
            `Серия: ${blank(valueOf(fields, RQ_ITEM_CODE.DOCUMENT_SERIES))}`,
            `Номер: ${blank(valueOf(fields, RQ_ITEM_CODE.DOCUMENT_NUMBER))}`,
            issuedBy ? `${issued}, ${issuedBy}` : issued,
            `Код подразделения: ${blank(valueOf(fields, RQ_ITEM_CODE.DEPARTMENT_CODE))}`,
        ];
    }

    /** Банк текущего банковского реквизита; комментарий — только заполненный. */
    private bankLines(clientRq: BxRqDto | undefined): string[] {
        const bank = clientRq?.bank?.current?.fields as Fields;
        const comments = valueOf(bank, BANK_RQ_ITEM_CODE.BANK_COMMENTS);
        return [
            `Банк: ${blank(valueOf(bank, BANK_RQ_ITEM_CODE.BANK_NAME), BLANK_WIDE)}`,
            `Р/с: ${blank(valueOf(bank, BANK_RQ_ITEM_CODE.BANK_PC))}`,
            `К/с: ${blank(valueOf(bank, BANK_RQ_ITEM_CODE.BANK_KC))}`,
            `БИК: ${blank(valueOf(bank, BANK_RQ_ITEM_CODE.BANK_BIK))}`,
            ...(comments ? [comments] : []),
        ];
    }

    /**
     * Юридический адрес; у физлица он же адрес прописки (договорённость: в
     * конструкторе только юридический и фактический, другие типы Bitrix не
     * используются). Фактический — место оказания услуг, его сюда не
     * подставляем: пустой юридический печатается прочерком.
     */
    private addressOf(clientRq: BxRqDto | undefined): string {
        const item = (clientRq?.address?.items ?? []).find(
            address => Number(address.type_id) === BX_ADDRESS_TYPE.REGISTERED,
        );
        if (!item) return '';
        return ADDRESS_ORDER.map(code => valueOf(item.fields as Fields, code))
            .filter(Boolean)
            .join(', ');
    }
}
