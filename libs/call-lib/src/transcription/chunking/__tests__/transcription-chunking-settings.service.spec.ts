import { Logger } from '@nestjs/common';
import {
    EnumPortalAppCode,
    getPortalAppDefaults,
    type PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import {
    TRANSCRIPTION_CHUNK_OVERLAP_SEC,
    TranscriptionChunkingSettingsService,
} from '../transcription-chunking-settings.service';

const DOMAIN = 'gsirk.bitrix24.ru';

const serviceWith = (
    resolve: PortalAppSettingsService['resolve'],
): TranscriptionChunkingSettingsService =>
    new TranscriptionChunkingSettingsService({
        resolve,
    } as unknown as PortalAppSettingsService);

describe('TranscriptionChunkingSettingsService', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    it('читает настройки event-sales портала и добавляет нахлёст', async () => {
        const resolve = jest.fn().mockResolvedValue({
            ...getPortalAppDefaults(EnumPortalAppCode.eventSales),
            callTranscriptionChunksEnabled: true,
            callTranscriptionChunkMinutes: 4,
            callTranscriptionChunkParallel: 2,
        });

        await expect(serviceWith(resolve).resolve(DOMAIN)).resolves.toEqual({
            enabled: true,
            chunkSec: 240,
            parallel: 2,
            overlapSec: TRANSCRIPTION_CHUNK_OVERLAP_SEC,
        });
        expect(resolve).toHaveBeenCalledWith(
            DOMAIN,
            EnumPortalAppCode.eventSales,
        );
    });

    it('настройки не прочитались — резка выключена, звонок идёт прежним путём', async () => {
        const resolve = jest.fn().mockRejectedValue(new Error('Redis down'));

        await expect(serviceWith(resolve).resolve(DOMAIN)).resolves.toEqual({
            enabled: false,
            chunkSec: 300,
            parallel: 3,
            overlapSec: TRANSCRIPTION_CHUNK_OVERLAP_SEC,
        });
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
