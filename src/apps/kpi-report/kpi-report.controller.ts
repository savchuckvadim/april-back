import { Controller, HttpCode, Post, Body, Res, UseInterceptors, HttpException, HttpStatus } from '@nestjs/common';
import { ExcelReportService } from './services/kpi-report/kpi-report.service';
import { KpiReportDto } from './dto/kpi.dto';
import { Response } from 'express';
import { ReportGetRequestDto } from './dto/kpi-report-request.dto';
import { ReportKpiUseCase } from './usecases/kpi-report.use-case';
import { GetCallingStatisticDto } from './dto/calling-statistic.dto';
import { CallingStatisticUseCase } from './usecases/kpi-calling-statistic.use-case';
@Controller('kpi-report')
export class KpiReportController {
  constructor(
    private readonly excelService: ExcelReportService,
    private readonly reportKpiUseCase: ReportKpiUseCase,
    private readonly callingStatisticUseCase: CallingStatisticUseCase
  ) { }

  @Post('download')
  @HttpCode(200)
  @UseInterceptors()
  async excel(@Body() dto: KpiReportDto, @Res() res: Response) {
 
    const buffer = await this.excelService.generateExcel(dto);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=kpi-report.xlsx');

    return res.send(buffer); // res - в обход глобально настроенного респонса
 
  }


  @Post('get')
  @HttpCode(200)
  @UseInterceptors()
  async getReport(@Body() dto: ReportGetRequestDto) {

    const domain = dto.domain;
    const filters = dto.filters;
    await this.reportKpiUseCase.init(domain);
    const result = await this.reportKpiUseCase.generateKpiReport(filters);
    return result;

  }

  @Post('calling-statistic')
  @HttpCode(200)
  @UseInterceptors()
  async getCallingStatistic(@Body() dto: GetCallingStatisticDto) {

    const domain = dto.domain;
    const filters = dto.filters;
    await this.callingStatisticUseCase.init(domain);
    const result = await this.callingStatisticUseCase.get(filters);
    return result;

  }
}
