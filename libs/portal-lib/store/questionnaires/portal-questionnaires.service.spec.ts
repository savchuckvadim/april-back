import { BadRequestException, Logger } from '@nestjs/common';
import {
    PortalQuestionnaireDraft,
    PortalQuestionnaireItemDraft,
    PortalQuestionnairesService,
} from './portal-questionnaires.service';
import {
    PortalQuestionnaireItemRecord,
    PortalQuestionnaireItemSyncInput,
    PortalQuestionnaireRecord,
    PortalQuestionnaireSaveInput,
} from './portal-questionnaires.repository';
import {
    QuestionnaireFieldMirror,
    readQuestionnaireFieldMirror,
} from './questionnaire-field-mirror';

/**
 * Спека каталога анкет: проверяются ровно те две вещи, из-за которых
 * каталог вообще вынесен из кода фронта —
 *  - ВАЛИДАЦИЯ НА СОХРАНЕНИИ: портал не должен суметь завести вопрос,
 *    который фрейм не исполнит (иначе менеджер видит пустое место, и
 *    никто не понимает почему);
 *  - КОМПИЛЯЦИЯ: во фрейм не уезжает ни один неисполнимый пункт, а битый
 *    JSON одной анкеты не роняет весь каталог.
 */

const DOMAIN = 'gsr.bitrix24.ru';
const APP = 'event-sales';

const makeItemRecord = (
    over: Partial<PortalQuestionnaireItemRecord> = {},
): PortalQuestionnaireItemRecord => ({
    id: 'item-1',
    questionnaireId: 'q-1',
    portalId: 5,
    code: 'decision_date',
    title: 'Когда клиент примет решение?',
    placeholder: null,
    hint: null,
    groupTitle: null,
    sort: 500,
    control: 'date',
    isMultiple: false,
    isRequired: true,
    requireChange: false,
    staleAfterDays: 30,
    channel: 'crm',
    targetMode: 'auto',
    targetEntity: null,
    dtoPath: null,
    smartId: null,
    smartEntityTypeId: null,
    isNative: false,
    fieldName: 'UF_CRM_1712345678',
    fieldBitrixId: 1234,
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
    over: Partial<PortalQuestionnaireRecord> = {},
): PortalQuestionnaireRecord => ({
    id: 'q-1',
    portalId: 5,
    domain: DOMAIN,
    appCode: APP,
    code: 'refine',
    title: 'Доработка',
    hint: null,
    purpose: 'plan',
    presentation: 'inline',
    place: null,
    persist: 'onChange',
    conditions: [{ kind: 'planType', values: ['refine'] }],
    configKey: 'withChecklistRefine',
    legacyChecklistId: 'refine',
    isActive: true,
    sort: 500,
    version: 3,
    updatedBy: null,
    createdAt: null,
    updatedAt: null,
    items: [makeItemRecord()],
    ...over,
});

const makeItemDraft = (
    over: Partial<PortalQuestionnaireItemDraft> = {},
): PortalQuestionnaireItemDraft => ({
    code: 'decision_date',
    title: 'Когда клиент примет решение?',
    control: 'date',
    channel: 'crm',
    fieldName: 'UF_CRM_1712345678',
    fieldType: 'date',
    // Носитель, из которого поле выбрано в пикере: без него вопрос канала
    // CRM не сохраняется — проверить достижимость поля было бы нечем.
    fieldSource: 'company',
    ...over,
});

const makeDraft = (
    over: Partial<PortalQuestionnaireDraft> = {},
): PortalQuestionnaireDraft => ({
    appCode: APP,
    code: 'refine',
    title: 'Доработка',
    purpose: 'plan',
    conditions: [{ kind: 'planType', values: ['refine'] }],
    items: [makeItemDraft()],
    ...over,
});

/**
 * Смарты портала. «Презентации» (pres/sales) — единственный, у которого
 * есть поток события: ЗПР (zpr/sales) и СКАП добавлены, чтобы правила
 * различали смарт с потоком, смарт другого типа события и смарт без
 * потока вовсе.
 */
const PORTAL_SMARTS = [
    {
        id: 12,
        entityTypeId: 177,
        type: 'pres',
        group: 'sales',
        title: 'Презентации',
    },
    {
        id: 13,
        entityTypeId: 181,
        type: 'zpr',
        group: 'sales',
        title: 'Звонки По решению',
    },
    { id: 14, entityTypeId: 190, type: 'skap', group: 'sales', title: 'СКАП' },
];

/** Вопрос, который пишет ответ в элемент смарта «Презентации». */
const makeSmartItemDraft = (
    over: Partial<PortalQuestionnaireItemDraft> = {},
): PortalQuestionnaireItemDraft =>
    makeItemDraft({
        code: 'pres_result',
        title: 'Что решили на презентации?',
        control: 'string',
        channel: 'smart',
        fieldSource: 'smart',
        smartId: 12,
        fieldName: 'UF_CRM_7_PRES_RESULT',
        fieldType: 'string',
        ...over,
    });

/** Анкета отчёта по презентации: условие даёт смарту достижимость. */
const makeSmartDraft = (
    over: Partial<PortalQuestionnaireDraft> = {},
): PortalQuestionnaireDraft =>
    makeDraft({
        code: 'presentation',
        purpose: 'report',
        conditions: [{ kind: 'reportType', values: ['presentation'] }],
        items: [makeSmartItemDraft()],
        ...over,
    });

const makeDeps = (records: PortalQuestionnaireRecord[] = []) => {
    const repository = {
        findActiveByDomain: jest.fn().mockResolvedValue(records),
        findByPortalId: jest.fn().mockResolvedValue([]),
        findById: jest.fn().mockResolvedValue(null),
        findPortalSmarts: jest.fn().mockResolvedValue(PORTAL_SMARTS),
        save: jest
            .fn<
                Promise<PortalQuestionnaireRecord>,
                [PortalQuestionnaireSaveInput]
            >()
            .mockImplementation((input: PortalQuestionnaireSaveInput) =>
                Promise.resolve(
                    makeRecord({
                        appCode: input.appCode,
                        code: input.code,
                        items: [],
                    }),
                ),
            ),
        remove: jest.fn().mockResolvedValue(undefined),
        setItemFieldStatus: jest.fn().mockResolvedValue(undefined),
        applyFieldCheck: jest.fn().mockResolvedValue(undefined),
        applyFieldSync: jest
            .fn<Promise<void>, [string, PortalQuestionnaireItemSyncInput[]]>()
            .mockResolvedValue(undefined),
    };
    const portalRepository = {
        findById: jest.fn().mockResolvedValue({ id: 5, domain: DOMAIN }),
    };
    const redis = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
    };
    const service = new PortalQuestionnairesService(
        repository as never,
        portalRepository as never,
        { getClient: () => redis } as never,
    );
    return { service, repository, portalRepository, redis };
};

