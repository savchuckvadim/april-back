import { CreatePriceDto } from '../dtos/create-price.dto';
import { PriceService } from '@/modules/garant/price';
import { PriceExcelService } from '@/modules/garant/price/services/excel/price-excel.service';
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
    Delete,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiConsumes,
    ApiBody,
} from '@nestjs/swagger';
import { Response } from 'express';
import { PriceEntityDto } from '../dtos/price-entity.dto';

@ApiTags('Admin Garant Prof Price')
@Controller('admin/garant/prof-prices')
export class AdminGarantProfPriceController {
    constructor(
        private readonly priceService: PriceService,
        private readonly priceExcelService: PriceExcelService,
        private readonly storageService: StorageService,
    ) {}

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

    @Get('download-example')
    @ApiOperation({ summary: 'Скачать пример таблицы цен' })
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
        const filePath = await this.priceExcelService.getExampleFilePath();
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
            'attachment; filename="prices-example.xlsx"',
        );
        res.send(fileBuffer);
    }

    @Post('update-from-excel')
    @ApiOperation({ summary: 'Обновить цены из Excel файла' })
    @ApiResponse({
        status: 200,
        description: 'Цены успешно обновлены',
        type: [PriceEntityDto],
    })
    async updateFromExcel(): Promise<PriceEntityDto[] | null> {
        const prices = await this.priceService.updateFromExcel();
        if (!prices) {
            throw new NotFoundException('Prices not updated');
        }
        return prices.map(price => new PriceEntityDto(price));
    }

    @Post('upload-excel')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Загрузить таблицу цен и обновить существующие' })
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
        description: 'Цены успешно обновлены из загруженного файла',
        type: [PriceEntityDto],
    })
    async uploadExcel(
        @UploadedFile() file: Express.Multer.File,
    ): Promise<PriceEntityDto[] | null> {
        if (!file) {
            throw new BadRequestException('File is required');
        }

        try {
            // Сохраняем загруженный файл
            await this.priceExcelService.saveUploadedFile(file.buffer);

            // Обновляем цены из файла
            const prices = await this.priceService.updateFromExcel();
            if (!prices) {
                throw new NotFoundException('Prices not updated');
            }

            return prices.map(price => new PriceEntityDto(price));
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

    @Delete('all')
    @ApiOperation({ summary: 'Удалить все цены' })
    @ApiResponse({
        status: 200,
        description: 'Цены успешно удалены',
    })
    async deleteAll(): Promise<boolean> {
        return await this.priceService.deleteAll();
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

    @Delete('many')
    @ApiOperation({ summary: 'Удалить несколько цен' })
    @ApiResponse({
        status: 200,
        description: 'Цены успешно удалены',
    })
    async deleteMany(@Body() ids: number[]): Promise<boolean> {
        return await this.priceService.deleteMany(ids);
    }
}
