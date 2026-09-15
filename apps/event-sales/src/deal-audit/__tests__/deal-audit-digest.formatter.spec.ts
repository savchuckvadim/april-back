import { DEAL_AUDIT_STATUS } from '../constants/deal-audit.const';
import { buildDealAuditDigest } from '../lib/deal-audit-digest.formatter';
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

describe('deal-audit: вёрстка сводки', () => {
    it('без забытых сделок сводка не собирается вовсе', () => {
        const message = buildDealAuditDigest({
            domain: 'example.bitrix24.ru',
            heading: 'Ваши забытые сделки',
            verdicts: [verdict({ status: DEAL_AUDIT_STATUS.ok })],
            limit: 20,
        });

        expect(message).toBe('');
    });

    it('сделки сгруппированы по статусу, худшая группа первой', () => {
        const message = buildDealAuditDigest({
            domain: 'example.bitrix24.ru',
            heading: 'Ваши забытые сделки',
            verdicts: [
                verdict({ dealId: 1, status: DEAL_AUDIT_STATUS.noTask }),
                verdict({ dealId: 2, status: DEAL_AUDIT_STATUS.forgotClose }),
            ],
            limit: 20,
        });

        expect(message).toContain('Забытых сделок: 2');
        expect(message.indexOf('Забыли закрыть')).toBeLessThan(
            message.indexOf('Без задач'),
        );
        expect(message).toContain(
            'https://example.bitrix24.ru/crm/deal/details/2/',
        );
    });

    it('лимит режет список и дописывает остаток', () => {
        const message = buildDealAuditDigest({
            domain: 'example.bitrix24.ru',
            heading: 'Сводка',
            verdicts: [1, 2, 3, 4].map(id => verdict({ dealId: id })),
            limit: 2,
        });

        expect(message).toContain('…и ещё 2');
        expect(message).not.toContain('#3 ');
    });

    it('имя ответственного подставляется, когда его передали', () => {
        const message = buildDealAuditDigest({
            domain: 'example.bitrix24.ru',
            heading: 'Забытые сделки ваших сотрудников',
            verdicts: [verdict()],
            limit: 20,
            userNames: new Map([[42, 'Иванов Иван']]),
        });

        expect(message).toContain('— Иванов Иван');
    });
});
