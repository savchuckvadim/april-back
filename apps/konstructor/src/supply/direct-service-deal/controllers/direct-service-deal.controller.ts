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
            'Компания сделки, её текущий рег-лист, контакты и число вариантов комплекта, которые переедут. Менеджер видит текущий рег-лист и решает — оставить его или заменить.',
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
        summary: 'Создать сервисную сделку напрямую, минуя RPA',
        description:
            'Облегчённый путь поставки: вместо заявки RPA менеджер заполняет обязательный минимум в конструкторе, и сервисная сделка создаётся сразу. Переносятся поля, товарные строки, слепок конструктора и все варианты комплекта; клиент переводится на менеджера ОРК. Задачи ОРК здесь не ставятся — они завязаны на элемент RPA.',
    })
    @ApiBody({
        type: DirectServiceDealDto,
        description: 'Сделка-источник и обязательные поля сервисной сделки.',
    })
    @ApiOkResponse({
        type: DirectServiceDealResponseDto,
        description: 'Созданная сделка и что в неё перенесено.',
    })
    async create(
        @Body() body: DirectServiceDealDto,
    ): Promise<DirectServiceDealResponseDto> {
        return await this.useCase.execute(body);
    }
}
