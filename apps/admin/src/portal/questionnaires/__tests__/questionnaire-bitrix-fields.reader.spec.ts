import { Logger } from '@nestjs/common';
import { BxUserFieldConfigService } from '@/modules/bitrix/domain/userfieldconfig/services/bx-userfieldconfig.service';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { EnumQuestionnaireFieldSource } from '../dto/questionnaire-field-source.dto';
import { QuestionnaireFieldSource } from '../services/questionnaire-field-source.service';
import {
    QuestionnaireBitrix,
    QuestionnaireBitrixFieldsReader,
} from '../services/questionnaire-bitrix-fields.reader';

/**
 * Спека чтения живых полей. Проверяются три вещи, каждая из которых уже
 * стоила боевого инцидента или стоила бы:
 *  - ПОСТРАНИЧНОСТЬ: `userfieldconfig.list` отдаёт порядка 50 полей за
 *    раз; без обхода страниц поля владельца молча пропадают из списка
 *    выбора, и анкету не из чего собрать;
 *  - DEGRADED: без прав администратора CRM читаем `crm.item.fields`, но
 *    обязательно с оригинальными UF-именами — camelCase-имя в анкете
 *    стало бы якорем, по которому никто ничего не запишет;
 *  - CRM_{bitrixId} у смарта: без идентификатора типа полным способом не
 *    читаем вовсе, а не подставляем entityTypeId.
 */

const COMPANY_SOURCE: QuestionnaireFieldSource = {
    entity: EnumQuestionnaireFieldSource.company,
    smartId: null,
    entityTypeId: 4,
    bitrixId: null,
    title: 'Компания',
    ufEntityId: 'CRM_COMPANY',
    snapshotEntityType: PbxEntityTypePrisma.BTX_COMPANY,
    snapshotEntityId: 11,
};

const SMART_WITHOUT_TYPE: QuestionnaireFieldSource = {
    entity: EnumQuestionnaireFieldSource.smart,
    smartId: 3,
    entityTypeId: 177,
    bitrixId: null,
    title: 'Заявка',
    ufEntityId: null,
    snapshotEntityType: PbxEntityTypePrisma.SMART,
    snapshotEntityId: 3,
};

/** Страница ответа `userfieldconfig.list`. */
const page = (from: number, count: number) => ({
    result: {
        fields: Array.from({ length: count }, (_, index) => ({
            id: from + index,
            entityId: 'CRM_COMPANY',
            fieldName: `UF_CRM_${from + index}`,
            userTypeId: 'string',
            xmlId: null,
            multiple: 'N',
            mandatory: 'N',
            editFormLabel: { ru: `Поле ${from + index}` },
        })),
    },
});

/** Аргументы одного вызова транспорта: нас интересует только dto с фильтром. */
type CallTypeArgs = [
    unknown,
    unknown,
    unknown,
    { filter: Record<string, unknown> },
];

/** Живой сервис userfieldconfig поверх поддельного транспорта Битрикса. */
const makeUserFieldConfig = (pages: unknown[]) => {
    const callType = jest.fn();
    for (const response of pages) callType.mockResolvedValueOnce(response);
    const service = new BxUserFieldConfigService();
    service.init({ callType } as never);
    return { service, callType };
};

const makeReader = () => new QuestionnaireBitrixFieldsReader({} as never);

