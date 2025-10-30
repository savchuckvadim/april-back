import { Controller, Get, Query } from "@nestjs/common";
import { OrkDealsReportService } from "../services/ork-deals-report.service";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {  OrkReportDealsResponseDto } from "../dto/ork-report-deals.dto";

@ApiTags('Ork Report')
@Controller('ork-deals-report')
export class DealsReportController {
    constructor(private readonly orkDealsReportService: OrkDealsReportService) {}

    @ApiOperation({ summary: 'Get report' })
    @ApiResponse({ status: 200, description: 'Report', type: OrkReportDealsResponseDto })
    @Get('')
    async get(@Query('domain') domain: string): Promise<OrkReportDealsResponseDto> {
        const deals = await this.orkDealsReportService.getReport(domain);
        return deals;
    }
}
