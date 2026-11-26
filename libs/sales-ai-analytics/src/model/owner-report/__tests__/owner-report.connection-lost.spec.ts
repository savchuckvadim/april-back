import { CALL_REPORT_OUTCOME_CONNECTION_LOST } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-report-facts.type';
import { buildOwnerReportFacts } from '../owner-report';
import { normalizeOwnerReportCalls, outcomeOf } from '../owner-report.calls';
import { markedOf } from '../owner-report.overview';
import { OWNER_REPORT_TILE_THRESHOLDS } from '../text/owner-report.attention';
import { pctText } from '../text/owner-report.format';
import { OUTCOME_LABELS } from '../text/owner-report.labels';
import { buildOwnerReportText } from '../text/owner-report.text';
import {
    OCTOBER,
    call,
    legacyCall,
    resetCounter,
} from './owner-report.fixture';

const LOST = CALL_REPORT_OUTCOME_CONNECTION_LOST;

/**
 * Обрыв связи посреди разговора (focus-v3.5, 26.11.2026): разговор по
 * существу шёл — контакт БЫЛ; в долю «без контакта» такой звонок не входит;
 * поводом для внимания «без контакта» он не становится. Итога у оборванного
 * разговора нет: в базу долей исходов (числитель и знаменатель) он не входит,
 * но в счётчике исходов остаётся.
 */
