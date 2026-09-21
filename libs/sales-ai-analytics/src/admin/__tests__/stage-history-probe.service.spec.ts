import { Logger } from '@nestjs/common';
import type { PBXService } from '@lib/pbx/pbx.service';
import type { IBXStageHistoryItem } from '@lib/bitrix/domain/crm/stage-history/interface/bx-stage-history.interface';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { StageHistoryProbeService } from '../stage-history-probe.service';

const DOMAIN = 'april.bitrix24.ru';
/** Момент пробы: 21.09.2026 12:00 UTC. */
const NOW = new Date('2026-09-21T12:00:00.000Z');
const WINDOW_MONTHS = 12;
/** NOW минус 12 месяцев днём — начало окна, которое уходит в '>=CREATED_TIME'. */
const WINDOW_START_DAY = '2025-09-21';
/** entityTypeId сделки в crm.stagehistory.list. */
const DEAL_ENTITY_TYPE_ID = 2;

interface Harness {
    service: StageHistoryProbeService;
    init: jest.Mock;
    list: jest.Mock;
    getDealCategoryByCode: jest.Mock;
}

/**
 * PBXService с одним инстансом bitrix на init и категорией sales_base по
 * bitrixId; null — категория на портале не настроена (getDealCategoryByCode
 * отдаёт undefined).
 */
function makeHarness(categoryBitrixId: string | null = '4'): Harness {
    const list = jest.fn();
    const getDealCategoryByCode = jest.fn().mockReturnValue(
        categoryBitrixId === null
            ? undefined
            : {
                  code: 'sales_base',
                  bitrixId: categoryBitrixId,
                  stages: [],
              },
    );
    const init = jest.fn().mockResolvedValue({
        bitrix: { stageHistory: { list } },
        PortalModel: { getDealCategoryByCode },
    });
    const pbx = { init } as unknown as PBXService;

    return {
        service: new StageHistoryProbeService(pbx),
        init,
        list,
        getDealCategoryByCode,
    };
}

/** Страница ответа библиотеки: result.items и (если Bitrix посчитал) total. */
function page(
    items: Partial<IBXStageHistoryItem>[],
    total?: number,
): { result: { items: Partial<IBXStageHistoryItem>[] }; total?: number } {
    return total === undefined
        ? { result: { items } }
        : { result: { items }, total };
}

