import {
    AI_ANALYSIS_SERIES_START,
    comparableFromVersions,
} from '../contracts/versions.types';
import * as publicApi from '../index';
import {
    effectiveComparableFrom,
    isBeforeComparable,
    matrixComparability,
    rowVersionsDate,
} from '../model/comparable-row';
import { buildManagerTypeMatrix } from '../model/manager-type-matrix';
import type { MatrixCallRow } from '../model/matrix.types';
import { FIXTURE_VERSIONS, liteRow } from './lite-row.fixture';

/**
 * Гипотетические версии ПО СУЩЕСТВУ (записи в таблице серий нет): дата
 * серии = дата в строке — на них проверяется само правило разрыва.
 */
const V_OLD = { ...FIXTURE_VERSIONS, prompt: 'focus-v8.0-2026-09-08' };
const V_NEW = { ...FIXTURE_VERSIONS, prompt: 'focus-v9.0-2026-09-25' };
/** Дата выхода гипотетической новой версии — граница периода с её разборами. */
const NEW_FROM = '2026-09-25';
/**
 * Реальные версии промпта: вся накопленная история — одна серия от
 * 25.06.2026 (решение владельца 20.10.2026), v2.4 — минорная правка.
 */
const V21 = { ...FIXTURE_VERSIONS, prompt: 'focus-v2.1-2026-09-05' };
const V23 = { ...FIXTURE_VERSIONS, prompt: 'focus-v2.3-2026-09-25' };
const V24 = { ...FIXTURE_VERSIONS, prompt: 'focus-v2.4-2026-10-20' };
const SETTINGS_BREAK = '2026-09-20';

/** Разбор звонка дня `day` (12:00 МСК) набором версий `versions`. */
const reviewed = (
    transcriptionId: string,
    day: string,
    versions: Record<string, string> | null,
): MatrixCallRow =>
    liteRow({
        transcriptionId,
        callStartedAt: new Date(`${day}T12:00:00+03:00`),
        versions,
    });

/** Граница периода по версиям — как у обзора: max дат серий версий строк. */
const periodBoundary = (rows: readonly MatrixCallRow[]): string =>
    rows.reduce((max, row) => {
        const date = row.versions ? comparableFromVersions(row.versions) : '';
        return date > max ? date : max;
    }, '');

/** Августовские звонки с 10.08 подряд, разобранные старой версией по существу. */
const augustOld = (count: number): MatrixCallRow[] =>
    Array.from({ length: count }, (_, index) =>
        reviewed(
            `a${index + 1}`,
            `2026-08-${String(10 + index).padStart(2, '0')}`,
            V_OLD,
        ),
    );

describe('rowVersionsDate — дата собственного набора версий разбора', () => {
    it('max дат серий по полям versions — та же функция, что граница периода', () => {
        expect(rowVersionsDate({ versions: V_NEW })).toBe(NEW_FROM);
        expect(rowVersionsDate({ versions: V_OLD })).toBe('2026-09-08');
        // Атрибуция 24.08 и классификатор 05.09 записаны в таблицы серий
        // полей, поэтому дату реальной v2.1 выше 25.06 не поднимают.
        expect(rowVersionsDate({ versions: FIXTURE_VERSIONS })).toBe(
            AI_ANALYSIS_SERIES_START,
        );
    });

    it('реальные версии v2.1, v2.3 и минорная v2.4 — одна серия от 25.06', () => {
        for (const versions of [V21, V23, V24]) {
            expect(rowVersionsDate({ versions })).toBe(
                AI_ANALYSIS_SERIES_START,
            );
        }
    });

    it('нет versions или дат в них — null', () => {
        expect(rowVersionsDate({ versions: null })).toBeNull();
        expect(
            rowVersionsDate({
                versions: { prompt: 'focus-v3', rubric: 'sections-7-v1' },
            }),
        ).toBeNull();
    });
});

