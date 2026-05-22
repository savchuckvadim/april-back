import { CreateSupplyDto } from '../dtos/create-supply.dto';
import { SupplyEntity, SupplyService } from '@/modules/garant/supply';
import { SupplyExcelService } from '@/modules/garant/supply/services/supply-excel.service';
import { StorageService, StorageType } from '@/core/storage';
import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Put,
    BadRequestException,
    NotFoundException,
    UseInterceptors,
    UploadedFile,
    Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiConsumes,
    ApiBody,
} from '@nestjs/swagger';
import { GetSupplyResponseDto } from '../dtos/get-supply-response.dto';
import { Response } from 'express';

@ApiTags('Admin Garant Supply')
@Controller('admin/garant/supplies')
export class AdminGarantSupplyController {
    constructor(
        private readonly supplyService: SupplyService,
        private readonly supplyExcelService: SupplyExcelService,
        private readonly storageService: StorageService,
    ) {}

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

    @Get('download-example')
    @ApiOperation({ summary: 'Скачать пример таблицы поставок' })
    @ApiResponse({
        status: 200,
        description: 'Файл для скачивания',
        content: {
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                {
                    schema: {
                        type: 'string',
                        format: 'binary',
                    },
                },
        },
    })
    async downloadExample(@Res() res: Response): Promise<void> {
        const filePath = await this.supplyExcelService.getExampleFilePath();
        const fileExists = await this.storageService.fileExists(filePath);

        if (!fileExists) {
            throw new NotFoundException('Example file not found');
        }

        const fileBuffer = await this.storageService.readFile(filePath);

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="supply-example.xlsx"',
        );
        res.send(fileBuffer);
    }

    @Post('update-from-excel')
    @ApiOperation({ summary: 'Обновить поставки из Excel файла' })
    @ApiResponse({
        status: 200,
        description: 'Поставки успешно обновлены',
        type: [GetSupplyResponseDto],
    })
    async updateFromExcel(): Promise<GetSupplyResponseDto[] | null> {
        const supplies = await this.supplyService.updateFromExcel();
        if (!supplies) {
            throw new NotFoundException('Supplies not updated');
        }
        return supplies.map(supply => new GetSupplyResponseDto(supply));
    }

    @Post('upload-excel')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
        summary: 'Загрузить таблицу поставок и обновить существующие',
    })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    @ApiResponse({
        status: 200,
        description: 'Поставки успешно обновлены из загруженного файла',
        type: [GetSupplyResponseDto],
    })
    async uploadExcel(
        @UploadedFile() file: Express.Multer.File,
    ): Promise<GetSupplyResponseDto[] | null> {
        if (!file) {
            throw new BadRequestException('File is required');
        }

        try {
            // Сохраняем загруженный файл
            await this.supplyExcelService.saveUploadedFile(file.buffer);

            // Обновляем поставки из файла
            const supplies = await this.supplyService.updateFromExcel();
            if (!supplies) {
                throw new NotFoundException('Supplies not updated');
            }

            return supplies.map(supply => new GetSupplyResponseDto(supply));
        } catch (error) {
            console.error('Error uploading Excel file:', error);
            throw new BadRequestException(
                error instanceof Error
                    ? error.message
                    : 'Failed to upload and process Excel file',
            );
        }
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
