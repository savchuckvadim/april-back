import { CreateSupplyDto } from '../dtos/create-supply.dto';
import { SupplyService } from '@lib/garant/supply';
import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Put,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GetSupplyResponseDto } from '../dtos/get-supply-response.dto';

@ApiTags('Admin Garant Supply')
@Controller('admin/garant/supplies')
export class AdminGarantSupplyController {
    constructor(private readonly supplyService: SupplyService) {}

    @Post()
    @ApiOperation({ summary: 'Создать новую поставку' })
    @ApiResponse({
        status: 201,
        description: 'Поставка успешно создана',
        type: GetSupplyResponseDto,
    })
    async create(
        @Body() createSupplyDto: CreateSupplyDto,
    ): Promise<GetSupplyResponseDto | null> {
        const supply = await this.supplyService.create(createSupplyDto);
        if (!supply) {
            throw new BadRequestException('Supply not created');
        }
        return new GetSupplyResponseDto(supply);
    }

    @Get()
    @ApiOperation({ summary: 'Получить все поставки' })
    @ApiResponse({
        status: 200,
        description: 'Список всех поставок',
        type: [GetSupplyResponseDto],
    })
    async findAll(): Promise<GetSupplyResponseDto[] | null> {
        const supplies = await this.supplyService.findAll();
        if (!supplies) {
            throw new NotFoundException('Supplies not found');
        }
        return supplies.map(supply => new GetSupplyResponseDto(supply));
    }

    @Get(':id')
    @ApiOperation({ summary: 'Получить поставку по ID' })
    @ApiResponse({
        status: 200,
        description: 'Поставка найдена',
        type: GetSupplyResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Поставка не найдена',
    })
    async findOne(
        @Param('id') id: string,
    ): Promise<GetSupplyResponseDto | null> {
        const supply = await this.supplyService.findById(id);
        if (!supply) {
            throw new NotFoundException('Supply not found');
        }
        return new GetSupplyResponseDto(supply);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Обновить поставку' })
    @ApiResponse({
        status: 200,
        description: 'Поставка успешно обновлена',
        type: GetSupplyResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Поставка не найдена',
    })
    async update(
        @Param('id') id: string,
        @Body() updateSupplyDto: CreateSupplyDto,
    ): Promise<GetSupplyResponseDto | null> {
        const supply = await this.supplyService.update({
            id: BigInt(id),
            ...updateSupplyDto,
        });
        if (!supply) {
            throw new NotFoundException('Supply not updated');
        }
        return new GetSupplyResponseDto(supply);
    }
}
