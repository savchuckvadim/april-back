import { EnumColdCallEntityType, EnumColdCallIsTmc } from '../dto/cold.dto';

export interface IColdHookSilenceHandlerData {
    collected: Record<string, IColdCallData>;
    payload: IColdCallPayload;
}

export interface IColdCallPayload {
    domain: string;
}
export interface IColdCallData {
    entityType: EnumColdCallEntityType;
    entityId: string;
    responsible: string;
    created: string;
    deadline: string;
    name: string;
    isTmc: EnumColdCallIsTmc;
}
