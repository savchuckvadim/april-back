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
    ApiBearerAuth,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Role, Roles, type AuthUser } from '@lib/auth';
import {
    AnalysisPreviewQueryDto,
    AnalysisPreviewStartDto,
    AnalysisPreviewStateDto,
} from '../dto/analysis-preview.dto';
import { AnalysisPreviewService } from '../services/analysis-preview.service';

/** Раздел админки проверки разбора — один путь для запуска и опроса. */
export const ANALYSIS_PREVIEW_ADMIN_PATH = 'admin/call-analysis-preview';
export const ANALYSIS_PREVIEW_ADMIN_TAG = 'Admin Call Analysis Preview';

/**
 * Проверка разбора на одном звонке без записи (задание с цитатами
 * focus-v3.4). Живёт только в apps/admin: ставит задание воркеру event-sales
 * и читает состояние из Redis. Вызов модели платный — только
 * суперпользователь.
 */
@ApiTags(ANALYSIS_PREVIEW_ADMIN_TAG)
@ApiBearerAuth()
@Roles(Role.SUPER_USER)
@Controller(ANALYSIS_PREVIEW_ADMIN_PATH)
export class AnalysisPreviewController {
    constructor(private readonly service: AnalysisPreviewService) {}

    @Post()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Проверить разбор с цитатами на одном звонке',
        description:
            'Ставит задание: полный разбор уже разобранного звонка портала ' +
            'новым заданием — с цитатами и секундами у разделов, ' +
            'потребностей, пунктов «хвоста» и 5К — тем же входом, что у ' +
            'переразбора. Итог — места разбора в разговоре (сколько нашлось ' +
            'в записи) и оценки «сейчас → по проверке». Ничего не ' +
            'сохраняет: разбор звонка и карточка в Битрикс24 не меняются; ' +
            'расход модели — как у одного разбора. Флаг longParts — ' +
            'разобрать длинный разговор по частям, даже если режим ' +
            'выключен в настройках; в итоге тогда есть блок longCall. ' +
            'Отвечает сразу состоянием «в очереди»; итог читается опросом.',
    })
    @ApiOkResponse({
        description: 'Проверка поставлена в очередь.',
        type: AnalysisPreviewStateDto,
    })
    start(
        @Body() dto: AnalysisPreviewStartDto,
        @CurrentUser() user?: AuthUser,
    ): Promise<AnalysisPreviewStateDto> {
        return this.service.start({
            domain: dto.domain.trim(),
            transcriptionId: dto.transcriptionId,
            longParts: dto.longParts,
            requestedBy: user?.login ?? undefined,
        });
    }

    @Get()
    @ApiOperation({
        summary: 'Состояние проверки разбора на звонке',
        description:
            'Состояние и, когда готово, итог проверки по номеру из ответа на ' +
            'запуск. Хранится час; только чтение.',
    })
    @ApiOkResponse({
        description: 'Состояние проверки.',
        type: AnalysisPreviewStateDto,
    })
    @ApiNotFoundResponse({
        description: 'Проверки с таким номером нет или срок хранения вышел.',
    })
    status(
        @Query() query: AnalysisPreviewQueryDto,
    ): Promise<AnalysisPreviewStateDto> {
        return this.service.status(query.previewId);
    }
}
