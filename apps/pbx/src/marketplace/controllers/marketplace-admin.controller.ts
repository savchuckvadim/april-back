import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
    ApiHeader,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { AdminKeyGuard } from '../lib/admin-key.guard';
import { MarketplaceAdminService } from '../services/marketplace-admin.service';
import {
    PlacementSyncResultDto,
    RefreshPlacementsDto,
} from '../dto/marketplace-admin.dto';

/**
 * Admin-эндпоинты вендора (защищены заголовком X-Admin-Key,
 * env MARKETPLACE_ADMIN_KEY; переменная не задана = эндпоинты выключены).
 */
@ApiTags('Bitrix Marketplace Admin')
@UseGuards(AdminKeyGuard)
@Controller('bitrix-marketplace/admin')
export class MarketplaceAdminController {
    constructor(private readonly adminService: MarketplaceAdminService) {}

    @ApiOperation({
        summary:
            'Синхронизировать привязки виджетов портала с эталоном-манифестом (после изменения состава/мест)',
    })
    @ApiHeader({
        name: 'X-Admin-Key',
        description: 'Ключ администратора (env MARKETPLACE_ADMIN_KEY)',
        required: true,
    })
    @ApiOkResponse({
        description: 'Результат синхронизации (bound/unbound/errors/total)',
        type: PlacementSyncResultDto,
    })
    @Post('placements/refresh')
    async refreshPlacements(
        @Body() dto: RefreshPlacementsDto,
    ): Promise<PlacementSyncResultDto> {
        return this.adminService.refreshPlacements(dto);
    }
}
