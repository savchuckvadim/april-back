/**
 * Элементы связей crm.*.contact.items.* / crm.contact.company.items.*.
 *
 * get возвращает полный элемент (SORT/ROLE_ID/IS_PRIMARY), set принимает
 * минимум идентификатор; остальные поля Битрикс заполняет сам.
 */
export interface IBXContactItem {
    CONTACT_ID: number | string;
    SORT?: number | string;
    ROLE_ID?: number | string;
    IS_PRIMARY?: 'Y' | 'N';
}

export interface IBXCompanyItem {
    COMPANY_ID: number | string;
    SORT?: number | string;
    ROLE_ID?: number | string;
    IS_PRIMARY?: 'Y' | 'N';
}
