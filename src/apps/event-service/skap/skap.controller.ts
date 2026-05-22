import {
    BadRequestException,
    Controller,
    Get,
    Post,
    Query,
    StreamableFile,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiBody,
    ApiConsumes,
    ApiOperation,
    ApiProduces,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { SkapExcelParseService } from './services/skap-excel-parse.service';
import { SkapExampleTemplateService } from './services/skap-example-template.service';
import { SkapZipExtractService } from './services/skap-zip-extract.service';
import { SkapParseZipResponseDto } from './types/skap-report.types';

@ApiTags('Event Service SKAP')
@Controller('event-service/skap')
export class SkapController {
    constructor(
        private readonly zipExtract: SkapZipExtractService,
        private readonly excelParse: SkapExcelParseService,
        private readonly exampleTemplate: SkapExampleTemplateService,
    ) {}

    @Get('example-template')
    @ApiOperation({
        summary:
            'Скачать пустой пример Excel (.xlsx) с заголовками всех 14 столбцов формата Online',
    })
    @ApiProduces(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    @ApiResponse({ status: 200, description: 'Файл .xlsx' })
    async downloadExampleTemplate(): Promise<StreamableFile> {
        const buf: Buffer =
            await this.exampleTemplate.buildExampleTemplateXlsx();
        return new StreamableFile(buf, {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            disposition: 'attachment; filename="skap-online-example.xlsx"',
        });
    }

    @Post('parse')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
        summary: 'Загрузить ZIP, распарсить Online.csv и вернуть JSON',
    })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
                date: { type: 'string', example: '21.03.2024' },
            },
            required: ['file'],
        },
    })
    @ApiResponse({ status: 200, type: Object })
    async parseFromUpload(
        @UploadedFile() file: Express.Multer.File,
        @Query('date') date: string,
    ): Promise<SkapParseZipResponseDto> {
        if (!date?.trim()) {
            throw new BadRequestException(
                'Query-параметр date обязателен (DD.MM.YYYY)',
            );
        }
        if (!file?.buffer?.length) {
            throw new BadRequestException('Файл ZIP обязателен (поле file)');
        }
        return this.zipExtract.parseZipBuffer(file.buffer, date.trim());
    }

    @Post('parse-file')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
        summary:
            'Загрузить один распакованный файл (.csv / .txt / .xlsx) и вернуть JSON того же вида, что и после ZIP',
    })
    @ApiQuery({
        name: 'date',
        required: false,
        example: '21.03.2024',
        description:
            'Необязательно: если указать DD.MM.YYYY, попадёт в ответ (date / dateFragment)',
    })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
            },
            required: ['file'],
        },
    })
    @ApiResponse({ status: 200, type: Object })
    async parsePlainFile(
        @UploadedFile() file: Express.Multer.File,
        @Query('date') date?: string,
    ): Promise<SkapParseZipResponseDto> {
        if (!file?.buffer?.length) {
            throw new BadRequestException('Файл обязателен (поле file)');
        }
        try {
            return await this.excelParse.parsePlainUpload(
                file.buffer,
                file.originalname || 'upload',
                date?.trim(),
            );
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            throw new BadRequestException(msg);
        }
    }
}
