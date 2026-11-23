import {
    callActor,
    callEntity,
    CallContextAnnotation,
    CallEntityType,
} from '@lib/core/call-context';
import { EnumColdCallEntityType } from '../dto/cold.dto';
import { IColdCallData } from '../type/cold-hook-silence.interface';

/** Операции холодного обзвона — для подписи тревог и журнала сбоев Битрикса. */
export const COLD_CALL_OPERATION = {
    hook: 'Хук: холодный обзвон',
    window: 'Хук: холодный обзвон — окно тишины',
} as const;

const ENTITY_TYPE: Record<EnumColdCallEntityType, CallEntityType> = {
    [EnumColdCallEntityType.COMPANY]: 'company',
    [EnumColdCallEntityType.CONTACT]: 'contact',
    [EnumColdCallEntityType.DEAL]: 'deal',
    [EnumColdCallEntityType.LEAD]: 'lead',
};

/** Карточка и ответственный одного хука холодного звонка. */
export function coldCallCallContext(
    domain: string,
    data: Pick<IColdCallData, 'entityType' | 'entityId' | 'responsible'>,
    operation: string = COLD_CALL_OPERATION.hook,
): CallContextAnnotation {
    return {
        operation,
        domain,
        entity: callEntity(ENTITY_TYPE[data.entityType], data.entityId),
        actor: callActor(data.responsible),
    };
}

/**
 * Окно тишины: портал всегда; карточка и ответственный — только если в окне
 * один хук (иначе запись идёт по многим карточкам сразу).
 */
export function coldCallWindowCallContext(
    domain: string,
    collected: Record<string, IColdCallData>,
): CallContextAnnotation {
    const hooks = Object.values(collected);
    return hooks.length === 1
        ? coldCallCallContext(domain, hooks[0], COLD_CALL_OPERATION.window)
        : { operation: COLD_CALL_OPERATION.window, domain };
}
