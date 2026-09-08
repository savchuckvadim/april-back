/**
 * Загрузчик истории стадий (план Фазы 2, поток 13): курсорная пагинация
 * окнами на ОДНОМ инстансе api с callBatchWithConcurrency(1, strict),
 * отсутствие bitrix-состояния в @Injectable, кэш повторного прогона,
 * штатная деградация без прав и маппинг стадий только по лестнице
 * PBX_DEAL_SALES_BASE_STAGES.
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import type { PBXService } from '@/modules/pbx';
import type { IBXStageHistoryListRequest } from '@lib/bitrix/domain/crm/stage-history';
import { PBX_DEAL_SALES_BASE_STAGES } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import type { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import {
    AI_STAGE_HISTORY_ENTITY_TYPE_ID,
    AI_STAGE_HISTORY_LIMITS,
    AI_STAGE_HISTORY_PAGE_SIZE,
    AI_STAGE_HISTORY_SKIP_REASONS,
    buildStageHistoryKey,
    stageHistoryFromDate,
    stageHistoryShiftMonths,
} from '../constants/ai-stage-history.const';
import {
    monthWindows,
    StageHistoryLoader,
    type StageHistoryResult,
} from '../domain/loaders/stage-history.loader';
import {
    buildSalesBaseStageDict,
    toStageTransitions,
} from '../domain/loaders/stage-history.mapper';
import {
    FIXTURE_CATEGORY_ID,
    FIXTURE_SALES_BASE_CATEGORY,
    STAGE_HISTORY_ITEMS,
    stageHistoryChunk,
    stageHistoryItem,
    stageHistoryPageOf,
    stageHistoryPortal,
} from './fixtures/stage-history.fixture';

const DOMAIN = 'a.bitrix24.ru';
const FROM = '2025-09-08';
const TO = '2026-09-08';
const LADDER_CODES = PBX_DEAL_SALES_BASE_STAGES.map(stage => stage.code);

type BatchChunk = { result: Record<string, { items: unknown[] }> };

/** Инстанс Битрикса: очередь команд и её отправка — на одном объекте. */
function fakeBitrix(chunks: readonly BatchChunk[]) {
    const list = jest.fn();
    const callBatchWithConcurrency = jest.fn();
    for (const chunk of chunks) {
        callBatchWithConcurrency.mockResolvedValueOnce([chunk]);
    }
    callBatchWithConcurrency.mockResolvedValue([{ result: {} }]);

    return {
        batch: { stageHistory: { list } },
        api: { callBatchWithConcurrency },
        list,
        callBatchWithConcurrency,
    };
}

function fakePbx(bitrix: ReturnType<typeof fakeBitrix>) {
    const init = jest.fn().mockResolvedValue({
        bitrix,
        PortalModel: stageHistoryPortal(),
    });

    return { init } as unknown as PBXService & { init: jest.Mock };
}

function fakeCache() {
    const store = new Map<string, unknown>();

    return {
        getJson: jest.fn((key: string) => store.get(key) ?? null),
        setJson: jest.fn((key: string, value: unknown) => {
            store.set(key, value);
            return Promise.resolve();
        }),
        store,
    } as unknown as AiAnalyticsCacheService & {
        getJson: jest.Mock;
        setJson: jest.Mock;
        store: Map<string, unknown>;
    };
}

/** Запрос команды по её ключу из вызовов batch.stageHistory.list. */
function requestOf(
    list: jest.Mock,
    callIndex: number,
): IBXStageHistoryListRequest {
    const call = list.mock.calls[callIndex] as unknown[];

    return call[1] as IBXStageHistoryListRequest;
}

beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

