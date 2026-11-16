import {
    formatRetestFinish,
    formatRetestProgress,
    formatRetestStart,
    RetestProgress,
    type RetestProgressState,
} from '../use-cases/call-report-retest.progress';

const DOMAIN = 'portal.bitrix24.ru';
const MIN = 60_000;

const state = (
    fields: Partial<RetestProgressState> = {},
): RetestProgressState => ({
    sampled: 120,
    pairs: 0,
    rerun: 0,
    failed: 0,
    elapsedMs: 0,
    ...fields,
});

function reporter() {
    const log = jest.fn();
    return { progress: new RetestProgress({ log }, DOMAIN), log };
}

const sent = (log: jest.Mock): string[] =>
    (log.mock.calls as [string, { telegram: boolean }][]).map(([text]) => text);

describe('проверка повторяемости оценок: сообщения о ходе', () => {
    it('старт: сколько звонков в выборке, сколько разбирать заново и лимит времени', () => {
        expect(formatRetestStart(DOMAIN, 50, 12, 45 * MIN)).toBe(
            '🧪 Проверка повторяемости оценок portal.bitrix24.ru: старт. ' +
                'В выборке 50 звонков, заново разобрать нужно 38 ' +
                '(12 уже повторены раньше). Лимит времени — 45 мин.',
        );
        expect(formatRetestStart(DOMAIN, 50, 0, 45 * MIN)).not.toContain(
            'уже повторены',
        );
    });

    it('ход: пары, заново разобрано, сбои и сколько прошло', () => {
        expect(
            formatRetestProgress(
                DOMAIN,
                state({ pairs: 50, rerun: 44, failed: 2, elapsedMs: 18 * MIN }),
            ),
        ).toBe(
            '🧪 Проверка повторяемости оценок portal.bitrix24.ru: готово пар ' +
                '50 из 120, заново разобрано 44, сбоев 2, прошло 18 мин.',
        );
    });

    it('итог: расхождение оценок и хватило ли времени', () => {
        const done = formatRetestFinish(DOMAIN, {
            ...state({
                pairs: 118,
                rerun: 100,
                failed: 2,
                elapsedMs: 40 * MIN,
            }),
            reused: 18,
            sigma: 0.617,
            timeBudgetHit: false,
        });
        expect(done).toContain('завершена за 40 мин');
        expect(done).toContain(
            'Пар 118 из 120: заново разобрано 100, из прошлых запусков 18, сбоев 2',
        );
        expect(done).toContain('0,62 балла по шкале 1–10');
        expect(done).toContain('Времени хватило на всю выборку.');

        const cut = formatRetestFinish(DOMAIN, {
            ...state({ pairs: 70, rerun: 70, failed: 5, elapsedMs: 45 * MIN }),
            reused: 0,
            sigma: 0.8,
            timeBudgetHit: true,
        });
        expect(cut).toContain(
            'Время вышло: остаток выборки (45) доберёт следующий запуск.',
        );
    });

    it('пар нет — так и сказано, без выдуманного числа', () => {
        expect(
            formatRetestFinish(DOMAIN, {
                ...state({ sampled: 3, failed: 3, elapsedMs: 2 * MIN }),
                reused: 0,
                sigma: null,
                timeBudgetHit: false,
            }),
        ).toContain('расхождение оценок не посчитано — пар нет');
    });

    it('сообщения уходят в телеграм: старт, по одному на каждые 50 пар и итог', () => {
        const { progress, log } = reporter();
        progress.start(120, 0, 45 * MIN);
        for (let pairs = 1; pairs <= 120; pairs += 1) {
            progress.tick(state({ pairs, rerun: pairs }));
        }
        progress.finish({
            ...state({ pairs: 120, rerun: 120 }),
            reused: 0,
            sigma: 0.5,
            timeBudgetHit: false,
        });

        const texts = sent(log);
        expect(texts).toHaveLength(4);
        expect(texts[0]).toContain('старт');
        expect(texts[1]).toContain('готово пар 50 из 120');
        expect(texts[2]).toContain('готово пар 100 из 120');
        expect(texts[3]).toContain('завершена');
        for (const [, meta] of log.mock.calls as [string, unknown][]) {
            expect(meta).toEqual({ telegram: true });
        }
    });

    it('граница в 50 пар, совпавшая с концом выборки, отдельным сообщением не идёт — её закрывает итог', () => {
        const { progress, log } = reporter();
        for (let pairs = 1; pairs <= 50; pairs += 1) {
            progress.tick(state({ sampled: 50, pairs }));
        }
        expect(log).not.toHaveBeenCalled();
    });

    it('сбой повтора не сдвигает счётчик пар — лишнего сообщения нет', () => {
        const { progress, log } = reporter();
        progress.tick(state({ pairs: 50 }));
        progress.tick(state({ pairs: 50, failed: 1 }));
        progress.tick(state({ pairs: 50, failed: 2 }));
        expect(log).toHaveBeenCalledTimes(1);
    });
});
