import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';
import {
    buildClearOtherDefaultsWhere,
    buildContractTemplateWhere,
    filterByTemplateLists,
    type TemplateListRow,
} from '../utils/contract-template.prisma-where.util';

describe('buildContractTemplateWhere', () => {
    it('пустые фильтры дают пустой where', () => {
        expect(buildContractTemplateWhere({})).toEqual({});
    });

    it('only_common превращается в portal_id IS NULL, а не в «без фильтра»', () => {
        expect(buildContractTemplateWhere({ only_common: true })).toEqual({
            portal_id: null,
        });
    });

    it('only_common сильнее переданного portal_id', () => {
        // Противоречивый ввод: явный запрос общих не должен молча
        // превратиться в выборку конкретного портала.
        expect(
            buildContractTemplateWhere({
                only_common: true,
                portal_id: 7n,
            }),
        ).toEqual({ portal_id: null });
    });

    it('portal_id_or_common даёт портал ИЛИ общие — общие не теряются', () => {
        expect(buildContractTemplateWhere({ portal_id_or_common: 7n })).toEqual(
            {
                OR: [{ portal_id: 7n }, { portal_id: null }],
            },
        );
    });

    it('portal_id без прочих флагов — точное равенство', () => {
        expect(buildContractTemplateWhere({ portal_id: 7n })).toEqual({
            portal_id: 7n,
        });
    });

    it('contract_type попадает в where как жёсткое равенство', () => {
        expect(
            buildContractTemplateWhere({
                contract_type: CONTRACT_LTYPE.LIC,
            }),
        ).toEqual({ contract_type: CONTRACT_LTYPE.LIC });
    });

    it('agent_id, is_active и is_archived переносятся как есть', () => {
        expect(
            buildContractTemplateWhere({
                agent_id: 42n,
                is_active: true,
                is_archived: false,
            }),
        ).toEqual({ agent_id: 42n, is_active: true, is_archived: false });
    });

    it('is_archived=false отличается от «не передан»', () => {
        expect(buildContractTemplateWhere({ is_archived: false })).toEqual({
            is_archived: false,
        });
        expect(buildContractTemplateWhere({})).not.toHaveProperty(
            'is_archived',
        );
    });

    it('поиск идёт по name и code, но не по description', () => {
        const where = buildContractTemplateWhere({ search: 'лиценз' });
        expect(where.OR).toEqual([
            { name: { contains: 'лиценз' } },
            { code: { contains: 'лиценз' } },
        ]);
        expect(JSON.stringify(where)).not.toContain('description');
    });

    it('пустой и пробельный поиск игнорируются', () => {
        expect(buildContractTemplateWhere({ search: '   ' })).toEqual({});
        expect(buildContractTemplateWhere({ search: '' })).toEqual({});
    });

    it('поиск вместе с «портал + общие» заворачивается в AND, а не сливается в один OR', () => {
        // Слияние двух OR дало бы «портал ИЛИ совпало имя»: поиск начал бы
        // возвращать шаблоны чужих порталов.
        const where = buildContractTemplateWhere({
            portal_id_or_common: 7n,
            search: 'дог',
        });
        expect(where.OR).toBeUndefined();
        expect(where.AND).toEqual([
            { OR: [{ portal_id: 7n }, { portal_id: null }] },
            {
                OR: [
                    { name: { contains: 'дог' } },
                    { code: { contains: 'дог' } },
                ],
            },
        ]);
    });

    it('client_types и supply_types в where не попадают — они фильтруются в TypeScript', () => {
        const where = buildContractTemplateWhere({
            portal_id: 7n,
            contract_type: CONTRACT_LTYPE.ABON,
            search: 'x',
        });
        const serialized = JSON.stringify(where, (_key, value: unknown) =>
            typeof value === 'bigint' ? String(value) : value,
        );
        expect(serialized).not.toContain('client_types');
        expect(serialized).not.toContain('supply_types');
    });
});

