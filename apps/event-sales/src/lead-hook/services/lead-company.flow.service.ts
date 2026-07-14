import { BitrixService, IBXLead } from '@/modules/bitrix';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';

export interface ILeadCompanyFlowResult {
    lead: IBXLead;
    companyId: number;
    companyCreated: boolean;
}

/**
 * Подготовка лида к холодному звонку (аналог легаси
 * FullEventFlowLeadController::cold до диспатча ColdBatchJob):
 *
 * 1. Получает лид по ID.
 * 2. Если у лида есть COMPANY_ID — обновляет компанию (LEAD_ID),
 *    иначе создаёт новую компанию с TITLE лида и LEAD_ID.
 * 3. Привязывает лид к компании (COMPANY_ID).
 *
 * Сервис НЕ injectable: инстанс Bitrix зависит от домена портала,
 * поэтому создаётся как new LeadCompanyFlowService(bitrix).
 */
export class LeadCompanyFlowService {
    private readonly logger = new Logger(LeadCompanyFlowService.name);

    constructor(private readonly bitrix: BitrixService) {}

    async ensureCompanyForLead(
        leadId: number,
    ): Promise<ILeadCompanyFlowResult> {
        const { result: lead } = await this.bitrix.lead.get(leadId);
        if (!lead) {
            throw new HttpException(
                `Lead ${leadId} not found`,
                HttpStatus.NOT_FOUND,
            );
        }

        const { companyId, companyCreated } = await this.ensureCompany(
            lead,
            leadId,
        );

        await this.bitrix.lead.update(leadId, {
            COMPANY_ID: String(companyId),
        });
        this.logger.log(
            `Lead ${leadId} linked to company ${companyId} ` +
                `(created=${companyCreated})`,
        );

        return { lead, companyId, companyCreated };
    }

    private async ensureCompany(
        lead: IBXLead,
        leadId: number,
    ): Promise<{ companyId: number; companyCreated: boolean }> {
        const leadCompanyId = Number(lead.COMPANY_ID);
        if (leadCompanyId > 0) {
            await this.bitrix.company.update(leadCompanyId, {
                LEAD_ID: leadId,
            });
            return { companyId: leadCompanyId, companyCreated: false };
        }

        const { result: newCompanyId } = await this.bitrix.company.set({
            TITLE: lead.TITLE,
            LEAD_ID: leadId,
        });
        return { companyId: Number(newCompanyId), companyCreated: true };
    }
}