describe('StageHistoryProbeService', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        warn.mockRestore();
    });

    it('история есть: earliestAt, полных месяцев 27, переходов за окно из total, enough = true', async () => {
        const { service, init, list, getDealCategoryByCode } = makeHarness();
        list.mockResolvedValueOnce(
            page([{ ID: 1, CREATED_TIME: '2024-06-15T10:00:00+03:00' }]),
        ).mockResolvedValueOnce(page([{ ID: 900 }], 1234));

        const result = await service.probe(DOMAIN, WINDOW_MONTHS, NOW);

        expect(init).toHaveBeenCalledWith(DOMAIN);
        expect(getDealCategoryByCode).toHaveBeenCalledWith(
            PbxDealCategoryCodeEnum.sales_base,
        );
        expect(list).toHaveBeenCalledTimes(2);
        expect(list).toHaveBeenNthCalledWith(1, {
            entityTypeId: DEAL_ENTITY_TYPE_ID,
            select: ['ID', 'CREATED_TIME'],
            order: { ID: 'ASC' },
            start: -1,
            filter: { CATEGORY_ID: 4 },
        });
        expect(list).toHaveBeenNthCalledWith(2, {
            entityTypeId: DEAL_ENTITY_TYPE_ID,
            select: ['ID'],
            filter: { CATEGORY_ID: 4, '>=CREATED_TIME': WINDOW_START_DAY },
            start: 0,
        });
        // 2024-06-15 → 2026-09-21: 2·12 + (9 − 6) = 27, день 21 ≥ 15 — месяц полный.
        expect(result).toEqual({
            domain: DOMAIN,
            checkedAt: '2026-09-21T12:00:00.000Z',
            available: true,
            error: null,
            categoryBitrixId: 4,
            earliestAt: '2024-06-15T10:00:00+03:00',
            historyMonths: 27,
            transitionsInWindow: 1234,
            countIsLowerBound: false,
            windowMonths: WINDOW_MONTHS,
            enough: true,
            hint: 'история доступна, глубина 27 мес., переходов за окно 12 мес. — 1234',
        });
        expect(warn).not.toHaveBeenCalled();
    });

    it('неполный последний месяц не засчитывается: 2025-09-25 → 2026-09-21 это 11 мес., enough зависит от окна', async () => {
        const { service, list } = makeHarness();
        list.mockResolvedValue(
            page([{ ID: 7, CREATED_TIME: '2025-09-25T09:00:00+03:00' }], 40),
        );

        const twelve = await service.probe(DOMAIN, 12, NOW);
        expect(twelve.historyMonths).toBe(11);
        expect(twelve.enough).toBe(false);
        expect(twelve.hint).toBe(
            'история доступна, глубина 11 мес., переходов за окно 12 мес. — 40; глубина меньше окна 12 мес.',
        );

        const six = await service.probe(DOMAIN, 6, NOW);
        expect(six.historyMonths).toBe(11);
        expect(six.enough).toBe(true);
        expect(six.windowMonths).toBe(6);
    });

    it('пусто: earliestAt и historyMonths null, переходов 0, enough = false', async () => {
        const { service, list } = makeHarness();
        list.mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([], 0));

        const result = await service.probe(DOMAIN, WINDOW_MONTHS, NOW);

        expect(result).toMatchObject({
            available: true,
            error: null,
            categoryBitrixId: 4,
            earliestAt: null,
            historyMonths: null,
            transitionsInWindow: 0,
            countIsLowerBound: false,
            enough: false,
            hint: 'метод доступен, история стадий пуста',
        });
    });

    it('категория sales_base не настроена: фильтр без CATEGORY_ID, categoryBitrixId null и пометка в hint', async () => {
        const { service, list } = makeHarness(null);
        list.mockResolvedValueOnce(
            page([{ ID: 1, CREATED_TIME: '2024-06-15T10:00:00+03:00' }]),
        ).mockResolvedValueOnce(page([{ ID: 5 }], 10));

        const result = await service.probe(DOMAIN, WINDOW_MONTHS, NOW);

        expect(list).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ filter: {} }),
        );
        expect(list).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                filter: { '>=CREATED_TIME': WINDOW_START_DAY },
            }),
        );
        expect(result.categoryBitrixId).toBeNull();
        expect(result.available).toBe(true);
        expect(result.enough).toBe(true);
        expect(result.hint).toBe(
            'история доступна, глубина 27 мес., переходов за окно 12 мес. — 10; ' +
                'категория sales_base не настроена — проба по всем воронкам',
        );
    });

    it('категория с пустым bitrixId считается ненастроенной', async () => {
        const { service, list } = makeHarness('');
        list.mockResolvedValue(page([], 0));

        const result = await service.probe(DOMAIN, WINDOW_MONTHS, NOW);

        expect(list).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ filter: {} }),
        );
        expect(result.categoryBitrixId).toBeNull();
        expect(result.hint).toBe(
            'метод доступен, история стадий пуста; ' +
                'категория sales_base не настроена — проба по всем воронкам',
        );
    });

    it('ошибка Bitrix: available = false, текст в error, остальное null, не бросает, warn в лог', async () => {
        const { service, list } = makeHarness();
        list.mockRejectedValueOnce(new Error('Insufficient scope: crm'));

        const result = await service.probe(DOMAIN, WINDOW_MONTHS, NOW);

        expect(result).toEqual({
            domain: DOMAIN,
            checkedAt: '2026-09-21T12:00:00.000Z',
            available: false,
            error: 'Insufficient scope: crm',
            categoryBitrixId: null,
            earliestAt: null,
            historyMonths: null,
            transitionsInWindow: null,
            countIsLowerBound: false,
            windowMonths: WINDOW_MONTHS,
            enough: false,
            hint: 'метод недоступен: Insufficient scope: crm',
        });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining(DOMAIN));
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('Insufficient scope: crm'),
        );
    });

    it('ошибка инициализации портала (init) — та же деградация, строковая ошибка тоже читается', async () => {
        const { service, init, list } = makeHarness();
        init.mockRejectedValueOnce('portal not found');

        const result = await service.probe(DOMAIN, WINDOW_MONTHS, NOW);

        expect(list).not.toHaveBeenCalled();
        expect(result.available).toBe(false);
        expect(result.error).toBe('portal not found');
        expect(result.hint).toBe('метод недоступен: portal not found');
    });

    it('total не пришёл: переходов — размер страницы, countIsLowerBound = true и «не менее» в hint', async () => {
        const { service, list } = makeHarness();
        list.mockResolvedValueOnce(
            page([{ ID: 1, CREATED_TIME: '2024-06-15T10:00:00+03:00' }]),
        ).mockResolvedValueOnce(page([{ ID: 1 }, { ID: 2 }, { ID: 3 }]));

        const result = await service.probe(DOMAIN, WINDOW_MONTHS, NOW);

        expect(result.transitionsInWindow).toBe(3);
        expect(result.countIsLowerBound).toBe(true);
        expect(result.hint).toBe(
            'история доступна, глубина 27 мес., переходов за окно 12 мес. — не менее 3',
        );
    });

    it('начало окна: 31-е в коротком месяце переезжает в начало следующего (как в загрузчике)', async () => {
        const { service, list } = makeHarness();
        list.mockResolvedValue(page([], 0));

        await service.probe(DOMAIN, 1, new Date('2026-03-31T00:00:00.000Z'));

        // 31 февраля 2026 не бывает → 3 марта 2026.
        expect(list).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                filter: { CATEGORY_ID: 4, '>=CREATED_TIME': '2026-03-03' },
            }),
        );
    });

    it('now по умолчанию — текущий момент в checkedAt (ISO)', async () => {
        const { service, list } = makeHarness();
        list.mockResolvedValue(page([], 0));
        const before = Date.now();

        const result = await service.probe(DOMAIN, WINDOW_MONTHS);

        const checkedAt = Date.parse(result.checkedAt);
        expect(Number.isNaN(checkedAt)).toBe(false);
        expect(checkedAt).toBeGreaterThanOrEqual(before);
        expect(checkedAt).toBeLessThanOrEqual(Date.now());
    });
});
