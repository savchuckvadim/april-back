import {
    findSalesBaseStage,
    isXoTakeoverWorthNotice,
    XO_TAKEOVER_NOTICE_MIN_STAGE,
} from '../lib/xo-takeover-notice';

const STAGES = [
    { code: 'sales_new', bitrixId: 'NEW', name: 'Новая' },
    { code: 'sales_cold', bitrixId: 'COLD', name: 'Холодные' },
    { code: 'sales_warm', bitrixId: 'WARM', name: 'Переговоры' },
    { code: 'sales_pres', bitrixId: 'PRESENTATION', name: 'Презентация' },
];

describe('isXoTakeoverWorthNotice', () => {
    /*
     * Решение владельца 27.10.2026: перехват на «Новой»/«Холодных» —
     * обычный ход, идёт потоком, прежнему писать нечего.
     */
    it('нет сделки — молчим', () => {
        expect(
            isXoTakeoverWorthNotice({
                dealId: null,
                stageCode: 'sales_warm',
                clientTitle: null,
            }),
        ).toBe(false);
    });

    it.each(['sales_new', 'sales_cold'] as const)(
        'стадия %s ниже порога — молчим',
        stageCode => {
            expect(
                isXoTakeoverWorthNotice({
                    dealId: 31545,
                    stageCode,
                    clientTitle: null,
                }),
            ).toBe(false);
        },
    );

    it.each(['sales_warm', 'sales_pres', 'sales_money_await'] as const)(
        'стадия %s — сообщаем о потере работы',
        stageCode => {
            expect(
                isXoTakeoverWorthNotice({
                    dealId: 31545,
                    stageCode,
                    clientTitle: null,
                }),
            ).toBe(true);
        },
    );

    // Неизвестная стадия: лишнее сообщение безопаснее молчания.
    it('стадию не определили — сообщаем', () => {
        expect(
            isXoTakeoverWorthNotice({
                dealId: 31545,
                stageCode: null,
                clientTitle: null,
            }),
        ).toBe(true);
    });

    it('порог — «Переговоры»', () => {
        expect(XO_TAKEOVER_NOTICE_MIN_STAGE).toBe('sales_warm');
    });
});

describe('findSalesBaseStage', () => {
    it('STAGE_ID воронки → код и название', () => {
        expect(findSalesBaseStage(STAGES, 'C31:WARM')).toEqual({
            code: 'sales_warm',
            name: 'Переговоры',
        });
    });

    it('bitrixId без префикса воронки тоже понимаем', () => {
        expect(findSalesBaseStage(STAGES, 'PRESENTATION')?.code).toBe(
            'sales_pres',
        );
    });

    it('пустой STAGE_ID и несопоставленная стадия — null', () => {
        expect(findSalesBaseStage(STAGES, null)).toBeNull();
        expect(findSalesBaseStage(STAGES, 'C31:UNKNOWN')).toBeNull();
    });

    // Стадия портала, которой нет в лестнице PBX — не наша, порядок неизвестен.
    it('код вне лестницы PBX — null', () => {
        expect(
            findSalesBaseStage(
                [{ code: 'custom_stage', bitrixId: 'X', name: 'Своя' }],
                'C31:X',
            ),
        ).toBeNull();
    });
});
