import { Logger, NotFoundException } from '@nestjs/common';
import { PbxEntityTypePrisma } from '@/shared/enums';
import {
    PortalQuestionnaireItemCheckInput,
    PortalQuestionnaireItemRecord,
    PortalQuestionnaireRecord,
    QuestionnaireFieldMirror,
    QuestionnaireFieldMirrorOption,
    readQuestionnaireFieldMirror,
} from '@lib/portal-lib/store/questionnaires';
import { EnumQuestionnaireFieldSource } from '../dto/questionnaire-field-source.dto';
import { QuestionnaireFieldSource } from '../services/questionnaire-field-source.service';
import {
    QuestionnaireLiveField,
    QuestionnaireLiveFields,
} from '../services/questionnaire-bitrix-fields.reader';
import { QuestionnaireCheckService } from '../services/questionnaire-check.service';

/**
 * Спека сверки привязок. Проверяется главное правило: НЕПОЛНЫЕ ДАННЫЕ НЕ
 * ЛОМАЮТ АНКЕТУ. Прочитали урезанным способом — обновили отметку
 * проверки и разошлись; объявить поле пропавшим можно, только увидев все
 * места, где оно могло быть.
 */

const PORTAL_ID = 7;

const source = (
    entity: EnumQuestionnaireFieldSource,
    entityTypeId: number,
    ufEntityId: string,
): QuestionnaireFieldSource => ({
    entity,
    smartId: null,
    entityTypeId,
    bitrixId: null,
    title: entity,
    ufEntityId,
    snapshotEntityType: PbxEntityTypePrisma.BTX_COMPANY,
    snapshotEntityId: 11,
});

/**
 * Смарт-носитель. Их у портала много, поэтому источник опознаётся по
 * `smartId`, а не по типу: первый попавшийся смарт — это чужой набор
 * полей.
 */
const smartSource = (
    smartId: number,
    entityTypeId: number,
    bitrixId: number,
    title: string,
): QuestionnaireFieldSource => ({
    entity: EnumQuestionnaireFieldSource.smart,
    smartId,
    entityTypeId,
    bitrixId,
    title,
    ufEntityId: `CRM_${bitrixId}`,
    snapshotEntityType: PbxEntityTypePrisma.SMART,
    snapshotEntityId: smartId,
});

const SOURCES = [
    source(EnumQuestionnaireFieldSource.company, 4, 'CRM_COMPANY'),
    source(EnumQuestionnaireFieldSource.deal, 2, 'CRM_DEAL'),
    source(EnumQuestionnaireFieldSource.lead, 1, 'CRM_LEAD'),
    source(EnumQuestionnaireFieldSource.contact, 3, 'CRM_CONTACT'),
    smartSource(12, 177, 7, 'Презентации'),
    smartSource(13, 181, 9, 'Звонки По решению'),
];

/** Ключ носителя в карте прочитанного: у смарта он со своим id. */
const liveKey = (entitySource: QuestionnaireFieldSource): string =>
    entitySource.smartId === null
        ? entitySource.entity
        : `smart:${entitySource.smartId}`;

const makeItem = (
    over: Partial<PortalQuestionnaireItemRecord> = {},
): PortalQuestionnaireItemRecord => ({
    id: 'item-1',
    questionnaireId: 'q-1',
    portalId: PORTAL_ID,
    code: 'decision_date',
    title: 'Дата решения',
    placeholder: null,
    hint: null,
    groupTitle: null,
    sort: 500,
    control: 'date',
    isMultiple: false,
    isRequired: false,
    requireChange: false,
    staleAfterDays: null,
    channel: 'crm',
    targetMode: 'auto',
    targetEntity: null,
    dtoPath: null,
    smartId: null,
    smartEntityTypeId: null,
    isNative: false,
    fieldName: 'UF_CRM_1712345678',
    fieldBitrixId: null,
    fieldXmlId: null,
    fieldCode: null,
    fieldType: 'date',
    fieldStatus: 'ok',
    fieldCheckedAt: null,
    meta: {},
    isActive: true,
    options: [],
    ...over,
});

const makeRecord = (
    items: PortalQuestionnaireItemRecord[],
): PortalQuestionnaireRecord => ({
    id: 'q-1',
    portalId: PORTAL_ID,
    domain: 'gsr.bitrix24.ru',
    appCode: 'event-sales',
    code: 'refine',
    title: 'Доработка',
    hint: null,
    purpose: 'plan',
    presentation: 'inline',
    place: 'plan',
    persist: 'onChange',
    conditions: [{ kind: 'planType', values: ['refine'] }],
    configKey: null,
    legacyChecklistId: null,
    isActive: true,
    sort: 500,
    version: 3,
    updatedBy: null,
    createdAt: null,
    updatedAt: null,
    items,
});

