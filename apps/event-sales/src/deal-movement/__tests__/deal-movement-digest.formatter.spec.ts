import { DEAL_MOVEMENT_DIGEST } from '../constants/deal-movement.const';
import { buildDealMovementDigestDeals } from '../lib/deal-movement-digest-deals';
import {
    buildDealMovementDigest,
    DEAL_MOVEMENT_DIGEST_TEXTS,
    shouldSendDealMovementDigest,
} from '../lib/deal-movement-digest.formatter';
import type { DealMovementDigestDeal } from '../types/deal-movement.types';

const DOMAIN = 'garant.bitrix24.ru';
const DAY = '2026-11-18';
const URL = `https://${DOMAIN}/crm/deal/details`;

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
    ...fields,
});

/** Набор РОПа: три новые за ночь, три старые под риском, одна движется. */
const DEALS: DealMovementDigestDeal[] = [
    deal('101', {
        title: 'ООО «Альфа»',
        amount: 450_000,
        status: 'rolled_back',
        newFrom: 'moving',
        reasons: 'стадия сделки вернулась назад',
        daysInStage: 5,
    }),
    deal('102', {
        title: 'ИП Смирнов',
        assignedById: 8,
        amount: 120_000,
        status: 'stuck',
        newFrom: 'moving',
        reasons:
            'в стадии 30 дней при сроке 21 день, работы по сделке за последнее время нет',
        daysInStage: 30,
    }),
    deal('103', {
        title: 'ООО «Вега»',
        amount: 300_000,
        status: 'at_risk',
        newFrom: 'moving',
        reasons: 'договорились на 05.11 — контакта после этого не было',
        daysInStage: 12,
    }),
    deal('104', {
        title: 'АО «Сигма»',
        assignedById: 8,
        amount: 900_000,
        status: 'at_risk',
        reasons: 'клиент согласился по звонку, а стадия не меняется 14 дней',
        daysInStage: 20,
    }),
    deal('105', {
        title: 'ООО «Омега»',
        assignedById: 99,
        status: 'at_risk',
        reasons: 'два последних звонка подряд ничего не изменили по сделке',
        daysInStage: 8,
    }),
    deal('106', { title: 'ООО «Бета»', amount: 200_000 }),
    deal('107', {
        title: 'ООО «Гамма»',
        assignedById: 8,
        amount: 900_000,
        status: 'at_risk',
        reasons: 'клиент согласился по звонку, а стадия не меняется 12 дней',
        daysInStage: 25,
    }),
];

const NAMES = new Map([
    [7, 'Иванов Пётр'],
    [8, 'Петрова Анна'],
]);

/** Готовая сводка РОПа — так её увидит руководитель. */
const DIGEST_EXAMPLE = [
    '[B]Движение сделок за 18.11[/B]',
    'Движется — 1 · Застряла — 1 · Откатилась — 1 · Под риском — 4',
    '',
    '[B]Новые за ночь — 3[/B]',
    `>> [URL=${URL}/101/]ООО «Альфа»[/URL] — Иванов Пётр — 450 000 ₽`,
    '   Движется → Откатилась: стадия сделки вернулась назад',
    `>> [URL=${URL}/102/]ИП Смирнов[/URL] — Петрова Анна — 120 000 ₽`,
    '   Движется → Застряла: в стадии 30 дней при сроке 21 день, работы по сделке за последнее время нет',
    `>> [URL=${URL}/103/]ООО «Вега»[/URL] — Иванов Пётр — 300 000 ₽`,
    '   Движется → Под риском: договорились на 05.11 — контакта после этого не было',
    '',
    '[B]Под риском — первые 3 по сумме[/B]',
    `>> [URL=${URL}/107/]ООО «Гамма»[/URL] — Петрова Анна — 900 000 ₽`,
    '   клиент согласился по звонку, а стадия не меняется 12 дней',
    `>> [URL=${URL}/104/]АО «Сигма»[/URL] — Петрова Анна — 900 000 ₽`,
    '   клиент согласился по звонку, а стадия не меняется 14 дней',
    `>> [URL=${URL}/105/]ООО «Омега»[/URL] — ответственный не указан`,
    '   два последних звонка подряд ничего не изменили по сделке',
    '',
    `[i]${DEAL_MOVEMENT_DIGEST_TEXTS.closing}[/i]`,
].join('\n');

