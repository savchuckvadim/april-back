import { buildOwnerReportFacts } from '../../owner-report';
import {
    OCTOBER,
    call,
    resetCounter,
} from '../../__tests__/owner-report.fixture';
import type { OwnerReportCallInput } from '../../owner-report.types';
import { buildOwnerReportText } from '../owner-report.text';
import {
    hasEnoughColdCalls,
    OWNER_REPORT_WEEK_MIN_COLD,
} from '../owner-report.text.overview';

/** Холодные звонки одного дня: первые `advanced` — с продвижением, остальные — отложены. */
const coldCalls = (
    day: string,
    total: number,
    advanced: number,
): OwnerReportCallInput[] =>
    Array.from({ length: total }, (_, index) =>
        call({ day, outcome: index < advanced ? 'advanced' : 'postponed' }),
    );

/** Три полные недели октября: 6 холодных, 2 холодных, 5 холодных. */
const rows = (): OwnerReportCallInput[] => [
    ...coldCalls('2026-10-06', 6, 3),
    ...coldCalls('2026-10-13', 2, 2),
    ...coldCalls('2026-10-20', 5, 1),
];

describe('отчёт собственнику: недели с малым числом холодных звонков', () => {
    beforeEach(resetCounter);

    it('порог — пять холодных звонков в неделю', () => {
        expect(OWNER_REPORT_WEEK_MIN_COLD).toBe(5);
        expect(hasEnoughColdCalls(5)).toBe(true);
        expect(hasEnoughColdCalls(4)).toBe(false);
    });

    it('неделя с двумя холодными: число показано, рядом пометка «мало холодных звонков»', () => {
        const text = buildOwnerReportText(
            buildOwnerReportFacts(rows(), OCTOBER),
        );
        const week = (cold: number) =>
            text.overview.weeks.find(item => item.cold === cold);

        expect(week(2)?.coldAdvanced).not.toBe('—');
        expect(week(2)?.note).toContain('мало холодных звонков');
        expect(week(6)?.note ?? '').not.toContain('мало холодных звонков');
        expect(week(5)?.note ?? '').not.toContain('мало холодных звонков');
    });

    it('вывод о динамике сравнивает недели, где звонков хватает: с 50 % до 20 %, неделя «100 % из двух» не участвует', () => {
        const text = buildOwnerReportText(
            buildOwnerReportFacts(rows(), OCTOBER),
        );
        const trend = text.summary.find(paragraph =>
            paragraph.startsWith('Динамика внутри периода'),
        );

        expect(trend).toContain(
            'доля холодных звонков с продвижением снизилась',
        );
        expect(trend).toMatch(
            /с 50\s?% в первую полную неделю до 20\s?% в последнюю/,
        );
        expect(trend).not.toMatch(/100\s?%/);
    });

    it('если достаточно звонков только в одной неделе — вывода о динамике холодных нет', () => {
        const text = buildOwnerReportText(
            buildOwnerReportFacts(
                [
                    ...coldCalls('2026-10-06', 6, 3),
                    ...coldCalls('2026-10-13', 2, 0),
                    ...coldCalls('2026-10-20', 3, 0),
                ],
                OCTOBER,
            ),
        );

        expect(text.summary.join(' ')).not.toContain(
            'доля холодных звонков с продвижением',
        );
    });
});
