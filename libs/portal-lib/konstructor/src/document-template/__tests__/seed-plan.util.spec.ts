import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';
import {
    CONTRACT_ETALON_SUBPATH,
    CONTRACT_TEMPLATE_FILE,
    CONTRACT_TEMPLATE_SUBPATH,
    FileRefResolver,
    SUPPLY_REPORT_FILE,
    SUPPLY_REPORT_LEGACY_GSR_FILE,
    SUPPLY_REPORT_SUBPATH,
    planContractRows,
    planEtalonContractRows,
    RETIRED_GENERIC_CONTRACT_CODES,
    planSupplyRows,
} from '../lib/seed-plan.util';

/** Резолвер над списком «существующих» путей: ни FS, ни Prisma. */
const refsFrom =
    (present: readonly string[]): FileRefResolver =>
    (subPath, fileName) => {
        const path = `${subPath}/${fileName}`;
        return { path, exists: present.includes(path) };
    };

const etalon = (type: string, supply: string, bucket: string): string =>
    `${CONTRACT_ETALON_SUBPATH}/${type}/${supply}/${bucket}/${CONTRACT_TEMPLATE_FILE}`;

/** Ровно то, что лежит на сервере (6 файлов). */
const SERVER_ETALON = [
    etalon('lic', 'internet', 'commerc'),
    etalon('lic', 'internet', 'state'),
    etalon('service', 'internet', 'commerc'),
    etalon('service', 'internet', 'state'),
    etalon('service', 'proxima', 'commerc'),
    etalon('service', 'proxima', 'state'),
];
const GENERIC = `${CONTRACT_TEMPLATE_SUBPATH}/${CONTRACT_TEMPLATE_FILE}`;

describe('planEtalonContractRows', () => {
    it('в план попадают ТОЛЬКО существующие файлы серверной матрицы', () => {
        const plan = planEtalonContractRows(refsFrom(SERVER_ETALON));

        expect(plan.rows).toHaveLength(6);
        expect(plan.rows.map(r => r.file_path).sort()).toEqual(
            [...SERVER_ETALON].sort(),
        );
        // 4 типа × 2 поставки × 2 корзины = 16, минус 6 найденных
        expect(plan.missing).toHaveLength(10);
    });

    it('state → только бюджетники; commerc → все остальные, включая advokat', () => {
        const plan = planEtalonContractRows(refsFrom(SERVER_ETALON));
        const state = plan.rows.find(
            r => r.code === 'common-contract-lic-internet-state',
        );
        const commerc = plan.rows.find(
            r => r.code === 'common-contract-lic-internet-commerc',
        );

        expect(state?.client_types).toEqual([ClientTypeEnum.ORG_STATE]);
        expect(commerc?.client_types).toEqual([
            ClientTypeEnum.ORG,
            ClientTypeEnum.IP,
            ClientTypeEnum.FIZ,
            ClientTypeEnum.ADVOKAT,
        ]);
        expect(state?.client_types).not.toContain(ClientTypeEnum.ORG);
    });

    it('тип поставки — ровно один, из пути', () => {
        const plan = planEtalonContractRows(refsFrom(SERVER_ETALON));
        const proxima = plan.rows.find(
            r => r.code === 'common-contract-service-proxima-state',
        );
        expect(proxima?.supply_types).toEqual([SupplyTypeEnum.PROXIMA]);
        expect(proxima?.contract_type).toBe(CONTRACT_LTYPE.SERVICE);
    });

    it('ничего нет — пустой план, 16 отсутствующих путей', () => {
        const plan = planEtalonContractRows(refsFrom([]));
        expect(plan.rows).toEqual([]);
        expect(plan.missing).toHaveLength(16);
    });
});

describe('planContractRows', () => {
    it('только точные строки: template.docx в план не попадает', () => {
        const plan = planContractRows(refsFrom([GENERIC, ...SERVER_ETALON]));
        expect(plan.rows).toHaveLength(6);
        expect(new Set(plan.rows.map(r => r.code)).size).toBe(6);
        expect(plan.rows.map(r => r.file_path)).not.toContain(GENERIC);
        for (const row of plan.rows) {
            expect(row.client_types).not.toBeNull();
            expect(row.supply_types).not.toBeNull();
        }
    });

    it('коды старых общих строк — по одному на тип договора, к архивации', () => {
        expect([...RETIRED_GENERIC_CONTRACT_CODES].sort()).toEqual(
            Object.values(CONTRACT_LTYPE)
                .map(type => `common-contract-${type}`)
                .sort(),
        );
    });
});

describe('planSupplyRows', () => {
    const COMMON = `${SUPPLY_REPORT_SUBPATH}/${SUPPLY_REPORT_FILE}`;
    const GARANT = `${SUPPLY_REPORT_SUBPATH}/april-garant.bitrix24.ru/${SUPPLY_REPORT_FILE}`;
    const LEGACY = `${SUPPLY_REPORT_SUBPATH}/${SUPPLY_REPORT_LEGACY_GSR_FILE}`;

    it('общий + портальный + старый gsr (неактивный)', () => {
        const plan = planSupplyRows(refsFrom([COMMON, GARANT, LEGACY]), [
            'april-garant.bitrix24.ru',
        ]);

        expect(plan.missing).toEqual([]);
        expect(plan.rows.map(r => r.code)).toEqual([
            'common-supply-report',
            'portal-supply-report-april-garant.bitrix24.ru',
            'portal-supply-report-gsr.bitrix24.ru-legacy',
        ]);

        const common = plan.rows[0];
        const garant = plan.rows[1];
        const legacy = plan.rows[2];
        expect(common.portal_domain).toBeNull();
        expect(common.is_active).toBe(true);
        expect(garant.portal_domain).toBe('april-garant.bitrix24.ru');
        expect(garant.is_active).toBe(true);
        expect(legacy.portal_domain).toBe('gsr.bitrix24.ru');
        expect(legacy.is_active).toBe(false);
    });

    it('каталог портала без файла — в missing, не в строки', () => {
        const plan = planSupplyRows(refsFrom([COMMON]), ['x.bitrix24.ru']);
        expect(plan.rows.map(r => r.code)).toEqual(['common-supply-report']);
        expect(plan.missing).toEqual([
            `${SUPPLY_REPORT_SUBPATH}/x.bitrix24.ru/${SUPPLY_REPORT_FILE}`,
        ]);
    });

    it('файлов нет вовсе — пустой план (таблица остаётся пустой, откат на файл законен)', () => {
        const plan = planSupplyRows(refsFrom([]), []);
        expect(plan.rows).toEqual([]);
        expect(plan.missing).toEqual([COMMON]);
    });

    it('домены сортируются — порядок строк стабилен', () => {
        const b = `${SUPPLY_REPORT_SUBPATH}/b.ru/${SUPPLY_REPORT_FILE}`;
        const a = `${SUPPLY_REPORT_SUBPATH}/a.ru/${SUPPLY_REPORT_FILE}`;
        const plan = planSupplyRows(refsFrom([a, b]), ['b.ru', 'a.ru']);
        expect(plan.rows.map(r => r.portal_domain)).toEqual(['a.ru', 'b.ru']);
    });
});
