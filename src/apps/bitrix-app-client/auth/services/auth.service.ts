import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { BitrixClientService } from '../../client/services/bitrix-client.service';
import {
    ClientRegistrationRequestDto,
    ClientAuthResponseDto,
    LoginDto,
    AuthResponseDto,
} from '../dto/auth.dto';
import { JwtService } from '@nestjs/jwt';
import { MailConfirmationService } from './mail.service';
import { UserService } from '../../user/services/user.service';
import { compare } from '@/lib/utils/crypt.util';
import { CookieService } from '@/core/cookie/cookie.service';
import { Response } from 'express';
import { User } from 'generated/prisma';
import { PortalStoreService } from '@/modules/portal-konstructor/portal/portal-store.service';
import { TokenService } from '../token/token.service';
import { jwtConstants } from '../constants/jwt.constants';

@Injectable()
export class AuthService {
    constructor(
        private readonly clientService: BitrixClientService,
        private readonly userService: UserService,
        private readonly portalService: PortalStoreService,
        private readonly jwtService: JwtService,
        private readonly mailer: MailConfirmationService,
        private readonly cookieService: CookieService,
        private readonly tokenService: TokenService,
    ) {}

    async registerClient(
        dto: ClientRegistrationRequestDto,
    ): Promise<ClientAuthResponseDto> {
        const existingEmail = await this.clientService.findByEmail(dto.email);
        if (existingEmail)
            throw new BadRequestException('Email already registered');

        const existingUser = await this.userService.findUserByEmail(dto.email);
        if (existingUser)
            throw new BadRequestException(
                'User with this email already registered',
            );

        const existingPortal = await this.portalService.getPortalByDomain(
            dto.domain,
        );

        const portalId = existingPortal?.id;
        const client = await this.clientService.registrationClient(
            dto,
            Number(portalId),
        );

        const owner = client.ownerUser;
        if (!owner) throw new BadRequestException('Owner did not created');

        const token = this.jwtService.sign(
            { email: dto.email },
            { secret: jwtConstants.accessSecret, expiresIn: '24h' },
        );
        await this.mailer.sendEmailConfirmation(owner, token);

        return {
            id: Number(client.client.id),
            message: 'Client registered, please confirm email',
            client: client.clientDto,
            owner: this.userService.getUserDto(owner) ?? null,
        };
    }

    async confirmClientEmail(token: string) {
        const payload = this.jwtService.verify<{ email: string }>(token, {
            secret: jwtConstants.accessSecret,
        });
        const user = await this.userService.findUserByEmail(payload.email);
        await this.userService.updateUserByEmail(payload.email, {
            email_verified_at: new Date(),
        });
        await this.clientService.update(Number(user?.client_id ?? 0), {
            status: 'active',
            is_active: true,
        });
        return { message: 'Email confirmed successfully' };
    }

    async confirmUserEmail(token: string) {
        const payload = this.jwtService.verify<{ email: string }>(token, {
            secret: jwtConstants.accessSecret,
        });
        await this.userService.updateUserByEmail(payload.email, {
            email_verified_at: new Date(),
        });
        return { message: 'Email confirmed successfully' };
    }

    async login(dto: LoginDto, res: Response): Promise<AuthResponseDto> {
        const user = await this.userService.findUserByEmail(dto.email);
        const userDto = this.userService.getUserDto(user as User);
        if (!userDto) throw new UnauthorizedException('Invalid credentials');

        const valid = compare(dto.password, user?.password ?? '');
        if (!valid) throw new UnauthorizedException('Invalid credentials');

        const client = await this.clientService.findById(userDto.client_id);
        if (!client) throw new ForbiddenException('Client not found');
        if (!client?.is_active)
            throw new ForbiddenException('Client is inactive');

        await this.issueTokens(res, userDto.id, userDto.client_id);

        return { user: userDto, client };
    }

    async refresh(
        jwtPayload: { sub: number; client_id: number },
        oldRefreshToken: string,
        res: Response,
    ): Promise<AuthResponseDto> {
        await this.tokenService.revokeRefreshToken(oldRefreshToken);

        const userDto = await this.userService.findUserById(jwtPayload.sub);
        // const userDto = this.userService.getUserDto(user as User);
        if (!userDto) throw new UnauthorizedException('User not found');

        const client = await this.clientService.findById(jwtPayload.client_id);
        if (!client) throw new ForbiddenException('Client not found');

        await this.issueTokens(res, userDto.id, userDto.client_id);

        return { user: userDto, client };
    }

    async logout(
        user: { sub: number },
        refreshToken: string | undefined,
        res: Response,
    ) {
        if (refreshToken) {
            await this.tokenService.revokeRefreshToken(refreshToken);
        } else {
            await this.tokenService.revokeAllUserTokens(user.sub);
        }
        this.cookieService.clearAuthCookies(res);
        return { message: 'Logged out' };
    }

    async resendConfirmation(email: string) {
        const token = this.jwtService.sign(
            { email },
            { secret: jwtConstants.accessSecret, expiresIn: '24h' },
        );
        const user = await this.userService.findUserByEmail(email);
        if (!user) throw new NotFoundException('User not found');

        await this.mailer.sendEmailConfirmation(user, token);
        return { message: 'Confirmation email resent' };
    }

    generateToken(userId: number, clientId: number) {
        return this.generateAccessToken(userId, clientId);
    }

    verifyToken(token: string): { sub: number; client_id: number } {
        return this.jwtService.verify<{ sub: number; client_id: number }>(
            token,
            { secret: jwtConstants.accessSecret },
        );
    }

    async validateUserById(userId: number) {
        return await this.userService.findUserById(userId);
    }

    async validateClientById(clientId: number) {
        return await this.clientService.findById(clientId);
    }

    async deleteClient(clientId: number) {
        return await this.clientService.delete(clientId);
    }

    async deleteUser(userId: number) {
        return await this.userService.deleteUser(userId);
    }

    async getAllClients() {
        return await this.clientService.findMany();
    }

    async getClientsUsers(clientId: number) {
        return await this.userService.findUsersByClientId(clientId);
    }

    private generateAccessToken(userId: number, clientId: number): string {
        return this.jwtService.sign(
            { sub: userId, client_id: clientId },
            {
                secret: jwtConstants.accessSecret,
                expiresIn: jwtConstants.accessExpiresIn,
            },
        );
    }

    private generateRefreshJwt(userId: number, clientId: number): string {
        return this.jwtService.sign(
            { sub: userId, client_id: clientId },
            {
                secret: jwtConstants.refreshSecret,
                expiresIn: jwtConstants.refreshExpiresIn,
            },
        );
    }

    private async issueTokens(
        res: Response,
        userId: number,
        clientId: number,
    ): Promise<void> {
        const accessToken = this.generateAccessToken(userId, clientId);
        const refreshJwt = this.generateRefreshJwt(userId, clientId);

        await this.tokenService.saveRefreshToken(
            userId,
            refreshJwt,
            jwtConstants.refreshTtlDays,
        );

        this.cookieService.setAuthCookies(res, accessToken, refreshJwt);
    }
}
