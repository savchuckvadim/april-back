/**
 * Поля и воронки сделок для презентаций дня из слепка портала.
 *
 * UF-имена берутся через getDealFieldBitrixIdByCode (полное UF_CRM_…,
 * пустая строка — поле не установлено). Стадии воронки «ОП Презентации»
 * сопоставляются по суффиксу STAGE_ID (`C12:WON` → WON), а не через
 * типизированный getDealStageByCode: его карта для этой воронки содержит
 * чужие коды и стадии не находит.
 */
import type { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
import { PBX_SALES_KONSTRUCTOR_FIELD_CODES } from '@lib/portal-lib/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';
import { KPI_DIGEST_PRES_STAGE_BY_SUFFIX } from '../constants/digest.const';

export interface DigestStageInfo {
    code: string;
    name: string;
}

export interface DigestDealFields {
    /** ID воронки «ОП Презентации»; null — воронка не настроена. */
    presCategoryId: string | null;
    /** ID воронки «ОП Основная»; null — не настроена. */
    baseCategoryId: string | null;
    /** Суффикс STAGE_ID презентации → {code, name}. */
    presStages: Map<string, DigestStageInfo>;
    uf: {
        toBaseSales: string;
        nextPresPlanDate: string;
        lastPresPlanDate: string;
        lastPresDoneDate: string;
        opMhistory: string;
        complectName: string;
        xoCreated: string;
    };
}

type PortalModelLike = Pick<
    PortalModel,
    'getDealCategoryByCode' | 'getDealFieldBitrixIdByCode'
>;

/** Суффикс стадии: `C12:WON` → `WON`, `WON` → `WON`. */
export const stageSuffix = (stageId: string): string => {
    const index = stageId.lastIndexOf(':');
    return index >= 0 ? stageId.slice(index + 1) : stageId;
};

export function resolveDigestDealFields(
    portal: PortalModelLike,
): DigestDealFields {
    const pres = portal.getDealCategoryByCode(
        PbxDealCategoryCodeEnum.sales_presentation,
    );
    const base = portal.getDealCategoryByCode(
        PbxDealCategoryCodeEnum.sales_base,
    );
    const field = (code: string): string => {
        try {
            return portal.getDealFieldBitrixIdByCode(code) || '';
        } catch {
            return '';
        }
    };

    const presStages = new Map<string, DigestStageInfo>();
    for (const stage of pres?.stages ?? []) {
        const suffix = stageSuffix(String(stage.bitrixId ?? ''));
        if (!suffix) continue;
        presStages.set(suffix, {
            code:
                stage.code || KPI_DIGEST_PRES_STAGE_BY_SUFFIX[suffix] || suffix,
            name: stage.name || stage.title || suffix,
        });
    }
    // Стадии, которых нет в слепке, — из реестра (имя = код).
    for (const [suffix, code] of Object.entries(
        KPI_DIGEST_PRES_STAGE_BY_SUFFIX,
    )) {
        if (!presStages.has(suffix))
            presStages.set(suffix, { code, name: code });
    }

    const ev = PBX_SALES_EVENT_FIELD_CODES;
    return {
        presCategoryId: pres?.bitrixId ? String(pres.bitrixId) : null,
        baseCategoryId: base?.bitrixId ? String(base.bitrixId) : null,
        presStages,
        uf: {
            toBaseSales: field(ev.to_base_sales),
            nextPresPlanDate: field(ev.next_pres_plan_date),
            lastPresPlanDate: field(ev.last_pres_plan_date),
            lastPresDoneDate: field(ev.last_pres_done_date),
            opMhistory: field(ev.op_mhistory),
            complectName: field(
                PBX_SALES_KONSTRUCTOR_FIELD_CODES.complect_name,
            ),
            xoCreated: field(ev.xo_created),
        },
    };
}

/** select для сделок презентаций / продаж: системные поля + известные UF. */
export function digestDealSelect(fields: DigestDealFields): string[] {
    const uf = Object.values(fields.uf).filter(Boolean);
    return [
        'ID',
        'TITLE',
        'CATEGORY_ID',
        'STAGE_ID',
        'STAGE_SEMANTIC_ID',
        'ASSIGNED_BY_ID',
        'COMPANY_ID',
        'CONTACT_ID',
        'LEAD_ID',
        'DATE_CREATE',
        'MOVED_TIME',
        'CLOSEDATE',
        'OPPORTUNITY',
        ...new Set(uf),
    ];
}
