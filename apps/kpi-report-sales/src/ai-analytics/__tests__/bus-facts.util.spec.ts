import 'reflect-metadata';
import type { ManagerPassport, PlanSnapshot } from '@lib/sales-ai-analytics';
import {
    readChainSharePct,
    readPassports,
    readPlans,
    readStyles,
} from '../domain/assembler/bus-facts.util';

/**
 * Контракт шины между потоками волны 4: паспорт (шаг паспорта), снимок
 * планов (шаг планов), доля сцепки (шаг истории стадий) и профиль стиля
 * читаются структурно. Чужая или неполная форма деградирует до пустого
 * значения, а не роняет месячный снапшот.
 */
const passport: ManagerPassport = {
    managerId: '10',
    since: '2026-01-15',
    sinceSource: 'employment',
    status: 'active',
    leftAt: null,
    level: 'middle',
    levelSource: 'default',
    tenureMonths: 8,
    tenureBand: '6-18',
};

const planSnapshot: PlanSnapshot = {
    monthKey: '2026-09',
    takenOn: '2026-09-01',
    managers: [
        {
            managerId: '10',
            sales: 5,
            calls: 400,
            presentations: 30,
            targets: {},
        },
    ],
    achieversShare: 0.5,
    factMonths: ['2026-06', '2026-07', '2026-08'],
    factManagers: 4,
    planIsWish: false,
    reason: null,
};

describe('Чтение паспорта из шины', () => {
    it('контракт ManagerPassport читается целиком', () => {
        expect(readPassports([passport]).get('10')).toEqual(passport);
    });

    it('managerId числом нормализуется в строку ключа', () => {
        expect(readPassports([{ ...passport, managerId: 10 }]).has('10')).toBe(
            true,
        );
    });

    it('чужая форма и пустая шина дают пустую карту', () => {
        expect(readPassports(undefined).size).toBe(0);
        expect(readPassports('строка').size).toBe(0);
        expect(readPassports([{ level: 'middle' }]).size).toBe(0);
    });
});

describe('Чтение снимка планов из шины', () => {
    it('конверт PlanSnapshot разворачивается по менеджерам', () => {
        expect(readPlans(planSnapshot).get('10')).toEqual({
            sales: 5,
            calls: 400,
            presentations: 30,
        });
    });

    it('плана нет — цели null, а не нули', () => {
        expect(readPlans([{ managerId: '10', sales: null }]).get('10')).toEqual(
            { sales: null, calls: null, presentations: null },
        );
    });

    it('снимка планов в шине нет — карта пуста', () => {
        expect(readPlans(undefined).size).toBe(0);
    });
});

describe('Чтение доли сцепки и профиля стиля', () => {
    it('доля сцепки читается из формы писателя `EpisodesChain.sharePct`', () => {
        // Форма ключа `chain` — объект ассемблера эпизодов; полный контракт
        // «stage-history пишет → читают» — в bus-contract.spec.ts.
        expect(readChainSharePct({ sharePct: 85, links: [] })).toBe(85);
        expect(readChainSharePct({ sharePct: 0, links: [] })).toBe(0);
    });

    it('чужая форма (число, поле-дубль, пустая шина) даёт 0 — рёбра остаются rate', () => {
        expect(readChainSharePct(85)).toBe(0);
        expect(readChainSharePct({ chainSharePct: 70 })).toBe(0);
        expect(readChainSharePct({ sharePct: 'много' })).toBe(0);
        expect(readChainSharePct(undefined)).toBe(0);
        expect(readChainSharePct({ other: 1 })).toBe(0);
    });

    it('профиль стиля читается по менеджеру, подписи без кода отбрасываются', () => {
        const facts = readStyles([
            {
                managerId: '10',
                style: {
                    calls: 42,
                    peers: 6,
                    vector: { inquiry: 0.4 },
                    tags: [
                        { code: 'inquiry_plus', title: 'Исследует', n: 42 },
                        { title: 'без кода' },
                    ],
                    confidence: 'ok',
                    confidenceReason: null,
                    window: ['2026-07', '2026-08', '2026-09'],
                },
            },
        ]).get('10');

        expect(facts?.calls).toBe(42);
        expect(facts?.tags).toEqual([
            {
                code: 'inquiry_plus',
                title: 'Исследует',
                basis: '',
                n: 42,
            },
        ]);
        expect(facts?.window).toEqual(['2026-07', '2026-08', '2026-09']);
    });

    it('профиля стиля в шине нет — карта пуста', () => {
        expect(readStyles(undefined).size).toBe(0);
        expect(readStyles([{ managerId: '10' }]).size).toBe(0);
    });
});
