import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Put,
} from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import {
    BadgeSchemaDto,
    PortalBadgesAdminDto,
    PortalBadgesSaveDto,
} from './portal-badges.dto';
import { PortalBadgesService } from './portal-badges.service';

/**
 * Редактор портального каталога бейджиков: раздел «Бейджики» карточки
 * портала.
 *
 * Готовые формулировки для комментария отчёта и названия события. Портал
 * выбирает режим — общий набор из кода или свой — и в режиме «свои» правит
 * список: текст, цвет, привязку к итогам работы и типам событий. Реестр
 * допустимых значений админка берёт из `GET /schema` и ничего не хардкодит.
 */
@ApiTags('Admin Portal Badges')
@Controller('admin/portal/:portalId/badges')
export class PortalBadgesController {
    constructor(private readonly service: PortalBadgesService) {}

    @Get('schema')
    @ApiOperation({
        summary: 'Реестр допустимых значений для редактора бейджиков',
        description:
            'Цели, режимы, итоги работы, типы событий и цвета со ' +
            'справочниками подписей, пределы длины текста и размера набора. ' +
            'Одинаков для всех порталов.',
    })
    @ApiParam({
        name: 'portalId',
        description: 'Идентификатор портала (наша БД).',
        type: Number,
        example: 7,
    })
    @ApiOkResponse({ type: BadgeSchemaDto })
    getSchema(): BadgeSchemaDto {
        return this.service.getSchema();
    }

    @Get()
    @ApiOperation({
        summary: 'Набор бейджиков портала',
        description:
            'Режим, свой набор как сохранён (включая выключенные) и общий ' +
            'набор из кода для сравнения и копирования. Портал ничего не ' +
            'сохранял — режим «default», свой набор пуст, версия 0.',
    })
    @ApiParam({
        name: 'portalId',
        description: 'Идентификатор портала (наша БД).',
        type: Number,
        example: 7,
    })
    @ApiOkResponse({ type: PortalBadgesAdminDto })
    async get(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<PortalBadgesAdminDto> {
        return this.service.getForPortal(portalId);
    }

    @Put()
    @ApiOperation({
        summary: 'Сохранить режим и свой набор целиком',
        description:
            'Набор проверяется на сохранении: коды уникальны, цели, итоги, ' +
            'типы и цвета — из реестра, у комментария нет типов события, у ' +
            'названия нет итогов, основной бейджик названия — один на тип. ' +
            'Версия растёт, кэш каталога домена сбрасывается — фрейм увидит ' +
            'новый набор при следующей сверке хэша.',
    })
    @ApiParam({
        name: 'portalId',
        description: 'Идентификатор портала (наша БД).',
        type: Number,
        example: 7,
    })
    @ApiBody({ type: PortalBadgesSaveDto })
    @ApiOkResponse({ type: PortalBadgesAdminDto })
    async save(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Body() dto: PortalBadgesSaveDto,
    ): Promise<PortalBadgesAdminDto> {
        return this.service.save(portalId, {
            mode: dto.mode,
            items: dto.items,
            updatedBy: dto.updatedBy ?? null,
        });
    }
}
