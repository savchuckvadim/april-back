import { Injectable } from '@nestjs/common';
import { InitSupplyDto } from '../../dto/init-supply.dto';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { BitrixService, IBxRpaItem } from '@lib/bitrix';

@Injectable()
export class InitSupplyRpaCrmFieldsService {
    public async get(
        dto: InitSupplyDto,
        PortalModel: PortalModel,
        bitrix: BitrixService,
    ) {
        const companyFieldBitrixId = PortalModel.getRpaFieldBitrixIdByCode(
            'supply',
            'rpa_crm_company',
        );
        const baseDealFieldBitrixId = PortalModel.getRpaFieldBitrixIdByCode(
            'supply',
            'rpa_crm_base_deal',
        );
        const managerOpFieldBitrixId = PortalModel.getRpaFieldBitrixIdByCode(
            'supply',
            'manager_op',
        );
        const managerOsFieldBitrixId = PortalModel.getRpaFieldBitrixIdByCode(
            'supply',
            'manager_os',
        );
        const contactsFieldBitrixId = PortalModel.getRpaFieldBitrixIdByCode(
            'supply',
            'rpa_crm_contacts',
        );
        //TODO: добавить поле service_smart_id
        const serviceSmartIdFieldBitrixId =
            PortalModel.getRpaFieldBitrixIdByCode(
                'supply',
                'service_offer_smart',
            );
        const leadsFieldBitrixId = PortalModel.getRpaFieldBitrixIdByCode(
            'supply',
            'rpa_supply_lids',
        );
        const leadIds = await this.getCompanyLeadIds(dto, bitrix);

        return {
            ...(leadsFieldBitrixId && leadIds.length
                ? { [`${leadsFieldBitrixId}`]: leadIds }
                : {}),
            [`${companyFieldBitrixId}`]: dto.companyId,
            [`${baseDealFieldBitrixId}`]: dto.dealId,
            [`${managerOpFieldBitrixId}`]: dto.userId,
            [`${managerOsFieldBitrixId}`]: dto.userId,
            [`${contactsFieldBitrixId}`]: dto.bxContacts.map(
                contact => contact.ID,
            ),
            [`${serviceSmartIdFieldBitrixId}`]: dto.serviceSmartId,
        } as Partial<IBxRpaItem>;
    }

    /**
     * Лиды компании — в поле «Лиды поставки». Пустой список не отправляем,
     * чтобы не затирать то, что уже проставлено в заявке.
     */
    private async getCompanyLeadIds(
        dto: InitSupplyDto,
        bitrix: BitrixService,
    ): Promise<string[]> {
        if (!dto.companyId) {
            return [];
        }
        const leads = await bitrix.lead.all(
            { COMPANY_ID: String(dto.companyId) },
            ['ID'],
        );
        return leads.map(lead => String(lead.ID)).filter(Boolean);
    }
}
