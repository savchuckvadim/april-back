import { BitrixOwnerType, BitrixService } from '@/modules/bitrix';
import { ListProductRowDto } from '@/modules/bitrix/domain/crm/product-row/dto/list-product-row.sto';
import type { IDealReconcilePlan } from '../../usecases/ork-acts-reconcile-plan.use-case';
import { isSmartDealProductQtySyncEnabled } from './smart-deal-product-row.config';
import { coefficientFromDealMeasureName } from './utils/deal-product-coefficient.util';

export interface SmartDealProductRowServiceOptions {
    syncEnabled?: boolean;
}

/**
 * Изменение quantity в строках сделки по действиям reconcile (increase / decrease deal products).
 * Единицы измерения и коэффициент в названии не меняются — только quantity (одинаково по всем строкам).
 *
 * После успешного set — повторный list по сделке и обновление plan.item.rows / productQuantity / productCoefficient,
 * чтобы SmartProductRowService и расчёты шли от актуальных строк (как после закрытия акта в OrkOnActCloseUseCase).
 */
export class SmartDealProductRowService {
    private readonly syncEnabled: boolean;

    constructor(
        private readonly bitrix: BitrixService,
        options?: SmartDealProductRowServiceOptions,
    ) {
        this.syncEnabled =
            options?.syncEnabled ?? isSmartDealProductQtySyncEnabled();
    }

    /**
     * increase: qty под потолок min(месяцев договора, expectedClosed или actualClosed — см. reconcile);
     * decrease: qty под полный срок договора (productsSummary.expected).
     * При отсутствии изменений всё равно можно обновить снимок строк с Bitrix (опционально пропускаем лишний list).
     */
    async syncDealRowsQuantityFromPlanIfNeeded(
        plan: IDealReconcilePlan,
        dealId: number,
    ): Promise<void> {
        if (!this.syncEnabled) {
            return;
        }

        const actionTypes = new Set(plan.actions.map(a => a.type));
        const needQtyAdjust =
            actionTypes.has('increase_deal_products') ||
            actionTypes.has('decrease_deal_products');

        if (!needQtyAdjust) {
            return;
        }

        const item = plan.item;
        const contractMonths = plan.productsSummary.expected;
        const increaseCeiling =
            plan.actsSummury.actualClosed < plan.actsSummury.expectedClosed
                ? Math.min(contractMonths, plan.actsSummury.expectedClosed)
                : Math.min(contractMonths, plan.actsSummury.actualClosed);
        const expectedMonths = actionTypes.has('increase_deal_products')
            ? increaseCeiling
            : contractMonths;
        if (expectedMonths <= 0 || item.rows.length === 0) {
            return;
        }

        const coef =
            item.productCoefficient > 0
                ? item.productCoefficient
                : coefficientFromDealMeasureName(item.rows[0]?.measureName);

        const targetQty = Math.max(
            1,
            Math.ceil(expectedMonths / Math.max(coef, 1)),
        );

        const currentQty = Number(item.rows[0]?.quantity ?? 0);
        if (currentQty === targetQty) {
            await this.refreshDealRowsOnPlan(item, dealId);
            return;
        }

        const updatedRows = item.rows.map(row => ({
            ...row,
            quantity: targetQty,
        }));

        await this.bitrix.productRow.set({
            ownerType: BitrixOwnerType.DEAL,
            ownerId: dealId,
            productRows: updatedRows,
        });

        await this.refreshDealRowsOnPlan(item, dealId);
    }

    /** Подтянуть строки сделки из Bitrix в объект плана (после любого изменения rows в CRM). */
    async refreshDealRowsOnPlan(
        item: IDealReconcilePlan['item'],
        dealId: number,
    ): Promise<void> {
        const filter: ListProductRowDto = {
            '=ownerType': BitrixOwnerType.DEAL,
            '=ownerId': dealId,
        };
        const response = await this.bitrix.productRow.list(filter);
        const fresh = response?.result?.productRows ?? [];
        item.rows = fresh;
        item.productQuantity = Number(
            fresh[0]?.quantity ?? item.productQuantity,
        );
        item.productCoefficient = coefficientFromDealMeasureName(
            fresh[0]?.measureName,
        );
    }
}
