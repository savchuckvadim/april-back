import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import { PortalBadgesService } from '@lib/portal-lib/store/badges';
import {
    BadgeCatalogDto,
    BadgeCatalogVersionDto,
} from '@lib/portal-lib/store/badges/portal-badges.dto';

/**
 * Каталог бейджиков для ФРЕЙМА «Звонки»: готовые формулировки комментария
 * и названия события, действующие на портале — общий набор из кода или свой,
 * заведённый в админке.
 *
 * ТОЛЬКО ЧТЕНИЕ: пишется каталог админ-API (`admin/portal/:portalId/badges`).
 * Ответ собирается из Redis-кэша на 5 минут — дёргать на старте фрейма
 * безопасно. Портал без своего набора получает общий; пустого ответа и 404
 * тут не бывает по построению.
 */
@ApiTags('Event Sales Badges')
@Controller('badges')
export class BadgesController {
    constructor(private readonly service: PortalBadgesService) {}

    @Get()
    @ApiOperation({
        summary: 'Действующий набор бейджиков на домене',
        description:
            'Бейджики комментария с привязкой к итогам работы и бейджики ' +
            'названия с привязкой к типам события, в порядке показа. ' +
            'Кэшируется на бэке — дёргать при инициализации фрейма безопасно.',
    })
    @ApiQuery({
        name: 'domain',
        description: 'Домен портала Bitrix.',
        type: String,
        example: 'example.bitrix24.ru',
    })
    @ApiOkResponse({ type: BadgeCatalogDto })
    async resolve(@Query('domain') domain: string): Promise<BadgeCatalogDto> {
        return this.service.resolve(this.requireDomain(domain));
    }

    @Get('version')
    @ApiOperation({
        summary: 'Версия набора без самого состава',
        description:
            'Дешёвая проверка «менялся ли набор»: фрейм держит свой hash и ' +
            'тянет полный каталог, только когда хэш разошёлся.',
    })
    @ApiQuery({
        name: 'domain',
        description: 'Домен портала Bitrix.',
        type: String,
        example: 'example.bitrix24.ru',
    })
    @ApiOkResponse({ type: BadgeCatalogVersionDto })
    async version(
        @Query('domain') domain: string,
    ): Promise<BadgeCatalogVersionDto> {
        return this.service.getVersion(this.requireDomain(domain));
    }

    /**
     * Домен обязателен: запрос без него — обращение без контекста, и
     * отвечать на него общим набором значило бы замаскировать ошибку сборки
     * ссылки под честный ответ.
     */
    private requireDomain(domain: string | undefined): string {
        const value = domain?.trim();
        if (!value) {
            throw new BadRequestException(
                'Не передан домен портала (?domain=example.bitrix24.ru)',
            );
        }
        return value;
    }
}
