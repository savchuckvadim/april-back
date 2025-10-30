import { BadRequestException, Controller, Get, Post, Query, Body } from '@nestjs/common';

import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetOrkReportKpiResponseDto } from './dto/get-report-response.dto';
import { GetReportRequestDto } from './dto/get-report-request.dto';
import { ReportKpiUseCase } from './usecases/kpi-report.use-case';
import { PBXService } from '@/modules/pbx';


@ApiTags('Ork Report')
@Controller('kpi-report-ork-event')
export class KpiController {
    constructor(
        private readonly pbx: PBXService,
    ) { }

    @ApiOperation({ summary: 'Get report' })
    @ApiResponse({ status: 200, description: 'Report', type: GetOrkReportKpiResponseDto })
    @Post('get')
    async get(@Body() dto: GetReportRequestDto): Promise<GetOrkReportKpiResponseDto> {
        if (!dto.domain) {
            throw new BadRequestException('Domain is required');
        }
        const useCase = new ReportKpiUseCase(
            this.pbx,
        );
        const report = await useCase.generateKpiReport(dto.domain, dto.filters);
        return { report };
    }
}
