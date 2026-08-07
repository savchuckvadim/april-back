import {
    Controller,
    Get,
    NotFoundException,
    Param,
    Query,
} from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import { SalesHookStatusService } from '../services/sales-hook-status.service';
import { SalesHookOperationDto } from '../dto/sales-hook-operation.dto';

/**
 * Статус операций sales-хуков — общий поллинг-эндпоинт всей семьи.
 * Основной канал уведомления — WS (sales-hook:done/error), этот эндпоинт —
 * фолбэк, когда сокет отвалился или фрейм перезагрузился.
 */
@ApiTags('Sales hooks')
@Controller('sales-hooks/operations')
export class SalesHookOperationsController {
    constructor(private readonly status: SalesHookStatusService) {}

    @Get(':operationId')
    @ApiOperation({
        summary: 'Статус операции sales-хука',
        description:
            'Возвращает текущее состояние операции по её идентификатору. ' +
            'Поле hook указывает, какому хуку принадлежит операция, ' +
            'result — типизированный результат конкретного хука.',
    })
    @ApiParam({
        name: 'operationId',
        description: 'Идентификатор операции, выданный при постановке.',
        example: '3a1f0c9e-6b1d-4b8e-9a71-2f6d2c1e5a10',
    })
    @ApiQuery({
        name: 'domain',
        description: 'Домен портала Bitrix, которому принадлежит операция.',
        example: 'example.bitrix24.ru',
    })
    @ApiOkResponse({
        type: SalesHookOperationDto,
        description: 'Текущее состояние операции.',
    })
    async getOperation(
        @Param('operationId') operationId: string,
        @Query('domain') domain: string,
    ): Promise<SalesHookOperationDto> {
        const operation = await this.status.get(domain, operationId);
        if (!operation) {
            throw new NotFoundException(
                `Операция ${operationId} не найдена или её статус истёк (TTL 1 час)`,
            );
        }
        return operation;
    }
}
