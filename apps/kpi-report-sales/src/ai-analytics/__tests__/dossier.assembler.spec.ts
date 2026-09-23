import {
    AI_DOSSIER_MONTHS,
    AI_DOSSIER_REASONS,
    AI_DOSSIER_REASON_TEXTS,
    AI_DOSSIER_SECTIONS,
    buildDossierKey,
    dossierMonthKeys,
    isClosedDossierWindow,
    shiftMonth,
} from '../constants/ai-dossier.const';
import { AI_ANALYTICS_CALC_VERSION } from '../constants/ai-overview.const';
import {
    DossierReasons,
    section,
    toFeedbackSummary,
    toMeta,
    toRopMarks,
    toSeries,
    toSeriesPoints,
} from '../domain/assembler/dossier.assembler';
import {
    emptyMetric,
    scoreMetricOf,
    toObjectionCategories,
    toPassport,
    type DossierSnapshotView,
} from '../domain/assembler/dossier.reader';
import {
    toReadiness,
    weekKeysOf,
} from '../domain/loaders/dossier-sources.loader';

const view = (
    periodKey: string,
    payload: unknown,
    id = periodKey,
): DossierSnapshotView => ({
    id,
    periodKey,
    managerId: '512',
    payload,
    generatedAt: '2026-09-21T00:00:00.000Z',
});

describe('ai-dossier.const: окно и ключ кэша', () => {
    it('shiftMonth переходит через границу года в обе стороны', () => {
        expect(shiftMonth('2026-01', -1)).toBe('2025-12');
        expect(shiftMonth('2026-12', 1)).toBe('2027-01');
        expect(shiftMonth('2026-09', -12)).toBe('2025-09');
        expect(shiftMonth('2026-09', 0)).toBe('2026-09');
    });

    it('окно по умолчанию — три месяца, последний из них месяц «сегодня»', () => {
        expect(
            dossierMonthKeys('2026-09-22', AI_DOSSIER_MONTHS.default),
        ).toEqual(['2026-07', '2026-08', '2026-09']);
        expect(dossierMonthKeys('2026-01-15', 3)).toEqual([
            '2025-11',
            '2025-12',
            '2026-01',
        ]);
        expect(dossierMonthKeys('2026-09-22', 1)).toEqual(['2026-09']);
    });

    it('ключ кэша нормализует id менеджера и несёт границы окна', () => {
        expect(
            buildDossierKey('april.bitrix24.ru', '0512', '2026-07', '2026-09'),
        ).toBe(
            'sales-ai-analytics:v1:april.bitrix24.ru:dossier:512:2026-07_2026-09',
        );
    });

    it('окно считается закрытым, только когда последний месяц уже прошёл', () => {
        expect(
            isClosedDossierWindow(['2026-07', '2026-08'], '2026-09-22'),
        ).toBe(true);
        expect(
            isClosedDossierWindow(['2026-08', '2026-09'], '2026-09-22'),
        ).toBe(false);
        expect(isClosedDossierWindow([], '2026-09-22')).toBe(false);
    });
});

describe('DossierReasons и section: пустой раздел не роняет досье', () => {
    it('секция с данными отдаётся как есть, причин не появляется', () => {
        const reasons = new DossierReasons();
        expect(section(reasons, AI_DOSSIER_SECTIONS.series, () => 42)).toBe(42);
        expect(reasons.list()).toEqual([]);
    });

    it('null/undefined дают null и причину по умолчанию с подписью', () => {
        const reasons = new DossierReasons();
        expect(
            section(reasons, AI_DOSSIER_SECTIONS.passport, () => null),
        ).toBeNull();
        expect(
            section(reasons, AI_DOSSIER_SECTIONS.style, () => undefined),
        ).toBeNull();
        expect(reasons.list()).toEqual([
            {
                section: AI_DOSSIER_SECTIONS.passport,
                reason: AI_DOSSIER_REASONS.noSnapshots,
                text: AI_DOSSIER_REASON_TEXTS[AI_DOSSIER_REASONS.noSnapshots],
            },
            {
                section: AI_DOSSIER_SECTIONS.style,
                reason: AI_DOSSIER_REASONS.noSnapshots,
                text: AI_DOSSIER_REASON_TEXTS[AI_DOSSIER_REASONS.noSnapshots],
            },
        ]);
    });

    it('исключение внутри раздела превращается в причину section-failed', () => {
        const reasons = new DossierReasons();
        const value = section(reasons, AI_DOSSIER_SECTIONS.objections, () => {
            throw new Error('нагрузка не разобралась');
        });

        expect(value).toBeNull();
        expect(reasons.list()[0].reason).toBe(AI_DOSSIER_REASONS.sectionFailed);
    });
});

