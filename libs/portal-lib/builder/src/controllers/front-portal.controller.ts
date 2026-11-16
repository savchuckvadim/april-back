import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FrontPortalBuilderService } from '../services/front-portal-builder.service';
import { FrontPortalPartsService } from '../services/front-portal-parts.service';
import { FrontPortalPartsRequestDto } from '../dto/front-portal-parts-request.dto';
import { FrontPortalPartsDto } from '../dto/front-portal-parts.dto';
import { FrontPortalRequestDto } from '../dto/front-portal-request.dto';
import { FrontPortalResponseDto } from '../dto/front-portal-response.dto';

/**
 * Раздача модели портала фронту — замена Laravel-эндпоинта POST front/portal.
 * Эндпоинт открытый (как и в Laravel); ключей доступа ответ не содержит.
 */
@ApiTags('Front Portal')
@Controller('front')
export class FrontPortalController {
    constructor(
        private readonly frontPortalBuilder: FrontPortalBuilderService,
        private readonly frontPortalParts: FrontPortalPartsService,
    ) {}

    @Post('portal')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Получить модель портала для фронта по домену',
        description:
            'Собирает модель портала из локальной БД в том же виде, ' +
            'в котором её отдавал Laravel (PortalFrontResource). ' +
            'Глобальный интерцептор оборачивает ответ в {resultCode, data}.',
    })
    @ApiBody({ type: FrontPortalRequestDto })
    @ApiOkResponse({ type: FrontPortalResponseDto })
    async getPortal(
        @Body() dto: FrontPortalRequestDto,
    ): Promise<FrontPortalResponseDto> {
        const portal = await this.frontPortalBuilder.buildByDomain(dto.domain);
        return { portal };
    }

    @Post('portal/parts')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Получить части портала по списку',
        description:
            'Узкая ручка рядом с полной моделью: отдаёт только названные части ' +
            '(поля сделки, компании, контакта, RPA, смарты по типам и т. д.) и читает ' +
            'из БД только их. Форма каждой части та же, что в POST front/portal, ' +
            'поэтому из частей собирается тот же объект. Полная модель весит около ' +
            'мегабайта — экрану обычно нужны две-три части.',
    })
    @ApiBody({ type: FrontPortalPartsRequestDto })
    @ApiOkResponse({ type: FrontPortalPartsDto })
    getPortalParts(
        @Body() dto: FrontPortalPartsRequestDto,
    ): Promise<FrontPortalPartsDto> {
        return this.frontPortalParts.buildByDomain(
            dto.domain,
            dto.parts,
            dto.smartTypes,
        );
    }
}
