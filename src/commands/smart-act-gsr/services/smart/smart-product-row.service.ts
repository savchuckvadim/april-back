import {
    BitrixService,
    IBXProductRow,
    IBXProductRowRow,
} from '@/modules/bitrix';
import { PortalModel } from '@/modules/portal/services/portal.model';
import { ListProductRowDto } from '@/modules/bitrix/domain/crm/product-row/dto/list-product-row.sto';
import { isSmartActProductRowSyncEnabled } from './smart-product-row.config';
import {
    buildMonthlyProductRowsForSmart,
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
     * 2) Строим desired — по каждой строке сделки: месяцы покрытия = qty × коэф. из меры (6/12/24…);
     *    на акте цена за ед. = (цена_сделки × qty) / эти_месяцы, discountSum/месяцы, quantity = 1.
     * 3) Запрос list с фильтром ТОЛЬКО по смарт-элементу:
     *    '=ownerType': "DYNAMIC_{entityTypeId}" — тип владельца для CRM dynamic (не "D" как у сделки).
     *    '=ownerId': smartItemId — ID конкретного элемента смарт-процесса (акта).
     *    Так мы получаем уже привязанные к акту строки, а не строки сделки.
     * 4) Сравниваем existing с desired (имя, qty=1, цены, discountTypeId/discountRate/discountSum и т.д.).
     * 5) Если отличие есть — один вызов productRow.set с ownerType/ownerId смарта и массивом desired.
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

        const { crmId } = this.getSmartActOwnerType(this.portalModel);
        const desired = buildMonthlyProductRowsForSmart(
            dealProductRows,
            crmId,
            smartItemId,
        );

        // Фильтр list: тот же ownerType/ownerId, что будут у строк после set — только смарт-акт.
        const filter: ListProductRowDto = {
            '=ownerType': crmId, // T41_ для получения item.productrow.list нужен crmId смарта
            '=ownerId': smartItemId,
            '>price': 1,
        };
        console.log('filter', filter);
        const listed = await this.bitrix.productRow.list(filter);
        const existing = listed?.result?.productRows as
            | IBXProductRowRow[]
            | undefined;

        if (monthlyProductRowsMatch(existing, desired)) {
            return;
        }

        const setData = {
            ownerType: crmId,
            ownerId: smartItemId,
            productRows: desired,
        } as IBXProductRow;
        console.log('setData', setData);
        // Тело set: владелец — смарт-элемент; каждая строка в productRows тоже с этим ownerType/ownerId.
        await this.bitrix.productRow.set(setData);
    }

    /** Строка типа владельца для dynamic CRM item в Bitrix24 (service_act). */
    private getSmartActOwnerType(portal: PortalModel): {
        crmId: string;
        ownerType: string;
        entityTypeId: number;
    } {
        const targetSmart = portal.getSmartByType('service_act');
        if (!targetSmart) {
            throw new Error('Target smart not found');
        }
        console.log('targetSmart', targetSmart);
        const entityTypeId = targetSmart.entityTypeId;
        if (!entityTypeId) {
            throw new Error('Entity type ID not found');
        }
        const crmId = targetSmart.crm.endsWith('_')
            ? targetSmart.crm.slice(0, -1)
            : targetSmart.crm;
        return {
            crmId, // T41_
            ownerType: `DYNAMIC_${entityTypeId}`,
            entityTypeId, //1044
        };
    }
}
