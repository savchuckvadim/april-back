import { DEAL_AUDIT_STATUS } from '../constants/deal-audit.const';
import { buildDealAuditMessages } from '../lib/deal-audit-digest-messages';
import { DEAL_AUDIT_DIGEST_SCOPE_NOTE } from '../lib/deal-audit-digest.formatter';
import { DealAuditVerdict } from '../types/deal-audit.types';

const verdict = (patch: Partial<DealAuditVerdict> = {}): DealAuditVerdict => ({
    dealId: 1,
    title: 'ООО «Ромашка»',
    assignedById: 42,
    status: DEAL_AUDIT_STATUS.noTask,
    flags: [],
    idleDays: 20,
    overdueDays: 0,
    stageDays: 30,
    openTasks: 0,
    comment: 'Без задач · без работы 20 дн.',
    ...patch,
});

const NAMES = new Map([
    [42, 'Иванов Иван'],
    [43, 'Петрова Анна'],
]);

const TEAM = [
    verdict({ dealId: 1, assignedById: 42 }),
    verdict({
        dealId: 2,
        assignedById: 43,
        status: DEAL_AUDIT_STATUS.taskOverdue,
    }),
    verdict({
        dealId: 3,
        assignedById: 43,
        status: DEAL_AUDIT_STATUS.forgotClose,
    }),
];

const build = (patch: Partial<Parameters<typeof buildDealAuditMessages>[0]>) =>
    buildDealAuditMessages({
        domain: 'example.bitrix24.ru',
        heading: 'Забытые сделки ваших сотрудников',
        verdicts: TEAM,
        limit: 20,
        userNames: NAMES,
        ...patch,
    });

describe('deal-audit: сводка серией личных сообщений', () => {
    it('показывать нечего — сообщений нет вовсе', () => {
        expect(
            build({ verdicts: [verdict({ status: DEAL_AUDIT_STATUS.ok })] }),
        ).toEqual([]);
    });

    it('своя сводка менеджера (без подписей) — одно сообщение', () => {
        const messages = build({
            heading: 'Ваши забытые сделки',
            userNames: undefined,
        });

        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain('Ваши забытые сделки');
        expect(messages[0]).toContain('#3 ');
    });

    it('сводка руководителя: итог, потом по сообщению на сотрудника — у кого больше, тот первый', () => {
        const [summary, first, second, ...rest] = build({});

        expect(rest).toEqual([]);
        expect(summary).toContain('[B]Забытые сделки ваших сотрудников[/B]');
        expect(summary).toContain('Забытых сделок: 3, сотрудников: 2');
        expect(summary.indexOf('Петрова Анна')).toBeLessThan(
            summary.indexOf('Иванов Иван'),
        );
        // Разбивка по статусам — в порядке важности.
        expect(summary).toContain(
            'Петрова Анна[/B] — 2: забыли закрыть 1, просроченные задачи 1',
        );
        expect(first).toContain('[B]Сотрудник: Петрова Анна[/B]');
        expect(first).toContain('#2 ');
        expect(first).not.toContain('#1 ');
        expect(second).toContain('[B]Сотрудник: Иванов Иван[/B]');
    });

    it('пояснение охвата — один раз, в итоге, а не под каждым сотрудником', () => {
        const messages = build({});

        expect(messages[0]).toContain(DEAL_AUDIT_DIGEST_SCOPE_NOTE);
        for (const message of messages.slice(1)) {
            expect(message).not.toContain(DEAL_AUDIT_DIGEST_SCOPE_NOTE);
        }
    });

    it('лимит строк действует на сотрудника, а не на всю сводку', () => {
        const many = [1, 2, 3].map(id =>
            verdict({ dealId: id, assignedById: 42 }),
        );
        const messages = build({
            verdicts: [...many, verdict({ dealId: 9, assignedById: 43 })],
            limit: 2,
        });

        expect(messages[1]).toContain('…и ещё 1');
        expect(messages[2]).toContain('#9 ');
    });

    it('незнакомый сотрудник — по ID, сделка без ответственного — отдельной строкой', () => {
        const [summary] = build({
            verdicts: [
                verdict({ dealId: 5, assignedById: 77 }),
                verdict({ dealId: 6, assignedById: null }),
            ],
        });

        expect(summary).toContain('ID 77');
        expect(summary).toContain('Без ответственного');
    });
});
