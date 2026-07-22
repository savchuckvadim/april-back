import { IBXCategory } from '../../category/interface/bx-category.interface';
import { IBXStatus } from '../../status/interface/bx-status.interface';

/**
 * Смарт-тип из `crm.type.*`. У него ДВА идентификатора — НЕ путать:
 * `id` адресует поля (`userfieldconfig`, UF-имена), `entityTypeId` —
 * элементы (`crm.item.*`). Подробности — jsdoc самих полей.
 */
export interface IBXSmartType {
    /**
     * «Маленький» id типа (напр. 7; в PortalDB — `smarts.bitrixId`).
     *
     * ⚠️ ИМЕННО он — основа адресации ПОЛЕЙ смарта:
     * `userfieldconfig.*` → `entityId = CRM_{id}`, имена `UF_CRM_{id}_{CODE}`,
     * camel-ключи crm.item = `ufCrm{id}{Camel}`. Передашь entityTypeId —
     * Bitrix ответит «Вы не можете просматривать настройки…» как при
     * нехватке прав (боевой инцидент 2026-07-21).
     */
    id?: number;
    name: string;
    /**
     * «Большой» id (напр. 177/1056; в PortalDB — `smarts.entityTypeId`) —
     * ТОЛЬКО для `crm.item.*` и `crm.type.getSmartFull`.
     * Для `userfieldconfig`/UF-имён НЕ подходит — см. {@link id}.
     */
    entityTypeId: string;
    title: string;
    code: string;
    createdBy: number;

    customSectionId: number | null;
    isCategoriesEnabled: string;
    isStagesEnabled: string;
    isBeginCloseDatesEnabled: 'Y' | 'N';
    isClientEnabled: 'Y' | 'N';
    isUseInUserfieldEnabled: 'Y' | 'N';
    isLinkWithProductsEnabled: 'Y' | 'N';
    isMycompanyEnabled: 'Y' | 'N';
    isDocumentsEnabled: 'Y' | 'N';
    isSourceEnabled: 'Y' | 'N';
    isObserversEnabled: 'Y' | 'N';
    isRecyclebinEnabled: 'Y' | 'N';
    isAutomationEnabled: 'Y' | 'N';
    isBizProcEnabled: 'Y' | 'N';
    isSetOpenPermissions: 'Y' | 'N';
    isPaymentsEnabled: 'Y' | 'N';
    isCountersEnabled: 'Y' | 'N';
    createdTime: string;
    updatedTime: string;
    updatedBy: number;
}

export interface IBXFullCategory extends IBXCategory {
    stages: IBXStatus[];
}

export interface IBXSmartFullType extends IBXSmartType {
    categories: IBXFullCategory[];
}
