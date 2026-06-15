import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { AuthService } from '../services/auth.service';
import { Public } from '../decorators/public.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { LoginDto } from '../dto/login.dto';
import { AuthResponseDto, AuthUserDto } from '../dto/auth-response.dto';
import { AuthUser } from '../types/auth-user.interface';

/**
 * Эндпоинты авторизации: вход SuperUser и получение текущего субъекта.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Public()
    @Post('login')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Вход администратора',
        description:
            'Проверяет логин/пароль SuperUser (из .env) и возвращает access-токен (JWT).',
    })
    @ApiBody({
        type: LoginDto,
        description: 'Учётные данные администратора.',
    })
    @ApiOkResponse({
        type: AuthResponseDto,
        description: 'Вход выполнен: выдан access-токен и данные субъекта.',
    })
    async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
        return this.authService.login(dto);
    }

    @Get('me')
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Текущий субъект',
        description:
            'Возвращает данные аутентифицированного субъекта по переданному Bearer-токену.',
    })
    @ApiOkResponse({
        type: AuthUserDto,
        description: 'Данные текущего аутентифицированного субъекта.',
    })
    getMe(@CurrentUser() user: AuthUser): AuthUserDto {
        return this.authService.getMe(user);
    }
}
