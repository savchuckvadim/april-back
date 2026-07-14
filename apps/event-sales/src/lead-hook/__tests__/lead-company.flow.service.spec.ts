import { HttpException } from '@nestjs/common';
import { LeadCompanyFlowService } from '../services/lead-company.flow.service';

describe('LeadCompanyFlowService', () => {
    const createBitrixMock = () => ({
        lead: {
            get: jest.fn(),
            update: jest.fn().mockResolvedValue({ result: 1 }),
        },
        company: {
            set: jest.fn(),
            update: jest.fn().mockResolvedValue({ result: 1 }),
        },
    });

    it('использует существующую компанию лида и обновляет в ней LEAD_ID', async () => {
        const bitrix = createBitrixMock();
        bitrix.lead.get.mockResolvedValue({
            result: { ID: 10, TITLE: 'ООО Ромашка', COMPANY_ID: '55' },
        });
        const service = new LeadCompanyFlowService(bitrix as never);

        const result = await service.ensureCompanyForLead(10);

        expect(result.companyId).toBe(55);
        expect(result.companyCreated).toBe(false);
        expect(bitrix.company.update).toHaveBeenCalledWith(55, {
            LEAD_ID: 10,
        });
        expect(bitrix.company.set).not.toHaveBeenCalled();
    });

    it('создаёт компанию с TITLE лида, если у лида нет COMPANY_ID', async () => {
        const bitrix = createBitrixMock();
        bitrix.lead.get.mockResolvedValue({
            result: { ID: 10, TITLE: 'ООО Ромашка', COMPANY_ID: '' },
        });
        bitrix.company.set.mockResolvedValue({ result: 77 });
        const service = new LeadCompanyFlowService(bitrix as never);

        const result = await service.ensureCompanyForLead(10);

        expect(result.companyId).toBe(77);
        expect(result.companyCreated).toBe(true);
        expect(bitrix.company.set).toHaveBeenCalledWith({
            TITLE: 'ООО Ромашка',
            LEAD_ID: 10,
        });
        expect(bitrix.company.update).not.toHaveBeenCalled();
    });

    it('привязывает лид к компании через lead.update(COMPANY_ID)', async () => {
        const bitrix = createBitrixMock();
        bitrix.lead.get.mockResolvedValue({
            result: { ID: 10, TITLE: 'ООО Ромашка', COMPANY_ID: '' },
        });
        bitrix.company.set.mockResolvedValue({ result: 77 });
        const service = new LeadCompanyFlowService(bitrix as never);

        await service.ensureCompanyForLead(10);

        expect(bitrix.lead.update).toHaveBeenCalledWith(10, {
            COMPANY_ID: '77',
        });
    });

    it('бросает HttpException, если лид не найден', async () => {
        const bitrix = createBitrixMock();
        bitrix.lead.get.mockResolvedValue({ result: undefined });
        const service = new LeadCompanyFlowService(bitrix as never);

        await expect(service.ensureCompanyForLead(999)).rejects.toBeInstanceOf(
            HttpException,
        );
        expect(bitrix.lead.update).not.toHaveBeenCalled();
    });
});
