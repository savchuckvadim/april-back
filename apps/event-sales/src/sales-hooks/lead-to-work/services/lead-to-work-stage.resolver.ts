import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { findPbxLeadStage } from '@lib/portal-lib/pbx-domain';
import { ILeadToWorkItem } from '../dto/lead-to-work.dto';

/** Итог резолва целевых стадий. Любое поле может отсутствовать — graceful. */
export interface LeadToWorkStagePlan {
    /** STAGE_ID сделки ОП (`C{cat}:{stage}`); нет — сделка в дефолтной стадии. */
    dealStageId?: string;
    /** CATEGORY_ID воронки ОП; нет — сделку создать нельзя (жёсткая ошибка). */
    dealCategoryId?: string;
    /** STAGE_ID ХО-сделки; нет при isXo — ХО-сделка в дефолтной стадии. */
    xoStageId?: string;
    xoCategoryId?: string;
    /** Плоский STATUS_ID лида; нет — статус лида не двигаем. */
    leadStatusId?: string;
    warnings: string[];
}

/** Код стадии ОП по умолчанию для stageMode='from_lead' без зеркала. */
const DEFAULT_FROM_LEAD_STAGE = 'sales_warm';
/** Стадия ОП для stageMode='cold' (как классический ХО). */
const COLD_BASE_STAGE = 'sales_cold';
/** Стадия ХО-сделки. */
const XO_PLAN_STAGE = 'cold_plan';

/**
 * Целевые стадии хука «лид → работа».
 *
 * GRACEFUL DEGRADATION (требование пользователя): алгоритм работает с ЛЮБЫМ
 * подмножеством сопоставленных стадий. «Есть в БД портала → используем;
 * нет → шаг пропускается + warning». Единственная жёсткая ошибка — нет
 * самой воронки ОП: тогда сделку создавать некуда.
 *
 * Правило CONVERTED (от смежного агента): статус сконвертированного лида
 * НЕ двигаем — Битрикс считает его закрытым, откат ломает его отчётность.
 */
export class LeadToWorkStageResolver {
    constructor(private readonly portal: PortalModel) {}

    resolve(
        item: ILeadToWorkItem,
        hasCompany: boolean,
        isLeadConverted: boolean,
    ): LeadToWorkStagePlan {
        const warnings: string[] = [];
        const plan: LeadToWorkStagePlan = { warnings };

        this.resolveDeal(item, plan, warnings);
        if (item.isXo === 'Y') {
            this.resolveXo(plan, warnings);
        }
        this.resolveLeadStatus(
            item,
            hasCompany,
            isLeadConverted,
            plan,
            warnings,
        );
        return plan;
    }

    private resolveDeal(
        item: ILeadToWorkItem,
        plan: LeadToWorkStagePlan,
        warnings: string[],
    ): void {
        const category = this.portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        if (!category) {
            // Не warning: без воронки ОП хук не имеет смысла — жёстко.
            throw new Error(
                'Воронка ОП Основная (sales_base) не сконфигурирована на портале — преобразование лида невозможно',
            );
        }
        plan.dealCategoryId = String(category.bitrixId);

        const stageCode = this.resolveDealStageCode(item, warnings);
        // Ищем стадию вручную по коду, не через CategoryToStageMap: типы
        // legacy-словаря отстают от реальной лестницы PBX_DEAL_SALES_BASE_STAGES.
        const stage = category.stages.find(st => st.code === stageCode);
        if (stage) {
            plan.dealStageId = `C${category.bitrixId}:${stage.bitrixId}`;
        } else {
            warnings.push(
                `Стадия сделки «${stageCode}» не сопоставлена на портале — сделка будет создана в дефолтной стадии воронки`,
            );
        }
    }

    private resolveDealStageCode(
        item: ILeadToWorkItem,
        warnings: string[],
    ): string {
        if (item.stageMode === 'cold') return COLD_BASE_STAGE;

        // from_lead: зеркало стадии лида (lead_pres → sales_pres и т.п.).
        const leadStageCode = this.portal.getLeadStageCodeByStatusId(
            this.currentLeadStatusId ?? '',
        );
        const template = leadStageCode
            ? findPbxLeadStage(leadStageCode)
            : undefined;
        if (template?.dealStageCode) return template.dealStageCode;

        if (leadStageCode) {
            warnings.push(
                `У стадии лида «${leadStageCode}» нет зеркала в воронке ОП — используется стадия по умолчанию «${DEFAULT_FROM_LEAD_STAGE}»`,
            );
        }
        return DEFAULT_FROM_LEAD_STAGE;
    }

    private resolveXo(plan: LeadToWorkStagePlan, warnings: string[]): void {
        const category = this.portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_xo,
        );
        if (!category) {
            warnings.push(
                'Воронка ХО (sales_xo) не сконфигурирована — ХО-сделка не будет создана',
            );
            return;
        }
        plan.xoCategoryId = String(category.bitrixId);
        const stage = category.stages.find(st => st.code === XO_PLAN_STAGE);
        if (stage) {
            plan.xoStageId = `C${category.bitrixId}:${stage.bitrixId}`;
        } else {
            warnings.push(
                `Стадия ХО «${XO_PLAN_STAGE}» не сопоставлена — ХО-сделка будет создана в дефолтной стадии`,
            );
        }
    }

    private resolveLeadStatus(
        item: ILeadToWorkItem,
        hasCompany: boolean,
        isLeadConverted: boolean,
        plan: LeadToWorkStagePlan,
        warnings: string[],
    ): void {
        if (isLeadConverted) {
            warnings.push(
                'Лид сконвертирован штатно (CONVERTED) — его статус не изменяется, только поля и история',
            );
            return;
        }

        // from_lead с зеркалом: лид остаётся в своей стадии (решение ТЗ).
        if (item.stageMode === 'from_lead') {
            const leadStageCode = this.portal.getLeadStageCodeByStatusId(
                this.currentLeadStatusId ?? '',
            );
            const template = leadStageCode
                ? findPbxLeadStage(leadStageCode)
                : undefined;
            if (template?.dealStageCode) return;
        }

        const targetCode = hasCompany
            ? 'lead_company_work'
            : 'lead_taken_in_work';
        const statusId = this.portal.getLeadStatusIdByCode(targetCode);
        if (statusId) {
            plan.leadStatusId = statusId;
        } else {
            warnings.push(
                `Стадия лида «${targetCode}» не установлена/не сопоставлена — статус лида не изменяется`,
            );
        }
    }

    /** Текущий STATUS_ID лида — проставляется вызывающим перед resolve(). */
    private currentLeadStatusId: string | null = null;

    withCurrentLeadStatus(statusId: string | null): this {
        this.currentLeadStatusId = statusId;
        return this;
    }
}
