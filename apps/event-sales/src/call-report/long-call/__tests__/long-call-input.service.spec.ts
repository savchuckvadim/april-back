import { CALL_LONG_SETTING_KEYS } from '@lib/vendor-settings';
import { LONG_CALL_CONSUMERS } from '../long-call-consumers.const';
import { LONG_CALL_MIN_PARTS } from '../long-call-service.const';
import { overlapCharsFor } from '../long-call-settings.util';
import { isLongTranscript, splitTranscript } from '../long-call-split.util';
import {
    DOMAIN,
    LONG_TRANSCRIPT,
    MODE_ON,
    defaultParts,
    isPartCall,
    makeLongCallService,
    spyOnServiceLog,
    transcriptOf,
} from './long-call-input.service.fixture';

/**
 * LongCallInputService.prepare — когда длинный путь применяется, откуда
 * берутся настройки. Шлюз и Redis — подставные.
 */
describe('LongCallInputService.prepare — режим, порог, настройки', () => {
    const parts = defaultParts(LONG_TRANSCRIPT);

    beforeEach(() => {
        spyOnServiceLog();
    });
    afterEach(() => jest.restoreAllMocks());

    it('расшифровка для проверок длинная: несколько частей при настройках по умолчанию', () => {
        expect(parts.length).toBeGreaterThanOrEqual(3);
    });

    it('режим выключен (по умолчанию) — null, к модели не ходили', async () => {
        const { service, calls } = makeLongCallService();

        expect(await service.prepare(DOMAIN, LONG_TRANSCRIPT)).toBeNull();
        expect(calls).toHaveLength(0);
    });

    it('режим выключен, но force — режет и разбирает', async () => {
        const { service, calls } = makeLongCallService();

        const result = await service.prepare(DOMAIN, LONG_TRANSCRIPT, {
            force: true,
        });

        expect(result).not.toBeNull();
        expect(result?.report.partsCount).toBe(parts.length);
        expect(calls).toHaveLength(parts.length + 1);
    });

    it('режим включён, но расшифровка короче порога — null без запросов', async () => {
        const { service, calls } = makeLongCallService({ settings: MODE_ON });

        expect(await service.prepare(DOMAIN, transcriptOf(5_000))).toBeNull();
        expect(calls).toHaveLength(0);
    });

    it('force не отменяет порог: короткая расшифровка — null', async () => {
        const { service, calls } = makeLongCallService();

        const result = await service.prepare(DOMAIN, transcriptOf(5_000), {
            force: true,
        });

        expect(result).toBeNull();
        expect(calls).toHaveLength(0);
    });

    it('режим включён, расшифровка длинная — тексты всем потребителям и сведения о подготовке', async () => {
        const { service } = makeLongCallService({ settings: MODE_ON });

        const result = await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(result).not.toBeNull();
        expect(Object.keys(result!.texts).sort()).toEqual(
            Object.keys(LONG_CALL_CONSUMERS).sort(),
        );
        for (const text of Object.values(result!.texts)) {
            expect(text).toContain('КОНСПЕКТ ПО ЧАСТЯМ');
        }
        expect(result!.report).toMatchObject({
            partsCount: parts.length,
            partsWithoutDigest: 0,
            hasSummary: true,
        });
        expect(result!.transcriptChars).toBe(LONG_TRANSCRIPT.trim().length);
        expect(result!.partChars).toBe(9_000);
    });

    it('порог и размер части берутся из настроек', async () => {
        const settings = {
            ...MODE_ON,
            CALL_LONG_THRESHOLD_CHARS: '10000',
            CALL_LONG_PART_CHARS: '3000',
        };
        const text = transcriptOf(12_000);
        const expectedParts = splitTranscript(text, {
            partChars: 3_000,
            overlapChars: overlapCharsFor(3_000),
        });
        const { service, calls } = makeLongCallService({ settings });

        const result = await service.prepare(DOMAIN, text);

        expect(result?.partChars).toBe(3_000);
        expect(result?.report.partsCount).toBe(expectedParts.length);
        expect(expectedParts.length).toBeGreaterThan(defaultParts(text).length);
        expect(calls.filter(isPartCall)).toHaveLength(expectedParts.length);
        // Каждая часть ушла к модели ровно в том виде, как её нарезали.
        expect(
            calls
                .filter(isPartCall)
                .map(call => call.user.slice(call.user.indexOf('\n') + 1)),
        ).toEqual(expectedParts.map(part => part.text));
    });

    it('те же 12 000 знаков при настройках по умолчанию — короче порога, null', async () => {
        const { service } = makeLongCallService({ settings: MODE_ON });

        expect(await service.prepare(DOMAIN, transcriptOf(12_000))).toBeNull();
    });

    it('мусор в настройках — значения по умолчанию', async () => {
        const settings = {
            CALL_LONG_PARTS_MODE: 'иногда',
            CALL_LONG_THRESHOLD_CHARS: 'много',
            CALL_LONG_PART_CHARS: '???',
        };
        const { service, calls } = makeLongCallService({ settings });

        // Режим — выключен (умолчание), поэтому без force путь не идёт.
        expect(await service.prepare(DOMAIN, LONG_TRANSCRIPT)).toBeNull();
        expect(calls).toHaveLength(0);

        const forced = await service.prepare(DOMAIN, LONG_TRANSCRIPT, {
            force: true,
        });
        expect(forced?.partChars).toBe(9_000);
        expect(forced?.report.partsCount).toBe(parts.length);
        // Порог — тоже умолчание: 12 000 знаков короче него.
        expect(
            await service.prepare(DOMAIN, transcriptOf(12_000), {
                force: true,
            }),
        ).toBeNull();
    });

    it('расшифровка уложилась в одну часть — null без запросов, строка в журнал', async () => {
        const log = spyOnServiceLog();
        const settings = {
            ...MODE_ON,
            CALL_LONG_THRESHOLD_CHARS: '10000',
            CALL_LONG_PART_CHARS: '20000',
        };
        const text = transcriptOf(12_000);
        expect(isLongTranscript(text, 10_000)).toBe(true);
        expect(
            splitTranscript(text, {
                partChars: 20_000,
                overlapChars: overlapCharsFor(20_000),
            }).length,
        ).toBeLessThan(LONG_CALL_MIN_PARTS);
        const { service, calls, gateway } = makeLongCallService({ settings });

        const result = await service.prepare(DOMAIN, text);

        expect(result).toBeNull();
        expect(calls).toHaveLength(0);
        expect(gateway.structuredCompletionWithUsage).not.toHaveBeenCalled();
        expect(log.log).toHaveBeenCalledWith(
            `Длинный разговор (${DOMAIN}): расшифровка уложилась в одну часть — разбор пойдёт по полной расшифровке`,
        );
        expect(LONG_CALL_MIN_PARTS).toBe(2);
    });

    it('число вне диапазона — ближайшая граница: порог не ниже 10 000, часть не меньше 3 000', async () => {
        const settings = {
            ...MODE_ON,
            CALL_LONG_THRESHOLD_CHARS: '5',
            CALL_LONG_PART_CHARS: '100',
        };
        const { service } = makeLongCallService({ settings });

        // Порог поднят до 10 000: 9 000 знаков — ещё не длинный разговор.
        expect(await service.prepare(DOMAIN, transcriptOf(9_000))).toBeNull();
        const result = await service.prepare(DOMAIN, transcriptOf(12_000));

        expect(result?.partChars).toBe(3_000);
        expect(result?.report.partsCount).toBeGreaterThan(1);
    });

    it('число вне диапазона — ближайшая граница: часть не больше 20 000', async () => {
        const settings = { ...MODE_ON, CALL_LONG_PART_CHARS: '999999' };
        const text = transcriptOf(45_000);
        const expectedParts = splitTranscript(text, {
            partChars: 20_000,
            overlapChars: overlapCharsFor(20_000),
        });
        const { service } = makeLongCallService({ settings });

        const result = await service.prepare(DOMAIN, text);

        expect(result?.partChars).toBe(20_000);
        expect(result?.report.partsCount).toBe(expectedParts.length);
    });

    it('три настройки читаются одним обращением', async () => {
        const { service, reader } = makeLongCallService({ settings: MODE_ON });

        await service.prepare(DOMAIN, transcriptOf(5_000));

        expect(reader.getMany).toHaveBeenCalledTimes(1);
        expect(reader.getMany).toHaveBeenCalledWith([
            ...CALL_LONG_SETTING_KEYS,
        ]);
    });

    it('читатель настроек упал — значения по умолчанию (режим выключен) и предупреждение', async () => {
        const log = spyOnServiceLog();
        const { service, calls } = makeLongCallService({ readerFails: true });

        expect(await service.prepare(DOMAIN, LONG_TRANSCRIPT)).toBeNull();
        expect(calls).toHaveLength(0);
        expect(log.warn).toHaveBeenCalledWith(
            expect.stringContaining(
                'Настройки длинных разговоров не прочитаны',
            ),
        );
    });
});
