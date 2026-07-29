/**
 * ЖИВОЙ словарь элементов «Типа договора» (crm.deal.userfield.list).
 *
 * Портальная БД (bitrixfield_items) знает только элементы, поставленные
 * инсталляцией; типы, добавленные на портале руками («Интернет-версия»),
 * там отсутствуют — из-за чего заполненное поле показывалось как
 * «не задан». Живой список — истина; кэш час (SALES_FINANCE_DICT_TTL).
 *
 * code элемента: XML_ID (инсталляция пишет туда семантический код) либо
 * `bx_<ID>` для ручных элементов без XML_ID; name = VALUE.
 *
 * Итоговый словарь — merge с портальными items (mergeContractTypeItems):
 * семантические коды портала первичны (по-pbx-овски: bitrixId item-а =
 * значение в Битриксе), живой список даёт свежие имена и ручные элементы.
 *
 * НЕ @Injectable: per-request `new Svc(bitrix, cache, domain)`.
 */
import { BitrixService } from '@/modules/bitrix';
import { IFieldItem } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { SalesFinanceCacheService } from '../../cache/sales-finance-cache.service';
import { buildContractTypeDictKey } from '../../cache/cache-key.util';
import { SALES_FINANCE_DICT_TTL_SECONDS } from '../../constants/sales-finance.const';

export interface ContractTypeItem {
    /** Numeric id enum-элемента Bitrix. */
    id: number;
    /** Семантический код (XML_ID) либо bx_<ID> для ручных элементов. */
    code: string;
    /** Отображаемое название (VALUE). */
    name: string;
}

/** Префикс синтетического кода элементов без XML_ID. */
export const CONTRACT_TYPE_RAW_CODE_PREFIX = 'bx_';

interface BitrixEnumListItem {
    ID?: string | number;
    VALUE?: string;
    XML_ID?: string | null;
}

interface BitrixUserFieldRow {
    FIELD_NAME?: string;
    LIST?: BitrixEnumListItem[];
}

export class ContractTypeItemsService {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly cache: SalesFinanceCacheService,
        private readonly domain: string,
    ) {}

    /**
     * Словарь элементов; поле не настроено (пустой ufKey) → пустой список.
     * forceRefresh обходит кэш (пересчёт отчёта = свежий словарь).
     */
    async getItems(
        ufKey: string,
        forceRefresh = false,
    ): Promise<ContractTypeItem[]> {
        if (!ufKey) return [];
        const cacheKey = buildContractTypeDictKey(this.domain);
        if (!forceRefresh) {
            const cached =
                await this.cache.getJson<ContractTypeItem[]>(cacheKey);
            if (cached) return cached;
        }

        const response = (await this.bitrix.deal.getFieldsList({
            FIELD_NAME: ufKey,
        })) as { result?: BitrixUserFieldRow[] } | null;
        const field = (response?.result ?? []).find(
            row => row.FIELD_NAME === ufKey,
        );
        const items: ContractTypeItem[] = (field?.LIST ?? []).map(item => ({
            id: Number(item.ID),
            code:
                (item.XML_ID ?? '').trim() ||
                `${CONTRACT_TYPE_RAW_CODE_PREFIX}${Number(item.ID)}`,
            name: String(item.VALUE ?? ''),
        }));

        await this.cache.setJson(
            cacheKey,
            items,
            SALES_FINANCE_DICT_TTL_SECONDS,
        );
        return items;
    }

    /** Карта id → элемент (резолв UF-значения сделки). */
    static byId(
        items: ContractTypeItem[],
    ): ReadonlyMap<number, ContractTypeItem> {
        return new Map(items.map(item => [item.id, item]));
    }

    /** Карта code → элемент (резолв записи из UI). */
    static byCode(
        items: ContractTypeItem[],
    ): ReadonlyMap<string, ContractTypeItem> {
        return new Map(items.map(item => [item.code, item]));
    }
}

/**
 * Итоговый словарь типов договора: портальные items первичны (их `code` —
 * семантический, `bitrixId` — численное значение enum в Битриксе), живой
 * список даёт актуальные имена и элементы, добавленные на портале руками.
 */
export function mergeContractTypeItems(
    portalItems: IFieldItem[],
    liveItems: ContractTypeItem[],
): ContractTypeItem[] {
    const liveById = new Map(liveItems.map(item => [item.id, item]));
    const portalIds = new Set(portalItems.map(item => Number(item.bitrixId)));
    const merged: ContractTypeItem[] = portalItems.map(item => {
        const id = Number(item.bitrixId);
        return {
            id,
            code: item.code,
            name:
                liveById.get(id)?.name || item.name || item.title || item.code,
        };
    });
    for (const live of liveItems) {
        if (!portalIds.has(live.id)) merged.push(live);
    }
    return merged;
}
