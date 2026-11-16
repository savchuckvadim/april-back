import {
    SEGMENTS_ALERT_INTERVAL_MS,
    TranscriptionSegmentsWatch,
} from '../provider/transcription-segments-watch';

const REPORT = {
    domain: 'gsirk.bitrix24.ru',
    stepName: 'Vibecode (bitrix/bitrixgpt-5.6-transcribe)',
    fileName: 'call-1.mp3',
};

function setup() {
    let now = 1_700_000_000_000;
    const warn = jest.fn();
    const watch = new TranscriptionSegmentsWatch({ warn }, () => now);
    return {
        watch,
        warn,
        advance: (ms: number) => {
            now += ms;
        },
    };
}

const telegramCalls = (warn: jest.Mock): number =>
    (warn.mock.calls as [string, { telegram?: boolean }][]).filter(
        ([, meta]) => meta.telegram === true,
    ).length;

describe('TranscriptionSegmentsWatch — текст без таймкодов', () => {
    it('первое сообщение уходит в телеграм и называет портал и распознаватель', () => {
        const { watch, warn } = setup();
        watch.report(REPORT);

        const [text, meta] = warn.mock.calls[0] as [
            string,
            Record<string, unknown>,
        ];
        expect(text).toContain('Распознавание без таймкодов');
        expect(text).toContain(REPORT.stepName);
        expect(text).toContain(REPORT.domain);
        expect(meta).toEqual({
            domain: REPORT.domain,
            fileName: REPORT.fileName,
            telegram: true,
        });
    });

    it('в течение часа повторы только в журнал, через час — снова в телеграм', () => {
        const { watch, warn, advance } = setup();
        watch.report(REPORT);
        advance(SEGMENTS_ALERT_INTERVAL_MS - 1);
        watch.report({ ...REPORT, fileName: 'call-2.mp3' });

        expect(warn).toHaveBeenCalledTimes(2);
        expect(telegramCalls(warn)).toBe(1);

        advance(1);
        watch.report({ ...REPORT, fileName: 'call-3.mp3' });
        expect(telegramCalls(warn)).toBe(2);
    });

    it('другой портал и другой распознаватель считаются отдельно', () => {
        const { watch, warn } = setup();
        watch.report(REPORT);
        watch.report({ ...REPORT, domain: 'gsr.bitrix24.ru' });
        watch.report({ ...REPORT, stepName: 'свой Whisper' });

        expect(telegramCalls(warn)).toBe(3);
    });
});
