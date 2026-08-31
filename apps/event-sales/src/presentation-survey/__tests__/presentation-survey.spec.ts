import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { NotFoundException } from '@nestjs/common';
import { PresentationSurveyEndpointService } from '../services/presentation-survey-endpoint.service';
import { SurveyRendezvousStore } from '../services/survey-rendezvous.store';
import {
    PRESENTATION_SURVEY_VALUE_MAX_LENGTH,
    PresentationSurveyDto,
    UnplannedPresentationSignalDto,
} from '../dto/presentation-survey.dto';

/**
 * Ручка легаси-опросника: жёсткий whitelist, только перезапись
 * (идемпотентность), мягкая деградация по слепку портала, no-op на пустых
 * значениях, Redis-дедуп operationId.
 */
const OPERATION_ID = 'e1c1a1f0-0000-4000-8000-000000000001';

/**
 * Портал: детальные «5К» — на лиде (и, по опции, на сделке — порталы,
 * где админ установил девять полей и в сделку), сводные — лид+сделка.
 */
const makePortal = (over: { dealDetailed?: boolean } = {}) => ({
    getEntityFieldByCode: (entity: string, code: string) => {
        const detailed = code.startsWith('op_5k_');
        const summary =
            code === 'op_presentation_xvost' || code === 'op_presentation_5k';
        if (
            detailed &&
            (entity === 'lead' || (over.dealDetailed && entity === 'deal'))
        ) {
            return { bitrixId: code.toUpperCase(), items: [] };
        }
        if (summary && (entity === 'lead' || entity === 'deal')) {
            return { bitrixId: code.toUpperCase(), items: [] };
        }
        return undefined; // company: поля не установлены
    },
});

/**
 * In-memory Redis: честные семантики SET NX/GET/DEL — на них построен и
 * дедуп операций, и rendezvous с hook-сигналом.
 */
const makeRedis = (input: { fails?: boolean } = {}) => {
    const store = new Map<string, string>();
    const reject = () => Promise.reject(new Error('redis down'));
    const client = {
        set: jest.fn((key: string, value: unknown, ...args: unknown[]) => {
            if (input.fails) return reject();
            if (args.includes('NX') && store.has(key)) {
                return Promise.resolve(null);
            }
            store.set(key, String(value));
            return Promise.resolve('OK');
        }),
        get: jest.fn((key: string) => {
            if (input.fails) return reject();
            return Promise.resolve(store.get(key) ?? null);
        }),
        del: jest.fn((key: string) => {
            if (input.fails) return reject();
            return Promise.resolve(store.delete(key) ? 1 : 0);
        }),
    };
    return { store, client };
};

const makeDeps = (
    input: {
        redisHit?: boolean;
        redisFails?: boolean;
        dealDetailed?: boolean;
    } = {},
) => {
    const updates: {
        entity: string;
        id: number;
        fields: Record<string, unknown>;
    }[] = [];
    const record =
        (entity: string) =>
        (_cmd: string, id: number, fields: Record<string, unknown>) =>
            updates.push({ entity, id, fields });
    const sendBatch = jest.fn().mockResolvedValue([]);
    const bitrix = {
        batch: {
            lead: { update: record('lead') },
            deal: { update: record('deal') },
            company: { update: record('company') },
        },
        api: { callBatchWithConcurrency: sendBatch },
    };
    const pbxInit = jest.fn().mockResolvedValue({
        bitrix,
        PortalModel: makePortal({ dealDetailed: input.dealDetailed }),
    });
    const redis = makeRedis({ fails: input.redisFails });
    if (input.redisHit) {
        // Повтор операции: ключ дедупа уже стоит.
        redis.store.set(`survey:${OPERATION_ID}`, '1');
    }
    const redisService = { getClient: () => redis.client } as never;
    const service = new PresentationSurveyEndpointService(
        { init: pbxInit } as never,
        redisService,
        new SurveyRendezvousStore(redisService),
    );
    return {
        service,
        updates,
        sendBatch,
        pbxInit,
        redisSet: redis.client.set,
        redisStore: redis.store,
        redisClient: redis.client,
    };
};

