import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Post,
    Query,
} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Role, Roles, type AuthUser } from '@lib/auth';
import {
    METHODOLOGY_ADMIN_PATH,
    METHODOLOGY_ADMIN_TAG,
} from '@lib/call-lib/call-report/methodology';
import {
    MethodologyPreviewQueryDto,
    MethodologyPreviewStartDto,
    MethodologyPreviewStateDto,
} from '../dto/methodology-preview.dto';
import { MethodologyPreviewService } from '../services/methodology-preview.service';

/** Путь проверки внутри раздела методик — один для запуска и опроса. */
export const METHODOLOGY_PREVIEW_ROUTE = 'preview';

/**
 * Проверка черновика методики на одном звонке до включения. Живёт в
 * apps/admin: ставит задание воркеру event-sales и читает состояние из
 * Redis. Вызов модели платный — только суперпользователь.
 */
@ApiTags(METHODOLOGY_ADMIN_TAG)
@ApiBearerAuth()
@Roles(Role.SUPER_USER)
@Controller(METHODOLOGY_ADMIN_PATH)
export class MethodologyPreviewController {
    constructor(private readonly service: MethodologyPreviewService) {}

    @Post(METHODOLOGY_PREVIEW_ROUTE)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Проверить черновик методики на одном звонке',
        description:
            'Ставит задание: один проход методики по черновику на уже ' +
            'разобранном звонке портала, с теми же материалами и паспортом ' +
            'звонка, что у штатного разбора. Итог — пункты с цитатами, ' +
            'спирали, сработавшие ограничители и итоговая оценка «сейчас → ' +
            'с черновиком». Ничего не сохраняет: методика, разбор звонка и ' +
            'карточка в Битрикс24 не меняются. Отвечает сразу состоянием ' +
            '«в очереди»; итог читается опросом.',
    })
    @ApiOkResponse({
        description: 'Проверка поставлена в очередь.',
        type: MethodologyPreviewStateDto,
    })
    @ApiBadRequestResponse({
        description:
            'Черновик не проходит проверку конфига — текст ошибок в ответе.',
    })
    start(
        @Body() dto: MethodologyPreviewStartDto,
        @CurrentUser() user?: AuthUser,
    ): Promise<MethodologyPreviewStateDto> {
        return this.service.start({
            domain: dto.domain.trim(),
            transcriptionId: dto.transcriptionId,
            config: dto.config,
            requestedBy: user?.login ?? undefined,
        });
    }

    @Get(METHODOLOGY_PREVIEW_ROUTE)
    @ApiOperation({
        summary: 'Состояние проверки черновика методики',
        description:
            'Состояние и, когда готово, итог проверки по номеру из ответа на ' +
            'запуск. Хранится час; только чтение.',
    })
    @ApiOkResponse({
        description: 'Состояние проверки.',
        type: MethodologyPreviewStateDto,
    })
    @ApiNotFoundResponse({
        description: 'Проверки с таким номером нет или срок хранения вышел.',
    })
    status(
        @Query() query: MethodologyPreviewQueryDto,
    ): Promise<MethodologyPreviewStateDto> {
        return this.service.status(query.previewId);
    }
}
