import { Body, Controller, Post } from '@nestjs/common';
import { BxRecordsByCompanyRequestDto } from '../dto/bx-records.dto';
import { RecordsByCompanyUseCase } from '../use-cases/records-by-company.use-case';

@Controller('event-sales-bx-records')
export class BxRecordsController {
    constructor(
        private readonly recordsByCompanyUseCase: RecordsByCompanyUseCase,
    ) {}

    @Post('company')
    async getRecordsByCompany(@Body() dto: BxRecordsByCompanyRequestDto) {
        return await this.recordsByCompanyUseCase.getRecords(dto);
    }
    /**
     * TODO: get records by lead делается где-то в другом месте
     * перенести сюда
     * раньше делался так C:\Projects\April\april-next\back\apps\event-sales\src\use-cases\bx-activity.use-case.ts
     */
    // @Post('lead')
    // async getRecordsByCompany(@Body() dto: BxRecordsByCompanyRequestDto) {
    //     return await this.recordsByCompanyUseCase.getRecords(dto);
    // }
}
