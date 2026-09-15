import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
    DirectServiceDealDto,
    DirectServiceDealPrepareResponseDto,
    DirectServiceDealResponseDto,
} from '../dto/direct-service-deal.dto';
import { DirectServiceDealUseCase } from '../use-cases/direct-service-deal.use-case';

export class DirectServiceDealPrepareQueryDto {
    @ApiProperty({ type: String, example: 'gsr.bitrix24.ru' })
    @IsNotEmpty()
    @IsString()
    domain: string;

    @ApiProperty({ type: Number, example: 159701 })
    @IsInt()
    @Type(() => Number)
    sourceDealId: number;
}

@ApiTags('KonstructorSupply')
@Controller('supply/direct-service-deal')
export class DirectServiceDealController {
    constructor(private readonly useCase: DirectServiceDealUseCase) {}

    @Get('prepare')
    @ApiOperation({
        summary: 'Данные для формы облегчённой поставки',
        description:
            'Компания сделки, её текущий рег-лист, контакты и число вариантов комплекта, которые переедут. Менеджер видит текущий рег-лист и решает — оставить его или заменить. Плюс existingServiceDeal: если по этой базовой сделке сервисная уже создавалась, конструктор обязан спросить — обновить её или создать новую.',
    })
    @ApiOkResponse({
        type: DirectServiceDealPrepareResponseDto,
        description: 'Текущие значения для предзаполнения формы.',
    })
    async prepare(
        @Query() query: DirectServiceDealPrepareQueryDto,
    ): Promise<DirectServiceDealPrepareResponseDto> {
        return await this.useCase.prepare(query.domain, query.sourceDealId);
    }

    @Post()
    @HttpCode(200)
    @ApiOperation({
        summary: 'Создать или обновить сервисную сделку напрямую, минуя RPA',
        description:
            'Облегчённый путь поставки: вместо заявки RPA менеджер заполняет обязательный минимум в конструкторе, и сервисная сделка создаётся сразу. Переносятся поля, товарные строки, слепок конструктора и все варианты комплекта; клиент переводится на менеджера ОРК. Задачи ОРК здесь не ставятся — они завязаны на элемент RPA. Переотправка: mode = update и targetDealId обновляют уже созданную сделку вместо создания второй.',
    })
    @ApiBody({
        type: DirectServiceDealDto,
        description:
            'Сделка-источник, обязательные поля сервисной сделки и режим (create по умолчанию / update с targetDealId).',
    })
    @ApiOkResponse({
        type: DirectServiceDealResponseDto,
        description:
            'Итог: action (created|updated), id сделки и что в неё перенесено.',
    })
    async create(
        @Body() body: DirectServiceDealDto,
    ): Promise<DirectServiceDealResponseDto> {
        return await this.useCase.execute(body);
    }
}
