import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
    ApiBody,
    ApiHeader,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { AdminKeyGuard } from '../lib/admin-key.guard';
import { MarketplaceAdminService } from '../services/marketplace-admin.service';
import { MarketplaceProductService } from '../services/marketplace-product.service';
import {
    AdminInstallDto,
    AdminInstallsQueryDto,
    PlacementSyncResultDto,
    RefreshPlacementsDto,
} from '../dto/marketplace-admin.dto';
import {
    ActivateProductDto,
    ActivationResultDto,
} from '../dto/marketplace-product.dto';

/**
 * Admin-эндпоинты вендора (защищены заголовком X-Admin-Key,
 * env MARKETPLACE_ADMIN_KEY; переменная не задана = эндпоинты выключены).
 */
@ApiTags('Bitrix Marketplace Admin')
@UseGuards(AdminKeyGuard)
@Controller('bitrix-marketplace/admin')
export class MarketplaceAdminController {
    constructor(
        private readonly adminService: MarketplaceAdminService,
        private readonly productService: MarketplaceProductService,
    ) {}

    @ApiOperation({
        summary: 'Диагностика установок портала',
        description:
            'Возвращает установки портала со статусами, ошибками шагов и компонентами. Токены доступа в ответ не попадают.',
    })
    @ApiHeader({
        name: 'X-Admin-Key',
        description: 'Ключ администратора (env MARKETPLACE_ADMIN_KEY)',
        required: true,
    })
    @ApiOkResponse({
        description: 'Установки портала с компонентами',
        type: AdminInstallDto,
        isArray: true,
    })
    @Get('installs')
    async getInstalls(
        @Query() query: AdminInstallsQueryDto,
    ): Promise<AdminInstallDto[]> {
        return this.adminService.getInstalls(query);
    }

    @ApiOperation({
        summary: 'Синхронизировать привязки виджетов портала',
        description:
            'Приводит привязки виджетов портала к эталону-манифесту. Вызывается после изменения состава виджетов или мест их встраивания.',
    })
    @ApiHeader({
        name: 'X-Admin-Key',
        description: 'Ключ администратора (env MARKETPLACE_ADMIN_KEY)',
        required: true,
    })
    @ApiBody({
        type: RefreshPlacementsDto,
        description: 'Идентификатор портала для синхронизации привязок.',
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

    @ApiOperation({
        summary: 'Активировать продукт на портале (approve заявки)',
        description:
            'Одобряет допуск портала, включает продукт в portal_products и ставит в очередь фоновый provisioning pbx-сущностей.',
    })
    @ApiHeader({
        name: 'X-Admin-Key',
        description: 'Ключ администратора (env MARKETPLACE_ADMIN_KEY)',
        required: true,
    })
    @ApiBody({
        type: ActivateProductDto,
        description:
            'Идентификатор портала (memberId или domain) и код активируемого продукта.',
    })
    @ApiOkResponse({
        description: 'Результат активации (допуск, продукт, задача очереди)',
        type: ActivationResultDto,
    })
    @Post('products/activate')
    async activateProduct(
        @Body() dto: ActivateProductDto,
    ): Promise<ActivationResultDto> {
        return this.productService.activateProduct(dto);
    }

    @ApiOperation({
        summary: 'Повторно запустить provisioning продукта',
        description:
            'Повторно ставит в очередь provisioning pbx-сущностей уже активированного продукта — например, после исправления ошибок установки.',
    })
    @ApiHeader({
        name: 'X-Admin-Key',
        description: 'Ключ администратора (env MARKETPLACE_ADMIN_KEY)',
        required: true,
    })
    @ApiBody({
        type: ActivateProductDto,
        description:
            'Идентификатор портала (memberId или domain) и код продукта для повторного provisioning.',
    })
    @ApiOkResponse({
        description: 'Результат постановки задачи provisioning',
        type: ActivationResultDto,
    })
    @Post('provision/refresh')
    async redispatchProvision(
        @Body() dto: ActivateProductDto,
    ): Promise<ActivationResultDto> {
        return this.productService.redispatchProvision(dto);
    }
}
