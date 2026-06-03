import { AuthService } from '../services/auth.service';
import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
    ClientRegistrationRequestDto,
    ClientAuthResponseDto,
    ForgotPasswordDto,
    GetAllClientsUsersDto,
    LoginDto,
    AuthResponseDto,
    LogoutResponseDto,
    MeResponseDto,
    ResendConfirmationDto,
    ResetPasswordDto,
    ResetPasswordTokenStatusDto,
} from '../dto/auth.dto';
import { AuthGuard } from '../guard/jwt-auth.guard';
import { RefreshGuard } from '../guard/jwt-refresh.guard';
import { Response } from 'express';
import { UserResponseDto } from '../../user/dto/user-response.dto';
import { UserService } from '../../user/services/user.service';
import { PortalStoreService } from '@/modules/portal-konstructor/portal/portal-store.service';
import { AuthRequest } from '../interfaces/auth-request.interface';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly userService: UserService,
        private readonly portalService: PortalStoreService,
    ) {}

    @ApiOperation({ summary: 'Register new client' })
    @ApiResponse({
        status: 200,
        description: 'Client registered',
        type: ClientAuthResponseDto,
    })
    @Post('register-client')
    async registerClient(
        @Body() dto: ClientRegistrationRequestDto,
    ): Promise<ClientAuthResponseDto> {
        return await this.authService.registerClient(dto);
    }

    @ApiOperation({
        summary: 'Login — sets httpOnly cookies (access + refresh)',
    })
    @ApiResponse({
        status: 200,
        description: 'Logged in, cookies set',
        type: AuthResponseDto,
    })
    @Post('login')
    async login(
        @Body() dto: LoginDto,
        @Res({ passthrough: true }) res: Response,
    ): Promise<AuthResponseDto> {
        return await this.authService.login(dto, res);
    }

    @ApiOperation({ summary: 'Refresh tokens — rotates both cookies' })
    @ApiResponse({
        status: 200,
        description: 'Tokens refreshed',
        type: AuthResponseDto,
    })
    @Post('refresh')
    @UseGuards(RefreshGuard)
    async refresh(
        @Req() req: AuthRequest,
        @Res({ passthrough: true }) res: Response,
    ): Promise<AuthResponseDto> {
        return await this.authService.refresh(
            req.user,
            req.refreshToken ?? '',
            res,
        );
    }

    @ApiOperation({ summary: 'Logout — clears cookies, revokes refresh' })
    @ApiResponse({
        status: 200,
        description: 'Logged out',
        type: LogoutResponseDto,
    })
    @Post('logout')
    @UseGuards(AuthGuard)
    async logout(
        @Req() req: AuthRequest,
        @Res({ passthrough: true }) res: Response,
    ): Promise<LogoutResponseDto> {
        const refreshToken = req.cookies?.refresh_token as string | undefined;
        return await this.authService.logout(req.user, refreshToken, res);
    }

    @ApiOperation({ summary: 'Confirm email' })
    @ApiResponse({
        status: 200,
        description: 'Email confirmed',
        type: LogoutResponseDto,
    })
    @Get('confirm/:token')
    async confirmEmail(
        @Param('token') token: string,
    ): Promise<LogoutResponseDto> {
        return this.authService.confirmClientEmail(token);
    }

    @ApiOperation({
        summary: 'Resend email confirmation link',
        description:
            'Повторно отправляет письмо с подтверждением email для пользователя, который еще не завершил подтверждение почты.',
    })
    @ApiResponse({
        status: 200,
        description: 'Confirmation resent',
        type: LogoutResponseDto,
    })
    @Post('resend-confirmation')
    async resendConfirmation(
        @Body() dto: ResendConfirmationDto,
    ): Promise<LogoutResponseDto> {
        return this.authService.resendConfirmation(dto.email);
    }

    @ApiOperation({ summary: 'Request password reset email' })
    @ApiResponse({
        status: 200,
        description: 'Password reset email requested',
        type: LogoutResponseDto,
    })
    @Post('forgot-password')
    async forgotPassword(
        @Body() dto: ForgotPasswordDto,
    ): Promise<LogoutResponseDto> {
        return this.authService.requestPasswordReset(dto.email);
    }

    @ApiOperation({ summary: 'Validate password reset token' })
    @ApiResponse({
        status: 200,
        description: 'Password reset token status',
        type: ResetPasswordTokenStatusDto,
    })
    @Get('reset-password/validate/:token')
    async validateResetPasswordToken(
        @Param('token') token: string,
    ): Promise<ResetPasswordTokenStatusDto> {
        return this.authService.validatePasswordResetToken(token);
    }

    @ApiOperation({ summary: 'Reset password using token' })
    @ApiResponse({
        status: 200,
        description: 'Password updated successfully',
        type: LogoutResponseDto,
    })
    @Post('reset-password')
    async resetPassword(
        @Body() dto: ResetPasswordDto,
    ): Promise<LogoutResponseDto> {
        return this.authService.resetPassword(dto);
    }

    @ApiOperation({ summary: 'Get current user and client' })
    @ApiResponse({
        status: 200,
        description: 'Current user',
        type: MeResponseDto,
    })
    @Get('me')
    @UseGuards(AuthGuard)
    async me(@Req() req: AuthRequest): Promise<MeResponseDto> {
        return await this.authService.getMe(req.user.sub, req.user.client_id);
    }

    @ApiOperation({ summary: 'Delete client' })
    @ApiResponse({
        status: 200,
        description: 'Client deleted',
        type: LogoutResponseDto,
    })
    @Delete('delete-client/:id')
    @UseGuards(AuthGuard)
    async deleteClient(@Param('id') id: number): Promise<LogoutResponseDto> {
        await this.authService.deleteClient(id);
        return { message: 'Client deleted' };
    }

    @ApiOperation({ summary: 'Delete user' })
    @ApiResponse({
        status: 200,
        description: 'User deleted',
        type: LogoutResponseDto,
    })
    @Delete('delete-user/:id')
    @UseGuards(AuthGuard)
    async deleteUser(@Param('id') id: number): Promise<LogoutResponseDto> {
        await this.authService.deleteUser(id);
        return { message: 'User deleted' };
    }

    @ApiOperation({ summary: 'Get all clients' })
    @ApiResponse({
        status: 200,
        description: 'Clients found',
        type: [ClientAuthResponseDto],
    })
    @Get('get-all-clients')
    @UseGuards(AuthGuard)
    async getAllClients(): Promise<ClientAuthResponseDto[]> {
        const data = await this.authService.getAllClients();
        return data.map(client => {
            return {
                id: Number(client.id),
                name: client.name,
                email: client.email,
                message: 'Client found',
                client: client,
                owner: null,
            };
        });
    }

    @ApiOperation({ summary: 'Get all clients users' })
    @ApiResponse({
        status: 200,
        description: 'Clients found',
        type: [ClientAuthResponseDto],
    })
    @Post('get-all-clients-users')
    @UseGuards(AuthGuard)
    async getAllClientsUsers(
        @Body() dto: GetAllClientsUsersDto,
    ): Promise<UserResponseDto[]> {
        const data = await this.authService.getClientsUsers(dto.clientId);
        return data;
    }

    @ApiOperation({ summary: 'Get all users' })
    @ApiResponse({
        status: 200,
        description: 'Users found',
        type: [UserResponseDto],
    })
    @Get('get-all-users')
    @UseGuards(AuthGuard)
    async getAllUsers(): Promise<UserResponseDto[]> {
        const data = await this.userService.findAllUsers();
        return data;
    }

    @ApiOperation({ summary: 'Get all portals' })
    @Get('get-all-portals')
    @UseGuards(AuthGuard)
    async getAllPortals(): Promise<any[] | null> {
        const data = await this.portalService.getPortals();
        return data;
    }
}
