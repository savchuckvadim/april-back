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
import { QuestionnaireCheckResponseDto } from '../dto/questionnaire-check.dto';
import { QuestionnaireCheckService } from '../services/questionnaire-check.service';

/**
 * «Проверить привязки» — единственный маршрут анкет, которому нужен живой
 * Битрикс, поэтому он и живёт в админском приложении, а не в сторе
 * портала. Путь тот же, что у редактора
 * (`admin/portal/:portalId/questionnaires`), и Swagger-тег тот же: для
 * админки это одна поверхность.
 *
 * Маршрут длиннее всех маршрутов редактора на сегмент `check`, так что с
 * `POST /questionnaires` (создание) он не спорит.
 */
@ApiTags('Admin Portal Questionnaires')
@Controller('admin/portal/:portalId/questionnaires')
export class QuestionnaireCheckController {
    constructor(private readonly service: QuestionnaireCheckService) {}

    @Post(':id/check')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сверить привязки анкеты с живым Битриксом',
        description:
            'ПО КНОПКЕ, не по расписанию: проверка ходит в Битрикс портала ' +
            'и меняет состав того, что видит менеджер. Для каждого вопроса ' +
            'канала «Поле CRM» поле ищется по его UF-имени; результат — ' +
            '`ok` / `missing` / `type_changed`, отметка проверки и синк ' +
            'вариантов справочника (исчезнувшие гасятся, идентификаторы ' +
            'обновляются). Если прав администратора CRM не хватило и поля ' +
            'читались урезанным способом, статусы НЕ меняются — обновится ' +
            'только отметка проверки, а в ответе будет `degraded: true`.',
    })
    @ApiParam({
        name: 'portalId',
        description: 'Идентификатор портала (наша БД).',
        type: Number,
        example: 7,
    })
    @ApiParam({
        name: 'id',
        description: 'Идентификатор анкеты (uuid).',
        type: String,
    })
    @ApiOkResponse({ type: QuestionnaireCheckResponseDto })
    async check(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Param('id') id: string,
    ): Promise<QuestionnaireCheckResponseDto> {
        return this.service.check(portalId, id);
    }
}
