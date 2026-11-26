import {
    REPORT_VIEW_PLAN_COLUMN_CODES,
    isReportViewLabelKey,
} from '@lib/portal-lib/store/app-settings';
import type { PBXService } from '@/modules/pbx';
import {
    KPI_LIST_FIELDS,
    KPI_LIST_REPORT_COLUMNS,
} from '../../report/__tests__/fixtures/kpi-list.fixture';
import { PortalViewIndicatorsService } from '../portal-view-indicators.service';
import {
    buildIndicatorCatalog,
    cleanIndicatorName,
    PLAN_COLUMN_INDICATORS,
} from '../portal-view-indicators.util';
import { DOMAIN } from './portal-view.fixtures';

const CALLING_KEYS = [
    'call:all',
    'call:30',
    'call:60',
    'call:180',
    'call:300',
    'call:600',
];

/** Сервис каталога на портале с заданным списком KPI (или без него). */
function buildService(listFields: typeof KPI_LIST_FIELDS | null) {
    const getListByCode = jest.fn((code: string) =>
        code === 'sales_kpi' && listFields
            ? { bitrixId: '55', bitrixfields: listFields }
            : undefined,
    );
    const pbx = {
        init: jest.fn().mockResolvedValue({ PortalModel: { getListByCode } }),
    };
    const service = new PortalViewIndicatorsService(
        pbx as unknown as PBXService,
    );
    return { service, pbx, getListByCode };
}

describe('каталог показателей: сборка', () => {
    it('cleanIndicatorName: пробелы по краям убраны, повторные схлопнуты', () => {
        expect(cleanIndicatorName('План  Презентация')).toBe(
            'План Презентация',
        );
        expect(cleanIndicatorName(' Презентация')).toBe('Презентация');
        expect(cleanIndicatorName('  ')).toBe('');
    });

    it('события в порядке отчёта (синтетические первыми), затем звонки, затем планы', () => {
        const catalog = buildIndicatorCatalog(KPI_LIST_REPORT_COLUMNS);
        const events = catalog.filter(item => item.group === 'events');

        expect(events.map(item => item.key)).toEqual(
            KPI_LIST_REPORT_COLUMNS.map(column => `ev:${column.innerCode}`),
        );
        expect(events.slice(0, 2)).toEqual([
            {
                key: 'ev:result_communication_plan',
                group: 'events',
                name: 'План',
                factKey: null,
            },
            {
                key: 'ev:result_communication_done',
                group: 'events',
                name: 'Результативные',
                factKey: null,
            },
        ]);
        expect(catalog.map(item => item.group)).toEqual([
            ...events.map(() => 'events'),
            ...CALLING_KEYS.map(() => 'callings'),
            ...catalog
                .filter(item => item.group === 'plans')
                .map(() => 'plans'),
        ]);
    });

    it('названия событий без лишних пробелов', () => {
        const names = buildIndicatorCatalog(KPI_LIST_REPORT_COLUMNS)
            .filter(item => item.group === 'events')
            .map(item => item.name);

        expect(names).toContain('План Презентация');
        expect(names).toContain('Презентация');
        expect(names).toContain('План През. уникальная');
        expect(names.every(name => name === name.trim())).toBe(true);
        expect(names.some(name => name.includes('  '))).toBe(false);
    });

    it('звонки — все бакеты с названиями таблицы звонков', () => {
        const callings = buildIndicatorCatalog([]).filter(
            item => item.group === 'callings',
        );

        expect(callings.map(item => item.key)).toEqual(CALLING_KEYS);
        expect(callings[0]).toEqual({
            key: 'call:all',
            group: 'callings',
            name: 'Наборов номера',
            factKey: null,
        });
    });

    it('планы: только с фактом в событиях или звонках портала, с ключом факта', () => {
        const plans = buildIndicatorCatalog(KPI_LIST_REPORT_COLUMNS).filter(
            item => item.group === 'plans',
        );

        expect(plans).toEqual([
            {
                key: 'plan:calls_done',
                group: 'plans',
                name: 'Звонки',
                factKey: 'ev:call_done',
            },
            {
                key: 'plan:presentations_done',
                group: 'plans',
                name: 'Презентации',
                factKey: 'ev:presentation_done',
            },
            {
                key: 'plan:offers_sent',
                group: 'plans',
                name: 'КП',
                factKey: 'ev:ev_offer_act_send',
            },
            {
                key: 'plan:sales_count',
                group: 'plans',
                name: 'Продажи (шт)',
                factKey: 'ev:ev_success_done',
            },
            {
                key: 'plan:calls_over_30s',
                group: 'plans',
                name: 'Звонки > 30 сек',
                factKey: 'call:30',
            },
            {
                key: 'plan:calls_over_60s',
                group: 'plans',
                name: 'Звонки > 60 сек',
                factKey: 'call:60',
            },
        ]);
        // Счетов на портале нет — плана «Счета» в каталоге нет.
        expect(plans.map(item => item.key)).not.toContain('plan:invoices_sent');
    });

    it('без событий остаются звонки и планы со звонковым фактом', () => {
        const catalog = buildIndicatorCatalog([]);

        expect(catalog.filter(item => item.group === 'events')).toEqual([]);
        expect(
            catalog
                .filter(item => item.group === 'plans')
                .map(item => item.key),
        ).toEqual(['plan:calls_over_30s', 'plan:calls_over_60s']);
    });

    it('повтор колонки события — один показатель; все ключи годятся для своих названий', () => {
        const catalog = buildIndicatorCatalog([
            ...KPI_LIST_REPORT_COLUMNS,
            { innerCode: 'call_plan', name: 'Повтор' },
        ]);
        const keys = catalog.map(item => item.key);

        expect(new Set(keys).size).toBe(keys.length);
        expect(keys.every(isReportViewLabelKey)).toBe(true);
    });

    it('плановые колонки каталога планов совпадают со списком настройки портала', () => {
        expect(PLAN_COLUMN_INDICATORS.map(indicator => indicator.code)).toEqual(
            [...REPORT_VIEW_PLAN_COLUMN_CODES],
        );
    });
});

describe('PortalViewIndicatorsService', () => {
    it('строит каталог по списку KPI портала домена', async () => {
        const { service, pbx, getListByCode } = buildService(KPI_LIST_FIELDS);

        const catalog = await service.forDomain(DOMAIN);

        expect(pbx.init).toHaveBeenCalledWith(DOMAIN);
        expect(getListByCode).toHaveBeenCalledWith('sales_kpi');
        expect(catalog).toEqual(buildIndicatorCatalog(KPI_LIST_REPORT_COLUMNS));
    });

    it('портал без списка KPI — без событий, но не падает', async () => {
        const { service } = buildService(null);

        const catalog = await service.forDomain(DOMAIN);

        expect(catalog.some(item => item.group === 'events')).toBe(false);
        expect(catalog.filter(item => item.group === 'callings')).toHaveLength(
            CALLING_KEYS.length,
        );
    });

    it('портал без полей действия и типа — тоже без событий', async () => {
        const { service } = buildService([KPI_LIST_FIELDS[2]]);

        const catalog = await service.forDomain(DOMAIN);

        expect(catalog.some(item => item.group === 'events')).toBe(false);
    });

    it('ошибка чтения портала не глушится', async () => {
        const { service, pbx } = buildService(KPI_LIST_FIELDS);
        pbx.init.mockRejectedValue(new Error('портал не найден'));

        await expect(service.forDomain(DOMAIN)).rejects.toThrow(
            'портал не найден',
        );
    });
});
