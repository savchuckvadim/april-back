import {
    EnumPortalAppCode,
    getPortalAppDefaults,
    PORTAL_APP_SETTINGS_SCHEMA,
} from '../portal-app-settings.schema';
import { resolveAppSettingGroup } from '../lib/app-setting-groups';
import {
    TRANSCRIPTION_CHUNKING_DEFAULTS,
    toTranscriptionChunking,
} from '../lib/transcription-chunking.const';

const SETTINGS = PORTAL_APP_SETTINGS_SCHEMA[EnumPortalAppCode.eventSales];

describe('резка длинных звонков: настройки event-sales', () => {
    it('ключи и значения по умолчанию: выключено, 5 минут, 3 куска одновременно', () => {
        expect(SETTINGS.callTranscriptionChunksEnabled).toMatchObject({
            code: 'call_transcription_chunks_enabled',
            type: 'boolean',
            default: false,
        });
        expect(SETTINGS.callTranscriptionChunkMinutes).toMatchObject({
            code: 'call_transcription_chunk_minutes',
            type: 'number',
            default: 5,
        });
        expect(SETTINGS.callTranscriptionChunkParallel).toMatchObject({
            code: 'call_transcription_chunk_parallel',
            type: 'number',
            default: 3,
        });
    });

    it('настройки в категории «Разборы звонков»', () => {
        for (const descriptor of [
            SETTINGS.callTranscriptionChunksEnabled,
            SETTINGS.callTranscriptionChunkMinutes,
            SETTINGS.callTranscriptionChunkParallel,
        ]) {
            expect(
                resolveAppSettingGroup(
                    EnumPortalAppCode.eventSales,
                    descriptor.code,
                ),
            ).toBe('call_analysis');
        }
    });

    it('без настроек и по умолчанию реестра — резка выключена, кусок 300 с, 3 одновременно', () => {
        const expected = { enabled: false, chunkSec: 300, parallel: 3 };
        expect(toTranscriptionChunking(null)).toEqual(expected);
        expect(
            toTranscriptionChunking(
                getPortalAppDefaults(EnumPortalAppCode.eventSales),
            ),
        ).toEqual(expected);
        expect(TRANSCRIPTION_CHUNKING_DEFAULTS.enabled).toBe(false);
    });

    it('длина куска — от 2 до 10 минут, за границами — ближайшая граница', () => {
        const chunkSec = (minutes: number): number =>
            toTranscriptionChunking({ callTranscriptionChunkMinutes: minutes })
                .chunkSec;
        expect(chunkSec(1)).toBe(120);
        expect(chunkSec(2)).toBe(120);
        expect(chunkSec(2.5)).toBe(150);
        expect(chunkSec(10)).toBe(600);
        expect(chunkSec(60)).toBe(600);
        expect(chunkSec(Number.NaN)).toBe(300);
    });

    it('кусков одновременно — от 1 до 6, целое число', () => {
        const parallel = (value: number): number =>
            toTranscriptionChunking({ callTranscriptionChunkParallel: value })
                .parallel;
        expect(parallel(0)).toBe(1);
        expect(parallel(-3)).toBe(1);
        expect(parallel(2.4)).toBe(2);
        expect(parallel(6)).toBe(6);
        expect(parallel(7)).toBe(6);
        expect(parallel(Number.POSITIVE_INFINITY)).toBe(3);
    });

    it('включено только явным «да»', () => {
        expect(
            toTranscriptionChunking({ callTranscriptionChunksEnabled: true })
                .enabled,
        ).toBe(true);
        expect(
            toTranscriptionChunking({ callTranscriptionChunksEnabled: false })
                .enabled,
        ).toBe(false);
    });
});
