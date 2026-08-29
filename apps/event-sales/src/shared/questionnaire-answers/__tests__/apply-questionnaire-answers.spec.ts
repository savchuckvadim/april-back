import { EnumQuestionnaireControl } from '@lib/portal-lib/store/questionnaires';
import {
    normalizeSmartFieldName,
    SmartItemField,
    SmartItemFields,
} from '@lib/portal-lib/pbx/smart-item-fields';
import {
    applyQuestionnaireAnswers,
    buildMirrorItemsByKey,
} from '../apply-questionnaire-answers';
import { QuestionnaireSmartAnswer } from '../questionnaire-smart-answer.type';

/**
 * Канон каталога → поле элемента смарта. Правило одно и на все случаи: не
 * разобрали — пропускаем с внятной причиной, чужое значение не трогаем.
 */
const FIELDS: SmartItemField[] = [
    {
        key: 'ufCrm8Text',
        upperName: 'UF_CRM_8_TEXT',
        type: 'string',
        isMultiple: false,
        title: 'Комментарий',
        items: [],
    },
    {
        key: 'ufCrm8Sum',
        upperName: 'UF_CRM_8_SUM',
        type: 'money',
        isMultiple: false,
        title: 'Сумма',
        items: [],
    },
    {
        key: 'ufCrm8Day',
        upperName: 'UF_CRM_8_DAY',
        type: 'date',
        isMultiple: false,
        title: 'Дата',
        items: [],
    },
    {
        key: 'ufCrm8Flag',
        upperName: 'UF_CRM_8_FLAG',
        type: 'boolean',
        isMultiple: false,
        title: 'Флаг',
        items: [],
    },
    {
        key: 'ufCrm8Pick',
        upperName: 'UF_CRM_8_PICK',
        type: 'enumeration',
        isMultiple: false,
        title: 'Выбор',
        items: [
            { id: 11, value: 'Первый' },
            { id: 22, value: 'Второй' },
        ],
    },
];

const itemFields: SmartItemFields = {
    entityTypeId: 1040,
    byNormalizedName: Object.fromEntries(
        FIELDS.map(field => [normalizeSmartFieldName(field.upperName), field]),
    ),
};

const answer = (
    over?: Partial<QuestionnaireSmartAnswer>,
): QuestionnaireSmartAnswer => ({
    key: 'q:text',
    purpose: 'report',
    fieldName: 'UF_CRM_8_TEXT',
    fieldType: 'string',
    control: EnumQuestionnaireControl.string,
    value: 'Ответ менеджера',
    title: 'Комментарий',
    optionTitle: null,
    ...over,
});

const apply = (
    answers: QuestionnaireSmartAnswer[],
    over?: {
        fields?: Record<string, unknown>;
        purposes?: ('plan' | 'report')[];
        mirrorItemsByKey?: Record<
            string,
            { id: number; code: string; value: string }[]
        >;
    },
) => {
    const fields = over?.fields ?? {};
    const result = applyQuestionnaireAnswers({
        fields,
        itemFields,
        answers,
        purposes: over?.purposes ?? ['report'],
        timezone: 'Europe/Moscow',
        mirrorItemsByKey: over?.mirrorItemsByKey,
    });
    return { fields, ...result };
};

