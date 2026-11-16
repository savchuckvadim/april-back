import { Controller, Get, Query } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { Role, Roles } from '@lib/auth';
import {
    KnowledgeBudgetQueryDto,
    KnowledgeBudgetReportDto,
} from './dto/knowledge-budget.dto';
import { KnowledgeBudgetReportService } from './knowledge-budget-report.service';

/** Путь сводки бюджетов — один источник для контроллера и фронта. */
export const KNOWLEDGE_BUDGET_ADMIN_PATH = 'admin/call-report/knowledge-budget';

/**
 * Сводка бюджетов базы знаний для админки: сколько знаков в каждом виде,
 * сколько помещается в промпт разбора и что обрезается. Хостится ТОЛЬКО в
 * apps/admin через KnowledgeBudgetAdminModule (ai/rules/app-api-surface.md).
 */
@ApiTags('Admin Call Report Knowledge Budget')
@ApiBearerAuth()
@Roles(Role.SUPER_USER)
@Controller(KNOWLEDGE_BUDGET_ADMIN_PATH)
export class KnowledgeBudgetAdminController {
    constructor(private readonly reports: KnowledgeBudgetReportService) {}

    @Get()
    @ApiOperation({
        summary: 'Сколько материалов базы знаний попадает в разбор звонка',
        description:
            'По каждому виду материалов, который читает разбор звонков ' +
            'портала: число документов, объём в знаках и оценка в токенах, ' +
            'а по каждому месту чтения (общий слой разбора, проходы, проход ' +
            'методики, проверка по регламенту) — бюджет, сколько знаков ' +
            'помещается и сколько обрезается. Считается по той же таблице ' +
            'бюджетов, по которой материалы режет сам разбор. Только чтение: ' +
            'к Битриксу и к модели не обращается.',
    })
    @ApiOkResponse({
        description: 'Сводка бюджетов базы знаний портала.',
        type: KnowledgeBudgetReportDto,
    })
    async report(
        @Query() query: KnowledgeBudgetQueryDto,
    ): Promise<KnowledgeBudgetReportDto> {
        return this.reports.report(query.domain.trim());
    }
}
