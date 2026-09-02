import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { buildDealListSelect } from '../services/init/event-report-init.service';
import {
    DEAL_REFINE_FIELD_CODES,
    XVOST_DEAL_FIELD_CODES,
} from '../services/entity/event-report-entity-fields.model';
import { COMPANY_BACKFILL_CODES } from '../services/entity/event-report-company-backfill.model';

/**
 * Состав select init-батча сделок: crm.deal.list отдаёт ровно то, что
 * попросили, поэтому каждое UF-поле, которое flow потом ЧИТАЕТ со сделки,
 * обязано резолвиться в select по слепку портала. Регресс ловится именно
 * здесь: без op_xvost_* снимок «Хвоста» на pres-сделку был вечно пуст, без
 * op_sale_date_prognoz/op_concurents* бэкфилл компании никогда не срабатывал.
 */
const portalStub = (installedCodes: Record<string, string>): PortalModel =>
    ({
        getEntityFieldByCode: (entity: string, code: string) => {
            if (entity !== 'deal') return undefined;
            const bitrixId = installedCodes[code];
            return bitrixId ? { bitrixId } : undefined;
        },
    }) as unknown as PortalModel;

/** Полный слепок: каждый код установлен с bitrixId = UPPERCASE(code). */
const fullPortal = () =>
    portalStub(
        Object.fromEntries(
            [
                'pres_count',
                'pres_comments',
                'op_fail_comments',
                'op_mhistory',
                'op_move_count',
                ...XVOST_DEAL_FIELD_CODES,
                ...COMPANY_BACKFILL_CODES,
                ...DEAL_REFINE_FIELD_CODES,
            ].map(code => [code, code.toUpperCase()]),
        ),
    );

describe('buildDealListSelect', () => {
    it('содержит базовые поля сделки и to_*-ссылки', () => {
        const select = buildDealListSelect(fullPortal());
        for (const key of [
            'ID',
            'CATEGORY_ID',
            'STAGE_ID',
            'CLOSED',
            'COMPANY_ID',
            'LEAD_ID',
            'UF_CRM_TO_BASE_SALES',
            'UF_CRM_TO_PRESENTATION_SALES',
        ]) {
            expect(select).toContain(key);
        }
    });

    it('резолвит накопительные поля (read-modify-write)', () => {
        const select = buildDealListSelect(fullPortal());
        expect(select).toContain('UF_CRM_PRES_COUNT');
        expect(select).toContain('UF_CRM_OP_MHISTORY');
        expect(select).toContain('UF_CRM_OP_FAIL_COMMENTS');
    });

    it('резолвит deal-only поля «Хвоста» — источник снимка на pres-сделку', () => {
        const select = buildDealListSelect(fullPortal());
        for (const code of XVOST_DEAL_FIELD_CODES) {
            expect(select).toContain(`UF_CRM_${code.toUpperCase()}`);
        }
    });

    it('резолвит поля бэкфилла компании — источник значений со сделки', () => {
        const select = buildDealListSelect(fullPortal());
        // Явная фиксация кодов: их читает EventReportCompanyBackfillModel.
        expect(COMPANY_BACKFILL_CODES).toEqual([
            'op_sale_date_prognoz',
            'op_concurents',
            'op_concurents_multiple',
        ]);
        for (const code of COMPANY_BACKFILL_CODES) {
            expect(select).toContain(`UF_CRM_${code.toUpperCase()}`);
        }
    });

    it('резолвит поля состояния доработки и возражений (read-modify-write + причина)', () => {
        const select = buildDealListSelect(fullPortal());
        expect(DEAL_REFINE_FIELD_CODES).toEqual([
            'op_is_in_refine',
            'op_refined_at',
            'op_refined_reason',
            'op_objection_reason',
            'op_objection_comment',
        ]);
        for (const code of DEAL_REFINE_FIELD_CODES) {
            expect(select).toContain(`UF_CRM_${code.toUpperCase()}`);
        }
    });

    it('неустановленное поле молча пропускается (graceful)', () => {
        const select = buildDealListSelect(
            portalStub({ pres_count: 'PRES_COUNT' }),
        );
        expect(select).toContain('UF_CRM_PRES_COUNT');
        // Остальные коды не установлены — в select их нет, и мусора тоже.
        expect(select.some(key => key.includes('XVOST'))).toBe(false);
        expect(select.some(key => key === 'UF_CRM_undefined')).toBe(false);
    });

    it('не дублирует ключи', () => {
        const select = buildDealListSelect(fullPortal());
        expect(new Set(select).size).toBe(select.length);
    });
});
