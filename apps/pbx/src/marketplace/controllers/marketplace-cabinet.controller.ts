import { Controller, Get, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '@lib/auth';
import { PortalSessionGuard } from '../lib/portal-session.guard';
import { MarketplaceCabinetService } from '../services/marketplace-cabinet.service';
import { CabinetSummaryDto } from '../dto/marketplace-cabinet.dto';

/**
 * Данные кабинета «Менеджер Гарант» — только под portal-context сессией
 * (Bearer после /session/exchange; sub = member_id из проверенного токена).
 */
@ApiTags('Bitrix Marketplace Cabinet')
@ApiBearerAuth()
@UseGuards(PortalSessionGuard)
@Controller('bitrix-marketplace/cabinet')
export class MarketplaceCabinetController {
    constructor(private readonly cabinetService: MarketplaceCabinetService) {}

    @ApiOperation({
        summary: 'Сводка кабинета «Менеджер Гарант»',
        description:
            'Возвращает продукты портала и статусы компонентов установки для секций «Мои продукты» и «Статус установки». Контекст портала берётся из проверенного portal-context токена.',
    })
    @ApiOkResponse({
        description: 'Сводка кабинета',
        type: CabinetSummaryDto,
    })
    @ApiUnauthorizedResponse({
        description: 'Нет/просрочен portal-context токен',
    })
    @Get('summary')
    async getSummary(
        @CurrentUser() user: AuthUser,
    ): Promise<CabinetSummaryDto> {
        return this.cabinetService.getSummary(user.sub);
    }
}
