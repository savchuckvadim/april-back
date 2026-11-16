import {
    Controller,
    HttpCode,
    Param,
    ParseIntPipe,
    Post,
} from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { DealAuditRunNowAdminResponseDto } from '../dto/deal-audit-run-now.dto';
import { DealAuditRunNowAdminService } from '../services/deal-audit-run-now-admin.service';

/**
 * Аудит сделок в админке: кнопка «Сформировать и отправить» в настройках
 * портала (категория «Аудит сделок»). Только apps/admin — правило
 * app-api-surface; сам прогон выполняет event-sales.
 */
@ApiTags('Admin Deal Audit')
@Controller('admin/portal/:portalId/deal-audit')
export class DealAuditAdminController {
    constructor(private readonly runNowService: DealAuditRunNowAdminService) {}

    @Post('run-now')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сформировать и отправить сводку «Забытые сделки» сейчас',
        description:
            'Ставит прогон аудита сделок портала вне расписания: разметка ' +
            'карточек и сводки получателям — по сохранённым настройкам, как ' +
            'у ночного крона. Выполняет event-sales в фоне, итог приходит в ' +
            'Telegram. Пока прогон портала ждёт очереди или идёт, второй не ' +
            'ставится.',
    })
    @ApiParam({
        name: 'portalId',
        description: 'Идентификатор портала (наша БД).',
        type: Number,
        example: 7,
    })
    @ApiOkResponse({
        type: DealAuditRunNowAdminResponseDto,
        description: 'Поставлен ли прогон и предупреждения по настройкам.',
    })
    runNow(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<DealAuditRunNowAdminResponseDto> {
        return this.runNowService.runNow(portalId);
    }
}
