import { KpiListFlowService } from '../services/kpi-list-flow.service';
import { KpiEventPayload } from '../type/kpi-event-payload.type';

/**
 * Дедупликация KPI/History записей по детерминированному коду элемента.
 *
 * Закрепляем обещания владельца:
 *  - повторная отправка финала НЕ плодит записи — существующий элемент
 *    обновляется (crm-привязки, даты, причина);
 *  - уникальное событие создаётся один раз и повтором не переписывается;
 *  - уникальные пишутся ТОЛЬКО в sales_kpi (history — полная лента);
 *  - обычные report/plan-записи остаются множественными;
 *  - до install item'ов (ev_success и т.п.) — мягкая деградация с warning,
 *    а не мусорная запись без типа.
 */
const makeList = (type: 'kpi' | 'history', withEvItems = true) => ({
    type,
    group: 'sales',
    bitrixId: type === 'kpi' ? 55 : 56,
    bitrixfields: [
        { code: `sales_${type}_event_title`, bitrixCamelId: 'P_TITLE' },
        {
            code: `sales_${type}_event_type`,
            bitrixCamelId: 'P_TYPE',
            items: [
                { code: 'call', bitrixId: 1 },
                ...(withEvItems
                    ? [
                          { code: 'ev_success', bitrixId: 2 },
                          { code: 'ev_fail', bitrixId: 3 },
                          { code: 'presentation_uniq', bitrixId: 4 },
                      ]
                    : []),
            ],
        },
        {
            code: `sales_${type}_event_action`,
            bitrixCamelId: 'P_ACTION',
            items: [
                { code: 'done', bitrixId: 30 },
                { code: 'act_noresult_fail', bitrixId: 60 },
            ],
        },
        { code: `sales_${type}_crm`, bitrixCamelId: 'P_CRM' },
    ],
});

const makeDeps = (input: {
    /** CODE → ID существующих элементов (ответ lists.element.get). */
    existing?: Record<string, number>;
    withEvItems?: boolean;
    getFails?: boolean;
}) => {
    const adds: { cmd: string; dto: Record<string, unknown> }[] = [];
    const updates: { cmd: string; dto: Record<string, unknown> }[] = [];
    const get = jest.fn((dto: { filter?: Record<string, unknown> }) => {
        if (input.getFails) return Promise.reject(new Error('network'));
        const wanted = dto.filter?.['=CODE'];
        const codes = Array.isArray(wanted) ? wanted : [wanted];
        const result = Object.entries(input.existing ?? {})
            .filter(([code]) => codes.includes(code))
            .map(([code, id]) => ({ ID: id, CODE: code }));
        return Promise.resolve({ result });
    });
    const bitrix = {
        listItem: { get },
        batch: {
            listItem: {
                add: (cmd: string, dto: Record<string, unknown>) =>
                    adds.push({ cmd, dto }),
                update: (cmd: string, dto: Record<string, unknown>) =>
                    updates.push({ cmd, dto }),
            },
        },
    };
    const portal = {
        getListByCode: (code: string) => {
            if (code === 'sales_kpi')
                return makeList('kpi', input.withEvItems ?? true);
            if (code === 'sales_history')
                return makeList('history', input.withEvItems ?? true);
            return undefined;
        },
    };
    const buffer = {
        queue: jest.fn((enqueue: () => void) => enqueue()),
        endGroup: jest.fn(),
        flush: jest.fn(),
    };
    const service = new KpiListFlowService(bitrix as never, portal as never);
    return { service, adds, updates, get, buffer };
};

const finalPayload = (over: Partial<KpiEventPayload> = {}): KpiEventPayload =>
    ({
        name: 'Отказ: Звонок по решению — Нет денег',
        values: { crm: { n0: 'D_1024' } },
        items: { event_type: 'call', event_action: 'done' },
        dedup: { key: 'final_deal_1024', scope: 'both', mode: 'upsert' },
        ...over,
    }) as KpiEventPayload;

