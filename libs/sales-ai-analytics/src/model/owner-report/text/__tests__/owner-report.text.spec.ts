import { buildOwnerReportFacts } from '../../owner-report';
import {
    OCTOBER,
    call,
    defaultReport,
    resetCounter,
} from '../../__tests__/owner-report.fixture';
import {
    allowedNumberKeys,
    applyNarrative,
    buildNarrativeUserContent,
} from '../owner-report.narrative';
import { buildOwnerReportText } from '../owner-report.text';

const rows = () => [
    call({ day: '2026-10-05' }),
    call({ day: '2026-10-06', managerId: '8' }),
    call({ day: '2026-10-06', outcome: 'no_contact', managerId: '8' }),
    call({ day: '2026-10-12', outcome: 'postponed', topics: ['no_time'] }),
    call({ day: '2026-10-13', callType: 'decision', managerId: '8' }),
    call({
        day: '2026-10-14',
        callType: 'refine',
        report: defaultReport({
            outcome: 'postponed',
            issues: [{ code: 'crm_duplicate', quote: 'уже звонили' }],
            prices: [
                { amount: 25500, periodMonths: 3, product: null, kind: 'list' },
                { amount: 20000, periodMonths: 3, product: null, kind: 'list' },
            ],
        }),
    }),
    call({ day: '2026-10-20', callType: 'payment', outcome: 'callback_dated' }),
    call({
        day: '2026-10-21',
        callType: 'presentation',
        outcome: 'callback_dated',
    }),
];

const NAMES = { '7': 'Надежда', '8': 'Виолетта' };

describe('текст отчёта собственнику: шаблон', () => {
    beforeEach(resetCounter);

    it('шапка, резюме и разделы — по-русски, числа из фактов', () => {
        const facts = buildOwnerReportFacts(rows(), OCTOBER);
        const text = buildOwnerReportText(facts, { names: NAMES });

        expect(text.title).toBe(
            'Управленческий отчёт по отделу продаж за месяц',
        );
        expect(text.periodLabel).toBe('1–31 октября 2026');
        expect(text.tiles.map(tile => tile.code)).toEqual([
            'analyzed',
            'no_contact',
            'cold_advanced',
            'followup_no_decision',
            'postponed_with_date',
        ]);
        expect(text.tiles[0]).toMatchObject({ value: '8', compare: null });
        expect(text.tiles[2].value).toBe('50 %');
        expect(text.tiles[3].value).toBe('67 %');

        expect(text.summarySource).toBe('template');
        expect(text.summary[0]).toBe(
            'Разобрано 8 разговоров. С решающим состоялось 7 разговоров, до него не дошли 1.',
        );
        expect(text.summary).toContainEqual(
            expect.stringContaining(
                'Единых цен нет: за 3 месяца в разных разговорах звучало от 20 тыс. ₽ до 25,5 тыс. ₽.',
            ),
        );
        expect(text.summary.join(' ')).not.toMatch(/[a-z_]{3,}/);

        expect(text.overview.typeGroups[0]).toMatchObject({
            label: 'Холодный первый контакт',
            calls: 4,
            advanced: '2 из 4 (50 %)',
        });
        expect(text.overview.weeks[1].note).toBe(
            'нет звонков: 7 октября, 8 октября, 9 октября',
        );
        expect(text.overview.notes[0]).toMatch(/^Рабочие дни без звонков: /);

        expect(text.leaks[0]).toMatchObject({
            code: 'followup_no_decision',
            scale: '2 из 3 разговоров дожима без решения (67 %)',
            nature: 'Процесс и навык вместе',
            source: 'template',
        });
        expect(text.leaks[0].title).toContain('Дожим не закрывается');
        expect(text.leaks[0].money).toContain('если вернуть хотя бы 1 сделку');

        expect(text.management.verdict).toBe('Продажи не управляются');
        expect(
            text.management.rows.find(row => row.code === 'plan_fact'),
        ).toMatchObject({
            verdict: 'Не проверялось',
            detail: 'данных за период нет',
        });
        expect(text.objections.intro).toBe(
            'Возражения прозвучали в 1 из 7 разговоров с решающим (14 %); отработано 100 % возражений.',
        );
        expect(text.issues.rows[0]).toMatchObject({
            label: 'Дубль в CRM: уже звонили, уже клиент, уже отказал',
            calls: 1,
        });
        expect(text.controlMetrics[0]).toMatchObject({
            title: 'Доля отложенных разговоров с датой возврата',
            value: '2 из 4 (50 %)',
        });
        expect(text.methodology[0]).toContain('Звонков за период — 8');
    });

    it('карточки сотрудников: имена, ячейки, сильные стороны и риски от команды', () => {
        const facts = buildOwnerReportFacts(rows(), OCTOBER);
        const text = buildOwnerReportText(facts, { names: NAMES });
        const [first, second] = text.managers;
        expect(first.name).toBe('Надежда');
        expect(first.cells.calls).toBe('5 (63 %)');
        expect(first.headline).toBe('Есть что поправить');
        expect(first.risks[0]).toContain(
            'разговор с решающим реже других заканчивается шагом вперёд',
        );
        // Трёх разговоров мало — выводы предварительные.
        expect(second.headline).toBe(
            'Разговоров мало — выводы предварительные',
        );
        expect(second.conclusion).toContain('слишком мало');
    });

    it('сравнение с прошлым периодом — в пунктах', () => {
        const facts = buildOwnerReportFacts(rows(), OCTOBER);
        const text = buildOwnerReportText(facts, { previous: facts });
        expect(text.tiles[0].compare).toBe('в прошлом периоде 8');
        expect(text.tiles[2].compare).toBe('на уровне прошлого периода');
    });
});

