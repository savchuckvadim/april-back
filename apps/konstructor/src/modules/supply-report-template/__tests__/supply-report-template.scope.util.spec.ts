import { BadRequestException } from '@nestjs/common';
import { SupplyReportTemplateScope } from '../dto/supply-report-template.enums';
import { resolveSupplyReportTemplateScope } from '../utils/supply-report-template.scope.util';
import { supplyReportTemplateQueryToFilters } from '../utils/supply-report-template.query-filters.util';
import { SUPPLY_REPORT_TEMPLATE_PAGE_SIZE } from '../dto/supply-report-template-query.dto';

describe('resolveSupplyReportTemplateScope', () => {
    describe('scope передан явно', () => {
        it('common — пара (null, null)', () => {
            expect(
                resolveSupplyReportTemplateScope(
                    SupplyReportTemplateScope.COMMON,
                    null,
                    null,
                ),
            ).toEqual({ portal_id: null, agent_id: null });
        });

        it('common с portal_id падает: обнулять выбор админа молча нельзя', () => {
            expect(() =>
                resolveSupplyReportTemplateScope(
                    SupplyReportTemplateScope.COMMON,
                    7n,
                    null,
                ),
            ).toThrow(BadRequestException);
        });

        it('portal — портал без поставщика', () => {
            expect(
                resolveSupplyReportTemplateScope(
                    SupplyReportTemplateScope.PORTAL,
                    7n,
                    null,
                ),
            ).toEqual({ portal_id: 7n, agent_id: null });
        });

        it('portal без portal_id падает', () => {
            expect(() =>
                resolveSupplyReportTemplateScope(
                    SupplyReportTemplateScope.PORTAL,
                    null,
                    null,
                ),
            ).toThrow(BadRequestException);
        });

        it('portal с agent_id падает — это уровень provider', () => {
            expect(() =>
                resolveSupplyReportTemplateScope(
                    SupplyReportTemplateScope.PORTAL,
                    7n,
                    42n,
                ),
            ).toThrow(BadRequestException);
        });

        it('provider — портал и поставщик', () => {
            expect(
                resolveSupplyReportTemplateScope(
                    SupplyReportTemplateScope.PROVIDER,
                    7n,
                    42n,
                ),
            ).toEqual({ portal_id: 7n, agent_id: 42n });
        });

        it('provider без поставщика падает', () => {
            expect(() =>
                resolveSupplyReportTemplateScope(
                    SupplyReportTemplateScope.PROVIDER,
                    7n,
                    null,
                ),
            ).toThrow(BadRequestException);
        });

        it('provider без портала падает', () => {
            expect(() =>
                resolveSupplyReportTemplateScope(
                    SupplyReportTemplateScope.PROVIDER,
                    null,
                    42n,
                ),
            ).toThrow(BadRequestException);
        });
    });

    describe('scope не передан — выводится из значений (старый клиент)', () => {
        it('нет ни портала, ни поставщика → общий', () => {
            expect(
                resolveSupplyReportTemplateScope(undefined, null, null),
            ).toEqual({ portal_id: null, agent_id: null });
        });

        it('только портал → портальный', () => {
            expect(
                resolveSupplyReportTemplateScope(undefined, 7n, null),
            ).toEqual({ portal_id: 7n, agent_id: null });
        });

        it('портал и поставщик → provider', () => {
            expect(
                resolveSupplyReportTemplateScope(undefined, 7n, 42n),
            ).toEqual({ portal_id: 7n, agent_id: 42n });
        });

        it('поставщик без портала падает: у agents.portalId NOT NULL', () => {
            expect(() =>
                resolveSupplyReportTemplateScope(undefined, null, 42n),
            ).toThrow(BadRequestException);
        });
    });
});

describe('supplyReportTemplateQueryToFilters', () => {
    it('без query — дефолтная страница, без фильтров по области', () => {
        const filters = supplyReportTemplateQueryToFilters();
        expect(filters).toEqual({
            take: SUPPLY_REPORT_TEMPLATE_PAGE_SIZE,
            skip: 0,
        });
    });

    it('only_common переводится в portal_id: null', () => {
        expect(
            supplyReportTemplateQueryToFilters({ only_common: true }).portal_id,
        ).toBeNull();
    });

    it('portal_id из строки становится bigint', () => {
        expect(
            supplyReportTemplateQueryToFilters({ portal_id: '7' }).portal_id,
        ).toBe(7n);
    });

    it('only_common вместе с portal_id — ошибка, а не молчаливый выбор одного', () => {
        expect(() =>
            supplyReportTemplateQueryToFilters({
                only_common: true,
                portal_id: '7',
            }),
        ).toThrow(BadRequestException);
    });

    it('client_type/supply_type в фильтры репозитория не попадают', () => {
        const filters = supplyReportTemplateQueryToFilters({
            client_type: undefined,
            supply_type: undefined,
        });
        expect(filters).not.toHaveProperty('client_type');
        expect(filters).not.toHaveProperty('supply_type');
    });

    it('is_active: false прокидывается, а не теряется как ложное значение', () => {
        expect(
            supplyReportTemplateQueryToFilters({ is_active: false }).is_active,
        ).toBe(false);
    });

    it('agent_id, search, take и skip прокидываются', () => {
        const filters = supplyReportTemplateQueryToFilters({
            agent_id: '42',
            search: 'интернет',
            take: 10,
            skip: 20,
        });
        expect(filters.agent_id).toBe(42n);
        expect(filters.search).toBe('интернет');
        expect(filters.take).toBe(10);
        expect(filters.skip).toBe(20);
    });
});
