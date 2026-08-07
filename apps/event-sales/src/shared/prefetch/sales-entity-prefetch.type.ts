import { IBXCompany, IBXContact, IBXDeal, IBXLead } from '@/modules/bitrix';

/** Тип CRM-сущности для префетча — плоские строки, как в PortalModel. */
export type SalesPrefetchEntityType = 'lead' | 'company' | 'deal' | 'contact';

/** Ссылка «тип + id» для batch-загрузки. */
export interface ISalesEntityRef {
    entityType: SalesPrefetchEntityType;
    entityId: number;
}

/** Результат префетча: сущности, разложенные по типам, с доступом по id. */
export interface ISalesPrefetchResult {
    leads: Map<number, IBXLead>;
    companies: Map<number, IBXCompany>;
    deals: Map<number, IBXDeal>;
    contacts: Map<number, IBXContact>;
}
