import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    Patch,
    Post,
} from '@nestjs/common';
import {
    ApiBody,
    ApiNoContentResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { PbxTemplateBaseUseCase } from '../use-cases/pbx-template-base.use-case';
import { CreateTemplateBaseDto } from '../dto/create-template-base.dto';
import { UpdateTemplateBaseDto } from '../dto/update-template-base.dto';
import { TemplateBaseResponseDto } from '../dto/template-base-response.dto';

/**
 * CRUD-управление шаблонами конструктора (`templates`) и их связями с полями
 * (`template_field`) из pbx-install.
 */
@ApiTags('PBX Template Base')
@Controller('pbx-template-base')
export class PbxTemplateBaseController {
    constructor(private readonly useCase: PbxTemplateBaseUseCase) {}

    @ApiOperation({
        summary: 'Список шаблонов',
        description: 'Все шаблоны конструктора (`templates`) со связями.',
    })
    @ApiOkResponse({ type: [TemplateBaseResponseDto] })
    @Get()
    async list(): Promise<TemplateBaseResponseDto[]> {
        const templates = await this.useCase.list();
        return templates.map(t => new TemplateBaseResponseDto(t));
    }

    @ApiOperation({
        summary: 'Шаблон по id',
        description: 'Один шаблон конструктора (`templates`) по id.',
    })
    @ApiParam({ name: 'id', description: 'ID шаблона', type: Number })
    @ApiOkResponse({ type: TemplateBaseResponseDto })
    @Get(':id')
    async getById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<TemplateBaseResponseDto> {
        const template = await this.useCase.getById(id);
        return new TemplateBaseResponseDto(template);
    }

    @ApiOperation({
        summary: 'Создать шаблон',
        description: 'Создаёт новый шаблон конструктора (`templates`).',
    })
    @ApiBody({ type: CreateTemplateBaseDto })
    @ApiOkResponse({ type: TemplateBaseResponseDto })
    @Post()
    async create(
        @Body() dto: CreateTemplateBaseDto,
    ): Promise<TemplateBaseResponseDto> {
        const template = await this.useCase.create(dto);
        return new TemplateBaseResponseDto(template);
    }

    @ApiOperation({
        summary: 'Обновить шаблон',
        description: 'Частично обновляет шаблон конструктора по id.',
    })
    @ApiParam({ name: 'id', description: 'ID шаблона', type: Number })
    @ApiBody({ type: UpdateTemplateBaseDto })
    @ApiOkResponse({ type: TemplateBaseResponseDto })
    @Patch(':id')
    async update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateTemplateBaseDto,
    ): Promise<TemplateBaseResponseDto> {
        const template = await this.useCase.update(id, dto);
        return new TemplateBaseResponseDto(template);
    }

    @ApiOperation({
        summary: 'Удалить шаблон',
        description: 'Удаляет шаблон конструктора по id (каскадно — связи).',
    })
    @ApiParam({ name: 'id', description: 'ID шаблона', type: Number })
    @ApiNoContentResponse({ description: 'Шаблон удалён' })
    @HttpCode(204)
    @Delete(':id')
    async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
        await this.useCase.remove(id);
    }

    @ApiOperation({
        summary: 'Привязать поле к шаблону',
        description:
            'Создаёт связь `template_field` между шаблоном и полем. Идемпотентно: ' +
            'повторный вызов не создаёт дубль.',
    })
    @ApiParam({ name: 'id', description: 'ID шаблона', type: Number })
    @ApiParam({ name: 'fieldId', description: 'ID поля', type: Number })
    @ApiOkResponse({ type: TemplateBaseResponseDto })
    @Post(':id/fields/:fieldId')
    async attachField(
        @Param('id', ParseIntPipe) id: number,
        @Param('fieldId', ParseIntPipe) fieldId: number,
    ): Promise<TemplateBaseResponseDto> {
        const template = await this.useCase.attachField(id, fieldId);
        return new TemplateBaseResponseDto(template);
    }

    @ApiOperation({
        summary: 'Отвязать поле от шаблона',
        description: 'Удаляет связь `template_field` между шаблоном и полем.',
    })
    @ApiParam({ name: 'id', description: 'ID шаблона', type: Number })
    @ApiParam({ name: 'fieldId', description: 'ID поля', type: Number })
    @ApiOkResponse({ type: TemplateBaseResponseDto })
    @Delete(':id/fields/:fieldId')
    async detachField(
        @Param('id', ParseIntPipe) id: number,
        @Param('fieldId', ParseIntPipe) fieldId: number,
    ): Promise<TemplateBaseResponseDto> {
        const template = await this.useCase.detachField(id, fieldId);
        return new TemplateBaseResponseDto(template);
    }
}
