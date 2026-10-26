import { CreatePriceDto } from '../dtos/create-price.dto';
import { PriceService } from '@lib/garant/price';
import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Put,
    BadRequestException,
    NotFoundException,
    Delete,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PriceEntityDto } from '../dtos/price-entity.dto';

/**
 * Точечный CRUD цен. Массовое обновление — эталонной таблицей
 * (admin/garant/tables/prices/export → правка → .../import).
 */
@ApiTags('Admin Garant Prof Price')
@Controller('admin/garant/prof-prices')
export class AdminGarantProfPriceController {
    constructor(private readonly priceService: PriceService) {}

    @Post()
    @ApiOperation({ summary: 'Создать новую цену' })
    @ApiResponse({
        status: 201,
        description: 'Цена успешно создана',
        type: PriceEntityDto,
    })
    async create(
        @Body() createPriceDto: CreatePriceDto,
    ): Promise<PriceEntityDto | null> {
        const price = await this.priceService.create(createPriceDto);
        if (!price) {
            throw new BadRequestException('Price not created');
        }
        return new PriceEntityDto(price);
    }

    @Get()
    @ApiOperation({ summary: 'Получить все цены' })
    @ApiResponse({
        status: 200,
        description: 'Список всех цен',
        type: [PriceEntityDto],
    })
    async findAll(): Promise<PriceEntityDto[] | null> {
        const prices = await this.priceService.findAll();
        if (!prices) {
            throw new NotFoundException('Prices not found');
        }
        return prices.map(price => new PriceEntityDto(price));
    }

    @Get(':id')
    @ApiOperation({ summary: 'Получить цену по ID' })
    @ApiResponse({
        status: 200,
        description: 'Цена найдена',
        type: PriceEntityDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Цена не найдена',
    })
    async findOne(@Param('id') id: string): Promise<PriceEntityDto | null> {
        const price = await this.priceService.findById(id);
        if (!price) {
            throw new NotFoundException('Price not found');
        }
        return new PriceEntityDto(price);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Обновить цену' })
    @ApiResponse({
        status: 200,
        description: 'Цена успешно обновлена',
        type: PriceEntityDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Цена не найдена',
    })
    async update(
        @Param('id') id: string,
        @Body() updatePriceDto: CreatePriceDto,
    ): Promise<PriceEntityDto | null> {
        const price = await this.priceService.update(
            BigInt(id),
            updatePriceDto,
        );
        if (!price) {
            throw new NotFoundException('Price not updated');
        }
        return new PriceEntityDto(price);
    }

    // Статические DELETE-роуты обязаны идти до ':id', иначе Nest матчит
    // 'many'/'all' как id и BigInt('many') падает.
    @Delete('all')
    @ApiOperation({ summary: 'Удалить все цены' })
    @ApiResponse({
        status: 200,
        description: 'Цены успешно удалены',
    })
    async deleteAll(): Promise<boolean> {
        return await this.priceService.deleteAll();
    }

    @Delete('many')
    @ApiOperation({ summary: 'Удалить несколько цен' })
    @ApiResponse({
        status: 200,
        description: 'Цены успешно удалены',
    })
    async deleteMany(@Body() ids: number[]): Promise<boolean> {
        return await this.priceService.deleteMany(ids);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Удалить цену по ID' })
    @ApiResponse({
        status: 200,
        description: 'Цена успешно удалена',
    })
    async delete(@Param('id') id: number): Promise<boolean> {
        return await this.priceService.delete(id);
    }
}
