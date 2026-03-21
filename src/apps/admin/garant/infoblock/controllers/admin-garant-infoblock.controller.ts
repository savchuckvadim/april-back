import {
    InfoblockEntityDto,
    InfoblockService,
} from '@/modules/garant/infoblock';
import {
    Controller,
    Get,
    Post,
    Put,
    Body,
    Param,
    Delete,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { InfoblockResponseDto } from '../dto/infoblock-response.dto';
import { GetInfoblockLightResponseDto } from '../dto/get-infoblock-light-response.dto';
import { CreateInfoblockDto } from '../dto/create-infoblock.dto';
import {
    SetInfoblockGroupDto,
    SetInfoblockExcludedDto,
} from '../dto/manage-infoblock-relations.dto';

@ApiTags('Admin Garant Infoblock')
@Controller('admin/garant/infoblocks')
export class AdminGarantInfoblockController {
    constructor(private readonly infoblockService: InfoblockService) {}

    @Get()
    @ApiOperation({
        summary: 'Получить все инфоблоки (light версия без связей)',
    })
    @ApiResponse({
        status: 200,
        description: 'Список всех инфоблоков',
        type: () => InfoblockEntityDto,
        isArray: true,
    })
    async findAll(): Promise<InfoblockEntityDto[] | null> {
        const infoblocks = await this.infoblockService.getInfoblocks();
        if (!infoblocks) {
            throw new NotFoundException('Infoblocks not found');
        }
        return infoblocks.map(infoblock => new InfoblockEntityDto(infoblock));
    }

    @Get('code/:code')
    @ApiOperation({ summary: 'Получить инфоблок по коду' })
    @ApiResponse({
        status: 200,
        description: 'Инфоблок найден',
        type: InfoblockResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Инфоблок не найден',
    })
    async findByCode(
        @Param('code') code: string,
    ): Promise<InfoblockResponseDto | null> {
        const infoblock = await this.infoblockService.getInfoblockByCode(code);
        if (!infoblock) {
            throw new NotFoundException('Infoblock not found');
        }
        return new InfoblockResponseDto(infoblock);
    }

    @Post()
    @ApiOperation({ summary: 'Создать новый инфоблок' })
    @ApiResponse({
        status: 201,
        description: 'Инфоблок успешно создан',
        type: InfoblockEntityDto,
    })
    async create(
        @Body() createInfoblockDto: CreateInfoblockDto,
    ): Promise<InfoblockEntityDto> {
        const infoblock =
            await this.infoblockService.create(createInfoblockDto);

        return infoblock;
    }

    @Get(':id')
    @ApiOperation({
        summary: 'Получить инфоблок по ID (полная версия со всеми связями)',
    })
    @ApiResponse({
        status: 200,
        description: 'Инфоблок найден',
        type: InfoblockResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Инфоблок не найден',
    })
    async findOne(
        @Param('id') id: string,
    ): Promise<InfoblockResponseDto | null> {
        const infoblock = await this.infoblockService.getInfoblockById(
            Number(id),
        );
        if (!infoblock) {
            throw new NotFoundException('Infoblock not found');
        }
        return new InfoblockResponseDto(infoblock);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Обновить инфоблок' })
    @ApiResponse({
        status: 200,
        description: 'Инфоблок успешно обновлен',
        type: InfoblockResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Инфоблок не найден',
    })
    async update(
        @Param('id') id: string,
        @Body() updateInfoblockDto: CreateInfoblockDto,
    ): Promise<InfoblockResponseDto | null> {
        const infoblock = await this.infoblockService.update(
            id,
            updateInfoblockDto,
        );
        if (!infoblock) {
            throw new NotFoundException('Infoblock not updated');
        }
        return new InfoblockResponseDto(infoblock);
    }

    // Эндпоинты для управления связями

    @Put(':id/group')
    @ApiOperation({ summary: 'Установить группу инфоблока' })
    @ApiResponse({
        status: 200,
        description: 'Группа успешно установлена',
        type: InfoblockResponseDto,
    })
    async setGroup(
        @Param('id') id: string,
        @Body() setGroupDto: SetInfoblockGroupDto,
    ): Promise<InfoblockResponseDto | null> {
        const infoblock = await this.infoblockService.setGroup(
            id,
            setGroupDto.group_id ?? null,
        );
        if (!infoblock) {
            throw new NotFoundException('Infoblock not found or group not set');
        }
        return new InfoblockResponseDto(infoblock);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Удалить инфоблок по ID' })
    @ApiResponse({
        status: 200,
        description: 'Инфоблок успешно удален',
        type: Boolean,
    })
    @ApiResponse({
        status: 404,
        description: 'Инфоблок не найден',
    })
    async delete(@Param('id') id: string): Promise<boolean> {
        return await this.infoblockService.delete(Number(id));
    }
    // @Put(':id/parent')
    // @ApiOperation({ summary: 'Установить родительский инфоблок' })
    // @ApiResponse({
    //     status: 200,
    //     description: 'Родительский инфоблок успешно установлен',
    //     type: InfoblockResponseDto,
    // })
    // async setParent(
    //     @Param('id') id: string,
    //     @Body() setParentDto: SetInfoblockParentDto,
    // ): Promise<InfoblockResponseDto | null> {
    //     const infoblock = await this.infoblockService.setParent(id, setParentDto.parent_id ?? null);
    //     if (!infoblock) {
    //         throw new NotFoundException('Infoblock not found or parent not set');
    //     }
    //     return new InfoblockResponseDto(infoblock);
    // }

    // @Put(':id/relation')
    // @ApiOperation({ summary: 'Установить связанный инфоблок' })
    // @ApiResponse({
    //     status: 200,
    //     description: 'Связанный инфоблок успешно установлен',
    //     type: InfoblockResponseDto,
    // })
    // async setRelation(
    //     @Param('id') id: string,
    //     @Body() setRelationDto: SetInfoblockRelationDto,
    // ): Promise<InfoblockResponseDto | null> {
    //     const infoblock = await this.infoblockService.setRelation(id, setRelationDto.relation_id ?? null);
    //     if (!infoblock) {
    //         throw new NotFoundException('Infoblock not found or relation not set');
    //     }
    //     return new InfoblockResponseDto(infoblock);
    // }

    // @Put(':id/related')
    // @ApiOperation({ summary: 'Установить связанный инфоблок (related)' })
    // @ApiResponse({
    //     status: 200,
    //     description: 'Связанный инфоблок успешно установлен',
    //     type: InfoblockResponseDto,
    // })
    // async setRelated(
    //     @Param('id') id: string,
    //     @Body() setRelatedDto: SetInfoblockRelatedDto,
    // ): Promise<InfoblockResponseDto | null> {
    //     const infoblock = await this.infoblockService.setRelated(id, setRelatedDto.related_id ?? null);
    //     if (!infoblock) {
    //         throw new NotFoundException('Infoblock not found or related not set');
    //     }
    //     return new InfoblockResponseDto(infoblock);
    // }

    @Put(':id/excluded')
    @ApiOperation({ summary: 'Установить исключенный инфоблок' })
    @ApiResponse({
        status: 200,
        description: 'Исключенный инфоблок успешно установлен',
        type: InfoblockResponseDto,
    })
    async setExcluded(
        @Param('id') id: string,
        @Body() setExcludedDto: SetInfoblockExcludedDto,
    ): Promise<InfoblockResponseDto | null> {
        const infoblock = await this.infoblockService.setExcluded(
            id,
            setExcludedDto.excluded_id ?? null,
        );
        if (!infoblock) {
            throw new NotFoundException(
                'Infoblock not found or excluded not set',
            );
        }
        return new InfoblockResponseDto(infoblock);
    }
}
