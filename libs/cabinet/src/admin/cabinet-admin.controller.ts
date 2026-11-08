import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    ParseUUIDPipe,
    Patch,
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
import { CabinetContext } from '../domain/cabinet-context';
import { CabinetMembershipService } from '../members/cabinet-membership.service';
import { CabinetInviteService } from '../members/cabinet-invite.service';
import { CabinetAdminService } from './cabinet-admin.service';
import {
    CabinetAddMemberDto,
    CabinetInviteResultDto,
    CabinetMemberDto,
    CabinetPasswordLinkDto,
} from '../dto/cabinet-member.dto';
import {
    CabinetAdminPortalCardDto,
    CabinetAttachClientDto,
} from '../dto/cabinet-admin.dto';
import { CabinetOkDto } from '../dto/cabinet-auth.dto';
import { toPasswordLinkDto } from '../controllers/cabinet-dto.mappers';

const PORTAL_PARAM = {
    name: 'portalId',
    description: 'ID портала.',
    example: 12,
};
const MEMBER_PARAM = {
    name: 'membershipId',
    description: 'ID членства (portal_users.id).',
    example: '6f1c2b8e-3a1d-4c5e-9b7a-2d4e6f8a0b1c',
};

/**
 * Кабинет клиента в админке April: связь портала с организацией, участники
 * (в т.ч. назначение и передача владельца), ссылки на пароль, Telegram.
 * Всё, что может владелец кабинета, администратор April делает за него.
 */
@ApiTags('Admin: кабинет клиента')
@ApiBearerAuth()
@Roles(Role.SUPER_USER)
@Controller('admin/cabinet/portals/:portalId')
export class CabinetAdminController {
    constructor(
        private readonly access: CabinetAccessService,
        private readonly admin: CabinetAdminService,
        private readonly memberships: CabinetMembershipService,
        private readonly invites: CabinetInviteService,
    ) {}

