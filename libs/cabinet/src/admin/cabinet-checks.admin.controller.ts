import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    ParseUUIDPipe,
    Post,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { AuthUser, CurrentUser, Role, Roles } from '@lib/auth';
import { CabinetAccessService } from '../access/cabinet-access.service';
import {
    CabinetCheckResultDto,
    CabinetMailCheckResultDto,
    CabinetMailStatusDto,
    CabinetMailTestDto,
} from '../dto/cabinet-checks.dto';
import { CabinetChannelCheckService } from './cabinet-channel-check.service';
import { CabinetMailCheckService } from './cabinet-mail-check.service';

/**
 * Проверка каналов кабинета из админки April: тестовое письмо и тестовое
 * сообщение в привязанный Telegram-чат. Результат — в ответе (ok и что
 * случилось), а не только в логах.
 */
@ApiTags('Admin: кабинет клиента')
@ApiBearerAuth()
@Roles(Role.SUPER_USER)
@Controller('admin/cabinet')
export class CabinetChecksAdminController {
    constructor(
        private readonly access: CabinetAccessService,
        private readonly checks: CabinetChannelCheckService,
        private readonly mailCheck: CabinetMailCheckService,
    ) {}

    @Get('checks/mail')
    @ApiOperation({
        summary: 'Настройка почты',
        description:
            'Что задано в окружении сервера для исходящей почты (MAIL_HOST, MAIL_PORT, MAIL_LOGIN, SMTP_FROM; пароль — только «задан/нет») и что в этом не так.',
    })
    @ApiOkResponse({
        type: CabinetMailStatusDto,
        description: 'Настройка почты без пароля.',
    })
    mailStatus(): CabinetMailStatusDto {
        return this.mailCheck.status();
    }

    @Post('checks/mail')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Проверить почту',
        description:
            'Отправить тестовое письмо через SMTP (MAIL_*), которым уходят ссылки на пароль и коды подключения. Отказ — с причиной по-русски и в журнал приложения admin; если соединиться не удалось — с пробой DNS и портов 465/587 с сервера.',
    })
    @ApiBody({ type: CabinetMailTestDto, description: 'Куда отправить.' })
    @ApiOkResponse({
        type: CabinetMailCheckResultDto,
        description: 'Итог проверки и сетевая диагностика.',
    })
    mail(@Body() dto: CabinetMailTestDto): Promise<CabinetMailCheckResultDto> {
        return this.mailCheck.test(dto.email);
    }

    @Post('portals/:portalId/telegram/:bindingId/test')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Проверить привязанный Telegram',
        description:
            'Тестовое сообщение от клиентского бота в чат привязки. Не доставлено — причина по-русски (бот заблокирован, чат не найден, токен не узнан).',
    })
    @ApiParam({ name: 'portalId', description: 'ID портала.', example: 12 })
    @ApiParam({
        name: 'bindingId',
        description: 'ID привязки Telegram (uuid).',
        example: '7f0c1a2e-0000-4000-8000-000000000000',
    })
    @ApiOkResponse({
        type: CabinetCheckResultDto,
        description: 'Итог проверки.',
    })
    async telegram(
        @CurrentUser() user: AuthUser,
        @Param('portalId', ParseIntPipe) portalId: number,
        @Param('bindingId', ParseUUIDPipe) bindingId: string,
    ): Promise<CabinetCheckResultDto> {
        return this.checks.testTelegramBinding(
            await this.access.resolve(user, BigInt(portalId)),
            bindingId,
        );
    }
}
