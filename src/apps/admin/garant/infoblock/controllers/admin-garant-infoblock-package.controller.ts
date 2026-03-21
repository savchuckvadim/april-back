import { InfoblockService } from '@/modules/garant/infoblock';
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

import {
    AddInfoblockPackagesDto,
    RemoveInfoblockPackagesDto,
    AddInfoblockToPackagesDto,
    RemoveInfoblockFromPackagesDto,
    SetInfoblockInPackagesDto,
} from '../dto/add-infoblock-to-package-request.dto';

@ApiTags('Admin Garant Infoblock Package')
@Controller('admin/garant/infoblock-packages')
export class AdminGarantInfoblockPackageController {
    constructor(private readonly infoblockService: InfoblockService) {}

    //  эндпоинты для управления пакетами, в которые входит инфоблок
    @Post(':id/packages')
    @ApiOperation({ summary: 'Добавить инфоблоки в пакет' })
    @ApiResponse({
        status: 200,
        description: 'Инфоблоки успешно добавлены в пакет',
        type: InfoblockResponseDto,
    })
    async addPackages(
        @Param('id') id: string,
        @Body() addPackagesDto: AddInfoblockPackagesDto,
    ): Promise<InfoblockResponseDto | null> {
        const infoblock = await this.infoblockService.addPackages(
            id,
            addPackagesDto.packageIds,
        );
        if (!infoblock) {
            throw new NotFoundException(
                'Infoblock not found or packages not added',
            );
        }
        return new InfoblockResponseDto(infoblock);
    }

    @Delete(':id/packages')
    @ApiOperation({ summary: 'Удалить инфоблоки из пакета' })
    @ApiResponse({
        status: 200,
        description: 'Инфоблоки успешно удалены из пакета',
        type: InfoblockResponseDto,
    })
    async removePackages(
        @Param('id') id: string,
        @Body() removePackagesDto: RemoveInfoblockPackagesDto,
    ): Promise<InfoblockResponseDto | null> {
        const infoblock = await this.infoblockService.removePackages(
            id,
            removePackagesDto.packageIds,
        );
        if (!infoblock) {
            throw new NotFoundException(
                'Infoblock not found or packages not removed',
            );
        }
        return new InfoblockResponseDto(infoblock);
    }

    // Эндпоинты для управления инфоблоками, в которые входит пакет (packages)

    @Post(':id/in-packages')
    @ApiOperation({ summary: 'Добавить инфоблок в пакеты' })
    @ApiResponse({
        status: 200,
        description: 'Инфоблок успешно добавлен в пакеты',
        type: InfoblockResponseDto,
    })
    async addToPackages(
        @Param('id') id: string,
        @Body() addToPackagesDto: AddInfoblockToPackagesDto,
    ): Promise<InfoblockResponseDto | null> {
        const infoblock = await this.infoblockService.addInfoblocksToPackage(
            addToPackagesDto.infoblockIds,
            id,
        );
        if (!infoblock) {
            throw new NotFoundException(
                'Infoblock not found or packages not added',
            );
        }
        return new InfoblockResponseDto(infoblock);
    }

    @Delete(':id/in-packages')
    @ApiOperation({ summary: 'Удалить инфоблок из пакетов' })
    @ApiResponse({
        status: 200,
        description: 'Инфоблок успешно удален из пакетов',
        type: InfoblockResponseDto,
    })
    async removeFromPackages(
        @Param('id') id: string,
        @Body() removeFromPackagesDto: RemoveInfoblockFromPackagesDto,
    ): Promise<InfoblockResponseDto | null> {
        const infoblock = await this.infoblockService.removeFromPackages(
            removeFromPackagesDto.infoblockIds,
            id,
        );
        if (!infoblock) {
            throw new NotFoundException(
                'Infoblock not found or packages not removed',
            );
        }
        return new InfoblockResponseDto(infoblock);
    }

    @Put(':id/in-packages')
    @ApiOperation({
        summary:
            'засетать несколько инфоблоков в один пакет а все остальное из пакета удалить',
    })
    @ApiResponse({
        status: 200,
        description: 'Пакеты успешно заменены',
        type: InfoblockResponseDto,
    })
    async setInPackages(
        @Param('id') id: string,
        @Body() setInPackagesDto: SetInfoblockInPackagesDto,
    ): Promise<InfoblockResponseDto | null> {
        const infoblock = await this.infoblockService.setInPackages(
            setInPackagesDto.infoblockIds,
            id,
        );
        if (!infoblock) {
            throw new NotFoundException(
                'Infoblock not found or packages not set',
            );
        }
        return new InfoblockResponseDto(infoblock);
    }
}