    @Get()
    @ApiOperation({
        summary: 'Кабинет портала',
        description:
            'Организация портала, участники (с заявками и снятыми доступами) и привязки Telegram.',
    })
    @ApiParam(PORTAL_PARAM)
    @ApiOkResponse({ type: CabinetAdminPortalCardDto, description: 'Кабинет.' })
    async card(
        @CurrentUser() user: AuthUser,
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<CabinetAdminPortalCardDto> {
        return this.admin.portalCard(await this.ctx(user, portalId));
    }

    @Patch('client')
    @ApiOperation({
        summary: 'Привязать портал к организации-клиенту',
        description:
            'У организации может быть несколько порталов. Действующим порталам без клиента его заводят вручную (раздел «Клиенты») и привязывают здесь.',
    })
    @ApiParam(PORTAL_PARAM)
    @ApiBody({ type: CabinetAttachClientDto, description: 'Организация.' })
    @ApiOkResponse({ type: CabinetAdminPortalCardDto, description: 'Кабинет.' })
    async attachClient(
        @CurrentUser() user: AuthUser,
        @Param('portalId', ParseIntPipe) portalId: number,
        @Body() dto: CabinetAttachClientDto,
    ): Promise<CabinetAdminPortalCardDto> {
        return this.admin.attachClient(
            await this.ctx(user, portalId),
            dto.clientId,
        );
    }

    @Post('members')
    @ApiOperation({
        summary: 'Дать доступ / назначить владельца',
        description:
            'Первый участник портала становится владельцем сам; makeOwner=true передаёт права сразу. Учётке без пароля выпускается ссылка (в ответе — передайте её, если письмо не ушло).',
    })
    @ApiParam(PORTAL_PARAM)
    @ApiBody({ type: CabinetAddMemberDto, description: 'Кому дать доступ.' })
    @ApiOkResponse({
        type: CabinetInviteResultDto,
        description: 'Доступ выдан.',
    })
    async invite(
        @CurrentUser() user: AuthUser,
        @Param('portalId', ParseIntPipe) portalId: number,
        @Body() dto: CabinetAddMemberDto,
    ): Promise<CabinetInviteResultDto> {
        const result = await this.invites.invite(
            await this.ctx(user, portalId),
            dto,
        );
        return {
            member: result.member,
            passwordLink: result.passwordLink
                ? toPasswordLinkDto(result.passwordLink)
                : null,
        };
    }

    @Post('members/:membershipId/approve')
    @HttpCode(200)
    @ApiOperation({ summary: 'Подтвердить заявку из Битрикса' })
    @ApiParam(PORTAL_PARAM)
    @ApiParam(MEMBER_PARAM)
    @ApiOkResponse({ type: CabinetMemberDto, description: 'Участник.' })
    async approve(
        @CurrentUser() user: AuthUser,
        @Param('portalId', ParseIntPipe) portalId: number,
        @Param('membershipId', ParseUUIDPipe) membershipId: string,
    ): Promise<CabinetMemberDto> {
        return this.memberships.approve(
            await this.ctx(user, portalId),
            membershipId,
        );
    }

    @Post('members/:membershipId/make-owner')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сделать владельцем (передача прав)',
        description:
            'Передача от April новому корневому пользователю организации: прежний владелец станет участником.',
    })
    @ApiParam(PORTAL_PARAM)
    @ApiParam(MEMBER_PARAM)
    @ApiOkResponse({ type: CabinetMemberDto, description: 'Новый владелец.' })
    async makeOwner(
        @CurrentUser() user: AuthUser,
        @Param('portalId', ParseIntPipe) portalId: number,
        @Param('membershipId', ParseUUIDPipe) membershipId: string,
    ): Promise<CabinetMemberDto> {
        return this.memberships.makeOwner(
            await this.ctx(user, portalId),
            membershipId,
        );
    }

    @Post('members/:membershipId/password-link')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Ссылка на пароль участнику',
        description:
            'Нет пароля — ссылка установки (7 дней), есть — восстановления (1 час). Прежние ссылки гаснут. Письмо отправляется, если настроена почта; ссылка — в ответе всегда.',
    })
    @ApiParam(PORTAL_PARAM)
    @ApiParam(MEMBER_PARAM)
    @ApiOkResponse({ type: CabinetPasswordLinkDto, description: 'Ссылка.' })
    async passwordLink(
        @CurrentUser() user: AuthUser,
        @Param('portalId', ParseIntPipe) portalId: number,
        @Param('membershipId', ParseUUIDPipe) membershipId: string,
    ): Promise<CabinetPasswordLinkDto> {
        return toPasswordLinkDto(
            await this.admin.passwordLink(
                await this.ctx(user, portalId),
                membershipId,
            ),
        );
    }

    @Delete('members/:membershipId')
    @ApiOperation({
        summary: 'Снять доступ',
        description: 'Администратор April может снять и владельца.',
    })
    @ApiParam(PORTAL_PARAM)
    @ApiParam(MEMBER_PARAM)
    @ApiOkResponse({ type: CabinetOkDto, description: 'Доступ снят.' })
    async revoke(
        @CurrentUser() user: AuthUser,
        @Param('portalId', ParseIntPipe) portalId: number,
        @Param('membershipId', ParseUUIDPipe) membershipId: string,
    ): Promise<CabinetOkDto> {
        await this.memberships.revoke(
            await this.ctx(user, portalId),
            membershipId,
        );
        return { ok: true };
    }

    @Delete('telegram/:bindingId')
    @ApiOperation({ summary: 'Отвязать Telegram-чат от портала' })
    @ApiParam(PORTAL_PARAM)
    @ApiParam({
        name: 'bindingId',
        description: 'ID привязки.',
        example: '0b8f7c1e-6d4a-4f2b-8e9c-1a2b3c4d5e6f',
    })
    @ApiOkResponse({ type: CabinetOkDto, description: 'Отвязано.' })
    async revokeTelegram(
        @CurrentUser() user: AuthUser,
        @Param('portalId', ParseIntPipe) portalId: number,
        @Param('bindingId', ParseUUIDPipe) bindingId: string,
    ): Promise<CabinetOkDto> {
        await this.admin.revokeTelegram(
            await this.ctx(user, portalId),
            bindingId,
        );
        return { ok: true };
    }

    /** Контекст администратора April на портале (SUPER_USER → platform). */
    private ctx(user: AuthUser, portalId: number): Promise<CabinetContext> {
        return this.access.resolve(user, BigInt(portalId));
    }
}
