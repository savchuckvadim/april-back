import {
    AgendaCallRow,
    AgendaObjection,
    AgendaSection,
    buildAgenda,
} from '../model/agenda';

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
    callType: 'presentation',
    callStartedAt: new Date('2026-09-08T09:00:00+03:00'),
    score: 6,
    sections: [section('needs', 7), section('closing', 4)],
    objections: [],
    riskFlags: [],
    text: null,
    ...patch,
});

const RISK_TEXT = 'Начало. Я перезвоню когда-нибудь. Конец.';

const risk = call('A', 'm1', {
    riskFlags: ['promise'],
    sections: [section('closing', 3, 1, 'Я перезвоню когда-нибудь')],
    text: RISK_TEXT,
});
const disputed = call('B', 'm2', {
    objections: [objection({ handled: false, outcome: null })],
    text: 'Клиент сказал: Дорого. Менеджер промолчал.',
});
const weak = call('C', 'm3', {
    sections: [section('needs', 2, 1, 'Что вам нужно?'), section('closing', 8)],
});
const weakerSameManager = call('D', 'm1', {
    sections: [section('needs', 1, 1, 'Ну так что?')],
});
const noSignal = call('E', 'm4', {
    sections: [section('needs', 1, 0), section('closing', null)],
});

const rows = [noSignal, weakerSameManager, weak, disputed, risk];

describe('buildAgenda', () => {
    it('риск-флаги → спорные возражения → худший раздел; по одному звонку на менеджера', () => {
        const items = buildAgenda(rows);
        expect(items.map(item => item.transcriptionId)).toEqual([
            'A',
            'B',
            'C',
        ]);
        expect(items.map(item => item.kind)).toEqual([
            'risk',
            'objection',
            'section',
        ]);
        expect(items.map(item => item.managerId)).toEqual(['m1', 'm2', 'm3']);
    });

    it('детерминирован: двойной вызов и перемешанный вход дают равные массивы', () => {
        const first = buildAgenda(rows);
        expect(buildAgenda(rows)).toEqual(first);
        expect(buildAgenda([...rows].reverse())).toEqual(first);
    });

    it('цитата из asWas/quote и charOffset — позиция в тексте или null', () => {
        const [a, b, c] = buildAgenda(rows);
        expect(a.quote).toBe('Я перезвоню когда-нибудь');
        expect(a.charOffset).toBe(
            RISK_TEXT.indexOf('Я перезвоню когда-нибудь'),
        );
        expect(a.reason).toBe('Сигналы риска: необоснованное обещание клиенту');
        expect(a.score).toBe(6);
        expect(a.callType).toBe('presentation');

        expect(b.quote).toBe('Дорого');
        expect(b.charOffset).toBe(15);
        expect(b.reason).toBe('Спорное возражение «Цена»: не отработано');

        expect(c.quote).toBe('Что вам нужно?');
        expect(c.charOffset).toBeNull();
        // Код раздела фикстуры не из справочника — остаётся как есть.
        expect(c.reason).toBe('Слабее всего — «needs»: 2 из 10');
    });

    it('цитата не найдена в тексте → charOffset null', () => {
        const [item] = buildAgenda([
            call('X', 'm1', {
                sections: [section('needs', 2, 1, 'фраза')],
                text: 'другой текст',
            }),
        ]);
        expect(item.quote).toBe('фраза');
        expect(item.charOffset).toBeNull();
    });

    it('limit ограничивает выдачу, 0 → пусто', () => {
        expect(
            buildAgenda(rows, { limit: 2 }).map(item => item.transcriptionId),
        ).toEqual(['A', 'B']);
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
        const items = buildAgenda([weak, weakerSameManager]);
        expect(items.map(item => item.transcriptionId)).toEqual(['D', 'C']);
    });

    it('outcome = disengaged считается спорным даже при handled = true', () => {
        const [item] = buildAgenda([
            call('F', 'm1', {
                objections: [
                    objection({
                        handled: true,
                        outcome: 'disengaged',
                        quote: null,
                    }),
                ],
                sections: [section('closing', 5, 1, 'Ладно')],
            }),
        ]);
        expect(item.kind).toBe('objection');
        expect(item.quote).toBe('Ладно');
        expect(item.reason).toContain('отстранился');
    });

    it('риск без цитат даёт пустую цитату и charOffset null', () => {
        const [item] = buildAgenda([
            call('G', 'm1', {
                riskFlags: ['conflict', 'promise'],
                sections: [],
                text: 'x',
            }),
        ]);
        expect(item.quote).toBe('');
        expect(item.charOffset).toBeNull();
        expect(item.reason).toBe(
            'Сигналы риска: конфликт / грубость; необоснованное обещание клиенту',
        );
    });

    it('повторы одного риск-флага схлопываются в один пункт со счётчиком словами', () => {
        const [item] = buildAgenda([
            call('H', 'm1', {
                riskFlags: [
                    'client_negative',
                    'promise',
                    'client_negative',
                    'client_negative',
                    'promise',
                ],
                sections: [],
            }),
        ]);
        expect(item.reason).toBe(
            'Сигналы риска: сильный негатив клиента (3 раза); ' +
                'необоснованное обещание клиенту (2 раза)',
        );
        // Кодов, дублей и знака «×» в причине нет.
        expect(item.reason).not.toMatch(/client_negative|promise|×/);
        expect(item.reason.split('негатив клиента')).toHaveLength(2);
        // Тяжесть — по числу флагов (5), не по числу видов: порядок прежний.
        const [heavier] = buildAgenda([
            call('I', 'm2', { riskFlags: ['conflict'], sections: [] }),
            call('H', 'm1', {
                riskFlags: ['client_negative', 'client_negative'],
                sections: [],
            }),
        ]);
        expect(heavier.transcriptionId).toBe('H');
    });
});
