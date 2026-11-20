import {
    dealMovementPeriodFromDay,
    dealMovementPeriodSinceMs,
    isDealMovementPeriodDigestDue,
    isoWeekdayOfDay,
    parseDealMovementPeriodDigestMark,
} from '../lib/deal-movement-digest.schedule';
import { DEAL_MOVEMENT_DIGEST_TEXTS } from '../lib/deal-movement-digest.blocks';
import {
    buildDealMovementPeriodDigest,
    DEAL_MOVEMENT_PERIOD_DIGEST_TEXTS,
} from '../lib/deal-movement-period-digest.formatter';
import type { DealMovementDigestDeal } from '../types/deal-movement.types';

const DOMAIN = 'garant.bitrix24.ru';
const URL = `https://${DOMAIN}/crm/deal/details`;
/** Понедельник 23.11.2026; прошлая сводка — понедельник 16.11. */
const MONDAY = '2026-11-23';
const LAST = { day: '2026-11-16', at: '2026-11-15T23:27:00.000Z' };

describe('календарь сводки за период', () => {
    it('день недели по дню портала: 23.11.2026 — понедельник, 29.11 — воскресенье', () => {
        expect(isoWeekdayOfDay(MONDAY)).toBe(1);
        expect(isoWeekdayOfDay('2026-11-29')).toBe(7);
    });

    it('неделя: только выбранный день и не раньше чем через 7 дней', () => {
        const due = (day: string, last = LAST, weekday = 1) =>
            isDealMovementPeriodDigestDue({
                day,
                weekday,
                periodDays: 7,
                last,
            });
        expect(due(MONDAY)).toBe(true);
        expect(due('2026-11-24')).toBe(false);
        expect(due(MONDAY, { ...LAST, day: '2026-11-17' })).toBe(false);
        // Выбран четверг.
        expect(due('2026-11-26', LAST, 4)).toBe(true);
        // Сводки ещё не было — в первый же выбранный день.
        expect(
            isDealMovementPeriodDigestDue({
                day: MONDAY,
                weekday: 1,
                periodDays: 7,
                last: null,
            }),
        ).toBe(true);
    });

    it('две недели: раз в 14 дней; пропущенная ночь — следующий выбранный день', () => {
        const due = (day: string, lastDay: string) =>
            isDealMovementPeriodDigestDue({
                day,
                weekday: 1,
                periodDays: 14,
                last: { day: lastDay, at: `${lastDay}T00:00:00.000Z` },
            });
        expect(due(MONDAY, '2026-11-16')).toBe(false);
        expect(due(MONDAY, '2026-11-09')).toBe(true);
        expect(due('2026-11-30', '2026-11-09')).toBe(true);
    });

    it('«что изменилось» — с прошлой сводки, без неё — с начала периода; битая отметка — null', () => {
        expect(dealMovementPeriodSinceMs(MONDAY, 7, LAST)).toBe(
            Date.parse(LAST.at),
        );
        expect(dealMovementPeriodSinceMs(MONDAY, 14, null)).toBe(
            Date.parse('2026-11-09T00:00:00.000Z'),
        );
        expect(dealMovementPeriodFromDay(MONDAY, 7, LAST)).toBe('2026-11-16');
        expect(dealMovementPeriodFromDay(MONDAY, 14, null)).toBe('2026-11-09');
        expect(parseDealMovementPeriodDigestMark('{"day":1}')).toBeNull();
        expect(parseDealMovementPeriodDigestMark(null)).toBeNull();
    });
});

const deal = (
    dealId: string,
    fields: Partial<DealMovementDigestDeal>,
): DealMovementDigestDeal => ({
    dealId,
    title: `Сделка ${dealId}`,
    assignedById: 7,
    amount: null,
    status: 'moving',
    newFrom: null,
    reasons: 'стадия сделки продвинулась вперёд',
    daysInStage: 2,
    limit: { stageLimitDays: 21, stageLimitSource: 'history' },
    changedAt: null,
    remindStep: null,
    audit: null,
    ...fields,
});

