import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { MeasureService } from '@lib/portal-lib/konstructor';
import { MeasureResponseDto } from '../dto/measure-response.dto';

/**
 * Read-only доступ к глобальному справочнику единиц измерения (`measures`) из pbx-install.
 *
 * Для фронта: источник опций при выборе единицы измерения и мастер-данные для
 * синхронизации в `portal_measure`. Редактирование справочника — в admin.
 */
@ApiTags('PBX Measure')
@Controller('pbx-measure')
export class PbxMeasureController {
    constructor(private readonly measureService: MeasureService) {}

    @ApiOperation({
        summary: 'Список глобальных единиц измерения',
        description: 'Справочник `measures` целиком (read-only).',
    })
    @ApiOkResponse({ type: [MeasureResponseDto] })
    @Get()
    async list(): Promise<MeasureResponseDto[]> {
        const measures = await this.measureService.findMany();
        return measures.map(m => new MeasureResponseDto(m));
    }

    @ApiOperation({
        summary: 'Единица измерения по id',
        description: 'Одна запись справочника `measures` (read-only).',
    })
    @ApiParam({ name: 'id', description: 'ID единицы измерения', type: Number })
    @ApiOkResponse({ type: MeasureResponseDto })
    @Get(':id')
    async getById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<MeasureResponseDto> {
        const measure = await this.measureService.findById(id);
        return new MeasureResponseDto(measure);
    }
}