describe('applyQuestionnaireAnswers', () => {
    it('строка пишется по ФАКТИЧЕСКОМУ camel-ключу, а не по UF-имени', () => {
        const { fields, applied } = apply([answer()]);

        expect(fields).toEqual({ ufCrm8Text: 'Ответ менеджера' });
        expect(applied).toBe(1);
    });

    it('UF-имя матчится без оглядки на подчёркивания и регистр', () => {
        // Портал и Битрикс расходятся в написании — на этом уже горели
        // (инцидент UF_CRM_94_TRANSCRIPT_1).
        const { fields } = apply([answer({ fieldName: 'ufcrm8text' })]);

        expect(fields.ufCrm8Text).toBe('Ответ менеджера');
    });

    it('деньги — числом, «да/нет» — 1/0, дата — в формате портала', () => {
        const { fields } = apply([
            answer({
                key: 'q:sum',
                fieldName: 'UF_CRM_8_SUM',
                control: EnumQuestionnaireControl.money,
                value: '150000',
            }),
            answer({
                key: 'q:flag',
                fieldName: 'UF_CRM_8_FLAG',
                control: EnumQuestionnaireControl.boolean,
                value: 'Y',
            }),
            answer({
                key: 'q:day',
                fieldName: 'UF_CRM_8_DAY',
                control: EnumQuestionnaireControl.date,
                value: '2026-09-15',
            }),
        ]);

        expect(fields).toEqual({
            ufCrm8Sum: 150000,
            ufCrm8Flag: '1',
            ufCrm8Day: '15.09.2026',
        });
    });

    it('«нет» пишется нулём, а не пропускается как пустота', () => {
        const { fields } = apply([
            answer({
                fieldName: 'UF_CRM_8_FLAG',
                control: EnumQuestionnaireControl.boolean,
                value: 'N',
            }),
        ]);

        expect(fields.ufCrm8Flag).toBe('0');
    });

    it('вариант списка: код → id по справочнику резолва смарта', () => {
        const { fields } = apply(
            [
                answer({
                    fieldName: 'UF_CRM_8_PICK',
                    control: EnumQuestionnaireControl.enumeration,
                    value: 'second',
                    optionTitle: 'Второй',
                }),
            ],
            {
                mirrorItemsByKey: {
                    ufCrm8Pick: [
                        { id: 11, code: 'first', value: 'Первый' },
                        { id: 22, code: 'second', value: 'Второй' },
                    ],
                },
            },
        );

        expect(fields.ufCrm8Pick).toBe(22);
    });

    it('справочник пересобрали — id из зеркала не пишется, ищем подписью', () => {
        const { fields } = apply(
            [
                answer({
                    fieldName: 'UF_CRM_8_PICK',
                    control: EnumQuestionnaireControl.enumeration,
                    value: 'second',
                    optionTitle: 'Второй',
                }),
            ],
            {
                // Живого элемента 99 в поле нет — зеркало устарело.
                mirrorItemsByKey: {
                    ufCrm8Pick: [{ id: 99, code: 'second', value: 'Второй' }],
                },
            },
        );

        expect(fields.ufCrm8Pick).toBe(22);
    });

    it('вариант завели руками (кода нет) — резолвится подписью', () => {
        const { fields } = apply([
            answer({
                fieldName: 'UF_CRM_8_PICK',
                control: EnumQuestionnaireControl.enumeration,
                value: 'pervyi',
                optionTitle: 'Первый',
            }),
        ]);

        expect(fields.ufCrm8Pick).toBe(11);
    });

    it('варианта больше нет — поле не трогаем, причина в предупреждении', () => {
        const { fields, warnings, applied } = apply([
            answer({
                fieldName: 'UF_CRM_8_PICK',
                control: EnumQuestionnaireControl.enumeration,
                value: 'third',
                optionTitle: 'Третий',
            }),
        ]);

        expect(fields).toEqual({});
        expect(applied).toBe(0);
        expect(warnings[0]).toContain('Третий');
    });

    it('дата не в каноне — пропуск с причиной, а не запись мусора', () => {
        const { fields, warnings } = apply([
            answer({
                fieldName: 'UF_CRM_8_DAY',
                control: EnumQuestionnaireControl.date,
                value: '15.09.2026',
            }),
        ]);

        expect(fields).toEqual({});
        expect(warnings[0]).toContain('не дата');
    });

    it('поле сменило тип на портале — ответ в него не пишется', () => {
        const { fields, warnings } = apply([
            answer({
                // Каталог помнит строку, а поле теперь список.
                fieldName: 'UF_CRM_8_PICK',
                fieldType: 'string',
                control: EnumQuestionnaireControl.string,
                value: 'что угодно',
            }),
        ]);

        expect(fields).toEqual({});
        expect(warnings[0]).toContain('enumeration');
    });

    it('ответ чужого назначения не применяется', () => {
        const { fields } = apply([answer({ purpose: 'plan' })], {
            purposes: ['report'],
        });

        expect(fields).toEqual({});
    });

    it('элемент на две роли (перенос) принимает ОБА назначения', () => {
        // На переносе план-джоба нет вовсе: элемент один и на отчёт, и
        // на новый план — ответы плана раньше пропадали здесь молча.
        const { fields, applied } = apply(
            [
                answer({ purpose: 'report' }),
                answer({
                    key: 'q:plan',
                    purpose: 'plan',
                    fieldName: 'UF_CRM_8_SUM',
                    control: EnumQuestionnaireControl.money,
                    value: '150000',
                }),
            ],
            { purposes: ['report', 'plan'] },
        );

        expect(applied).toBe(2);
        expect(fields.ufCrm8Text).toBe('Ответ менеджера');
        expect(fields.ufCrm8Sum).toBe(150000);
    });

    it('занятый потоком ключ не перезаписывается', () => {
        const { fields, warnings } = apply([answer()], {
            fields: { ufCrm8Text: 'значение потока' },
        });

        expect(fields.ufCrm8Text).toBe('значение потока');
        expect(warnings[0]).toContain('уже заполняет сам поток');
    });

    it('одна беда не рушит соседние ответы', () => {
        const { fields, applied, warnings } = apply([
            answer({ key: 'q:gone', fieldName: 'UF_CRM_8_MISSING' }),
            answer(),
        ]);

        expect(applied).toBe(1);
        expect(fields.ufCrm8Text).toBe('Ответ менеджера');
        expect(warnings).toHaveLength(1);
    });
});

describe('buildMirrorItemsByKey', () => {
    it('справочники резолва перекладываются на camel-ключи полей', () => {
        const byKey = buildMirrorItemsByKey({
            ufKeyByCode: {
                PRES_FAIL_REASON: 'ufCrm8FailReason',
                PRES_RESULT: 'ufCrm8Result',
            },
            enumItems: {
                PRES_FAIL_REASON: [
                    { id: 401, code: 'pres_fail_notime', value: 'Нет времени' },
                ],
                // Поля нет в ufKeyByCode — класть его некуда.
                PRES_UNKNOWN: [{ id: 1, code: 'x', value: 'X' }],
            },
        });

        expect(byKey).toEqual({
            ufCrm8FailReason: [
                { id: 401, code: 'pres_fail_notime', value: 'Нет времени' },
            ],
        });
    });
});
