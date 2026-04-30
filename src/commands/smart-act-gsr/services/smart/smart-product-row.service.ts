import { BitrixService, IBXProductRowRow } from '@/modules/bitrix';
import { PortalModel } from '@/modules/portal/services/portal.model';
import { ListProductRowDto } from '@/modules/bitrix/domain/crm/product-row/dto/list-product-row.sto';
import { isSmartActProductRowSyncEnabled } from './smart-product-row.config';
import {
    buildMonthlyProductRowsForSmart,
    effectiveDealMonthsFromFirstRow,
    monthlyProductRowsMatch,
} from './utils/deal-product-row-monthly.util';

export interface SmartProductRowServiceOptions {
    /** По умолчанию из env SMART_ACT_PRODUCT_ROWS_SYNC */
    syncEnabled?: boolean;
}

/**
 * Синхронизация товарных строк смарт-акта со строками сделки (доля на 1 месяц на акт).
 * Класс создаётся через `new`, как SmartActService — без отдельного провайдера Nest.
 */
export class SmartProductRowService {
    private readonly syncEnabled: boolean;

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portalModel: PortalModel,
        options?: SmartProductRowServiceOptions,
    ) {
        // Явный флаг в коде перекрывает env — удобно для тестов и поэтапного включения.
        this.syncEnabled =
            options?.syncEnabled ?? isSmartActProductRowSyncEnabled();
    }

    /**
     * Главный поток:
     * 1) Без флага или без строк сделки — выходим (ничего не делаем в Bitrix).
     * 2) Считаем effectiveMonths по первой строке сделки (quantity × коэф. из ед. измерения).
     * 3) Строим desired — строки с ownerType/ownerId смарта, цены поделены на месяцы, quantity = 1.
     * 4) Запрос list с фильтром ТОЛЬКО по смарт-элементу:
     *    '=ownerType': "DYNAMIC_{entityTypeId}" — тип владельца для CRM dynamic (не "D" как у сделки).
     *    '=ownerId': smartItemId — ID конкретного элемента смарт-процесса (акта).
     *    Так мы получаем уже привязанные к акту строки, а не строки сделки.
     * 5) Сравниваем existing с desired (имя, qty=1, цены, discountTypeId/discountRate/discountSum и т.д.).
     * 6) Если отличие есть — один вызов productRow.set с ownerType/ownerId смарта и массивом desired.
     */
    async syncDealRowsToSmartIfNeeded(
        dealProductRows: IBXProductRowRow[],
        smartItemId: number,
    ): Promise<void> {
        if (!this.syncEnabled || dealProductRows.length === 0) {
            return;
        }
        console.log(
            'syncDealRowsToSmartIfNeeded',
            dealProductRows,
            smartItemId,
        );

        const smartTypeId = this.getSmartActOwnerType(this.portalModel);
        const effectiveMonths = effectiveDealMonthsFromFirstRow(
            dealProductRows[0],
        );
        const desired = buildMonthlyProductRowsForSmart(
            dealProductRows,
            effectiveMonths,
            smartTypeId,
            smartItemId,
        );

        // Фильтр list: тот же ownerType/ownerId, что будут у строк после set — только смарт-акт.
        const filter: ListProductRowDto = {
            '=ownerType': smartTypeId,
            '=ownerId': smartItemId,
        };
        const listed = await this.bitrix.productRow.list(filter);
        const existing = listed?.result?.productRows as
            | IBXProductRowRow[]
            | undefined;

        if (monthlyProductRowsMatch(existing, desired)) {
            return;
        }

        // Тело set: владелец — смарт-элемент; каждая строка в productRows тоже с этим ownerType/ownerId.
        await this.bitrix.productRow.set({
            ownerType: smartTypeId,
            ownerId: smartItemId,
            productRows: desired,
        });
    }

    /** Строка типа владельца для dynamic CRM item в Bitrix24 (service_act). */
    private getSmartActOwnerType(portal: PortalModel): string {
        const targetSmart = portal.getSmartByType('service_act');
        const entityTypeId = targetSmart?.entityTypeId;
        return `DYNAMIC_${entityTypeId}`;
    }
}
