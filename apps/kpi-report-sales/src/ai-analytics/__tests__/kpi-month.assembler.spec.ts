import {
    assembleKpiManagerMonth,
    buildPerTypeCommands,
    codesNeedingBatch,
    KpiListConfigError,
    resolveKpiListFields,
} from '../domain/loaders/kpi-month.assembler';
import { normalizeReportPeriod } from '../../shared/lib/date-util';
import { kpiListFixture, portalModelMock } from './fixtures/kpi-loader.fixture';

describe('kpi-month.assembler', () => {
    describe('resolveKpiListFields', () => {
        it('резолвит поля списка и bitrixId элементов (терпимо к префиксу кода)', () => {
            const prefixed = {
                ...kpiListFixture,
                bitrixfields: kpiListFixture.bitrixfields.map(field =>
                    field.items
                        ? {
                              ...field,
                              items: field.items.map(item => ({
                                  ...item,
                                  code: `sales_kpi_${item.code}`,
                              })),
                          }
                        : field,
                ),
            };
            const fields = resolveKpiListFields(
                portalModelMock(prefixed) as never,
            );

            expect(fields.listId).toBe('55');
            expect(fields.responsibleKey).toBe('PROPERTY_102');
            expect(fields.actionKey).toBe('PROPERTY_100');
            expect(fields.typeKey).toBe('PROPERTY_101');
            expect(fields.dateKey).toBe('PROPERTY_103');
            expect(fields.doneItemId).toBe(12);
            expect(fields.typeItemIds.get('xo')).toBe(21);
            expect(fields.typeItemIds.get('presentation_uniq')).toBe(24);
            // ev_offer в карте не привязан ни к одному типу — в typeItemIds его нет
            expect(fields.typeItemIds.has('ev_offer' as never)).toBe(false);
        });

        it('список / поле / элемент done не настроены — KpiListConfigError', () => {
            const withoutList = { getListByCode: () => undefined };
            expect(() => resolveKpiListFields(withoutList as never)).toThrow(
                KpiListConfigError,
            );

            const withoutDate = {
                ...kpiListFixture,
                bitrixfields: kpiListFixture.bitrixfields.filter(
                    field => field.code !== 'sales_kpi_event_date',
                ),
            };
            expect(() =>
                resolveKpiListFields(portalModelMock(withoutDate) as never),
            ).toThrow(/event_date/);

            const withoutDone = {
                ...kpiListFixture,
                bitrixfields: kpiListFixture.bitrixfields.map(field =>
                    field.code === 'sales_kpi_event_action'
                        ? {
                              ...field,
                              items: [
                                  { code: 'plan', name: 'План', bitrixId: 11 },
                              ],
                          }
                        : field,
                ),
            };
            expect(() =>
                resolveKpiListFields(portalModelMock(withoutDone) as never),
            ).toThrow(/done/);
        });
    });

    it('codesNeedingBatch: коды со строкой в отчёте и без item’а на портале пропускаются', () => {
        const withoutSite = {
            ...kpiListFixture,
            bitrixfields: kpiListFixture.bitrixfields.map(field =>
                field.code === 'sales_kpi_event_type' && field.items
                    ? {
                          ...field,
                          items: field.items.filter(
                              item => item.code !== 'site',
                          ),
                      }
                    : field,
            ),
        };
        const fields = resolveKpiListFields(
            portalModelMock(withoutSite) as never,
        );
        const reportCodes = new Set([
            'call_done',
            'presentation_done',
            'presentation_uniq_done',
            'presentation_contact_uniq_done',
            'ev_success_done',
        ]);

        expect(codesNeedingBatch(reportCodes, fields).sort()).toEqual(
            [
                'call',
                'call_in_money',
                'call_in_progress',
                'come_call',
                'xo',
            ].sort(),
        );
    });

    it('buildPerTypeCommands: команда на (менеджер × код) с фильтрами канона kpi-report', () => {
        const fields = resolveKpiListFields(portalModelMock() as never);
        const commands = buildPerTypeCommands(
            fields,
            [1, 2],
            ['xo', 'call'],
            normalizeReportPeriod('2026-08-01', '2026-08-31'),
        );

        expect(commands.map(command => command.cmdKey)).toEqual([
            'user_1_type_xo_done',
            'user_1_type_call_done',
            'user_2_type_xo_done',
            'user_2_type_call_done',
        ]);
        expect(commands[3].params).toEqual({
            IBLOCK_TYPE_ID: 'lists',
            IBLOCK_ID: '55',
            filter: {
                PROPERTY_102: '2',
                PROPERTY_100: 12,
                PROPERTY_101: 22,
                '>PROPERTY_103': '01.08.2026',
                '<PROPERTY_103': '01.09.2026',
            },
            select: ['ID'],
        });
    });

    it('assembleKpiManagerMonth: отчёт приоритетнее батча, отсутствующий главный код — reason', () => {
        const withoutUniq = {
            ...kpiListFixture,
            bitrixfields: kpiListFixture.bitrixfields.map(field =>
                field.code === 'sales_kpi_event_type' && field.items
                    ? {
                          ...field,
                          items: field.items.filter(
                              item => item.code !== 'presentation_uniq',
                          ),
                      }
                    : field,
            ),
        };
        const fields = resolveKpiListFields(
            portalModelMock(withoutUniq) as never,
        );
        const counters = new Map<string, number>([
            ['call_plan', 5],
            ['call_done', 4],
            ['presentation_done', 2],
            ['presentation_plan', 3],
            ['ev_success_done', 1],
        ]);
        const batch = new Map<'xo' | 'call', number>([
            ['xo', 3],
            ['call', 1],
        ]);

        const row = assembleKpiManagerMonth(10, counters, batch, fields);

        expect(row.calls).toEqual({ plan: 5, done: 4 });
        expect(row.byType.cold.primaryDone).toBe(3);
        expect(row.byType.call.kpi).toEqual([
            { code: 'call', done: 1 },
            { code: 'come_call', done: 0 },
        ]);
        expect(row.byType.presentation.primaryDone).toBeNull();
        expect(row.byType.presentation.reason).toBe(
            'kpi-item-missing:presentation_uniq',
        );
        expect(row.byType.presentation.kpi.map(fact => fact.code)).toEqual([
            'presentation',
            'presentation_contact_uniq',
        ]);
        expect(row.checks).toEqual({ perTypeCallDone: 4, callDone: 4 });
        expect(row.counters).toEqual(Object.fromEntries(counters));
    });
});
