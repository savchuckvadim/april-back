import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SalesHookOperationDto } from '../../core/dto/sales-hook-operation.dto';
import { JoinToMainOperationDto } from '../../join-to-main/dto/join-to-main-result.dto';
import {
    ClientWorkJoinRequestDto,
    ClientWorkRequestDto,
    ClientWorkResponseDto,
} from '../dto/client-work.dto';
import { ClientWorkService } from '../services/client-work.service';

/**
 * «Работа клиента» в «Звонках»: все открытые сделки клиента в воронке
 * продаж и присоединение выбранных к основной (руководителю). Нужна,
 * потому что «Возможные пересечения» сделки ТОЙ ЖЕ компании не
 * показывают — это окружение клиента, а не дубль.
 */
@ApiTags('Sales hooks')
@Controller('sales-hooks/client-work')
export class ClientWorkController {
    constructor(private readonly clientWork: ClientWorkService) {}

    @Post('deals')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Открытые сделки клиента сделки',
        description:
            'Клиент сделки (компания, без неё — контакт) и все его открытые ' +
            'сделки в воронке продаж: предложенная основная, самая свежая, ' +
            'кто ведёт сам, что проверить до присоединения. canJoin — ' +
            'проверено на сервере, руководитель ли сотрудник.',
    })
    @ApiBody({
        type: ClientWorkRequestDto,
        description: 'Портал, сделка из «Звонков» и кто смотрит.',
    })
    @ApiOkResponse({
        type: ClientWorkResponseDto,
        description: 'Работа клиента для блока в «Звонках».',
    })
    async deals(
        @Body() dto: ClientWorkRequestDto,
    ): Promise<ClientWorkResponseDto> {
        return this.clientWork.load(dto);
    }

    @Post('join')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Присоединить выбранные сделки клиента к основной',
        description:
            'Только руководителю отдела продаж (проверка на сервере, иначе ' +
            '403). Каждая выбранная сделка присоединяется к основной так же, ' +
            'как кнопкой «Присоединить сюда»: закрывается стадией «Дубль», ' +
            'задачи, дела, контакты и заявки переходят в основную, ничего не ' +
            'удаляется. Одна операция на всю пачку; статус — ' +
            'GET /sales-hooks/operations/{operationId} или WS-события.',
    })
    @ApiBody({
        type: ClientWorkJoinRequestDto,
        description: 'Основная сделка, присоединяемые и кто нажал.',
    })
    @ApiOkResponse({
        type: JoinToMainOperationDto,
        description: 'Операция поставлена (или возвращена существующая).',
    })
    async join(
        @Body() dto: ClientWorkJoinRequestDto,
    ): Promise<SalesHookOperationDto> {
        return this.clientWork.join(dto);
    }
}
