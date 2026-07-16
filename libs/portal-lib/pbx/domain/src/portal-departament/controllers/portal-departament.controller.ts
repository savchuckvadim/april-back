import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
} from '@nestjs/common';
import {
    ApiBody,
    ApiCreatedResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { PortalDepartamentService } from '../services/portal-departament.service';
import { CreatePortalDepartamentDto } from '../dto/create-portal-departament.dto';
import { UpdatePortalDepartamentDto } from '../dto/update-portal-departament.dto';
import { PortalDepartamentResponseDto } from '../dto/portal-departament-response.dto';

/**
 * Полный CRUD отделов (`departaments`) только по PortalDB.
 * В Bitrix ничего не пишется: `bitrixId` — id уже существующего отдела.
 */
@ApiTags('PBX Portal Departament (DB)')
@Controller('pbx/portal-departament')
export class PortalDepartamentController {
    constructor(
        private readonly portalDepartamentService: PortalDepartamentService,
    ) {}

    @ApiOperation({
        summary: 'Список всех отделов',
        description: 'Возвращает все строки `departaments` по всем порталам.',
    })
    @ApiOkResponse({
        type: PortalDepartamentResponseDto,
        isArray: true,
        description: 'Все отделы всех порталов.',
    })
    @Get()
    async list(): Promise<PortalDepartamentResponseDto[]> {
        return this.portalDepartamentService.findMany();
    }

    @ApiOperation({
        summary: 'Отделы портала',
        description: 'Возвращает отделы (`departaments`) одного портала.',
    })
    @ApiParam({ name: 'portalId', description: 'ID портала в нашей БД' })
    @ApiOkResponse({
        type: PortalDepartamentResponseDto,
        isArray: true,
        description: 'Отделы указанного портала.',
    })
    @Get('by-portal/:portalId')
    async listByPortal(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<PortalDepartamentResponseDto[]> {
        return this.portalDepartamentService.findByPortalId(portalId);
    }

    @ApiOperation({
        summary: 'Один отдел по id',
        description: 'Возвращает строку `departaments` по id.',
    })
    @ApiParam({ name: 'id', description: 'ID строки отдела в БД' })
    @ApiOkResponse({
        type: PortalDepartamentResponseDto,
        description: 'Найденный отдел.',
    })
    @ApiNotFoundResponse({ description: 'Отдел не найден' })
    @Get(':id')
    async getById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<PortalDepartamentResponseDto> {
        return this.portalDepartamentService.findById(id);
    }

    @ApiOperation({
        summary: 'Создать отдел',
        description:
            'Создаёт строку `departaments`. В Bitrix ничего не пишется — ' +
            '`bitrixId` указывает на уже существующий отдел. ' +
            'Поля `isMultiple` / `multipleTag` управляют сборкой ЦУП из ' +
            'разрозненных по структуре отделов.',
    })
    @ApiBody({
        type: CreatePortalDepartamentDto,
        description: 'Данные нового отдела.',
    })
    @ApiCreatedResponse({
        type: PortalDepartamentResponseDto,
        description: 'Созданный отдел.',
    })
    @Post()
    async create(
        @Body() dto: CreatePortalDepartamentDto,
    ): Promise<PortalDepartamentResponseDto> {
        return this.portalDepartamentService.create(dto);
    }

    @ApiOperation({
        summary: 'Обновить отдел',
        description:
            'Точечно обновляет отдел по id: name / title / bitrixId / ' +
            'isMultiple / multipleTag (null сбрасывает тэг). ' +
            'type / group / портал менять нельзя.',
    })
    @ApiParam({ name: 'id', description: 'ID строки отдела в БД' })
    @ApiBody({
        type: UpdatePortalDepartamentDto,
        description: 'Частичное обновление полей отдела.',
    })
    @ApiOkResponse({
        type: PortalDepartamentResponseDto,
        description: 'Отдел после обновления.',
    })
    @ApiNotFoundResponse({ description: 'Отдел не найден' })
    @Patch(':id')
    async update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdatePortalDepartamentDto,
    ): Promise<PortalDepartamentResponseDto> {
        return this.portalDepartamentService.update(id, dto);
    }

    @ApiOperation({
        summary: 'Удалить отдел',
        description: 'Удаляет строку `departaments` по id.',
    })
    @ApiParam({ name: 'id', description: 'ID строки отдела в БД' })
    @ApiOkResponse({ description: 'Отдел удалён, тело ответа пустое.' })
    @ApiNotFoundResponse({ description: 'Отдел не найден' })
    @Delete(':id')
    async delete(@Param('id', ParseIntPipe) id: number): Promise<void> {
        return this.portalDepartamentService.delete(id);
    }
}
