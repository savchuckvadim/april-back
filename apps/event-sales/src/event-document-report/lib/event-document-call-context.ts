import {
    callActor,
    callEntity,
    CallContextAnnotation,
} from '@lib/core/call-context';
import { SalesDocumentEventJobData } from '@lib/queue';
import { EVENT_DOCUMENT_OPERATION } from '../constants/event-document-flow.const';

/**
 * Подпись потока документов для тревог и журнала сбоев Битрикса: операция,
 * портал, основная сделка и сотрудник, сформировавший документ.
 */
export const eventDocumentCallContext = (
    event: Pick<SalesDocumentEventJobData, 'domain' | 'dealId' | 'userId'>,
): CallContextAnnotation => ({
    operation: EVENT_DOCUMENT_OPERATION,
    domain: event.domain,
    entity: callEntity('deal', event.dealId),
    actor: callActor(event.userId),
});
