import {
    dealSignalsOf,
    refusalFieldsOf,
} from '../owner-report-refusal-signals.util';

const TZ = 'Europe/Moscow';

const CODE_OF_STAGE = new Map([
    ['C5:LOSE', 'sales_fail'],
    ['C5:WON', 'sales_success'],
    ['C5:NEW', 'sales_new'],
    ['C5:NOT_CALL', 'sales_not_call'],
]);

const FIELDS = {
    select: ['UF_P', 'UF_R', 'UF_N'],
    prospectsKey: 'UF_P',
    prospectsRefusalIds: new Set(['12', '13']),
    failReasonKey: 'UF_R',
    noresultKey: 'UF_N',
    noresultRefusalId: '8',
};

describe('dealSignalsOf — сигналы отказа и успеха из строки сделки', () => {
    it('финал отказа — отказ по стадии; успех — успех, поля не читаются', () => {
        expect(
            dealSignalsOf(
                { STAGE_ID: 'C5:LOSE', CLOSEDATE: '2026-08-01T12:00:00+03:00' },
                CODE_OF_STAGE,
                null,
                TZ,
            ),
        ).toEqual([{ kind: 'refusal', date: '2026-08-01', source: 'stage' }]);
        expect(
            dealSignalsOf(
                {
                    STAGE_ID: 'C5:WON',
                    CLOSEDATE: '2026-07-01T12:00:00+03:00',
                    UF_P: 12,
                },
                CODE_OF_STAGE,
                FIELDS,
                TZ,
            ),
        ).toEqual([{ kind: 'won', date: '2026-07-01', source: 'stage' }]);
    });

    it('поля сделки: «Нет перспектив», причина отказа, «Не интересует» — отказ датой изменения у открытой', () => {
        const open = {
            STAGE_ID: 'C5:NEW',
            CLOSEDATE: '',
            DATE_MODIFY: '2026-06-15T12:00:00+03:00',
        };
        const fieldsRefusal = {
            kind: 'refusal',
            date: '2026-06-15',
            source: 'fields',
        };
        expect(
            dealSignalsOf({ ...open, UF_P: [13] }, CODE_OF_STAGE, FIELDS, TZ),
        ).toEqual([fieldsRefusal]);
        expect(
            dealSignalsOf({ ...open, UF_R: '41' }, CODE_OF_STAGE, FIELDS, TZ),
        ).toEqual([fieldsRefusal]);
        expect(
            dealSignalsOf({ ...open, UF_N: 8 }, CODE_OF_STAGE, FIELDS, TZ),
        ).toEqual([fieldsRefusal]);
        // «Перспективная», другая причина нерезультативности, пустые поля — не отказ.
        expect(
            dealSignalsOf(
                { ...open, UF_P: 11, UF_N: 3 },
                CODE_OF_STAGE,
                FIELDS,
                TZ,
            ),
        ).toEqual([]);
        // «Не беспокоить» — не отказ по стадии; без полей — пусто.
        expect(
            dealSignalsOf(
                {
                    STAGE_ID: 'C5:NOT_CALL',
                    CLOSEDATE: '2026-10-10T12:00:00+03:00',
                },
                CODE_OF_STAGE,
                null,
                TZ,
            ),
        ).toEqual([]);
    });

    it('закрытый отказ с полем причины — два сигнала одной датой (стадия и поля)', () => {
        expect(
            dealSignalsOf(
                {
                    STAGE_ID: 'C5:LOSE',
                    CLOSEDATE: '2026-08-01T12:00:00+03:00',
                    UF_R: '41',
                },
                CODE_OF_STAGE,
                FIELDS,
                TZ,
            ),
        ).toEqual([
            { kind: 'refusal', date: '2026-08-01', source: 'stage' },
            { kind: 'refusal', date: '2026-08-01', source: 'fields' },
        ]);
    });
});

describe('refusalFieldsOf — поля отказа по слепку портала', () => {
    const portal = (fields: Record<string, unknown>) =>
        ({
            getDealFieldByCode: (code: string) => fields[code],
            getFieldBitrixId: (field: { bitrixId: string }) => field.bitrixId,
        }) as never;

    it('заведённые поля → ключи select и id элементов; ничего не заведено → null', () => {
        const config = refusalFieldsOf(
            portal({
                op_prospects_type: {
                    bitrixId: 'UF_P',
                    items: [
                        { code: 'op_prospects_nopersp', bitrixId: 12 },
                        { code: 'op_prospects_fail', bitrixId: 13 },
                    ],
                },
                op_noresult_reason: {
                    bitrixId: 'UF_N',
                    items: [{ code: 'bay', bitrixId: 8 }],
                },
            }),
        );
        expect(config).toMatchObject({
            select: ['UF_P', 'UF_N'],
            prospectsKey: 'UF_P',
            failReasonKey: null,
            noresultKey: 'UF_N',
            noresultRefusalId: '8',
        });
        expect([...(config?.prospectsRefusalIds ?? [])].sort()).toEqual([
            '12',
            '13',
        ]);
        expect(refusalFieldsOf(portal({}))).toBeNull();
    });

    it('сломанный слепок → null (fail-open)', () => {
        const broken = {
            getDealFieldByCode: () => {
                throw new Error('нет полей');
            },
        } as never;
        expect(refusalFieldsOf(broken)).toBeNull();
    });
});
