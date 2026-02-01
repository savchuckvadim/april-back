import { BitrixService, IBXContact, IBXDeal } from "@/modules/bitrix";
import { IBXLead } from "@/modules/bitrix/domain/interfaces/bitrix.interface";

export class CompanyRelationsService {

    constructor(
        private readonly bitrix: BitrixService
    ) { }

    /**
     * Получает все связанные ID (сделки, лиды, контакты) для компании
     */
    public async getRelationsIds(companyId: number, contactsIds?: number[]) {
        const dealsIds = await this.getCurrentDealIds(companyId);
        const leadsIds = await this.getCurrentLeadIds(companyId);

        // Если контакты не переданы, получаем их из компании
        if (!contactsIds || contactsIds.length === 0) {
            const contacts = await this.getContacts(companyId);
            contactsIds = contacts && contacts.length > 0 ? contacts
                .filter(contact => contact.ID)
                .map(contact => Number(contact.ID))
                : [];
        }

        return {
            dealsIds,
            leadsIds,
            contactsIds: contactsIds || []
        };
    }

    /**
     * Получает контакты компании
     * @param companyId - ID компании
     * @returns Массив контактов с полями: ID, NAME, SECOND_NAME, LAST_NAME, POST, COMMENTS, PHONE, HAS_PHONE
     */
    public async getContacts(companyId: number): Promise<IBXContact[]> {
        if (!companyId) {
            return [];
        }

        const filter: Partial<IBXContact> = {
            COMPANY_ID: companyId,
        };

        const select = ['ID', 'NAME', 'SECOND_NAME', 'LAST_NAME', 'POST', 'COMMENTS', 'PHONE', 'HAS_PHONE'];
        const order = { ID: 'DESC' as const };

        try {
            // Используем getList, хотя в репозитории он использует GET вместо LIST
            // Это может быть особенностью реализации, используем то что есть
            const response = await this.bitrix.contact.getList(filter, select);

            // Если response имеет структуру { result: [...] }, извлекаем result
            if (response && 'result' in response && Array.isArray(response.result)) {
                return response.result as IBXContact[];
            }

            // Если response уже массив
            if (Array.isArray(response)) {
                return response as IBXContact[];
            }

            return [];
        } catch (error) {
            console.error('Error getting contacts:', error);
            return [];
        }
    }

    /**
     * Получает ID всех сделок компании
     * @param companyId - ID компании
     * @returns Массив ID сделок
     */
    public async getCurrentDealIds(companyId: number): Promise<number[]> {
        if (!companyId) {
            return [];
        }

        const filter: Partial<IBXDeal> = {
            COMPANY_ID: String(companyId),
        };

        const select = ['ID'];
        const order = { ID: 'DESC' as const };

        try {
            const response = await this.bitrix.deal.getList(filter, select, order);

            // Извлекаем result из ответа
            const deals = response?.result || [];

            // Фильтруем и извлекаем ID
            const resultIds: number[] = [];
            if (Array.isArray(deals)) {
                for (const deal of deals) {
                    if (deal && deal.ID) {
                        resultIds.push(Number(deal.ID));
                    }
                }
            }

            return resultIds;
        } catch (error) {
            console.error('Error getting deal IDs:', error);
            return [];
        }
    }

    /**
     * Получает ID всех лидов компании
     * @param companyId - ID компании
     * @returns Массив ID лидов
     */
    public async getCurrentLeadIds(companyId: number): Promise<number[]> {
        if (!companyId) {
            return [];
        }

        const filter: Partial<IBXLead> = {
            COMPANY_ID: companyId,
        };

        const select = ['ID'];
        const order = { ID: 'DESC' as const };

        try {
            // Используем прямой вызов API через call, так как LEAD не входит в типизированную схему
            const response = await this.bitrix.api.call('crm.lead.list', {
                filter,
                select,
                order,
            });

            // Извлекаем result из ответа
            const leads = response?.result || [];

            // Фильтруем и извлекаем ID
            const resultIds: number[] = [];
            if (Array.isArray(leads)) {
                for (const lead of leads) {
                    if (lead && lead.ID) {
                        resultIds.push(Number(lead.ID));
                    }
                }
            }

            return resultIds;
        } catch (error) {
            console.error('Error getting lead IDs:', error);
            return [];
        }
    }
}
