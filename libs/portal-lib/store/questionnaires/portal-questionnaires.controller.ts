import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    NotFoundException,
    Param,
    ParseIntPipe,
    Post,
    Put,
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
import { EnumPortalAppCode } from '../app-settings/portal-app-settings.schema';
import { PortalQuestionnaireRecord } from './portal-questionnaires.repository';
import { PortalQuestionnairesService } from './portal-questionnaires.service';
import {
    PortalQuestionnaireDto,
    PortalQuestionnaireFieldSyncDto,
    PortalQuestionnaireFieldSyncResultDto,
    PortalQuestionnaireListItemDto,
    PortalQuestionnaireSaveDto,
    PortalQuestionnaireSchemaDto,
    toPortalQuestionnaireDto,
    toPortalQuestionnaireListItemDto,
} from './portal-questionnaires.dto';

/**
 * Редактор портального каталога анкет: вкладка «Анкеты» карточки портала.
 *
 * Состав вопросов плана и отчёта задаётся ЗДЕСЬ, из полей, которые владелец
 * портала завёл в Битриксе руками, и хранится в БД — фронт не знает ни
 * одного кода вопроса заранее. Реестр допустимых значений админка получает
 * из `GET /schema` и ничего не хардкодит.
 *
 * Сверка привязок с живым Битриксом (`POST /:id/check`) живёт в админском
 * приложении — `apps/admin/src/portal/questionnaires`: ей нужен PBXService,
 * которого в сторе портала нет и быть не должно. А вот ПРИМЕНЕНИЕ её
 * разбора (`POST /:id/apply-field-sync`) — здесь: Битрикс ему не нужен,
 * оно пишет в наши же таблицы уже принятыми владельцем значениями.
 */
@ApiTags('Admin Portal Questionnaires')
@Controller('admin/portal/:portalId/questionnaires')
export class PortalQuestionnairesController {
    constructor(private readonly service: PortalQuestionnairesService) {}

    /**
     * ВНИМАНИЕ: маршрут объявлен ФИЗИЧЕСКИ ВЫШЕ `GET /:id` — Nest разбирает
     * маршруты в порядке объявления, и ниже слово `schema` уехало бы в
     * параметр `id` (404 «Анкета schema не найдена», а с ParseUUIDPipe —
     * невнятный 400). Новые статические маршруты добавлять только сюда, в
     * этот блок.
     */
    @Get('schema')
    @ApiOperation({
        summary: 'Реестр допустимых значений для редактора анкет',
        description:
            'Назначения, способы показа, типы отображения, каналы записи, ' +
            'виды условий СО СПРАВОЧНИКАМИ значений, поля отчёта и матрица ' +
            '«тип поля Битрикса → допустимые типы отображения». Редактор ' +
            'обязан фильтровать выбор по матрице: несовместимую пару бэк ' +
            'вернёт ошибкой сохранения.',
    })
    @ApiParam({
        name: 'portalId',
        description: 'Идентификатор портала (наша БД).',
        type: Number,
        example: 7,
    })
    @ApiOkResponse({
        type: PortalQuestionnaireSchemaDto,
        description: 'Реестр целиком: он одинаков для всех порталов.',
    })
    getSchema(): PortalQuestionnaireSchemaDto {
        return this.service.getSchema();
    }

    @Get()
    @ApiOperation({
        summary: 'Анкеты портала (без состава)',
        description:
            'Все анкеты портала, включая выключенные. `issuesCount` — ' +
            'сколько вопросов не доедет до менеджера из-за сломанной ' +
            'привязки к полю.',
    })
    @ApiParam({
        name: 'portalId',
        description: 'Идентификатор портала (наша БД).',
        type: Number,
        example: 7,
    })
    @ApiQuery({
        name: 'appCode',
        required: false,
        description: 'Фильтр по приложению; без него — анкеты всех.',
        type: String,
        example: EnumPortalAppCode.eventSales,
    })
    @ApiOkResponse({
        type: [PortalQuestionnaireListItemDto],
        description: 'Строки списка в порядке показа.',
    })
    async list(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Query('appCode') appCode?: string,
    ): Promise<PortalQuestionnaireListItemDto[]> {
        const records = await this.service.listByPortal(portalId, appCode);
        return records.map(toPortalQuestionnaireListItemDto);
    }

