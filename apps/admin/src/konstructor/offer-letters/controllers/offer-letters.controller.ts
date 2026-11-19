import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { Role, Roles } from '@lib/auth';
import { OfferLetterService } from '@lib/portal-lib/konstructor';
import { CreateOfferLetterDto } from '../dto/create-offer-letter.dto';
import {
    OfferLetterDeletedDto,
    OfferLetterResponseDto,
} from '../dto/offer-letter-response.dto';
import { OfferLettersQueryDto } from '../dto/offer-letters-query.dto';
import { UpdateOfferLetterDto } from '../dto/update-offer-letter.dto';
import { toOfferLetterResponse } from '../lib/offer-letter-response.util';

/**
 * Письма КП (`offer_letters`): письма портала и личные письма менеджеров.
 * Доступ — только SUPER_USER. Правила письма по умолчанию — в
 * `OfferLetterService`.
 */
@ApiTags('Admin Konstructor Offer Letters')
@ApiBearerAuth()
@Roles(Role.SUPER_USER)
@Controller('admin/konstructor/offer-letters')
export class OfferLettersController {
    constructor(private readonly service: OfferLetterService) {}

    @Get()
    @ApiOperation({
        summary: 'Письма КП портала',
        description:
            'Все письма портала: письма самого портала (`bxUserId = null`) и личные письма его менеджеров, по порядку `sort`.',
    })
    @ApiOkResponse({
        type: [OfferLetterResponseDto],
        description: 'Письма портала; пустой список, если писем нет.',
    })
    async list(
        @Query() query: OfferLettersQueryDto,
    ): Promise<OfferLetterResponseDto[]> {
        const letters = await this.service.list(query.portalId);
        return letters.map(toOfferLetterResponse);
    }

    @Get(':id')
    @ApiOperation({
        summary: 'Письмо КП по id',
        description: 'Возвращает одно письмо. Нет такого письма — 404.',
    })
    @ApiParam({
        name: 'id',
        type: String,
        description: 'Идентификатор письма (uuid).',
    })
    @ApiOkResponse({ type: OfferLetterResponseDto, description: 'Письмо.' })
    async get(
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<OfferLetterResponseDto> {
        return toOfferLetterResponse(await this.service.get(id));
    }

    @Post()
    @HttpCode(200)
    @ApiOperation({
        summary: 'Создать письмо КП',
        description:
            'Создаёт письмо портала (без `bxUserId`) или личное письмо менеджера. ' +
            'Разметка проверяется: допустимы только `<color>`, `<bold>`, `<red>`, все закрыты. ' +
            'Первое активное письмо области становится письмом по умолчанию само; ' +
            'с `isDefault: true` письмо забирает этот статус у прежнего.',
    })
    @ApiBody({
        type: CreateOfferLetterDto,
        description: 'Данные нового письма.',
    })
    @ApiOkResponse({
        type: OfferLetterResponseDto,
        description: 'Созданное письмо.',
    })
    async create(
        @Body() dto: CreateOfferLetterDto,
    ): Promise<OfferLetterResponseDto> {
        return toOfferLetterResponse(await this.service.create(dto));
    }

    @Patch(':id')
    @ApiOperation({
        summary: 'Изменить письмо КП',
        description:
            'Меняет только переданные поля: название, текст, активность, порядок. ' +
            'Если выключено письмо по умолчанию, его место занимает следующее активное письмо области.',
    })
    @ApiParam({
        name: 'id',
        type: String,
        description: 'Идентификатор письма (uuid).',
    })
    @ApiBody({
        type: UpdateOfferLetterDto,
        description: 'Поля письма для изменения.',
    })
    @ApiOkResponse({
        type: OfferLetterResponseDto,
        description: 'Письмо после изменения.',
    })
    async update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateOfferLetterDto,
    ): Promise<OfferLetterResponseDto> {
        return toOfferLetterResponse(await this.service.update(id, dto));
    }

    @Post(':id/default')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сделать письмо КП письмом по умолчанию',
        description:
            'Назначает письмо письмом по умолчанию своей области (портала или менеджера); прежнее перестаёт им быть. ' +
            'Неактивное письмо назначить нельзя.',
    })
    @ApiParam({
        name: 'id',
        type: String,
        description: 'Идентификатор письма (uuid).',
    })
    @ApiOkResponse({
        type: OfferLetterResponseDto,
        description: 'Письмо по умолчанию.',
    })
    async setDefault(
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<OfferLetterResponseDto> {
        return toOfferLetterResponse(await this.service.setDefault(id));
    }

    @Delete(':id')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Удалить письмо КП',
        description:
            'Удаляет письмо. Если оно было письмом по умолчанию, его место занимает следующее активное письмо области.',
    })
    @ApiParam({
        name: 'id',
        type: String,
        description: 'Идентификатор письма (uuid).',
    })
    @ApiOkResponse({
        type: OfferLetterDeletedDto,
        description: 'Идентификатор удалённого письма.',
    })
    async remove(
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<OfferLetterDeletedDto> {
        await this.service.remove(id);
        return { id };
    }
}
