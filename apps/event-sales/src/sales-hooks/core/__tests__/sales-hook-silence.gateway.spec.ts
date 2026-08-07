import { SalesHookSilenceGateway } from '../services/sales-hook-silence.gateway';
import { EnumSalesHookCode } from '../constants/sales-hook-code.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';

describe('SalesHookSilenceGateway', () => {
    const makeGateway = () => {
        const handle = jest.fn().mockResolvedValue(undefined);
        const gateway = new SalesHookSilenceGateway({ handle } as never);
        return { gateway, handle };
    };

    it('строит keyPrefix формата SALES_HOOK_{code}_{domain}_{scope}', () => {
        const { gateway } = makeGateway();
        expect(
            gateway.keyPrefix(
                EnumSalesHookCode.LEAD_TO_WORK,
                'example.bitrix24.ru',
                '42',
            ),
        ).toBe('SALES_HOOK_lead-to-work_example_bitrix24_ru_42');
    });

    it('кладёт конверт в silence-менеджер с jobName своего хука', async () => {
        const { gateway, handle } = makeGateway();
        const envelope = { entityKey: 'lead:42', data: { leadId: 42 } };

        const keyPrefix = await gateway.accept(
            EnumSalesHookCode.LEAD_TO_WORK,
            'example.bitrix24.ru',
            '42',
            envelope,
        );

        expect(handle).toHaveBeenCalledWith({
            keyPrefix,
            data: envelope,
            jobName: JobNames.SALES_HOOK_LEAD_TO_WORK,
            domain: 'example.bitrix24.ru',
        });
    });
});
