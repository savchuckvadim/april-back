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
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { ProviderService } from './provider.service';
import { ProviderEntityWithRq, RqEntity } from './provider.entity';
import {
    CreateProviderWithRqDto,
    ProviderEnumsResponseDto,
    ProviderWithRqResponseDto,
    RqResponseDto,
    UpdateRqDto,
} from './provider.dto';
import { PROVIDER_TYPE_OPTIONS } from './provider.const';

/**
 * Админ-CRUD поставщиков (`agents`) и их реквизитов (`rqs`).
 * Полный набор операций для управления реквизитами из админки, плюс
 * справочник перечислимых значений (`/enums`) для наполнения select'ов.
 */
@ApiTags('Admin Portal Provider')
@Controller('admin/portal/provider')
export class ProviderAdminController {
    constructor(private readonly service: ProviderService) {}

    @Get('enums')
    @ApiOperation({
        summary: 'Справочники select`ов поставщика',
        description:
            'Возвращает перечислимые (enum) значения поставщика/реквизитов ' +
            'для наполнения выпадающих списков в форме админки.',
    })
    @ApiOkResponse({
        type: ProviderEnumsResponseDto,
        description: 'Наборы опций для select`ов (типы поставщика).',
    })
    getEnums(): ProviderEnumsResponseDto {
        return new ProviderEnumsResponseDto(PROVIDER_TYPE_OPTIONS);
    }

    @Get()
    @ApiOperation({
        summary: 'Список всех поставщиков',
        description:
            'Возвращает реквизиты (rqs) всех поставщиков (agents) в системе.',
    })
    @ApiOkResponse({
        type: [RqResponseDto],
        description: 'Список реквизитов всех поставщиков.',
    })
    async getAll(): Promise<RqEntity[]> {
        return await this.service.findMany();
    }

    @Get('domain/:domain')
    @ApiOperation({
        summary: 'Поставщики портала по домену',
        description:
            'Возвращает всех поставщиков портала с их реквизитами по домену ' +
            'портала. Если поставщиков нет — возвращает пустой список или null.',
    })
    @ApiParam({
        name: 'domain',
        type: String,
        example: 'company.bitrix24.ru',
    })
    @ApiOkResponse({
        type: [ProviderWithRqResponseDto],
        description: 'Список поставщиков портала с реквизитами либо null.',
    })
    async getByDomain(
        @Param('domain') domain: string,
    ): Promise<ProviderEntityWithRq[] | null> {
        return await this.service.findByDomain(domain);
    }

    @Get(':id')
    @ApiOperation({
        summary: 'Реквизиты поставщика по id',
        description:
            'Возвращает реквизиты (rqs) поставщика (agents) по его id. ' +
            'Если поставщик не найден — возвращает null.',
    })
    @ApiParam({ name: 'id', type: Number, example: 12 })
    @ApiOkResponse({
        type: RqResponseDto,
        description: 'Реквизиты найденного поставщика либо null.',
    })
    async getOne(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<RqEntity | null> {
        return await this.service.findById(id);
    }

    @Post()
    @ApiOperation({
        summary: 'Создать поставщика с реквизитами',
        description:
            'Создаёт поставщика (agents) вместе с его реквизитами (rqs) ' +
            'и связывает их между собой в одной транзакции.',
    })
    @ApiBody({
        type: CreateProviderWithRqDto,
        description: 'Данные поставщика и его реквизитов.',
    })
    @ApiOkResponse({
        type: ProviderWithRqResponseDto,
        description: 'Созданный поставщик с реквизитами.',
    })
    async create(
        @Body() dto: CreateProviderWithRqDto,
    ): Promise<ProviderEntityWithRq> {
        return await this.service.createWithRq(dto);
    }

    @Patch('rq/:id')
    @ApiOperation({
        summary: 'Обновить реквизиты',
        description:
            'Частично обновляет реквизиты (rqs) по id. ' +
            'Обновляются только переданные поля. Если запись не найдена — 404.',
    })
    @ApiParam({ name: 'id', type: Number, example: 12 })
    @ApiBody({
        type: UpdateRqDto,
        description: 'Поля реквизитов для обновления.',
    })
    @ApiOkResponse({
        type: RqResponseDto,
        description: 'Обновлённые реквизиты.',
    })
    async updateRq(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateRqDto,
    ): Promise<RqEntity> {
        return await this.service.updateRq(id, dto);
    }

    @Delete(':id')
    @HttpCode(204)
    @ApiOperation({
        summary: 'Удалить поставщика',
        description:
            'Удаляет поставщика (agents) вместе с его реквизитами (rqs). ' +
            'Если поставщик не найден — возвращает 404.',
    })
    @ApiParam({ name: 'id', type: Number, example: 12 })
    @ApiOkResponse({ description: 'Поставщик удалён.' })
    async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
        await this.service.delete(id);
    }
}
