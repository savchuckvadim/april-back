import {
    BadGatewayException,
    ConflictException,
    UnprocessableEntityException,
} from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import { RedisService } from '@lib/core/redis/redis.service';
import { QueueDispatcherService } from '@lib/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { DealSendDto } from '../dto/deal-send.dto';
import { DealSendJobDto } from '../dto/deal-send-job.dto';
import { DealSendSupplyTextsService } from '../services/deal-send-supply-texts.service';
import {
    DealSendUseCase,
    dealSendCreateKey,
} from '../use-cases/deal-send.use-case';
import { DEAL_SEND_JOB_OPTIONS } from '../lib/deal-send-job.options';

const DOMAIN = 'gsr.bitrix24.ru';

/** Поля сделки портала: код → UF. */
const DEAL_FIELDS: Record<string, string> = {
    complect_name: 'UF_CRM_COMPLECT',
    document_provider: 'UF_CRM_DOCUMENT_PROVIDER',
    offer_supply_q: 'UF_CRM_1689656448',
};

const SALES_BASE = {
    code: 'sales_base',
    bitrixId: '97',
    stages: [
        { code: 'sales_new', bitrixId: 'NEW' },
        { code: 'sales_offer_create', bitrixId: 'PREPARATION' },
    ],
};

type Options = {
    categories?: unknown[];
    hasDealSchema?: boolean;
};

const makePortalModel = ({
    categories = [SALES_BASE],
    hasDealSchema = true,
}: Options = {}) => ({
    getDeal: () => (hasDealSchema ? { categories } : undefined),
    getDealCategoryByCode: (code: string) =>
        (categories as Array<{ code: string }>).find(
            item => item.code === code,
        ),
    getDealFieldBitrixIdByCode: (code: string) => DEAL_FIELDS[code] ?? '',
    getDealFields: () =>
        Object.entries(DEAL_FIELDS).map(([code, bitrixId]) => ({
            code,
            bitrixId,
        })),
    getFieldBitrixId: (item: { bitrixId: string }) => item.bitrixId,
    getMeasureByCode: () => undefined,
    // смарта service_offer на тестовом портале нет
    getSmartByType: () => undefined,
});

const makeUseCase = (options: Options = {}) => {
    const bitrix = {
        deal: { set: jest.fn().mockResolvedValue({ result: 555 }) },
    };
    const pbx = {
        init: jest.fn().mockResolvedValue({
            bitrix,
            PortalModel: makePortalModel(options),
        }),
    };
    const dispatcher = { dispatch: jest.fn().mockResolvedValue({}) };
    const supplyTexts = {
        enrich: jest.fn((fields: unknown) => Promise.resolve(fields)),
    };
    const redis = {
        set: jest.fn().mockResolvedValue('OK'),
        get: jest.fn().mockResolvedValue(null),
        del: jest.fn().mockResolvedValue(1),
    };
    const useCase = new DealSendUseCase(
        pbx as unknown as PBXService,
        dispatcher as unknown as QueueDispatcherService,
        supplyTexts as unknown as DealSendSupplyTextsService,
        { getClient: () => redis } as unknown as RedisService,
    );
    return { useCase, bitrix, dispatcher, redis };
};

const dto = (overrides: Partial<DealSendDto> = {}): DealSendDto =>
    ({
        domain: DOMAIN,
        dealId: null,
        userId: 187,
        companyId: 117699,
        dealName: '',
        fields: [
            { code: 'complect_name', appType: 'product', value: 'Гарант-Офис' },
            {
                code: 'document_provider',
                appType: 'document',
                value: 'Гарант-Сервис',
            },
        ],
        productRows: [
            {
                productId: 0,
                productName: 'Гарант-Офис Интернет 1 ОД',
                price: 7000,
                priceNetto: 12279,
                discountSum: 5279,
                quantity: 12,
                measureCode: 796,
                measureId: 796,
                sort: 0,
            },
        ],
        ...overrides,
    }) as DealSendDto;

const dispatchedJob = (dispatcher: { dispatch: jest.Mock }): DealSendJobDto =>
    (dispatcher.dispatch.mock.calls[0] as unknown[])[2] as DealSendJobDto;

/** Поля первого crm.deal.add. */
const dealFields = (bitrix: {
    deal: { set: jest.Mock };
}): Record<string, unknown> =>
    (bitrix.deal.set.mock.calls[0] as unknown[])[0] as Record<string, unknown>;

