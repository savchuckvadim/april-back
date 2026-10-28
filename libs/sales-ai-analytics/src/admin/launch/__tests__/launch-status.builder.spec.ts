import { buildLaunchStatus } from '../launch-status.builder';
import { smartEnumGaps } from '../launch-status.blocks';
import {
    backfillRuns,
    backtest,
    completeSmart,
    DOMAIN,
    etlRun,
    launchInput,
    NOW,
} from './launch-status.fixture';

/**
 * Сборщик сводки «Запуск AI после выкладки»: состояние и текст каждого
 * блока по прочитанному, unknown у упавшего чтения без влияния на
 * остальные блоки.
 */
describe('buildLaunchStatus', () => {
    it('портал, где всё сделано, — все блоки done, тексты по-русски', () => {
        const status = buildLaunchStatus(launchInput());

        expect(status.domain).toBe(DOMAIN);
        expect(status.checkedAt).toBe(NOW.toISOString());
        expect(status.settings).toMatchObject({
            state: 'done',
            aiAnalyticsEnabled: true,
            callAnalysisEnabled: true,
            pilotSize: 2,
        });
        expect(status.settings.text).toContain('Пилот: 2 сотрудника');
        expect(status.smart).toMatchObject({
            state: 'done',
            installed: true,
            doorClosed: true,
            eventInvite: true,
            missingValues: [],
        });
        expect(status.pipeline).toMatchObject({
            state: 'done',
            backfillMonths: 24,
            backfillMonthsTarget: 24,
            backfillRunning: false,
        });
        expect(status.pipeline.lastNightly?.day).toBe('2026-10-20');
        expect(status.pipeline.lastMonthly?.day).toBe('2026-09-30');
        expect(status.forecast).toMatchObject({
            state: 'done',
            status: 'pass',
            stageEnabled: true,
            replayedMonths: 8,
        });
        expect(status.reanalysis.state).toBe('done');
        expect(status.reanalysis.run?.progressShare).toBe(1);
        expect(status.cost).toMatchObject({
            state: 'done',
            month: '2026-10',
            tokens: 1234567,
            price: 310.4,
            estimated: false,
        });
    });

    it('упавшее чтение — unknown с текстом ошибки только у своего блока', () => {
        const status = buildLaunchStatus(
            launchInput({
                smart: { ok: false, error: 'Bitrix недоступен' },
                cost: { ok: false, error: 'ais молчит' },
            }),
        );
        expect(status.smart.state).toBe('unknown');
        expect(status.smart.text).toContain('Bitrix недоступен');
        expect(status.smart.installed).toBeNull();
        expect(status.cost.state).toBe('unknown');
        expect(status.cost.tokens).toBeNull();
        expect(status.settings.state).toBe('done');
        expect(status.forecast.state).toBe('done');
    });

    it('аналитика выключена или разбор выключен — todo; пилот не задан — словами', () => {
        const status = buildLaunchStatus(
            launchInput({
                settings: {
                    ok: true,
                    value: { aiAnalyticsEnabled: false, modelParamsJson: '' },
                },
                portalAi: { ok: true, value: null },
            }),
        );
        expect(status.settings.state).toBe('todo');
        expect(status.settings.callAnalysisEnabled).toBeNull();
        expect(status.settings.pilotSize).toBeNull();
        expect(status.settings.text).toContain('Пилот не задан');

        const callsOff = buildLaunchStatus(
            launchInput({
                portalAi: {
                    ok: true,
                    value: { enabled: false, allowedUserIds: null },
                },
            }),
        );
        expect(callsOff.settings.state).toBe('todo');
        expect(callsOff.settings.text).toContain('Разбор звонков');
    });

    it('смарт без door_closed и event_invite — todo, недостающее списком; смарта нет — todo', () => {
        const smart = completeSmart();
        delete smart.enumItems.RISK_FLAGS.door_closed;
        delete smart.enumItems.CALL_TYPE.event_invite;
        const status = buildLaunchStatus(
            launchInput({ smart: { ok: true, value: smart } }),
        );
        expect(status.smart).toMatchObject({
            state: 'todo',
            installed: true,
            doorClosed: false,
            eventInvite: false,
        });
        expect(status.smart.missingValues).toEqual([
            'CALL_TYPE: event_invite',
            'RISK_FLAGS: door_closed',
        ]);

        const missing = buildLaunchStatus(
            launchInput({ smart: { ok: true, value: null } }),
        );
        expect(missing.smart).toMatchObject({
            state: 'todo',
            installed: false,
        });
        expect(missing.smart.text).toContain('«Обновить смарт»');
    });

    it('smartEnumGaps: поля нет совсем — код поля без значения', () => {
        const smart = completeSmart();
        delete smart.enumItems.SENTIMENT;
        delete smart.ufKeyByCode.SENTIMENT;
        expect(smartEnumGaps(smart)).toEqual(['SENTIMENT']);
    });

    it('догон: свежий и неполный — running, старый неполный — todo, не было — todo', () => {
        const fresh = buildLaunchStatus(
            launchInput({
                etlRuns: {
                    ok: true,
                    value: backfillRuns(10, '2026-10-21T08:30:00.000Z'),
                },
            }),
        );
        expect(fresh.pipeline).toMatchObject({
            state: 'running',
            backfillMonths: 10,
            backfillRunning: true,
            lastNightly: null,
        });
        expect(fresh.pipeline.text).toContain('по одному, от старых к свежим');
        expect(fresh.pipeline.text).toContain(
            'Восстановить прогноз по истории',
        );

        const stale = buildLaunchStatus(
            launchInput({
                etlRuns: {
                    ok: true,
                    value: backfillRuns(10, '2026-10-10T08:30:00.000Z'),
                },
            }),
        );
        expect(stale.pipeline.state).toBe('todo');
        expect(stale.pipeline.text).toContain('10 из 24');
        // Каких месяцев не хватает — владелец видит без чтения журнала
        // (gsr 28.10.2026: «18 из 24» без объяснения, каких).
        expect(stale.pipeline.text).toContain(
            'не хватает: 2025-08, 2025-09, 2025-10, 2025-11, 2025-12, 2026-01 и ещё 8',
        );

        const none = buildLaunchStatus(
            launchInput({ etlRuns: { ok: true, value: [etlRun({})] } }),
        );
        expect(none.pipeline).toMatchObject({
            state: 'todo',
            backfillMonths: 0,
        });
    });

    it('прогноз: pass без флага — todo с подсказкой включить; fail — причины словами', () => {
        const passOff = buildLaunchStatus(
            launchInput({
                settings: {
                    ok: true,
                    value: { aiAnalyticsEnabled: true, modelParamsJson: '{}' },
                },
            }),
        );
        expect(passOff.forecast).toMatchObject({
            state: 'todo',
            stageEnabled: false,
            status: 'pass',
        });
        expect(passOff.forecast.text).toContain('Показать прогноз в отчёте');

        const fail = buildLaunchStatus(
            launchInput({
                backtest: {
                    ok: true,
                    value: backtest({
                        status: 'fail',
                        reasons: ['coverage-below', 'новый-код'],
                    }),
                },
            }),
        );
        expect(fail.forecast.reasonTexts).toEqual([
            'факт попадает в вилку прогноза реже цели',
            'новый-код',
        ]);
        expect(fail.forecast.text).toContain('Проверка не пройдена');
    });

    it('прогноз: битый JSON настроек модели — флаг null и пояснение', () => {
        const status = buildLaunchStatus(
            launchInput({
                settings: {
                    ok: true,
                    value: {
                        aiAnalyticsEnabled: true,
                        modelParamsJson: '{oops',
                    },
                },
            }),
        );
        expect(status.forecast.stageEnabled).toBeNull();
        expect(status.forecast.state).toBe('todo');
        expect(status.forecast.text).toContain('не разбирается');
    });
});
