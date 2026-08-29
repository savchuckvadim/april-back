import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { IUserFieldConfig } from '@/modules/bitrix';
import { UserFieldConfigAddDto } from '@/modules/bitrix/domain/userfieldconfig/dto/userfieldconfig.dto';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { EnumQuestionnaireFieldSource } from '../dto/questionnaire-field-source.dto';
import { QuestionnaireFieldSource } from '../services/questionnaire-field-source.service';
import { QuestionnaireBitrixFieldsReader } from '../services/questionnaire-bitrix-fields.reader';
import {
    QuestionnaireFieldDraft,
    QuestionnaireFieldWriter,
} from '../services/questionnaire-field-writer';

/**
 * Спека записи поля в носитель портала.
 *
 * Проверяется ровно то, из-за чего эту ручку и нельзя было заменить
 * формулой на фронте:
 *  - имя поля и идентификаторы значений списка приезжают ИЗ БИТРИКСА
 *    (собранное формулой имя врёт — боевой инцидент
 *    `UF_CRM_94_TRANSCRIPT_1`, а без `id` значения ответ-список записать
 *    некуда);
 *  - повтор с тем же кодом не заводит дубль: поле сначала ищется среди
 *    заведённых, и найденное возвращается как есть;
 *  - нехватка прав администратора CRM — это внятный отказ с рецептом, а
 *    не degraded-режим: писать `crm.item.fields` не умеет в принципе;
 *  - множественное поле отклоняется ДО похода в Битрикс: ответ анкеты
 *    уехал бы в первый элемент и исчез.
 */

const SMART_SOURCE: QuestionnaireFieldSource = {
    entity: EnumQuestionnaireFieldSource.smart,
    smartId: 3,
    entityTypeId: 177,
    // Поля адресует ТОЛЬКО этот идентификатор: `CRM_{id из crm.type.list}`.
    bitrixId: 7,
    title: 'Презентации',
    ufEntityId: 'CRM_7',
    snapshotEntityType: PbxEntityTypePrisma.SMART,
    snapshotEntityId: 3,
};

/** Смарт без идентификатора типа: адресовать поля нечем. */
const BROKEN_SMART_SOURCE: QuestionnaireFieldSource = {
    ...SMART_SOURCE,
    bitrixId: null,
    ufEntityId: null,
    warning: 'У смарта не записан идентификатор типа из crm.type.list',
};

const DRAFT: QuestionnaireFieldDraft = {
    code: 'decision',
    title: 'Итог презентации',
    type: 'string',
};

const LIST_DRAFT: QuestionnaireFieldDraft = {
    code: 'decision',
    title: 'Итог презентации',
    type: 'enumeration',
    items: [{ title: 'Тендер', code: 'tender' }, { title: 'Отказ' }],
};

const makeWriter = () => {
    const bitrix = {
        userFieldConfig: {
            getAll: jest.fn().mockResolvedValue([]),
            add: jest.fn(),
            get: jest.fn(),
        },
        user: { isAdmin: jest.fn() },
    };
    // Разбор ответа Битрикса берём НАСТОЯЩИЙ: созданное поле обязано
    // выглядеть ровно так же, как то же поле в списке выбора.
    const reader = new QuestionnaireBitrixFieldsReader({} as never);
    const writer = new QuestionnaireFieldWriter(reader);
    return { writer, bitrix };
};

/** Что уехало в `userfieldconfig.add`: `mock.calls` типизирован как any. */
const addedField = (add: jest.Mock): Partial<IUserFieldConfig> => {
    const [dto] = add.mock.calls[0] as [UserFieldConfigAddDto];
    return dto.field;
};

/** Отказ записи как Error: сравнивать с успешным результатом нечего. */
const failure = async (run: Promise<unknown>): Promise<Error> => {
    try {
        await run;
    } catch (error) {
        return error as Error;
    }
    throw new Error('Ожидался отказ, но запись прошла');
};

