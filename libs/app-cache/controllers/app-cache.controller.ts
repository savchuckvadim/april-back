import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppCacheService } from '../services/app-cache.service';
import {
    AppCacheDeleteResponseDto,
    AppCacheEntryDto,
    AppCacheEntryRequestDto,
    AppCacheListRequestDto,
    AppCacheListResponseDto,
    AppCachePurgeResponseDto,
    AppCacheResetRequestDto,
    AppCacheResetResponseDto,
    AppCacheSetRequestDto,
    AppCacheSetResponseDto,
} from '../dto/app-cache.dto';

/**
 * Инспекция и управление центральным кэшем (Redis + app_cache в MySQL).
 *
 * Смотрим, какой кэш где лежит (в т.ч. жива ли горячая Redis-копия),
 * читаем/пишем записи, сбрасываем пакетно. Подключается в приложение
 * импортом AppCacheModule; сервис без контроллера — AppCacheServiceModule.
 */
@ApiTags('App Cache')
@Controller('app-cache')
export class AppCacheController {
    constructor(private readonly service: AppCacheService) {}

    @ApiOperation({
        summary: 'Список записей кэша',
        description:
            'Метаданные записей app_cache под фильтром (без полезной нагрузки). ' +
            'У каждой записи виден флаг inRedis — жива ли горячая копия.',
    })
    @ApiOkResponse({ type: AppCacheListResponseDto })
    @Post('list')
    @HttpCode(200)
    async list(
        @Body() dto: AppCacheListRequestDto,
    ): Promise<AppCacheListResponseDto> {
        return await this.service.list(dto);
    }

    @ApiOperation({
        summary: 'Запись кэша целиком',
        description:
            'По id либо по адресу app+domain+key(+bxUserId), с данными.',
    })
    @ApiOkResponse({ type: AppCacheEntryDto })
    @Post('entry')
    @HttpCode(200)
    async entry(
        @Body() dto: AppCacheEntryRequestDto,
    ): Promise<AppCacheEntryDto> {
        return await this.service.getEntry(dto);
    }

    @ApiOperation({
        summary: 'Записать в кэш',
        description:
            'Write-through: upsert в БД + запись в Redis. Данные — любой JSON.',
    })
    @ApiOkResponse({ type: AppCacheSetResponseDto })
    @Post('set')
    @HttpCode(200)
    async set(
        @Body() dto: AppCacheSetRequestDto,
    ): Promise<AppCacheSetResponseDto> {
        return await this.service.set(dto);
    }

    @ApiOperation({ summary: 'Удалить запись кэша (по id или адресу)' })
    @ApiOkResponse({ type: AppCacheDeleteResponseDto })
    @Post('delete')
    @HttpCode(200)
    async delete(
        @Body() dto: AppCacheEntryRequestDto,
    ): Promise<AppCacheDeleteResponseDto> {
        if (dto.id) {
            return { deleted: await this.service.deleteById(dto.id) };
        }
        if (dto.app && dto.domain && dto.key) {
            return {
                deleted: await this.service.delete({
                    app: dto.app,
                    domain: dto.domain,
                    key: dto.key,
                    bxUserId: dto.bxUserId,
                }),
            };
        }
        return { deleted: false };
    }

    @ApiOperation({
        summary: 'Пакетный сброс кэша',
        description:
            'По фильтру app/domain/group/keyPrefix; пустой фильтр — весь кэш. ' +
            'Удаляет и строки БД, и Redis-ключи.',
    })
    @ApiOkResponse({ type: AppCacheResetResponseDto })
    @Post('reset')
    @HttpCode(200)
    async reset(
        @Body() dto: AppCacheResetRequestDto,
    ): Promise<AppCacheResetResponseDto> {
        return await this.service.reset(dto);
    }

    @ApiOperation({
        summary: 'Удалить протухшие строки БД (Redis чистится сам)',
    })
    @ApiOkResponse({ type: AppCachePurgeResponseDto })
    @Post('purge-expired')
    @HttpCode(200)
    async purgeExpired(): Promise<AppCachePurgeResponseDto> {
        return { deleted: await this.service.purgeExpired() };
    }
}
