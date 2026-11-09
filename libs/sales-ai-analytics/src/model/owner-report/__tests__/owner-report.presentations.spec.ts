import { buildOwnerReportFacts } from '../owner-report';
import {
    DEFAULT_STYLE,
    OCTOBER,
    call,
    resetCounter,
} from './owner-report.fixture';

const section = (code: string, score: number | null, relevance = 100) => ({
    section: code,
    relevance,
    score,
    asWas: null,
    alternatives: [],
});

/** Показ с оценками разделов «потребности» и «презентация»; закрытие не применимо. */
const demo = (overrides: Parameters<typeof call>[0] = {}) =>
    call({
        callType: 'presentation',
        sections: [
            section('NEEDS', 8),
            section('PRESENTATION', 6),
            section('CLOSING', null, 0),
        ],
        ...overrides,
    });

const TEMPLATE_STYLE = { ...DEFAULT_STYLE, needsFound: false };

describe('отчёт собственнику: презентации', () => {
    beforeEach(resetCounter);

    it('показ под задачи против шаблонного, оценки разделов и разрез по сотрудникам', () => {
        const facts = buildOwnerReportFacts(
            [
                demo({ day: '2026-10-05' }),
                demo({ day: '2026-10-05', outcome: 'postponed' }),
                demo({ day: '2026-10-06', style: TEMPLATE_STYLE }),
                demo({
                    day: '2026-10-06',
                    style: TEMPLATE_STYLE,
                    outcome: 'postponed',
                    managerId: '8',
                }),
                demo({
                    day: '2026-10-07',
                    style: TEMPLATE_STYLE,
                    outcome: 'refused',
                    managerId: '8',
                    sections: [section('NEEDS', 4)],
                }),
                // Холодный звонок в раздел показов не входит.
                call({ day: '2026-10-07' }),
            ],
            OCTOBER,
        );
        const p = facts.presentations;
        expect(p.calls).toBe(5);
        expect(p.marked).toBe(5);
        expect(p.advanced).toMatchObject({ successes: 2, n: 5 });
        expect(p.needsFound).toMatchObject({ successes: 2, n: 5 });
        expect(p.byNeeds).toMatchObject({ successes: 2, n: 5 });
        expect(p.advancedByNeeds).toMatchObject({ successes: 1, n: 2 });
        expect(p.advancedTemplate).toMatchObject({ successes: 1, n: 3 });
        // Раздел «Закрытие» не применим — попытка закрытия не считается.
        expect(p.closingAttempted.n).toBe(0);
        expect(p.sectionScores).toEqual([
            { section: 'NEEDS', avg: 7.2, n: 5 },
            { section: 'PRESENTATION', avg: 6, n: 4 },
        ]);
        expect(p.byManager.map(row => [row.managerId, row.calls])).toEqual([
            ['7', 3],
            ['8', 2],
        ]);
    });

    it('без показов — пустой раздел без ошибок', () => {
        const facts = buildOwnerReportFacts([call()], OCTOBER);
        expect(facts.presentations).toMatchObject({
            calls: 0,
            sectionScores: [],
            byManager: [],
        });
        expect(facts.presentations.advanced.n).toBe(0);
    });
});
