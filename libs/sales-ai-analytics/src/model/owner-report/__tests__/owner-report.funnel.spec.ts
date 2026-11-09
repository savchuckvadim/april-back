import { buildOwnerReportFacts } from '../owner-report';
import {
    OCTOBER,
    call,
    legacyCall,
    resetCounter,
} from './owner-report.fixture';

describe('отчёт собственнику: воронка по разговорам', () => {
    beforeEach(resetCounter);

    it('три ступени с исходами и согласием на счёт; доли — по размеченным', () => {
        const facts = buildOwnerReportFacts(
            [
                call({ day: '2026-10-05' }),
                call({ day: '2026-10-05', outcome: 'no_contact' }),
                call({ day: '2026-10-06', callType: 'presentation' }),
                call({
                    day: '2026-10-06',
                    callType: 'presentation',
                    outcome: 'postponed',
                }),
                // Старый разбор: в ступени есть, в долях — нет.
                legacyCall({ day: '2026-10-06', callType: 'presentation' }),
                call({
                    day: '2026-10-07',
                    callType: 'decision',
                    nextStep: {
                        set: true,
                        date: '2026-10-20',
                        kind: 'invoice',
                    },
                }),
                call({
                    day: '2026-10-07',
                    callType: 'decision',
                    outcome: 'callback_dated',
                }),
                call({
                    day: '2026-10-08',
                    callType: 'refine',
                    outcome: 'postponed',
                }),
            ],
            OCTOBER,
        );
        const stage = (code: string) =>
            facts.funnel.stages.find(item => item.code === code);
        expect(facts.funnel.stages.map(item => item.code)).toEqual([
            'cold',
            'presentation',
            'followup',
        ]);
        expect(stage('cold')).toMatchObject({
            calls: 2,
            marked: 2,
            advanced: { successes: 1, n: 2 },
            noContact: { successes: 1, n: 2 },
            invoiceAgreed: { successes: 0, n: 2 },
        });
        expect(stage('presentation')).toMatchObject({
            calls: 3,
            marked: 2,
            advanced: { successes: 1, n: 2 },
            undecided: { successes: 1, n: 2 },
        });
        expect(stage('followup')).toMatchObject({
            calls: 3,
            marked: 3,
            advanced: { successes: 1, n: 3 },
            undecided: { successes: 2, n: 3 },
            refused: { successes: 0, n: 3 },
            invoiceAgreed: { successes: 1, n: 3 },
        });
        expect(facts.funnel.invoiceAgreedTotal).toBe(1);
    });
});