    @Get(':id')
    @ApiOperation({
        summary: 'Анкета целиком: вопросы и варианты справочников',
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
    @ApiOkResponse({ type: PortalQuestionnaireDto })
    async getOne(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Param('id') id: string,
    ): Promise<PortalQuestionnaireDto> {
        return toPortalQuestionnaireDto(await this.requireOwned(portalId, id));
    }

    @Post()
    @HttpCode(200)
    @ApiOperation({
        summary: 'Создать анкету',
        description:
            'Код анкеты уникален внутри приложения портала: если анкета с ' +
            'таким кодом уже есть, она будет обновлена — создание и правка ' +
            'ведут в одно и то же хранилище.',
    })
    @ApiParam({
        name: 'portalId',
        description: 'Идентификатор портала (наша БД).',
        type: Number,
        example: 7,
    })
    @ApiBody({ type: PortalQuestionnaireSaveDto })
    @ApiOkResponse({ type: PortalQuestionnaireDto })
    async create(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Body() dto: PortalQuestionnaireSaveDto,
    ): Promise<PortalQuestionnaireDto> {
        // id из тела на создании игнорируем: маршрут создания не должен
        // уметь переписать чужую анкету по подсунутому идентификатору.
        const record = await this.service.save(portalId, { ...dto, id: null });
        return toPortalQuestionnaireDto(record);
    }

    @Put(':id')
    @ApiOperation({
        summary: 'Сохранить анкету целиком',
        description:
            'Состав сохраняется одной транзакцией и опознаётся по коду ' +
            'вопроса: которого нет в `items` — ГАСИТСЯ вместе с ' +
            'вариантами, но остаётся в БД, иначе уже собранный в CRM ' +
            'ответ объяснить нечем. Версия анкеты растёт, кэш каталога ' +
            'домена сбрасывается.',
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
    @ApiBody({ type: PortalQuestionnaireSaveDto })
    @ApiOkResponse({ type: PortalQuestionnaireDto })
    async update(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Param('id') id: string,
        @Body() dto: PortalQuestionnaireSaveDto,
    ): Promise<PortalQuestionnaireDto> {
        await this.requireOwned(portalId, id);
        const record = await this.service.save(portalId, { ...dto, id });
        return toPortalQuestionnaireDto(record);
    }

    @Delete(':id')
    @ApiOperation({
        summary: 'Удалить анкету',
        description: 'Вопросы и варианты уходят каскадом.',
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
    @ApiOkResponse({ description: 'Анкета удалена.' })
    async remove(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Param('id') id: string,
    ): Promise<void> {
        await this.requireOwned(portalId, id);
        await this.service.remove(id);
    }

    @Post(':id/apply-field-sync')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Подтянуть из Битрикса выбранные расхождения',
        description:
            'Применяет РОВНО то, что владелец отметил в разборе ' +
            'расхождений (`POST /:id/check`): подпись вопроса, подписи ' +
            'вариантов и новые варианты справочника. Всё одной ' +
            'транзакцией, версия анкеты растёт, кэш каталога домена ' +
            'сбрасывается. ' +
            'Почему отдельной кнопкой, а не сверкой: формулировку вопроса ' +
            'и подписи вариантов владелец правит под себя, и затирать их ' +
            'живым текстом Битрикса автоматически нельзя. Сверка сама ' +
            'правит только адрес записи — `bitrixId` и гашение ' +
            'исчезнувшего варианта. ' +
            'Новый вариант заводится ТОЛЬКО с `bitrixId`: без ' +
            'идентификатора элемента списка ответ на него в поле не ' +
            'записать.',
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
    @ApiBody({ type: PortalQuestionnaireFieldSyncDto })
    @ApiOkResponse({ type: PortalQuestionnaireFieldSyncResultDto })
    async applyFieldSync(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Param('id') id: string,
        @Body() dto: PortalQuestionnaireFieldSyncDto,
    ): Promise<PortalQuestionnaireFieldSyncResultDto> {
        await this.requireOwned(portalId, id);
        const outcome = await this.service.applyFieldSync(id, dto.items);
        return {
            questionnaire: toPortalQuestionnaireDto(outcome.questionnaire),
            appliedTitles: outcome.titles,
            renamedOptions: outcome.renamedOptions,
            addedOptions: outcome.addedOptions,
        };
    }

    /**
     * Анкета обязана принадлежать порталу из маршрута: идентификатор
     * анкеты глобальный, и без этой проверки админ одного портала правил
     * бы анкеты соседнего, подставив чужой uuid.
     */
    private async requireOwned(
        portalId: number,
        id: string,
    ): Promise<PortalQuestionnaireRecord> {
        const record = await this.service.getById(id);
        if (record.portalId !== portalId) {
            throw new NotFoundException(
                `Анкета ${id} не принадлежит порталу ${portalId}`,
            );
        }
        return record;
    }
}
