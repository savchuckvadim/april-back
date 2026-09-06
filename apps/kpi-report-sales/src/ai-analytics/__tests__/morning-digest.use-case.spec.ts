import { MorningDigestUseCase } from '../domain/use-cases/morning-digest.use-case';
import {
    callsLoaderWith,
    liteRow,
    settingsLoaderWith,
} from './fixtures/lite-row.fixture';

/** Понедельник 07.09.2026 08:00 MSK → вчерашний рабочий день — пт 04.09. */
const NOW = new Date('2026-09-07T05:00:00Z');

const sections = (score: number, asWas: string, alternatives: string[]) => [
    { section: 'NEEDS', relevance: 1, score, asWas, alternatives },
];

describe('MorningDigestUseCase', () => {
    it('дайджест за вчерашний рабочий день по каждому менеджеру, только с alternatives', async () => {
        const rows = [
            liteRow({
                transcriptionId: 'a1',
                managerId: '10',
                callStartedAt: new Date('2026-09-04T07:00:00Z'),
                sections: sections(3, 'Как было', [
                    'Лучше так',
                    'Или так',
                    'Третий',
                    'Лишний',
                ]),
            }),
            liteRow({
                transcriptionId: 'a2',
                managerId: '10',
                callStartedAt: new Date('2026-09-04T09:00:00Z'),
                sections: sections(7, 'Нормально', ['Чуть лучше']),
            }),
            liteRow({
                transcriptionId: 'b1',
                managerId: '20',
                callStartedAt: new Date('2026-09-04T10:00:00Z'),
                sections: sections(2, 'Плохо', []), // без фраз — не берётся
            }),
            liteRow({
                transcriptionId: 'none',
                managerId: null,
                callStartedAt: new Date('2026-09-04T10:00:00Z'),
                sections: sections(2, 'Плохо', ['Фраза']),
            }),
        ];
        const { loader, loadLite } = callsLoaderWith(rows);
        const useCase = new MorningDigestUseCase(loader, settingsLoaderWith());

        const result = await useCase.execute('d', { now: NOW });

        expect(result.day).toBe('2026-09-04');
        expect(loadLite).toHaveBeenCalledWith(
            expect.objectContaining({
                from: '2026-09-03T21:00:00.000Z',
                to: '2026-09-04T20:59:59.999Z',
            }),
        );
        expect([...result.byManager.keys()]).toEqual(['10']);
        const items = result.byManager.get('10') ?? [];
        expect(items.map(item => item.transcriptionId)).toEqual(['a1', 'a2']);
        expect(items[0].alternatives).toEqual([
            'Лучше так',
            'Или так',
            'Третий',
        ]);
        expect(items[0].section).toBe('NEEDS');
    });

    it('праздник в календаре сдвигает «вчерашний рабочий день»', async () => {
        const { loader, loadLite } = callsLoaderWith([]);
        const useCase = new MorningDigestUseCase(
            loader,
            settingsLoaderWith({ holidays: ['2026-09-04'] }),
        );
        const result = await useCase.execute('d', { now: NOW });
        expect(result.day).toBe('2026-09-03');
        expect(result.byManager.size).toBe(0);
        expect(loadLite).toHaveBeenCalledTimes(1);
    });
});
