import { buildLaunchStatus } from '../launch-status.builder';
import {
    forecastVerdictText,
    reanalysisProgress,
} from '../launch-status.forecast-blocks';
import {
    backtest,
    cost,
    launchInput,
    reanalysisRun,
} from './launch-status.fixture';

/**
 * Блоки сводки «переразбор» и «расход модели», доля сделанного и вердикт
 * проверки точности словами (он же — текст 409 у stage-flags).
 */
describe('buildLaunchStatus: переразбор и расход', () => {
    it('переразбор: не было — todo; подсчёт готов — todo с оценкой; идёт — running; остановился — todo', () => {
        const none = buildLaunchStatus(
            launchInput({ reanalysis: { ok: true, value: null } }),
        );
        expect(none.reanalysis).toMatchObject({
            state: 'todo',
            run: null,
            analysisSince: '2026-07-21',
        });

        const dry = buildLaunchStatus(
            launchInput({
                reanalysis: {
                    ok: true,
                    value: reanalysisRun({
                        dryRun: true,
                        finished: true,
                        done: 0,
                        estimate: {
                            basedOnRecords: 40,
                            avgTokens: 9000,
                            avgPrice: 2.5,
                            estimatedTokens: 3600000,
                            estimatedPrice: 1000,
                            message: 'оценка по 40 разборам',
                        },
                    }),
                },
            }),
        );
        expect(dry.reanalysis.state).toBe('todo');
        expect(dry.reanalysis.run?.estimatedPrice).toBe(1000);
        expect(dry.reanalysis.text).toContain('400 звонков');
        expect(dry.reanalysis.text).toContain('1 000 ₽');

        const running = buildLaunchStatus(
            launchInput({ reanalysis: { ok: true, value: reanalysisRun() } }),
        );
        expect(running.reanalysis.state).toBe('running');
        expect(running.reanalysis.run?.progressShare).toBe(0.25);
        expect(running.reanalysis.run?.stale).toBe(false);

        const stopped = buildLaunchStatus(
            launchInput({
                reanalysis: {
                    ok: true,
                    value: reanalysisRun({
                        updatedAt: '2026-10-21T07:00:00.000Z',
                        lastError: 'timeout',
                    }),
                },
            }),
        );
        expect(stopped.reanalysis.state).toBe('todo');
        expect(stopped.reanalysis.run?.stale).toBe(true);
        expect(stopped.reanalysis.text).toContain('timeout');
    });

    it('расход без колонок price — оценка по цене реестра', () => {
        const status = buildLaunchStatus(
            launchInput({
                cost: {
                    ok: true,
                    value: cost({
                        price: 0,
                        estimatedPrice: 120,
                        estimated: true,
                    }),
                },
            }),
        );
        expect(status.cost).toMatchObject({ price: 120, estimated: true });
        expect(status.cost.text).toContain('оценка');
    });
});

describe('reanalysisProgress', () => {
    it('первая часть — done / candidates; следующие — оценка снизу; конец — 1', () => {
        expect(reanalysisProgress(reanalysisRun())).toBe(0.25);
        expect(
            reanalysisProgress(
                reanalysisRun({ part: 2, done: 300, candidates: 100 }),
            ),
        ).toBe(0.75);
        expect(
            reanalysisProgress(reanalysisRun({ candidates: 0, done: 0 })),
        ).toBe(0);
        expect(reanalysisProgress(reanalysisRun({ finished: true }))).toBe(1);
    });
});

describe('forecastVerdictText', () => {
    it('нет проверки, мало данных, пройдено — разные тексты', () => {
        expect(forecastVerdictText(null)).toContain('ещё не было');
        expect(
            forecastVerdictText(
                backtest({
                    status: 'insufficient',
                    reasons: ['not-enough-months'],
                    shadowMonths: 4,
                }),
            ),
        ).toContain('Мало данных');
        expect(forecastVerdictText(backtest())).toContain('Проверка пройдена');
    });

    it('провал — простыми словами: без «вилки», «факта» и «середины», с месяцем и датой расчёта', () => {
        const text = forecastVerdictText(
            backtest({
                monthKey: '2026-10',
                generatedAt: '2026-11-02T01:00:00.000Z',
                status: 'fail',
                reasons: ['coverage-below', 'mase-mean3'],
                coverageShare: 0.52,
                coverageTarget: 0.8,
                maseNaive: 0.63,
                maseMean3: 0.76,
                maseMean3Ci90: [0.6, 1.08],
            }),
        );

        expect(text).toContain(
            'Прогноз пока не показываем: проверка не пройдена (по итогам октября 2026, посчитана 2 ноября 2026)',
        );
        expect(text).toContain(
            'итог месяца попадал в диапазон «от–до» в 52 % дней (нужно не меньше 80 %)',
        );
        expect(text).toContain(
            'ошибается на 37 % меньше, чем расчёт «по темпу»',
        );
        expect(text).toContain(
            'на 24 % меньше, чем расчёт «как в среднем за три прошлых месяца», но не стабильно: в неудачные кварталы истории — до 8 % хуже',
        );
        expect(text).toContain('Диапазон «от–до» узковат');
        expect(text).toContain('кнопками это не исправить');
        for (const jargon of ['вилк', 'факт ', 'середин']) {
            expect(text).not.toContain(jargon);
        }
    });

    it('прогноз хуже простого расчёта — показывать незачем; выигрыш неустойчив — ждать следующего месяца', () => {
        expect(
            forecastVerdictText(
                backtest({
                    status: 'fail',
                    reasons: ['mase-naive'],
                    maseNaive: 1.2,
                }),
            ),
        ).toContain('ошибается на 20 % больше');
        expect(
            forecastVerdictText(
                backtest({
                    status: 'fail',
                    reasons: ['mase-naive'],
                    maseNaive: 1.2,
                }),
            ),
        ).toContain('показывать незачем');

        const unstable = forecastVerdictText(
            backtest({
                status: 'fail',
                reasons: ['mase-naive'],
                coverageShare: 0.83,
                maseNaive: 0.85,
                maseNaiveCi90: [0.7, 1.04],
            }),
        );
        expect(unstable).toContain('ошибается на 15 % меньше');
        expect(unstable).toContain('до 4 % хуже');
        expect(unstable).toContain('после закрытия следующего месяца');
        expect(unstable).not.toContain('узковат');
    });
});
