import type { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import type { PBXService } from '@/modules/pbx';
import type { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import type { ManagersLoader } from '../../domain/loaders/managers.loader';
import { normalizeManagerIds } from '../../domain/loaders/managers.loader';

/**
 * Слепок портала для KPI-слоя: список sales_kpi с действиями
 * plan/done/act_send и всеми типами событий карты. ActionService из него
 * строит строки kpi-report: call_* (6 типов слиты), presentation_*,
 * presentation_uniq_*, presentation_contact_uniq_*, ev_offer_act_send,
 * ev_invoice_act_send, ev_success_done, ev_fail_done.
 */
export const kpiListFixture = {
    group: 'sales',
    type: 'kpi',
    bitrixId: '55',
    bitrixfields: [
        {
            code: 'sales_kpi_event_action',
            bitrixCamelId: 'PROPERTY_100',
            items: [
                { code: 'plan', name: 'План', bitrixId: 11 },
                { code: 'done', name: 'Факт', bitrixId: 12 },
                { code: 'act_send', name: 'Отправлено', bitrixId: 13 },
            ],
        },
        {
            code: 'sales_kpi_event_type',
            bitrixCamelId: 'PROPERTY_101',
            items: [
                { code: 'xo', name: 'ХО', bitrixId: 21 },
                { code: 'call', name: 'Звонок', bitrixId: 22 },
                { code: 'presentation', name: 'Презентация', bitrixId: 23 },
                { code: 'presentation_uniq', name: 'Уник.', bitrixId: 24 },
                {
                    code: 'presentation_contact_uniq',
                    name: 'По контакту',
                    bitrixId: 25,
                },
                { code: 'call_in_progress', name: 'В решении', bitrixId: 26 },
                { code: 'call_in_money', name: 'Оплата', bitrixId: 27 },
                { code: 'come_call', name: 'Входящий', bitrixId: 28 },
                { code: 'site', name: 'Сайт', bitrixId: 29 },
                { code: 'ev_success', name: 'Успех', bitrixId: 30 },
                { code: 'ev_fail', name: 'Отказ', bitrixId: 31 },
                { code: 'ev_offer', name: 'КП', bitrixId: 32 },
                { code: 'ev_invoice', name: 'Счёт', bitrixId: 33 },
            ],
        },
        { code: 'sales_kpi_responsible', bitrixCamelId: 'PROPERTY_102' },
        { code: 'sales_kpi_event_date', bitrixCamelId: 'PROPERTY_103' },
    ],
};

type ListFixture = typeof kpiListFixture;

/** Мок PortalModel: только методы, которые дёргают kpi-report и assembler. */
export function portalModelMock(
    list: ListFixture | undefined = kpiListFixture,
) {
    return {
        getHook: () => 'https://hook',
        getListByCode: (code: string) =>
            code === 'sales_kpi' ? list : undefined,
        getIdByCodeFieldList: (target: ListFixture, shortCode: string) =>
            target.bitrixfields.find(
                field =>
                    field.code ===
                    `${target.group}_${target.type}_${shortCode}`,
            ),
    };
}

/** Счётчики kpi-report на менеджера 1 (для менеджера N — × N). */
export const REPORT_TOTALS: Record<string, number> = {
    call_plan: 12,
    call_done: 10,
    presentation_plan: 8,
    presentation_done: 7,
    presentation_uniq_plan: 6,
    presentation_uniq_done: 5,
    presentation_contact_uniq_plan: 1,
    presentation_contact_uniq_done: 1,
    ev_offer_act_send: 3,
    ev_invoice_act_send: 2,
    ev_success_done: 2,
    ev_fail_done: 1,
};

/** Per-type факты `done` на менеджера 1; слитые в call_done дают ровно 10. */
export const PER_TYPE_TOTALS: Record<string, number> = {
    xo: 3,
    call: 4,
    call_in_progress: 2,
    call_in_money: 1,
    come_call: 1,
    site: 5,
};

const REPORT_KEY = /^user_(\d+)_action_(.+)$/;
const PER_TYPE_KEY = /^user_(\d+)_type_(.+)_done$/;

/** Значение result_total для команды по её ключу (детерминировано). */
export function totalFor(cmdKey: string): number {
    const report = REPORT_KEY.exec(cmdKey);
    if (report) return (REPORT_TOTALS[report[2]] ?? 0) * Number(report[1]);
    const perType = PER_TYPE_KEY.exec(cmdKey);
    if (perType) return (PER_TYPE_TOTALS[perType[2]] ?? 0) * Number(perType[1]);
    return 0;
}

export interface ApiMock {
    addCmdBatch: jest.Mock<void, [string, string, Record<string, unknown>]>;
    callBatchWithConcurrency: jest.Mock<
        Promise<IBitrixBatchResponseResult[]>,
        [number, { strict?: boolean } | undefined]
    >;
}

/**
 * Мок BitrixBaseApi: копит cmd-ключи до callBatchWithConcurrency и отдаёт
 * один чанк с result/result_total по накопленным ключам (как живой батч —
 * буфер чистится). dropKeys имитирует дроп команд rate-limiter'ом.
 */
export function apiMock(dropKeys: readonly string[] = []): ApiMock {
    let pending: string[] = [];
    const addCmdBatch = jest.fn<
        void,
        [string, string, Record<string, unknown>]
    >(cmdKey => {
        pending.push(cmdKey);
    });
    const callBatchWithConcurrency = jest.fn<
        Promise<IBitrixBatchResponseResult[]>,
        [number, { strict?: boolean } | undefined]
    >(() => {
        const keys = pending.filter(key => !dropKeys.includes(key));
        pending = [];
        const chunk = {
            result: Object.fromEntries(keys.map(key => [key, []])),
            result_total: Object.fromEntries(
                keys.map(key => [key, totalFor(key)]),
            ),
            result_error: [],
            result_next: [],
        } as unknown as IBitrixBatchResponseResult;
        return Promise.resolve([chunk]);
    });
    return { addCmdBatch, callBatchWithConcurrency };
}

export function pbxMock(api: ApiMock, list?: ListFixture) {
    const init = jest.fn(() =>
        Promise.resolve({
            portal: { id: 1 },
            bitrix: { api },
            PortalModel: portalModelMock(list),
        }),
    );
    return { init, service: { init } as unknown as PBXService };
}

export interface CacheMock {
    getJson: jest.Mock<Promise<unknown>, [string]>;
    setJson: jest.Mock<Promise<void>, [string, unknown, number]>;
    remember: jest.Mock<
        Promise<{ value: unknown; fromCache: boolean }>,
        [string, number, () => Promise<unknown>]
    >;
    service: AiAnalyticsCacheService;
}

/** Мок кэша модуля: getJson по словарю ключ → значение, setJson — запись в него. */
export function cacheMock(preset: Record<string, unknown> = {}): CacheMock {
    const store = new Map<string, unknown>(Object.entries(preset));
    const getJson = jest.fn<Promise<unknown>, [string]>(key =>
        Promise.resolve(store.get(key) ?? null),
    );
    const setJson = jest.fn<Promise<void>, [string, unknown, number]>(
        (key, value) => {
            store.set(key, value);
            return Promise.resolve();
        },
    );
    const remember = jest.fn<
        Promise<{ value: unknown; fromCache: boolean }>,
        [string, number, () => Promise<unknown>]
    >(async (key, ttl, compute) => {
        const cached = store.get(key);
        if (cached !== undefined) return { value: cached, fromCache: true };
        const value = await compute();
        store.set(key, value);
        return { value, fromCache: false };
    });
    return {
        getJson,
        setJson,
        remember,
        service: {
            getJson,
            setJson,
            remember,
        } as unknown as AiAnalyticsCacheService,
    };
}

/** Мок ростера: явные id нормализуются, без них — roster. */
export function managersMock(roster: number[] = [7, 8]): {
    resolve: jest.Mock<Promise<number[]>, [string, (string | number)[]?]>;
    loader: ManagersLoader;
} {
    const resolve = jest.fn(
        (_domain: string, ids?: (string | number)[]): Promise<number[]> => {
            const explicit = normalizeManagerIds(ids ?? []);
            return Promise.resolve(explicit.length ? explicit : roster);
        },
    );
    return { resolve, loader: { resolve } as unknown as ManagersLoader };
}