describe('dossier.reader: чужие нагрузки читаются структурно', () => {
    it('метрика оценки копируется, чужая форма даёт пустую метрику', () => {
        expect(
            scoreMetricOf({
                score: {
                    value: 7.2,
                    n: 30,
                    w: 0.8,
                    confidence: { level: 'ok', reason: 'few-data' },
                },
            }),
        ).toEqual({
            value: 7.2,
            n: 30,
            w: 0.8,
            confidence: { level: 'ok', reason: 'few-data' },
        });
        expect(scoreMetricOf({ score: { value: 5 } })).toEqual(emptyMetric());
        expect(
            scoreMetricOf({ score: { confidence: { level: 'ой' } } }),
        ).toEqual(emptyMetric());
        expect(scoreMetricOf(null)).toEqual(emptyMetric());
    });

    it('паспорт: незнакомые типы полей дают null, а не мусор', () => {
        expect(
            toPassport(
                {
                    passport: {
                        since: '2025-04-01',
                        sinceSource: 'date-register',
                        status: 42,
                        leftAt: null,
                        level: '',
                        tenureMonths: '17',
                        tenureBand: 'experienced',
                    },
                },
                '512',
            ),
        ).toEqual({
            managerId: '512',
            since: '2025-04-01',
            sinceSource: 'date-register',
            status: null,
            leftAt: null,
            level: null,
            tenureMonths: null,
            tenureBand: 'experienced',
        });
        expect(toPassport({ passport: null }, '512')).toBeNull();
        expect(toPassport(undefined, '512')).toBeNull();
    });

    it('возражения окна складываются по категории, доля по окну — честный none', () => {
        const objection = (n: number, calls: number, converted: number) => ({
            category: 'price',
            n,
            calls,
            handledRatePct: { value: 50, n, confidence: { level: 'low' } },
            outcomes: { continued: 0, converted, disengaged: 0, other: 0 },
        });
        const merged = toObjectionCategories([
            view('2026-W36', { objections: [objection(3, 2, 1)] }),
            view('2026-W37', {
                objections: [objection(5, 4, 2), { category: 'timing', n: 1 }],
            }),
        ]);

        expect(merged).toEqual([
            {
                category: 'price',
                n: 8,
                calls: 6,
                handledRatePct: emptyMetric(),
                outcomes: {
                    continued: 0,
                    converted: 3,
                    disengaged: 0,
                    other: 0,
                },
            },
            {
                category: 'timing',
                n: 1,
                calls: 0,
                handledRatePct: emptyMetric(),
                outcomes: {
                    continued: 0,
                    converted: 0,
                    disengaged: 0,
                    other: 0,
                },
            },
        ]);
        expect(toObjectionCategories([])).toBeNull();
        expect(
            toObjectionCategories([view('w', { objections: [] })]),
        ).toBeNull();
    });
});

