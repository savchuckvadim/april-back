import type { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import { SettingsUseCase } from '../domain/use-cases/settings.use-case';
import {
    callsLoaderWith,
    liteRow,
    settingsLoaderWith,
} from './fixtures/lite-row.fixture';
import { transcriptionsWith } from './fixtures/transcriptions.fixture';

/**
 * settings/get отдаёт дату начала AI-разбора на портале (30.09.2026):
 * витрина по ней отличает «в этом периоде разбор ещё не шёл» от «звонки
 * сотрудника не попадают в разбор».
 */
const DOMAIN = 'garant.bitrix24.ru';
const NOW = new Date('2026-09-30T09:00:00Z');

/** Стор снапшотов без модели и снапшотов Фазы 4. */
const emptyStore = (): AiAnalyticsSnapshotStore =>
    ({
        findByKeys: jest.fn().mockResolvedValue([]),
        latest: jest.fn().mockResolvedValue(null),
    }) as unknown as AiAnalyticsSnapshotStore;

function run(first: Date | null | Error, timeZone = 'Europe/Moscow') {
    const transcriptions = transcriptionsWith(first);
    const useCase = new SettingsUseCase(
        callsLoaderWith([liteRow({ transcriptionId: 't-1' })]).loader,
        settingsLoaderWith({
            enabled: true,
            calendar: { timeZone, holidays: [], workweek: [1, 2, 3, 4, 5] },
        }),
        emptyStore(),
        transcriptions,
    );
    return { transcriptions, result: useCase.execute(DOMAIN, { now: NOW }) };
}

describe('SettingsUseCase: analysisSince', () => {
    it('день первого готового разбора — в часовом поясе портала', async () => {
        // 21.07 23:30 UTC — в Москве уже 22.07.
        const { transcriptions, result } = run(
            new Date('2026-07-21T21:30:00Z'),
        );
        const dto = await result;

        expect(transcriptions.findFirstDoneAt).toHaveBeenCalledWith(DOMAIN);
        expect(dto.analysisSince).toBe('2026-07-22');
    });

    it('тот же момент для портала в UTC — ещё 21.07', async () => {
        const dto = await run(new Date('2026-07-21T21:30:00Z'), 'UTC').result;

        expect(dto.analysisSince).toBe('2026-07-21');
    });

    it('готовых разборов нет — null', async () => {
        const dto = await run(null).result;

        expect(dto.analysisSince).toBeNull();
    });

    it('чтение упало — поля нет, остальные настройки отдаются', async () => {
        const dto = await run(new Error('db down')).result;

        expect(dto).not.toHaveProperty('analysisSince');
        expect(dto.enabled).toBe(true);
        expect(dto.readiness).toBeDefined();
    });
});
