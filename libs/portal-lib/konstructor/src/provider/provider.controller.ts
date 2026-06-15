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
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProviderService } from './provider.service';
import { ProviderEntityWithRq, RqEntity } from './provider.entity';
import {
    CreateProviderWithRqDto,
    ProviderWithRqResponseDto,
    RqResponseDto,
    UpdateRqDto,
} from './provider.dto';

@ApiTags('Portal Konstructor')
@Controller('provider')
export class ProviderController {
    constructor(private readonly service: ProviderService) {}

    @Get(':id')
    @ApiOperation({
        summary: 'Реквизиты поставщика по id',
        description:
            'Возвращает реквизиты (rqs) поставщика (agents) по его id. ' +
            'Если поставщик не найден — возвращает null.',
    })
    @ApiOkResponse({
        type: RqResponseDto,
        description: 'Реквизиты найденного поставщика либо null.',
    })
    async getProvider(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<RqEntity | null> {
        return await this.service.findById(id);
    }

    @Get('domain/:domain')
    @ApiOperation({
        summary: 'Поставщики портала по домену',
        description:
            'Возвращает всех поставщиков портала с их реквизитами по домену портала.',
    })
    @ApiOkResponse({
        type: [ProviderWithRqResponseDto],
        description: 'Список поставщиков портала с реквизитами либо null.',
    })
    async getProviderByDomain(
        @Param('domain') domain: string,
    ): Promise<ProviderEntityWithRq[] | null> {
        return await this.service.findByDomain(domain);
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
    async createProvider(
        @Body() dto: CreateProviderWithRqDto,
    ): Promise<ProviderEntityWithRq> {
        return await this.service.createWithRq(dto);
    }

    @Patch('rq/:id')
    @ApiOperation({
        summary: 'Обновить реквизиты',
        description:
            'Частично обновляет реквизиты (rqs) по id. ' +
            'Обновляются только переданные поля.',
    })
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
    @ApiOkResponse({ description: 'Поставщик удалён.' })
    async deleteProvider(@Param('id', ParseIntPipe) id: number): Promise<void> {
        await this.service.delete(id);
    }
}
