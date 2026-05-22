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
    MeResponseDto,
    ResetPasswordDto,
    ResetPasswordTokenStatusDto,
} from '../dto/auth.dto';
import { MailConfirmationService } from './mail.service';
import { UserService } from '../../user/services/user.service';
import { compare } from '@/shared/lib/utils/crypt.util';
import { CookieService } from '@/core/cookie/cookie.service';
import { Response } from 'express';
import { User } from 'generated/prisma';
import { PortalStoreService } from '@/modules/portal-konstructor/portal/portal-store.service';
import { TokenService } from '../token/token.service';
import { jwtConstants } from '../constants/jwt.constants';
import { AuthJwtService } from './auth-jwt.service';
import { AuthJwtPayload } from '../interfaces/auth-jwt-payload.interface';

@Injectable()
export class AuthService {
    constructor(
        private readonly clientService: BitrixClientService,
        private readonly userService: UserService,
        private readonly portalService: PortalStoreService,
        private readonly authJwtService: AuthJwtService,
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

        const token = this.authJwtService.signEmailConfirmationToken(dto.email);
        const portal = await this.portalService.getAuthRootPortalByClientId(
            Number(client.client.id),
        );
        await this.mailer.sendEmailConfirmation(owner, token);

        return {
            id: Number(client.client.id),
            message: 'Client registered, please confirm email',
            client: client.clientDto,
            owner: this.userService.getUserDto(owner) ?? null,
            portal: portal,
        };
    }

    async confirmClientEmail(token: string) {
        const payload = this.authJwtService.verifyEmailConfirmationToken(token);
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
        const payload = this.authJwtService.verifyEmailConfirmationToken(token);
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

        const portalDto = await this.portalService.getAuthRootPortalByClientId(
            userDto.client_id,
        );
        if (!portalDto) {
            throw new ForbiddenException('Portal not found');
        }
        if (portalDto.domain !== dto.domain) {
            throw new ForbiddenException('Не верный domain');
        }

        await this.issueTokens(res, userDto.id, userDto.client_id);

        return {
            user: userDto,
            client,
            portal: portalDto,
        };
    }
    async getMe(userId: number, clientId: number): Promise<MeResponseDto> {
        const user = await this.validateUserById(userId);
        if (!user) throw new UnauthorizedException('User not found');
        const client = await this.validateClientById(clientId);
        if (!client) throw new UnauthorizedException('Client not found');
        const portal =
            await this.portalService.getAuthRootPortalByClientId(clientId);

        return { user, client, portal };
    }

    async refresh(
        jwtPayload: AuthJwtPayload,
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
        const portal = await this.portalService.getAuthRootPortalByClientId(
            userDto.client_id,
        );
        return { user: userDto, client, portal };
    }

    async logout(
        user: Pick<AuthJwtPayload, 'sub'>,
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
        const token = this.authJwtService.signEmailConfirmationToken(email);
        const user = await this.userService.findUserByEmail(email);
        if (!user) throw new NotFoundException('User not found');

        await this.mailer.sendEmailConfirmation(user, token);
        return { message: 'Confirmation email resent' };
    }

    async requestPasswordReset(email: string) {
        const user = await this.userService.findUserByEmail(email);

        if (user?.email) {
            const resetToken =
                this.tokenService.generatePasswordResetTokenString();
            await this.tokenService.savePasswordResetToken(
                Number(user.id),
                resetToken,
                jwtConstants.passwordResetTtlMinutes,
            );
            await this.mailer.sendPasswordReset(user, resetToken);
        }

        return {
            message:
                'If an account with this email exists, password reset instructions have been sent',
        };
    }

    async validatePasswordResetToken(
        token: string,
    ): Promise<ResetPasswordTokenStatusDto> {
        const userId =
            await this.tokenService.validatePasswordResetToken(token);
        return { valid: userId !== null };
    }

    async resetPassword(dto: ResetPasswordDto) {
        const userId = await this.tokenService.consumePasswordResetToken(
            dto.token,
        );

        if (!userId) {
            throw new UnauthorizedException('Invalid or expired reset token');
        }

        await this.userService.updateUser(userId, {
            password: dto.password,
        });
        await this.tokenService.revokeAllUserTokens(userId);
        await this.tokenService.revokeAllPasswordResetTokens(userId);

        return { message: 'Password updated successfully' };
    }

    generateToken(userId: number, clientId: number) {
        return this.authJwtService.signAccessToken(userId, clientId);
    }

    verifyToken(token: string): Promise<AuthJwtPayload> {
        return this.authJwtService.verifyAccessToken(token);
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

    private async issueTokens(
        res: Response,
        userId: number,
        clientId: number,
    ): Promise<void> {
        const accessToken = this.authJwtService.signAccessToken(
            userId,
            clientId,
        );
        const refreshJwt = this.authJwtService.signRefreshToken(
            userId,
            clientId,
        );

        await this.tokenService.saveRefreshToken(
            userId,
            refreshJwt,
            jwtConstants.refreshTtlDays,
        );

        this.cookieService.setAuthCookies(res, accessToken, refreshJwt);
    }
}