const dto = (
    over: Partial<PresentationSurveyDto> = {},
): PresentationSurveyDto =>
    ({
        domain: 'example.bitrix24.ru',
        operationId: OPERATION_ID,
        targets: { leadId: 42, dealIds: [1024], companyId: 7 },
        values: {
            xvost: 'Дожать по хвосту',
            fiveKSummary: 'Сводка 5К',
            fiveK: {
                op_5k_client_what: 'Хочет замену Консультанта',
                op_5k_criteri: 'Цена и обновления',
            },
        },
        ...over,
    }) as PresentationSurveyDto;

describe('PresentationSurveyEndpointService', () => {
    it('пишет лид (детальные+сводные), сделки (сводные); компания без полей — warning', async () => {
        const { service, updates, sendBatch } = makeDeps();

        const result = await service.submit(dto());

        expect(result.accepted).toBe(true);
        expect(result.noop).toBe(false);
        expect(result.updated).toEqual(['lead_42', 'deal_1024']);

        const lead = updates.find(u => u.entity === 'lead')!;
        expect(lead.fields).toEqual({
            UF_CRM_OP_5K_CLIENT_WHAT: 'Хочет замену Консультанта',
            UF_CRM_OP_5K_CRITERI: 'Цена и обновления',
            UF_CRM_OP_PRESENTATION_XVOST: 'Дожать по хвосту',
            UF_CRM_OP_PRESENTATION_5K: 'Сводка 5К',
        });

        const deal = updates.find(u => u.entity === 'deal')!;
        expect(deal.fields).toEqual({
            UF_CRM_OP_PRESENTATION_XVOST: 'Дожать по хвосту',
            UF_CRM_OP_PRESENTATION_5K: 'Сводка 5К',
        });

        // Компания: сводные не установлены (реестр) → тихий скип с warning.
        expect(updates.some(u => u.entity === 'company')).toBe(false);
        expect(result.warnings.join(' ')).toContain('company');
        expect(sendBatch).toHaveBeenCalledTimes(1);
    });

    it('детальные «5К» установлены на сделке → сделка получает их зеркально лиду', async () => {
        // Решение владельца 31.08: legacy PHP писал девять детальных и в
        // сделку, новый бэк писал только сводные — карточка pres-сделки
        // показывала девять вечно пустых полей.
        const { service, updates } = makeDeps({ dealDetailed: true });

        await service.submit(dto());

        const deal = updates.find(u => u.entity === 'deal')!;
        expect(deal.fields).toEqual({
            UF_CRM_OP_5K_CLIENT_WHAT: 'Хочет замену Консультанта',
            UF_CRM_OP_5K_CRITERI: 'Цена и обновления',
            UF_CRM_OP_PRESENTATION_XVOST: 'Дожать по хвосту',
            UF_CRM_OP_PRESENTATION_5K: 'Сводка 5К',
        });
    });

    /*
     * ЖЁСТКИЙ whitelist: левые ключи fiveK отбрасываются молча — ручка
     * физически не может писать другие поля лида.
     */
    it('ключи fiveK вне whitelist молча отбрасываются', async () => {
        const { service, updates } = makeDeps();

        await service.submit(
            dto({
                targets: { leadId: 42 },
                values: {
                    fiveK: {
                        op_5k_client_what: 'Валидный ответ',
                        op_inn: '7701234567', // чужое поле
                        ASSIGNED_BY_ID: '1', // попытка сменить ответственного
                        op_lead_status: 'x', // наше, но не анкетное
                    },
                },
            } as never),
        );

        const lead = updates.find(u => u.entity === 'lead')!;
        expect(Object.keys(lead.fields)).toEqual(['UF_CRM_OP_5K_CLIENT_WHAT']);
    });

    it('перезапись, не append: значение уходит как есть', async () => {
        const { service, updates } = makeDeps();
        await service.submit(
            dto({
                targets: { leadId: 42 },
                values: { xvost: 'Новый хвост' },
            } as never),
        );
        expect(
            updates.find(u => u.entity === 'lead')!.fields
                .UF_CRM_OP_PRESENTATION_XVOST,
        ).toBe('Новый хвост');
    });

    it('повтор того же payload (новый operationId) — тот же результат, без ошибок', async () => {
        const { service, updates } = makeDeps();
        const first = await service.submit(dto());
        const second = await service.submit(
            dto({ operationId: 'e1c1a1f0-0000-4000-8000-000000000002' }),
        );

        expect(second.updated).toEqual(first.updated);
        expect(second.warnings).toEqual(first.warnings);
        // Обе записи выполнены — перезапись тех же значений безопасна.
        expect(updates.filter(u => u.entity === 'lead')).toHaveLength(2);
    });

    it('повтор operationId → дедуп: в Битрикс не ходим', async () => {
        const { service, updates, pbxInit } = makeDeps({ redisHit: true });

        const result = await service.submit(dto());

        expect(result.deduplicated).toBe(true);
        expect(updates).toHaveLength(0);
        expect(pbxInit).not.toHaveBeenCalled();
    });

    it('Redis упал → пишем без дедупа (анкета не теряется)', async () => {
        const { service, updates } = makeDeps({ redisFails: true });
        const result = await service.submit(dto());
        expect(result.deduplicated).toBe(false);
        expect(updates.length).toBeGreaterThan(0);
    });

    it('лид-only и deals-only цели работают по отдельности', async () => {
        const leadOnly = makeDeps();
        await leadOnly.service.submit(
            dto({ targets: { leadId: 42 } } as never),
        );
        expect(leadOnly.updates.map(u => u.entity)).toEqual(['lead']);

        const dealsOnly = makeDeps();
        await dealsOnly.service.submit(
            dto({ targets: { dealIds: [1, 2] } } as never),
        );
        expect(dealsOnly.updates.map(u => `${u.entity}_${u.id}`)).toEqual([
            'deal_1',
            'deal_2',
        ]);
    });

    it('пустые values → 200 no-op без походов в Битрикс и Redis', async () => {
        const { service, updates, pbxInit, redisSet } = makeDeps();

        const result = await service.submit(
            dto({ values: { xvost: '   ', fiveK: {} } } as never),
        );

        expect(result.noop).toBe(true);
        expect(result.accepted).toBe(true);
        expect(updates).toHaveLength(0);
        expect(pbxInit).not.toHaveBeenCalled();
        expect(redisSet).not.toHaveBeenCalled();
    });

    it('все поля неустановлены → no-op с warnings, без batch-отправки', async () => {
        const { service, sendBatch } = makeDeps();
        // Цель — только компания, а на ней поля не установлены.
        const result = await service.submit(
            dto({ targets: { companyId: 7 } } as never),
        );
        expect(result.noop).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(sendBatch).not.toHaveBeenCalled();
    });

    /*
     * Значения анкеты многострочны ПО ПОСТРОЕНИЮ (хвост — построчная
     * склейка, сводка 5К — построчная сводка), а записи уходят
     * batch-командами: сырой `\n` там доезжает до карточки подчёркиванием.
     * Перед батчем всё проходит toBatchText (\r\n|\r|\n → %0A).
     */
    it('переносы строк экранируются в %0A во всех batch-полях', async () => {
        const { service, updates } = makeDeps();

        await service.submit(
            dto({
                values: {
                    xvost: 'строка 1\nстрока 2\r\nстрока 3',
                    fiveKSummary: 'Клиент: готов\nКомпания: решает директор',
                    fiveK: {
                        op_5k_client_what: 'хочет:\n- замену\n- обновления',
                    },
                },
            } as never),
        );

        const lead = updates.find(u => u.entity === 'lead')!;
        // Многострочная склейка доезжает строками: стыки — %0A, без потерь.
        expect(lead.fields.UF_CRM_OP_PRESENTATION_XVOST).toBe(
            'строка 1%0Aстрока 2%0Aстрока 3',
        );
        expect(lead.fields.UF_CRM_OP_PRESENTATION_5K).toBe(
            'Клиент: готов%0AКомпания: решает директор',
        );
        expect(lead.fields.UF_CRM_OP_5K_CLIENT_WHAT).toBe(
            'хочет:%0A- замену%0A- обновления',
        );
        // Ни одного сырого переноса ни в одном batch-поле.
        for (const update of updates) {
            for (const value of Object.values(update.fields)) {
                expect(String(value)).not.toMatch(/[\r\n]/);
            }
        }
    });

    it('длинные значения обрезаются до лимита', async () => {
        const { service, updates } = makeDeps();
        await service.submit(
            dto({
                targets: { leadId: 42 },
                values: { xvost: 'x'.repeat(100_000) },
            } as never),
        );
        const value = updates[0].fields.UF_CRM_OP_PRESENTATION_XVOST as string;
        expect(value).toHaveLength(PRESENTATION_SURVEY_VALUE_MAX_LENGTH);
    });

    it('домен без портала → 404', async () => {
        const pbxInit = jest.fn().mockRejectedValue(new Error('no portal'));
        const redisService = {
            getClient: () => makeRedis().client,
        } as never;
        const service = new PresentationSurveyEndpointService(
            { init: pbxInit } as never,
            redisService,
            new SurveyRendezvousStore(redisService),
        );
        await expect(service.submit(dto())).rejects.toThrow(NotFoundException);
    });
});

