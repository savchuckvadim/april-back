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
import { PbxCounterUseCase } from '../use-cases/pbx-counter.use-case';
import { CreateCounterDto } from '../dto/create-counter.dto';
import { UpdateCounterDto } from '../dto/update-counter.dto';
import { CounterResponseDto } from '../dto/counter-response.dto';

/**
 * CRUD-управление счётчиками конструктора (`counters`) из pbx-install.
 */
@ApiTags('PBX Counter')
@Controller('pbx-counter')
export class PbxCounterController {
    constructor(private readonly useCase: PbxCounterUseCase) {}

    @ApiOperation({
        summary: 'Список счётчиков',
        description: 'Все счётчики конструктора (`counters`).',
    })
    @ApiOkResponse({ type: [CounterResponseDto] })
    @Get()
    async list(): Promise<CounterResponseDto[]> {
        const counters = await this.useCase.list();
        return counters.map(c => new CounterResponseDto(c));
    }

    @ApiOperation({
        summary: 'Счётчик по id',
        description: 'Один счётчик конструктора (`counters`) по id.',
    })
    @ApiParam({ name: 'id', description: 'ID счётчика', type: Number })
    @ApiOkResponse({ type: CounterResponseDto })
    @Get(':id')
    async getById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<CounterResponseDto> {
        const counter = await this.useCase.getById(id);
        return new CounterResponseDto(counter);
    }

    @ApiOperation({
        summary: 'Создать счётчик',
        description: 'Создаёт новый счётчик конструктора (`counters`).',
    })
    @ApiBody({ type: CreateCounterDto })
    @ApiOkResponse({ type: CounterResponseDto })
    @Post()
    async create(@Body() dto: CreateCounterDto): Promise<CounterResponseDto> {
        const counter = await this.useCase.create(dto);
        return new CounterResponseDto(counter);
    }

    @ApiOperation({
        summary: 'Обновить счётчик',
        description: 'Частично обновляет счётчик конструктора по id.',
    })
    @ApiParam({ name: 'id', description: 'ID счётчика', type: Number })
    @ApiBody({ type: UpdateCounterDto })
    @ApiOkResponse({ type: CounterResponseDto })
    @Patch(':id')
    async update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateCounterDto,
    ): Promise<CounterResponseDto> {
        const counter = await this.useCase.update(id, dto);
        return new CounterResponseDto(counter);
    }

    @ApiOperation({
        summary: 'Удалить счётчик',
        description: 'Удаляет счётчик конструктора по id (каскадно — связи).',
    })
    @ApiParam({ name: 'id', description: 'ID счётчика', type: Number })
    @ApiNoContentResponse({ description: 'Счётчик удалён' })
    @HttpCode(204)
    @Delete(':id')
    async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
        await this.useCase.remove(id);
    }
}
