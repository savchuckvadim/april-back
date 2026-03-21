import { InfogroupService } from '@/modules/garant/infogroup';
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
import { InfogroupResponseDto } from '../dto/infogroup-response.dto';
import { CreateInfogroupDto } from '../dto/create-infogroup.dto';
import {
    AddInfogroupInfoblocksDto,
    RemoveInfogroupInfoblocksDto,
    SetInfogroupInfoblocksDto,
} from '../dto/manage-infogroup-infoblocks.dto';

@ApiTags('Admin Garant Info Group')
@Controller('admin/garant/info-groups')
export class AdminGarantInfogroupController {
    constructor(private readonly infogroupService: InfogroupService) {}

    @Post()
    @ApiOperation({ summary: 'Создать новую группу инфоблоков' })
    @ApiResponse({
        status: 201,
        description: 'Группа инфоблоков успешно создана',
        type: InfogroupResponseDto,
    })
    async create(
        @Body() createInfogroupDto: CreateInfogroupDto,
    ): Promise<InfogroupResponseDto | null> {
        const infogroup =
            await this.infogroupService.create(createInfogroupDto);
        if (!infogroup) {
            throw new BadRequestException('Infogroup not created');
        }
        return new InfogroupResponseDto(infogroup);
    }

    @Get()
    @ApiOperation({ summary: 'Получить все группы инфоблоков' })
    @ApiResponse({
        status: 200,
        description: 'Список всех групп инфоблоков',
        type: () => InfogroupResponseDto,
        isArray: true,
    })
    async findAll(): Promise<InfogroupResponseDto[] | null> {
        const infogroups = await this.infogroupService.findMany();
        if (!infogroups) {
            throw new NotFoundException('Infogroups not found');
        }
        return infogroups.map(infogroup => new InfogroupResponseDto(infogroup));
    }

    // Эндпоинты для управления связями с инфоблоками (должны быть перед динамическими маршрутами :id)

    @Post(':id/infoblocks')
    @ApiOperation({ summary: 'Добавить инфоблоки в группу' })
    @ApiResponse({
        status: 200,
        description: 'Инфоблоки успешно добавлены в группу',
        type: InfogroupResponseDto,
    })
    async addInfoblocks(
        @Param('id') id: string,
        @Body() addInfoblocksDto: AddInfogroupInfoblocksDto,
    ): Promise<InfogroupResponseDto | null> {
        const infogroup = await this.infogroupService.addInfoblocks(
            id,
            addInfoblocksDto.infoblockIds,
        );
        if (!infogroup) {
            throw new NotFoundException(
                'Infogroup not found or infoblocks not added',
            );
        }
        return new InfogroupResponseDto(infogroup);
    }

    @Delete(':id/infoblocks')
    @ApiOperation({ summary: 'Удалить инфоблоки из группы' })
    @ApiResponse({
        status: 200,
        description: 'Инфоблоки успешно удалены из группы',
        type: InfogroupResponseDto,
    })
    async removeInfoblocks(
        @Param('id') id: string,
        @Body() removeInfoblocksDto: RemoveInfogroupInfoblocksDto,
    ): Promise<InfogroupResponseDto | null> {
        const infogroup = await this.infogroupService.removeInfoblocks(
            id,
            removeInfoblocksDto.infoblockIds,
        );
        if (!infogroup) {
            throw new NotFoundException(
                'Infogroup not found or infoblocks not removed',
            );
        }
        return new InfogroupResponseDto(infogroup);
    }

    @Put(':id/infoblocks')
    @ApiOperation({ summary: 'Заменить все инфоблоки в группе' })
    @ApiResponse({
        status: 200,
        description: 'Инфоблоки в группе успешно заменены',
        type: InfogroupResponseDto,
    })
    async setInfoblocks(
        @Param('id') id: string,
        @Body() setInfoblocksDto: SetInfogroupInfoblocksDto,
    ): Promise<InfogroupResponseDto | null> {
        const infogroup = await this.infogroupService.setInfoblocks(
            id,
            setInfoblocksDto.infoblockIds,
        );
        if (!infogroup) {
            throw new NotFoundException(
                'Infogroup not found or infoblocks not set',
            );
        }
        return new InfogroupResponseDto(infogroup);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Получить группу инфоблоков по ID' })
    @ApiResponse({
        status: 200,
        description: 'Группа инфоблоков найдена',
        type: InfogroupResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Группа инфоблоков не найдена',
    })
    async findOne(
        @Param('id') id: string,
    ): Promise<InfogroupResponseDto | null> {
        const infogroup = await this.infogroupService.findById(Number(id));
        if (!infogroup) {
            throw new NotFoundException('Infogroup not found');
        }
        return new InfogroupResponseDto(infogroup);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Обновить группу инфоблоков' })
    @ApiResponse({
        status: 200,
        description: 'Группа инфоблоков успешно обновлена',
        type: InfogroupResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Группа инфоблоков не найдена',
    })
    async update(
        @Param('id') id: string,
        @Body() updateInfogroupDto: CreateInfogroupDto,
    ): Promise<InfogroupResponseDto | null> {
        const infogroup = await this.infogroupService.update({
            id: id,
            ...updateInfogroupDto,
        });
        if (!infogroup) {
            throw new NotFoundException('Infogroup not updated');
        }
        return new InfogroupResponseDto(infogroup);
    }
}
