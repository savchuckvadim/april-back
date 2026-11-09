import { buildOwnerReportFacts } from '../../owner-report';
import {
    DEFAULT_STYLE,
    OCTOBER,
    call,
    resetCounter,
} from '../../__tests__/owner-report.fixture';
import { pctText, shareText } from '../owner-report.format';
import {
    allowedNumberKeys,
    buildNarrativeUserContent,
    checkPhrase,
} from '../owner-report.narrative';
import { buildOwnerReportText } from '../owner-report.text';

const NAMES = { '7': 'Надежда', '8': 'Марина' };
const TEMPLATE_STYLE = { ...DEFAULT_STYLE, needsFound: false };

const section = (code: string, score: number) => ({
    section: code,
    relevance: 100,
    score,
    asWas: null,
    alternatives: [],
});

const rows = () => [
    call({ day: '2026-10-05' }),
    call({ day: '2026-10-05', outcome: 'no_contact' }),
    call({
        day: '2026-10-06',
        callType: 'presentation',
        sections: [section('NEEDS', 8)],
    }),
    call({ day: '2026-10-06', callType: 'presentation', outcome: 'postponed' }),
    call({
        day: '2026-10-07',
        callType: 'presentation',
        style: TEMPLATE_STYLE,
    }),
    call({
        day: '2026-10-07',
        callType: 'presentation',
        style: TEMPLATE_STYLE,
        outcome: 'postponed',
        managerId: '8',
    }),
    call({
        day: '2026-10-08',
        callType: 'decision',
        nextStep: { set: true, date: '2026-10-20', kind: 'invoice' },
    }),
    call({
        day: '2026-10-08',
        callType: 'decision',
        outcome: 'callback_dated',
    }),
    call({ day: '2026-10-09', callType: 'refine', outcome: 'postponed' }),
];

describe('текст отчёта: воронка, воронка по CRM и презентации', () => {
    beforeEach(resetCounter);

    it('воронка: строки ступеней, цепочка, «после показа и КП», согласие на счёт', () => {
        const text = buildOwnerReportText(
            buildOwnerReportFacts(rows(), OCTOBER),
            { names: NAMES },
        );
        expect(text.funnel.rows.map(row => row.label)).toEqual([
            'Холодный первый контакт',
            'Показ системы',
            'После показа и КП: доработка, решение, оплата',
        ]);
        expect(text.funnel.rows[2]).toMatchObject({
            calls: 3,
            undecided: shareText({ successes: 2, n: 3, pct: 66.7 }),
            invoiceAgreed: shareText({ successes: 1, n: 3, pct: 33.3 }),
        });
        expect(text.funnel.chain).toBe(
            `Цепочка: из 2 холодных звонков до показа, доступа или предложения дошли 1 (${pctText(50)}); из 4 показов двигают клиента дальше 2 (${pctText(50)}).`,
        );
        expect(text.funnel.afterOffer).toBe(
            `Из 3 разговоров после показа и КП 2 (${pctText(66.7)}) закончились переносом или «подумаем»; согласие на счёт — 1.`,
        );
        expect(text.funnel.invoice).toBe(
            'Согласие на счёт прозвучало в 1 разговоре периода.',
        );
        // Резюме тоже называет согласие на счёт.
        expect(text.summary.join(' ')).toContain('согласие на счёт — в 1');
        expect(text.crmFunnel).toBeNull();
    });

    it('презентации: пара «под задачи против шаблонного», оценки разделов, люди', () => {
        const text = buildOwnerReportText(
            buildOwnerReportFacts(rows(), OCTOBER),
            { names: NAMES },
        );
        const p = text.presentations;
        expect(p.intro).toBe(
            `Показов за период — 4; шаг вперёд после показа — ${shareText({ successes: 2, n: 4, pct: 50 })}.`,
        );
        expect(p.rows[0]).toEqual({
            label: 'Выявлены задачи клиента',
            value: shareText({ successes: 2, n: 4, pct: 50 }),
        });
        expect(p.comparison).toBe(
            `Показ под задачи клиента двигает разговор дальше в ${pctText(50)} случаев против ${pctText(50)} при шаблонной подаче (2 показа и 2 показа).`,
        );
        expect(p.sections).toEqual([
            { label: 'Выявление потребностей', value: '8 из 10 (по 1 показу)' },
            { label: 'Закрытие разговора', value: '7 из 10 (по 3 показам)' },
        ]);
        // Только у одного сотрудника три показа — сравнивать не с кем.
        expect(p.people).toBe(
            `Больше всего показов — Надежда: шаг вперёд ${shareText({ successes: 2, n: 3, pct: 66.7 })}.`,
        );
    });

    it('воронка по CRM из KPI-данных с прошлым периодом; числа блоков разрешены модели', () => {
        const crm = {
            byManager: {
                '7': {
                    deals: 1,
                    invoices: 2,
                    presentations: 4,
                    plan: null,
                    salesAmount: null,
                },
            },
            avgCheck: null,
        };
        const facts = buildOwnerReportFacts(rows(), OCTOBER, { crm });
        const previous = buildOwnerReportFacts(rows(), OCTOBER, {
            crm: {
                ...crm,
                byManager: { '7': { ...crm.byManager['7'], deals: 0 } },
            },
        });
        const text = buildOwnerReportText(facts, { names: NAMES, previous });
        expect(text.crmFunnel?.rows).toEqual([
            { label: 'Показы по CRM', value: 4, previous: 4 },
            { label: 'Счета', value: 2, previous: 2 },
            { label: 'Договоры', value: 1, previous: 0 },
        ]);
        expect(text.crmFunnel?.conversions).toBe(
            `Счета к показам — ${pctText(50)}, договоры к счетам — ${pctText(50)}, договоры к показам — ${pctText(25)}.`,
        );
        const content = buildNarrativeUserContent(text);
        expect(content).toContain('ВОРОНКА ПО РАЗГОВОРАМ:');
        expect(content).toContain('ВОРОНКА ПО CRM:');
        expect(content).toContain('ПРЕЗЕНТАЦИИ:');
        // Числа новых блоков разрешены модели: фраза с ними проходит факт-чек.
        const allowed = allowedNumberKeys(text);
        expect(
            checkPhrase(text.crmFunnel?.conversions ?? '', allowed, 60),
        ).toBeNull();
        expect(
            checkPhrase(text.presentations.comparison ?? '', allowed, 60),
        ).toBeNull();
    });
});
