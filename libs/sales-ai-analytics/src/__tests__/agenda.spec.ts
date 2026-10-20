import {
    AGENDA_REASON_KINDS,
    AgendaCallRow,
    AgendaObjection,
    AgendaSection,
    buildAgenda,
} from '../model/agenda';

/**
 * Повестка планёрки после решения владельца 19.10.2026: слабая презентация
 * → слабая доработка → низкая оценка → риск с цитатой → запасные причины
 * (спорное возражение, худший раздел). Пороги — дефолты реестра: раздел
 * слабый при оценке ≤ 5, звонок — при общей оценке ≤ 4 из 10 (строка несёт
 * 0–100). Отменённые флаги и флаги без цитаты риском не считаются.
 */
const section = (
    name: string,
    score: number | null,
    relevance = 1,
    asWas: string | null = null,
): AgendaSection => ({
    section: name,
    relevance,
    score,
    asWas,
    alternatives: [],
});

const objection = (patch: Partial<AgendaObjection> = {}): AgendaObjection => ({
    category: 'price',
    quote: 'Дорого',
    handled: true,
    outcome: 'continued',
    ...patch,
});

const call = (
    transcriptionId: string,
    managerId: string | null,
    patch: Partial<AgendaCallRow> = {},
): AgendaCallRow => ({
    transcriptionId,
    managerId,
    callType: 'cold',
    callStartedAt: new Date('2026-09-08T09:00:00+03:00'),
    score: 60,
    sections: [section('NEEDS', 7), section('CLOSING', 6)],
    objections: [],
    riskFlags: [],
    text: null,
    ...patch,
});

const RISK_TEXT = 'Начало. Ладно, тогда до свидания. Конец.';

const risk = call('A', 'm1', {
    riskFlags: ['door_closed'],
    riskEvidence: [{ flag: 'door_closed', quote: 'Ладно, тогда до свидания' }],
    sections: [section('CLOSING', 6, 1, 'Хорошо, всего доброго')],
    text: RISK_TEXT,
});
const disputed = call('B', 'm2', {
    objections: [objection({ handled: false, outcome: null })],
    text: 'Клиент сказал: Дорого. Менеджер промолчал.',
});
const weak = call('C', 'm3', {
    sections: [section('PRICE', 6, 1, 'Что вам нужно?'), section('CLOSING', 8)],
});
const weakerSameManager = call('D', 'm1', {
    sections: [section('PRICE', 6, 1, 'Ну так что?')],
});
const noSignal = call('E', 'm4', {
    sections: [section('NEEDS', 1, 0), section('CLOSING', null)],
});
const weakPresentation = call('P', 'm5', {
    callType: 'presentation',
    score: 70,
    sections: [
        section('NEEDS', 4, 1, 'Ну, расскажу про систему'),
        section('PRESENTATION', 8, 1, 'Вот наш продукт'),
    ],
});
const weakFollowup = call('F', 'm6', {
    callType: 'refine',
    score: 70,
    objections: [
        objection({ category: 'timing', quote: 'Не сейчас', handled: false }),
    ],
    sections: [section('OBJECTIONS', 7, 1, 'Понял вас')],
});
const lowScore = call('L', 'm7', {
    score: 35,
    sections: [section('PRICE', 2, 1, 'Ну дорого так дорого')],
});

const rows = [
    noSignal,
    weakerSameManager,
    weak,
    disputed,
    risk,
    lowScore,
    weakFollowup,
    weakPresentation,
];

