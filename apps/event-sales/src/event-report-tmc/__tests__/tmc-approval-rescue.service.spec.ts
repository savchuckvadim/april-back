import { PBXService } from '@/modules/pbx/pbx.service';
import { AppCacheService } from '@lib/app-cache';
import { ETimeZone } from '@lib/shared/lib/date';
import { TmcPresentationApprovedDto } from '../dto/tmc-presentation-approved.dto';
import {
    TmcApprovalLookup,
    TmcPresentationApprovalService,
} from '../services/tmc-presentation-approval.service';
import {
    TmcApprovalRescueOptions,
    TmcApprovalRescueService,
} from '../services/tmc-approval-rescue.service';
import { TMC_APPROVAL_CACHE_APP } from '../constants/tmc-approval-cache.const';

/**
 * Оркестрация подстраховки: читает утверждённые элементы РПА окна
 * просмотра, пропускает свежие, уже принятые, обработанные и исчерпавшие
 * попытки, ставит согласование через тот же сервис, что робот, и помечает
 * попытку; одна упавшая заявка не мешает остальным. Битрикс, очередь и
 * кэш — моки; «сейчас» передаётся явно.
 */
const DOMAIN = 'gsr.bitrix24.ru';
/** 16:30 по Москве 31.08.2026. */
const NOW = new Date('2026-08-31T13:30:00.000Z');
const OPERATION_ID = 'tmc-approve-198467-323-202608311500';

const STAGES = [
    { id: 25, code: 'rpa_pres_new', name: 'Запуск' },
    { id: 35, code: 'rpa_pres_success', name: 'Утверждено' },
];

type Row = Record<string, unknown>;

const approvedItem = (over: Row = {}): Row => ({
    id: 1195,
    stageId: 35,
    name: 'Заявка перезвонить Виктория от 31.08.2026 11:30:07',
    movedTime: '31.08.2026 15:53:29',
    movedBy: 39,
    UF_RPA_7_NEXT_PRES_PLAN_DATE: '2026-08-31T15:00:00+03:00',
    UF_RPA_7_LAST_PRES_DONE_RESPONSIBLE: 323,
    UF_RPA_7_LAST_PRES_PLAN_RESPONSIBLE: 215,
    UF_RPA_7_OWNER_OP: 1,
    UF_RPA_7_RPA_CRM_COMPANY: 74649,
    UF_RPA_7_RPA_CRM_CONTACT: 48223,
    UF_RPA_7_RPA_CRM_TMC_DEAL: 198467,
    UF_RPA_7_RPA_TMC_COMMENT: ['спортивная школа'],
    ...over,
});

const options: TmcApprovalRescueOptions = {
    dryRun: false,
    stageCodes: ['rpa_pres_success'],
    lookbackHours: 72,
    graceMinutes: 20,
    maxPerRun: 20,
};

const notKnown: TmcApprovalLookup = {
    live: null,
    accepted: null,
    alreadyAccepted: false,
};

interface Setup {
    items?: Row[];
    /** Сделки компании в воронке презентаций (ответ crm.deal.list). */
    companyDeals?: Row[] | Error;
    deals?: Record<number, Row>;
    stages?: Array<{ id: number; code: string; name: string }>;
    rpaInstalled?: boolean;
    cache?: Map<string, unknown>;
    isNew?: boolean;
    lookup?: TmcApprovalLookup | Error;
    attemptSetFails?: boolean;
}

