import { Controller, Get } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { CabinetAccess, CabinetCtx } from '../access/cabinet-access.decorator';
import { CabinetContext } from '../domain/cabinet-context';
import { CabinetPortalService } from '../portals/cabinet-portal.service';
import {
    CabinetPortalOverviewDto,
    CabinetPortalSummaryDto,
    CabinetProfileDto,
} from '../dto/cabinet-portal.dto';

/**
 * Кабинет: профиль, мои порталы, карточка портала. Работает и с токеном
 * входа с сайта, и с сессией фрейма Битрикса (тогда портал — один, из
 * сессии).
 */
@ApiTags('Кабинет клиента: порталы')
@Controller('cabinet')
export class CabinetPortalsController {
    constructor(private readonly portals: CabinetPortalService) {}

    @Get('me')
    @CabinetAccess('member')
    @ApiOperation({
        summary: 'Профиль учётной записи',
        description:
            'Только для входа с сайта: имя, email, задан ли пароль и порталы с ролями.',
    })
    @ApiOkResponse({ type: CabinetProfileDto, description: 'Профиль.' })
    async me(@CabinetCtx() ctx: CabinetContext): Promise<CabinetProfileDto> {
        return this.portals.profile(ctx);
    }

    @Get('portals')
    @CabinetAccess('frame')
    @ApiOperation({
        summary: 'Мои порталы',
        description:
            'С сайта — порталы, где у учётки есть доступ; из фрейма — портал сессии.',
    })
    @ApiOkResponse({
        type: [CabinetPortalSummaryDto],
        description: 'Порталы и роли.',
    })
    async list(
        @CabinetCtx() ctx: CabinetContext,
    ): Promise<CabinetPortalSummaryDto[]> {
        return this.portals.myPortals(ctx);
    }

    @Get('portals/:portalId')
    @CabinetAccess('frame')
    @ApiOperation({
        summary: 'Карточка портала',
        description:
            'Организация, допуск, уровень доступа, подключённые части приложения и виджеты.',
    })
    @ApiParam({ name: 'portalId', description: 'ID портала.', example: 12 })
    @ApiOkResponse({
        type: CabinetPortalOverviewDto,
        description: 'Карточка портала.',
    })
    async overview(
        @CabinetCtx() ctx: CabinetContext,
    ): Promise<CabinetPortalOverviewDto> {
        return this.portals.overview(ctx);
    }
}
