import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PortalSessionProtected } from '@lib/auth';
import { BxRecordsByCompanyRequestDto } from '../dto/bx-records.dto';
import { BxCallingRecordDto } from '../dto/bx-record-response.dto';
import { RecordsByCompanyUseCase } from '../use-cases/records-by-company.use-case';
import { CLIENT_CALLS_ROUTE } from '../client-calls/client-calls.const';
import { ClientCallsUseCase } from '../client-calls/client-calls.use-case';
import { ClientCallsDto } from '../dto/client-calls.dto';

@ApiTags('Event Sales Bx Records')
@Controller('event-sales-bx-records')
export class BxRecordsController {
    constructor(
        private readonly recordsByCompanyUseCase: RecordsByCompanyUseCase,
        private readonly clientCallsUseCase: ClientCallsUseCase,
    ) {}

    @ApiOperation({
        summary: 'Записи звонков по компании',
        description:
            'Записи звонков из Bitrix-активностей компании (+связанные контакты/лиды/сделки), ' +
            'отсортированы от новых к старым. Отдаёт адреса записей, поэтому ' +
            'проверяется сессия портала: домен запроса должен совпадать с ' +
            'доменом сессии (режим проверки — общий для приложения).',
    })
    @PortalSessionProtected()
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
    @ApiOperation({
        summary: 'Звонки клиента с состоянием разбора',
        description:
            'Последние звонки клиента с записью по всем его связям (компания, ' +
            'её контакты, сделки и лиды), свежие первыми. У каждого звонка — ' +
            'состояние разбора, а у разобранного — краткое резюме, следующий ' +
            'шаг и адрес страницы полного разбора. Адреса файлов записей в ' +
            'Битрикс24 не отдаются. Проверяется сессия портала: домен запроса ' +
            'должен совпадать с доменом сессии.',
    })
    @PortalSessionProtected()
    @ApiBody({ type: BxRecordsByCompanyRequestDto })
    @ApiOkResponse({ type: ClientCallsDto })
    @Post(CLIENT_CALLS_ROUTE)
    @HttpCode(200)
    async getClientCalls(
        @Body() dto: BxRecordsByCompanyRequestDto,
    ): Promise<ClientCallsDto> {
        return this.clientCallsUseCase.list(dto);
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