describe('Rendezvous: unplanned-сигнал hook ↔ опросник', () => {
    const signalDto = (
        over: Partial<UnplannedPresentationSignalDto> = {},
    ): UnplannedPresentationSignalDto =>
        ({
            domain: 'example.bitrix24.ru',
            unplannedDealId: 900,
            baseDealId: 1024,
            companyId: 7,
            leadId: 42,
            ...over,
        }) as UnplannedPresentationSignalDto;

    it('порядок «опросник → сигнал»: сводные пишутся при сигнале', async () => {
        const deps = makeDeps();
        await deps.service.submit(dto());
        deps.updates.length = 0;

        const result = await deps.service.signal(signalDto());

        expect(result.matched).toBe(true);
        expect(result.pending).toBe(false);
        expect(result.updated).toEqual(['deal_900']);
        // Портал без детальных «5К» на сделке → едут только сводные
        // (setField молча пропускает неустановленные).
        const unplanned = deps.updates.find(u => u.id === 900)!;
        expect(unplanned.fields).toEqual({
            UF_CRM_OP_PRESENTATION_XVOST: 'Дожать по хвосту',
            UF_CRM_OP_PRESENTATION_5K: 'Сводка 5К',
        });
    });

    it('unplanned-сделка получает детальные «5К», если они установлены на сделке', async () => {
        // Асимметрия «обычная сделка с девятью полями, unplanned с двумя»
        // была бы необъяснима для менеджера: rendezvous возит полный
        // состав (кэш старого формата без fiveK читается как «не было»).
        const deps = makeDeps({ dealDetailed: true });
        await deps.service.submit(dto());
        deps.updates.length = 0;

        await deps.service.signal(signalDto());

        const unplanned = deps.updates.find(u => u.id === 900)!;
        expect(unplanned.fields).toEqual({
            UF_CRM_OP_5K_CLIENT_WHAT: 'Хочет замену Консультанта',
            UF_CRM_OP_5K_CRITERI: 'Цена и обновления',
            UF_CRM_OP_PRESENTATION_XVOST: 'Дожать по хвосту',
            UF_CRM_OP_PRESENTATION_5K: 'Сводка 5К',
        });
    });

    it('порядок «сигнал → опросник»: пишется при опроснике, pending удалён', async () => {
        const deps = makeDeps();

        const signalResult = await deps.service.signal(signalDto());
        expect(signalResult.matched).toBe(false);
        expect(signalResult.pending).toBe(true);
        expect(deps.updates).toHaveLength(0);

        const submitResult = await deps.service.submit(dto());

        expect(submitResult.updated).toContain('deal_900');
        const unplanned = deps.updates.find(u => u.id === 900)!;
        expect(Object.keys(unplanned.fields).sort()).toEqual([
            'UF_CRM_OP_PRESENTATION_5K',
            'UF_CRM_OP_PRESENTATION_XVOST',
        ]);
        // Ожидание отработано и снято.
        expect(
            [...deps.redisStore.keys()].filter(k =>
                k.startsWith('survey:pending-signal:'),
            ),
        ).not.toContain('survey:pending-signal:example.bitrix24.ru:deal:1024');
        // Повторный опросник не продублирует запись в unplanned.
        deps.updates.length = 0;
        await deps.service.submit(
            dto({ operationId: 'e1c1a1f0-0000-4000-8000-000000000003' }),
        );
        expect(deps.updates.some(u => u.id === 900)).toBe(false);
    });

    /*
     * Кэш rendezvous хранит СЫРЫЕ значения (человекочитаем, независим от
     * транспорта), а экранирование происходит при записи — поэтому оба
     * порядка прибытия дают одинаково экранированный результат.
     */
    it('rendezvous-запись экранирована так же, как прямая (кэш — сырой)', async () => {
        const deps = makeDeps();
        await deps.service.submit(
            dto({
                values: { xvost: 'строка 1\nстрока 2' },
            } as never),
        );

        // В Redis-кэше — настоящий перенос, не %0A.
        const cached = deps.redisStore.get(
            'survey:values:example.bitrix24.ru:deal:1024',
        )!;
        expect(cached).toContain('\\n'); // JSON.stringify сырого \n
        expect(cached).not.toContain('%0A');

        deps.updates.length = 0;
        const result = await deps.service.signal(signalDto());

        expect(result.matched).toBe(true);
        const unplanned = deps.updates.find(u => u.id === 900)!;
        expect(unplanned.fields.UF_CRM_OP_PRESENTATION_XVOST).toBe(
            'строка 1%0Aстрока 2',
        );
    });

    it('повтор сигнала после записи → дедуп, второй записи нет', async () => {
        const deps = makeDeps();
        await deps.service.submit(dto());

        const first = await deps.service.signal(signalDto());
        expect(first.matched).toBe(true);
        deps.updates.length = 0;

        const second = await deps.service.signal(signalDto());
        expect(second.deduplicated).toBe(true);
        expect(second.matched).toBe(false);
        expect(deps.updates).toHaveLength(0);
    });

    it('сигнал без кэша и без опросника: pending лежит, ничего не пишется', async () => {
        const deps = makeDeps();

        const result = await deps.service.signal(signalDto());

        expect(result).toMatchObject({ matched: false, pending: true });
        expect(deps.updates).toHaveLength(0);
        expect(deps.pbxInit).not.toHaveBeenCalled();
        // Ожидание лежит под всеми ссылками сигнала (истечёт по TTL).
        expect(
            deps.redisStore.get(
                'survey:pending-signal:example.bitrix24.ru:deal:1024',
            ),
        ).toContain('900');
    });

    it('сигнал без единой ссылки rendezvous → warning, не pending', async () => {
        const deps = makeDeps();
        const result = await deps.service.signal(
            signalDto({
                baseDealId: undefined,
                companyId: undefined,
                leadId: undefined,
            }),
        );
        expect(result.pending).toBe(false);
        expect(result.warnings.join(' ')).toContain('rendezvous невозможен');
    });

    it('Redis упал: сигнал не падает наружу, rendezvous деградирует', async () => {
        const deps = makeDeps({ redisFails: true });
        const result = await deps.service.signal(signalDto());
        expect(result.accepted).toBe(true);
        expect(result.matched).toBe(false);
        expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('невалидный DTO сигнала → 400', async () => {
        const { UnplannedPresentationSignalDto: SignalDto } = await import(
            '../dto/presentation-survey.dto'
        );
        const noDomain = await validate(
            plainToInstance(SignalDto, { unplannedDealId: 900 }),
        );
        expect(noDomain.some(e => e.property === 'domain')).toBe(true);

        const badDeal = await validate(
            plainToInstance(SignalDto, {
                domain: 'example.bitrix24.ru',
                unplannedDealId: 0,
            }),
        );
        expect(badDeal.some(e => e.property === 'unplannedDealId')).toBe(true);
    });
});

describe('PresentationSurveyDto — валидация', () => {
    const validateDto = async (over: Record<string, unknown>) =>
        validate(plainToInstance(PresentationSurveyDto, { ...dto(), ...over }));

    it('валидный запрос проходит', async () => {
        expect(await validateDto({})).toHaveLength(0);
    });

    it('без domain → 400', async () => {
        const errors = await validateDto({ domain: undefined });
        expect(errors.some(e => e.property === 'domain')).toBe(true);
    });

    it('без operationId или не-uuid → 400', async () => {
        expect(
            (await validateDto({ operationId: undefined })).some(
                e => e.property === 'operationId',
            ),
        ).toBe(true);
        expect(
            (await validateDto({ operationId: 'not-a-uuid' })).some(
                e => e.property === 'operationId',
            ),
        ).toBe(true);
    });
});
