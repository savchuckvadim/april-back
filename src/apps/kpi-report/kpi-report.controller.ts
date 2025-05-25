import { Controller, HttpCode, Post, Body, Res, UseInterceptors, HttpException, HttpStatus } from '@nestjs/common';
import { ExcelReportService } from './services/kpi-report/kpi-report.service';
import { ReportGetRequestDto } from './dto/kpi-report-request.dto';
import { ReportKpiUseCase } from './usecases/kpi-report.use-case';
import { GetCallingStatisticDto } from './dto/calling-statistic.dto';
import { CallingStatisticUseCase } from './usecases/kpi-calling-statistic.use-case';


@Controller('kpi-report')
export class KpiReportController {
  constructor(
    // private readonly excelService: ExcelReportService,
    private readonly reportKpiUseCase: ReportKpiUseCase,
    private readonly callingStatisticUseCase: CallingStatisticUseCase,
   

  ) { }



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
  // async getReport(@Body() dto: ReportGetRequestDto) {
  //   const { domain, filters, socketId } = dto;


  //   const jobGotResult = await this.salesKpiReportQueue
  //     .add(JobNames.SALES_KPI_REPORT_GENERATE, dto)

  //   return { status: 'queued', result: jobGotResult }; // 👈 или jobId, если нужно отслеживать
  // }

  @Post('calling-statistic')
  @HttpCode(200)
  @UseInterceptors()
  async getCallingStatistic(@Body() dto: GetCallingStatisticDto) {

    // const domain = dto.domain;
    const filters = dto.filters;
    // await this.callingStatisticUseCase.init(domain);
    const result = await this.callingStatisticUseCase.get(dto);
    return result;

  }
}
