import {
    BadRequestException,
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    Post,
    Query,
} from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import {
    EnumQuestionnaireFieldSource,
    QUESTIONNAIRE_FIELD_SOURCES,
    QuestionnaireFieldSourcesResponseDto,
} from '../dto/questionnaire-field-source.dto';
import { QuestionnaireFieldsResponseDto } from '../dto/questionnaire-field.dto';
import {
    QuestionnaireFieldCreateDto,
    QuestionnaireFieldCreateResponseDto,
} from '../dto/questionnaire-field-create.dto';
import { QuestionnaireFieldsService } from '../services/questionnaire-fields.service';

/**
 * Источник полей для редактора анкет: что СЕЙЧАС заведено в Битриксе
 * портала.
 *
 * Живёт в админском приложении, а не в сторе портала, ровно по одной
 * причине — здесь есть PBXService. Стор анкет импортируют прикладные
 * приложения, и Битрикс в него тащить нельзя.
 */
@ApiTags('Admin Portal Questionnaire Fields')
@Controller('admin/portal/:portalId/questionnaire-fields')
export class QuestionnaireFieldsController {
    constructor(private readonly service: QuestionnaireFieldsService) {}

    /**
     * Объявлен выше `GET /` только для читаемости: параметрических
     * маршрутов в этом контроллере нет, перехватывать `sources` нечему.
     */
    @Get('sources')
    @ApiOperation({
        summary: 'Носители полей портала',
        description:
            'Четыре штатные сущности CRM и все смарт-процессы портала. ' +
            'Для смарта возвращаются ОБА идентификатора: `bitrixId` (из ' +
            '`crm.type.list`) адресует поля, `entityTypeId` — только ' +
            'методы `crm.item.*`. Обратно в `?smartId=` передаётся ' +
            '`smartId` — идентификатор строки в нашей БД. Носитель, у ' +
            'которого поле выбрано, редактор обязан вернуть в ' +
            '`fieldSource` при сохранении, а для смарта — ещё и `smartId`: ' +
            'поле смарта пишется каналом «Поле элемента смарта» в тот ' +
            'элемент, который создаёт или закрывает поток события, и ' +
            'доступно анкетам, привязанным к типу события этого смарта.',
    })
    @ApiParam({
        name: 'portalId',
        description: 'Идентификатор портала (наша БД).',
        type: Number,
        example: 7,
    })
    @ApiOkResponse({ type: QuestionnaireFieldSourcesResponseDto })
    async listSources(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<QuestionnaireFieldSourcesResponseDto> {
        return this.service.listSources(portalId);
    }

    @Get()
    @ApiOperation({
        summary: 'Живые пользовательские поля носителя',
        description:
            'Поля читаются из Битрикса постранично: `userfieldconfig` ' +
            'отдаёт порядка 50 полей за раз, и без обхода страниц часть ' +
            'полей владельца просто не появилась бы в списке выбора. ' +
            '`inPortalDb: false` означает, что поля нет в нашем слепке — ' +
            'его завёл пользователь ВРУЧНУЮ, и это именно то, из чего ' +
            'собирается анкета. Строку в слепок для такого поля мы не ' +
            'создаём: переустановка сущности сносит все её строки скопом.',
    })
    @ApiParam({
        name: 'portalId',
        description: 'Идентификатор портала (наша БД).',
        type: Number,
        example: 7,
    })
    @ApiQuery({
        name: 'entity',
        description: 'Носитель полей.',
        enum: QUESTIONNAIRE_FIELD_SOURCES,
        example: EnumQuestionnaireFieldSource.company,
    })
    @ApiQuery({
        name: 'smartId',
        required: false,
        description:
            'Обязателен для носителя «смарт-процесс»: идентификатор строки ' +
            'из `GET /sources` (наша БД, НЕ идентификатор Битрикса).',
        type: Number,
    })
    @ApiQuery({
        name: 'onlyManual',
        required: false,
        description:
            'Оставить только поля, которых нет в нашем слепке — ' +
            'заведённые владельцем портала руками.',
        type: Boolean,
        example: true,
    })
    @ApiOkResponse({ type: QuestionnaireFieldsResponseDto })
    async listFields(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Query('entity') entity: EnumQuestionnaireFieldSource,
        @Query('smartId') smartId?: string,
        @Query('onlyManual') onlyManual?: string,
    ): Promise<QuestionnaireFieldsResponseDto> {
        if (!QUESTIONNAIRE_FIELD_SOURCES.includes(entity)) {
            throw new BadRequestException(
                `Неизвестный носитель ${String(entity)}: допустимы ` +
                    QUESTIONNAIRE_FIELD_SOURCES.join(', '),
            );
        }
        return this.service.listFields(
            portalId,
            entity,
            this.toNumber(smartId),
            this.toBoolean(onlyManual),
        );
    }

    @Post()
    @HttpCode(200)
    @ApiOperation({
        summary: 'Завести поле в носителе',
        description:
            'Создаёт пользовательское поле прямо в Битриксе портала и ' +
            'возвращает его В ТОМ ЖЕ ВИДЕ, что и список полей: имя поля ' +
            'и идентификаторы значений списка ПРОЧИТАНЫ ОБРАТНО из ' +
            'Битрикса, а не собраны формулой (формула имени врёт — ' +
            'боевой инцидент UF_CRM_94_TRANSCRIPT_1), поэтому редактор ' +
            'собирает из ответа вопрос без второго запроса. Повтор с тем ' +
            'же кодом дубля НЕ создаёт: поле сначала ищется среди уже ' +
            'заведённых, и найденное возвращается как есть ' +
            '(`created: false`) — настройки чужому полю мы не правим. ' +
            'Строку в слепок `bitrixfields` ручка не создаёт никогда: ' +
            'переустановка сущности сносит её строки скопом вместе со ' +
            'смыслом анкеты. Метод требует прав администратора CRM ' +
            '(`userfieldconfig`): без них приходит 403 с рецептом, а не ' +
            'урезанный режим — писать `crm.item.fields` не умеет. ' +
            'ДОЛГАЯ: список полей носителя, запись и чтение назад — на ' +
            'большом портале это десятки секунд, клиенту нужен свой ' +
            'таймаут и запрет второго нажатия.',
    })
    @ApiParam({
        name: 'portalId',
        description: 'Идентификатор портала (наша БД).',
        type: Number,
        example: 7,
    })
    @ApiBody({ type: QuestionnaireFieldCreateDto })
    @ApiOkResponse({ type: QuestionnaireFieldCreateResponseDto })
    async createField(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Body() dto: QuestionnaireFieldCreateDto,
    ): Promise<QuestionnaireFieldCreateResponseDto> {
        return this.service.createField(portalId, dto);
    }

    /** Query-параметры приходят строками — приводим сами и предсказуемо. */
    private toNumber(value?: string): number | undefined {
        if (value === undefined || value === '') return undefined;
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed <= 0) {
            throw new BadRequestException(
                `smartId должен быть положительным числом, получено ${value}`,
            );
        }
        return parsed;
    }

    private toBoolean(value?: string): boolean {
        return value === 'true' || value === '1';
    }
}