describe('сводка «Движение сделок» руководителю', () => {
    it('шапка со счётом набора, новые за ночь по важности, под риском по сумме без повторов, итоговая строка', () => {
        const digest = buildDealMovementDigest({
            domain: DOMAIN,
            day: DAY,
            deals: DEALS,
            top: 15,
            userNames: NAMES,
        });

        expect(digest?.text).toBe(DIGEST_EXAMPLE);
        expect(digest?.heading).toBe('Движение сделок за 18.11');
        // В названии задачи — сколько проблемных в наборе.
        expect(digest?.count).toBe(6);
        // Короткая сводка — одно сообщение.
        expect(digest?.messages).toEqual([DIGEST_EXAMPLE]);
        expect(digest?.text).not.toMatch(/rolled_back|at_risk|stuck|moving|_/);
        // Номера сотрудников на экран не выводятся.
        expect(digest?.text).not.toContain('ID 99');
    });

    it('«Под риском» — первые N из настройки; при равной сумме — кто дольше в стадии', () => {
        const digest = buildDealMovementDigest({
            domain: DOMAIN,
            day: DAY,
            deals: DEALS,
            top: 1,
            userNames: NAMES,
        });
        expect(digest?.text).toContain('[B]Под риском — первые 1 по сумме[/B]');
        expect(digest?.text).toContain('ООО «Гамма»');
        expect(digest?.text).not.toContain('АО «Сигма»');
    });

    it('новых нет — так и сказано; сделок нет — сводки нет', () => {
        const quiet = buildDealMovementDigest({
            domain: DOMAIN,
            day: DAY,
            deals: DEALS.filter(item => item.newFrom === null),
            top: 15,
            userNames: NAMES,
        });
        expect(quiet?.text).toContain(DEAL_MOVEMENT_DIGEST_TEXTS.noNew);
        expect(
            buildDealMovementDigest({
                domain: DOMAIN,
                day: DAY,
                deals: [],
                top: 15,
                userNames: NAMES,
            }),
        ).toBeNull();
    });

    it('новых больше пятнадцати — «и ещё N»; длинная серия режется на сообщения', () => {
        const many = Array.from({ length: 40 }, (_, index) =>
            deal(String(1000 + index), {
                title: `ООО «Компания ${index}» ${'очень длинное название '.repeat(30)}`,
                status: 'stuck',
                newFrom: 'moving',
                reasons: 'в стадии 30 дней при сроке 21 день, '.repeat(20),
            }),
        );
        const digest = buildDealMovementDigest({
            domain: DOMAIN,
            day: DAY,
            deals: many,
            top: 15,
            userNames: NAMES,
        });

        expect(digest?.text).toContain('[B]Новые за ночь — 40[/B]');
        expect(digest?.text).toContain(
            `[i]…и ещё ${40 - DEAL_MOVEMENT_DIGEST.newLimit}[/i]`,
        );
        expect(digest?.messages.length).toBeGreaterThan(1);
        for (const message of digest?.messages ?? []) {
            expect(message.length).toBeLessThanOrEqual(
                DEAL_MOVEMENT_DIGEST.messageMax,
            );
        }
    });
});

describe('слать ли сводку получателю', () => {
    const oldRisk = DEALS.filter(item => item.newFrom === null);
    const moving = DEALS.filter(item => item.status === 'moving');

    it('«только новые» — если в наборе есть сделки, ставшие тревожными этой ночью', () => {
        expect(shouldSendDealMovementDigest(DEALS, 'new_only')).toBe(true);
        expect(shouldSendDealMovementDigest(oldRisk, 'new_only')).toBe(false);
    });

    it('«каждое утро» — если есть хоть одна сделка не «движется»', () => {
        expect(shouldSendDealMovementDigest(oldRisk, 'daily')).toBe(true);
        expect(shouldSendDealMovementDigest(moving, 'daily')).toBe(false);
    });
});

describe('сделки сводки из ночи', () => {
    it('новая за ночь — смена на тревожный статус; смена на «движется» — не новая', () => {
        const verdict = (
            dealId: string,
            status: DealMovementDigestDeal['status'],
        ) => ({
            verdict: {
                dealId,
                status,
                reasons: [
                    status === 'moving' ? 'stage_forward' : 'stage_back',
                ] as ('stage_forward' | 'stage_back')[],
                facts: {
                    daysInStage: 4,
                    stageLimitDays: 21,
                    stepDate: null,
                    lastProgress: null,
                    daysSinceAgreed: null,
                },
            },
            title: `Сделка ${dealId}`,
            stageCode: null,
            amount: 1000,
            assignedById: 7,
            lastActivityAt: null,
        });
        const change = (
            dealId: string,
            from: 'moving' | 'stuck',
            to: 'moving' | 'rolled_back',
        ) => ({
            dealId,
            title: `Сделка ${dealId}`,
            assignedById: 7,
            amount: 1000,
            from,
            to,
            reasons: [],
        });

        const deals = buildDealMovementDigestDeals(
            [
                verdict('1', 'rolled_back'),
                verdict('2', 'moving'),
                verdict('3', 'stuck'),
            ],
            [
                change('1', 'moving', 'rolled_back'),
                change('2', 'stuck', 'moving'),
            ],
        );

        expect(deals).toEqual([
            expect.objectContaining({
                dealId: '1',
                newFrom: 'moving',
                reasons: 'стадия сделки вернулась назад',
                daysInStage: 4,
            }),
            expect.objectContaining({ dealId: '2', newFrom: null }),
            expect.objectContaining({ dealId: '3', newFrom: null }),
        ]);
    });
});