describe('buildAgenda', () => {
    it('порядок: слабая презентация → слабая доработка → низкая оценка → риск → возражение → раздел', () => {
        const items = buildAgenda(rows, { limit: 10 });
        expect(items.map(item => [item.transcriptionId, item.kind])).toEqual([
            ['P', 'weak_presentation'],
            ['F', 'weak_followup'],
            ['L', 'low_score'],
            ['A', 'risk'],
            ['B', 'objection'],
            ['C', 'section'],
            ['D', 'section'],
        ]);
        expect(AGENDA_REASON_KINDS).toEqual([
            'weak_presentation',
            'weak_followup',
            'low_score',
            'risk',
            'objection',
            'section',
        ]);
    });

    it('по одному звонку на менеджера, пока есть звонки других', () => {
        const items = buildAgenda(rows);
        expect(items.map(item => item.transcriptionId)).toEqual([
            'P',
            'F',
            'L',
        ]);
        expect(items.map(item => item.managerId)).toEqual(['m5', 'm6', 'm7']);
    });

    it('детерминирован: двойной вызов и перемешанный вход дают равные массивы', () => {
        const first = buildAgenda(rows);
        expect(buildAgenda(rows)).toEqual(first);
        expect(buildAgenda([...rows].reverse())).toEqual(first);
    });

    it('слабая презентация: причина — худший из разделов потребностей и презентации, цитата — его «как было»', () => {
        const [item] = buildAgenda([weakPresentation]);
        expect(item.kind).toBe('weak_presentation');
        expect(item.reason).toBe(
            'Слабая презентация: «Выявление потребностей» 4 из 10',
        );
        expect(item.quote).toBe('Ну, расскажу про систему');
        expect(item.callType).toBe('presentation');
        // Разделы презентации в норме — презентация в повестку по этой
        // причине не попадает (остаётся запасной «худший раздел»).
        const [fine] = buildAgenda([
            call('P2', 'm5', {
                callType: 'presentation',
                sections: [section('NEEDS', 6), section('PRESENTATION', 7)],
            }),
        ]);
        expect(fine.kind).toBe('section');
        // Порог настраивается.
        expect(
            buildAgenda([weakPresentation], { weakSectionScoreMax: 3 })[0].kind,
        ).toBe('section');
    });

    it('слабая доработка: неотработанное возражение → шаг без даты → слабый раздел возражений / закрытия', () => {
        const [byObjection] = buildAgenda([weakFollowup]);
        expect(byObjection.kind).toBe('weak_followup');
        expect(byObjection.reason).toBe(
            'Слабая доработка: возражение «Сроки / не сейчас»: не отработано',
        );
        expect(byObjection.quote).toBe('Не сейчас');

        const [byNoDate] = buildAgenda([
            call('F2', 'm6', {
                callType: 'decision',
                nextStep: { set: true, date: null },
                sections: [section('CLOSING', 7, 1, 'Созвонимся')],
            }),
        ]);
        expect(byNoDate.kind).toBe('weak_followup');
        expect(byNoDate.reason).toBe(
            'Слабая доработка: следующий шаг без даты',
        );
        expect(byNoDate.quote).toBe('Созвонимся');

        const [bySection] = buildAgenda([
            call('F3', 'm6', {
                callType: 'refine',
                nextStep: { set: true, date: '2026-09-10' },
                sections: [section('CLOSING', 3, 1, 'Ну ладно')],
            }),
        ]);
        expect(bySection.reason).toBe(
            'Слабая доработка: «Закрытие разговора» 3 из 10',
        );
        expect(bySection.quote).toBe('Ну ладно');

        // Доработка без признаков — запасная причина «худший раздел».
        const [fine] = buildAgenda([
            call('F4', 'm6', {
                callType: 'refine',
                nextStep: { set: true, date: '2026-09-10' },
                sections: [section('CLOSING', 7, 1, 'Ок')],
            }),
        ]);
        expect(fine.kind).toBe('section');
    });

    it('низкая оценка: порог 4 из 10 по шкале 0–100 строки, причина с худшим разделом', () => {
        const [item] = buildAgenda([lowScore]);
        expect(item.kind).toBe('low_score');
        expect(item.reason).toBe(
            'Низкая оценка звонка: 3,5 из 10, слабее всего — «Работа по цене»: 2 из 10',
        );
        expect(item.quote).toBe('Ну дорого так дорого');
        expect(item.score).toBe(35);
        expect(buildAgenda([call('L2', 'm1', { score: 41 })])[0].kind).toBe(
            'section',
        );
        expect(
            buildAgenda([call('L2', 'm1', { score: 41 })], {
                lowScoreCallMax: 5,
            })[0].kind,
        ).toBe('low_score');
    });

    it('риск: только действующий флаг с цитатой, цитата — доказательство, charOffset по тексту', () => {
        const [item] = buildAgenda([risk]);
        expect(item.kind).toBe('risk');
        expect(item.reason).toBe(
            'Сигналы риска: после отказа не оставил дверь открытой',
        );
        expect(item.quote).toBe('Ладно, тогда до свидания');
        expect(item.charOffset).toBe(
            RISK_TEXT.indexOf('Ладно, тогда до свидания'),
        );
        expect(item.score).toBe(60);
    });

    it('отменённые флаги и флаги без цитаты — не риск (звонок уходит в запасные причины)', () => {
        const [retired] = buildAgenda([
            call('R1', 'm1', {
                riskFlags: ['promise', 'client_negative'],
                riskEvidence: [
                    { flag: 'promise', quote: 'Завтра всё будет' },
                    { flag: 'client_negative', quote: 'Не звоните' },
                ],
                sections: [section('CLOSING', 6, 1, 'Ладно')],
            }),
        ]);
        expect(retired.kind).toBe('section');
        expect(retired.reason).not.toContain('риск');

        const [noQuote] = buildAgenda([
            call('R2', 'm1', {
                riskFlags: ['conflict'],
                sections: [section('CLOSING', 6, 1, 'Ладно')],
            }),
        ]);
        expect(noQuote.kind).toBe('section');
        expect(
            buildAgenda([
                call('R3', 'm1', {
                    riskFlags: ['conflict'],
                    riskEvidence: [{ flag: 'conflict', quote: '   ' }],
                    sections: [],
                }),
            ]),
        ).toEqual([]);
    });

    it('несколько доказанных флагов — все названия через точку с запятой, тяжесть по числу', () => {
        const [heavier] = buildAgenda([
            call('I', 'm2', {
                riskFlags: ['conflict'],
                riskEvidence: [{ flag: 'conflict', quote: 'Слушайте сюда' }],
                sections: [],
            }),
            call('H', 'm1', {
                riskFlags: ['door_closed', 'conflict', 'conflict'],
                riskEvidence: [
                    { flag: 'conflict', quote: 'Слушайте сюда' },
                    { flag: 'door_closed', quote: 'Ну и ладно' },
                ],
                sections: [],
            }),
        ]);
        expect(heavier.transcriptionId).toBe('H');
        expect(heavier.reason).toBe(
            'Сигналы риска: конфликт / грубость; после отказа не оставил дверь открытой',
        );
        expect(heavier.reason).not.toMatch(/conflict|door_closed|×/);
        expect(heavier.quote).toBe('Слушайте сюда');
    });

    it('запасные причины: цитата из asWas/quote и charOffset — позиция в тексте или null', () => {
        const [b, c] = buildAgenda([disputed, weak]);
        expect(b.quote).toBe('Дорого');
        expect(b.charOffset).toBe(15);
        expect(b.reason).toBe('Спорное возражение «Цена»: не отработано');

        expect(c.quote).toBe('Что вам нужно?');
        expect(c.charOffset).toBeNull();
        expect(c.reason).toBe('Слабее всего — «Работа по цене»: 6 из 10');
    });

    it('цитата не найдена в тексте → charOffset null', () => {
        const [item] = buildAgenda([
            call('X', 'm1', {
                sections: [section('NEEDS', 2, 1, 'фраза')],
                text: 'другой текст',
            }),
        ]);
        expect(item.quote).toBe('фраза');
        expect(item.charOffset).toBeNull();
    });

    it('limit ограничивает выдачу, 0 → пусто', () => {
        expect(
            buildAgenda(rows, { limit: 2 }).map(item => item.transcriptionId),
        ).toEqual(['P', 'F']);
        expect(buildAgenda(rows, { limit: 0 })).toEqual([]);
    });

    it('звонки без сигнала не попадают в повестку', () => {
        expect(buildAgenda([noSignal])).toEqual([]);
        expect(buildAgenda([])).toEqual([]);
    });

    it('если менеджеров меньше, чем limit — добор вторыми звонками тех же менеджеров', () => {
        const items = buildAgenda([weakerSameManager, risk]);
        expect(items.map(item => item.transcriptionId)).toEqual(['A', 'D']);
    });

    it('внутри раздела «худший» — по наименьшей оценке раздела', () => {
        const items = buildAgenda([
            weak,
            call('D2', 'm1', {
                sections: [section('PRICE', 5, 1, 'Ну так что?')],
            }),
        ]);
        expect(items.map(item => item.transcriptionId)).toEqual(['D2', 'C']);
    });

    it('outcome = disengaged считается спорным даже при handled = true', () => {
        const [item] = buildAgenda([
            call('G', 'm1', {
                objections: [
                    objection({
                        handled: true,
                        outcome: 'disengaged',
                        quote: null,
                    }),
                ],
                sections: [section('CLOSING', 6, 1, 'Ладно')],
            }),
        ]);
        expect(item.kind).toBe('objection');
        expect(item.quote).toBe('Ладно');
        expect(item.reason).toContain('отстранился');
    });
});
