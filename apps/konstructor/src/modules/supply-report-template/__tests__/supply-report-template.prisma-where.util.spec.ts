import {
    buildClearOtherDefaultsWhere,
    buildSupplyReportTemplateWhere,
} from '../utils/supply-report-template.prisma-where.util';

describe('buildSupplyReportTemplateWhere', () => {
    it('без фильтров отдаёт пустой where — видны и портальные, и общие', () => {
        expect(buildSupplyReportTemplateWhere({})).toEqual({});
    });

    it('portal_id: null — только общие (portal_id IS NULL)', () => {
        expect(buildSupplyReportTemplateWhere({ portal_id: null })).toEqual({
            portal_id: null,
        });
    });

    it('portal_id: 7n — только портала 7', () => {
        expect(buildSupplyReportTemplateWhere({ portal_id: 7n })).toEqual({
            portal_id: 7n,
        });
    });

    it('различает «фильтра нет» и «только общие»: undefined не превращается в null', () => {
        const noFilter = buildSupplyReportTemplateWhere({
            portal_id: undefined,
        });
        const onlyCommon = buildSupplyReportTemplateWhere({ portal_id: null });
        expect(noFilter).not.toEqual(onlyCommon);
        expect('portal_id' in noFilter).toBe(false);
    });

    it('portal_id_or_common — портал ИЛИ общие', () => {
        expect(
            buildSupplyReportTemplateWhere({ portal_id_or_common: 7n }),
        ).toEqual({
            OR: [{ portal_id: 7n }, { portal_id: null }],
        });
    });

    it('portal_id_or_common сильнее portal_id: маршрут важнее фильтра', () => {
        expect(
            buildSupplyReportTemplateWhere({
                portal_id_or_common: 7n,
                portal_id: 9n,
            }),
        ).toEqual({ OR: [{ portal_id: 7n }, { portal_id: null }] });
    });

    it('agent_id: null — только шаблоны без привязки к поставщику', () => {
        expect(buildSupplyReportTemplateWhere({ agent_id: null })).toEqual({
            agent_id: null,
        });
    });

    it('поиск идёт по name, code и description', () => {
        expect(
            buildSupplyReportTemplateWhere({ search: '  интернет  ' }),
        ).toEqual({
            OR: [
                { name: { contains: 'интернет' } },
                { code: { contains: 'интернет' } },
                { description: { contains: 'интернет' } },
            ],
        });
    });

    it('пустой поиск (только пробелы) фильтра не добавляет', () => {
        expect(buildSupplyReportTemplateWhere({ search: '   ' })).toEqual({});
    });

    it('поиск вместе с OR по порталу заворачивается в AND, а не склеивается', () => {
        const where = buildSupplyReportTemplateWhere({
            portal_id_or_common: 7n,
            search: 'интернет',
        });

        // Главное: нет единого OR, иначе поиск вернул бы чужие порталы.
        expect(where.OR).toBeUndefined();
        expect(where.AND).toEqual([
            { OR: [{ portal_id: 7n }, { portal_id: null }] },
            {
                OR: [
                    { name: { contains: 'интернет' } },
                    { code: { contains: 'интернет' } },
                    { description: { contains: 'интернет' } },
                ],
            },
        ]);
    });

    it('флаги is_active / is_archived прокидываются как есть, включая false', () => {
        expect(
            buildSupplyReportTemplateWhere({
                is_active: false,
                is_archived: false,
            }),
        ).toEqual({ is_active: false, is_archived: false });
    });

    it('take/skip в where не попадают — это пагинация, а не фильтр', () => {
        expect(buildSupplyReportTemplateWhere({ take: 10, skip: 5 })).toEqual(
            {},
        );
    });
});

describe('buildClearOtherDefaultsWhere', () => {
    it('область — пара (портал, поставщик), текущая строка исключена', () => {
        expect(buildClearOtherDefaultsWhere(7n, 42n, 1n)).toEqual({
            id: { not: 1n },
            portal_id: 7n,
            agent_id: 42n,
            is_archived: false,
            is_default: true,
        });
    });

    it('общая область — portal_id и agent_id равны null, а не отсутствуют', () => {
        const where = buildClearOtherDefaultsWhere(null, null, 5n);
        expect(where.portal_id).toBeNull();
        expect(where.agent_id).toBeNull();
    });

    it('contract_type в область не входит: у отчёта о поставке такой колонки нет', () => {
        expect(buildClearOtherDefaultsWhere(7n, null, 1n)).not.toHaveProperty(
            'contract_type',
        );
    });

    it('архивные не трогаются — лишний UPDATE по архиву бессмыслен', () => {
        expect(buildClearOtherDefaultsWhere(7n, null, 1n).is_archived).toBe(
            false,
        );
    });
});
