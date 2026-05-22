import {
    CreateComplectDto,
    ComplectEntity,
    ComplectService,
} from '@/modules/garant/complect';
import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Put,
    Delete,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GetComplectResponseDto } from '../dto/get-complect-response.dto';
import {
    AddInfoblocksDto,
    RemoveInfoblocksDto,
    SetInfoblocksDto,
} from '../dto/manage-infoblocks.dto';

@ApiTags('Admin Garant Complect')
@Controller('admin/garant/complects')
export class AdminGarantComplectController {
    constructor(private readonly complectService: ComplectService) {}

    @Post()
    @ApiOperation({ summary: 'Создать новый комплект' })
    @ApiResponse({
        status: 201,
        description: 'Комплект успешно создан',
        type: GetComplectResponseDto,
    })
    async create(
        @Body() createComplectDto: CreateComplectDto,
    ): Promise<GetComplectResponseDto | null> {
        const complect = await this.complectService.create(createComplectDto);
        if (!complect) {
            throw new BadRequestException('Complect not created');
        }
        return new GetComplectResponseDto(complect);
    }

    @Get()
    @ApiOperation({ summary: 'Получить все комплекты' })
    @ApiResponse({
        status: 200,
        description: 'Список всех комплектов',
        type: [GetComplectResponseDto],
    })
    async findAll(): Promise<GetComplectResponseDto[] | null> {
        const complects = await this.complectService.findAll();
        if (!complects) {
            throw new NotFoundException('Complects not found');
        }
        return complects.map(complect => new GetComplectResponseDto(complect));
    }

    // Эндпоинты для управления связями с инфоблоками (должны быть перед динамическими маршрутами :id)

    @Post(':id/infoblocks')
    @ApiOperation({ summary: 'Добавить инфоблоки в комплект' })
    @ApiResponse({
        status: 200,
        description: 'Инфоблоки успешно добавлены',
        type: GetComplectResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Комплект не найден',
    })
    async addInfoblocks(
        @Param('id') id: string,
        @Body() addInfoblocksDto: AddInfoblocksDto,
    ): Promise<GetComplectResponseDto | null> {
        const complect = await this.complectService.addInfoblocks(
            id,
            addInfoblocksDto.infoblockIds,
        );
        if (!complect) {
            throw new NotFoundException(
                'Complect not found or infoblocks not added',
            );
        }
        return new GetComplectResponseDto(complect);
    }

    @Delete(':id/infoblocks')
    @ApiOperation({ summary: 'Удалить инфоблоки из комплекта (массив)' })
    @ApiResponse({
        status: 200,
        description: 'Инфоблоки успешно удалены',
        type: GetComplectResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Комплект не найден',
    })
    async removeInfoblocks(
        @Param('id') id: string,
        @Body() removeInfoblocksDto: RemoveInfoblocksDto,
    ): Promise<GetComplectResponseDto | null> {
        const complect = await this.complectService.removeInfoblocks(
            id,
            removeInfoblocksDto.infoblockIds,
        );
        if (!complect) {
            throw new NotFoundException(
                'Complect not found or infoblocks not removed',
            );
        }
        return new GetComplectResponseDto(complect);
    }

    @Delete(':id/infoblocks/:infoblockId')
    @ApiOperation({ summary: 'Удалить один инфоблок из комплекта' })
    @ApiResponse({
        status: 200,
        description: 'Инфоблок успешно удален',
        type: GetComplectResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Комплект или инфоблок не найден',
    })
    async removeInfoblock(
        @Param('id') id: string,
        @Param('infoblockId') infoblockId: string,
    ): Promise<GetComplectResponseDto | null> {
        const complect = await this.complectService.removeInfoblock(
            id,
            infoblockId,
        );
        if (!complect) {
            throw new NotFoundException(
                'Complect not found or infoblock not removed',
            );
        }
        return new GetComplectResponseDto(complect);
    }

    @Put(':id/infoblocks')
    @ApiOperation({
        summary: 'Заменить все инфоблоки в комплекте (установить новый список)',
    })
    @ApiResponse({
        status: 200,
        description: 'Инфоблоки успешно заменены',
        type: GetComplectResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Комплект не найден',
    })
    async setInfoblocks(
        @Param('id') id: string,
        @Body() setInfoblocksDto: SetInfoblocksDto,
    ): Promise<GetComplectResponseDto | null> {
        const complect = await this.complectService.setInfoblocks(
            id,
            setInfoblocksDto.infoblockIds,
        );
        if (!complect) {
            throw new NotFoundException(
                'Complect not found or infoblocks not set',
            );
        }
        return new GetComplectResponseDto(complect);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Получить комплект по ID' })
    @ApiResponse({
        status: 200,
        description: 'Комплект найден',
        type: GetComplectResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Комплект не найден',
    })
    async findOne(
        @Param('id') id: string,
    ): Promise<GetComplectResponseDto | null> {
        const complect = await this.complectService.findById(id);
        if (!complect) {
            throw new NotFoundException('Complect not found');
        }
        return new GetComplectResponseDto(complect);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Обновить комплект' })
    @ApiResponse({
        status: 200,
        description: 'Комплект успешно обновлен',
        type: GetComplectResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Комплект не найден',
    })
    async update(
        @Param('id') id: string,
        @Body() updateComplectDto: CreateComplectDto,
    ): Promise<GetComplectResponseDto | null> {
        const complect = await this.complectService.update(
            id,
            updateComplectDto,
        );
        if (!complect) {
            throw new NotFoundException('Complect not updated');
        }
        return new GetComplectResponseDto(complect);
    }
}
