import {
    dealMovementOverdueStep,
    dueDealMovementReminder,
} from '../deal-movement.reminder';
import { DEAL_MOVEMENT_STATUS_TITLES } from '../deal-movement.texts';
import {
    DEAL_MOVEMENT_STATUSES,
    isDealMovementFeedSilent,
    isDealMovementWorsened,
} from '../deal-movement.types';

describe('новая проблемная сделка: переход и ухудшение', () => {
    it('из «Движется» в любой проблемный статус — новая проблема', () => {
        for (const to of [
            'stuck',
            'abandoned',
            'at_risk',
            'rolled_back',
        ] as const) {
            expect(isDealMovementWorsened('moving', to)).toBe(true);
        }
        expect(isDealMovementWorsened('at_risk', 'moving')).toBe(false);
    });

    it('ухудшение: «Без продвижения» → «Под риском» / «Без внимания», любой → «Вернулась назад»', () => {
        expect(isDealMovementWorsened('stuck', 'at_risk')).toBe(true);
        expect(isDealMovementWorsened('stuck', 'abandoned')).toBe(true);
        expect(isDealMovementWorsened('abandoned', 'rolled_back')).toBe(true);
        expect(isDealMovementWorsened('at_risk', 'rolled_back')).toBe(true);
    });

    it('улучшение — не новая проблема: «Без внимания» → «Без продвижения»', () => {
        expect(isDealMovementWorsened('abandoned', 'stuck')).toBe(false);
        expect(isDealMovementWorsened('rolled_back', 'abandoned')).toBe(false);
        expect(isDealMovementWorsened('stuck', 'stuck')).toBe(false);
    });

    it('в ленту не пишется только «Без внимания»', () => {
        expect(DEAL_MOVEMENT_STATUSES.filter(isDealMovementFeedSilent)).toEqual(
            ['abandoned'],
        );
    });

    it('подписи — из одного места, без слова «застряла»', () => {
        expect(DEAL_MOVEMENT_STATUS_TITLES).toEqual({
            rolled_back: 'Вернулась назад',
            abandoned: 'Без внимания',
            stuck: 'Без продвижения',
            at_risk: 'Под риском',
            moving: 'Движется',
        });
    });
});

describe('напоминания «Давно без продвижения» по ступеням', () => {
    it('ступень — сколько раз дни в стадии ПРЕВЫСИЛИ срок', () => {
        const step = (daysInStage: number) =>
            dealMovementOverdueStep({ daysInStage, stageLimitDays: 21 });
        expect(step(21)).toBe(0);
        expect(step(22)).toBe(1);
        expect(step(42)).toBe(1);
        expect(step(43)).toBe(2);
        expect(step(63)).toBe(2);
        expect(step(64)).toBe(3);
        expect(
            dealMovementOverdueStep({ daysInStage: 9, stageLimitDays: 0 }),
        ).toBe(0);
    });

    it('напоминаем с двойного срока, каждую ступень один раз', () => {
        const facts = { daysInStage: 50, stageLimitDays: 21 };
        expect(dueDealMovementReminder('stuck', facts, 0)).toBe(2);
        expect(dueDealMovementReminder('abandoned', facts, 0)).toBe(2);
        // Ступень 2 уже напоминали — ждём третью.
        expect(dueDealMovementReminder('stuck', facts, 2)).toBeNull();
        expect(
            dueDealMovementReminder(
                'stuck',
                { daysInStage: 70, stageLimitDays: 21 },
                2,
            ),
        ).toBe(3);
        // Меньше двойного срока — рано.
        expect(
            dueDealMovementReminder(
                'stuck',
                { daysInStage: 40, stageLimitDays: 21 },
                0,
            ),
        ).toBeNull();
    });

    it('только «стоит в стадии»: другие статусы не напоминаются; прошлая ступень выше нынешней — сброс', () => {
        const facts = { daysInStage: 50, stageLimitDays: 21 };
        expect(dueDealMovementReminder('at_risk', facts, 0)).toBeNull();
        expect(dueDealMovementReminder('moving', facts, 0)).toBeNull();
        expect(dueDealMovementReminder('rolled_back', facts, 0)).toBeNull();
        // Напоминали ступень 4, а сейчас 2 (стадия заново) — снова пора.
        expect(dueDealMovementReminder('stuck', facts, 4)).toBe(2);
    });
});
