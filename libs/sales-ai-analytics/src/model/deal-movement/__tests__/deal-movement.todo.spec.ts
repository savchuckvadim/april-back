import {
    buildDealMovementTodoContent,
    checkDealMovementTodo,
    DEAL_MOVEMENT_TODO_DROP,
    needsDealMovementTodo,
    parseDealMovementTodo,
    type DealMovementTodoInput,
} from '../deal-movement.todo';
import {
    DEAL_MOVEMENT_TODO_LIMITS,
    DEAL_MOVEMENT_TODO_SCHEMA,
} from '../deal-movement.todo.prompt';

const input: DealMovementTodoInput = {
    status: 'at_risk',
    reasons: ['договорились на 05.11 — контакта после этого не было'],
    daysInStage: 12,
    agreement: { date: '05.11', text: 'Покажет демо-доступ директору' },
    lastCall: {
        date: '03.11',
        summary: 'Обсудили тариф на 45 000 ₽, клиент сравнивает с конкурентом.',
        after: 'Договорились показать директору.',
    },
};

const content = buildDealMovementTodoContent(input);

describe('«что сделать»: вход модели', () => {
    it('статус и причины словами, дни, договорённость и резюме звонка — без кодов', () => {
        expect(content).toContain('Статус сделки: Под риском.');
        expect(content).toContain('В текущей стадии: 12 дней.');
        expect(content).toContain('дата — 05.11; о чём — Покажет демо-доступ');
        expect(content).toContain('Резюме звонка: Обсудили тариф');
        expect(content).not.toMatch(/at_risk|_/);
    });

    it('нет договорённости и звонков — так и сказано', () => {
        const empty = buildDealMovementTodoContent({
            ...input,
            agreement: null,
            lastCall: null,
        });
        expect(empty).toContain('Последняя договорённость: нет.');
        expect(empty).toContain('Последний разобранный звонок: нет.');
    });

    it('просим только у тревожных статусов; схема строгая, 3–5 строк', () => {
        expect(needsDealMovementTodo('stuck')).toBe(true);
        expect(needsDealMovementTodo('rolled_back')).toBe(true);
        expect(needsDealMovementTodo('at_risk')).toBe(true);
        expect(needsDealMovementTodo('moving')).toBe(false);
        expect(DEAL_MOVEMENT_TODO_SCHEMA).toMatchObject({
            additionalProperties: false,
            required: ['actions'],
            properties: {
                actions: {
                    minItems: DEAL_MOVEMENT_TODO_LIMITS.askMin,
                    maxItems: DEAL_MOVEMENT_TODO_LIMITS.askMax,
                },
            },
        });
    });
});

describe('«что сделать»: разбор и проверка ответа', () => {
    it('ответ не той формы — null', () => {
        expect(parseDealMovementTodo(null)).toBeNull();
        expect(parseDealMovementTodo({ items: [] })).toBeNull();
        expect(parseDealMovementTodo({ actions: ['а', 1, 'б'] })).toEqual([
            'а',
            'б',
        ]);
    });

    it('каждая плохая строка выбрасывается со своей причиной', () => {
        const check = checkDealMovementTodo(
            [
                '1. Позвонить директору до 05.11 и показать демо-доступ',
                '— Отправить предложение на 45 000 ₽',
                'Назначить встречу на 20.11',
                'Отправить КП в WhatsApp',
                'Позвонить, потому что клиент молчит',
                'Позвонить трём сотрудникам клиента',
                'Это критически важная сделка, позвонить сегодня',
                'Позвонить директору до 05.11 и показать демо-доступ',
                `Позвонить ${'очень '.repeat(25)}долго`,
                '   ',
            ],
            content,
        );

        expect(check.actions).toEqual([
            'Позвонить директору до 05.11 и показать демо-доступ',
            'Отправить предложение на 45 000 ₽',
        ]);
        expect(check.dropped).toEqual([
            DEAL_MOVEMENT_TODO_DROP.alienNumber,
            DEAL_MOVEMENT_TODO_DROP.latin,
            DEAL_MOVEMENT_TODO_DROP.causal,
            DEAL_MOVEMENT_TODO_DROP.numberWord,
            DEAL_MOVEMENT_TODO_DROP.forbidden,
            DEAL_MOVEMENT_TODO_DROP.duplicate,
            DEAL_MOVEMENT_TODO_DROP.tooLong,
            DEAL_MOVEMENT_TODO_DROP.empty,
        ]);
    });

    it('меньше двух годных строк — блока нет', () => {
        expect(
            checkDealMovementTodo(
                ['Позвонить директору', 'Send email'],
                content,
            ).actions,
        ).toBeNull();
    });

    it('годных больше пяти — берутся первые пять', () => {
        const lines = [
            'Позвонить директору',
            'Отправить предложение',
            'Назначить встречу',
            'Уточнить бюджет',
            'Показать демо-доступ',
            'Согласовать договор',
        ];
        expect(checkDealMovementTodo(lines, content).actions).toEqual(
            lines.slice(0, 5),
        );
    });
});
