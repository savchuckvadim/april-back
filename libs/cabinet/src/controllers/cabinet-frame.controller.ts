import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiConflictResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { CabinetAccess, CabinetCtx } from '../access/cabinet-access.decorator';
import { CabinetContext } from '../domain/cabinet-context';
import { CabinetFrameAccessService } from '../frame/cabinet-frame-access.service';
import {
    CabinetFrameAccessStatusDto,
    CabinetPersonDto,
} from '../dto/cabinet-member.dto';

/**
 * Доступ к кабинету с сайта для сотрудника, открывшего приложение April
 * в Битрикс24. Портал и сотрудник — из сессии фрейма (без ввода домена).
 */
@ApiTags('Кабинет клиента: из Битрикс24')
@Controller('cabinet/frame')
export class CabinetFrameController {
    constructor(private readonly frameAccess: CabinetFrameAccessService) {}

    @Get('access')
    @CabinetAccess('frame')
    @ApiOperation({
        summary: 'Мой доступ к кабинету с сайта',
        description:
            'Есть ли у текущего сотрудника портала доступ (роль), заявка или задан ли пароль.',
    })
    @ApiOkResponse({
        type: CabinetFrameAccessStatusDto,
        description: 'Состояние доступа.',
    })
    async status(
        @CabinetCtx() ctx: CabinetContext,
    ): Promise<CabinetFrameAccessStatusDto> {
        return this.frameAccess.status(ctx);
    }

    @Post('access-request')
    @HttpCode(200)
    @CabinetAccess('frame')
    @ApiOperation({
        summary: 'Попросить доступ к кабинету',
        description:
            'Заявка ждёт подтверждения владельца кабинета или April и до этого прав не даёт. 3 заявки в час на сотрудника.',
    })
    @ApiBody({ type: CabinetPersonDto, description: 'Email и имя.' })
    @ApiOkResponse({
        type: CabinetFrameAccessStatusDto,
        description: 'Заявка принята.',
    })
    @ApiConflictResponse({
        description:
            'Email занят другой организацией или уже есть в кабинете портала.',
    })
    async request(
        @CabinetCtx() ctx: CabinetContext,
        @Body() dto: CabinetPersonDto,
    ): Promise<CabinetFrameAccessStatusDto> {
        return this.frameAccess.request(ctx, dto);
    }
}
