import {
    DEAL_AUDIT_FLAG,
    DEAL_AUDIT_STATUS,
} from '../../deal-audit/constants/deal-audit.const';
import type { DealAuditFinding } from '../../deal-audit/services/deal-audit-findings.store';
import {
    dealAuditNotesOf,
    dealMovementAuditNote,
    freshDealAuditFindings,
} from '../lib/deal-movement-audit-note';

/** Ночь движения сделок: 18.11 02:27 МСК. */
const NOW = new Date('2026-11-17T23:27:00.000Z');

const finding = (fields: Partial<DealAuditFinding> = {}): DealAuditFinding => ({
    status: DEAL_AUDIT_STATUS.noTask,
    flags: [DEAL_AUDIT_FLAG.noTask],
    idleDays: 18,
    overdueDays: 0,
    // Аудит прошёл в ночь на понедельник 16.11.
    at: '2026-11-15T22:30:00.000Z',
    ...fields,
});

describe('пометка аудита в сводке «Движение сделок»', () => {
    it('до двух признаков словами — важные первыми, с числом дней', () => {
        expect(
            dealMovementAuditNote(
                finding({
                    flags: [
                        DEAL_AUDIT_FLAG.nextDateEmpty,
                        DEAL_AUDIT_FLAG.idle,
                        DEAL_AUDIT_FLAG.noTask,
                    ],
                }),
            ),
        ).toBe('ещё и по аудиту: без задач, нет работы 18 дней');
        expect(
            dealMovementAuditNote(
                finding({
                    status: DEAL_AUDIT_STATUS.taskOverdue,
                    flags: [DEAL_AUDIT_FLAG.taskOverdue],
                    overdueDays: 5,
                }),
            ),
        ).toBe('ещё и по аудиту: задача просрочена на 5 дней');
        expect(
            dealMovementAuditNote(
                finding({
                    status: DEAL_AUDIT_STATUS.forgotClose,
                    flags: [
                        DEAL_AUDIT_FLAG.stageStuck,
                        DEAL_AUDIT_FLAG.forgotClose,
                    ],
                }),
            ),
        ).toBe('ещё и по аудиту: забыли закрыть, застряла в стадии');
    });

    it('без признаков — пометки нет; в тексте нет кодов', () => {
        expect(dealMovementAuditNote(finding({ flags: [] }))).toBeNull();
        expect(dealMovementAuditNote(finding())).not.toMatch(/op_audit|_/);
    });

    it('свежесть: раз в неделю — не старше 8 суток, раз в месяц — 32', () => {
        const findings = new Map([
            ['1', finding()],
            ['2', finding({ at: '2026-11-08T22:30:00.000Z' })],
            ['3', finding({ at: '2026-10-31T22:30:00.000Z' })],
            ['4', finding({ at: 'не дата' })],
        ]);

        expect([
            ...freshDealAuditFindings(findings, NOW, 'weekly').keys(),
        ]).toEqual(['1']);
        expect([
            ...freshDealAuditFindings(findings, NOW, 'monthly').keys(),
        ]).toEqual(['1', '2', '3']);
    });

    it('пометки по сделкам — только свежие и с признаками', () => {
        const notes = dealAuditNotesOf(
            new Map([
                ['1', finding()],
                ['2', finding({ at: '2026-11-01T22:30:00.000Z' })],
                ['3', finding({ flags: [] })],
            ]),
            NOW,
            'weekly',
        );
        expect([...notes]).toEqual([['1', 'ещё и по аудиту: без задач']]);
    });
});
