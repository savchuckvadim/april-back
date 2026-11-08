import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    Req,
    Res,
    UnauthorizedException,
} from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
    ApiTooManyRequestsResponse,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { CabinetConfig } from '../config/cabinet.config';
import { CabinetSessionService } from '../session/cabinet-session.service';
import { CabinetPasswordService } from '../session/cabinet-password.service';
import {
    clearRefreshCookie,
    readRefreshCookie,
    setRefreshCookie,
} from '../session/refresh-cookie';
import {
    CabinetForgotPasswordDto,
    CabinetLoginDto,
    CabinetOkDto,
    CabinetPasswordLinkStateDto,
    CabinetSessionDto,
    CabinetSetPasswordDto,
} from '../dto/cabinet-auth.dto';

/**
 * Вход в кабинет клиента с сайта (вне Битрикса). Регистрации нет: учётку
 * создают владелец портала или April, пароль задаётся по ссылке.
 * Access — в ответе (держать в памяти), refresh — httpOnly-cookie.
 * Во фрейме Битрикса эти ручки не нужны: там сессия фрейма.
 */
@ApiTags('Кабинет клиента: вход')
@Controller('cabinet/auth')
export class CabinetAuthController {
    constructor(
        private readonly sessions: CabinetSessionService,
        private readonly passwords: CabinetPasswordService,
        private readonly config: CabinetConfig,
    ) {}

    @Post('login')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Войти по email и паролю',
        description:
            'Проверяет пароль и наличие действующего доступа к порталу. Отдаёт access-токен; refresh-токен ставит в httpOnly-cookie (только для ручек входа). 10 неверных попыток за 15 минут — пауза.',
    })
    @ApiBody({ type: CabinetLoginDto, description: 'Email и пароль.' })
    @ApiOkResponse({ type: CabinetSessionDto, description: 'Вход выполнен.' })
    @ApiUnauthorizedResponse({ description: 'Неверный email или пароль.' })
    @ApiTooManyRequestsResponse({ description: 'Слишком много попыток.' })
    async login(
        @Body() dto: CabinetLoginDto,
        @Res({ passthrough: true }) res: Response,
    ): Promise<CabinetSessionDto> {
        const session = await this.sessions.login(dto.email, dto.password);
        setRefreshCookie(
            res,
            this.config,
            session.refreshToken,
            session.refreshExpiresAt,
        );
        return {
            accessToken: session.accessToken,
            accessExpiresAt: session.accessExpiresAt,
            userId: session.userId,
        };
    }

    @Post('refresh')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Обновить access-токен по refresh-cookie',
        description:
            'Refresh-токен из cookie гасится и выдаётся новая пара (ротация). Фронт сайта зовёт при загрузке страницы и перед истечением access.',
    })
    @ApiOkResponse({ type: CabinetSessionDto, description: 'Новая сессия.' })
    @ApiUnauthorizedResponse({ description: 'Нет cookie или сессия истекла.' })
    async refresh(
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ): Promise<CabinetSessionDto> {
        const token = readRefreshCookie(req);
        if (!token) {
            throw new UnauthorizedException('Сессия не найдена — войдите');
        }
        try {
            const session = await this.sessions.refresh(token);
            setRefreshCookie(
                res,
                this.config,
                session.refreshToken,
                session.refreshExpiresAt,
            );
            return {
                accessToken: session.accessToken,
                accessExpiresAt: session.accessExpiresAt,
                userId: session.userId,
            };
        } catch (error) {
            clearRefreshCookie(res, this.config);
            throw error;
        }
    }

    @Post('logout')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Выйти',
        description: 'Гасит refresh-токен из cookie и удаляет cookie.',
    })
    @ApiOkResponse({ type: CabinetOkDto, description: 'Выход выполнен.' })
    async logout(
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ): Promise<CabinetOkDto> {
        await this.sessions.logout(readRefreshCookie(req));
        clearRefreshCookie(res, this.config);
        return { ok: true };
    }

    @Post('forgot-password')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Восстановить пароль',
        description:
            'Если у email есть учётка с доступом к порталу — отправляет письмо со ссылкой (1 час). Ответ одинаковый в любом случае. 5 запросов в час на адрес.',
    })
    @ApiBody({ type: CabinetForgotPasswordDto, description: 'Email учётки.' })
    @ApiOkResponse({ type: CabinetOkDto, description: 'Запрос принят.' })
    @ApiTooManyRequestsResponse({ description: 'Слишком много запросов.' })
    async forgotPassword(
        @Body() dto: CabinetForgotPasswordDto,
    ): Promise<CabinetOkDto> {
        await this.passwords.requestReset(dto.email);
        return { ok: true };
    }

    @Get('password-link/:token')
    @ApiOperation({
        summary: 'Проверить ссылку установки пароля',
        description:
            'Для страницы «Задать пароль»: действует ли ссылка, для чего она и маска email. Токен не гасится.',
    })
    @ApiParam({
        name: 'token',
        description: 'Токен из ссылки.',
        example: '3f9a…c1',
    })
    @ApiOkResponse({
        type: CabinetPasswordLinkStateDto,
        description: 'Состояние ссылки.',
    })
    async inspectLink(
        @Param('token') token: string,
    ): Promise<CabinetPasswordLinkStateDto> {
        return this.passwords.inspect(token);
    }

    @Post('set-password')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Задать пароль по ссылке',
        description:
            'Гасит ссылку, сохраняет пароль (bcrypt), отмечает почту подтверждённой и завершает все прежние сессии входа с сайта.',
    })
    @ApiBody({ type: CabinetSetPasswordDto, description: 'Токен и пароль.' })
    @ApiOkResponse({ type: CabinetOkDto, description: 'Пароль сохранён.' })
    async setPassword(
        @Body() dto: CabinetSetPasswordDto,
    ): Promise<CabinetOkDto> {
        await this.passwords.setPassword(dto.token, dto.password);
        return { ok: true };
    }
}
