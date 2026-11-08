import {
    Body,
    Controller,
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
    CabinetMailTestDto,
} from '../dto/cabinet-checks.dto';
import { CabinetChannelCheckService } from './cabinet-channel-check.service';

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
    ) {}

    @Post('checks/mail')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Проверить почту',
        description:
            'Отправить тестовое письмо через SMTP (MAIL_*), которым уходят ссылки на пароль и коды подключения. Ошибка SMTP — в ответе.',
    })
    @ApiBody({ type: CabinetMailTestDto, description: 'Куда отправить.' })
    @ApiOkResponse({
        type: CabinetCheckResultDto,
        description: 'Итог проверки.',
    })
    mail(@Body() dto: CabinetMailTestDto): Promise<CabinetCheckResultDto> {
        return this.checks.testMail(dto.email);
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