describe('buildClearOtherDefaultsWhere', () => {
    it('РЕГРЕССИЯ: область включает contract_type', () => {
        // Без contract_type установка умолчания для service молча снимала бы
        // флаг у умолчания для abon — у портала остался бы один шаблон
        // по умолчанию на все типы договора.
        const where = buildClearOtherDefaultsWhere(
            7n,
            null,
            CONTRACT_LTYPE.SERVICE,
            10n,
        );
        expect(where.contract_type).toBe(CONTRACT_LTYPE.SERVICE);
    });

    it('полная область: id != текущий, портал, поставщик, тип, не архив, только текущие умолчания', () => {
        expect(
            buildClearOtherDefaultsWhere(7n, 42n, CONTRACT_LTYPE.LIC, 10n),
        ).toEqual({
            id: { not: 10n },
            portal_id: 7n,
            agent_id: 42n,
            contract_type: CONTRACT_LTYPE.LIC,
            is_archived: false,
            is_default: true,
        });
    });

    it('общий шаблон: NULL-ы в области остаются NULL, а не исчезают из where', () => {
        // Пропущенный portal_id означал бы «любой портал» — снятие флага
        // уехало бы на чужие порталы.
        const where = buildClearOtherDefaultsWhere(
            null,
            null,
            CONTRACT_LTYPE.KEY,
            3n,
        );
        expect(where.portal_id).toBeNull();
        expect(where.agent_id).toBeNull();
    });

    it('архивные не трогаются', () => {
        expect(
            buildClearOtherDefaultsWhere(7n, null, CONTRACT_LTYPE.ABON, 1n)
                .is_archived,
        ).toBe(false);
    });
});

describe('filterByTemplateLists', () => {
    const row = (
        clientTypes: string | null,
        supplyTypes: string | null,
    ): TemplateListRow => ({
        client_types: clientTypes,
        supply_types: supplyTypes,
    });

    it('фильтр не задан — возвращаются все строки (новым массивом)', () => {
        const rows = [row('["org"]', null)];
        const result = filterByTemplateLists(rows, {});
        expect(result).toEqual(rows);
        expect(result).not.toBe(rows);
    });

    it('NULL в колонке — «годится любому» и проходит фильтр', () => {
        expect(
            filterByTemplateLists([row(null, null)], {
                client_type: ClientTypeEnum.IP,
            }),
        ).toHaveLength(1);
    });

    it('заполненный список проходит только при совпадении', () => {
        const rows = [row('["org","ip"]', null), row('["fiz"]', null)];
        expect(
            filterByTemplateLists(rows, { client_type: ClientTypeEnum.IP }),
        ).toEqual([rows[0]]);
    });

    it('фильтры по типу клиента и типу поставки применяются вместе (AND)', () => {
        const matching = row('["org"]', '["internet"]');
        const wrongSupply = row('["org"]', '["proxima"]');
        expect(
            filterByTemplateLists([matching, wrongSupply], {
                client_type: ClientTypeEnum.ORG,
                supply_type: SupplyTypeEnum.INTERNET,
            }),
        ).toEqual([matching]);
    });

    it('битый JSON в колонке не кидает, строка считается «для любого»', () => {
        expect(
            filterByTemplateLists([row('{не json', '["x"')], {
                client_type: ClientTypeEnum.ORG,
                supply_type: SupplyTypeEnum.PROXIMA,
            }),
        ).toHaveLength(1);
    });

    it('пустой JSON-массив приравнен к NULL, а не к «никому не подходит»', () => {
        expect(
            filterByTemplateLists([row('[]', '[]')], {
                client_type: ClientTypeEnum.ADVOKAT,
                supply_type: SupplyTypeEnum.PROXIMA,
            }),
        ).toHaveLength(1);
    });

    it('незнакомые коды отбрасываются: строка из одних незнакомых становится «для любого»', () => {
        expect(
            filterByTemplateLists([row('["нечто"]', null)], {
                client_type: ClientTypeEnum.FIZ,
            }),
        ).toHaveLength(1);
    });

    it('не совпавшая строка исключается, исходный массив не мутируется', () => {
        const rows = [row('["fiz"]', null)];
        expect(
            filterByTemplateLists(rows, {
                client_type: ClientTypeEnum.ORG_STATE,
            }),
        ).toEqual([]);
        expect(rows).toHaveLength(1);
    });
});
