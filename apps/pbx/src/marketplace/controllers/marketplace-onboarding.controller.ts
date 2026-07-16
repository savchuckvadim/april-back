import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '@lib/auth';
import { PortalSessionGuard } from '../lib/portal-session.guard';
import { MarketplaceOnboardingService } from '../services/marketplace-onboarding.service';
import {
    OnboardingApplicationDto,
    OnboardingStateDto,
} from '../dto/marketplace-onboarding.dto';

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
}