const makeField = (
    over: Partial<QuestionnaireLiveField> = {},
): QuestionnaireLiveField => ({
    fieldName: 'UF_CRM_1712345678',
    title: 'Дата решения',
    type: 'date',
    multiple: false,
    mandatory: false,
    bitrixId: 555,
    xmlId: 'DECISION_DATE',
    items: [],
    ...over,
});

/**
 * `meta` вопроса со слепком ПРИНЯТОГО — тем, как поле называлось в
 * Битриксе, когда владелец брал его в анкету. Именно с ним сверка и
 * сравнивает живое: без слепка ей не с чем сравнивать, и переименованием
 * она живую подпись не объявляет.
 */
const acceptedMeta = (
    state: {
        title: string;
        type?: string | null;
        options?: QuestionnaireFieldMirrorOption[];
    },
    extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
    ...extra,
    bitrixField: {
        live: null,
        accepted: {
            title: state.title,
            type: state.type ?? null,
            options: state.options ?? [],
            at: '2026-08-01T10:00:00.000Z',
        },
    },
});

/** Слепки, которые сверка записала вопросу. */
const mirrorApplied = (
    mock: jest.Mock,
    index = 0,
): QuestionnaireFieldMirror =>
    readQuestionnaireFieldMirror(appliedBy(mock)[index]?.meta);

const makeDeps = (options: {
    record: PortalQuestionnaireRecord;
    /** Что вернуло чтение полей по носителям (ключ — `liveKey`). */
    live: Partial<Record<string, QuestionnaireLiveFields>>;
}) => {
    const questionnaires = {
        getById: jest.fn().mockResolvedValue(options.record),
        applyFieldCheck: jest.fn().mockResolvedValue(options.record),
    };
    const sourceService = {
        requireDomain: jest.fn().mockResolvedValue('gsr.bitrix24.ru'),
        listSources: jest.fn().mockResolvedValue(SOURCES),
    };
    const reader = {
        connect: jest.fn().mockResolvedValue({}),
        readFields: jest
            .fn()
            .mockImplementation(
                (_bitrix, entitySource: QuestionnaireFieldSource) =>
                    Promise.resolve(
                        options.live[liveKey(entitySource)] ?? {
                            fields: [],
                            degraded: false,
                        },
                    ),
            ),
    };
    const service = new QuestionnaireCheckService(
        questionnaires as never,
        sourceService as never,
        reader as never,
    );
    return { service, questionnaires, sourceService, reader };
};

/** Полное чтение носителя. */
const full = (fields: QuestionnaireLiveField[]): QuestionnaireLiveFields => ({
    fields,
    degraded: false,
});

/** Урезанное чтение носителя. */
const degraded = (
    fields: QuestionnaireLiveField[] = [],
): QuestionnaireLiveFields => ({
    fields,
    degraded: true,
    error: 'У REST-ключа портала нет прав администратора CRM',
});

/** Что сверка отправила в хранилище: аргументы applyFieldCheck(id, results). */
const appliedBy = (mock: jest.Mock): PortalQuestionnaireItemCheckInput[] =>
    (
        mock.mock.calls as unknown as [
            string,
            PortalQuestionnaireItemCheckInput[],
        ][]
    )[0][1];