const makeService = ({
    items = [approvedItem()],
    companyDeals = [],
    deals = {},
    stages = STAGES,
    rpaInstalled = true,
    cache = new Map<string, unknown>(),
    isNew = true,
    lookup = notKnown,
    attemptSetFails = false,
}: Setup = {}) => {
    const list = jest.fn(() =>
        Promise.resolve({ result: { items }, next: undefined }),
    );
    const listForType = jest.fn(() => Promise.resolve({ result: { stages } }));
    const dealGet = jest.fn((id: number) =>
        Promise.resolve({ result: deals[id] ?? null }),
    );
    const dealGetList = jest.fn(
        (): Promise<unknown> =>
            companyDeals instanceof Error
                ? Promise.reject(companyDeals)
                : Promise.resolve({ result: companyDeals }),
    );
    const portal = {
        getRpaByCode: () => (rpaInstalled ? { bitrixId: 7 } : undefined),
        getRpaFieldBitrixIdByCode: (_rpa: string, code: string) =>
            `UF_RPA_7_${code.toUpperCase()}`,
        getTimezone: () => ETimeZone.EUROPE_MOSCOW,
        getDealFieldBitrixIdByCode: () => 'UF_CRM_NEXT_PRES_PLAN_DATE',
        getDealCategoryByCode: () => ({
            code: 'sales_presentation',
            bitrixId: '101',
        }),
    };
    const bitrix = {
        rpaItem: { list },
        rpaStage: { listForType },
        deal: { get: dealGet, getList: dealGetList },
    };
    const pbx = {
        init: jest.fn(() => Promise.resolve({ bitrix, PortalModel: portal })),
    };
    const acceptFromRescue = jest.fn((dto: TmcPresentationApprovedDto) =>
        Promise.resolve({
            operation: {
                operationId: `op-${String(dto.tmcDealId)}`,
                status: isNew ? 'queued' : 'done',
            },
            isNew,
        }),
    );
    const lookupFn = jest.fn(
        (): Promise<TmcApprovalLookup> =>
            lookup instanceof Error
                ? Promise.reject(lookup)
                : Promise.resolve(lookup),
    );
    const appCache = {
        get: jest.fn((ref: { key: string }) =>
            Promise.resolve(cache.get(ref.key) ?? null),
        ),
        set: jest.fn((opts: { key: string; data: unknown }) => {
            if (attemptSetFails && opts.key.startsWith('attempt:')) {
                return Promise.reject(new Error('redis down'));
            }
            cache.set(opts.key, opts.data);
            return Promise.resolve({});
        }),
    };
    const service = new TmcApprovalRescueService(
        pbx as unknown as PBXService,
        {
            acceptFromRescue,
            lookup: lookupFn,
        } as unknown as TmcPresentationApprovalService,
        appCache as unknown as AppCacheService,
    );
    return {
        service,
        list,
        listForType,
        dealGet,
        dealGetList,
        acceptFromRescue,
        lookup: lookupFn,
        appCache,
        cache,
    };
};

