import {
    DealAuditDomainOutcome,
    formatDealAuditRoster,
    formatDealAuditTick,
    shouldNotifyDealAuditTick,
} from '../lib/deal-audit-tick-report';
import { DealAuditRunResult } from '../types/deal-audit.types';

const result = (
    overrides: Partial<DealAuditRunResult> = {},
): DealAuditRunResult => ({
    domain: 'a.bitrix24.ru',
    scanned: 412,
    written: 0,
    flagged: 57,
    byStatus: {},
    verdicts: [],
    dryRun: false,
    digestSent: 3,
    warnings: [],
    ...overrides,
});

const ran = (
    overrides: Partial<Extract<DealAuditDomainOutcome, { kind: 'ran' }>> = {},
): DealAuditDomainOutcome => ({
    kind: 'ran',
    domain: 'a.bitrix24.ru',
    countOnly: false,
    hasRecipients: true,
    result: result(),
    ...overrides,
});

describe('shouldNotifyDealAuditTick', () => {
    it('все порталы ждут интервала — в Telegram не шлём', () => {
        expect(
            shouldNotifyDealAuditTick([
                { kind: 'waiting', domain: 'a.bitrix24.ru' },
            ]),
        ).toBe(false);
    });

    it('прогон или ошибка хотя бы на одном портале — шлём', () => {
        expect(shouldNotifyDealAuditTick([ran()])).toBe(true);
        expect(
            shouldNotifyDealAuditTick([
                { kind: 'failed', domain: 'b.bitrix24.ru', error: 'boom' },
            ]),
        ).toBe(true);
    });
});

describe('formatDealAuditTick', () => {
    it('строка на прогнанный портал, ошибка и число ждущих', () => {
        const text = formatDealAuditTick([
            ran(),
            { kind: 'failed', domain: 'b.bitrix24.ru', error: 'timeout' },
            { kind: 'waiting', domain: 'c.bitrix24.ru' },
        ]);

        expect(text.split('\n')).toEqual([
            '🧹 Аудит сделок — прогон',
            '✅ a.bitrix24.ru: сделок 412, забытых 57, размечено 0, сводок 3',
            '❌ b.bitrix24.ru: ошибка — timeout',
            '⏳ ждут своего интервала: 1',
        ]);
    });

    it('«только считать» объясняет, почему сводок ноль', () => {
        const text = formatDealAuditTick([
            ran({ countOnly: true, result: result({ digestSent: 0 }) }),
        ]);

        expect(text).toContain('⏸ a.bitrix24.ru');
        expect(text).toContain(
            'только считать — ничего не пишет и не рассылает',
        );
    });

    it('без получателей подсказывает настройку', () => {
        expect(formatDealAuditTick([ran({ hasRecipients: false })])).toContain(
            'получатели сводки не заданы',
        );
    });

    it('показывает три предупреждения, остальные — числом', () => {
        const text = formatDealAuditTick([
            ran({
                result: result({ warnings: ['w1', 'w2', 'w3', 'w4', 'w5'] }),
            }),
        ]);

        expect(text).toContain('⚠ w3');
        expect(text).not.toContain('⚠ w4');
        expect(text).toContain('… и ещё предупреждений: 2');
    });

    it('длинную ошибку обрезает', () => {
        const text = formatDealAuditTick([
            { kind: 'failed', domain: 'b.bitrix24.ru', error: 'x'.repeat(500) },
        ]);

        expect(text.length).toBeLessThan(300);
        expect(text.endsWith('…')).toBe(true);
    });
});

describe('formatDealAuditRoster', () => {
    it('ни одного портала — прямо говорит, что крон работает вхолостую', () => {
        expect(formatDealAuditRoster([])).toContain(
            'не включён ни на одном портале',
        );
    });

    it('портал, режим и интервал в часах', () => {
        const text = formatDealAuditRoster([
            {
                domain: 'a.bitrix24.ru',
                countOnly: true,
                hasRecipients: true,
                intervalMinutes: 1440,
            },
            {
                domain: 'b.bitrix24.ru',
                countOnly: false,
                hasRecipients: true,
                intervalMinutes: 90,
            },
        ]);

        expect(text.split('\n')).toEqual([
            '🧹 Аудит сделок включён на порталах: 2',
            '• a.bitrix24.ru — только считать — ничего не пишет и не рассылает, раз в 24 ч',
            '• b.bitrix24.ru — сводки рассылаются, раз в 90 мин',
        ]);
    });
});
