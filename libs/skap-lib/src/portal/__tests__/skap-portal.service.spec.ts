import { BadRequestException } from '@nestjs/common';
import { PortalAppSettingsService } from '@lib/portal-lib/store/app-settings';
import { PbxSkapSmartService } from '@lib/portal-lib/pbx/pbx-skap-smart';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import { SkapFileRepository } from '../../store/skap-file.repository';
import { SkapRunRepository } from '../../store/skap-run.repository';
import { SkapPortalService } from '../skap-portal.service';

describe('SkapPortalService', () => {
    const makeService = (opts?: {
        settings?: Record<string, unknown>;
        lastRun?: Record<string, unknown> | null;
        pendingFiles?: number;
        smartInfo?: { entityTypeId: number } | null;
    }) => {
        const resolve = jest.fn().mockResolvedValue({
            enabled: true,
            maxRunMinutes: 180,
            folderUrl: '',
            ...opts?.settings,
        });
        const dispatch = jest.fn().mockResolvedValue(undefined);
        const findLatestByDomain = jest
            .fn()
            .mockResolvedValue(opts?.lastRun ?? null);
        const countPendingByDomain = jest
            .fn()
            .mockResolvedValue(opts?.pendingFiles ?? 0);
        const resolveInfo = jest
            .fn()
            .mockResolvedValue(opts?.smartInfo ?? null);

        const service = new SkapPortalService(
            { resolve } as unknown as PortalAppSettingsService,
            { dispatch } as unknown as QueueDispatcherService,
            { findLatestByDomain } as unknown as SkapRunRepository,
            { countPendingByDomain } as unknown as SkapFileRepository,
            { resolveInfo } as unknown as PbxSkapSmartService,
        );
        return { service, resolve, dispatch, findLatestByDomain };
    };

    it('runNow: выключенный импорт — BadRequest, джоб не ставится', async () => {
        const { service, dispatch } = makeService({
            settings: { enabled: false },
        });

        await expect(service.runNow('x.bitrix24.ru')).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('runNow: ставит джоб с jobId={domain}:run и тайм-бюджетом', async () => {
        const { service, dispatch } = makeService({
            settings: { maxRunMinutes: 60 },
        });

        const result = await service.runNow('  x.bitrix24.ru  ');

        expect(result).toEqual({
            queued: true,
            jobId: 'x.bitrix24.ru:run',
        });
        expect(dispatch).toHaveBeenCalledWith(
            QueueNames.SKAP_IMPORT,
            JobNames.SKAP_IMPORT_RUN,
            { domain: 'x.bitrix24.ru' },
            'x.bitrix24.ru:run',
            {
                attempts: 1,
                timeout: (60 + 10) * 60_000,
                removeOnComplete: true,
                removeOnFail: true,
            },
        );
    });

    it('runNow/status: пустой домен — BadRequest', async () => {
        const { service } = makeService();

        await expect(service.runNow('   ')).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(service.status('')).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('status: прогонов не было — running=false, ссылки null', async () => {
        const { service } = makeService();

        const result = await service.status('x.bitrix24.ru');

        expect(result).toEqual({
            running: false,
            pendingFiles: 0,
            lastRun: null,
            folderUrl: null,
            smartUrl: null,
        });
    });

    it('status: установленный смарт — smartUrl на список элементов', async () => {
        const { service } = makeService({
            smartInfo: { entityTypeId: 183 },
        });

        const result = await service.status('x.bitrix24.ru');

        expect(result.smartUrl).toBe(
            'https://x.bitrix24.ru/crm/type/183/list/category/0/',
        );
    });

    it('status: идущий прогон — running=true, lastRun и folderUrl заполнены', async () => {
        const startedAt = new Date('2026-08-11T10:00:00.000Z');
        const { service } = makeService({
            settings: { folderUrl: 'https://x.bitrix24.ru/disk/skap/' },
            lastRun: {
                status: 'running',
                stats: { filesProcessed: 1 },
                startedAt,
                finishedAt: null,
            },
            pendingFiles: 3,
        });

        const result = await service.status('x.bitrix24.ru');

        expect(result).toMatchObject({
            running: true,
            pendingFiles: 3,
            folderUrl: 'https://x.bitrix24.ru/disk/skap/',
            lastRun: {
                status: 'running',
                stats: { filesProcessed: 1 },
                startedAt,
                finishedAt: null,
            },
        });
    });
});
