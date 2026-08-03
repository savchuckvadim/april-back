import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PortalAiSettingsService } from './portal-ai-settings.service';
import {
    EMPTY_PORTAL_AI_SETTINGS,
    PortalAiSettingsRecord,
} from './portal-ai-settings.types';

const makeDeps = (options?: { portalDomain?: string | null }) => {
    const repository = {
        findByPortalId: jest.fn().mockResolvedValue(null),
        findByDomain: jest.fn().mockResolvedValue(null),
        findEnabled: jest.fn().mockResolvedValue([]),
        upsert: jest
            .fn()
            .mockImplementation(
                (_portalId: number, _domain: string, update: object) =>
                    Promise.resolve({
                        ...EMPTY_PORTAL_AI_SETTINGS,
                        ...update,
                    } as PortalAiSettingsRecord),
            ),
        touchLastScan: jest.fn().mockResolvedValue(undefined),
    };
    const portalRepository = {
        findById: jest
            .fn()
            .mockResolvedValue(
                options && 'portalDomain' in options
                    ? options.portalDomain === null
                        ? { id: 5, domain: null }
                        : { id: 5, domain: options.portalDomain }
                    : { id: 5, domain: 'gsr.bitrix24.ru' },
            ),
    };
    const service = new PortalAiSettingsService(
        repository as never,
        portalRepository as never,
    );
    return { service, repository, portalRepository };
};

describe('PortalAiSettingsService', () => {
    afterEach(() => jest.clearAllMocks());

    describe('get', () => {
        it('портал без настроек — null, это легальное состояние', async () => {
            const { service } = makeDeps();

            expect(await service.get(5)).toBeNull();
        });
    });

    describe('save', () => {
        it('домен подставляется из портала, а не приходит снаружи', async () => {
            const { service, repository } = makeDeps();

            await service.save(5, { minDurationSec: 60 });

            expect(repository.upsert).toHaveBeenCalledWith(
                5,
                'gsr.bitrix24.ru',
                { minDurationSec: 60 },
            );
        });

        it('несуществующий портал — 404 до записи настроек', async () => {
            const { service, repository } = makeDeps({ portalDomain: null });

            await expect(service.save(5, { enabled: true })).rejects.toThrow(
                NotFoundException,
            );
            expect(repository.upsert).not.toHaveBeenCalled();
        });

        it('явный null сбрасывает переопределение на глобальное', async () => {
            const { service, repository } = makeDeps();

            await service.save(5, { minDurationSec: null });

            expect(repository.upsert).toHaveBeenCalledWith(
                5,
                'gsr.bitrix24.ru',
                { minDurationSec: null },
            );
        });

        it('нулевой или отрицательный порог отклоняется', async () => {
            const { service } = makeDeps();

            await expect(service.save(5, { maxPerRun: 0 })).rejects.toThrow(
                BadRequestException,
            );
            await expect(
                service.save(5, { scanIntervalMinutes: -5 }),
            ).rejects.toThrow(BadRequestException);
        });

        it('час вне суток отклоняется', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(5, { nightStartHour: 24, nightEndHour: 6 }),
            ).rejects.toThrow(BadRequestException);
        });

        it('ночное окно задаётся только обеими границами', async () => {
            const { service } = makeDeps();

            await expect(
                service.save(5, { nightStartHour: 22 }),
            ).rejects.toThrow(BadRequestException);
        });

        it('ночное окно через полночь принимается', async () => {
            const { service, repository } = makeDeps();

            await service.save(5, { nightStartHour: 22, nightEndHour: 6 });

            expect(repository.upsert).toHaveBeenCalled();
        });

        it('очистка обеих границ окна принимается', async () => {
            const { service, repository } = makeDeps();

            await service.save(5, {
                nightStartHour: null,
                nightEndHour: null,
            });

            expect(repository.upsert).toHaveBeenCalled();
        });
    });

    describe('markScanned', () => {
        it('отмечает время скана для расчёта интервала портала', async () => {
            const { service, repository } = makeDeps();
            const moment = new Date('2026-08-01T09:30:00.000Z');

            await service.markScanned(5, moment);

            expect(repository.touchLastScan).toHaveBeenCalledWith(5, moment);
        });
    });
});
