import {
    EnumColdCallEntityType,
    EnumColdCallForce,
    EnumColdCallIsTmc,
} from '../dto/cold.dto';

export interface IColdHookSilenceHandlerData {
    collected: Record<string, IColdCallData>;
    payload: IColdCallPayload;
}

export interface IColdCallPayload {
    domain: string;
}

/**
 * Данные хука ПОСЛЕ нормализации на границе (см. toColdCallData):
 * `force` здесь обязателен — дефолт подставлен один раз, и обработчик
 * тишины не гадает, что значит «флага нет».
 */
export interface IColdCallData {
    entityType: EnumColdCallEntityType;
    entityId: string;
    responsible: string;
    created: string;
    deadline: string;
    name: string;
    isTmc: EnumColdCallIsTmc;
    force: EnumColdCallForce;
}