describe('отчёт собственнику: исход «связь прервалась»', () => {
    beforeEach(resetCounter);

    const rows = () => [
        call({ day: '2026-10-05', outcome: 'advanced' }),
        call({ day: '2026-10-05', outcome: LOST }),
        call({ day: '2026-10-06', outcome: LOST }),
        call({ day: '2026-10-06', outcome: 'no_contact' }),
    ];

    it('код исхода признаётся разбором отчёта, а не отбрасывается как чужой', () => {
        expect(outcomeOf(call({ outcome: LOST }))).toBe(LOST);
    });

    it('исход считается отдельной строкой счётчика', () => {
        const facts = buildOwnerReportFacts(rows(), OCTOBER);
        expect(facts.outcomes.byOutcome).toEqual({
            advanced: 1,
            callback_dated: 0,
            postponed: 0,
            refused: 0,
            no_contact: 1,
            connection_lost: 2,
        });
        // Исход размечен: обрыв — не «старый разбор».
        expect(facts.outcomes.unmarked).toBe(0);
        expect(facts.coverage).toMatchObject({
            outcomeFromAnalysis: 4,
            outcomeUnmarked: 0,
        });
    });

    it('звонок считается состоявшимся контактом, но в базу долей не входит', () => {
        const facts = buildOwnerReportFacts(rows(), OCTOBER);
        // Контакт был: по неделям разговоров с ЛПР — продвинутый и два обрыва.
        expect(facts.weeks.reduce((sum, week) => sum + week.contacted, 0)).toBe(
            3,
        );
        // База долей — продвинутый и «без контакта»; обрывы вне базы.
        expect(facts.outcomes.contacted).toBe(1);
        expect(facts.outcomes.advancedOfContacted).toMatchObject({
            successes: 1,
            n: 1,
        });
        const cold = facts.byTypeGroup.find(row => row.group === 'cold');
        expect(cold?.byOutcome.no_contact).toBe(1);
        expect(cold?.byOutcome.connection_lost).toBe(2);
        expect(cold?.advancedOfAll).toMatchObject({ successes: 1, n: 2 });
        expect(cold?.advancedOfContacted).toMatchObject({
            successes: 1,
            n: 1,
        });
    });

    it('markedOf: исход размечен и не «связь прервалась»', () => {
        const { calls } = normalizeOwnerReportCalls([...rows(), legacyCall()], {
            from: OCTOBER.from,
            to: OCTOBER.to,
            timeZone: OCTOBER.timeZone,
        });
        expect(calls).toHaveLength(5);
        expect(markedOf(calls).map(item => item.outcome)).toEqual([
            'advanced',
            'no_contact',
        ]);
        // «Шаг вперёд» у оборванного разговора не определён, а не «нет».
        expect(
            calls
                .filter(item => item.outcome === LOST)
                .map(item => item.advanced),
        ).toEqual([null, null]);
    });

    it('утечка «холодный вход без контакта»: оборванные разговоры в знаменатель не входят', () => {
        const facts = buildOwnerReportFacts(rows(), OCTOBER);
        const leak = facts.leaks.find(item => item.code === 'cold_no_contact');
        // Знаменатель — продвинутый и «без контакта»; задет один.
        expect(leak?.scale).toMatchObject({ successes: 1, n: 2 });
    });

    it('воронка: доля «без контакта» — только no_contact, по базе без оборванных', () => {
        const facts = buildOwnerReportFacts(rows(), OCTOBER);
        const cold = facts.funnel.stages.find(stage => stage.code === 'cold');
        expect(cold).toMatchObject({
            calls: 4,
            marked: 2,
            noContact: { successes: 1, n: 2 },
        });
    });

    it('в тексте перечня исходов строка «Связь прервалась» — числом, без доли', () => {
        const facts = buildOwnerReportFacts(rows(), OCTOBER);
        const text = buildOwnerReportText(facts);
        const row = text.overview.outcomes.find(
            item => item.label === 'Связь прервалась',
        );
        expect(row).toMatchObject({ calls: 2, pct: '' });
        expect(OUTCOME_LABELS.connection_lost).toBe('Связь прервалась');
        expect(text.overview.outcomes).toHaveLength(
            Object.keys(OUTCOME_LABELS).length,
        );
        // Доли остальных исходов — от базы без оборванных: 1 из 2.
        const advanced = text.overview.outcomes.find(
            item => item.label === OUTCOME_LABELS.advanced,
        );
        expect(advanced?.pct).toBe(pctText(50));
        expect(text.overview.notes.join(' ')).toContain(
            'Связь оборвалась в 2 разговорах',
        );
    });

    it('плитка «без содержательного контакта» считается без оборванных разговоров', () => {
        const facts = buildOwnerReportFacts(rows(), OCTOBER);
        const text = buildOwnerReportText(facts);
        const tile = text.tiles.find(item => item.code === 'no_contact');
        // 1 из 2: no_contact; два обрыва в базу не входят.
        expect(tile?.value).toBe(pctText(50));
    });

    it('внимание: у обрыва связи собственного порога нет — повод не срабатывает', () => {
        expect(Object.keys(OWNER_REPORT_TILE_THRESHOLDS)).not.toContain(LOST);
        const onlyLost = buildOwnerReportFacts(
            [
                call({ outcome: LOST }),
                call({ outcome: LOST }),
                call({ outcome: LOST }),
            ],
            OCTOBER,
        );
        const text = buildOwnerReportText(onlyLost);
        const tile = text.tiles.find(item => item.code === 'no_contact');
        // Все разговоры оборваны: базы долей нет — прочерк, тон нейтральный.
        expect(tile?.value).toBe(pctText(null));
        expect(tile?.tone).toBe('neutral');
        expect(text.attention.filter(item => item.tone === 'bad')).toHaveLength(
            0,
        );
    });

    it('старый разбор без исхода по-прежнему не размечен, а не «связь прервалась»', () => {
        const facts = buildOwnerReportFacts([legacyCall()], OCTOBER);
        expect(facts.outcomes.byOutcome.connection_lost).toBe(0);
        expect(facts.outcomes.unmarked).toBe(1);
    });
});

