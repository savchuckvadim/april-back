import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Post,
} from '@nestjs/common';
import {
    ApiBody,
    ApiConflictResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { CabinetAccess, CabinetCtx } from '../access/cabinet-access.decorator';
import { CabinetContext } from '../domain/cabinet-context';
import { CabinetMembershipService } from '../members/cabinet-membership.service';
import { CabinetInviteService } from '../members/cabinet-invite.service';
import {
    CabinetAddMemberDto,
    CabinetInviteResultDto,
    CabinetMemberDto,
} from '../dto/cabinet-member.dto';
import { CabinetOkDto } from '../dto/cabinet-auth.dto';
import { toPasswordLinkDto } from './cabinet-dto.mappers';

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
 * Участники кабинета портала — управляет владелец (корневой пользователь
 * организации); администратор April может то же из админки.
 */
@ApiTags('Кабинет клиента: участники')
@Controller('cabinet/portals/:portalId/members')
export class CabinetMembersController {
    constructor(
        private readonly memberships: CabinetMembershipService,
        private readonly invites: CabinetInviteService,
    ) {}

    @Get()
    @CabinetAccess('owner')
    @ApiOperation({
        summary: 'Участники кабинета портала',
        description:
            'Владелец, участники, заявки из Битрикса и снятые доступы.',
    })
    @ApiParam(PORTAL_PARAM)
    @ApiOkResponse({ type: [CabinetMemberDto], description: 'Участники.' })
    async list(@CabinetCtx() ctx: CabinetContext): Promise<CabinetMemberDto[]> {
        return this.memberships.list(ctx);
    }

    @Post()
    @CabinetAccess('owner')
    @ApiOperation({
        summary: 'Дать доступ человеку',
        description:
            'Заводит учётку организации (или находит по email) и даёт доступ участника. Учётке без пароля — письмо со ссылкой установки пароля; ссылка есть и в ответе, если письмо не ушло.',
    })
    @ApiParam(PORTAL_PARAM)
    @ApiBody({ type: CabinetAddMemberDto, description: 'Кому дать доступ.' })
    @ApiOkResponse({
        type: CabinetInviteResultDto,
        description: 'Доступ выдан.',
    })
    @ApiConflictResponse({
        description: 'Email занят учёткой другой организации.',
    })
    async add(
        @CabinetCtx() ctx: CabinetContext,
        @Body() dto: CabinetAddMemberDto,
    ): Promise<CabinetInviteResultDto> {
        const result = await this.invites.invite(ctx, dto);
        return {
            member: result.member,
            passwordLink: result.passwordLink
                ? toPasswordLinkDto(result.passwordLink)
                : null,
        };
    }

    @Post(':membershipId/approve')
    @HttpCode(200)
    @CabinetAccess('owner')
    @ApiOperation({
        summary: 'Подтвердить заявку из Битрикса',
        description:
            'Заявка становится участником (если у портала нет владельца — владельцем).',
    })
    @ApiParam(PORTAL_PARAM)
    @ApiParam(MEMBER_PARAM)
    @ApiOkResponse({ type: CabinetMemberDto, description: 'Участник.' })
    async approve(
        @CabinetCtx() ctx: CabinetContext,
        @Param('membershipId', ParseUUIDPipe) membershipId: string,
    ): Promise<CabinetMemberDto> {
        return this.memberships.approve(ctx, membershipId);
    }

    @Post(':membershipId/make-owner')
    @HttpCode(200)
    @CabinetAccess('owner')
    @ApiOperation({
        summary: 'Передать права владельца',
        description:
            'Участник становится владельцем кабинета портала, прежний владелец — участником.',
    })
    @ApiParam(PORTAL_PARAM)
    @ApiParam(MEMBER_PARAM)
    @ApiOkResponse({ type: CabinetMemberDto, description: 'Новый владелец.' })
    async makeOwner(
        @CabinetCtx() ctx: CabinetContext,
        @Param('membershipId', ParseUUIDPipe) membershipId: string,
    ): Promise<CabinetMemberDto> {
        return this.memberships.makeOwner(ctx, membershipId);
    }

    @Delete(':membershipId')
    @CabinetAccess('owner')
    @ApiOperation({
        summary: 'Снять доступ',
        description:
            'Доступ к кабинету портала снимается сразу. Владельца снять нельзя — сначала передайте права.',
    })
    @ApiParam(PORTAL_PARAM)
    @ApiParam(MEMBER_PARAM)
    @ApiOkResponse({ type: CabinetOkDto, description: 'Доступ снят.' })
    async revoke(
        @CabinetCtx() ctx: CabinetContext,
        @Param('membershipId', ParseUUIDPipe) membershipId: string,
    ): Promise<CabinetOkDto> {
        await this.memberships.revoke(ctx, membershipId);
        return { ok: true };
    }
}
