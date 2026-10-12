import {
    ClientTypeEnum,
    SupplyTypeEnum,
} from '../dto/supply-report-template.enums';
import {
    buildSupplyReportTemplateArchiveData,
    buildSupplyReportTemplateCreateData,
    buildSupplyReportTemplateUpdateData,
    parseOptionalBigInt,
} from '../utils/supply-report-template.payloads.util';

const FILES = { filePath: 'a.docx', demoPath: null };
const COMMON = { portal_id: null, agent_id: null };
const NOW = new Date('2026-10-12T09:00:00.000Z');

describe('parseOptionalBigInt', () => {
    it('строка с числом → bigint', () => {
        expect(parseOptionalBigInt('7')).toBe(7n);
    });

    it('null, undefined и пустая строка → null («сбросить»)', () => {
        expect(parseOptionalBigInt(null)).toBeNull();
        expect(parseOptionalBigInt(undefined)).toBeNull();
        expect(parseOptionalBigInt('   ')).toBeNull();
    });

    it('значение выше 2^53 не теряет точность', () => {
        expect(parseOptionalBigInt('9007199254740993')).toBe(9007199254740993n);
    });
});

describe('buildSupplyReportTemplateCreateData', () => {
    it('created_at и updated_at проставляются ЯВНО одним значением', () => {
        const data = buildSupplyReportTemplateCreateData(
            { name: 'x' },
            COMMON,
            FILES,
            NOW,
        );
        expect(data.created_at).toBe(NOW);
        expect(data.updated_at).toBe(NOW);
    });

    it('code генерируется, а не приходит из тела запроса', () => {
        const data = buildSupplyReportTemplateCreateData(
            { name: 'x' },
            COMMON,
            FILES,
            NOW,
        );
        expect(data.code).toMatch(/^supply-report-[0-9a-f-]{36}$/);
    });

    it('пустые и отсутствующие списки → NULL, а не "[]"', () => {
        const data = buildSupplyReportTemplateCreateData(
            { name: 'x', client_types: [], required_fields: [] },
            COMMON,
            FILES,
            NOW,
        );
        expect(data.client_types).toBeNull();
        expect(data.supply_types).toBeNull();
        expect(data.required_fields).toBeNull();
        expect(data.optional_fields).toBeNull();
    });

    it('заполненные списки → JSON', () => {
        const data = buildSupplyReportTemplateCreateData(
            {
                name: 'x',
                client_types: [ClientTypeEnum.ORG_STATE],
                supply_types: [SupplyTypeEnum.INTERNET],
                required_fields: ['sale_date'],
            },
            COMMON,
            FILES,
            NOW,
        );
        expect(data.client_types).toBe(JSON.stringify(['org_state']));
        expect(data.supply_types).toBe(JSON.stringify(['internet']));
        expect(data.required_fields).toBe(JSON.stringify(['sale_date']));
    });

    it('дефолты: активен, не по умолчанию, не в архиве', () => {
        const data = buildSupplyReportTemplateCreateData(
            { name: 'x' },
            COMMON,
            FILES,
            NOW,
        );
        expect(data.is_active).toBe(true);
        expect(data.is_default).toBe(false);
        expect(data.is_archived).toBe(false);
    });

    it('is_active: false не теряется как ложное значение', () => {
        const data = buildSupplyReportTemplateCreateData(
            { name: 'x', is_active: false },
            COMMON,
            FILES,
            NOW,
        );
        expect(data.is_active).toBe(false);
    });

    it('область и файлы пишутся скалярами', () => {
        const data = buildSupplyReportTemplateCreateData(
            { name: 'x', creator_bitrix_user_id: '1' },
            { portal_id: 7n, agent_id: 42n },
            { filePath: 'a.docx', demoPath: 'b.docx' },
            NOW,
        );
        expect(data.portal_id).toBe(7n);
        expect(data.agent_id).toBe(42n);
        expect(data.file_path).toBe('a.docx');
        expect(data.demo_path).toBe('b.docx');
        expect(data.creator_bitrix_user_id).toBe(1n);
    });

    it('contract_type не пишется: такой колонки у отчёта о поставке нет', () => {
        expect(
            buildSupplyReportTemplateCreateData(
                { name: 'x' },
                COMMON,
                FILES,
                NOW,
            ),
        ).not.toHaveProperty('contract_type');
    });
});

describe('buildSupplyReportTemplateUpdateData', () => {
    it('пустой dto меняет только updated_at', () => {
        const data = buildSupplyReportTemplateUpdateData({}, null, null);
        expect(Object.keys(data)).toEqual(['updated_at']);
        expect(data.updated_at).toBeInstanceOf(Date);
    });

    it('пустой список сбрасывает колонку в NULL', () => {
        const data = buildSupplyReportTemplateUpdateData(
            { required_fields: [], optional_fields: [] },
            null,
            null,
        );
        expect(data.required_fields).toBeNull();
        expect(data.optional_fields).toBeNull();
    });

    it('portal_id/agent_id пишутся только когда они переданы', () => {
        const untouched = buildSupplyReportTemplateUpdateData({}, 7n, 42n);
        expect(untouched).not.toHaveProperty('portal_id');
        expect(untouched).not.toHaveProperty('agent_id');

        const touched = buildSupplyReportTemplateUpdateData(
            { portal_id: '7', agent_id: '42' },
            7n,
            42n,
        );
        expect(touched.portal_id).toBe(7n);
        expect(touched.agent_id).toBe(42n);
    });

    it('is_default: false пишется, а не пропускается как ложное', () => {
        const data = buildSupplyReportTemplateUpdateData(
            { is_default: false },
            null,
            null,
        );
        expect(data.is_default).toBe(false);
    });

    it('описание можно задать пустой строкой', () => {
        const data = buildSupplyReportTemplateUpdateData(
            { description: '' },
            null,
            null,
        );
        expect(data.description).toBe('');
    });
});

describe('buildSupplyReportTemplateArchiveData', () => {
    it('архивация ставит archived_at и снимает флаг «по умолчанию»', () => {
        const data = buildSupplyReportTemplateArchiveData(true);
        expect(data.is_archived).toBe(true);
        expect(data.is_default).toBe(false);
        expect(data.archived_at).toBeInstanceOf(Date);
    });

    it('разархивация чистит archived_at и флаг НЕ восстанавливает', () => {
        const data = buildSupplyReportTemplateArchiveData(false);
        expect(data.is_archived).toBe(false);
        expect(data.archived_at).toBeNull();
        expect(data).not.toHaveProperty('is_default');
    });
});
