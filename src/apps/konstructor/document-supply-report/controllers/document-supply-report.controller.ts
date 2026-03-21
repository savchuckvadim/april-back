import { Body, Controller, Get, Post } from '@nestjs/common';
import { DocumentSupplyReportGenerateDto } from '../dto/document-supply-report-generate.dto';

@Controller('document-supply-report')
export class DocumentSupplyReportController {
    constructor() {}

    @Post('init-form')
    async getDocumentSupplyReport(@Body() dto: any) {}

    @Post('generate-document')
    async generateDocument(@Body() dto: DocumentSupplyReportGenerateDto) {}
}
