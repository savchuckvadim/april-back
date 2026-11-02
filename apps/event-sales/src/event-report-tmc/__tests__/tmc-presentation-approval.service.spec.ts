import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { AppCacheService } from '@lib/app-cache';
import { EventFlowStatusService } from '../../event-report/services/status/event-flow-status.service';
import { EventFlowJobData } from '../../event-report/dto/event-flow-job.dto';
import { TmcPresentationApprovalService } from '../services/tmc-presentation-approval.service';
import {
    TMC_APPROVAL_CACHE_APP,
    TMC_APPROVAL_MARKER_TTL_SECONDS,
} from '../constants/tmc-approval-cache.const';

/**
 * Ручка согласования: отчёт «запланирована презентация» уходит в ОБЫЧНУЮ
 * очередь отчётов со статусом операции; повтор возвращает статус первой
 * операции и в очередь не попадает. Повтор узнаётся по живому статусу (час)
 * и по долгой метке «принято» (30 дней), которую пишут робот и крон.
 */
const OPERATION_ID = 'tmc-approve-213065-187-202611151430';

const makeService = ({
    live = null as Record<string, unknown> | null,
    accepted = null as Record<string, unknown> | null,
    cacheSetFails = false,
} = {}) => {
    const dispatch = jest.fn(() => Promise.resolve());
    const setQueued = jest.fn((domain: string, operationId: string) =>
        Promise.resolve({ operationId, status: 'queued' }),
    );
    const get = jest.fn(() => Promise.resolve(live));
    const cacheGet = jest.fn(() => Promise.resolve(accepted));
    const cacheSet = jest.fn(() =>
        cacheSetFails
            ? Promise.reject(new Error('redis down'))
            : Promise.resolve({}),
    );
    const service = new TmcPresentationApprovalService(
        { dispatch } as unknown as QueueDispatcherService,
        { get, setQueued } as unknown as EventFlowStatusService,
        { get: cacheGet, set: cacheSet } as unknown as AppCacheService,
    );
    return { service, dispatch, setQueued, get, cacheGet, cacheSet };
};

const payload = {
    auth: { domain: 'gsr.bitrix24.ru' },
    tmcDealId: 213065,
    companyId: 48210,
    ownerId: 'user_1',
    managerId: 'user_187',
    tmcId: 'user_251',
    deadline: '15.11.2026 14:30:00',
    name: 'Демо СПС',
};

describe('TmcPresentationApprovalService', () => {
    it('ставит отчёт в очередь EVENT_SALES_FLOW с детерминированным id, статусом queued и долгой меткой «принято»', async () => {
        const { service, dispatch, setQueued, cacheSet } = makeService();

        const operation = await service.accept(payload);

        expect(operation).toEqual({
            operationId: OPERATION_ID,
            status: 'queued',
        });
        expect(setQueued).toHaveBeenCalledWith(
            'gsr.bitrix24.ru',
            OPERATION_ID,
            expect.any(String),
        );
        expect(dispatch).toHaveBeenCalledTimes(1);
        const [queue, job, data, jobId, opts] = dispatch.mock
            .calls[0] as unknown as [
            QueueNames,
            JobNames,
            EventFlowJobData,
            string,
            Record<string, unknown>,
        ];
        expect(queue).toBe(QueueNames.EVENT_SALES_FLOW);
        expect(job).toBe(JobNames.EVENT_SALES_FLOW);
        expect(jobId).toBe(OPERATION_ID);
        expect(opts).toEqual({ removeOnComplete: true, removeOnFail: true });
        expect(data.domain).toBe('gsr.bitrix24.ru');
        expect(data.operationId).toBe(jobId);
        expect(data.dto.tmcDealId).toBe(213065);
        expect(data.dto.plan.responsibility.ID).toBe(187);
        expect(data.dto.departament?.mode?.code).toBe('sales');
        // Метка пишется ПОСЛЕ постановки, по id операции, на 30 дней.
        expect(cacheSet).toHaveBeenCalledWith(
            expect.objectContaining({
                app: TMC_APPROVAL_CACHE_APP,
                domain: 'gsr.bitrix24.ru',
                key: `accepted:${OPERATION_ID}`,
                ttlSeconds: TMC_APPROVAL_MARKER_TTL_SECONDS,
                data: expect.objectContaining({ source: 'робот' }) as unknown,
            }),
        );
    });

    it('живой статус (не «упала») — возвращает его, в очередь не ставит', async () => {
        const live = { operationId: OPERATION_ID, status: 'done' };
        const { service, dispatch, setQueued, cacheSet } = makeService({
            live,
        });

        expect(await service.accept(payload)).toBe(live);
        expect(dispatch).not.toHaveBeenCalled();
        expect(setQueued).not.toHaveBeenCalled();
        expect(cacheSet).not.toHaveBeenCalled();
    });

    it('статус истёк, но метка «принято» есть — согласование не повторяется и для крона не ново', async () => {
        const accepted = {
            acceptedAt: '2026-11-01T10:00:00.000Z',
            source: 'робот',
        };
        const { service, dispatch } = makeService({ accepted });

        const fromRescue = await service.acceptFromRescue(payload);

        expect(fromRescue.isNew).toBe(false);
        expect(fromRescue.operation).toMatchObject({
            operationId: OPERATION_ID,
            status: 'done',
            queuedAt: '2026-11-01T10:00:00.000Z',
        });
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('живой статус «упала» — согласование повторяется, метка обновляется подстраховкой', async () => {
        const live = {
            operationId: OPERATION_ID,
            status: 'failed',
            error: 'Bitrix 500',
        };
        const accepted = {
            acceptedAt: '2026-11-02T09:00:00.000Z',
            source: 'робот',
        };
        const { service, dispatch, cacheSet } = makeService({ live, accepted });

        const fromRescue = await service.acceptFromRescue(payload);

        expect(fromRescue.isNew).toBe(true);
        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(cacheSet).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    source: 'подстраховка',
                }) as unknown,
            }),
        );
    });

    it('метка не записалась — согласование всё равно принято, без ошибки роботу', async () => {
        const { service, dispatch } = makeService({ cacheSetFails: true });

        await expect(service.accept(payload)).resolves.toMatchObject({
            status: 'queued',
        });
        expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it('lookup: живой статус перебивает метку, «упала» — повтор разрешён', async () => {
        const accepted = {
            acceptedAt: '2026-11-02T09:00:00.000Z',
            source: 'робот',
        };
        await expect(
            makeService({ accepted }).service.lookup(
                'gsr.bitrix24.ru',
                OPERATION_ID,
            ),
        ).resolves.toMatchObject({ alreadyAccepted: true });
        await expect(
            makeService({
                live: { status: 'failed' },
                accepted,
            }).service.lookup('gsr.bitrix24.ru', OPERATION_ID),
        ).resolves.toMatchObject({ alreadyAccepted: false });
        await expect(
            makeService().service.lookup('gsr.bitrix24.ru', OPERATION_ID),
        ).resolves.toEqual({
            live: null,
            accepted: null,
            alreadyAccepted: false,
        });
    });

    it('невалидные параметры — 400 до любой записи статуса', async () => {
        const { service, dispatch, setQueued, get } = makeService();

        await expect(
            service.accept({ ...payload, tmcDealId: undefined }),
        ).rejects.toThrow(/ТМЦ-сделка/);
        expect(get).not.toHaveBeenCalled();
        expect(setQueued).not.toHaveBeenCalled();
        expect(dispatch).not.toHaveBeenCalled();
    });
});