describe('отчёт собственнику: оборванный разговор вне базы долей', () => {
    beforeEach(resetCounter);

    /** Дожим: шаг вперёд, перенос и два обрыва. */
    const followups = () => [
        call({ callType: 'refine', outcome: 'advanced' }),
        call({ callType: 'refine', outcome: 'postponed' }),
        call({ callType: 'refine', outcome: LOST }),
        call({ callType: 'refine', outcome: LOST }),
    ];

    it('дожим: оборванный разговор не попадает в «без решения» — ни в утечку, ни в плитку, ни в абзац', () => {
        const facts = buildOwnerReportFacts(followups(), OCTOBER);
        const leak = facts.leaks.find(
            item => item.code === 'followup_no_decision',
        );
        // Из двух разговоров с итогом без решения остался один.
        expect(leak?.scale).toMatchObject({ successes: 1, n: 2 });

        const text = buildOwnerReportText(facts);
        const tile = text.tiles.find(
            item => item.code === 'followup_no_decision',
        );
        expect(tile?.value).toBe(pctText(50));
        const paragraph = text.summary.find(item => item.startsWith('Дожим'));
        expect(paragraph).toContain(`без решения остались 1 (${pctText(50)})`);
    });

    it('воронка: сумма долей исходов по размеченным равна 100 %, оборванные вне знаменателя', () => {
        const facts = buildOwnerReportFacts(
            [
                call({ outcome: 'advanced' }),
                call({ outcome: 'advanced' }),
                call({ outcome: 'callback_dated' }),
                call({ outcome: 'postponed' }),
                call({ outcome: 'refused' }),
                call({ outcome: 'no_contact' }),
                call({ outcome: LOST }),
                call({ outcome: LOST }),
                call({ outcome: LOST }),
            ],
            OCTOBER,
        );
        const cold = facts.funnel.stages.find(stage => stage.code === 'cold');
        expect(cold).toMatchObject({ calls: 9, marked: 6 });
        const total = [
            cold?.advanced,
            cold?.undecided,
            cold?.refused,
            cold?.noContact,
        ].reduce((sum, share) => sum + (share?.pct ?? 0), 0);
        expect(total).toBeCloseTo(100, 6);
        for (const share of [cold?.advanced, cold?.noContact]) {
            expect(share?.n).toBe(6);
        }
        // В группах типов доля продвинутых — тоже от размеченных без обрывов.
        const group = facts.byTypeGroup.find(row => row.group === 'cold');
        expect(group?.advancedOfAll).toMatchObject({ successes: 2, n: 6 });
        expect(group?.unmarked).toBe(0);
    });

    it('в перечне исходов он есть числом, остальные доли — от базы без него', () => {
        const facts = buildOwnerReportFacts(
            [
                call({ outcome: 'advanced' }),
                call({ outcome: 'refused' }),
                call({ outcome: LOST }),
                call({ outcome: LOST }),
                call({ outcome: LOST }),
                call({ outcome: LOST }),
            ],
            OCTOBER,
        );
        const outcomes = buildOwnerReportText(facts).overview.outcomes;

        expect(
            outcomes.find(
                item => item.label === OUTCOME_LABELS.connection_lost,
            ),
        ).toEqual({ label: 'Связь прервалась', calls: 4, pct: '' });
        expect(
            outcomes.find(item => item.label === OUTCOME_LABELS.advanced)?.pct,
        ).toBe(pctText(50));
    });

    it('презентации: шаг вперёд считается по показам с итогом, без оборванных', () => {
        const facts = buildOwnerReportFacts(
            [
                call({ callType: 'presentation', outcome: 'advanced' }),
                call({ callType: 'presentation', outcome: 'advanced' }),
                call({ callType: 'presentation', outcome: LOST }),
            ],
            OCTOBER,
        );

        expect(facts.presentations).toMatchObject({ calls: 3, marked: 2 });
        expect(facts.presentations.advanced).toMatchObject({
            successes: 2,
            n: 2,
        });
    });

    it('без оборванных разговоров числа прежние', () => {
        const facts = buildOwnerReportFacts(
            [
                call({ outcome: 'advanced' }),
                call({ outcome: 'postponed' }),
                call({ outcome: 'no_contact' }),
            ],
            OCTOBER,
        );
        const cold = facts.funnel.stages.find(stage => stage.code === 'cold');

        expect(cold).toMatchObject({ calls: 3, marked: 3 });
        expect(facts.outcomes.contacted).toBe(2);
        expect(
            buildOwnerReportText(facts).overview.notes.join(' '),
        ).not.toContain('Связь оборвалась');
    });
});
