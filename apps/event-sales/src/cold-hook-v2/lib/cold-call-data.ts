import {
    COLD_CALL_FORCE_DEFAULT,
    ColdCallQueryDto,
    EnumColdCallForce,
} from '../dto/cold.dto';
import { IColdCallData } from '../type/cold-hook-silence.interface';

/**
 * Нормализация хука на границе контроллера: query-DTO → данные для
 * silence-буфера.
 *
 * Поля переносятся КАК ЕСТЬ, без дефолтов: «не передано» должно дожить до
 * `resolveColdCallData()`, где сливается с полями карточки. Это касается и
 * `force` — подставь его дефолт здесь, и поле `op_xo_is_force` уже не
 * спросить: «робот не сказал» стало бы неотличимо от «робот сказал N».
 */
export const toColdCallData = (dto: ColdCallQueryDto): IColdCallData => ({
    entityType: dto.entityType,
    entityId: dto.entityId,
    responsible: dto.responsible,
    created: dto.created,
    deadline: dto.deadline,
    name: dto.name,
    isTmc: dto.isTmc,
    force: dto.force,
});

/** Режим «забрать клиента» — закрываем чужую работу и создаём новую. */
export const isForcedColdCall = (data: Pick<IColdCallData, 'force'>): boolean =>
    (data.force ?? COLD_CALL_FORCE_DEFAULT) === EnumColdCallForce.Y;
