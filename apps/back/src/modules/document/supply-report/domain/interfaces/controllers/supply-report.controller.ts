// src/modules/document/supply-report/interfaces/controllers/supply-report.controller.ts

import { Controller, Get, Post, Body } from '@nestjs/common';
import { GenerateSupplyReportDto } from '../../../dto/generate-supply-report.dto';
import { GenerateSupplyReportUseCase } from '../../../use-cases/generate-supply-report/generate-supply-report.use-case';

@Controller('supply-report')
export class SupplyReportController {
    constructor(
        private readonly generateUseCase: GenerateSupplyReportUseCase,
    ) {}

    @Post()
    generate(@Body() dto: GenerateSupplyReportDto) {
        try {
            console.log(dto);
            console.log(this.generateUseCase);
            return this.generateUseCase.execute(dto);
        } catch (error) {
            console.log(error);
        }
    }

    @Get('ping')
    ping(path: string) {
        console.log(path);
        return { status: 'ok' };
    }
}