/** Набор РОПа за неделю. */
const DEALS: DealMovementDigestDeal[] = [
    deal('201', {
        title: 'ООО «Альфа»',
        amount: 500_000,
        status: 'stuck',
        reasons:
            'звонки 13.11 и 16.11 (недозвоны), стадия не меняется 63 дня при обычных 21 дне для этой стадии',
        daysInStage: 63,
        changedAt: '2026-11-18T23:27:00.000Z',
        remindStep: 2,
    }),
    deal('202', {
        title: 'ИП Смирнов',
        amount: 80_000,
        status: 'abandoned',
        reasons:
            'ни звонков, ни дел 40 дней; в стадии 50 дней при пороге 21 день',
        daysInStage: 50,
        limit: { stageLimitDays: 21, stageLimitSource: 'default' },
        changedAt: '2026-11-20T23:27:00.000Z',
    }),
    deal('203', {
        title: 'ООО «Вега»',
        amount: 300_000,
        status: 'at_risk',
        reasons: 'договорились на 05.11 — контакта после этого не было',
        daysInStage: 12,
        // Стала «под риском» до прошлой сводки — в «стали» не считается.
        changedAt: '2026-11-10T23:27:00.000Z',
    }),
    deal('204', { title: 'ООО «Бета»', amount: 200_000 }),
];

const NAMES = new Map([[7, 'Иванов Пётр']]);

/** Сводка за неделю — так её увидит руководитель. */
const WEEK_EXAMPLE = [
    '[B]Движение сделок за неделю (с 16.11 по 23.11)[/B]',
    'Движется — 1 · Без продвижения — 1 · Без внимания — 1 · Вернулась назад — 0 · Под риском — 1',
    'С прошлой сводки стали: Без продвижения — 1 · Без внимания — 1 · Вернулась назад — 0 · Под риском — 0',
    '',
    '[B]Крупнейшие проблемные — первые 2 по сумме[/B]',
    `>> [URL=${URL}/201/]ООО «Альфа»[/URL] — Иванов Пётр — 500 000 ₽`,
    '   Без продвижения: звонки 13.11 и 16.11 (недозвоны), стадия не меняется 63 дня при обычных 21 дне для этой стадии',
    `>> [URL=${URL}/203/]ООО «Вега»[/URL] — Иванов Пётр — 300 000 ₽`,
    '   Под риском: договорились на 05.11 — контакта после этого не было',
    '',
    '[B]Без внимания — первые 1 по сумме[/B]',
    `>> [URL=${URL}/202/]ИП Смирнов[/URL] — Иванов Пётр — 80 000 ₽`,
    '   ни звонков, ни дел 40 дней; в стадии 50 дней при пороге 21 день',
    '',
    '[B]Давно без продвижения — первые 1 по сумме[/B]',
    `>> [URL=${URL}/201/]ООО «Альфа»[/URL] — Иванов Пётр — 500 000 ₽`,
    '   в стадии 63 дня при обычных 21 дне для этой стадии — дольше срока больше чем в 2 раза',
    '',
    `[i]${DEAL_MOVEMENT_DIGEST_TEXTS.closing}[/i]`,
].join('\n');

describe('сводка «Движение сделок» за период', () => {
    const build = (deals: readonly DealMovementDigestDeal[], periodDays = 7) =>
        buildDealMovementPeriodDigest({
            domain: DOMAIN,
            day: MONDAY,
            deals,
            userNames: NAMES,
            top: 15,
            periodDays,
            sinceMs: Date.parse(LAST.at),
            fromDay: LAST.day,
        });

    it('счёт, «стали с прошлой сводки», крупнейшие проблемные, «без внимания» отдельно, напоминания', () => {
        const digest = build(DEALS);

        expect(digest?.text).toBe(WEEK_EXAMPLE);
        expect(digest?.heading).toBe(
            'Движение сделок за неделю (с 16.11 по 23.11)',
        );
        expect(digest?.count).toBe(3);
        expect(digest?.text).not.toMatch(
            /rolled_back|at_risk|stuck|abandoned|moving|_|застрял/,
        );
    });

    it('две недели — так и написано; без перемен — «новых проблемных нет», пустые блоки не выводятся', () => {
        const quiet = build(
            DEALS.map(item => ({ ...item, changedAt: null, remindStep: null })),
            14,
        );
        expect(quiet?.heading).toContain('за две недели');
        expect(quiet?.text).toContain(
            DEAL_MOVEMENT_PERIOD_DIGEST_TEXTS.noBecame,
        );
        expect(quiet?.text).not.toContain('Давно без продвижения');
        expect(build([])).toBeNull();
    });
});
