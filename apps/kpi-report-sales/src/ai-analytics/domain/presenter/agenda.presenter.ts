/**
 * Периметр requester'а для повестки: звонки и несогласия — персональные
 * строки, фильтруются по видимым менеджерам (строки без менеджера видны
 * только тем, кто видит всех).
 */
import { AiAgendaDto } from '../../dto/ai-agenda.dto';
import { filterByPerimeter, RequesterAccess } from '../access/perimeter.util';

export function applyAgendaPerimeter(
    dto: AiAgendaDto,
    access: RequesterAccess,
): AiAgendaDto {
    return {
        ...dto,
        items: filterByPerimeter(dto.items, access),
        disagreements: filterByPerimeter(dto.disagreements, access),
    };
}