describe('StageHistoryLoader: выгрузка окнами и курсор', () => {
    it('листает курсором >ID и шлёт батч с последовательностью 1 на одном инстансе', async () => {
        const bitrix = fakeBitrix([
            stageHistoryChunk({
                history_0: stageHistoryPageOf(AI_STAGE_HISTORY_PAGE_SIZE, 1),
            }),
            stageHistoryChunk({ history_0: stageHistoryPageOf(3, 51) }),
        ]);
        const pbx = fakePbx(bitrix);
        const loader = new StageHistoryLoader(pbx, fakeCache());

        const result = await loader.load(DOMAIN, {
            fromDate: FROM,
            toDate: TO,
        });

        expect(pbx.init).toHaveBeenCalledTimes(1);
        expect(pbx.init).toHaveBeenCalledWith(DOMAIN);
        expect(bitrix.callBatchWithConcurrency).toHaveBeenCalledWith(1, {
            strict: true,
        });
        expect(bitrix.callBatchWithConcurrency).toHaveBeenCalledTimes(2);
        expect(result.rows).toBe(AI_STAGE_HISTORY_PAGE_SIZE + 3);
        expect(result.lastId).toBe(53);
        expect(result.ok).toBe(true);
        expect(result.bitrixCalls).toBe(2);
    });

    it('первая страница окна идёт без курсора, вторая — с >ID последней записи', async () => {
        const bitrix = fakeBitrix([
            stageHistoryChunk({
                history_0: stageHistoryPageOf(AI_STAGE_HISTORY_PAGE_SIZE, 1),
            }),
            stageHistoryChunk({ history_0: stageHistoryPageOf(2, 51) }),
        ]);
        const loader = new StageHistoryLoader(fakePbx(bitrix), fakeCache());

        await loader.load(DOMAIN, { fromDate: FROM, toDate: TO });

        const first = requestOf(bitrix.list, 0);
        expect(first).toMatchObject({
            entityTypeId: AI_STAGE_HISTORY_ENTITY_TYPE_ID,
            order: { ID: 'ASC' },
            start: -1,
        });
        expect(first.filter).toEqual({
            CATEGORY_ID: FIXTURE_CATEGORY_ID,
            '>=CREATED_TIME': FROM,
            '<CREATED_TIME': stageHistoryShiftMonths(FROM, 1),
        });
        const cursorCall = (bitrix.list.mock.calls as unknown[][]).findIndex(
            (call, index) => index > 0 && call[0] === 'history_0',
        );
        expect(requestOf(bitrix.list, cursorCall).filter).toMatchObject({
            '>ID': 50,
        });
    });

    it('окна — по месяцам, все команды одного раунда уходят одним батчем', async () => {
        const bitrix = fakeBitrix([
            stageHistoryChunk({ history_0: STAGE_HISTORY_ITEMS }),
        ]);
        const loader = new StageHistoryLoader(fakePbx(bitrix), fakeCache());

        await loader.load(DOMAIN, { fromDate: FROM, toDate: TO });

        expect(monthWindows(FROM, TO)).toHaveLength(12);
        expect(bitrix.list).toHaveBeenCalledTimes(12);
        expect(bitrix.callBatchWithConcurrency).toHaveBeenCalledTimes(1);
    });

    it('предел строк обрывает выгрузку и помечает окно урезанным', async () => {
        const bitrix = fakeBitrix([
            stageHistoryChunk({
                history_0: stageHistoryPageOf(AI_STAGE_HISTORY_PAGE_SIZE, 1),
            }),
        ]);
        const loader = new StageHistoryLoader(fakePbx(bitrix), fakeCache());

        const result = await loader.load(DOMAIN, {
            fromDate: FROM,
            toDate: TO,
            limit: 10,
        });

        expect(result.truncated).toBe(true);
        expect(bitrix.callBatchWithConcurrency).toHaveBeenCalledTimes(1);
    });
});

