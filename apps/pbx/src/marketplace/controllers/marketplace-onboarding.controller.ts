import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '@lib/auth';
import { PortalSessionGuard } from '../lib/portal-session.guard';
import { MarketplaceOnboardingService } from '../services/marketplace-onboarding.service';
import { MarketplaceInviteService } from '../services/marketplace-invite.service';
import {
    OnboardingApplicationDto,
    OnboardingStateDto,
} from '../dto/marketplace-onboarding.dto';
import {
    RedeemInviteDto,
    RedeemInviteResultDto,
} from '../dto/marketplace-invite.dto';

/**
 * Онбординг клиента из кабинета (iframe Битрикса).
 *
 * Оба эндпоинта — ТОЛЬКО под portal-context сессией (Bearer-токен,
 * полученный обменом одноразового кода /session/exchange; sub = member_id).
 * Никакие member_id/domain из тела/query не принимаются — контекст
 * берётся из проверенного токена.
 */
@ApiTags('Bitrix Marketplace Onboarding')
@ApiBearerAuth()
@UseGuards(PortalSessionGuard)
@Controller('bitrix-marketplace/onboarding')
export class MarketplaceOnboardingController {
    constructor(
        private readonly onboardingService: MarketplaceOnboardingService,
        private readonly inviteService: MarketplaceInviteService,
    ) {}

    @ApiOperation({
        summary:
            'Текущее состояние допуска портала и поданная заявка (для экранов кабинета)',
    })
    @ApiOkResponse({
        description: 'Состояние: onboarding | pending | active | blocked',
        type: OnboardingStateDto,
    })
    @ApiUnauthorizedResponse({
        description: 'Нет/просрочен portal-context токен',
    })
    @Get('state')
    async getState(@CurrentUser() user: AuthUser): Promise<OnboardingStateDto> {
        return this.onboardingService.getState(user.sub);
    }

    @ApiOperation({
        summary:
            'Подать заявку на подключение (организация + контактный email); повторная подача до одобрения редактирует заявку',
    })
    @ApiOkResponse({
        description: 'Новое состояние (pending) и сохранённая заявка',
        type: OnboardingStateDto,
    })
    @ApiUnauthorizedResponse({
        description: 'Нет/просрочен portal-context токен',
    })
    @Post()
    async submitApplication(
        @CurrentUser() user: AuthUser,
        @Body() dto: OnboardingApplicationDto,
    ): Promise<OnboardingStateDto> {
        return this.onboardingService.submitApplication(user.sub, dto);
    }

    @ApiOperation({
        summary: 'Ввести код подключения портала к сервису April',
        description:
            'Код партнёр получает от вендора по договору (письмом). Погашение привязывает портал к организации и открывает подключение; код одноразовый. Портал определяется по portal-context токену.',
    })
    @ApiBody({
        type: RedeemInviteDto,
        description: 'Код подключения из письма.',
    })
    @ApiOkResponse({
        description: 'Портал подключён к внешнему сервису',
        type: RedeemInviteResultDto,
    })
    @ApiUnauthorizedResponse({
        description: 'Нет/просрочен portal-context токен',
    })
    @Post('redeem')
    async redeemInvite(
        @CurrentUser() user: AuthUser,
        @Body() dto: RedeemInviteDto,
    ): Promise<RedeemInviteResultDto> {
        return this.inviteService.redeemCode(user.sub, dto.code);
    }
}
