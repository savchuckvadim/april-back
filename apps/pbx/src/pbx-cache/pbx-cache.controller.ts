import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { PbxCacheService } from './pbx-cache.service';
import { PBX_CACHE_ENTITIES, PbxCacheEntity } from './pbx-cache-entity.enum';
import { PbxCacheValueResponseDto, SetPbxCacheDto } from './dto/pbx-cache.dto';

/**
 * Контроллер кэша общих данных портала.
 * Отдаёт/сохраняет/инвалидирует кэшированные сущности портала по домену.
 */
@ApiTags('PBX Cache — общий кэш данных портала')
@Controller('pbx-cache/:domain/:entity')
export class PbxCacheController {
    constructor(private readonly pbxCacheService: PbxCacheService) {}

    @Get()
    @ApiOperation({
        summary: 'Получить кэшированное значение сущности портала',
        description:
            'Возвращает значение из Redis по домену и сущности. found=false, если значения нет.',
    })
    @ApiParam({
        name: 'domain',
        description: 'Домен портала Bitrix',
        example: 'example.bitrix24.ru',
    })
    @ApiParam({
        name: 'entity',
        description: 'Сущность кэша',
        enum: PBX_CACHE_ENTITIES,
        example: 'portal',
    })
    @ApiOkResponse({ type: PbxCacheValueResponseDto })
    async get(
        @Param('domain') domain: string,
        @Param('entity') entity: PbxCacheEntity,
    ): Promise<PbxCacheValueResponseDto> {
        const value = await this.pbxCacheService.get(domain, entity);

        return {
            domain,
            entity,
            found: value !== null,
            value,
        };
    }

    @Put()
    @ApiOperation({
        summary: 'Сохранить значение сущности портала в кэш',
        description:
            'Кладёт значение в Redis. Без ttlSeconds (или 0) — хранится бессрочно.',
    })
    @ApiParam({
        name: 'domain',
        description: 'Домен портала Bitrix',
        example: 'example.bitrix24.ru',
    })
    @ApiParam({
        name: 'entity',
        description: 'Сущность кэша',
        enum: PBX_CACHE_ENTITIES,
        example: 'portal',
    })
    @ApiOkResponse({ type: PbxCacheValueResponseDto })
    async set(
        @Param('domain') domain: string,
        @Param('entity') entity: PbxCacheEntity,
        @Body() body: SetPbxCacheDto,
    ): Promise<PbxCacheValueResponseDto> {
        await this.pbxCacheService.set(
            domain,
            entity,
            body.value,
            body.ttlSeconds,
        );

        return { domain, entity, found: true, value: body.value };
    }

    @Delete()
    @ApiOperation({
        summary: 'Инвалидировать (удалить) кэш сущности портала',
        description:
            'Удаляет ключ из Redis. found=true, если ключ существовал.',
    })
    @ApiParam({
        name: 'domain',
        description: 'Домен портала Bitrix',
        example: 'example.bitrix24.ru',
    })
    @ApiParam({
        name: 'entity',
        description: 'Сущность кэша',
        enum: PBX_CACHE_ENTITIES,
        example: 'portal',
    })
    @ApiOkResponse({ type: PbxCacheValueResponseDto })
    async invalidate(
        @Param('domain') domain: string,
        @Param('entity') entity: PbxCacheEntity,
    ): Promise<PbxCacheValueResponseDto> {
        const found = await this.pbxCacheService.invalidate(domain, entity);

        return { domain, entity, found, value: null };
    }
}
