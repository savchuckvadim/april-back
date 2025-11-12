import {
    Controller,
    HttpCode,
    Post,
    Body,
    Res,
    UseInterceptors,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { ExcelReportService } from './services/kpi-report/kpi-report.service';
import { Response } from 'express';
import { DownLoadKpiReportDto } from './dto/get-excel-report.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
// import { TelegramService } from '@/modules/telegram/telegram.service';

@ApiTags('KPI Sales Report Download')
@Controller('kpi-report')
export class KpiReportDownloadController {
    constructor(
        private readonly excelService: ExcelReportService,
        // private readonly telegram: TelegramService
    ) {}

    @ApiOperation({ summary: 'Download KPI Sales Report' })

    @Post('download')
    @HttpCode(200)
    @UseInterceptors()
    async excel(@Body() dto: DownLoadKpiReportDto, @Res() res: Response) {
        const buffer = await this.excelService.generateExcel(dto);

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename=kpi-report.xlsx',
        );

        return res.send(buffer); // res - в обход глобально настроенного респонса
    }
}
