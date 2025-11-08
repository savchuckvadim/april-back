import { AuthService } from "../services/auth.service";
import { Body, Controller, Get, Param, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ClientRegistrationRequestDto, ClientResponseDto, LoginDto, LoginResponseDto, LogoutResponseDto, MeResponseDto } from "../dto/auth.dto";
import { AuthGuard } from "../guard/jwt-auth.guard";
import { Response } from "express";
import { ConfigService } from "@nestjs/config";
import { SetAuthCookie } from "@/core/decorators/auth/set-auth-cookie.decorator";
import { UserResponseDto } from "../../user/dto/user-response.dto";


@ApiTags('Auth')
@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly configService: ConfigService
    ) { }


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
    @SetAuthCookie()
    async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<LoginResponseDto> {
        const { token, user, client } = await this.authService.login(dto);

        return { token, user, client };
    }

    @ApiOperation({ summary: 'Logout' })
    @ApiResponse({
        status: 200, description: 'Logged out', type: LogoutResponseDto
    })
    @Post('logout')
    @UseGuards(AuthGuard)
    async logout(@Req() req: any, @Res({ passthrough: true }) res: Response): Promise<LogoutResponseDto> {

        return this.authService.logout(req.user, res);
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

    @ApiOperation({ summary: 'Me' })
    @ApiResponse({
        status: 200, description: 'Current user', type: MeResponseDto
    })
    @Get('me')
    @UseGuards(AuthGuard)
    async me(@Req() req: any): Promise<MeResponseDto> {
        const user = await this.authService.validateUserById(req.user.id);
        if (!user) throw new UnauthorizedException('User not found');
        const client = await this.authService.validateClientById(req.user.client_id);
        if (!client) throw new UnauthorizedException('Client not found');
        return { user, client };
    }
}
