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
import { PbxFieldUseCase } from '../use-cases/pbx-field.use-case';
import { CreateFieldDto } from '../dto/create-field.dto';
import { UpdateFieldDto } from '../dto/update-field.dto';
import { FieldResponseDto } from '../dto/field-response.dto';

/**
 * CRUD-управление полями конструктора (`fields`) из pbx-install.
 */
@ApiTags('PBX Field')
@Controller('pbx-field')
export class PbxFieldController {
    constructor(private readonly useCase: PbxFieldUseCase) {}

    @ApiOperation({
        summary: 'Список полей',
        description: 'Все поля конструктора (`fields`).',
    })
    @ApiOkResponse({ type: [FieldResponseDto] })
    @Get()
    async list(): Promise<FieldResponseDto[]> {
        const fields = await this.useCase.list();
        return fields.map(f => new FieldResponseDto(f));
    }

    @ApiOperation({
        summary: 'Поле по id',
        description: 'Одно поле конструктора (`fields`) по id.',
    })
    @ApiParam({ name: 'id', description: 'ID поля', type: Number })
    @ApiOkResponse({ type: FieldResponseDto })
    @Get(':id')
    async getById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<FieldResponseDto> {
        const field = await this.useCase.getById(id);
        return new FieldResponseDto(field);
    }

    @ApiOperation({
        summary: 'Создать поле',
        description: 'Создаёт новое поле конструктора (`fields`).',
    })
    @ApiBody({ type: CreateFieldDto })
    @ApiOkResponse({ type: FieldResponseDto })
    @Post()
    async create(@Body() dto: CreateFieldDto): Promise<FieldResponseDto> {
        const field = await this.useCase.create(dto);
        return new FieldResponseDto(field);
    }

    @ApiOperation({
        summary: 'Обновить поле',
        description: 'Частично обновляет поле конструктора по id.',
    })
    @ApiParam({ name: 'id', description: 'ID поля', type: Number })
    @ApiBody({ type: UpdateFieldDto })
    @ApiOkResponse({ type: FieldResponseDto })
    @Patch(':id')
    async update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateFieldDto,
    ): Promise<FieldResponseDto> {
        const field = await this.useCase.update(id, dto);
        return new FieldResponseDto(field);
    }

    @ApiOperation({
        summary: 'Удалить поле',
        description: 'Удаляет поле конструктора по id (каскадно — связи).',
    })
    @ApiParam({ name: 'id', description: 'ID поля', type: Number })
    @ApiNoContentResponse({ description: 'Поле удалено' })
    @HttpCode(204)
    @Delete(':id')
    async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
        await this.useCase.remove(id);
    }
}