describe('QuestionnaireFieldWriter', () => {
    afterEach(() => jest.clearAllMocks());

    describe('создание поля', () => {
        it('отдаёт имя и идентификаторы значений так, как их вернул Битрикс', async () => {
            const { writer, bitrix } = makeWriter();
            // Битрикс завёл поле под ДРУГИМ именем: имя, собранное
            // формулой, отдавать владельцу нельзя.
            bitrix.userFieldConfig.add.mockResolvedValue({
                result: { field: { id: 555 } },
            });
            bitrix.userFieldConfig.get.mockResolvedValue({
                result: {
                    field: {
                        id: 555,
                        fieldName: 'UF_CRM_7_DECISION_1',
                        userTypeId: 'enumeration',
                        xmlId: 'DECISION',
                        multiple: 'N',
                        mandatory: 'N',
                        editFormLabel: { ru: 'Итог презентации' },
                        enum: [
                            { id: '301', value: 'Тендер', xmlId: 'TENDER' },
                            { id: '302', value: 'Отказ', xmlId: 'DECISION_2' },
                        ],
                    },
                },
            });

            const result = await writer.create(
                bitrix as never,
                SMART_SOURCE,
                LIST_DRAFT,
            );

            expect(result.created).toBe(true);
            expect(result.field.fieldName).toBe('UF_CRM_7_DECISION_1');
            expect(result.field.items.map(item => item.id)).toEqual([301, 302]);
            expect(bitrix.userFieldConfig.get).toHaveBeenCalledWith({
                moduleId: 'crm',
                id: 555,
            });
        });

        it('адресует поле идентификатором типа, а не entityTypeId', async () => {
            const { writer, bitrix } = makeWriter();
            bitrix.userFieldConfig.add.mockResolvedValue({
                result: {
                    field: {
                        id: 4,
                        fieldName: 'UF_CRM_7_DECISION',
                        userTypeId: 'string',
                        multiple: 'N',
                        mandatory: 'Y',
                    },
                },
            });
            bitrix.userFieldConfig.get.mockResolvedValue({
                result: {
                    field: {
                        id: 4,
                        fieldName: 'UF_CRM_7_DECISION',
                        userTypeId: 'string',
                        xmlId: 'DECISION',
                        multiple: 'N',
                        mandatory: 'Y',
                        editFormLabel: { ru: 'Итог презентации' },
                    },
                },
            });

            await writer.create(bitrix as never, SMART_SOURCE, {
                ...DRAFT,
                isRequired: true,
            });

            expect(bitrix.userFieldConfig.getAll).toHaveBeenCalledWith('crm', {
                entityId: 'CRM_7',
            });
            const payload = addedField(bitrix.userFieldConfig.add);
            expect(payload.entityId).toBe('CRM_7');
            expect(payload.fieldName).toBe('UF_CRM_7_DECISION');
            // Множественность анкете не годится ни при каких настройках.
            expect(payload.multiple).toBe('N');
            expect(payload.mandatory).toBe('Y');
            // xmlId — стабильный код: он переживает переименование подписи.
            expect(payload.xmlId).toBe('DECISION');
        });

        it('кодирует значения списка: свой код и подставленный по порядку', async () => {
            const { writer, bitrix } = makeWriter();
            bitrix.userFieldConfig.add.mockResolvedValue({
                result: { field: { id: 9 } },
            });
            bitrix.userFieldConfig.get.mockResolvedValue({
                result: {
                    field: {
                        id: 9,
                        fieldName: 'UF_CRM_7_DECISION',
                        userTypeId: 'enumeration',
                        multiple: 'N',
                        mandatory: 'N',
                        enum: [
                            { id: '1', value: 'Тендер', xmlId: 'TENDER' },
                            { id: '2', value: 'Отказ', xmlId: 'DECISION_2' },
                        ],
                    },
                },
            });

            await writer.create(bitrix as never, SMART_SOURCE, LIST_DRAFT);

            const payload = addedField(bitrix.userFieldConfig.add);
            expect(payload.enum).toEqual([
                { value: 'Тендер', def: 'N', sort: 100, xmlId: 'TENDER' },
                { value: 'Отказ', def: 'N', sort: 200, xmlId: 'DECISION_2' },
            ]);
        });

        it('предупреждает, когда идентификаторы значений не прочитались', async () => {
            const { writer, bitrix } = makeWriter();
            bitrix.userFieldConfig.add.mockResolvedValue({
                result: { field: { id: 9 } },
            });
            bitrix.userFieldConfig.get.mockResolvedValue({
                result: {
                    field: {
                        id: 9,
                        fieldName: 'UF_CRM_7_DECISION',
                        userTypeId: 'enumeration',
                        multiple: 'N',
                        mandatory: 'N',
                        enum: [{ value: 'Тендер', xmlId: 'TENDER' }],
                    },
                },
            });

            const result = await writer.create(
                bitrix as never,
                SMART_SOURCE,
                LIST_DRAFT,
            );

            expect(result.warning).toContain('Идентификаторы значений');
        });
    });

    describe('повторный вызов', () => {
        it('дубля не создаёт: возвращает уже заведённое поле', async () => {
            const { writer, bitrix } = makeWriter();
            // Имя в Битриксе может лежать в другом регистре — сравнение
            // регистронезависимое, иначе завели бы второе такое же поле.
            bitrix.userFieldConfig.getAll.mockResolvedValue([
                { id: 77, fieldName: 'uf_crm_7_decision' },
            ]);
            bitrix.userFieldConfig.get.mockResolvedValue({
                result: {
                    field: {
                        id: 77,
                        fieldName: 'UF_CRM_7_DECISION',
                        userTypeId: 'string',
                        xmlId: 'DECISION',
                        multiple: 'N',
                        mandatory: 'N',
                        editFormLabel: { ru: 'Итог презентации' },
                    },
                },
            });

            const result = await writer.create(
                bitrix as never,
                SMART_SOURCE,
                DRAFT,
            );

            expect(bitrix.userFieldConfig.add).not.toHaveBeenCalled();
            expect(result.created).toBe(false);
            expect(result.field.fieldName).toBe('UF_CRM_7_DECISION');
            expect(result.warning).toContain('уже было');
        });

        it('говорит, что у найденного поля другой тип', async () => {
            const { writer, bitrix } = makeWriter();
            bitrix.userFieldConfig.getAll.mockResolvedValue([
                { id: 77, fieldName: 'UF_CRM_7_DECISION' },
            ]);
            bitrix.userFieldConfig.get.mockResolvedValue({
                result: {
                    field: {
                        id: 77,
                        fieldName: 'UF_CRM_7_DECISION',
                        userTypeId: 'date',
                        multiple: 'N',
                        mandatory: 'N',
                    },
                },
            });

            const result = await writer.create(
                bitrix as never,
                SMART_SOURCE,
                DRAFT,
            );

            expect(result.created).toBe(false);
            expect(result.warning).toContain('date');
            expect(result.warning).toContain('другим кодом');
        });
    });

    describe('нехватка прав администратора CRM', () => {
        it('отказывает с рецептом, а не создаёт поле вслепую', async () => {
            const { writer, bitrix } = makeWriter();
            bitrix.userFieldConfig.getAll.mockRejectedValue(
                new Error(
                    'Вы не можете просматривать настройки пользовательских полей',
                ),
            );
            bitrix.user.isAdmin.mockResolvedValue({ result: false });

            await expect(
                writer.create(bitrix as never, SMART_SOURCE, DRAFT),
            ).rejects.toBeInstanceOf(ForbiddenException);

            expect(bitrix.user.isAdmin).toHaveBeenCalled();
            expect(bitrix.userFieldConfig.add).not.toHaveBeenCalled();
        });

        it('называет причину словами владельца портала', async () => {
            const { writer, bitrix } = makeWriter();
            bitrix.userFieldConfig.getAll.mockRejectedValue(
                new Error(
                    'Вы не можете просматривать настройки пользовательских полей',
                ),
            );
            bitrix.user.isAdmin.mockResolvedValue({ result: false });

            const error = await failure(
                writer.create(bitrix as never, SMART_SOURCE, DRAFT),
            );

            expect(error.message).toContain('user.admin=false');
            expect(error.message).toContain('Пересоздайте вебхук');
        });
    });

    describe('что отклоняется до похода в Битрикс', () => {
        it('множественное поле', async () => {
            const { writer, bitrix } = makeWriter();

            const error = await failure(
                writer.create(bitrix as never, SMART_SOURCE, {
                    ...DRAFT,
                    isMultiple: true,
                }),
            );

            expect(error).toBeInstanceOf(BadRequestException);
            expect(error.message).toContain('Множественное поле');
            expect(bitrix.userFieldConfig.getAll).not.toHaveBeenCalled();
            expect(bitrix.userFieldConfig.add).not.toHaveBeenCalled();
        });

        it('поле-список без значений', async () => {
            const { writer, bitrix } = makeWriter();

            const error = await failure(
                writer.create(bitrix as never, SMART_SOURCE, {
                    ...LIST_DRAFT,
                    items: [],
                }),
            );

            expect(error).toBeInstanceOf(BadRequestException);
            expect(error.message).toContain('без значений');
            expect(bitrix.userFieldConfig.add).not.toHaveBeenCalled();
        });

        it('код, из которого получается имя длиннее 50 символов', async () => {
            const { writer, bitrix } = makeWriter();

            const error = await failure(
                writer.create(bitrix as never, SMART_SOURCE, {
                    ...DRAFT,
                    code: 'A'.repeat(45),
                }),
            );

            expect(error).toBeInstanceOf(BadRequestException);
            expect(error.message).toContain('50');
            expect(bitrix.userFieldConfig.add).not.toHaveBeenCalled();
        });

        it('код с кириллицей: Битрикс такое имя не примет', async () => {
            const { writer, bitrix } = makeWriter();

            const error = await failure(
                writer.create(bitrix as never, SMART_SOURCE, {
                    ...DRAFT,
                    code: 'решение',
                }),
            );

            expect(error).toBeInstanceOf(BadRequestException);
            expect(error.message).toContain('латинские буквы');
        });

        it('смарт без идентификатора типа из crm.type.list', async () => {
            const { writer, bitrix } = makeWriter();

            const error = await failure(
                writer.create(bitrix as never, BROKEN_SMART_SOURCE, DRAFT),
            );

            expect(error).toBeInstanceOf(BadRequestException);
            expect(error.message).toContain('идентификатор типа');
            expect(bitrix.userFieldConfig.getAll).not.toHaveBeenCalled();
        });
    });
});