describe('dossier.assembler: ряды, своды и служебный блок', () => {
    it('точки ряда идут по возрастанию ключа периода', () => {
        expect(
            toSeriesPoints([
                view('2026-W38', { n: 4 }),
                view('2026-W36', { n: 9 }),
            ]).map(point => point.periodKey),
        ).toEqual(['2026-W36', '2026-W38']);
    });

    it('ряды null только когда нет ни недель, ни месяцев', () => {
        expect(toSeries([], [])).toBeNull();
        expect(toSeries([view('2026-W36', { n: 1 })], [])).toEqual({
            weeks: [{ periodKey: '2026-W36', n: 1, score: emptyMetric() }],
            months: [],
        });
    });

    it('свод обратной связи считает только реакции своего менеджера', () => {
        expect(
            toFeedbackSummary(
                [
                    { kind: 'useful', managerId: '512' },
                    { kind: 'useful', managerId: '0512' },
                    { kind: 'view', managerId: '447' },
                    { kind: 'view', managerId: null },
                ],
                '512',
            ),
        ).toEqual({ total: 2, byKind: { useful: 2 } });
        expect(
            toFeedbackSummary([{ kind: 'useful', managerId: '447' }], '512'),
        ).toBeNull();
    });

    it('свод меток: согласия, средняя оценка и разделы по частоте', () => {
        expect(
            toRopMarks(
                [
                    {
                        managerId: '512',
                        agree: true,
                        ropScore: 9,
                        sections: ['needs'],
                    },
                    {
                        managerId: '512',
                        agree: false,
                        ropScore: null,
                        sections: ['needs', 'closing'],
                    },
                    {
                        managerId: '447',
                        agree: true,
                        ropScore: 3,
                        sections: ['price'],
                    },
                ],
                '512',
            ),
        ).toEqual({
            total: 2,
            agree: 1,
            // Оценка одна — среднее равно ей самой, объём n = 1.
            ropScore: { value: 9, n: 1, confidence: { level: 'ok' } },
            sections: ['needs', 'closing'],
        });
    });

    it('метки без оценок дают пустую метрику, а не ноль', () => {
        expect(
            toRopMarks(
                [
                    {
                        managerId: '512',
                        agree: true,
                        ropScore: null,
                        sections: [],
                    },
                ],
                '512',
            )?.ropScore,
        ).toEqual(emptyMetric());
    });

    it('служебный блок: id снапшотов без повторов и по возрастанию', () => {
        expect(
            toMeta(
                ['w-2', 'm-1', 'w-2'],
                ['2026-08', '2026-09'],
                new Date('2026-09-22T06:15:00.000Z'),
            ),
        ).toEqual({
            calcVersion: AI_ANALYTICS_CALC_VERSION,
            snapshotIds: ['m-1', 'w-2'],
            generatedAt: '2026-09-22T06:15:00.000Z',
            months: ['2026-08', '2026-09'],
        });
    });
});

describe('dossier-sources.loader: чистые помощники выборки', () => {
    it('ключи недель перекрывают окно и идут без повторов', () => {
        const keys = weekKeysOf(['2026-07', '2026-08', '2026-09']);

        expect(new Set(keys).size).toBe(keys.length);
        expect(keys[0]).toBe('2026-W27');
        // Последняя неделя окна (22.09.2026 — W39) в выборку попала.
        expect(keys).toContain('2026-W39');
        expect(weekKeysOf([])).toEqual([]);
    });

    it('готовность читается из нагрузки модели, чужая форма → null', () => {
        expect(
            toReadiness({
                readiness: {
                    mode: 'norms',
                    historyMonths: 6,
                    presentations: 140,
                    sales: 22,
                    comparableFrom: '2026-03-01',
                    reasons: ['roster-not-confirmed', 7],
                },
            }),
        ).toEqual({
            mode: 'norms',
            historyMonths: 6,
            presentations: 140,
            sales: 22,
            comparableFrom: '2026-03-01',
            reasons: ['roster-not-confirmed'],
            betaSource: 'none',
            betaCountdown: null,
        });
        expect(toReadiness({ readiness: { mode: 'неизвестный' } })).toBeNull();
        expect(toReadiness(null)).toBeNull();
    });
});
