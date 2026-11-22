import {
    callActor,
    callEntity,
    CallContextAnnotation,
} from '@lib/core/call-context';
import {
    CALL_REPORT_ENTITY_TYPE_LEAD,
    CallReportEntityType,
} from '@lib/call-lib/transcription/types/transcription-pipeline.types';

/** Поля джоба разбора звонков, по которым видно, ради чего он идёт. */
interface CallReportJobRef {
    domain: string;
    /** Владелец звонка: id сделки, а у `entityType: 'lead'` — лида. */
    dealId?: number;
    entityType?: CallReportEntityType;
    /** Кто звонил. */
    callerUserId?: number;
}

/**
 * Подпись тревог и журнала сбоев Битрикса для джобов разбора звонков:
 * портал всегда, карточка и сотрудник — у джобов одного звонка.
 */
export function callReportJobCallContext(
    data: CallReportJobRef,
): CallContextAnnotation {
    return {
        domain: data.domain,
        entity: callEntity(
            data.entityType === CALL_REPORT_ENTITY_TYPE_LEAD ? 'lead' : 'deal',
            data.dealId,
        ),
        actor: callActor(data.callerUserId),
    };
}
