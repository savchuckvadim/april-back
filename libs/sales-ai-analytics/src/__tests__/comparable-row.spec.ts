import { comparableFrom } from '../contracts/versions.types';
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

/** Наборы версий разбора: v2.2 (промпт от 08.09) и v2.3 (от 25.09). */
const V22 = { ...FIXTURE_VERSIONS, prompt: 'focus-v2.2-2026-09-08' };
const V23 = { ...FIXTURE_VERSIONS, prompt: 'focus-v2.3-2026-09-25' };
/** Дата выхода v2.3 — граница периода, в котором есть её разборы. */
const V23_FROM = '2026-09-25';
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

/** Граница периода по версиям — как у обзора: max дат версий всех строк. */
const periodBoundary = (rows: readonly MatrixCallRow[]): string =>
    comparableFrom(
        rows.flatMap(row => (row.versions ? Object.values(row.versions) : [])),
    );

/** Августовские звонки с 10.08 подряд, разобранные набором v2.2. */
const augustV22 = (count: number): MatrixCallRow[] =>
    Array.from({ length: count }, (_, index) =>
        reviewed(
            `a${index + 1}`,
            `2026-08-${String(10 + index).padStart(2, '0')}`,
            V22,
        ),
    );

describe('rowVersionsDate — дата собственного набора версий разбора', () => {
    it('max дат по всем полям versions — та же функция, что граница периода', () => {
        expect(rowVersionsDate({ versions: V23 })).toBe(V23_FROM);
        expect(rowVersionsDate({ versions: V22 })).toBe('2026-09-08');
        expect(rowVersionsDate({ versions: FIXTURE_VERSIONS })).toBe(
            '2026-09-05',
        );
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
        expect(matrixComparability({ comparableFrom: V23_FROM })).toEqual({
            versionFrom: V23_FROM,
            seriesBreakFrom: null,
            timeZone: 'Europe/Moscow',
        });
        expect(
            matrixComparability({
                comparableFrom: '2026-09-08',
                comparableVersionFrom: V23_FROM,
                seriesBreakFrom: SETTINGS_BREAK,
                timeZone: 'UTC',
            }),
        ).toEqual({
            versionFrom: V23_FROM,
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
        expect(of(V23_FROM, SETTINGS_BREAK)).toBe(V23_FROM);
        expect(of('2026-09-08', SETTINGS_BREAK)).toBe(SETTINGS_BREAK);
        expect(of(null, SETTINGS_BREAK)).toBe(SETTINGS_BREAK);
        expect(of(V23_FROM, null)).toBe(V23_FROM);
        expect(of(null, null)).toBeNull();
    });

    it('правило доступно из публичного API библиотеки', () => {
        expect(publicApi.isBeforeComparable).toBe(isBeforeComparable);
        expect(publicApi.rowVersionsDate).toBe(rowVersionsDate);
    });
});

describe('Сравнимость по версии разбора', () => {
    it('звонок до даты новой версии, разобранный новой версией, — сравним', () => {
        const tail = reviewed('tail', '2026-09-24', V23);
        const matrix = buildManagerTypeMatrix([tail], {
            comparableFrom: V23_FROM,
        });

        expect(matrix.analyzed).toBe(1);
        expect(matrix.excluded.beforeComparable).toBe(0);
        expect(
            isBeforeComparable(
                tail,
                matrixComparability({ comparableFrom: V23_FROM }),
            ),
        ).toBe(false);
    });

    it('звонок после даты, но разобранный старой версией, — не сравним', () => {
        const matrix = buildManagerTypeMatrix(
            [reviewed('stale', '2026-09-26', V22)],
            { comparableFrom: V23_FROM },
        );

        expect(matrix.analyzed).toBe(0);
        expect(matrix.managers[0]).toEqual(
            expect.objectContaining({ n: 0, nBeforeComparable: 1 }),
        );
    });

    it('период из одних старых разборов даёт свою дату сравнимости — в оценке все разборы', () => {
        const august = augustV22(9);
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
        const period = [...augustV22(8), reviewed('re', '2026-08-15', V23)];
        const boundary = periodBoundary(period);
        const matrix = buildManagerTypeMatrix(period, {
            comparableFrom: boundary,
        });

        expect(boundary).toBe(V23_FROM);
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

    it('строка с версиями и без даты звонка судится по версии', () => {
        const undated = liteRow({
            transcriptionId: 'u',
            callStartedAt: null,
            versions: V23,
        });

        expect(
            buildManagerTypeMatrix([undated], { comparableFrom: V23_FROM })
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
            { comparableFrom: V23_FROM },
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
            buildManagerTypeMatrix(edge, { comparableFrom: V23_FROM }).analyzed,
        ).toBe(1);
        expect(
            buildManagerTypeMatrix(edge, {
                comparableFrom: V23_FROM,
                timeZone: 'UTC',
            }).analyzed,
        ).toBe(0);
    });
});

describe('Разрыв ряда настройками — по дню звонка', () => {
    it('новая версия не спасает звонок до разрыва, старая — не топит звонок после', () => {
        const matrix = buildManagerTypeMatrix(
            [
                reviewed('before-break', '2026-09-18', V23),
                reviewed('after-break', '2026-09-22', V22),
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
                reviewed('fresh', '2026-09-22', V23),
                reviewed('before-break', '2026-09-18', V23),
                reviewed('stale', '2026-09-26', V22),
            ],
            {
                comparableVersionFrom: V23_FROM,
                seriesBreakFrom: SETTINGS_BREAK,
            },
        );

        expect(matrix.analyzed).toBe(1);
        expect(matrix.excluded.beforeComparable).toBe(2);
        expect(matrix).toEqual(
            expect.objectContaining({
                comparableFrom: V23_FROM,
                comparableVersionFrom: V23_FROM,
                seriesBreakFrom: SETTINGS_BREAK,
            }),
        );
    });

    it('прежний comparableFrom — синоним comparableVersionFrom', () => {
        const rows = [
            ...augustV22(8),
            reviewed('re', '2026-08-15', V23),
            reviewed('tail', '2026-09-24', V23),
        ];

        expect(
            buildManagerTypeMatrix(rows, { comparableFrom: V23_FROM }),
        ).toEqual(
            buildManagerTypeMatrix(rows, { comparableVersionFrom: V23_FROM }),
        );
    });
});
