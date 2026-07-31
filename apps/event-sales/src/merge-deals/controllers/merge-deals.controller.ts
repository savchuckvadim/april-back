import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    MergeDealsHealthResponseDto,
    MergeDealsRequestDto,
    MergeDealsResponseDto,
} from '../dto/merge-deals.dto';
import { MergeDealsService } from '../services/merge-deals.service';

/**
 * Объединение сделок портала Bitrix.
 *
 * Модуль подключён как заглушка: эндпоинты доступны и полностью
 * типизированы в Swagger, запросы валидируются, но доменная логика
 * слияния ещё не реализована — сделки в Битрикс не изменяются.
 */
@ApiTags('Merge deals')
@Controller('merge-deals')
export class MergeDealsController {
    constructor(private readonly mergeDealsService: MergeDealsService) {}

    @Get('health')
    @ApiOperation({
        summary: 'Smoke-проверка модуля объединения сделок',
        description:
            'Возвращает статус модуля без обращения к Битрикс. Нужен, ' +
            'чтобы убедиться, что модуль зарегистрирован в приложении ' +
            'и его маршруты обслуживаются.',
    })
    @ApiOkResponse({
        type: MergeDealsHealthResponseDto,
        description:
            'Модуль поднят; поле implemented показывает готовность логики.',
    })
    getHealth(): MergeDealsHealthResponseDto {
        return this.mergeDealsService.getHealth();
    }

    @Post('merge')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Объединить сделки портала (заглушка)',
        description:
            'Принимает целевую сделку и список сделок-источников, ' +
            'валидирует запрос и возвращает его эхом со статусом ' +
            '`not_implemented`. Реального слияния в Битрикс не происходит — ' +
            'доменная логика будет подключена позже.',
    })
    @ApiBody({
        type: MergeDealsRequestDto,
        description: 'Домен портала, целевая сделка и сделки-источники.',
    })
    @ApiOkResponse({
        type: MergeDealsResponseDto,
        description:
            'Запрос принят и провалидирован; изменения в Битрикс не отправлялись.',
    })
    merge(@Body() dto: MergeDealsRequestDto): MergeDealsResponseDto {
        return this.mergeDealsService.merge(dto);
    }
}