describe('QuestionnaireCheckService', () => {
    beforeAll(() => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });

    afterEach(() => jest.clearAllMocks());

    describe('degraded-режим', () => {
        it('поле не «теряется»: статус прежний, обновлена только отметка', async () => {
            const { service, questionnaires } = makeDeps({
                record: makeRecord([makeItem()]),
                live: {
                    [EnumQuestionnaireFieldSource.company]: degraded(),
                    [EnumQuestionnaireFieldSource.deal]: degraded(),
                    [EnumQuestionnaireFieldSource.lead]: degraded(),
                },
            });

            const result = await service.check(PORTAL_ID, 'q-1');

            const applied = appliedBy(questionnaires.applyFieldCheck);
            expect(applied[0].status).toBeNull();
            expect(applied[0].checkedAt).toBeInstanceOf(Date);
            expect(applied[0].options).toEqual([]);
            expect(result.degraded).toBe(true);
            expect(result.items[0].status).toBe('ok');
            expect(result.items[0].changed).toBe(false);
        });

        it('одного неполного носителя в цепочке хватает, чтобы не объявлять пропажу', async () => {
            const { service, questionnaires } = makeDeps({
                record: makeRecord([makeItem()]),
                live: {
                    // Поле могло лежать на лиде, но лид прочитан урезанно.
                    [EnumQuestionnaireFieldSource.company]: full([]),
                    [EnumQuestionnaireFieldSource.deal]: full([]),
                    [EnumQuestionnaireFieldSource.lead]: degraded(),
                },
            });

            await service.check(PORTAL_ID, 'q-1');

            expect(
                appliedBy(questionnaires.applyFieldCheck)[0].status,
            ).toBeNull();
        });
    });

    describe('состояние привязки', () => {
        it('поля больше нет — статус missing', async () => {
            const { service, questionnaires } = makeDeps({
                record: makeRecord([makeItem()]),
                live: {
                    [EnumQuestionnaireFieldSource.company]: full([]),
                    [EnumQuestionnaireFieldSource.deal]: full([]),
                    [EnumQuestionnaireFieldSource.lead]: full([]),
                },
            });

            const result = await service.check(PORTAL_ID, 'q-1');

            expect(appliedBy(questionnaires.applyFieldCheck)[0].status).toBe(
                'missing',
            );
            expect(result.items[0].changed).toBe(true);
        });

        it('поле на месте — статус ok, идентификатор и внешний код обновлены', async () => {
            const { service, questionnaires } = makeDeps({
                record: makeRecord([makeItem({ fieldStatus: 'missing' })]),
                live: {
                    [EnumQuestionnaireFieldSource.company]: full([makeField()]),
                    [EnumQuestionnaireFieldSource.deal]: full([]),
                    [EnumQuestionnaireFieldSource.lead]: full([]),
                },
            });

            await service.check(PORTAL_ID, 'q-1');

            const applied = appliedBy(questionnaires.applyFieldCheck)[0];
            expect(applied.status).toBe('ok');
            expect(applied.fieldBitrixId).toBe(555);
            expect(applied.fieldXmlId).toBe('DECISION_DATE');
        });

        it('сменившийся тип не перезаписывает старый — иначе вопрос молча вернётся в каталог', async () => {
            const { service, questionnaires } = makeDeps({
                record: makeRecord([makeItem({ fieldType: 'date' })]),
                live: {
                    [EnumQuestionnaireFieldSource.company]: full([
                        makeField({ type: 'string' }),
                    ]),
                    [EnumQuestionnaireFieldSource.deal]: full([]),
                    [EnumQuestionnaireFieldSource.lead]: full([]),
                },
            });

            const result = await service.check(PORTAL_ID, 'q-1');

            const applied = appliedBy(questionnaires.applyFieldCheck)[0];
            expect(applied.status).toBe('type_changed');
            expect(applied.fieldType).toBeUndefined();
            expect(result.items[0].comment).toContain('сменило тип');
        });

        it('жёсткий носитель проверяется только по своей сущности', async () => {
            const { service, reader, questionnaires } = makeDeps({
                record: makeRecord([
                    makeItem({
                        targetMode: 'entity',
                        targetEntity: 'contact',
                    }),
                ]),
                live: {
                    [EnumQuestionnaireFieldSource.contact]: full([makeField()]),
                },
            });

            await service.check(PORTAL_ID, 'q-1');

            expect(reader.readFields).toHaveBeenCalledTimes(1);
            expect(appliedBy(questionnaires.applyFieldCheck)[0].status).toBe(
                'ok',
            );
        });

        /**
         * Смарт-вопрос проверяется по СВОЕМУ смарту: в компании, сделке
         * и лиде его поля нет и не будет, а у соседнего смарта — чужие
         * поля с похожими именами.
         */
        it('поле смарта ищется в его смарте, а не в цепочке CRM', async () => {
            const { service, reader, questionnaires } = makeDeps({
                record: makeRecord([
                    makeItem({
                        channel: 'smart',
                        targetMode: 'entity',
                        targetEntity: 'smart',
                        smartId: 12,
                        smartEntityTypeId: 177,
                        fieldName: 'UF_CRM_7_PRES_RESULT',
                        fieldType: 'string',
                    }),
                ]),
                live: {
                    'smart:12': full([
                        makeField({
                            fieldName: 'UF_CRM_7_PRES_RESULT',
                            type: 'string',
                            bitrixId: 901,
                            xmlId: 'PRES_RESULT',
                        }),
                    ]),
                },
            });

            const result = await service.check(PORTAL_ID, 'q-1');

            // Читался ровно один носитель — тот самый смарт.
            expect(reader.readFields).toHaveBeenCalledTimes(1);
            const [, entitySource] = reader.readFields.mock.calls[0] as [
                unknown,
                QuestionnaireFieldSource,
            ];
            expect(entitySource.smartId).toBe(12);

            const applied = appliedBy(questionnaires.applyFieldCheck)[0];
            expect(applied.status).toBe('ok');
            expect(applied.fieldBitrixId).toBe(901);
            expect(result.degraded).toBe(false);
        });

        /**
         * Смарт-вопрос сверяется целиком, как и вопрос CRM: статус,
         * идентификаторы вариантов, гашение исчезнувших и слепок живого
         * состояния. Для смарта это не мелочь: ответ на его вопрос бэк
         * потока переводит в элемент списка ПО ПОДПИСИ варианта, и
         * разъехавшаяся подпись означает не косметику, а несделанную
         * запись.
         */
        it('у поля смарта сверяются варианты и пишется слепок', async () => {
            const { service, questionnaires } = makeDeps({
                record: makeRecord([
                    makeItem({
                        channel: 'smart',
                        targetMode: 'entity',
                        targetEntity: 'smart',
                        smartId: 12,
                        smartEntityTypeId: 177,
                        control: 'enumeration',
                        fieldType: 'enumeration',
                        fieldName: 'UF_CRM_7_PRES_RESULT',
                        meta: acceptedMeta({
                            title: 'Итог презентации',
                            type: 'enumeration',
                            options: [
                                { bitrixId: 41, xmlId: 'OK', title: 'Согласен' },
                                { bitrixId: 42, xmlId: 'NO', title: 'Отказ' },
                            ],
                        }),
                        options: [
                            {
                                id: 'opt-ok',
                                code: 'ok',
                                title: 'Согласен',
                                bitrixId: 41,
                                xmlId: 'OK',
                                sort: 500,
                                isDefault: false,
                                isActive: true,
                            },
                            {
                                id: 'opt-no',
                                code: 'no',
                                title: 'Отказ',
                                bitrixId: 42,
                                xmlId: 'NO',
                                sort: 510,
                                isDefault: false,
                                isActive: true,
                            },
                        ],
                    }),
                ]),
                live: {
                    'smart:12': full([
                        makeField({
                            fieldName: 'UF_CRM_7_PRES_RESULT',
                            title: 'Итог презентации',
                            type: 'enumeration',
                            bitrixId: 901,
                            xmlId: 'PRES_RESULT',
                            items: [
                                { id: 41, value: 'Согласен', xmlId: 'OK' },
                                {
                                    id: 42,
                                    value: 'Отказ клиента',
                                    xmlId: 'NO',
                                },
                                { id: 43, value: 'Думает', xmlId: 'WAIT' },
                            ],
                        }),
                    ]),
                },
            });

            const result = await service.check(PORTAL_ID, 'q-1');

            expect(result.items[0].status).toBe('ok');
            // Переименование элемента в смарте видно как переименование.
            expect(result.items[0].diff?.renamedOptions).toEqual([
                {
                    optionId: 'opt-no',
                    code: 'no',
                    our: 'Отказ',
                    live: 'Отказ клиента',
                    bitrixId: 42,
                },
            ]);
            // Появившийся в смарте вариант виден и сам не заводится.
            expect(result.items[0].diff?.newOptions).toEqual([
                { bitrixId: 43, title: 'Думает', xmlId: 'WAIT' },
            ]);
            const mirror = mirrorApplied(questionnaires.applyFieldCheck);
            expect(mirror.live?.options).toEqual([
                { bitrixId: 41, xmlId: 'OK', title: 'Согласен' },
                { bitrixId: 42, xmlId: 'NO', title: 'Отказ клиента' },
                { bitrixId: 43, xmlId: 'WAIT', title: 'Думает' },
            ]);
        });

        it('поле соседнего смарта не сходит за своё', async () => {
            const { service, questionnaires } = makeDeps({
                record: makeRecord([
                    makeItem({
                        channel: 'smart',
                        targetMode: 'entity',
                        targetEntity: 'smart',
                        smartId: 12,
                        fieldName: 'UF_CRM_7_PRES_RESULT',
                        fieldType: 'string',
                    }),
                ]),
                live: {
                    // Одноимённое поле лежит у ЗПР — наш смарт пуст.
                    'smart:13': full([
                        makeField({
                            fieldName: 'UF_CRM_7_PRES_RESULT',
                            type: 'string',
                        }),
                    ]),
                    'smart:12': full([]),
                },
            });

            await service.check(PORTAL_ID, 'q-1');

            expect(appliedBy(questionnaires.applyFieldCheck)[0].status).toBe(
                'missing',
            );
        });

        it('смарт-носитель не записан — сломанная привязка, а не неполные данные', async () => {
            const { service, reader, questionnaires } = makeDeps({
                record: makeRecord([
                    makeItem({
                        channel: 'smart',
                        targetMode: 'entity',
                        targetEntity: 'smart',
                        smartId: null,
                        fieldName: 'UF_CRM_7_PRES_RESULT',
                    }),
                ]),
                live: {},
            });

            const result = await service.check(PORTAL_ID, 'q-1');

            expect(reader.readFields).not.toHaveBeenCalled();
            expect(appliedBy(questionnaires.applyFieldCheck)[0].status).toBe(
                'missing',
            );
            expect(result.items[0].comment).toContain('смарт-носитель');
        });

        it('вопрос в отчёт и штатное поле не проверяются', async () => {
            const { service, reader, questionnaires } = makeDeps({
                record: makeRecord([
                    makeItem({ id: 'i-dto', channel: 'dto' }),
                    makeItem({ id: 'i-native', isNative: true }),
                    makeItem({ id: 'i-text', channel: 'text' }),
                ]),
                live: {},
            });

            const result = await service.check(PORTAL_ID, 'q-1');

            expect(reader.readFields).not.toHaveBeenCalled();
            expect(questionnaires.applyFieldCheck).not.toHaveBeenCalled();
            expect(result.items).toEqual([]);
            expect(result.degraded).toBe(false);
        });
    });

    describe('варианты справочника', () => {
        const optionItem = makeItem({
            control: 'enumeration',
            fieldType: 'enumeration',
            fieldName: 'UF_CRM_CLIENT_TYPE',
            options: [
                {
                    id: 'opt-1',
                    code: 'tender',
                    title: 'Тендер',
                    bitrixId: 100,
                    xmlId: 'TENDER',
                    sort: 500,
                    isDefault: false,
                    isActive: true,
                },
                {
                    id: 'opt-2',
                    code: 'direct',
                    title: 'Прямая',
                    bitrixId: 200,
                    xmlId: 'DIRECT',
                    sort: 500,
                    isDefault: false,
                    isActive: true,
                },
            ],
        });

        it('исчезнувший вариант гасится, у пережившего обновляется идентификатор', async () => {
            const { service, questionnaires } = makeDeps({
                record: makeRecord([optionItem]),
                live: {
                    [EnumQuestionnaireFieldSource.company]: full([
                        makeField({
                            fieldName: 'UF_CRM_CLIENT_TYPE',
                            type: 'enumeration',
                            items: [
                                // Список пересоздали: id другой, xmlId тот же.
                                {
                                    id: 301,
                                    value: 'Тендер',
                                    xmlId: 'TENDER',
                                },
                            ],
                        }),
                    ]),
                    [EnumQuestionnaireFieldSource.deal]: full([]),
                    [EnumQuestionnaireFieldSource.lead]: full([]),
                },
            });

            const result = await service.check(PORTAL_ID, 'q-1');

            const applied = appliedBy(questionnaires.applyFieldCheck)[0];
            expect(applied.options).toEqual([
                { optionId: 'opt-1', bitrixId: 301, isActive: true },
                { optionId: 'opt-2', bitrixId: 200, isActive: false },
            ]);
            expect(result.items[0].deactivatedOptions).toBe(1);
        });

        it('ничего не изменилось — вариантов на запись нет', async () => {
            const { service, questionnaires } = makeDeps({
                record: makeRecord([optionItem]),
                live: {
                    [EnumQuestionnaireFieldSource.company]: full([
                        makeField({
                            fieldName: 'UF_CRM_CLIENT_TYPE',
                            type: 'enumeration',
                            items: [
                                { id: 100, value: 'Тендер', xmlId: 'TENDER' },
                                { id: 200, value: 'Прямая', xmlId: 'DIRECT' },
                            ],
                        }),
                    ]),
                    [EnumQuestionnaireFieldSource.deal]: full([]),
                    [EnumQuestionnaireFieldSource.lead]: full([]),
                },
            });

            await service.check(PORTAL_ID, 'q-1');

            expect(
                appliedBy(questionnaires.applyFieldCheck)[0].options,
            ).toEqual([]);
        });
    });

    describe('разбор расхождений', () => {
        const listItem = makeItem({
            control: 'enumeration',
            fieldType: 'enumeration',
            fieldName: 'UF_CRM_CLIENT_TYPE',
            title: 'Тип сотрудничества',
            options: [
                {
                    id: 'opt-1',
                    code: 'tender',
                    title: 'Тендер',
                    bitrixId: 100,
                    xmlId: 'TENDER',
                    sort: 500,
                    isDefault: false,
                    isActive: true,
                },
                {
                    id: 'opt-2',
                    code: 'direct',
                    title: 'Прямая',
                    bitrixId: 200,
                    xmlId: 'DIRECT',
                    sort: 500,
                    isDefault: false,
                    isActive: true,
                },
            ],
        });

        /** Живое поле-список с теми же двумя элементами. */
        const listField = (items: QuestionnaireLiveField['items']) =>
            makeField({
                fieldName: 'UF_CRM_CLIENT_TYPE',
                title: 'Тип сотрудничества',
                type: 'enumeration',
                items,
            });

        const onCompany = (field: QuestionnaireLiveField) => ({
            [EnumQuestionnaireFieldSource.company]: full([field]),
            [EnumQuestionnaireFieldSource.deal]: full([]),
            [EnumQuestionnaireFieldSource.lead]: full([]),
        });

        it('переименование поля видно, но формулировку вопроса не переписывает', async () => {
            const { service, questionnaires } = makeDeps({
                record: makeRecord([
                    makeItem({
                        title: 'Когда клиент примет решение?',
                        // В момент привязки поле называлось так.
                        meta: acceptedMeta({ title: 'Дата решения' }),
                    }),
                ]),
                live: onCompany(makeField({ title: 'Дата принятия решения' })),
            });

            const result = await service.check(PORTAL_ID, 'q-1');

            expect(result.items[0].diff?.title).toEqual({
                our: 'Когда клиент примет решение?',
                live: 'Дата принятия решения',
            });
            // Подпись — авторская: сверке её трогать нечем.
            expect(
                appliedBy(questionnaires.applyFieldCheck)[0],
            ).not.toHaveProperty('title');
            // Принятое остаётся прежним: сверка не имеет права «принять»
            // переименование за владельца — он его ещё не видел.
            const mirror = mirrorApplied(questionnaires.applyFieldCheck);
            expect(mirror.accepted?.title).toBe('Дата решения');
            expect(mirror.live?.title).toBe('Дата принятия решения');
        });

        it('своя формулировка вопроса переименованием не считается', async () => {
            const { service } = makeDeps({
                record: makeRecord([
                    makeItem({
                        // Ровно тот шум, ради которого слепок и заведён:
                        // формулировка вопроса своя, а поле не трогали.
                        title: 'Когда клиент примет решение?',
                        meta: acceptedMeta({ title: 'Дата решения' }),
                    }),
                ]),
                live: onCompany(makeField({ title: 'Дата решения' })),
            });

            const result = await service.check(PORTAL_ID, 'q-1');

            expect(result.items[0].diff?.title).toBeNull();
        });

        it('первая сверка запоминает живое состояние, а не объявляет его переименованием', async () => {
            const { service, questionnaires } = makeDeps({
                record: makeRecord([
                    makeItem({
                        title: 'Когда клиент примет решение?',
                        // Слепка нет: вопрос привязан до его появления.
                        meta: {},
                    }),
                ]),
                live: onCompany(makeField({ title: 'Дата решения' })),
            });

            const result = await service.check(PORTAL_ID, 'q-1');

            expect(result.items[0].diff?.title).toBeNull();
            const mirror = mirrorApplied(questionnaires.applyFieldCheck);
            expect(mirror.accepted?.title).toBe('Дата решения');
            expect(mirror.live?.title).toBe('Дата решения');
        });

        it('слепок не затирает соседние ключи meta', async () => {
            const { service, questionnaires } = makeDeps({
                record: makeRecord([
                    makeItem({
                        meta: acceptedMeta({ title: 'Дата решения' }, {
                            rows: 3,
                        }),
                    }),
                ]),
                live: onCompany(makeField({ title: 'Дата решения' })),
            });

            await service.check(PORTAL_ID, 'q-1');

            expect(appliedBy(questionnaires.applyFieldCheck)[0].meta).toEqual(
                expect.objectContaining({ rows: 3 }),
            );
        });

        it('совпадающие подписи расхождением не считаются', async () => {
            const { service } = makeDeps({
                record: makeRecord([
                    makeItem({
                        title: ' Дата решения ',
                        meta: acceptedMeta({ title: ' Дата решения ' }),
                    }),
                ]),
                live: onCompany(makeField({ title: 'Дата решения' })),
            });

            const result = await service.check(PORTAL_ID, 'q-1');

            expect(result.items[0].diff?.title).toBeNull();
        });

        it('новый вариант Битрикса виден в разборе и сам не заводится', async () => {
            const { service, questionnaires } = makeDeps({
                record: makeRecord([listItem]),
                live: onCompany(
                    listField([
                        { id: 100, value: 'Тендер', xmlId: 'TENDER' },
                        { id: 200, value: 'Прямая', xmlId: 'DIRECT' },
                        { id: 301, value: 'Субподряд', xmlId: 'SUB' },
                    ]),
                ),
            });

            const result = await service.check(PORTAL_ID, 'q-1');

            expect(result.items[0].diff?.newOptions).toEqual([
                { bitrixId: 301, title: 'Субподряд', xmlId: 'SUB' },
            ]);
            // В БД — ни строки: какие варианты показывать, решает владелец.
            expect(
                appliedBy(questionnaires.applyFieldCheck)[0].options,
            ).toEqual([]);
        });

        /** Слепок принятого: список, каким владелец его взял в анкету. */
        const acceptedList = (
            options: QuestionnaireFieldMirrorOption[],
            extra: Record<string, unknown> = {},
        ) =>
            acceptedMeta(
                {
                    title: 'Тип сотрудничества',
                    type: 'enumeration',
                    options,
                },
                extra,
            );

        const acceptedBoth = acceptedList([
            { bitrixId: 100, xmlId: 'TENDER', title: 'Тендер' },
            { bitrixId: 200, xmlId: 'DIRECT', title: 'Прямая' },
        ]);

        it('переименованный вариант виден, но подпись остаётся нашей', async () => {
            const { service, questionnaires } = makeDeps({
                record: makeRecord([{ ...listItem, meta: acceptedBoth }]),
                live: onCompany(
                    listField([
                        { id: 100, value: 'Тендер (44-ФЗ)', xmlId: 'TENDER' },
                        { id: 200, value: 'Прямая', xmlId: 'DIRECT' },
                    ]),
                ),
            });

            const result = await service.check(PORTAL_ID, 'q-1');

            expect(result.items[0].diff?.renamedOptions).toEqual([
                {
                    optionId: 'opt-1',
                    code: 'tender',
                    our: 'Тендер',
                    live: 'Тендер (44-ФЗ)',
                    bitrixId: 100,
                },
            ]);
            expect(
                appliedBy(questionnaires.applyFieldCheck)[0].options,
            ).toEqual([]);
        });

        it('своя подпись варианта переименованием не считается', async () => {
            const { service } = makeDeps({
                record: makeRecord([
                    {
                        ...listItem,
                        meta: acceptedBoth,
                        // Владелец переписал вариант под менеджера, а в
                        // Битриксе его не трогали.
                        options: listItem.options.map(option =>
                            option.id === 'opt-2'
                                ? { ...option, title: 'Прямые продажи' }
                                : option,
                        ),
                    },
                ]),
                live: onCompany(
                    listField([
                        { id: 100, value: 'Тендер', xmlId: 'TENDER' },
                        { id: 200, value: 'Прямая', xmlId: 'DIRECT' },
                    ]),
                ),
            });

            const result = await service.check(PORTAL_ID, 'q-1');

            expect(result.items[0].diff?.renamedOptions).toEqual([]);
        });

        it('исчезнувший вариант попадает в разбор и гасится тут же', async () => {
            const { service, questionnaires } = makeDeps({
                record: makeRecord([listItem]),
                live: onCompany(
                    listField([{ id: 100, value: 'Тендер', xmlId: 'TENDER' }]),
                ),
            });

            const result = await service.check(PORTAL_ID, 'q-1');

            expect(result.items[0].diff?.lostOptions).toEqual([
                { optionId: 'opt-2', code: 'direct', title: 'Прямая' },
            ]);
            // Гашение — адрес записи, а не текст: делается без спроса.
            expect(
                appliedBy(questionnaires.applyFieldCheck)[0].options,
            ).toEqual([{ optionId: 'opt-2', bitrixId: 200, isActive: false }]);
        });

        it('чужой справочник не приписывается вопросу, который не список', async () => {
            const { service } = makeDeps({
                record: makeRecord([makeItem({ control: 'date' })]),
                live: onCompany(
                    makeField({
                        items: [{ id: 700, value: 'Мимо', xmlId: null }],
                    }),
                ),
            });

            const result = await service.check(PORTAL_ID, 'q-1');

            expect(result.items[0].diff?.newOptions).toEqual([]);
        });

        it('degraded-режим разбора не строит: живых подписей мы не видели', async () => {
            const { service } = makeDeps({
                record: makeRecord([listItem]),
                live: {
                    [EnumQuestionnaireFieldSource.company]: degraded([
                        {
                            fieldName: 'UF_CRM_CLIENT_TYPE',
                            title: 'Тип сотрудничества (переименовано)',
                            type: 'enumeration',
                            multiple: false,
                            mandatory: false,
                            bitrixId: null,
                            xmlId: null,
                            items: [{ id: 999, value: 'Новый', xmlId: null }],
                        },
                    ]),
                    [EnumQuestionnaireFieldSource.deal]: degraded(),
                    [EnumQuestionnaireFieldSource.lead]: degraded(),
                },
            });

            const result = await service.check(PORTAL_ID, 'q-1');

            expect(result.items[0].diff).toBeNull();
        });

        it('пропавшее поле разбора не даёт: сравнивать не с чем', async () => {
            const { service } = makeDeps({
                record: makeRecord([listItem]),
                live: {
                    [EnumQuestionnaireFieldSource.company]: full([]),
                    [EnumQuestionnaireFieldSource.deal]: full([]),
                    [EnumQuestionnaireFieldSource.lead]: full([]),
                },
            });

            const result = await service.check(PORTAL_ID, 'q-1');

            expect(result.items[0].status).toBe('missing');
            expect(result.items[0].diff).toBeNull();
        });

        it('пропавшее поле стирает правду портала, а принятое оставляет', async () => {
            const { service, questionnaires } = makeDeps({
                record: makeRecord([
                    {
                        ...listItem,
                        meta: {
                            bitrixField: {
                                live: {
                                    title: 'Тип сотрудничества',
                                    type: 'enumeration',
                                    options: [],
                                    at: '2026-08-01T10:00:00.000Z',
                                },
                                accepted: {
                                    title: 'Тип сотрудничества',
                                    type: 'enumeration',
                                    options: [],
                                    at: '2026-08-01T10:00:00.000Z',
                                },
                            },
                        },
                    },
                ]),
                live: {
                    [EnumQuestionnaireFieldSource.company]: full([]),
                    [EnumQuestionnaireFieldSource.deal]: full([]),
                    [EnumQuestionnaireFieldSource.lead]: full([]),
                },
            });

            await service.check(PORTAL_ID, 'q-1');

            const mirror = mirrorApplied(questionnaires.applyFieldCheck);
            // Показывать живое состояние поля, которого больше нет, — врать.
            expect(mirror.live).toBeNull();
            // А принятое остаётся: по нему видно, что именно потеряли.
            expect(mirror.accepted?.title).toBe('Тип сотрудничества');
        });

        it('degraded-режим слепок не трогает: живого состояния мы не видели', async () => {
            const { service, questionnaires } = makeDeps({
                record: makeRecord([
                    makeItem({ meta: acceptedMeta({ title: 'Дата решения' }) }),
                ]),
                live: {
                    [EnumQuestionnaireFieldSource.company]: degraded(),
                    [EnumQuestionnaireFieldSource.deal]: degraded(),
                    [EnumQuestionnaireFieldSource.lead]: degraded(),
                },
            });

            await service.check(PORTAL_ID, 'q-1');

            expect(
                appliedBy(questionnaires.applyFieldCheck)[0],
            ).not.toHaveProperty('meta');
        });

        it('при смене типа разбирается только подпись: список поля уже чужой', async () => {
            const { service } = makeDeps({
                record: makeRecord([{ ...listItem, meta: acceptedBoth }]),
                live: onCompany(
                    makeField({
                        fieldName: 'UF_CRM_CLIENT_TYPE',
                        title: 'Тип сотрудничества (Битрикс)',
                        type: 'string',
                        items: [],
                    }),
                ),
            });

            const result = await service.check(PORTAL_ID, 'q-1');

            expect(result.items[0].status).toBe('type_changed');
            expect(result.items[0].diff?.title).toEqual({
                our: 'Тип сотрудничества',
                live: 'Тип сотрудничества (Битрикс)',
            });
            expect(result.items[0].diff?.lostOptions).toEqual([]);
        });
    });

    describe('принадлежность порталу', () => {
        it('анкета соседнего портала не проверяется', async () => {
            const record = makeRecord([makeItem()]);
            const { service, reader } = makeDeps({
                record: { ...record, portalId: 42 },
                live: {},
            });

            await expect(
                service.check(PORTAL_ID, 'q-1'),
            ).rejects.toBeInstanceOf(NotFoundException);
            expect(reader.connect).not.toHaveBeenCalled();
        });
    });
});
