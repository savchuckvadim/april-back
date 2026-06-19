import { Controller, Get, Param } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { SyncPortalMeasuresUseCase } from '../use-cases/sync-portal-measures.use-case';
import { PortalMeasureSyncResponseDto } from '../dto/portal-measure-sync-response.dto';
import { PortalMeasureResponseDto } from '../dto/portal-measure-response.dto';

@ApiTags('PBX Portal Measure')
@Controller('pbx-portal-measure')
export class PbxPortalMeasureController {
    constructor(private readonly useCase: SyncPortalMeasuresUseCase) {}

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
}
