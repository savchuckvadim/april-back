import { effectiveDealLastActivityAt } from '../deal-movement.activity';
import {
    buildDealMovementNote,
    dealMovementCommentText,
    DEAL_MOVEMENT_NOTE_TEXTS,
} from '../deal-movement.note';
import type { DealMovementVerdict } from '../deal-movement.types';

/** Наша запись ушла в 02:30 UTC 17.11; до неё последняя работа — 10.11. */
const NOTIFIED_AT = '2026-11-17T02:30:00.000Z';
const BEFORE_NOTE = '2026-11-10T09:00:00.000Z';
const previous = { lastActivityAt: BEFORE_NOTE, notifiedAt: NOTIFIED_AT };

describe('своя запись — не активность', () => {
    it('активность в окне нашей записи — берётся прошлое значение', () => {
        // Через 40 секунд после записи и за минуту до неё (часы расходятся).
        expect(
            effectiveDealLastActivityAt('2026-11-17T02:30:40.000Z', previous),
        ).toBe(BEFORE_NOTE);
        expect(
            effectiveDealLastActivityAt('2026-11-17T02:29:00.000Z', previous),
        ).toBe(BEFORE_NOTE);
        expect(
            effectiveDealLastActivityAt('2026-11-17T02:45:00.000Z', previous),
        ).toBe(BEFORE_NOTE);
    });

    it('чужая активность позже окна — значение Битрикса', () => {
        const later = '2026-11-17T09:15:00.000Z';
        expect(effectiveDealLastActivityAt(later, previous)).toBe(later);
        expect(
            effectiveDealLastActivityAt('2026-11-17T02:45:01.000Z', previous),
        ).toBe('2026-11-17T02:45:01.000Z');
    });

    it('записи ещё не было или состояния нет — значение Битрикса', () => {
        const current = '2026-11-16T12:00:00.000Z';
        expect(
            effectiveDealLastActivityAt(current, {
                lastActivityAt: BEFORE_NOTE,
                notifiedAt: null,
            }),
        ).toBe(current);
        expect(effectiveDealLastActivityAt(current, null)).toBe(current);
        expect(effectiveDealLastActivityAt(null, previous)).toBeNull();
    });
});

const verdict = (
    status: DealMovementVerdict['status'],
    reasons: DealMovementVerdict['reasons'],
): DealMovementVerdict => ({
    dealId: '9041',
    status,
    reasons,
    facts: {
        daysInStage: 23,
        stageLimitDays: 21,
        stepDate: '2026-11-05',
        lastProgress: null,
        daysSinceAgreed: null,
    },
});

const CODES = /rolled_back|at_risk|moving|stuck|stage_|step_|_/;

describe('запись в ленту сделки', () => {
    it('тревожный статус: было → стало, причины, дни в стадии, «Что сделать», итоговая строка', () => {
        const note = buildDealMovementNote({
            verdict: verdict('at_risk', ['step_overdue']),
            from: 'moving',
            actions: ['Позвонить ЛПР и уточнить решение', 'Отправить счёт'],
        });

        expect(note.title).toBe('Движение сделки: Под риском');
        expect(note.text).toBe(
            [
                'Статус: Под риском (было: Движется).',
                'Почему:',
                '— договорились на 05.11 — контакта после этого не было',
                'В текущей стадии: 23 дня.',
                '',
                'Что сделать:',
                '— Позвонить ЛПР и уточнить решение',
                '— Отправить счёт',
                '',
                DEAL_MOVEMENT_NOTE_TEXTS.closing,
            ].join('\n'),
        );
        expect(note.text).not.toMatch(CODES);
    });

    it('без подсказки модели — запись без блока «Что сделать»', () => {
        const note = buildDealMovementNote({
            verdict: verdict('stuck', ['stage_overdue']),
            from: 'moving',
            actions: null,
        });
        expect(note.text).not.toContain('Что сделать');
        expect(note.text).toContain('в стадии 23 дня при сроке 21 день');
    });

    it('«Движется» — без блока «Что сделать», даже если строки есть', () => {
        const note = buildDealMovementNote({
            verdict: verdict('moving', ['stage_forward']),
            from: 'stuck',
            actions: ['Позвонить клиенту'],
        });
        expect(note.title).toBe('Движение сделки: Движется');
        expect(note.text).toContain('(было: Застряла)');
        expect(note.text).not.toContain('Что сделать');
    });

    it('комментарий — заголовок первой строкой', () => {
        const text = dealMovementCommentText({ title: 'З', text: 'Т' });
        expect(text).toBe('З\n\nТ');
    });
});
