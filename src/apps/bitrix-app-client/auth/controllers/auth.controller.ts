import { AuthService } from "../services/auth.service";
import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ClientRegistrationRequestDto, ClientResponseDto, LoginDto, LoginResponseDto, LogoutResponseDto } from "../dto/auth.dto";
import { AuthGuard } from "../guard/jwt.guard";
import { Response } from "express";


@ApiTags('Auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }


    @ApiOperation({ summary: 'Register new client' })
    @ApiResponse({
        status: 200, description: 'Client registered', type: ClientResponseDto
    })
    @Post('register-client')
    async registerClient(@Body() dto: ClientRegistrationRequestDto): Promise<ClientResponseDto> {
        return await this.authService.registerClient(dto);
    }
    @ApiOperation({ summary: 'Login' })
    @ApiResponse({

        status: 200, description: 'Logged in', type: LoginResponseDto
    })
    @Post('login')
    async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<LoginResponseDto> {
        const { token, user, client } = await this.authService.login(dto);
        // ✅ Устанавливаем cookie
        res.cookie('access_token', token, {
            // httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            // sameSite: 'none',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 дней
        });
        return {  user, client };
    }

    @ApiOperation({ summary: 'Logout' })
    @ApiResponse({
        status: 200, description: 'Logged out', type: LogoutResponseDto
    })
    @Post('logout')
    @UseGuards(AuthGuard)
    async logout(@Req() req: any): Promise<LogoutResponseDto> {
        return this.authService.logout(req.user);
    }

    @ApiOperation({ summary: 'Confirm email' })
    @ApiResponse({
        status: 200, description: 'Email confirmed', type: LogoutResponseDto
    })
    @Get('confirm/:token')
    async confirmEmail(@Param('token') token: string): Promise<LogoutResponseDto> {
        return this.authService.confirmClientEmail(token);
    }

    @ApiOperation({ summary: 'Resend confirmation' })
    @ApiResponse({
        status: 200, description: 'Confirmation resent', type: LogoutResponseDto
    })
    @Post('resend-confirmation')
    async resendConfirmation(@Body('email') email: string): Promise<LogoutResponseDto> {
        return this.authService.resendConfirmation(email);
    }
}
