/**
 * Админ-ручка ретенции снапшотов AI-аналитики (план Фазы 3, П5; решения
 * владельца B7/B10 и В8 от 22.09.2026).
 *
 * Сроки хранения не задаются здесь: их несут дескрипторы типов
 * (`contracts/snapshot-descriptors.const.ts`), а политика
 * `ai-analytics-retention.policy.ts` только применяет их к записям.
 */
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard } from '@lib/auth';
import {
    AI_ANALYTICS_ADMIN_PATH,
    AI_ANALYTICS_ADMIN_ROLES,
    AI_ANALYTICS_ADMIN_TAG,
} from './admin-controller.const';
import {
    AiAnalyticsRetentionResultDto,
    AiAnalyticsRetentionRunDto,
} from '../dto/ai-analytics-retention.dto';
import {
    AI_ANALYTICS_RETENTION_DEFAULTS,
    AiAnalyticsRetentionService,
} from '../services/ai-analytics-retention.service';

@ApiTags(AI_ANALYTICS_ADMIN_TAG)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AI_ANALYTICS_ADMIN_ROLES)
@Controller(AI_ANALYTICS_ADMIN_PATH)
export class AiAnalyticsRetentionAdminController {
    constructor(private readonly retention: AiAnalyticsRetentionService) {}

    @ApiOperation({
        summary: 'Посчитать (и при dryRun = false запустить) ретенцию',
        description:
            'Читает записи AI-аналитики домена и считает по дескрипторам ' +
            'типов, что подлежит удалению: forecast — 180 дней, etl-run — ' +
            '90, brief — 30, месячные и недельные зёрна — по числу записей ' +
            'на менеджера, бессрочные типы (golden-report, settings-audit, ' +
            'rop-mark, feedback, settings) не трогаются вовсе. Поверх ' +
            'сроков удерживаются актуальная запись каждого ключа и две ' +
            'последние версии (решение владельца B10). ' +
            '\n\nПо умолчанию dryRun = true: ручка только считает. ' +
            'dryRun = false означает «запуск всерьёз» — сводка одной ' +
            'строкой уходит в чат админов (решение В8). Физического ' +
            'удаления пока нет: у ais-репозитория (@lib/call-lib) нет ' +
            'метода delete, поэтому такой запуск возвращает тот же план со ' +
            'статусом delete-not-available и deleted = 0 — ложного ' +
            '«удалено» в ответе не будет.',
    })
    @ApiBody({ type: AiAnalyticsRetentionRunDto })
    @ApiOkResponse({
        description:
            'План ретенции: разрез по типам со сроками хранения, примеры ' +
            'записей-кандидатов и строка сводки.',
        type: AiAnalyticsRetentionResultDto,
    })
    @Post('retention/run')
    async run(
        @Body() dto: AiAnalyticsRetentionRunDto,
    ): Promise<AiAnalyticsRetentionResultDto> {
        return this.retention.run({
            domain: dto.domain,
            dryRun: dto.dryRun ?? AI_ANALYTICS_RETENTION_DEFAULTS.dryRun,
            sampleLimit:
                dto.sampleLimit ?? AI_ANALYTICS_RETENTION_DEFAULTS.sampleLimit,
        });
    }
}
