import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
} from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import {
    DealSendDto,
    DealSendPreflightQueryDto,
    DealSendPreflightResponseDto,
    DealSendResponseDto,
    DealSendStatusResponseDto,
} from '../dto/deal-send.dto';
import { DealSendUseCase } from '../use-cases/deal-send.use-case';
import { DealSendStatusUseCase } from '../use-cases/deal-send-status.use-case';
import { DealSendPreflightUseCase } from '../use-cases/deal-send-preflight.use-case';

@ApiTags('KonstructorDealSend')
@Controller('konstructor/deal-send')
export class DealSendController {
    constructor(
        private readonly useCase: DealSendUseCase,
        private readonly statusUseCase: DealSendStatusUseCase,
        private readonly preflightUseCase: DealSendPreflightUseCase,
    ) {}

    @Post()
    @HttpCode(200)
    @ApiOperation({
        summary: 'Отправить сделку конструктора в Bitrix',
        description:
            'Создаёт сделку, если dealId не передан: воронка sales_base, стадия «Документы», компания, ответственный, поставщик. Поля приходят кодами pbx-канона — идентификаторы полей резолвятся по схеме портала. Сделка создаётся синхронно (её id нужен фронту сразу); запись полей и строк уходит в очередь, результат — GET status/{operationId}. Нет воронки или схемы сделок — 422 без создания: фронт создаёт сделку по-старому.',
    })
    @ApiBody({
        type: DealSendDto,
        description: 'Состояние сделки из конструктора.',
    })
    @ApiOkResponse({
        type: DealSendResponseDto,
        description:
            'Сделка, признак создания, operationId задания записи, коды полей, которых нет на портале, и предупреждения.',
    })
    async send(@Body() body: DealSendDto): Promise<DealSendResponseDto> {
        return await this.useCase.execute(body);
    }

    @Get('status/:operationId')
    @ApiOperation({
        summary: 'Статус записи сделки',
        description:
            'Опрос задания записи полей и строк по operationId из ответа POST. done && ok — записано; done && !ok — не записано (фронт отправляет запись в легаси). Задание хранится сутки после успеха и неделю после отказа.',
    })
    @ApiParam({ name: 'operationId', format: 'uuid' })
    @ApiOkResponse({ type: DealSendStatusResponseDto })
    async status(
        @Param('operationId', new ParseUUIDPipe()) operationId: string,
    ): Promise<DealSendStatusResponseDto> {
        return await this.statusUseCase.execute(operationId);
    }

    @Get('preflight')
    @ApiOperation({
        summary: 'Готов ли портал к созданию сделки через Nest',
        description:
            'Только чтение: воронка sales_base, STAGE_ID стадии «Документы», ключевые поля в pbx-схеме сделки. Ничего не создаёт и не пишет.',
    })
    @ApiOkResponse({ type: DealSendPreflightResponseDto })
    async preflight(
        @Query() query: DealSendPreflightQueryDto,
    ): Promise<DealSendPreflightResponseDto> {
        return await this.preflightUseCase.execute(query.domain);
    }
}
