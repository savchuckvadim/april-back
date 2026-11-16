import { BadRequestException } from '@nestjs/common';
import { DEAL_AUDIT_RUN_NOW_RETRY, JobNames, QueueNames } from '@lib/queue';
import {
    DEAL_AUDIT_RUN_NOW_MESSAGE,
    DealAuditRunNowAdminService,
} from '../services/deal-audit-run-now-admin.service';
import { DEAL_AUDIT_RUN_NOW_NOTE } from '../lib/deal-audit-run-now-notes';

const DOMAIN = 'example.bitrix24.ru';

const SETTINGS = {
    dealAuditEnabled: true,
    dealAuditDryRun: false,
    dealAuditDigestToManager: false,
    dealAuditDigestToHead: true,
    dealAuditDigestUserIds: '',
    dealAuditDigestDepartmentUserIds: '',
};

const setup = (
    existing: { state: string } | null = null,
    domain: string | null = DOMAIN,
) => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const findById = jest.fn().mockResolvedValue({ id: 7, domain });
    const resolve = jest.fn().mockResolvedValue(SETTINGS);
    const dispatch = jest.fn().mockResolvedValue({ id: `${DOMAIN}:run-now` });
    const getJob = jest.fn().mockResolvedValue(
        existing
            ? {
                  getState: jest.fn().mockResolvedValue(existing.state),
                  remove,
              }
            : null,
    );
    const service = new DealAuditRunNowAdminService(
        { findById } as never,
        { resolve } as never,
        { dispatch, getJob } as never,
    );
    return { service, dispatch, getJob, remove, resolve };
};

describe('DealAuditRunNowAdminService («Сформировать и отправить»)', () => {
    it('ставит один джоб на портал в очередь event-sales, с повторами без таймаута', async () => {
        const { service, dispatch } = setup();

        const result = await service.runNow(7);

        expect(result).toEqual({
            queued: true,
            domain: DOMAIN,
            message: DEAL_AUDIT_RUN_NOW_MESSAGE.queued,
            notes: [],
        });
        expect(dispatch).toHaveBeenCalledWith(
            QueueNames.EVENT_SALES_DEAL_AUDIT_RUN,
            JobNames.EVENT_SALES_DEAL_AUDIT_RUN_NOW,
            { domain: DOMAIN },
            `${DOMAIN}:run-now`,
            expect.objectContaining({
                attempts: DEAL_AUDIT_RUN_NOW_RETRY.attempts,
                backoff: {
                    type: 'fixed',
                    delay: DEAL_AUDIT_RUN_NOW_RETRY.backoffMs,
                },
                removeOnComplete: true,
                removeOnFail: true,
            }),
        );
        const [call] = dispatch.mock.calls as [
            [string, string, unknown, string, Record<string, unknown>],
        ];
        expect(call[4]).not.toHaveProperty('timeout');
    });

    it.each(['waiting', 'delayed', 'active'])(
        'прогон портала уже %s — второй не ставится (сводка не уйдёт дважды)',
        async state => {
            const { service, dispatch } = setup({ state });

            const result = await service.runNow(7);

            expect(result.queued).toBe(false);
            expect(result.message).toBe(
                DEAL_AUDIT_RUN_NOW_MESSAGE.alreadyQueued,
            );
            expect(dispatch).not.toHaveBeenCalled();
        },
    );

    it('завершённый остаток джоба снимается, новый прогон ставится', async () => {
        const { service, dispatch, remove } = setup({ state: 'completed' });

        const result = await service.runNow(7);

        expect(remove).toHaveBeenCalled();
        expect(result.queued).toBe(true);
        expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it('предупреждения по настройкам приходят вместе с ответом', async () => {
        const { service, resolve } = setup();
        resolve.mockResolvedValue({ ...SETTINGS, dealAuditDryRun: true });

        const result = await service.runNow(7);

        expect(result.notes).toEqual([DEAL_AUDIT_RUN_NOW_NOTE.dryRun]);
    });

    it('у портала нет домена — ошибка запроса, в очередь ничего не идёт', async () => {
        const { service, dispatch } = setup(null, null);

        await expect(service.runNow(7)).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(dispatch).not.toHaveBeenCalled();
    });
});
