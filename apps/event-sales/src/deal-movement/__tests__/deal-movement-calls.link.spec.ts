import type { DealMovementCall } from '@lib/sales-ai-analytics';
import { toDealMovementCallRef } from '../lib/deal-movement-call-ref';
import {
    indexOpenDeals,
    linkCallsToDeals,
    mayBelongToDeals,
} from '../lib/deal-movement-calls.link';
import type { DealMovementCallRef } from '../types/deal-movement.types';
import { dealRow } from './deal-movement.fixture';

const call = (day: number): DealMovementCall => ({
    at: `2026-11-${String(day).padStart(2, '0')}T10:00:00.000Z`,
    progress: null,
    nextStep: null,
});

const ref = (
    entityType: string | null,
    entityId: number | null,
    day: number,
    mainDealId: number | null = null,
): DealMovementCallRef => ({
    transcriptionId: `t${day}`,
    entityType,
    entityId,
    mainDealId,
    call: call(day),
});

const deals = [
    dealRow(100, { companyId: 1, contactId: 11, leadId: 21 }),
    dealRow(200, { companyId: 2, contactId: 12 }),
    // У компании 3 две открытые сделки — звонок по компании неоднозначен.
    dealRow(300, { companyId: 3 }),
    dealRow(301, { companyId: 3, contactId: 12 }),
];
const index = indexOpenDeals(deals);

describe('сцепка разобранных звонков с открытыми сделками', () => {
    it('пять путей по порядку, неоднозначность — не сцеплен', () => {
        const linked = linkCallsToDeals(
            [
                // 1. Основная по разбору важнее сущности звонка.
                ref('deal', 999, 1, 200),
                // 2. Сам звонок на открытой сделке.
                ref('deal', 100, 2),
                // 3. По лиду, из которого сделка.
                ref('lead', 21, 3),
                // 4. По компании с одной открытой сделкой.
                ref('company', 2, 4),
                // 4'. Компания с двумя открытыми — пропуск.
                ref('company', 3, 5),
                // 5. Основной контакт двух сделок (200 и 301) — пропуск.
                ref('contact', 12, 6),
                // 5. Основной контакт одной сделки.
                ref('contact', 11, 7),
                // Сделка другой воронки без догадки разбора — пропуск.
                ref('deal', 999, 8),
                // Основная по разбору, но закрыта — дальше по сущности.
                ref('deal', 100, 9, 555),
            ],
            index,
        );

        expect(linked.get(200)).toEqual([call(1), call(4)]);
        expect(linked.get(100)).toEqual([call(2), call(3), call(7), call(9)]);
        expect(linked.has(300)).toBe(false);
        expect(linked.has(301)).toBe(false);
    });

    it('разборы читаются только у звонков, которые могут относиться к открытым сделкам', () => {
        expect(mayBelongToDeals('deal', 999, index)).toBe(true);
        expect(mayBelongToDeals('lead', 21, index)).toBe(true);
        expect(mayBelongToDeals('lead', 22, index)).toBe(false);
        expect(mayBelongToDeals('company', 3, index)).toBe(true);
        expect(mayBelongToDeals('contact', 99, index)).toBe(false);
        expect(mayBelongToDeals('deal', null, index)).toBe(false);
        expect(mayBelongToDeals(null, 1, index)).toBe(false);
    });
});

describe('проекция разбора звонка', () => {
    const row = {
        id: '77',
        callStartedAt: new Date('2026-11-12T08:30:00.000Z'),
        createdAt: new Date('2026-11-12T09:00:00.000Z'),
        entityType: 'Company ',
        entityId: '5',
    };

    it('продвижение, договорённость и основная сделка из разбора; сущность нормализована', () => {
        expect(
            toDealMovementCallRef(row, {
                dealProgress: { score: 4, comment: 'согласился' },
                nextStep: { set: true, date: '2026-11-20', description: 'КП' },
                relatedDeals: { mainDealId: 9041 },
                dialog: [{ text: 'длинный диалог не нужен' }],
            }),
        ).toEqual({
            transcriptionId: '77',
            entityType: 'company',
            entityId: 5,
            mainDealId: 9041,
            call: {
                at: '2026-11-12T08:30:00.000Z',
                progress: 4,
                nextStep: { set: true, date: '2026-11-20' },
            },
        });
    });

    it('чужая форма разбора — звонок без оценок; без момента звонка — null', () => {
        expect(
            toDealMovementCallRef(row, {
                dealProgress: 'высокое',
                relatedDeals: { mainDealId: 'нет' },
            }),
        ).toMatchObject({
            mainDealId: null,
            call: { progress: null, nextStep: null },
        });
        expect(
            toDealMovementCallRef(
                { ...row, callStartedAt: null, createdAt: null },
                {},
            ),
        ).toBeNull();
    });
});
