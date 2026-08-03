import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import {
    DuplicateDetailsRequestDto,
    DuplicateDetailsResponseDto,
    DuplicateFieldMapResponseDto,
    SearchDuplicatesRequestDto,
    SearchDuplicatesResponseDto,
} from '../dto/duplicates.dto';
import { DuplicatesUseCase } from '../use-cases/duplicates.use-case';

/**
 * Поиск дублей клиента из фрейма отдела продаж.
 *
 * Менеджер открывает приложение из лида, компании, сделки или карточки
 * звонка — эндпоинт сам собирает сигналы нужной сущности (включая связанные
 * компанию и контакт) и ищет по ним двойников среди лидов, контактов,
 * компаний и сделок.
 */
@ApiTags('Duplicates')
@Controller('duplicates')
export class DuplicatesController {
    constructor(private readonly useCase: DuplicatesUseCase) {}

    @Post('search')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Найти дубли клиента',
        description:
            'Собирает сигналы (телефон, email, ИНН, название) по указанной ' +
            'сущности и/или из переданных вручную значений и ищет совпадения ' +
            'в CRM. Уровень 1 укладывается в один HTTP-запрос к порталу, ' +
            'повторный вызов с тем же набором сигналов в пределах двух минут ' +
            'отдаётся из кэша.',
    })
    @ApiBody({
        type: SearchDuplicatesRequestDto,
        description: 'Контекст поиска: сущность и/или ручные сигналы.',
    })
    @ApiOkResponse({
        type: SearchDuplicatesResponseDto,
        description:
            'Кандидаты с причинами совпадения и цена запроса в обращениях к порталу.',
    })
    search(
        @Body() dto: SearchDuplicatesRequestDto,
    ): Promise<SearchDuplicatesResponseDto> {
        return this.useCase.searchDuplicates(dto);
    }

    @Post('details')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Детали найденного дубля',
        description:
            'Кто ответственный за кандидата и что с ним уже происходит: ' +
            'связанные сделки со стадией из настроек портала (код, название, ' +
            'цвет, позиция в воронке) и связанные лиды. По умолчанию только ' +
            'открытые сделки; техническая стадия APOLOGY скрыта всегда.',
    })
    @ApiBody({
        type: DuplicateDetailsRequestDto,
        description: 'Кандидат, по которому нужны подробности.',
    })
    @ApiOkResponse({
        type: DuplicateDetailsResponseDto,
        description: 'Ответственный, связанные сделки и лиды.',
    })
    details(
        @Body() dto: DuplicateDetailsRequestDto,
    ): Promise<DuplicateDetailsResponseDto> {
        return this.useCase.getDetails(dto);
    }

    @Get('domain/:domain/field-map')
    @ApiOperation({
        summary: 'Карта ИНН-полей портала',
        description:
            'Где на этом портале лежит ИНН: поля из нашего шаблона, из базы ' +
            'портала и найденные сканом живых пользовательских полей по ' +
            'названию. Отдаётся из кэша — портал при этом не опрашивается.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала Битрикс.' })
    @ApiOkResponse({
        type: DuplicateFieldMapResponseDto,
        description: 'Поля-сигналы портала с указанием источника.',
    })
    getFieldMap(
        @Param('domain') domain: string,
    ): Promise<DuplicateFieldMapResponseDto> {
        return this.useCase.getFieldMap(domain);
    }

    @Post('domain/:domain/field-map/rescan')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Пересканировать поля портала',
        description:
            'Принудительно перечитывает пользовательские поля лида, контакта, ' +
            'компании и сделки и обновляет карту в кэше. Нужен, когда на ' +
            'портале завели новое поле под ИНН.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала Битрикс.' })
    @ApiOkResponse({
        type: DuplicateFieldMapResponseDto,
        description: 'Обновлённая карта полей.',
    })
    rescanFieldMap(
        @Param('domain') domain: string,
    ): Promise<DuplicateFieldMapResponseDto> {
        return this.useCase.rescanFieldMap(domain);
    }
}