describe('текст отчёта собственнику: ответ модели', () => {
    beforeEach(resetCounter);

    const prepared = () => {
        const facts = buildOwnerReportFacts(rows(), OCTOBER);
        return buildOwnerReportText(facts, { names: NAMES });
    };

    it('факты для модели содержат черновик и показатели сотрудников', () => {
        const content = buildNarrativeUserContent(prepared());
        expect(content).toContain('ЧЕРНОВИК РЕЗЮМЕ');
        expect(content).toContain('7 — Надежда');
        expect(allowedNumberKeys(prepared()).has('50.00')).toBe(true);
    });

    it('принимает резюме, утечку и сотрудника с числами из шаблона', () => {
        const result = applyNarrative(prepared(), {
            summary: [
                'Деньги застревают на дожиме: 2 из 3 разговоров без решения.',
                'Холодный вход даёт 50 % продвижений.',
                'Один сотрудник ведёт 5 из 8 разговоров.',
            ],
            leaks: [
                {
                    code: 'followup_no_decision',
                    text: 'После показа клиент уходит думать: 2 из 3 разговоров.',
                },
            ],
            managers: [
                {
                    managerId: '8',
                    strengths: ['Холодный вход работает: 1 из 2.'],
                    risks: [],
                    conclusion: 'Надёжный исполнитель, объём пока мал.',
                },
            ],
        });
        expect(result.accepted).toBe(3);
        expect(result.dropped).toEqual([]);
        expect(result.text.summarySource).toBe('model');
        expect(result.text.leaks[0].source).toBe('model');
        expect(result.text.managers[1].source).toBe('model');
        expect(result.text.managers[0].source).toBe('template');
    });

    it('отбрасывает чужое число, причинность, стоп-слово и неизвестный код — шаблон остаётся', () => {
        const result = applyNarrative(prepared(), {
            summary: [
                'Продажи упали на 37 % из-за секретарей.',
                'Второй абзац.',
                'Третий абзац.',
            ],
            leaks: [
                { code: 'followup_no_decision', text: 'Это критически важно.' },
                { code: 'nope', text: 'Нет такой утечки.' },
            ],
            managers: [
                {
                    managerId: '7',
                    strengths: [],
                    risks: ['Работает плохо потому что устал.'],
                    conclusion: 'Вывод.',
                },
            ],
        });
        expect(result.accepted).toBe(0);
        expect(
            result.dropped.map(drop => `${drop.part}:${drop.reason}`),
        ).toEqual([
            'summary:causal',
            'leak:followup_no_decision:forbidden',
            'leak:nope:unknown-code',
            'manager:7:causal',
        ]);
        expect(result.text.summarySource).toBe('template');
        expect(applyNarrative(prepared(), 'мусор').dropped[0].reason).toBe(
            'shape',
        );
    });
});
