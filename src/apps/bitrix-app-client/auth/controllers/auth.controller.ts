import { AuthService } from "../services/auth.service";
import { Body, Controller, Delete, Get, Param, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ClientRegistrationRequestDto, ClientAuthResponseDto, GetAllClientsUsersDto, LoginDto, LoginResponseDto, LogoutResponseDto, MeResponseDto } from "../dto/auth.dto";
import { AuthGuard } from "../guard/jwt-auth.guard";
import { Response } from "express";
import { ConfigService } from "@nestjs/config";
import { SetAuthCookie } from "@/core/decorators/auth/set-auth-cookie.decorator";
import { UserResponseDto } from "../../user/dto/user-response.dto";
import { UserService } from "../../user/services/user.service";
import { PortalStoreService } from "@/modules/portal-konstructor/portal/portal-store.service";


@ApiTags('Auth')
@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly configService: ConfigService,
        private readonly userService: UserService,
        private readonly portalService: PortalStoreService
    ) { }


    @ApiOperation({ summary: 'Register new client' })
    @ApiResponse({
        status: 200, description: 'Client registered', type: ClientAuthResponseDto
    })
    @Post('register-client')
    async registerClient(@Body() dto: ClientRegistrationRequestDto): Promise<ClientAuthResponseDto> {
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
        const user = await this.authService.validateUserById(req.user.sub);
        if (!user) throw new UnauthorizedException('User not found');
        const client = await this.authService.validateClientById(req.user.client_id);
        if (!client) throw new UnauthorizedException('Client not found');
        return { user, client };
    }

    @ApiOperation({ summary: 'Delete client' })
    @ApiResponse({
        status: 200, description: 'Client deleted', type: LogoutResponseDto
    })
    @Delete('delete-client/:id')
    async deleteClient(@Param('id') id: number): Promise<LogoutResponseDto> {
        this.authService.deleteClient(id);
        return { message: 'Client deleted' };
    }

    @ApiOperation({ summary: 'Delete user' })
    @ApiResponse({
        status: 200, description: 'User deleted', type: LogoutResponseDto
    })
    @Delete('delete-user/:id')
    async deleteUser(@Param('id') id: number): Promise<LogoutResponseDto> {
        this.authService.deleteUser(id);
        return { message: 'User deleted' };
    }
    @ApiOperation({ summary: 'Get all clients' })
    @ApiResponse({
        status: 200, description: 'Clients found', type: [ClientAuthResponseDto]
    })
    @Get('get-all-clients')
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
            }
        });
    }


    @ApiOperation({ summary: 'Get all clients users' })
    @ApiResponse({
        status: 200, description: 'Clients found', type: [ClientAuthResponseDto]
    })
    @Post('get-all-clients-users')
    async getAllClientsUsers(@Body() dto: GetAllClientsUsersDto): Promise<UserResponseDto[]> {
        const data = await this.authService.getClientsUsers(dto.clientId);
        return data;
    }


    @ApiOperation({ summary: 'Get all clients users' })
    @ApiResponse({
        status: 200, description: 'Clients found', type: [ClientAuthResponseDto]
    })
    @Get('get-all-users')
    async getAllUsers(): Promise<UserResponseDto[]> {
        const data = await this.userService.findAllUsers();
        return data;
    }


    @ApiOperation({ summary: 'Get all clients portls' })
    @Get('get-all-portls')
    async getAllPortals(): Promise<any[] | null> {
        const data = await this.portalService.getPortals();
        return data;
    }
}
