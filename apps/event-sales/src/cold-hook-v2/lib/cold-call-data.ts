import {
    COLD_CALL_FORCE_DEFAULT,
    ColdCallQueryDto,
    EnumColdCallForce,
} from '../dto/cold.dto';
import { IColdCallData } from '../type/cold-hook-silence.interface';

/**
 * Нормализация хука на границе контроллера: query-DTO → данные для
 * silence-буфера. Единственное место, где дефолт `force` превращается в
 * значение — дальше по потоку флаг всегда есть.
 */
export const toColdCallData = (dto: ColdCallQueryDto): IColdCallData => ({
    entityType: dto.entityType,
    entityId: dto.entityId,
    responsible: dto.responsible,
    created: dto.created,
    deadline: dto.deadline,
    name: dto.name,
    isTmc: dto.isTmc,
    force: dto.force ?? COLD_CALL_FORCE_DEFAULT,
});

/** Режим «забрать клиента» — закрываем чужую работу и создаём новую. */
export const isForcedColdCall = (data: Pick<IColdCallData, 'force'>): boolean =>
    data.force === EnumColdCallForce.Y;