describe('matrixComparability — границы из опций матрицы', () => {
    it('прежний comparableFrom — граница версий; comparableVersionFrom главнее; пустая строка — границы нет', () => {
        expect(matrixComparability({ comparableFrom: NEW_FROM })).toEqual({
            versionFrom: NEW_FROM,
            seriesBreakFrom: null,
            timeZone: 'Europe/Moscow',
        });
        expect(
            matrixComparability({
                comparableFrom: '2026-09-08',
                comparableVersionFrom: NEW_FROM,
                seriesBreakFrom: SETTINGS_BREAK,
                timeZone: 'UTC',
            }),
        ).toEqual({
            versionFrom: NEW_FROM,
            seriesBreakFrom: SETTINGS_BREAK,
            timeZone: 'UTC',
        });
        expect(
            matrixComparability({ comparableFrom: '', seriesBreakFrom: '' }),
        ).toEqual({
            versionFrom: null,
            seriesBreakFrom: null,
            timeZone: 'Europe/Moscow',
        });
    });

    it('действующая граница — поздняя из двух; нет обеих — null', () => {
        const of = (
            versionFrom: string | null,
            seriesBreakFrom: string | null,
        ) =>
            effectiveComparableFrom({
                versionFrom,
                seriesBreakFrom,
                timeZone: 'UTC',
            });
        expect(of(NEW_FROM, SETTINGS_BREAK)).toBe(NEW_FROM);
        expect(of('2026-09-08', SETTINGS_BREAK)).toBe(SETTINGS_BREAK);
        expect(of(null, SETTINGS_BREAK)).toBe(SETTINGS_BREAK);
        expect(of(NEW_FROM, null)).toBe(NEW_FROM);
        expect(of(null, null)).toBeNull();
    });

    it('правило доступно из публичного API библиотеки', () => {
        expect(publicApi.isBeforeComparable).toBe(isBeforeComparable);
        expect(publicApi.rowVersionsDate).toBe(rowVersionsDate);
    });
});

describe('Сравнимость по версии разбора', () => {
    it('звонок до даты новой версии, разобранный новой версией, — сравним', () => {
        const tail = reviewed('tail', '2026-09-24', V_NEW);
        const matrix = buildManagerTypeMatrix([tail], {
            comparableFrom: NEW_FROM,
        });

        expect(matrix.analyzed).toBe(1);
        expect(matrix.excluded.beforeComparable).toBe(0);
        expect(
            isBeforeComparable(
                tail,
                matrixComparability({ comparableFrom: NEW_FROM }),
            ),
        ).toBe(false);
    });

    it('звонок после даты, но разобранный старой версией, — не сравним', () => {
        const matrix = buildManagerTypeMatrix(
            [reviewed('stale', '2026-09-26', V_OLD)],
            { comparableFrom: NEW_FROM },
        );

        expect(matrix.analyzed).toBe(0);
        expect(matrix.managers[0]).toEqual(
            expect.objectContaining({ n: 0, nBeforeComparable: 1 }),
        );
    });

    it('период из одних старых разборов даёт свою дату сравнимости — в оценке все разборы', () => {
        const august = augustOld(9);
        const boundary = periodBoundary(august);
        const matrix = buildManagerTypeMatrix(august, {
            comparableFrom: boundary,
        });

        expect(boundary).toBe('2026-09-08');
        expect(matrix.analyzed).toBe(9);
        expect(matrix.excluded.beforeComparable).toBe(0);
        expect(matrix.managers[0].byType[0].score.value).not.toBeNull();
        // прежнее правило (день звонка против границы) опустошало период
        expect(
            buildManagerTypeMatrix(august, { seriesBreakFrom: boundary })
                .analyzed,
        ).toBe(0);
    });

    it('один переразобранный новой версией звонок не опустошает период', () => {
        const period = [...augustOld(8), reviewed('re', '2026-08-15', V_NEW)];
        const boundary = periodBoundary(period);
        const matrix = buildManagerTypeMatrix(period, {
            comparableFrom: boundary,
        });

        expect(boundary).toBe(NEW_FROM);
        expect(matrix.analyzed).toBe(1);
        expect(matrix.managers[0].byType[0]).toEqual(
            expect.objectContaining({ n: 1, nBeforeComparable: 8 }),
        );
        // прежнее правило: все звонки периода раньше 25.09 → «разборов нет»
        expect(
            buildManagerTypeMatrix(period, { seriesBreakFrom: boundary })
                .analyzed,
        ).toBe(0);
    });

    /**
     * Серии сравнимости (решения владельца 19–20.10.2026): вся накопленная
     * история — одна серия, минорная правка промпта ряд не рвёт — разборы
     * v2.1, v2.3 и v2.4 в одной матрице сравнимы, граница периода — 25.06.
     */
    it('реальные разборы v2.1, v2.3 и минорной v2.4 сравнимы вместе, граница — начало общей серии', () => {
        const rows = [
            reviewed('jul', '2026-07-25', V21),
            reviewed('old', '2026-10-01', V23),
            reviewed('new', '2026-10-21', V24),
        ];
        const boundary = periodBoundary(rows);
        const matrix = buildManagerTypeMatrix(rows, {
            comparableFrom: boundary,
        });

        expect(boundary).toBe(AI_ANALYSIS_SERIES_START);
        expect(matrix.analyzed).toBe(3);
        expect(matrix.excluded.beforeComparable).toBe(0);
        expect(matrix.comparableFrom).toBe(AI_ANALYSIS_SERIES_START);
    });

    it('строка с версиями и без даты звонка судится по версии', () => {
        const undated = liteRow({
            transcriptionId: 'u',
            callStartedAt: null,
            versions: V_NEW,
        });

        expect(
            buildManagerTypeMatrix([undated], { comparableFrom: NEW_FROM })
                .analyzed,
        ).toBe(1);
    });
});

