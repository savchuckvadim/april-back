import { Controller, Get, Query } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { Role, Roles } from '@lib/auth';
import {
    MethodologyListDto,
    MethodologyListQueryDto,
} from './dto/methodology-admin.dto';
import { MethodologyRegistryService } from './methodology-registry.service';

/** Базовый путь и тег Swagger админ-ручек методик. */
export const METHODOLOGY_ADMIN_PATH = 'admin/methodologies';
export const METHODOLOGY_ADMIN_TAG = 'Admin Methodologies';

/**
 * Методики продаж для админки: список доступных порталу (общие встроенные и
 * из таблицы, свои методики портала) — выбор бейджем в настройках AI
 * портала. Хостится ТОЛЬКО в apps/admin через MethodologyAdminModule
 * (ai/rules/app-api-surface.md).
 */
@ApiTags(METHODOLOGY_ADMIN_TAG)
@ApiBearerAuth()
@Roles(Role.SUPER_USER)
@Controller(METHODOLOGY_ADMIN_PATH)
export class MethodologyAdminController {
    constructor(private readonly registry: MethodologyRegistryService) {}

    @Get()
    @ApiOperation({
        summary: 'Методики, доступные порталу',
        description:
            'Встроенные методики общего слоя плюс активные строки таблицы ' +
            'ai_methodologies (общие и свои методики домена); строка таблицы ' +
            'с тем же кодом перекрывает встроенную, своя — общую. Сводка без ' +
            'полного конфига: код, название, версия, типы звонков, число ' +
            'пунктов и ограничителей.',
    })
    @ApiOkResponse({
        description: 'Методики по алфавиту названий.',
        type: MethodologyListDto,
    })
    async list(
        @Query() query: MethodologyListQueryDto,
    ): Promise<MethodologyListDto> {
        const domain = query.domain?.trim() || null;
        return {
            domain,
            options: await this.registry.listOptions(domain ?? ''),
        };
    }
}
