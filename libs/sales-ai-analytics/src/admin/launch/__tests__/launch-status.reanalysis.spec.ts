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
});
