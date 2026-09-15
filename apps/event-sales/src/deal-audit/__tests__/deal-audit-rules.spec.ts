import {
    DEAL_AUDIT_FLAG,
    DEAL_AUDIT_STATUS,
} from '../constants/deal-audit.const';
import {
    buildAuditComment,
    daysBetween,
    evaluateDeal,
    isForgotten,
    pickStatus,
} from '../lib/deal-audit-rules';
import {
    DealAuditSnapshot,
    DealAuditThresholds,
} from '../types/deal-audit.types';

const NOW = Date.UTC(2026, 8, 15, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

const THRESHOLDS: DealAuditThresholds = {
    idleDays: 14,
    overdueHours: 24,
    stageStuckDays: 30,
    forgotCloseDays: 21,
};

const snapshot = (
    patch: Partial<DealAuditSnapshot> = {},
): DealAuditSnapshot => ({
    dealId: 1,
    title: 'ООО «Ромашка»',
    stageCode: 'sales_warm',
    stageName: 'В работе',
    assignedById: 42,
    companyId: 7,
    lastActivityAt: NOW - DAY,
    stageMovedAt: NOW - DAY,
    nextCallAt: NOW + DAY,
    openTasks: [{ id: 100, deadlineAt: NOW + DAY }],
    previousStatus: null,
    ...patch,
});

describe('deal-audit: правила «забытости»', () => {
    it('сделка с задачей и планом звонка — норма, без признаков', () => {
        const verdict = evaluateDeal(snapshot(), THRESHOLDS, NOW);

        expect(verdict.status).toBe(DEAL_AUDIT_STATUS.ok);
        expect(verdict.flags).toEqual([]);
        expect(isForgotten(verdict)).toBe(false);
        expect(verdict.comment).toBe('Норма: работа по сделке ведётся');
    });

    it('без открытых задач — признак и статус «без задач»', () => {
        const verdict = evaluateDeal(
            snapshot({ openTasks: [] }),
            THRESHOLDS,
            NOW,
        );

        expect(verdict.flags).toContain(DEAL_AUDIT_FLAG.noTask);
        expect(verdict.status).toBe(DEAL_AUDIT_STATUS.noTask);
        expect(verdict.openTasks).toBe(0);
    });

    it('просрочка считается только сверх порога в часах', () => {
        const fresh = evaluateDeal(
            snapshot({
                openTasks: [{ id: 1, deadlineAt: NOW - 2 * 3600_000 }],
            }),
            THRESHOLDS,
            NOW,
        );
        const stale = evaluateDeal(
            snapshot({ openTasks: [{ id: 1, deadlineAt: NOW - 5 * DAY }] }),
            THRESHOLDS,
            NOW,
        );

        expect(fresh.flags).not.toContain(DEAL_AUDIT_FLAG.taskOverdue);
        expect(fresh.overdueDays).toBe(0);
        expect(stale.flags).toContain(DEAL_AUDIT_FLAG.taskOverdue);
        expect(stale.overdueDays).toBe(5);
        expect(stale.status).toBe(DEAL_AUDIT_STATUS.taskOverdue);
    });

    it('берётся САМАЯ старая просроченная задача', () => {
        const verdict = evaluateDeal(
            snapshot({
                openTasks: [
                    { id: 1, deadlineAt: NOW - 3 * DAY },
                    { id: 2, deadlineAt: NOW - 9 * DAY },
                ],
            }),
            THRESHOLDS,
            NOW,
        );

        expect(verdict.overdueDays).toBe(9);
    });

    it('задача без срока — признак только когда других задач нет', () => {
        const onlyEndless = evaluateDeal(
            snapshot({ openTasks: [{ id: 1, deadlineAt: null }] }),
            THRESHOLDS,
            NOW,
        );
        const mixed = evaluateDeal(
            snapshot({
                openTasks: [
                    { id: 1, deadlineAt: null },
                    { id: 2, deadlineAt: NOW + DAY },
                ],
            }),
            THRESHOLDS,
            NOW,
        );

        expect(onlyEndless.flags).toContain(DEAL_AUDIT_FLAG.taskNoDeadline);
        expect(mixed.flags).not.toContain(DEAL_AUDIT_FLAG.taskNoDeadline);
    });

    it('дата следующего звонка: пустая и прошедшая — разные признаки', () => {
        const empty = evaluateDeal(
            snapshot({ nextCallAt: null }),
            THRESHOLDS,
            NOW,
        );
        const past = evaluateDeal(
            snapshot({ nextCallAt: NOW - DAY }),
            THRESHOLDS,
            NOW,
        );

        expect(empty.flags).toContain(DEAL_AUDIT_FLAG.nextDateEmpty);
        expect(past.flags).toContain(DEAL_AUDIT_FLAG.nextDatePast);
        expect(past.flags).not.toContain(DEAL_AUDIT_FLAG.nextDateEmpty);
    });

    it('«давно нет работы» срабатывает ровно на пороге', () => {
        const before = evaluateDeal(
            snapshot({ lastActivityAt: NOW - 13 * DAY }),
            THRESHOLDS,
            NOW,
        );
        const onThreshold = evaluateDeal(
            snapshot({ lastActivityAt: NOW - 14 * DAY }),
            THRESHOLDS,
            NOW,
        );

        expect(before.flags).not.toContain(DEAL_AUDIT_FLAG.idle);
        expect(onThreshold.flags).toContain(DEAL_AUDIT_FLAG.idle);
        expect(onThreshold.idleDays).toBe(14);
    });

    it('«застряла в стадии» считается от даты перемещения', () => {
        const verdict = evaluateDeal(
            snapshot({ stageMovedAt: NOW - 45 * DAY }),
            THRESHOLDS,
            NOW,
        );

        expect(verdict.flags).toContain(DEAL_AUDIT_FLAG.stageStuck);
        expect(verdict.stageDays).toBe(45);
    });

    it('«забыли закрыть» — только предпродажные стадии и только по тишине', () => {
        const preClose = evaluateDeal(
            snapshot({
                stageCode: 'sales_money_await',
                stageName: 'В оплате',
                lastActivityAt: NOW - 30 * DAY,
            }),
            THRESHOLDS,
            NOW,
        );
        const earlyStage = evaluateDeal(
            snapshot({
                stageCode: 'sales_warm',
                lastActivityAt: NOW - 30 * DAY,
            }),
            THRESHOLDS,
            NOW,
        );
        const preCloseFresh = evaluateDeal(
            snapshot({
                stageCode: 'sales_money_await',
                lastActivityAt: NOW - 3 * DAY,
                stageMovedAt: NOW - 3 * DAY,
            }),
            THRESHOLDS,
            NOW,
        );

        expect(preClose.flags).toContain(DEAL_AUDIT_FLAG.forgotClose);
        expect(preClose.status).toBe(DEAL_AUDIT_STATUS.forgotClose);
        expect(earlyStage.flags).not.toContain(DEAL_AUDIT_FLAG.forgotClose);
        expect(preCloseFresh.flags).not.toContain(DEAL_AUDIT_FLAG.forgotClose);
    });

    it('без активности «забыли закрыть» считается по времени в стадии', () => {
        const verdict = evaluateDeal(
            snapshot({
                stageCode: 'sales_in_progress',
                stageName: 'В решении',
                lastActivityAt: null,
                stageMovedAt: NOW - 40 * DAY,
            }),
            THRESHOLDS,
            NOW,
        );

        expect(verdict.flags).toContain(DEAL_AUDIT_FLAG.forgotClose);
        expect(verdict.idleDays).toBeNull();
    });

    it('пустой ответственный — отдельный признак', () => {
        const verdict = evaluateDeal(
            snapshot({ assignedById: null }),
            THRESHOLDS,
            NOW,
        );

        expect(verdict.flags).toContain(DEAL_AUDIT_FLAG.noResponsible);
    });

    it('статус выбирается по приоритету, а не по порядку признаков', () => {
        expect(
            pickStatus([DEAL_AUDIT_FLAG.idle, DEAL_AUDIT_FLAG.forgotClose]),
        ).toBe(DEAL_AUDIT_STATUS.forgotClose);
        expect(
            pickStatus([DEAL_AUDIT_FLAG.taskOverdue, DEAL_AUDIT_FLAG.noTask]),
        ).toBe(DEAL_AUDIT_STATUS.noTask);
        // Признаки, у которых нет своего статуса, оставляют «норму».
        expect(pickStatus([DEAL_AUDIT_FLAG.nextDateEmpty])).toBe(
            DEAL_AUDIT_STATUS.ok,
        );
    });

    it('расшифровка перечисляет признаки и числа по-русски', () => {
        const comment = buildAuditComment(
            snapshot({ stageName: 'В оплате' }),
            [DEAL_AUDIT_FLAG.noTask, DEAL_AUDIT_FLAG.idle],
            23,
            41,
        );

        expect(comment).toBe(
            'Без задач · давно нет работы · без работы 23 дн. · в стадии «В оплате» 41 дн.',
        );
    });

    it('daysBetween считает ПОЛНЫЕ сутки и не уходит в минус', () => {
        expect(daysBetween(NOW - 13 * 3600_000, NOW)).toBe(0);
        expect(daysBetween(NOW - 2 * DAY - 3600_000, NOW)).toBe(2);
        expect(daysBetween(NOW + DAY, NOW)).toBe(0);
        expect(daysBetween(null, NOW)).toBeNull();
    });
});