describe('Строки без версий — прежнее поведение', () => {
    it('без versions или без дат в них — по дню звонка; без даты звонка — до границы', () => {
        const matrix = buildManagerTypeMatrix(
            [
                reviewed('old', '2026-09-20', null),
                reviewed('new', '2026-09-26', null),
                reviewed('no-dates', '2026-09-20', {
                    prompt: 'focus-v3',
                    rubric: 'sections-7-v1',
                }),
                liteRow({
                    transcriptionId: 'nd',
                    callStartedAt: null,
                    versions: null,
                }),
            ],
            { comparableFrom: NEW_FROM },
        );

        expect(matrix.analyzed).toBe(1);
        expect(matrix.excluded.beforeComparable).toBe(3);
        expect(matrix.managers[0].byType[0].evidenceCallIds.best).toBe('new');
    });

    it('день звонка строки без версий берётся в TZ портала', () => {
        const edge = [
            liteRow({
                transcriptionId: 'e',
                callStartedAt: new Date('2026-09-24T22:30:00Z'),
                versions: null,
            }),
        ];

        expect(
            buildManagerTypeMatrix(edge, { comparableFrom: NEW_FROM }).analyzed,
        ).toBe(1);
        expect(
            buildManagerTypeMatrix(edge, {
                comparableFrom: NEW_FROM,
                timeZone: 'UTC',
            }).analyzed,
        ).toBe(0);
    });
});

describe('Разрыв ряда настройками — по дню звонка', () => {
    it('новая версия не спасает звонок до разрыва, старая — не топит звонок после', () => {
        const matrix = buildManagerTypeMatrix(
            [
                reviewed('before-break', '2026-09-18', V_NEW),
                reviewed('after-break', '2026-09-22', V_OLD),
            ],
            { seriesBreakFrom: SETTINGS_BREAK },
        );

        expect(matrix.analyzed).toBe(1);
        expect(matrix.excluded.beforeComparable).toBe(1);
        expect(matrix.managers[0].byType[0].evidenceCallIds.best).toBe(
            'after-break',
        );
    });

    it('оба основания вместе: строка до любой из границ — вне оценки', () => {
        const matrix = buildManagerTypeMatrix(
            [
                reviewed('fresh', '2026-09-22', V_NEW),
                reviewed('before-break', '2026-09-18', V_NEW),
                reviewed('stale', '2026-09-26', V_OLD),
            ],
            {
                comparableVersionFrom: NEW_FROM,
                seriesBreakFrom: SETTINGS_BREAK,
            },
        );

        expect(matrix.analyzed).toBe(1);
        expect(matrix.excluded.beforeComparable).toBe(2);
        expect(matrix).toEqual(
            expect.objectContaining({
                comparableFrom: NEW_FROM,
                comparableVersionFrom: NEW_FROM,
                seriesBreakFrom: SETTINGS_BREAK,
            }),
        );
    });

    it('прежний comparableFrom — синоним comparableVersionFrom', () => {
        const rows = [
            ...augustOld(8),
            reviewed('re', '2026-08-15', V_NEW),
            reviewed('tail', '2026-09-24', V_NEW),
        ];

        expect(
            buildManagerTypeMatrix(rows, { comparableFrom: NEW_FROM }),
        ).toEqual(
            buildManagerTypeMatrix(rows, { comparableVersionFrom: NEW_FROM }),
        );
    });
});
