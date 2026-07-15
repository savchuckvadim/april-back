import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BxRecordsByCompanyRequestDto } from '../dto/bx-records.dto';
import { BxCallingRecordDto } from '../dto/bx-record-response.dto';
import { RecordsByCompanyUseCase } from '../use-cases/records-by-company.use-case';

@ApiTags('Event Sales Bx Records')
@Controller('event-sales-bx-records')
export class BxRecordsController {
    constructor(
        private readonly recordsByCompanyUseCase: RecordsByCompanyUseCase,
    ) {}

    @ApiOperation({
        summary: 'Записи звонков по компании',
        description:
            'Записи звонков из Bitrix-активностей компании (+связанные контакты/лиды/сделки), ' +
            'отсортированы от новых к старым.',
    })
    @ApiBody({ type: BxRecordsByCompanyRequestDto })
    @ApiOkResponse({ type: BxCallingRecordDto, isArray: true })
    @Post('company')
    @HttpCode(200)
    async getRecordsByCompany(
        @Body() dto: BxRecordsByCompanyRequestDto,
    ): Promise<BxCallingRecordDto[]> {
        return (await this.recordsByCompanyUseCase.getRecords(
            dto,
        )) as BxCallingRecordDto[];
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