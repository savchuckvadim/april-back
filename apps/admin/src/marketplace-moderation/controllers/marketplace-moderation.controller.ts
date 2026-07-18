import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Query,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Role, Roles } from '@lib/auth';
import { ApiParam } from '@nestjs/swagger';
import { MarketplaceModerationService } from '../services/marketplace-moderation.service';
import {
    AdminMarketplaceInstallDetailsDto,
    AdminMarketplaceInstallDto,
    AppEventsPageDto,
    EventsQueryDto,
    InstallsQueryDto,
    PbxActionResultDto,
    PortalProductDto,
} from '../dto/marketplace-admin-views.dto';
import {
    ApplicationDto,
    ApplicationsQueryDto,
    ApprovalActionDto,
    ApprovalResultDto,
    InstallComponentDto,
} from '../dto/marketplace-moderation.dto';

/**
 * Модерация подключений маркетплейс-приложения «Менеджер Гарант»
 * (этап 3 онбординга). Доступ — только SUPER_USER (общий JWT @lib/auth;
 * в admin должен быть включён AUTH_ENABLED=true).
 */
@ApiTags('Admin Marketplace Moderation')
@ApiBearerAuth()
@Roles(Role.SUPER_USER)
@Controller('admin/marketplace')
export class MarketplaceModerationController {
    constructor(
        private readonly moderationService: MarketplaceModerationService,
    ) {}

    @ApiOperation({
        summary: 'Заявки на подключение маркетплейс-приложения',
        description:
            'Возвращает маркетплейс-порталы с организацией из заявки, статусом допуска и диагностикой токенов установки.',
    })
    @ApiOkResponse({
        description: 'Список заявок',
        type: ApplicationDto,
        isArray: true,
    })
    @Get('applications')
    async getApplications(
        @Query() query: ApplicationsQueryDto,
    ): Promise<ApplicationDto[]> {
        return this.moderationService.getApplications(query);
    }

    @ApiOperation({
        summary: 'Решение по заявке портала',
        description:
            'Применяет решение модератора: approve одобряет портал, активирует продукт sales и запускает установку сущностей; block блокирует портал.',
    })
    @ApiBody({
        type: ApprovalActionDto,
        description: 'Действие модератора и необязательный комментарий.',
    })
    @ApiOkResponse({
        description: 'Результат решения',
        type: ApprovalResultDto,
    })
    @Patch('portals/:id/approval')
    async decide(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: ApprovalActionDto,
        @CurrentUser('login') login?: string,
    ): Promise<ApprovalResultDto> {
        return this.moderationService.decide(id, dto, login);
    }

    @ApiOperation({
        summary: 'Статусы компонентов установки портала',
        description:
            'Возвращает прогресс provisioning по компонентам портала: placements, смарт-сценарии и pbx-сущности.',
    })
    @ApiOkResponse({
        description: 'Компоненты установки',
        type: InstallComponentDto,
        isArray: true,
    })
    @Get('portals/:id/components')
    async getComponents(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<InstallComponentDto[]> {
        return this.moderationService.getComponents(id);
    }

    @ApiOperation({
        summary: 'Все установки маркетплейс-приложения',
        description:
            'Обзор marketplace_installs по всем порталам: статусы установки, ошибки шагов, диагностика токенов. Фильтры по домену, member_id и статусу.',
    })
    @ApiOkResponse({
        description: 'Список установок (новые сверху)',
        type: AdminMarketplaceInstallDto,
        isArray: true,
    })
    @Get('installs')
    async getInstalls(
        @Query() query: InstallsQueryDto,
    ): Promise<AdminMarketplaceInstallDto[]> {
        return this.moderationService.getInstalls(query);
    }

    @ApiOperation({
        summary: 'Деталь установки с компонентами',
        description:
            'Одна установка (marketplace_installs.id) с порталом и полным списком компонент-статусов.',
    })
    @ApiParam({
        name: 'installId',
        description: 'ID установки (uuid)',
        example: '314bb01a-0e85-47bb-8c82-8d60c2d4c417',
    })
    @ApiOkResponse({
        description: 'Установка с компонентами',
        type: AdminMarketplaceInstallDetailsDto,
    })
    @Get('installs/:installId')
    async getInstall(
        @Param('installId') installId: string,
    ): Promise<AdminMarketplaceInstallDetailsDto> {
        return this.moderationService.getInstall(installId);
    }

    @ApiOperation({
        summary: 'Журнал событий приложения',
        description:
            'bitrix_app_events: установки, открытия, онбординг, модерация, рефреш токенов. Фильтры + пагинация (take ≤ 100), новые сверху.',
    })
    @ApiOkResponse({
        description: 'Страница журнала с общим количеством',
        type: AppEventsPageDto,
    })
    @Get('events')
    async getEvents(@Query() query: EventsQueryDto): Promise<AppEventsPageDto> {
        return this.moderationService.getEvents(query);
    }

    @ApiOperation({
        summary: 'Продукты портала',
        description:
            'portal_products портала: код, статус (active/inactive/suspended), даты активации и оплаты.',
    })
    @ApiOkResponse({
        description: 'Продукты портала',
        type: PortalProductDto,
        isArray: true,
    })
    @Get('portals/:id/products')
    async getPortalProducts(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<PortalProductDto[]> {
        return this.moderationService.getPortalProducts(id);
    }

    @ApiOperation({
        summary: 'Повторно запустить provisioning pbx-сущностей портала',
        description:
            'Прокси в pbx (X-Admin-Key остаётся server-side): повторная постановка фоновой задачи установки сущностей активированного продукта.',
    })
    @ApiOkResponse({
        description: 'Задача поставлена',
        type: PbxActionResultDto,
    })
    @Post('portals/:id/provision-refresh')
    async provisionRefresh(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<PbxActionResultDto> {
        return this.moderationService.provisionRefresh(id);
    }

    @ApiOperation({
        summary: 'Синхронизировать привязки виджетов портала',
        description:
            'Прокси в pbx: diff-синхронизация placement.bind портала с эталоном-манифестом (после изменения состава виджетов/мест).',
    })
    @ApiOkResponse({
        description: 'Синхронизация выполнена',
        type: PbxActionResultDto,
    })
    @Post('portals/:id/placements-refresh')
    async placementsRefresh(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<PbxActionResultDto> {
        return this.moderationService.placementsRefresh(id);
    }
}
