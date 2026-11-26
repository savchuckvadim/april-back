import { LONG_CALL_THRESHOLD_CHARS } from '../long-call.const';
import * as compactModule from '../long-call-compact.util';
import { isLongTranscript, splitTranscript } from '../long-call-split.util';
import { overlapCharsFor } from '../long-call-settings.util';
import {
    DOMAIN,
    MODE_ON,
    fakeRedis,
    isPartCall,
    makeLongCallService,
    spyOnServiceLog,
} from './long-call-input.service.fixture';
import { shortLinesTranscript } from './long-call-short-lines.fixture';

const { compactTranscript } = compactModule;

/**
 * LongCallInputService.prepare — уплотнение коротких строк перед порогом,
 * резкой и сборкой текстов. Шлюз и Redis — подставные.
 */

const PART_CHARS = 9_000;
const cut = (text: string) =>
    splitTranscript(text, {
        partChars: PART_CHARS,
        overlapChars: overlapCharsFor(PART_CHARS),
    });

/** До уплотнения длиннее порога, после — короче. */
const SHORT_SOURCE = shortLinesTranscript(1_000);
const SHORT_COMPACT = compactTranscript(SHORT_SOURCE);

/** Длинная и после уплотнения. */
const LONG_SOURCE = shortLinesTranscript(3_000);
const LONG_COMPACT = compactTranscript(LONG_SOURCE);

describe('LongCallInputService.prepare — уплотнение расшифровки', () => {
    beforeEach(() => {
        spyOnServiceLog();
    });
    afterEach(() => jest.restoreAllMocks());

    it('исходные расшифровки для проверок: короткая после уплотнения ниже порога, длинная выше', () => {
        expect(isLongTranscript(SHORT_SOURCE, LONG_CALL_THRESHOLD_CHARS)).toBe(
            true,
        );
        expect(isLongTranscript(SHORT_COMPACT, LONG_CALL_THRESHOLD_CHARS)).toBe(
            false,
        );
        expect(isLongTranscript(LONG_COMPACT, LONG_CALL_THRESHOLD_CHARS)).toBe(
            true,
        );
        expect(cut(LONG_COMPACT).length).toBeLessThan(cut(LONG_SOURCE).length);
    });

    it('до уплотнения длиннее порога, после — короче: null без запросов к модели', async () => {
        const { service, calls, gateway } = makeLongCallService({
            settings: MODE_ON,
        });

        const result = await service.prepare(DOMAIN, SHORT_SOURCE);

        expect(result).toBeNull();
        expect(calls).toHaveLength(0);
        expect(gateway.structuredCompletionWithUsage).not.toHaveBeenCalled();
    });

    it('и с force: порог действует по уплотнённому тексту', async () => {
        const { service, calls } = makeLongCallService();

        const result = await service.prepare(DOMAIN, SHORT_SOURCE, {
            force: true,
        });

        expect(result).toBeNull();
        expect(calls).toHaveLength(0);
    });

    it('длинная и после уплотнения: режется по уплотнённому тексту, части уходят к модели как нарезаны', async () => {
        const { service, calls } = makeLongCallService({ settings: MODE_ON });
        const expected = cut(LONG_COMPACT);

        const result = await service.prepare(DOMAIN, LONG_SOURCE);

        expect(result?.report.partsCount).toBe(expected.length);
        expect(result?.report.partsCount).toBeLessThan(cut(LONG_SOURCE).length);
        expect(
            calls
                .filter(isPartCall)
                .map(call => call.user.slice(call.user.indexOf('\n') + 1)),
        ).toEqual(expected.map(part => part.text));
        expect(calls).toHaveLength(expected.length + 1);
    });

    it('sourceChars — длина исходной расшифровки, transcriptChars — уплотнённой (оба без крайних пробелов)', async () => {
        const { service } = makeLongCallService({ settings: MODE_ON });

        const result = await service.prepare(DOMAIN, `\n  ${LONG_SOURCE}  \n`);

        expect(result?.sourceChars).toBe(LONG_SOURCE.trim().length);
        expect(result?.transcriptChars).toBe(LONG_COMPACT.trim().length);
        expect(result!.transcriptChars).toBeLessThan(result!.sourceChars);
    });

    it('оба числа в строке журнала', async () => {
        const log = spyOnServiceLog();
        const { service } = makeLongCallService({ settings: MODE_ON });

        await service.prepare(DOMAIN, LONG_SOURCE);

        const line = log.log.mock.calls.map(call => String(call[0]))[0];
        expect(line).toContain(
            `знаков: ${LONG_SOURCE.trim().length} → ${LONG_COMPACT.trim().length}`,
        );
    });

    it('дословные отрывки в текстах — из уплотнённой расшифровки', async () => {
        const { service } = makeLongCallService({ settings: MODE_ON });

        const result = await service.prepare(DOMAIN, LONG_SOURCE);

        const [firstLine] = LONG_COMPACT.split('\n');
        expect(result?.texts.whole).toContain(firstLine);
        expect(result?.texts.whole).not.toContain(
            LONG_SOURCE.split('\n').slice(0, 2).join('\n'),
        );
    });

    it('кэш работает как раньше: второй вызов без запросов к модели', async () => {
        const redis = fakeRedis();
        const { service, calls } = makeLongCallService({
            settings: MODE_ON,
            redis,
        });
        const requests = cut(LONG_COMPACT).length + 1;

        const first = await service.prepare(DOMAIN, LONG_SOURCE);
        expect(calls).toHaveLength(requests);

        const second = await service.prepare(DOMAIN, LONG_SOURCE);

        expect(calls).toHaveLength(requests);
        expect(second?.completions).toEqual([]);
        expect(second?.texts).toEqual(first?.texts);
        expect(second?.sourceChars).toBe(first?.sourceChars);
        expect(second?.transcriptChars).toBe(first?.transcriptChars);
    });

    it('режим выключен — уплотнение не запускается (лишней работы нет)', async () => {
        const compact = jest.spyOn(compactModule, 'compactTranscript');
        const { service } = makeLongCallService();

        expect(await service.prepare(DOMAIN, LONG_SOURCE)).toBeNull();
        expect(compact).not.toHaveBeenCalled();

        await service.prepare(DOMAIN, LONG_SOURCE, { force: true });
        expect(compact).toHaveBeenCalledTimes(1);
    });

    it('запись без меток времени: расшифровка не меняется, sourceChars равен transcriptChars', async () => {
        const settings = {
            ...MODE_ON,
            CALL_LONG_THRESHOLD_CHARS: '10000',
            CALL_LONG_PART_CHARS: '3000',
        };
        const plain = 'Это сказал менеджер. А это ответил клиент. '.repeat(400);
        const { service } = makeLongCallService({ settings });

        const result = await service.prepare(DOMAIN, plain);

        expect(result).not.toBeNull();
        expect(result?.sourceChars).toBe(plain.trim().length);
        expect(result?.transcriptChars).toBe(plain.trim().length);
    });
});
