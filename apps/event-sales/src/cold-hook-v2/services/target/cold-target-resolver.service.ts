import { Logger } from '@nestjs/common';
import { BitrixService, IBXCompany, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { prepareBatchResults } from '../../../shared';
import { EnumColdCallEntityType } from '../../dto/cold.dto';
import { IColdCallData } from '../../type/cold-hook-silence.interface';
import { PortalDealColdCategoryService } from '../enities/deal/portal-deal-cold-category.service';
import { dealLinkKey, toLinkedDealId } from '../../lib/deal-link-fields';
import { ColdTarget } from './cold-target.types';

export { toLinkedDealId };

const toId = (raw: unknown): number | null => {
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
};

/**
 * Цель холодного старта по хуку (шаг 2 плана v2).
 *
 * Заменяет `PreColdEntitiesFlowService` v1, который у входа-сделки брал
 * только `COMPANY_ID` и терял саму сделку: обработчик потом матчил хук по
 * `company.ID === entityId`, и для сделки матч всегда был пуст. Здесь цель
 * привязана к КЛЮЧУ хука, а сделка без компании становится корнем сама.
 *
 * Чтение — один батч на сделки и один на компании (get отдаёт все поля,
 * включая UF-ссылки, select не нужен). Не injectable: портал и bitrix
 * приходят снаружи, как у остальных сервисов модуля.
 */
export class ColdTargetResolverV2Service {
    private readonly logger = new Logger(ColdTargetResolverV2Service.name);
    private readonly categories: PortalDealColdCategoryService;

    constructor(
        private readonly portal: PortalModel,
        private readonly bitrix: BitrixService,
    ) {
        this.categories = new PortalDealColdCategoryService(portal);
    }

    async resolve(hooks: Record<string, IColdCallData>): Promise<ColdTarget[]> {
        const entries = Object.entries(hooks);

        const dealIds = this.uniqueIds(
            entries
                .filter(
                    ([, hook]) =>
                        hook.entityType === EnumColdCallEntityType.DEAL,
                )
                .map(([, hook]) => toId(hook.entityId)),
        );
        const deals = await this.load<IBXDeal>(
            EnumColdCallEntityType.DEAL,
            dealIds,
        );
        const dealById = new Map(deals.map(deal => [Number(deal.ID), deal]));

        const companyIds = this.uniqueIds([
            ...entries
                .filter(
                    ([, hook]) =>
                        hook.entityType === EnumColdCallEntityType.COMPANY,
                )
                .map(([, hook]) => toId(hook.entityId)),
            ...deals.map(deal => toId(deal.COMPANY_ID)),
        ]);
        const companies = await this.load<IBXCompany>(
            EnumColdCallEntityType.COMPANY,
            companyIds,
        );
        const companyById = new Map(
            companies.map(company => [Number(company.ID), company]),
        );

        const targets: ColdTarget[] = [];
        for (const [hookKey, hook] of entries) {
            const target = this.toTarget(hookKey, hook, dealById, companyById);
            if (target) targets.push(target);
        }
        return targets;
    }

    private toTarget(
        hookKey: string,
        hook: IColdCallData,
        dealById: Map<number, IBXDeal>,
        companyById: Map<number, IBXCompany>,
    ): ColdTarget | null {
        const entityId = toId(hook.entityId);
        if (hook.entityType === EnumColdCallEntityType.COMPANY) {
            const company = entityId ? companyById.get(entityId) : undefined;
            if (!company) {
                this.warnSkip(hookKey, hook, 'компания не прочитана');
                return null;
            }
            return {
                hookKey,
                hook,
                kind: 'company',
                company,
                companyId: Number(company.ID),
                entryDeal: null,
                rootDealId: null,
            };
        }
        if (hook.entityType === EnumColdCallEntityType.DEAL) {
            const deal = entityId ? dealById.get(entityId) : undefined;
            if (!deal) {
                this.warnSkip(hookKey, hook, 'сделка не прочитана');
                return null;
            }
            const companyId = toId(deal.COMPANY_ID);
            const company = companyId ? companyById.get(companyId) : undefined;
            if (companyId && !company) {
                // COMPANY_ID стоит, а компании нет (удалена) — корень сделка.
                this.logger.warn(
                    `[target] hook=${hookKey} deal=${deal.ID}: компания ${companyId} не прочитана — корень сделка`,
                );
            }
            return {
                hookKey,
                hook,
                kind: company ? 'company' : 'deal',
                company: company ?? null,
                companyId: company ? companyId : null,
                entryDeal: deal,
                rootDealId: this.resolveRootDealId(deal),
            };
        }
        // Контакт/лид холодным стартом v1 не обрабатывались — v2 пока тоже.
        this.warnSkip(
            hookKey,
            hook,
            `тип входа ${hook.entityType} не поддержан`,
        );
        return null;
    }

    /**
     * Корневая основная: сама входная, если стоит в воронке `sales_base`
     * (стоящая там сделка — корень по определению, даже если несёт
     * случайную ссылку `to_base_sales`); иначе — её ссылка. Поле берётся по
     * слепку портала, при его отсутствии — по канону install.
     */
    private resolveRootDealId(deal: IBXDeal): number | null {
        const base = this.categories.getBaseCategory();
        if (base && String(base.bitrixId) === String(deal.CATEGORY_ID)) {
            return Number(deal.ID);
        }
        const key = dealLinkKey(this.portal, 'to_base_sales');
        return toLinkedDealId(
            (deal as unknown as Record<string, unknown>)[key],
        );
    }

    private async load<T extends IBXCompany | IBXDeal>(
        entityType:
            | EnumColdCallEntityType.COMPANY
            | EnumColdCallEntityType.DEAL,
        ids: number[],
    ): Promise<T[]> {
        if (!ids.length) return [];
        for (const id of ids) {
            const key = `xo2_target_${this.bitrix.api.domain}_${entityType}_${id}`;
            this.bitrix.batch[entityType].get(key, id);
        }
        const result = await this.bitrix.api.callBatchWithConcurrency(1);
        return prepareBatchResults<T>(result);
    }

    private uniqueIds(ids: Array<number | null>): number[] {
        return [...new Set(ids.filter((id): id is number => id !== null))];
    }

    private warnSkip(hookKey: string, hook: IColdCallData, why: string): void {
        this.logger.warn(
            `[target] hook=${hookKey} ${hook.entityType}#${hook.entityId} пропущен: ${why}`,
        );
    }
}