describe('PortalQuestionnairesService', () => {
    beforeAll(() => {
        // Отсев пунктов сопровождается warn'ами — в выводе тестов они шум.
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => jest.clearAllMocks());

    describe('валидация на сохранении', () => {
        it('неизвестный тип отображения — отказ', async () => {
            const { service, repository } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeDraft({ items: [makeItemDraft({ control: 'file' })] }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(repository.save).not.toHaveBeenCalled();
        });

        it('неизвестный канал записи — отказ', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeDraft({
                        items: [makeItemDraft({ channel: 'telepathy' })],
                    }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('неизвестный вид условия — отказ', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeDraft({
                        conditions: [{ kind: 'moonPhase', values: ['full'] }],
                    }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('значение условия не из реестра — отказ (planType «cold» менеджеру не предлагается)', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeDraft({
                        conditions: [{ kind: 'planType', values: ['cold'] }],
                    }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('анкета без условий — отказ: она никогда бы не появилась', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(5, makeDraft({ conditions: [] })),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('множественное поле — отказ: ответ исчез бы бесследно', async () => {
            const { service, repository } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeDraft({
                        items: [makeItemDraft({ isMultiple: true })],
                    }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(repository.save).not.toHaveBeenCalled();
        });

        it('«требовать новое значение» вне канала CRM — отказ', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeDraft({
                        items: [
                            makeItemDraft({
                                control: 'money',
                                channel: 'dto',
                                dtoPath: 'sale.opportunity',
                                fieldName: null,
                                fieldType: null,
                                requireChange: true,
                            }),
                        ],
                    }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('срок годности у строки — отказ: считать его не по чему', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeDraft({
                        items: [
                            makeItemDraft({
                                control: 'string',
                                fieldType: 'string',
                                staleAfterDays: 30,
                            }),
                        ],
                    }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('контрол несовместим с типом поля — отказ по матрице', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeDraft({
                        items: [
                            makeItemDraft({
                                control: 'money',
                                fieldType: 'date',
                            }),
                        ],
                    }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('носитель поля не указан — отказ: достижимость проверить нечем', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeDraft({
                        items: [makeItemDraft({ fieldSource: undefined })],
                    }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('поле смарта на канале «Поле CRM» — отказ: фрейм в смарт не пишет', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeDraft({
                        items: [
                            makeItemDraft({
                                fieldSource: 'smart',
                                fieldName: 'UF_CRM_7_DECISION_DATE',
                            }),
                        ],
                    }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('поле контакта с автоподбором — отказ: цепочка компания → сделка → лид до него не доходит', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeDraft({
                        items: [makeItemDraft({ fieldSource: 'contact' })],
                    }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('носитель ответа не тот, у которого выбрано поле, — отказ', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeDraft({
                        items: [
                            makeItemDraft({
                                fieldSource: 'contact',
                                targetMode: 'entity',
                                targetEntity: 'deal',
                            }),
                        ],
                    }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('поле контакта с жёстким носителем сохраняется', async () => {
            const { service, repository } = makeDeps();

            await service.save(
                5,
                makeDraft({
                    items: [
                        makeItemDraft({
                            fieldSource: 'contact',
                            targetMode: 'entity',
                            targetEntity: 'contact',
                        }),
                    ],
                }),
            );

            const [input] = repository.save.mock.calls[0];
            expect(input.items[0].targetMode).toBe('entity');
            expect(input.items[0].targetEntity).toBe('contact');
        });

        it('путь в отчёте не из реестра — отказ: бэк такого поля не примет', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeDraft({
                        items: [
                            makeItemDraft({
                                control: 'money',
                                channel: 'dto',
                                dtoPath: 'deal.opportunity',
                                fieldName: null,
                                fieldType: null,
                            }),
                        ],
                    }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('вариант списка без bitrixId на канале CRM — отказ', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeDraft({
                        items: [
                            makeItemDraft({
                                control: 'enumeration',
                                fieldType: 'enumeration',
                                options: [
                                    { code: 'postponed', title: 'Отложил' },
                                ],
                            }),
                        ],
                    }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('исполнимая анкета сохраняется, домен берётся из портала, кэш сбрасывается', async () => {
            const { service, repository, redis } = makeDeps();

            await service.save(5, makeDraft());

            expect(repository.save).toHaveBeenCalledTimes(1);
            const [input] = repository.save.mock.calls[0];
            expect(input.domain).toBe(DOMAIN);
            expect(input.portalId).toBe(5);
            // Колонка не задана — выводится из назначения анкеты.
            expect(input.place).toBe('plan');
            expect(input.items[0].isMultiple).toBe(false);
            expect(redis.del).toHaveBeenCalledWith(
                `portal-questionnaires:${DOMAIN}:${APP}`,
            );
        });
    });

    /**
     * Главное правило смарт-канала: ответ пишется не «в смарт вообще», а
     * в элемент, который создаёт или закрывает поток ЭТОГО события.
     * Значит, анкета обязана быть привязана к типу события, у которого
     * такой смарт есть, — иначе элемента просто не будет.
     */
    describe('поле смарта как носитель ответа', () => {
        it('разрешён, когда анкета привязана к типу события со смартом', async () => {
            const { service, repository } = makeDeps();

            await service.save(5, makeSmartDraft());

            const [input] = repository.save.mock.calls[0];
            const item = input.items[0];
            expect(item.channel).toBe('smart');
            // Носитель самоописывающий: выбирать элемент негде.
            expect(item.targetMode).toBe('entity');
            expect(item.targetEntity).toBe('smart');
            // Постоянный адрес смарта уезжает в БД (в отличие от
            // транзиентного fieldSource) — по нему потом ищут поток.
            expect(item.smartId).toBe(12);
            expect(item.smartEntityTypeId).toBe(177);
        });

        it('разрешён по условию «Презентация проведена»: спонтанная тоже создаёт элемент', async () => {
            const { service, repository } = makeDeps();

            await service.save(
                5,
                makeSmartDraft({
                    conditions: [{ kind: 'presentationDone' }],
                }),
            );

            const [input] = repository.save.mock.calls[0];
            expect(input.conditions).toEqual([
                { kind: 'presentationDone', values: [] },
            ]);
            expect(input.items[0].smartId).toBe(12);
        });

        it('отказ, когда тип события анкеты своего смарта не имеет', async () => {
            const { service, repository } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeSmartDraft({
                        // «Звонок» смарта не имеет — элемент не родится.
                        conditions: [{ kind: 'reportType', values: ['warm'] }],
                    }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(repository.save).not.toHaveBeenCalled();
        });

        it('отказ, когда условие по типу события не про ЭТОТ смарт', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeSmartDraft({
                        // Решение ведёт ЗПР, а поле выбрано у презентаций.
                        conditions: [{ kind: 'reportType', values: ['hot'] }],
                    }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('отказ, когда условия по типу события нет вовсе', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeSmartDraft({ conditions: [{ kind: 'always' }] }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('отказ, когда у смарта нет потока события', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(
                    5,
                    // СКАП стоит на порталах, но элементов события не ведёт.
                    makeSmartDraft({
                        items: [makeSmartItemDraft({ smartId: 14 })],
                    }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('отказ, когда смарт не указан: неизвестно, в какой элемент писать', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeSmartDraft({
                        items: [makeSmartItemDraft({ smartId: null })],
                    }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('отказ, когда смарт не установлен на этом портале', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeSmartDraft({
                        items: [makeSmartItemDraft({ smartId: 999 })],
                    }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('отказ, когда поле выбрано не у смарта', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeSmartDraft({
                        items: [makeSmartItemDraft({ fieldSource: 'deal' })],
                    }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('отказ на «требовать новое значение»: прошлого у нового элемента нет', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeSmartDraft({
                        items: [makeSmartItemDraft({ requireChange: true })],
                    }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('отказ на вариант списка без bitrixId', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeSmartDraft({
                        items: [
                            makeSmartItemDraft({
                                control: 'enumeration',
                                fieldType: 'enumeration',
                                options: [{ code: 'sold', title: 'Продали' }],
                            }),
                        ],
                    }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('носитель «элемент смарта» без своего канала — отказ', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(
                    5,
                    makeDraft({
                        items: [
                            makeItemDraft({
                                targetMode: 'entity',
                                targetEntity: 'smart',
                            }),
                        ],
                    }),
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });
    });

    describe('компиляция каталога', () => {
        it('пункт со сломанной привязкой не уезжает во фрейм', async () => {
            const { service } = makeDeps([
                makeRecord({
                    items: [
                        makeItemRecord({ fieldStatus: 'missing' }),
                        makeItemRecord({
                            id: 'item-2',
                            code: 'decision_comment',
                            control: 'string',
                            fieldType: 'string',
                            staleAfterDays: null,
                        }),
                    ],
                }),
            ]);

            const catalog = await service.resolve(DOMAIN, APP);

            expect(catalog.questionnaires).toHaveLength(1);
            expect(
                catalog.questionnaires[0].items.map(item => item.code),
            ).toEqual(['decision_comment']);
        });

        it('состояние привязки не касается ответа в комментарий', async () => {
            const { service } = makeDeps([
                makeRecord({
                    items: [
                        makeItemRecord({
                            code: 'client_words',
                            control: 'text',
                            channel: 'text',
                            fieldName: null,
                            fieldType: null,
                            fieldStatus: 'missing',
                            staleAfterDays: null,
                        }),
                    ],
                }),
            ]);

            const catalog = await service.resolve(DOMAIN, APP);

            expect(catalog.questionnaires[0].items[0].field).toBeNull();
        });

        it('множественный пункт выбрасывается, даже если лежит в БД', async () => {
            const { service } = makeDeps([
                makeRecord({
                    items: [
                        makeItemRecord({ isMultiple: true }),
                        makeItemRecord({
                            id: 'item-2',
                            code: 'decision_comment',
                            control: 'string',
                            fieldType: 'string',
                            staleAfterDays: null,
                        }),
                    ],
                }),
            ]);

            const catalog = await service.resolve(DOMAIN, APP);

            expect(
                catalog.questionnaires[0].items.map(item => item.code),
            ).toEqual(['decision_comment']);
        });

        it('пункт с неизвестным контролом выбрасывается', async () => {
            const { service } = makeDeps([
                makeRecord({
                    items: [
                        makeItemRecord({ control: 'file' }),
                        makeItemRecord({
                            id: 'item-2',
                            code: 'decision_comment',
                            control: 'string',
                            fieldType: 'string',
                            staleAfterDays: null,
                        }),
                    ],
                }),
            ]);

            const catalog = await service.resolve(DOMAIN, APP);

            expect(
                catalog.questionnaires[0].items.map(item => item.code),
            ).toEqual(['decision_comment']);
        });

        it('анкета, у которой не осталось исполнимых пунктов, не показывается', async () => {
            const { service } = makeDeps([
                makeRecord({ items: [makeItemRecord({ isMultiple: true })] }),
            ]);

            const catalog = await service.resolve(DOMAIN, APP);

            expect(catalog.questionnaires).toEqual([]);
        });

        it('выключенная анкета в каталог не попадает', async () => {
            const { service } = makeDeps([makeRecord({ isActive: false })]);

            const catalog = await service.resolve(DOMAIN, APP);

            expect(catalog.questionnaires).toEqual([]);
        });

        it('неизвестный вид условия — безопасный отказ: анкета не показывается', async () => {
            const { service } = makeDeps([
                makeRecord({
                    conditions: [{ kind: 'moonPhase', values: ['full'] }],
                }),
            ]);

            const catalog = await service.resolve(DOMAIN, APP);

            expect(catalog.questionnaires).toEqual([]);
        });

        it('кривой JSON условий не роняет каталог: битая анкета выпадает, соседняя остаётся', async () => {
            const { service } = makeDeps([
                // Нормализатор репозитория превратил «не массив» в [].
                makeRecord({ code: 'broken', conditions: [] }),
                makeRecord({
                    id: 'q-2',
                    code: 'pay',
                    conditions: [{ kind: 'planType', values: ['moneyAwait'] }],
                }),
            ]);

            const catalog = await service.resolve(DOMAIN, APP);

            expect(catalog.questionnaires.map(entry => entry.code)).toEqual([
                'pay',
            ]);
        });

        it('условие, у которого не осталось значений из реестра, роняет анкету', async () => {
            const { service } = makeDeps([
                makeRecord({
                    conditions: [{ kind: 'planType', values: ['cold'] }],
                }),
            ]);

            const catalog = await service.resolve(DOMAIN, APP);

            expect(catalog.questionnaires).toEqual([]);
        });

        it('значения вне реестра отбрасываются, условие остаётся суженным', async () => {
            const { service } = makeDeps([
                makeRecord({
                    conditions: [
                        { kind: 'planType', values: ['refine', 'cold'] },
                    ],
                }),
            ]);

            const catalog = await service.resolve(DOMAIN, APP);

            expect(catalog.questionnaires[0].conditions).toEqual([
                { kind: 'planType', values: ['refine'] },
            ]);
        });

        it('версия — сумма версий анкет, хэш меняется вместе с составом', async () => {
            const before = await makeDeps([
                makeRecord({ version: 3 }),
            ]).service.resolve(DOMAIN, APP);
            const after = await makeDeps([
                makeRecord({
                    version: 4,
                    items: [makeItemRecord({ title: 'Другой вопрос' })],
                }),
            ]).service.resolve(DOMAIN, APP);

            expect(before.version).toBe(3);
            expect(after.version).toBe(4);
            expect(before.hash).not.toBe(after.hash);
            expect(before.contract).toBe(1);
        });

        it('поле уезжает готовым именем, вариант — готовым bitrixId', async () => {
            const { service } = makeDeps([
                makeRecord({
                    items: [
                        makeItemRecord({
                            code: 'objection',
                            control: 'enumeration',
                            fieldType: 'enumeration',
                            staleAfterDays: null,
                            options: [
                                {
                                    id: 'opt-1',
                                    code: 'price',
                                    title: 'Дорого',
                                    bitrixId: 555,
                                    xmlId: null,
                                    sort: 500,
                                    isDefault: false,
                                    isActive: true,
                                },
                                {
                                    id: 'opt-2',
                                    code: 'gone',
                                    title: 'Исчезнувший вариант',
                                    bitrixId: 556,
                                    xmlId: null,
                                    sort: 600,
                                    isDefault: false,
                                    isActive: false,
                                },
                            ],
                        }),
                    ],
                }),
            ]);

            const catalog = await service.resolve(DOMAIN, APP);
            const item = catalog.questionnaires[0].items[0];

            expect(item.field).toEqual({
                name: 'UF_CRM_1712345678',
                type: 'enumeration',
            });
            expect(item.options).toEqual([
                { code: 'price', title: 'Дорого', bitrixId: 555 },
            ]);
        });
    });

    /**
     * Смарт-вопрос доезжает до фрейма пометкой канала и носителя — но
     * БЕЗ адресов чужой системы: идентификаторов элементов справочника
     * фрейм не знает и знать не должен, он их не пишет.
     */
    describe('компиляция каталога: вопрос со смартом', () => {
        /** Вопрос-список канала `smart` в том виде, как он лежит в БД. */
        const smartItemRecord = (
            over: Partial<PortalQuestionnaireItemRecord> = {},
        ): PortalQuestionnaireItemRecord =>
            makeItemRecord({
                code: 'pres_result',
                title: 'Что решили на презентации?',
                control: 'enumeration',
                channel: 'smart',
                targetMode: 'entity',
                targetEntity: 'smart',
                smartId: 12,
                smartEntityTypeId: 177,
                fieldName: 'UF_CRM_7_PRES_RESULT',
                fieldType: 'enumeration',
                staleAfterDays: null,
                options: [
                    {
                        id: 'opt-1',
                        code: 'sold',
                        title: 'Продали',
                        bitrixId: 555,
                        xmlId: null,
                        sort: 500,
                        isDefault: false,
                        isActive: true,
                    },
                ],
                ...over,
            });

        const smartRecord = (
            items: PortalQuestionnaireItemRecord[],
        ): PortalQuestionnaireRecord =>
            makeRecord({
                code: 'presentation',
                purpose: 'report',
                conditions: [{ kind: 'reportType', values: ['presentation'] }],
                items,
            });

        it('едет с каналом, носителем и смартом потока', async () => {
            const { service } = makeDeps([smartRecord([smartItemRecord()])]);

            const catalog = await service.resolve(DOMAIN, APP);
            const item = catalog.questionnaires[0].items[0];

            expect(item.channel).toBe('smart');
            expect(item.target).toEqual({ mode: 'entity', entity: 'smart' });
            // kind — ключ, по которому поток узнаёт «мои ответы»;
            // entityTypeId — живой, из строки smarts портала.
            expect(item.smart).toEqual({
                kind: 'presentation',
                entityTypeId: 177,
            });
            expect(item.field).toEqual({
                name: 'UF_CRM_7_PRES_RESULT',
                type: 'enumeration',
            });
        });

        it('варианты едут кодами и подписями, БЕЗ bitrixId элементов', async () => {
            const { service } = makeDeps([smartRecord([smartItemRecord()])]);

            const catalog = await service.resolve(DOMAIN, APP);

            expect(catalog.questionnaires[0].items[0].options).toEqual([
                { code: 'sold', title: 'Продали', bitrixId: null },
            ]);
        });

        it('у остальных каналов поле smart пустое', async () => {
            const { service } = makeDeps([makeRecord()]);

            const catalog = await service.resolve(DOMAIN, APP);

            expect(catalog.questionnaires[0].items[0].smart).toBeNull();
        });

        it('смарта нет на портале — вопрос не показывается', async () => {
            const { service } = makeDeps([
                smartRecord([
                    smartItemRecord({ smartId: 777 }),
                    makeItemRecord({
                        id: 'item-2',
                        code: 'decision_comment',
                        control: 'string',
                        fieldType: 'string',
                        staleAfterDays: null,
                    }),
                ]),
            ]);

            const catalog = await service.resolve(DOMAIN, APP);

            expect(
                catalog.questionnaires[0].items.map(item => item.code),
            ).toEqual(['decision_comment']);
        });

        it('у смарта нет потока события — вопрос не показывается', async () => {
            const { service } = makeDeps([
                smartRecord([
                    // СКАП: смарт есть, элементов события не ведёт.
                    smartItemRecord({ smartId: 14 }),
                ]),
            ]);

            const catalog = await service.resolve(DOMAIN, APP);

            expect(catalog.questionnaires).toEqual([]);
        });

        it('смарт переустановлен — в каталог едет ЖИВОЙ entityTypeId', async () => {
            const { service } = makeDeps([
                smartRecord([smartItemRecord({ smartEntityTypeId: 155 })]),
            ]);

            const catalog = await service.resolve(DOMAIN, APP);

            expect(catalog.questionnaires[0].items[0].smart?.entityTypeId).toBe(
                177,
            );
        });

        it('смарты портала читаются, только когда смарт-вопросы есть', async () => {
            const { service, repository } = makeDeps([makeRecord()]);

            await service.resolve(DOMAIN, APP);

            expect(repository.findPortalSmarts).not.toHaveBeenCalled();
        });
    });

    describe('применение расхождений', () => {
        /** Вопрос-список с одним вариантом: остальное разбор добавляет. */
        const listItem = (
            over: Partial<PortalQuestionnaireItemRecord> = {},
        ): PortalQuestionnaireItemRecord =>
            makeItemRecord({
                id: 'item-1',
                code: 'client_type',
                title: 'Тип сотрудничества',
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
                ],
                ...over,
            });

        const withRecord = (items: PortalQuestionnaireItemRecord[]) => {
            const deps = makeDeps();
            deps.repository.findById.mockResolvedValue(makeRecord({ items }));
            return deps;
        };

        it('новый вариант заводится с bitrixId, кодом из xmlId и включённым', async () => {
            const { service, repository, redis } = withRecord([listItem()]);

            const outcome = await service.applyFieldSync('q-1', [
                {
                    itemId: 'item-1',
                    title: 'Тип сотрудничества',
                    renameOptions: [
                        { optionId: 'opt-1', title: 'Тендер (44-ФЗ)' },
                    ],
                    addOptions: [
                        { bitrixId: 301, title: 'Субподряд', xmlId: 'SUB' },
                    ],
                },
            ]);

            expect(repository.applyFieldSync).toHaveBeenCalledTimes(1);
            const [id, inputs] = repository.applyFieldSync.mock.calls[0];
            expect(id).toBe('q-1');
            expect(inputs).toEqual([
                {
                    itemId: 'item-1',
                    title: 'Тип сотрудничества',
                    renamedOptions: [
                        { optionId: 'opt-1', title: 'Тендер (44-ФЗ)' },
                    ],
                    newOptions: [
                        {
                            code: 'sub',
                            title: 'Субподряд',
                            bitrixId: 301,
                            xmlId: 'SUB',
                            sort: 500,
                        },
                    ],
                },
            ]);
            expect(outcome.titles).toBe(1);
            expect(outcome.renamedOptions).toBe(1);
            expect(outcome.addedOptions).toBe(1);
            // Состав уехал к менеджеру — кэш каталога домена сброшен.
            expect(redis.del).toHaveBeenCalledWith(
                `portal-questionnaires:${DOMAIN}:${APP}`,
            );
        });

        /**
         * Слепки живого поля: `accepted` — то, что владелец уже видел в
         * Битриксе. Именно оно и обновляется применением: подтянутое
         * становится принятым, и следующая сверка не покажет ту же строку
         * снова.
         */
        const withMirror = (
            over: Partial<PortalQuestionnaireItemRecord> = {},
        ): PortalQuestionnaireItemRecord =>
            listItem({
                meta: {
                    rows: 3,
                    bitrixField: {
                        live: {
                            title: 'Тип сотрудничества (Битрикс)',
                            type: 'enumeration',
                            options: [
                                {
                                    bitrixId: 100,
                                    xmlId: 'TENDER',
                                    title: 'Тендер (44-ФЗ)',
                                },
                                {
                                    bitrixId: 301,
                                    xmlId: 'SUB',
                                    title: 'Субподряд',
                                },
                            ],
                            at: '2026-08-28T10:00:00.000Z',
                        },
                        accepted: {
                            title: 'Тип сотрудничества',
                            type: 'enumeration',
                            options: [
                                {
                                    bitrixId: 100,
                                    xmlId: 'TENDER',
                                    title: 'Тендер',
                                },
                            ],
                            at: '2026-08-01T10:00:00.000Z',
                        },
                    },
                },
                ...over,
            });

        /** Слепки, которые уехали в хранилище вместе с применением. */
        const appliedMirror = (repository: {
            applyFieldSync: jest.Mock;
        }): QuestionnaireFieldMirror =>
            readQuestionnaireFieldMirror(
                (
                    repository.applyFieldSync.mock.calls[0][1] as {
                        meta?: Record<string, unknown>;
                    }[]
                )[0].meta,
            );

        it('подтянутое становится принятым: та же строка второй раз не загорится', async () => {
            const { service, repository } = withRecord([withMirror()]);

            await service.applyFieldSync('q-1', [
                {
                    itemId: 'item-1',
                    title: 'Тип сотрудничества (Битрикс)',
                    renameOptions: [
                        { optionId: 'opt-1', title: 'Тендер (44-ФЗ)' },
                    ],
                    addOptions: [
                        { bitrixId: 301, title: 'Субподряд', xmlId: 'SUB' },
                    ],
                },
            ]);

            const mirror = appliedMirror(repository);
            expect(mirror.accepted?.title).toBe('Тип сотрудничества (Битрикс)');
            expect(mirror.accepted?.options).toEqual([
                { bitrixId: 100, xmlId: 'TENDER', title: 'Тендер (44-ФЗ)' },
                { bitrixId: 301, xmlId: 'SUB', title: 'Субподряд' },
            ]);
            // Расширения вопроса слепок не трогает.
            expect(
                (
                    repository.applyFieldSync.mock.calls[0][1] as {
                        meta?: Record<string, unknown>;
                    }[]
                )[0].meta,
            ).toEqual(expect.objectContaining({ rows: 3 }));
        });

        it('неподтянутое принятым не становится: владелец его не принимал', async () => {
            const { service, repository } = withRecord([withMirror()]);

            // Взяли только новый вариант — формулировку вопроса владелец
            // осознанно оставил свою.
            await service.applyFieldSync('q-1', [
                {
                    itemId: 'item-1',
                    addOptions: [
                        { bitrixId: 301, title: 'Субподряд', xmlId: 'SUB' },
                    ],
                },
            ]);

            const mirror = appliedMirror(repository);
            expect(mirror.accepted?.title).toBe('Тип сотрудничества');
        });

        it('слепка нет — обновлять нечего, `meta` не трогаем', async () => {
            const { service, repository } = withRecord([listItem()]);

            await service.applyFieldSync('q-1', [
                {
                    itemId: 'item-1',
                    renameOptions: [
                        { optionId: 'opt-1', title: 'Тендер (44-ФЗ)' },
                    ],
                },
            ]);

            expect(
                repository.applyFieldSync.mock.calls[0][1][0],
            ).not.toHaveProperty('meta');
        });

        it('вариант без bitrixId — отказ: такой ответ в поле не записать', async () => {
            const { service, repository } = withRecord([listItem()]);

            await expect(
                service.applyFieldSync('q-1', [
                    {
                        itemId: 'item-1',
                        addOptions: [
                            {
                                bitrixId: 0,
                                title: 'Без идентификатора',
                            },
                        ],
                    },
                ]),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(repository.applyFieldSync).not.toHaveBeenCalled();
        });

        it('вариант с уже занятым bitrixId вторым не заводится', async () => {
            const { service, repository } = withRecord([listItem()]);

            await expect(
                service.applyFieldSync('q-1', [
                    {
                        itemId: 'item-1',
                        addOptions: [{ bitrixId: 100, title: 'Тендер' }],
                    },
                ]),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(repository.applyFieldSync).not.toHaveBeenCalled();
        });

        it('чужой вопрос из тела отвергается', async () => {
            const { service, repository } = withRecord([listItem()]);

            await expect(
                service.applyFieldSync('q-1', [
                    { itemId: 'item-соседнего-портала', title: 'Своё' },
                ]),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(repository.applyFieldSync).not.toHaveBeenCalled();
        });

        it('чужой вариант из тела отвергается', async () => {
            const { service, repository } = withRecord([listItem()]);

            await expect(
                service.applyFieldSync('q-1', [
                    {
                        itemId: 'item-1',
                        renameOptions: [
                            { optionId: 'opt-чужой', title: 'Подмена' },
                        ],
                    },
                ]),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(repository.applyFieldSync).not.toHaveBeenCalled();
        });

        it('варианты не-списку не приписываются: сохранение потом отказало бы', async () => {
            const { service } = withRecord([
                listItem({ control: 'date', fieldType: 'date', options: [] }),
            ]);

            await expect(
                service.applyFieldSync('q-1', [
                    {
                        itemId: 'item-1',
                        addOptions: [{ bitrixId: 301, title: 'Субподряд' }],
                    },
                ]),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('код нового варианта разводится с занятым, а без xmlId берётся из id', async () => {
            const { service, repository } = withRecord([
                listItem({
                    options: [
                        {
                            id: 'opt-1',
                            code: 'sub',
                            title: 'Субподряд (старый)',
                            bitrixId: 100,
                            xmlId: 'OLD',
                            sort: 500,
                            isDefault: false,
                            isActive: false,
                        },
                    ],
                }),
            ]);

            await service.applyFieldSync('q-1', [
                {
                    itemId: 'item-1',
                    addOptions: [
                        { bitrixId: 301, title: 'Субподряд', xmlId: 'SUB' },
                        { bitrixId: 302, title: 'Без кода', xmlId: null },
                    ],
                },
            ]);

            const [, inputs] = repository.applyFieldSync.mock.calls[0];
            expect(inputs[0].newOptions.map(option => option.code)).toEqual([
                // Погашенный вариант строку не освобождает: код занят.
                'sub_301',
                'bx_302',
            ]);
        });

        it('пустой выбор — отказ: применять нечего', async () => {
            const { service, repository } = withRecord([listItem()]);

            await expect(
                service.applyFieldSync('q-1', [{ itemId: 'item-1' }]),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(repository.applyFieldSync).not.toHaveBeenCalled();
        });
    });

    describe('кэш', () => {
        it('Redis недоступен — каталог собирается из БД, а не падает', async () => {
            const { service, repository, redis } = makeDeps([makeRecord()]);
            redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
            redis.set.mockRejectedValue(new Error('ECONNREFUSED'));

            const catalog = await service.resolve(DOMAIN, APP);

            expect(catalog.questionnaires).toHaveLength(1);
            expect(repository.findActiveByDomain).toHaveBeenCalledWith(
                DOMAIN,
                APP,
            );
        });

        it('кэш чужого контракта игнорируется', async () => {
            const { service, repository, redis } = makeDeps([makeRecord()]);
            redis.get.mockResolvedValue(
                JSON.stringify({
                    contract: 99,
                    version: 1,
                    hash: 'stale',
                    questionnaires: [],
                }),
            );

            const catalog = await service.resolve(DOMAIN, APP);

            expect(repository.findActiveByDomain).toHaveBeenCalledTimes(1);
            expect(catalog.questionnaires).toHaveLength(1);
        });

        it('готовый каталог берётся из кэша без похода в БД', async () => {
            const { service, repository, redis } = makeDeps([makeRecord()]);
            redis.get.mockResolvedValue(
                JSON.stringify({
                    contract: 1,
                    version: 7,
                    hash: 'cached',
                    questionnaires: [],
                }),
            );

            const version = await service.getVersion(DOMAIN, APP);

            expect(version).toEqual({ version: 7, hash: 'cached' });
            expect(repository.findActiveByDomain).not.toHaveBeenCalled();
        });
    });
});
