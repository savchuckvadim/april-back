import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    Patch,
    Post,
} from '@nestjs/common';
import {
    ApiBody,
    ApiNoContentResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { SyncPortalMeasuresUseCase } from '../use-cases/sync-portal-measures.use-case';
import { ManagePortalMeasureUseCase } from '../use-cases/manage-portal-measure.use-case';
import { PortalMeasureSyncResponseDto } from '../dto/portal-measure-sync-response.dto';
import { PortalMeasureResponseDto } from '../dto/portal-measure-response.dto';
import { PortalMeasureBackfillResponseDto } from '../dto/portal-measure-backfill-response.dto';
import { UpdatePortalMeasureDto } from '../dto/update-portal-measure.dto';

@ApiTags('PBX Portal Measure')
@Controller('pbx-portal-measure')
export class PbxPortalMeasureController {
    constructor(
        private readonly useCase: SyncPortalMeasuresUseCase,
        private readonly manageUseCase: ManagePortalMeasureUseCase,
    ) {}

    @ApiOperation({
        summary: 'Синхронизировать единицы измерения портала с глобальными',
        description:
            'Создаёт/обновляет строки `portal_measure` для портала на основе ' +
            'глобального справочника `measures`. Идемпотентно: повторный вызов ' +
            'не плодит дубли. Портал определяется по `domain`.',
    })
    @ApiParam({ name: 'domain', description: 'Домен Bitrix-портала' })
    @ApiOkResponse({ type: PortalMeasureSyncResponseDto })
    @Get('/sync/domain/:domain')
    async sync(
        @Param('domain') domain: string,
    ): Promise<PortalMeasureSyncResponseDto> {
        return this.useCase.syncByDomain(domain);
    }

    @ApiOperation({
        summary: 'Список единиц измерения портала',
        description:
            'Возвращает `portal_measure` портала (по `domain`) с человекочитаемыми полями.',
    })
    @ApiParam({ name: 'domain', description: 'Домен Bitrix-портала' })
    @ApiOkResponse({ type: [PortalMeasureResponseDto] })
    @Get('/domain/:domain')
    async list(
        @Param('domain') domain: string,
    ): Promise<PortalMeasureResponseDto[]> {
        const portalMeasures = await this.useCase.listByDomain(domain);
        return portalMeasures.map(pm => new PortalMeasureResponseDto(pm));
    }

    @ApiOperation({
        summary: 'Заполнить пустые таймстампы portal_measure',
        description:
            'Ремонтная ручка: проставляет `created_at`/`updated_at` строкам ' +
            '`portal_measure`, у которых они `NULL` (записи, созданные до ' +
            'подключения авто-таймстампов). Идемпотентно: повторный вызов ' +
            'затрагивает только оставшиеся пустыми строки.',
    })
    @ApiOkResponse({ type: PortalMeasureBackfillResponseDto })
    @HttpCode(200)
    @Post('/backfill-timestamps')
    async backfillTimestamps(): Promise<PortalMeasureBackfillResponseDto> {
        const result = await this.manageUseCase.backfillTimestamps();
        return new PortalMeasureBackfillResponseDto(result);
    }

    @ApiOperation({
        summary: 'Обновить единицу измерения портала',
        description:
            'Частично обновляет `portal_measure` по id (человекочитаемые поля и `bitrixId`).',
    })
    @ApiParam({
        name: 'id',
        description: 'ID единицы измерения портала',
        type: Number,
    })
    @ApiBody({ type: UpdatePortalMeasureDto })
    @ApiOkResponse({ type: PortalMeasureResponseDto })
    @Patch(':id')
    async update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdatePortalMeasureDto,
    ): Promise<PortalMeasureResponseDto> {
        const updated = await this.manageUseCase.update(id, dto);
        return new PortalMeasureResponseDto(updated);
    }

    @ApiOperation({
        summary: 'Удалить единицу измерения портала',
        description: 'Удаляет `portal_measure` по id.',
    })
    @ApiParam({
        name: 'id',
        description: 'ID единицы измерения портала',
        type: Number,
    })
    @ApiNoContentResponse({ description: 'Единица измерения портала удалена' })
    @HttpCode(204)
    @Delete(':id')
    async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
        await this.manageUseCase.remove(id);
    }
}
