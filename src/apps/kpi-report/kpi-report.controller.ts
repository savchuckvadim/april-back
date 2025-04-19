import { Controller, HttpCode, Post, Body, Res, UseInterceptors, HttpException, HttpStatus } from '@nestjs/common';
import { ExcelReportService } from './services/kpi-report.service';
import { KpiReportDto } from './dto/kpi.dto';
import { Response } from 'express';

@Controller('kpi-report')
export class KpiReportController {
  constructor(private readonly excelService: ExcelReportService) { }

  @Post('download')
  @HttpCode(200)
  @UseInterceptors()
  async excel(@Body() dto: KpiReportDto, @Res() res: Response) {
    try {


      const buffer = await this.excelService.generateExcel(dto);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=kpi-report.xlsx');

      return res.send(buffer);
    } catch (error) {
      console.log(error);
      throw new HttpException('Ошибка при генерации отчета ', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
