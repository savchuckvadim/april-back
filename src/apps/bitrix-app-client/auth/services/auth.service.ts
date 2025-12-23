import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { BitrixClientService } from "../../client/services/bitrix-client.service";
import { ClientRegistrationRequestDto, ClientResponseDto, LoginDto, LoginResponseCookieDto, LoginResponseDto } from "../dto/auth.dto";
import { JwtService } from "@nestjs/jwt";
import { MailConfirmationService } from "./mail.service";
import { UserService } from "../../user/services/user.service";
import { compare } from "@/lib/utils/crypt.util";
import { CookieService } from "@/core/cookie/cookie.service";
import { Response } from "express";
import { User } from "generated/prisma";
import { PortalStoreService } from "@/modules/portal-konstructor/portal/portal-store.service";

@Injectable()
export class AuthService {
    constructor(
        private readonly clientService: BitrixClientService,
        private readonly userService: UserService,
        private readonly portalService: PortalStoreService,
        private readonly jwtService: JwtService,
        private readonly mailer: MailConfirmationService,
        private readonly cookieService: CookieService,
    ) { }

    async registerClient(dto: ClientRegistrationRequestDto): Promise<ClientResponseDto> {
        // 1️⃣ Проверка, существует ли email
        const existingEmail = await this.clientService.findByEmail(dto.email);

        if (existingEmail) throw new BadRequestException('Email already registered');

        const existingUser = await this.userService.findUserByEmail(dto.email);


        if (existingUser) throw new BadRequestException('User with this email already registered');


        const existingPortal = await this.portalService.getPortalByDomain(dto.domain);


        //for prod
        // if (existingPortal) throw new BadRequestException('Portal with Domain already registered');
        const portalId = existingPortal?.id;
        // 2️⃣ Создаём клиента
        const client = await this.clientService.registrationClient(dto, Number(portalId));
        // const owner = await this.userService.createOwnerUser(Number(client.client.id), {
        //     name: dto.userName,
        //     surname: dto.userSurname,
        //     email: dto.email,
        //     password: dto.password,
        // });
        const owner = client.ownerUser;
        if (!owner) throw new BadRequestException('Owner did not created');
        // 3️⃣ Отправляем письмо подтверждения
        const token = this.jwtService.sign({ email: dto.email }, { expiresIn: '24h' });
        await this.mailer.sendEmailConfirmation(owner as User, token);

        return { id: Number(client.client.id), message: 'Client registered, please confirm email', client: client.clientDto, owner: this.userService.getUserDto(owner as User) ?? null };
    }

    async confirmClientEmail(token: string) {
        const { email } = this.jwtService.verify(token);
        const user = await this.userService.findUserByEmail(email);
        await this.userService.updateUserByEmail(email, {
            email_verified_at: new Date(),
        });
        await this.clientService.update(Number(user?.client_id ?? 0), {
            status: 'active',
            is_active: true,

        });
        return { message: 'Email confirmed successfully' };
    }

    async confirmUserEmail(token: string) {
        const { email } = this.jwtService.verify(token);

        await this.userService.updateUserByEmail(email, {
            email_verified_at: new Date(),
        });

        return { message: 'Email confirmed successfully' };
    }

    async login(dto: LoginDto): Promise<LoginResponseCookieDto> {
        const user = await this.userService.findUserByEmail(dto.email);
        const userDto = this.userService.getUserDto(user as User);
        if (!userDto) throw new UnauthorizedException('Invalid credentials');
        const valid = compare(dto.password, user?.password ?? '');
        if (!valid) throw new UnauthorizedException('Invalid credentials');
        const client = await this.clientService.findById(userDto.client_id);
        if (!client) throw new ForbiddenException('Client not found');
        if (!client?.is_active) throw new ForbiddenException('Client is inactive');

        const token = this.jwtService.sign({ sub: userDto.id, client_id: userDto.client_id });
        return { token, user: userDto, client };
    }


    async logout(user: any, res: Response) {
        // Если используем JWT — клиент просто забывает токен
        this.cookieService.clearAuthCookie(res);
        return { message: 'Logged out' };
    }

    async resendConfirmation(email: string) {
        const token = this.jwtService.sign({ email }, { expiresIn: '24h' });
        const user = await this.userService.findUserByEmail(email);
        if (!user) throw new NotFoundException('User not found');


        await this.mailer.sendEmailConfirmation(user, token);
        return { message: 'Confirmation email resent' };
    }

    generateToken(userId: number, clientId: number) {
        return this.jwtService.sign({ sub: userId, client_id: clientId });
    }

    verifyToken(token: string) {
        return this.jwtService.verify(token);
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

}