describe('KpiListFlowService — дедупликация финалов и уникальных', () => {
    it('финал впервые: add в ОБА списка, код БЕЗ префикса типа (легаси-формат)', async () => {
        const { service, adds, updates, buffer } = makeDeps({});

        await service.flowDedup(finalPayload(), buffer as never);

        expect(updates).toHaveLength(0);
        expect(adds).toHaveLength(2);
        // Один и тот же код в обоих списках: kpi и history — разные
        // инфоблоки, а команды батча различаются префиксом list.type.
        expect(adds.map(a => a.dto.ELEMENT_CODE)).toEqual([
            'final_deal_1024',
            'final_deal_1024',
        ]);
        expect(adds.map(a => a.cmd)).toEqual([
            'add_list_item_kpi_final_deal_1024',
            'add_list_item_history_final_deal_1024',
        ]);
        expect(adds.map(a => a.dto.IBLOCK_ID)).toEqual(['55', '56']);
    });

    it('повторная отправка финала: update существующих, НОВЫХ записей нет', async () => {
        const { service, adds, updates, buffer } = makeDeps({
            existing: {
                final_deal_1024: 501,
            },
        });

        await service.flowDedup(
            finalPayload({
                // Вторая отправка — уже с компанией: crm обязана обновиться.
                values: { crm: { n0: 'CO_7', n1: 'D_1024' } },
            } as never),
            buffer as never,
        );

        expect(adds).toHaveLength(0);
        // Один код найден в обоих инфоблоках — оба элемента обновляются.
        expect(updates).toHaveLength(2);
        expect(updates.map(u => u.dto.ELEMENT_ID)).toEqual([501, 501]);
        const fields = updates[0].dto.FIELDS as Record<string, unknown>;
        expect(fields.P_CRM).toEqual({ n0: 'CO_7', n1: 'D_1024' });
    });

    it('уникальная презентация (insert-once) впервые: add ТОЛЬКО в sales_kpi, легаси-код', async () => {
        const { service, adds, buffer } = makeDeps({});

        await service.flowDedup(
            finalPayload({
                items: {
                    event_type: 'presentation_uniq',
                    event_action: 'done',
                },
                dedup: {
                    key: '7_500_done',
                    scope: 'kpi',
                    mode: 'insert-once',
                    requireEventTypeItem: true,
                },
            } as never),
            buffer as never,
        );

        expect(adds).toHaveLength(1);
        expect(adds[0].dto.ELEMENT_CODE).toBe('7_500_done');
        expect(adds[0].dto.IBLOCK_ID).toBe('55');
        // history не тронут — полная лента там строится обычными записями.
    });

    it('уникальное существует: повтор НИЧЕГО не пишет (дата не переписывается)', async () => {
        const { service, adds, updates, buffer } = makeDeps({
            existing: { '7_500_done': 700 },
        });

        await service.flowDedup(
            finalPayload({
                items: {
                    event_type: 'presentation_uniq',
                    event_action: 'done',
                },
                dedup: {
                    key: '7_500_done',
                    scope: 'kpi',
                    mode: 'insert-once',
                    requireEventTypeItem: true,
                },
            } as never),
            buffer as never,
        );

        expect(adds).toHaveLength(0);
        expect(updates).toHaveLength(0);
    });

    /*
     * Мягкая деградация: item ev_success ещё не установлен на портале —
     * запись без типа была бы мусором, который отчёт не классифицирует.
     * Пропускаем С warning, остальные записи не страдают.
     */
    it('item не установлен: уникальная запись пропускается с warning', async () => {
        const { service, adds, buffer } = makeDeps({ withEvItems: false });
        const warn = jest
            .spyOn(service['logger'], 'warn')
            .mockImplementation(() => undefined);

        await service.flowDedup(
            finalPayload({
                items: { event_type: 'ev_success', event_action: 'done' },
                dedup: {
                    key: 'uniq_success_deal_1024',
                    scope: 'kpi',
                    mode: 'insert-once',
                    requireEventTypeItem: true,
                },
            } as never),
            buffer as never,
        );

        expect(adds).toHaveLength(0);
        expect(warn).toHaveBeenCalled();
        expect(String(warn.mock.calls[0][0])).toContain('install');
    });

    it('проверка существования упала: запись НЕ теряется — идём в add', async () => {
        const { service, adds, buffer } = makeDeps({ getFails: true });
        jest.spyOn(service['logger'], 'warn').mockImplementation(
            () => undefined,
        );

        await service.flowDedup(finalPayload(), buffer as never);

        expect(adds).toHaveLength(2);
    });

    /*
     * historyItems-override: тип, который в сводке KPI считается общим
     * кодом (refine → call), в ленту истории уходит СВОИМ item'ом.
     * Мерж применяется ТОЛЬКО к history-списку.
     */
    it('historyItems переопределяет item только для sales_history', () => {
        const { service, adds, buffer } = makeDeps({});
        const payload: KpiEventPayload = {
            name: 'Доработка: ООО Ромашка',
            values: {},
            items: { event_type: 'call', event_action: 'done' },
            historyItems: { event_type: 'presentation_uniq' },
        } as never;
        // presentation_uniq выбран потому, что он есть в items мока для
        // ОБОИХ списков — видно именно решение сервиса, а не деградацию.

        service.flow(payload, 7, buffer as never);

        expect(adds).toHaveLength(2);
        const kpiFields = adds[0].dto.FIELDS as Record<string, unknown>;
        const historyFields = adds[1].dto.FIELDS as Record<string, unknown>;
        expect(kpiFields.P_TYPE).toBe(1); // call — сводка без изменений
        expect(historyFields.P_TYPE).toBe(4); // override: presentation_uniq
    });

    it('обычные записи (flow) остаются множественными: коды разные, всегда add', () => {
        const { service, adds, buffer } = makeDeps({});
        const plain: KpiEventPayload = {
            name: 'Звонок',
            values: {},
            items: { event_type: 'call', event_action: 'done' },
        } as never;

        service.flow(plain, 7, buffer as never);
        service.flow(plain, 7, buffer as never);

        expect(adds).toHaveLength(4); // 2 отправки × 2 списка
        const codes = adds.map(a => String(a.dto.ELEMENT_CODE));
        expect(new Set(codes).size).toBe(4); // все коды уникальны (суффикс)
        expect(codes.every(code => /^(kpi|history)_7_/.test(code))).toBe(true);
    });
});