describe('StageHistoryLoader: инстанс, кэш и деградация', () => {
    it('в @Injectable нет bitrix-состояния: инстанс живёт только в методе', async () => {
        const bitrix = fakeBitrix([
            stageHistoryChunk({ history_0: STAGE_HISTORY_ITEMS }),
        ]);
        const loader = new StageHistoryLoader(fakePbx(bitrix), fakeCache());
        const fields = () =>
            Object.values(loader as unknown as Record<string, unknown>);

        expect(fields()).not.toContain(bitrix);
        await loader.load(DOMAIN, { fromDate: FROM, toDate: TO });

        expect(fields()).not.toContain(bitrix);
        expect(
            Object.keys(loader as unknown as Record<string, unknown>).some(
                name => name.toLowerCase().includes('bitrix'),
            ),
        ).toBe(false);
    });

    it('повтор за тот же день читает кэш и не удваивает вызовы Битрикса', async () => {
        const bitrix = fakeBitrix([
            stageHistoryChunk({ history_0: STAGE_HISTORY_ITEMS }),
        ]);
        const cache = fakeCache();
        const loader = new StageHistoryLoader(fakePbx(bitrix), cache);

        const first = await loader.load(DOMAIN, {
            fromDate: FROM,
            toDate: TO,
        });
        const second = await loader.load(DOMAIN, {
            fromDate: FROM,
            toDate: TO,
        });

        expect(first.fromCache).toBe(false);
        expect(second.fromCache).toBe(true);
        expect(second.transitions).toEqual(first.transitions);
        expect(bitrix.callBatchWithConcurrency).toHaveBeenCalledTimes(1);
        expect(cache.setJson).toHaveBeenCalledTimes(1);
        expect(
            cache.store.has(
                buildStageHistoryKey(
                    DOMAIN,
                    AI_STAGE_HISTORY_ENTITY_TYPE_ID,
                    FROM,
                    TO,
                    AI_STAGE_HISTORY_LIMITS.maxRows,
                ),
            ),
        ).toBe(true);
    });

    it('forceRefresh перечитывает портал, минуя кэш', async () => {
        const bitrix = fakeBitrix([
            stageHistoryChunk({ history_0: STAGE_HISTORY_ITEMS }),
            stageHistoryChunk({ history_0: STAGE_HISTORY_ITEMS }),
        ]);
        const loader = new StageHistoryLoader(fakePbx(bitrix), fakeCache());

        await loader.load(DOMAIN, { fromDate: FROM, toDate: TO });
        const second = await loader.load(DOMAIN, {
            fromDate: FROM,
            toDate: TO,
            forceRefresh: true,
        });

        expect(second.fromCache).toBe(false);
        expect(bitrix.callBatchWithConcurrency).toHaveBeenCalledTimes(2);
    });

    it('без прав на метод — пропуск с причиной, а не исключение', async () => {
        const bitrix = fakeBitrix([]);
        bitrix.callBatchWithConcurrency.mockReset();
        bitrix.callBatchWithConcurrency.mockRejectedValue(
            new Error('ACCESS_DENIED: crm.stagehistory.list'),
        );
        const loader = new StageHistoryLoader(fakePbx(bitrix), fakeCache());

        const result: StageHistoryResult = await loader.load(DOMAIN, {
            fromDate: FROM,
            toDate: TO,
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toBe(AI_STAGE_HISTORY_SKIP_REASONS.unavailable);
        expect(result.error).toContain('ACCESS_DENIED');
        expect(result.transitions).toEqual([]);
    });

    it('воронка sales_base не настроена — пропуск с причиной', async () => {
        const bitrix = fakeBitrix([]);
        const pbx = {
            init: jest.fn().mockResolvedValue({
                bitrix,
                PortalModel: stageHistoryPortal(null),
            }),
        } as unknown as PBXService;
        const loader = new StageHistoryLoader(pbx, fakeCache());

        const result = await loader.load(DOMAIN, {
            fromDate: FROM,
            toDate: TO,
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toBe(AI_STAGE_HISTORY_SKIP_REASONS.noCategory);
        expect(bitrix.list).not.toHaveBeenCalled();
    });

    it('окно по умолчанию — двенадцать месяцев назад от дня прогона', () => {
        expect(stageHistoryFromDate('2026-09-08')).toBe('2025-09-08');
        expect(monthWindows('2026-09-08', '2026-09-08')).toEqual([
            { from: '2026-09-08', to: '2026-09-08' },
        ]);
    });
});

describe('toStageTransitions: коды стадий только из лестницы portal-lib', () => {
    const portal = stageHistoryPortal();

    it('переводит записи истории в переходы с кодом и порядком лестницы', () => {
        const transitions = toStageTransitions(STAGE_HISTORY_ITEMS, portal);

        expect(transitions).toHaveLength(STAGE_HISTORY_ITEMS.length);
        for (const transition of transitions) {
            expect(LADDER_CODES).toContain(transition.stageCode);
            expect(transition.order).toBeGreaterThan(0);
        }
        expect(transitions[0]).toMatchObject({
            entityId: '104',
            order: 1,
            semantic: 'P',
            at: '2026-03-02T10:00:00+03:00',
        });
    });

    it('стадии вне лестницы и записи без владельца отбрасываются', () => {
        const items = [
            ...STAGE_HISTORY_ITEMS,
            stageHistoryItem(
                777,
                PBX_DEAL_SALES_BASE_STAGES[0].code,
                '2026-06-01T10:00:00+03:00',
                { STAGE_ID: 'C4:UNKNOWN_STAGE' },
            ),
            stageHistoryItem(
                0,
                PBX_DEAL_SALES_BASE_STAGES[0].code,
                '2026-06-01T10:00:00+03:00',
            ),
        ];

        const transitions = toStageTransitions(items, portal);

        expect(transitions).toHaveLength(STAGE_HISTORY_ITEMS.length);
        expect(
            transitions.some(transition => transition.entityId === '777'),
        ).toBe(false);
    });

    it('STAGE_ID без префикса категории тоже узнаётся', () => {
        const items = [
            stageHistoryItem(
                301,
                PBX_DEAL_SALES_BASE_STAGES[0].code,
                '2026-06-01T10:00:00+03:00',
                { STAGE_ID: 'NEW' },
            ),
        ];

        expect(toStageTransitions(items, portal)[0]).toMatchObject({
            entityId: '301',
            stageCode: PBX_DEAL_SALES_BASE_STAGES[0].code,
        });
    });

    it('словарь стадий несёт оба ключа: полный STAGE_ID и bitrixId', () => {
        const dict = buildSalesBaseStageDict(FIXTURE_SALES_BASE_CATEGORY);

        expect(dict.get('NEW')).toEqual({
            code: PBX_DEAL_SALES_BASE_STAGES[0].code,
            order: 1,
        });
        expect(dict.get(`C${FIXTURE_CATEGORY_ID}:NEW`)).toEqual(
            dict.get('NEW'),
        );
        expect(buildSalesBaseStageDict(undefined).size).toBe(0);
    });
});
