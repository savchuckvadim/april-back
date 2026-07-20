import { Controller, Get, Post, UseGuards } from '@nestjs/common';
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
import { MarketplaceInviteService } from '../services/marketplace-invite.service';
import { CabinetSummaryDto } from '../dto/marketplace-cabinet.dto';
import { InstallProductResultDto } from '../dto/marketplace-invite.dto';
import { MarketplaceProduct } from '../config/marketplace-manifest';

/**
 * Данные кабинета «Менеджер Гарант» — только под portal-context сессией
 * (Bearer после /session/exchange; sub = member_id из проверенного токена).
 */
@ApiTags('Bitrix Marketplace Cabinet')
@ApiBearerAuth()
@UseGuards(PortalSessionGuard)
@Controller('bitrix-marketplace/cabinet')
export class MarketplaceCabinetController {
    constructor(
        private readonly cabinetService: MarketplaceCabinetService,
        private readonly inviteService: MarketplaceInviteService,
    ) {}

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

    @ApiOperation({
        summary: 'Запустить установку продукта на портале',
        description:
            'Клиентский запуск установки сущностей (поля, смарт-процессы, справочники) для подключённого портала. Нужен, когда код подключения выпущен без автоматической установки, и служит точкой входа мастера настройки.',
    })
    @ApiOkResponse({
        description: 'Задача установки поставлена в очередь',
        type: InstallProductResultDto,
    })
    @ApiUnauthorizedResponse({
        description: 'Нет/просрочен portal-context токен',
    })
    @Post('install-product')
    async installProduct(
        @CurrentUser() user: AuthUser,
    ): Promise<InstallProductResultDto> {
        return this.inviteService.installProduct(
            user.sub,
            MarketplaceProduct.SALES,
        );
    }
}