describe('DealSendUseCase: создание сделки', () => {
    it('новая сделка — sales_base, «Документы», компания, ответственный, поставщик, параметры как у легаси', async () => {
        const { useCase, bitrix } = makeUseCase();

        const response = await useCase.execute(dto());

        expect(bitrix.deal.set).toHaveBeenCalledWith(
            {
                TITLE: '',
                CATEGORY_ID: '97',
                STAGE_ID: 'C97:PREPARATION',
                OPENED: 'Y',
                CURRENCY_ID: 'RUB',
                PROBABILITY: 30,
                ASSIGNED_BY_ID: '187',
                COMPANY_ID: '117699',
                UF_CRM_DOCUMENT_PROVIDER: 'Гарант-Сервис',
            },
            { REGISTER_SONET_EVENT: 'Y' },
            // без автоповтора: повтор после таймаута создал бы вторую сделку
            { retries: 0 },
        );
        expect(response).toMatchObject({
            dealId: 555,
            created: true,
            warnings: [],
        });
        expect(response.operationId).toEqual(expect.any(String));
    });

    it('общая воронка (0) — STAGE_ID без префикса', async () => {
        const { useCase, bitrix } = makeUseCase({
            categories: [
                {
                    code: 'sales_base',
                    bitrixId: '0',
                    stages: [{ code: 'sales_offer_create', bitrixId: 'NEW' }],
                },
            ],
        });

        await useCase.execute(dto());

        expect(dealFields(bitrix).STAGE_ID).toBe('NEW');
    });

    it('стадии «Документы» нет — без STAGE_ID и с предупреждением', async () => {
        const { useCase, bitrix } = makeUseCase({
            categories: [
                {
                    code: 'sales_base',
                    bitrixId: '97',
                    stages: [{ code: 'sales_new', bitrixId: 'NEW' }],
                },
            ],
        });

        const response = await useCase.execute(dto());

        expect(dealFields(bitrix)).not.toHaveProperty('STAGE_ID');
        expect(response.warnings).toEqual(['stage_not_found']);
    });

    it('нет воронки sales_base — 422 без создания (фронт создаст по-старому)', async () => {
        const { useCase, bitrix, dispatcher } = makeUseCase({
            categories: [],
        });

        await expect(useCase.execute(dto())).rejects.toBeInstanceOf(
            UnprocessableEntityException,
        );
        expect(bitrix.deal.set).not.toHaveBeenCalled();
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('нет схемы сделок (маркетплейс-портал) — 422 вместо TypeError', async () => {
        const { useCase } = makeUseCase({ hasDealSchema: false });

        await expect(
            useCase.execute(dto({ dealId: 217301 })),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('Bitrix не вернул id — 502', async () => {
        const { useCase, bitrix } = makeUseCase();
        bitrix.deal.set.mockResolvedValueOnce({ result: 0 });

        await expect(useCase.execute(dto())).rejects.toBeInstanceOf(
            BadGatewayException,
        );
    });
});

describe('DealSendUseCase: запись полей и строк', () => {
    it('существующая сделка: без создания, COMPANY_ID в полях, задание в своей очереди', async () => {
        const { useCase, bitrix, dispatcher } = makeUseCase();

        const response = await useCase.execute(dto({ dealId: 217301 }));

        expect(bitrix.deal.set).not.toHaveBeenCalled();
        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            QueueNames.KONSTRUCTOR_DEAL_SEND,
            JobNames.KONSTRUCTOR_DEAL_SEND,
            expect.any(Object),
            response.operationId,
            DEAL_SEND_JOB_OPTIONS,
        );
        expect(dispatchedJob(dispatcher)).toMatchObject({
            domain: DOMAIN,
            dealId: 217301,
            fields: {
                UF_CRM_COMPLECT: 'Гарант-Офис',
                UF_CRM_DOCUMENT_PROVIDER: 'Гарант-Сервис',
                COMPANY_ID: '117699',
            },
        });
        expect(response.created).toBe(false);
    });

    it('новая сделка: поля и строки дописывает задание', async () => {
        const { useCase, dispatcher } = makeUseCase();

        await useCase.execute(dto());

        const job = dispatchedJob(dispatcher);
        expect(job.dealId).toBe(555);
        expect(job.productRows).toHaveLength(1);
        // id позиции не передаём: это ID существующей строки, а не товара
        expect(job.productRows?.[0]).not.toHaveProperty('id');
    });

    it('пустой список строк — строки не трогаем (как легаси)', async () => {
        const { useCase, dispatcher } = makeUseCase();

        await useCase.execute(dto({ dealId: 217301, productRows: [] }));

        expect(dispatchedJob(dispatcher).productRows).toBeUndefined();
    });

    it('quantity_for_kp уходит в поле шаблонов offer_supply_q', async () => {
        const { useCase, dispatcher } = makeUseCase();

        const response = await useCase.execute(
            dto({
                dealId: 217301,
                fields: [
                    {
                        code: 'quantity_for_kp',
                        appType: 'product',
                        value: 'Интернет версия на 1 одновременный доступ к системе',
                    },
                ] as DealSendDto['fields'],
            }),
        );

        expect(dispatchedJob(dispatcher).fields).toMatchObject({
            UF_CRM_1689656448:
                'Интернет версия на 1 одновременный доступ к системе',
        });
        expect(response.skipped).toEqual([]);
    });

    it('писать нечего — задание не ставим, operationId null', async () => {
        const { useCase, dispatcher } = makeUseCase();

        const response = await useCase.execute(
            dto({
                dealId: 217301,
                companyId: null,
                fields: [],
                productRows: undefined,
            }),
        );

        expect(dispatcher.dispatch).not.toHaveBeenCalled();
        expect(response.operationId).toBeNull();
    });
});

describe('DealSendUseCase: повтор того же сохранения (requestKey)', () => {
    const REQUEST_KEY = 'a1b2c3d4-0000-4000-8000-000000000001';
    const KEY = dealSendCreateKey(DOMAIN, REQUEST_KEY);

    it('первый запрос занимает ключ и запоминает созданную сделку', async () => {
        const { useCase, redis } = makeUseCase();

        await useCase.execute(dto({ requestKey: REQUEST_KEY }));

        expect(redis.set).toHaveBeenNthCalledWith(
            1,
            KEY,
            'pending',
            'EX',
            expect.any(Number),
            'NX',
        );
        expect(redis.set).toHaveBeenNthCalledWith(
            2,
            KEY,
            '555',
            'EX',
            expect.any(Number),
        );
    });

    it('повтор после успеха — та же сделка, вторую не создаём', async () => {
        const { useCase, bitrix, redis } = makeUseCase();
        redis.set.mockResolvedValueOnce(null);
        redis.get.mockResolvedValueOnce('555');

        const response = await useCase.execute(
            dto({ requestKey: REQUEST_KEY }),
        );

        expect(bitrix.deal.set).not.toHaveBeenCalled();
        expect(response).toMatchObject({
            dealId: 555,
            created: true,
            warnings: ['replayed'],
        });
    });

    it('создание ещё идёт — 409, вторую не создаём', async () => {
        const { useCase, bitrix, redis } = makeUseCase();
        redis.set.mockResolvedValueOnce(null);
        redis.get.mockResolvedValueOnce('pending');

        await expect(
            useCase.execute(dto({ requestKey: REQUEST_KEY })),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(bitrix.deal.set).not.toHaveBeenCalled();
    });

    it('создание упало — ключ освобождаем, ошибку отдаём', async () => {
        const { useCase, bitrix, redis } = makeUseCase();
        bitrix.deal.set.mockRejectedValueOnce(new Error('timeout'));

        await expect(
            useCase.execute(dto({ requestKey: REQUEST_KEY })),
        ).rejects.toThrow('timeout');
        expect(redis.del).toHaveBeenCalledWith(KEY);
    });

    // Сделка уже создана: ошибка ответа лишила бы фронт её id, и он создал
    // бы вторую по-старому.
    it('сделка создана, а ключ повтора не записался — ответ всё равно с dealId', async () => {
        const { useCase, redis } = makeUseCase();
        redis.set
            .mockResolvedValueOnce('OK') // заняли ключ
            .mockRejectedValueOnce(new Error('Redis down')); // записать dealId не вышло

        const response = await useCase.execute(
            dto({ requestKey: REQUEST_KEY }),
        );

        expect(response).toMatchObject({ dealId: 555, created: true });
        expect(redis.del).not.toHaveBeenCalled();
    });
});

describe('DealSendUseCase: после создания ответ не падает', () => {
    it('запись не встала в очередь — dealId и write_not_queued, фронт пишет через легаси', async () => {
        const { useCase, dispatcher } = makeUseCase();
        dispatcher.dispatch.mockRejectedValueOnce(new Error('Redis down'));

        const response = await useCase.execute(dto());

        expect(response).toMatchObject({
            dealId: 555,
            created: true,
            operationId: null,
            warnings: ['write_not_queued'],
        });
    });
});

describe('DealSendUseCase: последнее сохранение сделки', () => {
    it('отмечает operationId как последнее сохранение до постановки задания', async () => {
        const { useCase, dispatcher, redis } = makeUseCase();

        const response = await useCase.execute(dto({ dealId: 217301 }));

        expect(redis.set).toHaveBeenCalledWith(
            `konstructor:deal-send:latest:${DOMAIN}:deal:217301`,
            response.operationId,
            'EX',
            expect.any(Number),
        );
        const latestOrder = redis.set.mock.invocationCallOrder[0];
        const dispatchOrder = dispatcher.dispatch.mock.invocationCallOrder[0];
        expect(latestOrder).toBeLessThan(dispatchOrder);
    });

    it('Redis недоступен — задание всё равно ставим', async () => {
        const { useCase, dispatcher, redis } = makeUseCase();
        redis.set.mockRejectedValueOnce(new Error('Redis down'));

        const response = await useCase.execute(dto({ dealId: 217301 }));

        expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
        expect(response.operationId).toEqual(expect.any(String));
    });
});

describe('DealSendUseCase: смарт', () => {
    it('смарт не установлен — 422 с понятным текстом, схема сделок не нужна', async () => {
        const { useCase } = makeUseCase({ hasDealSchema: false });

        await expect(
            useCase.execute(
                dto({
                    dealId: 217301,
                    target: { kind: 'smart', smartType: 'service_offer' },
                }),
            ),
        ).rejects.toThrow(/не установлен смарт "service_offer"/);
    });
});
