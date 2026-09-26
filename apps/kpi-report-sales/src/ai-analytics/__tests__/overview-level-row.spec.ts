import type { ManagerPassportFacts } from '../domain/assembler/manager-snapshot.types';
import { buildOverviewDto } from '../domain/presenter/overview.presenter';
import type { AiManagerLevelRecord } from '../store/ai-analytics-settings.store';
import {
    callsOf,
    OVERVIEW_NOW,
    overviewSources,
    twoManagersRows,
} from './fixtures/overview.fixture';

/**
 * Строка обзора берёт уровень и стаж из того же источника, что ночной
 * конвейер: без ручной записи — паспорт месячного снапшота
 * (`levelSource: 'passport'`, дата и её источник в `since`/`sinceSource`);
 * ручная запись всегда главнее; без снапшота — прежний дефолт. Плюс
 * счётчик разборов, отрезанных границей сопоставимости, в meta.
 */
const passport = (
    managerId: string,
    overrides: Partial<ManagerPassportFacts> = {},
): ManagerPassportFacts => ({
    managerId,
    since: '2026-05-04',
    sinceSource: 'employment',
    status: 'active',
    leftAt: null,
    level: 'junior',
    levelSource: 'default',
    tenureMonths: 4,
    tenureBand: '0-6',
    ...overrides,
});

const manualLevels = (
    ...records: AiManagerLevelRecord[]
): Map<number, AiManagerLevelRecord> =>
    new Map(records.map(record => [record.managerId, record]));

function rowsOf(
    passports: ReadonlyMap<string, ManagerPassportFacts> | undefined,
    levels = new Map<number, AiManagerLevelRecord>(),
) {
    const sources = overviewSources(twoManagersRows(), [10, 20, 30], {
        levels,
    });
    const dto = buildOverviewDto(
        passports === undefined ? sources : { ...sources, passports },
        OVERVIEW_NOW,
    );
    return new Map(dto.managers.map(row => [row.managerId, row]));
}

describe('Строка обзора: уровень и стаж из паспорта месяца', () => {
    it('нет ручной записи — уровень, стаж и дата из паспорта (passport)', () => {
        const rows = rowsOf(new Map([['20', passport('20')]]));

        expect(rows.get('20')).toMatchObject({
            level: 'junior',
            levelSource: 'passport',
            tenureMonths: 4,
            since: '2026-05-04',
            sinceSource: 'employment',
        });
    });

    it('ручная запись главнее паспорта; дата стажа без since — из паспорта', () => {
        const rows = rowsOf(
            new Map([
                ['10', passport('10', { sinceSource: 'register' })],
                ['20', passport('20')],
            ]),
            manualLevels(
                { managerId: 10, level: 'senior', since: null },
                { managerId: 20, level: 'middle', since: '2025-09-01' },
            ),
        );

        expect(rows.get('10')).toMatchObject({
            level: 'senior',
            levelSource: 'manual',
            since: '2026-05-04',
            sinceSource: 'register',
            tenureMonths: 4,
        });
        expect(rows.get('20')).toMatchObject({
            level: 'middle',
            levelSource: 'manual',
            since: '2025-09-01',
            sinceSource: 'manual',
            tenureMonths: 12,
        });
    });

    it('снапшота нет — прежний дефолт: middle, стаж не задан, полей даты нет', () => {
        const row = rowsOf(undefined).get('30');

        expect(row).toMatchObject({
            level: 'middle',
            levelSource: 'default',
            tenureMonths: null,
        });
        expect(row).not.toHaveProperty('since');
        expect(row).not.toHaveProperty('sinceSource');
    });

    it('паспорт есть у одного — остальные строки на дефолте', () => {
        const rows = rowsOf(new Map([['20', passport('20')]]));

        expect(rows.get('10')?.levelSource).toBe('default');
        expect(rows.get('30')?.levelSource).toBe('default');
    });

    it('стаж паспорта доезжает в строку как есть (от него — полоса норм)', () => {
        const rows = rowsOf(
            new Map([['20', passport('20', { tenureMonths: 20 })]]),
        );

        expect(rows.get('20')?.tenureMonths).toBe(20);
    });
});

describe('meta.excludedBeforeComparable', () => {
    it('разборы раньше comparableFrom считаются отдельно, а не пропадают', () => {
        // callsOf: 11.08…20.08; версия промпта от 15.08 рвёт ряд.
        const rows = [
            ...callsOf('10', 10),
            ...callsOf('20', 1, {
                transcriptionId: 'fresh',
                callStartedAt: new Date('2026-08-25T08:00:00Z'),
                versions: { prompt: 'focus-v3-2026-08-15' },
            }),
        ];
        const dto = buildOverviewDto(
            overviewSources(rows, [10, 20]),
            OVERVIEW_NOW,
        );

        expect(dto.comparableFrom).toBe('2026-08-15');
        // 11.08–14.08 — четыре разбора до границы.
        expect(dto.meta.excludedBeforeComparable).toBe(4);
        expect(dto.meta.analyzedCalls).toBe(7);
    });

    it('версий нет — граница пуста, исключённых ноль', () => {
        const dto = buildOverviewDto(
            overviewSources(twoManagersRows(), [10, 20]),
            OVERVIEW_NOW,
        );

        expect(dto.comparableFrom).toBe('');
        expect(dto.meta.excludedBeforeComparable).toBe(0);
    });
});
