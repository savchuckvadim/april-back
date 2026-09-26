import {
    monthsBetween,
    resolveLevel,
    resolveTenure,
    type LevelPassport,
} from '../domain/presenter/level.util';
import type { AiManagerLevelRecord } from '../store/ai-analytics-settings.store';

/**
 * Уровень и стаж строки обзора тем же правилом, что у ночного конвейера
 * (`buildLevelFacts`): ручная запись РОПа → паспорт месячного снапшота →
 * дефолт по стажу. Раньше строка читала только ручные записи, и у всех
 * менеджеров было «стаж не задан» + дефолтный «Мидл».
 */
const UNTIL = '2026-09-20';

const passport = (overrides: Partial<LevelPassport> = {}): LevelPassport => ({
    since: '2025-03-01',
    sinceSource: 'employment',
    level: 'middle',
    levelSource: 'default',
    tenureMonths: 18,
    tenureBand: '18+',
    ...overrides,
});

const manual = (
    overrides: Partial<AiManagerLevelRecord> = {},
): AiManagerLevelRecord => ({
    managerId: 10,
    level: 'senior',
    since: null,
    ...overrides,
});

describe('resolveLevel: ручная запись РОПа', () => {
    it('ручной уровень побеждает паспорт; стаж — от since записи', () => {
        const resolved = resolveLevel(
            manual({ level: 'junior', since: '2026-05-01' }),
            UNTIL,
            passport({ level: 'senior', tenureBand: '18+' }),
        );

        expect(resolved).toEqual({
            level: 'junior',
            levelSource: 'manual',
            tenureMonths: 4,
            since: '2026-05-01',
            sinceSource: 'manual',
        });
    });

    it('у записи нет since — стаж и его источник берутся из паспорта', () => {
        const resolved = resolveLevel(
            manual({ level: 'senior' }),
            UNTIL,
            passport({ since: '2025-09-01', sinceSource: 'register' }),
        );

        expect(resolved).toEqual({
            level: 'senior',
            levelSource: 'manual',
            tenureMonths: 12,
            since: '2025-09-01',
            sinceSource: 'register',
        });
    });

    it('без паспорта — прежнее поведение: стаж только из записи', () => {
        expect(resolveLevel(manual(), UNTIL)).toEqual({
            level: 'senior',
            levelSource: 'manual',
            tenureMonths: null,
            since: null,
            sinceSource: null,
        });
    });
});

describe('resolveLevel: паспорт месячного снапшота', () => {
    it('нет ручной записи — уровень, стаж и дата из паспорта, источник passport', () => {
        const resolved = resolveLevel(
            undefined,
            UNTIL,
            passport({
                level: 'junior',
                tenureMonths: 3,
                tenureBand: '0-6',
                since: '2026-06-01',
                sinceSource: 'proxy',
            }),
        );

        expect(resolved).toEqual({
            level: 'junior',
            levelSource: 'passport',
            tenureMonths: 3,
            since: '2026-06-01',
            sinceSource: 'proxy',
        });
    });

    it('стажа в паспорте нет — считается от его даты до конца периода', () => {
        const resolved = resolveLevel(
            undefined,
            UNTIL,
            passport({ tenureMonths: null, since: '2025-09-01' }),
        );

        expect(resolved.levelSource).toBe('passport');
        expect(resolved.tenureMonths).toBe(12);
    });

    it('снимок нёс ручной уровень, а записи уже нет — подсказка полосы стажа', () => {
        const resolved = resolveLevel(
            undefined,
            UNTIL,
            passport({
                level: 'senior',
                levelSource: 'manual',
                tenureBand: '0-6',
                tenureMonths: 2,
            }),
        );

        expect(resolved.level).toBe('junior');
        expect(resolved.levelSource).toBe('passport');
    });

    it('снятый ручной уровень без полосы стажа — дефолт, а не старый уровень', () => {
        const resolved = resolveLevel(
            undefined,
            UNTIL,
            passport({
                level: 'senior',
                levelSource: 'manual',
                tenureBand: null,
                tenureMonths: null,
                since: null,
                sinceSource: null,
            }),
        );

        expect(resolved).toEqual({
            level: 'middle',
            levelSource: 'default',
            tenureMonths: null,
            since: null,
            sinceSource: null,
        });
    });

    it('незнакомый уровень паспорта — дефолт по дате паспорта', () => {
        const resolved = resolveLevel(
            undefined,
            UNTIL,
            passport({
                level: 'lead',
                since: '2026-06-01',
                tenureMonths: null,
            }),
        );

        expect(resolved).toMatchObject({
            level: 'junior',
            levelSource: 'default',
            tenureMonths: 3,
            since: '2026-06-01',
        });
    });
});

describe('resolveLevel: паспорт без стажа', () => {
    it('даты и полосы нет — «middle» паспорта это дефолт кода, метка default', () => {
        // buildPassport без даты: tenureBand null → levelByTenureBand(null).
        const resolved = resolveLevel(
            undefined,
            UNTIL,
            passport({
                level: 'middle',
                levelSource: 'default',
                since: null,
                sinceSource: null,
                tenureMonths: null,
                tenureBand: null,
            }),
        );

        expect(resolved).toEqual({
            level: 'middle',
            levelSource: 'default',
            tenureMonths: null,
            since: null,
            sinceSource: null,
        });
    });

    it('полоса стажа чужая — паспорт уровня не знает, дефолт по его дате', () => {
        const resolved = resolveLevel(
            undefined,
            UNTIL,
            passport({
                level: 'senior',
                tenureBand: '24+',
                since: '2026-06-01',
                tenureMonths: 3,
            }),
        );

        expect(resolved).toMatchObject({
            level: 'junior',
            levelSource: 'default',
            tenureMonths: 3,
            since: '2026-06-01',
            sinceSource: 'employment',
        });
    });
});

describe('resolveLevel: ни записи, ни паспорта', () => {
    it('дефолт middle, стажа и даты нет', () => {
        expect(resolveLevel(undefined, UNTIL)).toEqual({
            level: 'middle',
            levelSource: 'default',
            tenureMonths: null,
            since: null,
            sinceSource: null,
        });
        expect(resolveLevel(undefined, UNTIL, null).levelSource).toBe(
            'default',
        );
    });
});

describe('resolveTenure: источник даты стажа', () => {
    it('источник паспорта вне справочника — дата есть, источника нет', () => {
        expect(
            resolveTenure(
                undefined,
                passport({ sinceSource: 'date-register' }),
            ),
        ).toEqual({ since: '2025-03-01', sinceSource: null });
    });

    it('даты нет — нет и источника, даже если паспорт его назвал', () => {
        expect(
            resolveTenure(
                undefined,
                passport({ since: null, sinceSource: 'employment' }),
            ),
        ).toEqual({ since: null, sinceSource: null });
    });

    it.each(['employment', 'register', 'proxy'])(
        'источник паспорта %s доезжает как есть',
        source => {
            expect(
                resolveTenure(undefined, passport({ sinceSource: source }))
                    .sinceSource,
            ).toBe(source);
        },
    );
});

describe('monthsBetween', () => {
    it('полные месяцы; неполный не засчитывается; будущее — 0', () => {
        expect(monthsBetween('2026-03-15', '2026-09-14')).toBe(5);
        expect(monthsBetween('2026-03-15', '2026-09-15')).toBe(6);
        expect(monthsBetween('2026-10-01', '2026-09-15')).toBe(0);
    });
});
