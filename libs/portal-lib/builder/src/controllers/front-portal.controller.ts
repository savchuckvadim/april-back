import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FrontPortalBuilderService } from '../services/front-portal-builder.service';
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
}
