import { Injectable } from '@nestjs/common';
import { portal_measure } from 'generated/prisma';
import { PortalMeasureService } from '@lib/portal-lib/konstructor';
import { UpdatePortalMeasureDto } from '../dto/update-portal-measure.dto';

/**
 * Запись портальных единиц измерения (`portal_measure`): частичное обновление и
 * удаление по id. Наполнение из глобального справочника — в
 * {@link SyncPortalMeasuresUseCase}. Доменная логика — в {@link PortalMeasureService}.
 */
@Injectable()
export class ManagePortalMeasureUseCase {
    constructor(private readonly portalMeasureService: PortalMeasureService) {}

    async update(
        id: number,
        dto: UpdatePortalMeasureDto,
    ): Promise<portal_measure> {
        const data: Partial<portal_measure> = {};
        if (dto.bitrixId !== undefined) data.bitrixId = dto.bitrixId;
        if (dto.name !== undefined) data.name = dto.name;
        if (dto.shortName !== undefined) data.shortName = dto.shortName;
        if (dto.fullName !== undefined) data.fullName = dto.fullName;
        return this.portalMeasureService.update(id, data);
    }

    async remove(id: number): Promise<void> {
        await this.portalMeasureService.delete(id);
    }
}