describe('QuestionnaireBitrixFieldsReader', () => {
    beforeAll(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });

    afterEach(() => jest.clearAllMocks());

    describe('постраничность', () => {
        it('поля со второй страницы не теряются', async () => {
            // 50 полей на первой странице — ровно тот размер, на котором
            // однократный запрос выглядит успешным и врёт.
            const { service, callType } = makeUserFieldConfig([
                page(1, 50),
                page(51, 1),
                { result: { fields: [] } },
            ]);
            const bitrix = {
                userFieldConfig: service,
            } as unknown as QuestionnaireBitrix;

            const result = await makeReader().readFields(
                bitrix,
                COMPANY_SOURCE,
            );

            expect(callType).toHaveBeenCalledTimes(3);
            expect(result.fields).toHaveLength(51);
            expect(result.fields.at(-1)?.fieldName).toBe('UF_CRM_51');
            expect(result.degraded).toBe(false);
        });

        it('следующая страница запрашивается от последнего идентификатора', async () => {
            const { service, callType } = makeUserFieldConfig([
                page(1, 50),
                { result: { fields: [] } },
            ]);
            const bitrix = {
                userFieldConfig: service,
            } as unknown as QuestionnaireBitrix;

            await makeReader().readFields(bitrix, COMPANY_SOURCE);

            const calls = callType.mock.calls as unknown as CallTypeArgs[];
            expect(calls[0][3].filter.entityId).toBe('CRM_COMPANY');
            expect(calls[0][3].filter['>id']).toBe(0);
            // Вторая страница берётся от последнего id первой, а не с нуля.
            expect(calls[1][3].filter['>id']).toBe(50);
        });
    });

    describe('degraded-режим', () => {
        const denied = new Error(
            'Вы не можете просматривать настройки пользовательских полей',
        );

        const itemFieldsResponse = {
            result: {
                fields: {
                    ufCrm1712345678: {
                        type: 'date',
                        title: 'Дата решения',
                        isMultiple: false,
                        isRequired: true,
                        upperName: 'UF_CRM_1712345678',
                    },
                    title: {
                        type: 'string',
                        title: 'Название',
                        upperName: 'TITLE',
                    },
                },
            },
        };

        it('нехватка прав уводит на crm.item.fields с оригинальными именами', async () => {
            const fields = jest.fn().mockResolvedValue(itemFieldsResponse);
            const bitrix = {
                userFieldConfig: {
                    getAllWithItems: jest.fn().mockRejectedValue(denied),
                },
                item: { fields },
            } as unknown as QuestionnaireBitrix;

            const result = await makeReader().readFields(
                bitrix,
                COMPANY_SOURCE,
            );

            // Без 'Y' имена приходят camelCase, и якорь анкеты врёт.
            expect(fields).toHaveBeenCalledWith(4, 'Y');
            expect(result.degraded).toBe(true);
            expect(result.error).toContain('прав администратора CRM');
            // Штатное поле TITLE в каталог полей не попадает.
            expect(result.fields).toHaveLength(1);
            expect(result.fields[0].fieldName).toBe('UF_CRM_1712345678');
            expect(result.fields[0].mandatory).toBe(true);
            // Идентификаторы и внешние коды этим методом недоступны.
            expect(result.fields[0].bitrixId).toBeNull();
            expect(result.fields[0].xmlId).toBeNull();
        });

        it('смарт без идентификатора типа не адресуется через entityTypeId', async () => {
            const getAllWithItems = jest.fn();
            const fields = jest
                .fn()
                .mockResolvedValue({ result: { fields: {} } });
            const bitrix = {
                userFieldConfig: { getAllWithItems },
                item: { fields },
            } as unknown as QuestionnaireBitrix;

            const result = await makeReader().readFields(
                bitrix,
                SMART_WITHOUT_TYPE,
            );

            // Подставить CRM_177 значило бы получить ошибку прав на ровном
            // месте — полным способом не идём вовсе.
            expect(getAllWithItems).not.toHaveBeenCalled();
            expect(fields).toHaveBeenCalledWith(177, 'Y');
            expect(result.degraded).toBe(true);
        });

        it('портал недоступен обоими способами — пустой список, а не падение', async () => {
            const bitrix = {
                userFieldConfig: {
                    getAllWithItems: jest.fn().mockRejectedValue(denied),
                },
                item: {
                    fields: jest
                        .fn()
                        .mockRejectedValue(new Error('Портал не отвечает')),
                },
            } as unknown as QuestionnaireBitrix;

            const result = await makeReader().readFields(
                bitrix,
                COMPANY_SOURCE,
            );

            expect(result.fields).toEqual([]);
            expect(result.degraded).toBe(true);
            expect(result.error).toBe('Портал не отвечает');
        });
    });

    describe('варианты списка', () => {
        it('элементы enumeration уезжают с идентификаторами Битрикса', async () => {
            const bitrix = {
                userFieldConfig: {
                    getAllWithItems: jest.fn().mockResolvedValue([
                        {
                            id: 909,
                            fieldName: 'UF_CRM_CLIENT_TYPE',
                            userTypeId: 'enumeration',
                            xmlId: 'CLIENT_TYPE',
                            multiple: 'N',
                            mandatory: 'N',
                            editFormLabel: { ru: 'Тип клиента' },
                            enum: [
                                {
                                    id: 1247,
                                    value: 'Тендер',
                                    xmlId: 'TENDER',
                                },
                            ],
                        },
                    ]),
                },
            } as unknown as QuestionnaireBitrix;

            const result = await makeReader().readFields(
                bitrix,
                COMPANY_SOURCE,
            );

            expect(result.fields[0].bitrixId).toBe(909);
            expect(result.fields[0].items).toEqual([
                { id: 1247, value: 'Тендер', xmlId: 'TENDER' },
            ]);
        });
    });
});
