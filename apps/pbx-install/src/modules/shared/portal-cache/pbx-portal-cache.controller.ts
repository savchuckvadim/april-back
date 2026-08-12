import { Controller, HttpCode, Post, Query } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import { PortalOnlineCacheService } from '@lib/portal-lib/store/portal-online-cache.service';
import { PortalCacheInvalidateResultDto } from './pbx-portal-cache.dto';

/**
 * Сброс online-кэша слепка портала (`portal_{domain}`, TTL 10 ч).
 *
 * Установщики сбрасывают его сами, но ручка нужна для диагностики и для
 * изменений, сделанных мимо установщика (правки полей руками в Битриксе,
 * ручной rescan): без сброса боевые приложения продолжают видеть старый
 * слепок и считают новые поля «неустановленными».
 */
@ApiTags('PBX Install Portal Cache')
@Controller('pbx-portal-cache')
export class PbxPortalCacheController {
    constructor(private readonly onlineCache: PortalOnlineCacheService) {}

    @Post('invalidate')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сбросить кэш слепка портала',
        description:
            'Удаляет ключ `portal_{domain}` из Redis. Следующий запрос ' +
            'приложения перечитает портал из БД — новые поля/стадии станут ' +
            'видны немедленно, без ожидания 10-часового TTL.',
    })
    @ApiQuery({
        name: 'domain',
        description: 'Домен портала Bitrix.',
        type: String,
        example: 'example.bitrix24.ru',
    })
    @ApiOkResponse({
        type: PortalCacheInvalidateResultDto,
        description: 'Кэш сброшен.',
    })
    async invalidate(
        @Query('domain') domain: string,
    ): Promise<PortalCacheInvalidateResultDto> {
        await this.onlineCache.invalidate(domain);
        return { success: true, domain, key: `portal_${domain}` };
    }
}
