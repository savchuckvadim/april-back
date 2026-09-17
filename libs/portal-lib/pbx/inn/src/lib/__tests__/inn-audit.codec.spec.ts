import {
    foldInnAudit,
    formatInnAuditComment,
    parseInnAuditComment,
} from '../inn-audit.codec';
import { IInnAuditEvent, INN_AUDIT_ACTIONS } from '../../type/inn.type';

const INN = '7707083893';
const OTHER = '7812032055';

const event = (
    action: IInnAuditEvent['action'],
    inn: string,
    at = '2026-09-17T10:00:00+03:00',
): IInnAuditEvent => ({ action, inn, userId: 12, userName: 'Иванов', at });

describe('formatInnAuditComment / parseInnAuditComment', () => {
    it('выбор человека читается обратно целиком', () => {
        const comment = formatInnAuditComment({
            action: INN_AUDIT_ACTIONS.choose,
            inn: INN,
            previousInn: OTHER,
            userId: 12,
            userName: 'Иванов Иван',
        });

        expect(comment).toContain('выбран вручную');
        expect(comment).toContain(`Было: ${OTHER}`);

        const parsed = parseInnAuditComment({
            comment,
            created: '2026-09-17T10:00:00+03:00',
        });
        expect(parsed).toEqual({
            action: INN_AUDIT_ACTIONS.choose,
            inn: INN,
            userId: 12,
            userName: 'Иванов Иван',
            at: '2026-09-17T10:00:00+03:00',
        });
    });

    it('автоподстановка отмечена как автоматика, без автора', () => {
        const comment = formatInnAuditComment({
            action: INN_AUDIT_ACTIONS.auto,
            inn: INN,
            sourceLabel: 'из реквизита компании «Ромашка»',
        });

        expect(comment).toContain('проставлен автоматически');
        const parsed = parseInnAuditComment({ comment, created: '' });
        expect(parsed?.action).toBe(INN_AUDIT_ACTIONS.auto);
        expect(parsed?.userId).toBeNull();
        expect(parsed?.userName).toBe('');
    });

    it('чужой комментарий таймлайна не считается записью об ИНН', () => {
        expect(
            parseInnAuditComment({
                comment: '<b>Данные заявки</b>\nТелефоны: +79102880648',
                created: '',
            }),
        ).toBeNull();
    });

    it('запись без валидного ИНН отбрасывается', () => {
        expect(
            parseInnAuditComment({
                comment: '<b>ИНН сделки: вариант скрыт</b>\nКто: Иванов (#12)',
                created: '',
            }),
        ).toBeNull();
    });
});

describe('foldInnAudit', () => {
    it('скрытый вариант остаётся скрытым', () => {
        const { hidden } = foldInnAudit([event(INN_AUDIT_ACTIONS.hide, OTHER)]);

        expect(hidden).toEqual([OTHER]);
    });

    /*
     * Иначе выбранное значение исчезло бы из карточки вместе со скрытыми —
     * менеджер не увидел бы, что именно стоит по договору.
     */
    it('выбор снимает скрытие того же значения', () => {
        const { hidden, lastByInn } = foldInnAudit([
            event(INN_AUDIT_ACTIONS.hide, INN),
            event(INN_AUDIT_ACTIONS.choose, INN),
        ]);

        expect(hidden).toEqual([]);
        expect(lastByInn.get(INN)?.action).toBe(INN_AUDIT_ACTIONS.choose);
    });

    it('возврат варианта отменяет скрытие', () => {
        const { hidden } = foldInnAudit([
            event(INN_AUDIT_ACTIONS.hide, OTHER),
            event(INN_AUDIT_ACTIONS.restore, OTHER),
        ]);

        expect(hidden).toEqual([]);
    });

    it('побеждает последнее событие по каждому значению', () => {
        const { lastByInn } = foldInnAudit([
            event(INN_AUDIT_ACTIONS.auto, INN, '2026-09-16T10:00:00+03:00'),
            event(INN_AUDIT_ACTIONS.choose, INN, '2026-09-17T10:00:00+03:00'),
        ]);

        expect(lastByInn.get(INN)?.at).toBe('2026-09-17T10:00:00+03:00');
    });
});
