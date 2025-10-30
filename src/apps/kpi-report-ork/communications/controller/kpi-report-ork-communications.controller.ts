import { BadRequestException, Controller, Get, Post, Query, Body } from '@nestjs/common';

import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { PBXService } from '@/modules/pbx';

import { ReportCommunicationsUseCase } from '../usecases/ork-report-communications.use-case';
import { GetReportCommunicationsResponseDto } from '../dto/communications.dto';
import { GetReportCommunicationsRequestDto } from '../dto/get-report-communications-request.dto';


@ApiTags('Ork Report')
@Controller('kpi-report-ork-communications')
export class CommunicationsController {
    constructor(
        private readonly pbx: PBXService,
    ) { }

    @ApiOperation({ summary: 'Get report' })
    @ApiResponse({ status: 200, description: 'Report', type: GetReportCommunicationsResponseDto })
    @Post('get')
    async get(@Body() dto: GetReportCommunicationsRequestDto): Promise<GetReportCommunicationsResponseDto> {
        if (!dto.domain) {
            throw new BadRequestException('Domain is required');
        }
        const useCase = new ReportCommunicationsUseCase(
            this.pbx,
        );
        const report = await useCase.generateKpiReport(dto.domain, dto.filters);
        return { report };
    }
}
