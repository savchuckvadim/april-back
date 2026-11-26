import { CALL_REPORT_OUTCOME_CONNECTION_LOST } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-report-facts.type';
import { buildOwnerReportFacts } from '../owner-report';
import { outcomeOf } from '../owner-report.calls';
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
 * поводом для внимания «без контакта» он не становится.
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
        expect(facts.outcomes.unmarked).toBe(0);
    });

    it('звонок считается состоявшимся контактом: идёт в «дошли до ЛПР», а не в «без контакта»', () => {
        const facts = buildOwnerReportFacts(rows(), OCTOBER);
        // Продвинут, два обрыва и один «без контакта»: контакт — у трёх.
        expect(facts.outcomes.contacted).toBe(3);
        const cold = facts.byTypeGroup.find(row => row.group === 'cold');
        expect(cold?.byOutcome.no_contact).toBe(1);
        expect(cold?.byOutcome.connection_lost).toBe(2);
        expect(cold?.advancedOfContacted).toMatchObject({
            successes: 1,
            n: 3,
        });
    });

    it('утечка «холодный вход без контакта» обрыв связи не считает', () => {
        const facts = buildOwnerReportFacts(rows(), OCTOBER);
        const leak = facts.leaks.find(item => item.code === 'cold_no_contact');
        // Знаменатель — 4 холодных разговора с известным контактом, задет один.
        expect(leak?.scale).toMatchObject({ successes: 1, n: 4 });
    });

    it('воронка: «без контакта» только no_contact, доля считается по всем размеченным', () => {
        const facts = buildOwnerReportFacts(rows(), OCTOBER);
        const cold = facts.funnel.stages.find(stage => stage.code === 'cold');
        expect(cold).toMatchObject({
            marked: 4,
            noContact: { successes: 1, n: 4 },
        });
    });

    it('в тексте перечня исходов строка «Связь прервалась» стоит наравне с остальными', () => {
        const facts = buildOwnerReportFacts(rows(), OCTOBER);
        const text = buildOwnerReportText(facts);
        const row = text.overview.outcomes.find(
            item => item.label === 'Связь прервалась',
        );
        expect(row).toMatchObject({ calls: 2, pct: pctText(50) });
        expect(OUTCOME_LABELS.connection_lost).toBe('Связь прервалась');
        expect(text.overview.outcomes).toHaveLength(
            Object.keys(OUTCOME_LABELS).length,
        );
    });

    it('плитка «без содержательного контакта» обрыв связи не учитывает', () => {
        const facts = buildOwnerReportFacts(rows(), OCTOBER);
        const text = buildOwnerReportText(facts);
        const tile = text.tiles.find(item => item.code === 'no_contact');
        // 1 из 4: no_contact; два обрыва в долю не входят.
        expect(tile?.value).toBe(pctText(25));
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
        // Все разговоры оборваны, «без контакта» — 0 %: тон не «плохой».
        expect(tile?.value).toBe(pctText(0));
        expect(tile?.tone).toBe('good');
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
