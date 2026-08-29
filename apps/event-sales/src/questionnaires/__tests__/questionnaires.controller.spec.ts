import { BadRequestException, Logger } from '@nestjs/common';
import {
    PortalQuestionnaireItemRecord,
    PortalQuestionnaireRecord,
    PortalQuestionnairesService,
} from '@lib/portal-lib/store/questionnaires';
import { QuestionnairesController } from '../questionnaires.controller';

/**
 * Спека read-эндпоинта фрейма: проверяется ровно то, из-за чего фрейм имеет
 * право дёргать его на старте, ничем не рискуя —
 *  - портал без анкет отвечает пустым каталогом, а не ошибкой: фронт живёт
 *    без каталога на встроенном наборе;
 *  - пункт со сломанной привязкой к полю во фрейм не уезжает: записать в
 *    него нечего, а обязательностью он заблокировал бы отправку отчёта;
 *  - версия каталога совпадает с полным ответом — иначе фрейм либо тянул бы
 *    каталог на каждый опрос, либо не заметил бы правку в админке.
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
    items: [makeItemRecord()],
    ...over,
});

/**
 * Контроллер поверх НАСТОЯЩЕГО сервиса: подменяются только хранилище и
 * Redis. Компиляция каталога — часть проверяемого поведения, подменять её
 * моком значило бы проверять пересказ вместо ответа.
 */
const makeController = (records: PortalQuestionnaireRecord[] = []) => {
    const repository = {
        findActiveByDomain: jest.fn().mockResolvedValue(records),
        findByPortalId: jest.fn().mockResolvedValue([]),
        findById: jest.fn().mockResolvedValue(null),
        save: jest.fn(),
        remove: jest.fn(),
        setItemFieldStatus: jest.fn(),
    };
    const portalRepository = {
        findById: jest.fn().mockResolvedValue({ id: 5, domain: DOMAIN }),
    };
    // Кэш выключен намеренно: сравнивать хэши имеет смысл только если они
    // каждый раз пересобираются из состава.
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
    return {
        controller: new QuestionnairesController(service),
        repository,
        redis,
    };
};

describe('QuestionnairesController', () => {
    beforeAll(() => {
        // Отсев пунктов сопровождается warn'ами — в выводе тестов это шум.
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });

    afterEach(() => jest.clearAllMocks());

    it('портал без анкет: пустой массив и ответ, а не 404', async () => {
        const { controller, repository } = makeController([]);

        const catalog = await controller.resolve(DOMAIN, APP);

        expect(catalog.contract).toBe(1);
        expect(catalog.version).toBe(0);
        expect(catalog.questionnaires).toEqual([]);
        expect(typeof catalog.hash).toBe('string');
        expect(repository.findActiveByDomain).toHaveBeenCalledWith(DOMAIN, APP);
    });

    it('код приложения не передан — берётся event-sales', async () => {
        const { controller, repository } = makeController([]);

        await controller.resolve(DOMAIN, undefined);

        expect(repository.findActiveByDomain).toHaveBeenCalledWith(
            DOMAIN,
            'event-sales',
        );
    });

    it('пункт со сломанной привязкой во фрейм не уезжает', async () => {
        const { controller } = makeController([
            makeRecord({
                items: [
                    makeItemRecord({
                        id: 'item-ok',
                        code: 'decision_date',
                        fieldStatus: 'ok',
                    }),
                    makeItemRecord({
                        id: 'item-broken',
                        code: 'budget',
                        control: 'money',
                        fieldName: 'UF_CRM_DELETED',
                        fieldType: 'money',
                        staleAfterDays: null,
                        fieldStatus: 'missing',
                    }),
                ],
            }),
        ]);

        const catalog = await controller.resolve(DOMAIN, APP);

        expect(catalog.questionnaires).toHaveLength(1);
        expect(catalog.questionnaires[0].items.map(item => item.code)).toEqual([
            'decision_date',
        ]);
    });

    it('поле и вариант уезжают готовыми: имя поля и bitrixId', async () => {
        const { controller } = makeController([
            makeRecord({
                items: [
                    makeItemRecord({
                        code: 'objection',
                        control: 'enumeration',
                        fieldName: 'UF_CRM_1712345679',
                        fieldType: 'enumeration',
                        staleAfterDays: null,
                        options: [
                            {
                                id: 'opt-1',
                                code: 'price',
                                title: 'Дорого',
                                bitrixId: 777,
                                xmlId: null,
                                sort: 100,
                                isDefault: false,
                                isActive: true,
                            },
                        ],
                    }),
                ],
            }),
        ]);

        const catalog = await controller.resolve(DOMAIN, APP);
        const item = catalog.questionnaires[0].items[0];

        expect(item.field).toEqual({
            name: 'UF_CRM_1712345679',
            type: 'enumeration',
        });
        expect(item.options).toEqual([
            { code: 'price', title: 'Дорого', bitrixId: 777 },
        ]);
        // BigInt в ответе убил бы сериализацию — проверяем именно её.
        expect(() => JSON.stringify(catalog)).not.toThrow();
    });

    it('версия отдаётся той же парой version и hash, что и каталог', async () => {
        const { controller } = makeController([makeRecord()]);

        const catalog = await controller.resolve(DOMAIN, APP);
        const version = await controller.version(DOMAIN, APP);

        expect(version).toEqual({
            version: catalog.version,
            hash: catalog.hash,
        });
        expect(catalog.version).toBe(3);
    });

    it('состав изменился — hash разошёлся', async () => {
        const before = await makeController([makeRecord()]).controller.resolve(
            DOMAIN,
            APP,
        );
        const after = await makeController([
            makeRecord({ items: [makeItemRecord({ code: 'other_date' })] }),
        ]).controller.resolve(DOMAIN, APP);

        expect(after.hash).not.toBe(before.hash);
    });

    it('домен не передан — отказ, а не пустой каталог', async () => {
        const { controller, repository } = makeController([]);

        await expect(controller.resolve('  ', APP)).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(
            controller.version(undefined as never, APP),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(repository.findActiveByDomain).not.toHaveBeenCalled();
    });
});