describe('TmcApprovalRescueService', () => {
    it('утверждённая заявка без следа презентации — согласование в очередь, попытка помечена', async () => {
        const { service, list, acceptFromRescue, appCache, lookup } =
            makeService();

        const run = await service.runForDomain(DOMAIN, options, NOW);

        expect(run).toMatchObject({ candidates: 1, dispatched: 1, dryRun: 0 });
        expect(run.warnings).toEqual([]);
        // Стадия «Утверждено» по коду из настройки, окно — 72 часа назад по времени портала.
        expect(list).toHaveBeenCalledWith({
            typeId: 7,
            filter: { stageId: 35, '>=movedTime': '2026-08-28T16:30:00+03:00' },
            order: { movedTime: 'DESC' },
        });
        // Id операции тот же, что получит робот с датой «31.08.2026 15:00:00».
        expect(lookup).toHaveBeenCalledWith(DOMAIN, OPERATION_ID);
        expect(acceptFromRescue).toHaveBeenCalledWith(
            expect.objectContaining({
                domain: DOMAIN,
                tmcDealId: 198467,
                companyId: 74649,
                managerId: '323',
                ownerId: '1',
                tmcId: '215',
                deadline: '31.08.2026 15:00:00',
                commentTMC: 'спортивная школа',
            }),
        );
        expect(appCache.set).toHaveBeenCalledWith(
            expect.objectContaining({
                app: TMC_APPROVAL_CACHE_APP,
                domain: DOMAIN,
                key: 'attempt:1195',
                data: expect.objectContaining({
                    attempts: 1,
                    operationId: 'op-198467',
                }) as unknown,
            }),
        );
    });

    it('согласование уже принимали (метка или живой статус) — пропуск без чтения сделок', async () => {
        const { service, acceptFromRescue, dealGetList } = makeService({
            lookup: {
                live: null,
                accepted: {
                    acceptedAt: '2026-08-31T12:54:00.000Z',
                    source: 'робот',
                },
                alreadyAccepted: true,
            },
        });

        const run = await service.runForDomain(DOMAIN, options, NOW);

        expect(run.skipped).toEqual({ 'already-accepted': 1 });
        expect(dealGetList).not.toHaveBeenCalled();
        expect(acceptFromRescue).not.toHaveBeenCalled();
    });

    it('прошлая операция упала — согласование ставится снова', async () => {
        const { service, acceptFromRescue } = makeService({
            lookup: {
                live: {
                    operationId: OPERATION_ID,
                    status: 'failed',
                } as TmcApprovalLookup['live'],
                accepted: {
                    acceptedAt: '2026-08-31T12:54:00.000Z',
                    source: 'робот',
                },
                alreadyAccepted: false,
            },
        });

        const run = await service.runForDomain(DOMAIN, options, NOW);

        expect(run).toMatchObject({ dispatched: 1 });
        expect(acceptFromRescue).toHaveBeenCalledTimes(1);
    });

    it('у компании есть презентация, созданная после утверждения (легаси успело) — пропуск', async () => {
        const { service, acceptFromRescue } = makeService({
            companyDeals: [
                {
                    ID: '198521',
                    ASSIGNED_BY_ID: '323',
                    DATE_CREATE: '2026-08-31T15:53:40+03:00',
                    UF_CRM_NEXT_PRES_PLAN_DATE: '2026-08-31T15:00:00+03:00',
                },
            ],
        });

        const run = await service.runForDomain(DOMAIN, options, NOW);

        expect(run.skipped).toEqual({ processed: 1 });
        expect(acceptFromRescue).not.toHaveBeenCalled();
    });

    it('сделки компании не прочитались — заявка ждёт следующего тика, попытка не считается', async () => {
        const { service, acceptFromRescue, appCache } = makeService({
            companyDeals: new Error('QUERY_LIMIT_EXCEEDED'),
        });

        const run = await service.runForDomain(DOMAIN, options, NOW);

        expect(run.skipped).toEqual({ 'check-failed': 1 });
        expect(run.warnings[0]).toMatch(/QUERY_LIMIT_EXCEEDED/);
        expect(acceptFromRescue).not.toHaveBeenCalled();
        expect(appCache.set).not.toHaveBeenCalled();
    });

    it('холостой ход: кандидат посчитан, очередь и метка не тронуты', async () => {
        const { service, acceptFromRescue, appCache } = makeService();

        const run = await service.runForDomain(
            DOMAIN,
            { ...options, dryRun: true },
            NOW,
        );

        expect(run).toMatchObject({ dispatched: 0, dryRun: 1 });
        expect(acceptFromRescue).not.toHaveBeenCalled();
        expect(appCache.set).not.toHaveBeenCalled();
    });

    it('утверждена десять минут назад — роботу дано время, пропуск', async () => {
        const { service, acceptFromRescue, lookup } = makeService({
            items: [approvedItem({ movedTime: '31.08.2026 16:20:00' })],
        });

        const run = await service.runForDomain(DOMAIN, options, NOW);

        expect(run.skipped).toEqual({ 'too-fresh': 1 });
        expect(lookup).not.toHaveBeenCalled();
        expect(acceptFromRescue).not.toHaveBeenCalled();
    });

    it('три попытки уже были — заявка оставлена людям', async () => {
        const cache = new Map<string, unknown>([
            [
                'attempt:1195',
                { attempts: 3, lastAt: '2026-08-30T10:00:00.000Z' },
            ],
        ]);
        const { service, acceptFromRescue, dealGetList } = makeService({
            cache,
        });

        const run = await service.runForDomain(DOMAIN, options, NOW);

        expect(run.skipped).toEqual({ 'attempts-exhausted': 1 });
        expect(acceptFromRescue).not.toHaveBeenCalled();
        // Дорогая проверка по сделкам не запускается ради заведомого пропуска.
        expect(dealGetList).not.toHaveBeenCalled();
    });

    it('очередь ответила «уже принята» — попытка не считается', async () => {
        const { service, appCache } = makeService({ isNew: false });

        const run = await service.runForDomain(DOMAIN, options, NOW);

        expect(run).toMatchObject({ dispatched: 0 });
        expect(run.skipped).toEqual({ 'already-accepted': 1 });
        expect(appCache.set).not.toHaveBeenCalled();
    });

    it('метка попытки не записалась — согласование всё равно поставлено, предупреждение в итоге', async () => {
        const { service, acceptFromRescue } = makeService({
            attemptSetFails: true,
        });

        const run = await service.runForDomain(DOMAIN, options, NOW);

        expect(run).toMatchObject({ dispatched: 1 });
        expect(run.warnings[0]).toMatch(/метка попытки не записана/);
        expect(acceptFromRescue).toHaveBeenCalledTimes(1);
    });

    it('упавшая заявка не мешает остальным', async () => {
        let calls = 0;
        const { service, acceptFromRescue, lookup } = makeService({
            items: [
                approvedItem({ id: 1195 }),
                approvedItem({
                    id: 1193,
                    movedTime: '31.08.2026 12:00:00',
                    UF_RPA_7_RPA_CRM_TMC_DEAL: 198001,
                }),
            ],
        });
        lookup.mockImplementation(() => {
            calls += 1;
            return calls === 1
                ? Promise.reject(new Error('кэш недоступен'))
                : Promise.resolve(notKnown);
        });

        const run = await service.runForDomain(DOMAIN, options, NOW);

        expect(run).toMatchObject({ candidates: 2, dispatched: 1 });
        expect(run.skipped).toEqual({ 'item-failed': 1 });
        expect(run.warnings[0]).toMatch(
            /заявка РПА 1195 не обработана: кэш недоступен/,
        );
        expect(acceptFromRescue).toHaveBeenCalledTimes(1);
    });

    it('заявка без менеджера не проводится; предупреждение — раз в сутки на заявку', async () => {
        const cache = new Map<string, unknown>();
        const { service, acceptFromRescue, appCache } = makeService({
            items: [approvedItem({ UF_RPA_7_LAST_PRES_DONE_RESPONSIBLE: 0 })],
            cache,
        });

        const first = await service.runForDomain(DOMAIN, options, NOW);
        const second = await service.runForDomain(DOMAIN, options, NOW);

        expect(first.skipped).toEqual({ invalid: 1 });
        expect(second.skipped).toEqual({ invalid: 1 });
        expect(acceptFromRescue).not.toHaveBeenCalled();
        expect(appCache.set).toHaveBeenCalledTimes(1);
        expect(appCache.set).toHaveBeenCalledWith(
            expect.objectContaining({ key: 'invalid:1195' }),
        );
    });

    it('лимит за прогон: свежие утверждения первыми, остаток ждёт следующего тика', async () => {
        const { service, acceptFromRescue } = makeService({
            items: [
                approvedItem({ id: 1193, movedTime: '31.08.2026 12:00:00' }),
                approvedItem({ id: 1195 }),
            ],
        });

        const run = await service.runForDomain(
            DOMAIN,
            { ...options, maxPerRun: 1 },
            NOW,
        );

        expect(run).toMatchObject({ candidates: 2, dispatched: 1 });
        expect(run.warnings[0]).toMatch(/лимит 1/);
        expect(acceptFromRescue).toHaveBeenCalledTimes(1);
        // Первой ушла заявка, утверждённая позже (15:53), а не 12:00.
        expect(acceptFromRescue.mock.calls[0][0]).toMatchObject({
            tmcDealId: 198467,
        });
    });

    it('без РПА на портале или без стадии «утверждено» — предупреждение, чтений элементов нет', async () => {
        const noRpa = makeService({ rpaInstalled: false });
        const runNoRpa = await noRpa.service.runForDomain(DOMAIN, options, NOW);
        expect(runNoRpa.warnings[0]).toMatch(/не установлена/);
        expect(noRpa.listForType).not.toHaveBeenCalled();

        const noStage = makeService({ stages: [STAGES[0]] });
        const runNoStage = await noStage.service.runForDomain(
            DOMAIN,
            options,
            NOW,
        );
        expect(runNoStage.warnings[0]).toMatch(/rpa_pres_success/);
        expect(runNoStage.warnings[0]).toMatch(/Запуск/);
        expect(noStage.list).not.toHaveBeenCalled();
    });
});
