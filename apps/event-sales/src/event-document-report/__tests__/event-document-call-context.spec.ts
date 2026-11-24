import { EVENT_DOCUMENT_OPERATION } from '../constants/event-document-flow.const';
import { eventDocumentCallContext } from '../lib/event-document-call-context';
import {
    DOCUMENT_BASE_DEAL_ID,
    DOCUMENT_DOMAIN,
    DOCUMENT_USER_ID,
    makeEvent,
} from './event-document.fixtures';

/**
 * Подпись потока документов для тревог и журнала сбоев Битрикса: по ней
 * видно, какая операция, на каком портале, по какой сделке и от чьего имени
 * упала.
 */
describe('eventDocumentCallContext — подпись потока документов', () => {
    it('операция «Поток документов», портал события, основная сделка и сотрудник', () => {
        expect(eventDocumentCallContext(makeEvent())).toEqual({
            operation: 'Поток документов',
            domain: DOCUMENT_DOMAIN,
            entity: { type: 'deal', id: String(DOCUMENT_BASE_DEAL_ID) },
            actor: { userId: DOCUMENT_USER_ID },
        });
    });

    it('название операции берётся из общей константы потока', () => {
        expect(eventDocumentCallContext(makeEvent()).operation).toBe(
            EVENT_DOCUMENT_OPERATION,
        );
    });

    it('сущность — именно сделка, а не компания события', () => {
        const context = eventDocumentCallContext(
            makeEvent({ companyId: 1, dealId: 2 }),
        );

        expect(context.entity).toEqual({ type: 'deal', id: '2' });
    });

    it('сотрудника или сделки нет (нулевой id) — подписи без них, поток не падает', () => {
        const context = eventDocumentCallContext(
            makeEvent({ userId: 0, dealId: 0 }),
        );

        expect(context.actor).toBeUndefined();
        expect(context.entity).toBeUndefined();
        expect(context.operation).toBe('Поток документов');
        expect(context.domain).toBe(DOCUMENT_DOMAIN);
    });
});
