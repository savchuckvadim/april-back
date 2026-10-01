import { AxiosInstance } from 'axios';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BatchApiService } from 'src/modules/bitrix/core/base/batch-api.service';
import { BitrixCore } from 'src/modules/bitrix/core/base/bitrix-core.service';
import { BxDealRepository } from '../repository/bx-deal.repository';

/**
 * `crm.deal.contact.add` — привязка ОДНОГО контакта без перезаписи набора
 * (CONTACT_IDS в update перезаписывает набор целиком, а list/get сделки
 * это поле не отдают — union «от текущих» там всегда пуст).
 */
describe('BxDealRepository.contactAdd', () => {
    it('batch-команда: crm.deal.contact.add c id сделки и полями привязки', () => {
        const addCmdBatchType = jest.fn();
        const repo = new BxDealRepository({
            addCmdBatchType,
        } as unknown as BitrixBaseApi);

        repo.contactAddBtch('ct_1', 42423, { CONTACT_ID: 288609 });

        expect(addCmdBatchType).toHaveBeenCalledWith(
            'ct_1',
            'crm',
            'deal',
            'contact.add',
            { id: 42423, fields: { CONTACT_ID: 288609 } },
        );
    });

    it('прямой вызов идёт тем же методом', async () => {
        const callType = jest.fn().mockResolvedValue({ result: true });
        const repo = new BxDealRepository({
            callType,
        } as unknown as BitrixBaseApi);

        await repo.contactAdd(7, { CONTACT_ID: '11', IS_PRIMARY: 'N' });

        expect(callType).toHaveBeenCalledWith('crm', 'deal', 'contact.add', {
            id: 7,
            fields: { CONTACT_ID: '11', IS_PRIMARY: 'N' },
        });
    });

    it('в очереди batch строка команды — crm.deal.contact.add?id=…&fields[CONTACT_ID]=…', () => {
        const batch = new BatchApiService(
            {} as unknown as BitrixCore,
            {} as unknown as AxiosInstance,
        );
        const repo = new BxDealRepository(batch as unknown as BitrixBaseApi);

        repo.contactAddBtch('ct_2', 42423, { CONTACT_ID: 288609 });

        expect(batch.getCmdBatch().ct_2).toBe(
            'crm.deal.contact.add?id=42423&fields[CONTACT_ID]=288609',
        );
    });
});
