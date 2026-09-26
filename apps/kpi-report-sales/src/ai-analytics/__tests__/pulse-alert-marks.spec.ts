import { PulseUseCase } from '../domain/use-cases/pulse.use-case';
import type { AiAnalyticsFeedbackRecord } from '../store/ai-analytics-feedback.store';
import {
    callsLoaderWith,
    liteRow,
    settingsLoaderWith,
} from './fixtures/lite-row.fixture';

/**
 * «Отработано» в тот же день: окно пульса заканчивается вчерашним рабочим
 * днём, а отметку алерта руководитель ставит сегодня. Отметки читаются до
 * момента запроса — иначе handled появлялся бы только назавтра.
 */

/** Четверг 03.09.2026 13:00 MSK → окно чт 27.08 — ср 02.09. */
const NOW = new Date('2026-09-03T10:00:00Z');
/** Конец окна звонков: 02.09 23:59:59.999 MSK. */
const WINDOW_END = new Date('2026-09-02T20:59:59.999Z');

const mark = (
    kind: 'alert_sent' | 'alert_handled',
    transcriptionId: string,
    createdAt: Date,
): AiAnalyticsFeedbackRecord => ({
    id: `${kind}-${transcriptionId}`,
    createdAt,
    status: 'done',
    kind,
    object: `call:${transcriptionId}`,
    managerId: '10',
    transcriptionId,
    requesterUserId: kind === 'alert_handled' ? '447' : null,
    reason: null,
});

/** Стор, который честно режет записи по created_at ∈ [from; to]. */
function feedbackByPeriod(records: AiAnalyticsFeedbackRecord[]) {
    const listInPeriod = jest.fn((_domain: string, from: Date, to: Date) =>
        Promise.resolve(
            records.filter(
                record =>
                    record.createdAt.getTime() >= from.getTime() &&
                    record.createdAt.getTime() <= to.getTime(),
            ),
        ),
    );
    return { store: { listInPeriod } as never, listInPeriod };
}

const riskyCall = liteRow({
    transcriptionId: 'risk',
    riskFlags: ['promise'],
    callStartedAt: new Date('2026-09-01T07:00:00Z'),
});

describe('PulseUseCase: отметки алертов до момента запроса', () => {
    it('отметка «Отработано», поставленная сегодня, видна сразу', async () => {
        const feedback = feedbackByPeriod([
            mark('alert_handled', 'risk', new Date('2026-09-03T09:30:00Z')),
        ]);
        const useCase = new PulseUseCase(
            callsLoaderWith([riskyCall]).loader,
            settingsLoaderWith(),
            feedback.store,
        );

        const dto = await useCase.execute('d', { now: NOW });

        expect(dto.periodDate).toBe('2026-09-02');
        expect(
            dto.alerts.map(alert => [alert.transcriptionId, alert.handled]),
        ).toEqual([['risk', true]]);
        const [, , marksTo] = feedback.listInPeriod.mock.calls[0];
        expect(marksTo).toEqual(NOW);
    });

    it('окно звонков не расширяется: выборка звонков — до конца вчерашнего рабочего дня', async () => {
        const { loader, loadLite } = callsLoaderWith([riskyCall]);
        const useCase = new PulseUseCase(
            loader,
            settingsLoaderWith(),
            feedbackByPeriod([]).store,
        );

        const dto = await useCase.execute('d', { now: NOW });

        expect(loadLite).toHaveBeenCalledWith(
            expect.objectContaining({ to: WINDOW_END.toISOString() }),
        );
        expect(dto.window.to).toBe('2026-09-02');
        expect(dto.alerts[0].handled).toBe(false);
    });

    it('отметка позже момента запроса не учитывается', async () => {
        const feedback = feedbackByPeriod([
            mark('alert_handled', 'risk', new Date('2026-09-03T11:00:00Z')),
        ]);
        const useCase = new PulseUseCase(
            callsLoaderWith([riskyCall]).loader,
            settingsLoaderWith(),
            feedback.store,
        );

        const dto = await useCase.execute('d', { now: NOW });

        expect(dto.alerts[0].handled).toBe(false);
    });
});
