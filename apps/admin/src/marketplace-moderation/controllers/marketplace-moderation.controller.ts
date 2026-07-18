import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Patch,
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
import { MarketplaceModerationService } from '../services/marketplace-moderation.service';
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
}
