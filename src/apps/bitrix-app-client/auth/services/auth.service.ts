import { PrismaService } from "@/core/prisma/prisma.service";
import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { BitrixClientService } from "../../client/services/bitrix-client.service";
import { ClientRegistrationRequestDto, ClientResponseDto, LoginDto, LoginResponseCookieDto, LoginResponseDto } from "../dto/auth.dto";
import { JwtService } from "@nestjs/jwt";
import { MailService } from "./mail.service";
import { UserService } from "../../user/services/user.service";
import { compare } from "@/lib/utils/crypt.util";

@Injectable()
export class AuthService {
    constructor(
        private readonly clientService: BitrixClientService,
        private readonly userService: UserService,
        private readonly jwtService: JwtService,
        private readonly mailer: MailService,
    ) { }

    async registerClient(dto: ClientRegistrationRequestDto): Promise<ClientResponseDto> {
        // 1️⃣ Проверка, существует ли email
        const existingEmail = await this.clientService.findByEmail(dto.email);
        if (existingEmail) throw new BadRequestException('Email already registered');
        const existingUser = await this.userService.findUserByEmail(dto.email);
        if (existingUser) throw new BadRequestException('Domain already registered');

        // 2️⃣ Создаём клиента
        const client = await this.clientService.registrationClient(dto);
        const owner = await this.userService.createOwnerUser(client.client.id, {
            name: dto.userName,
            surname: dto.userSurname,
            email: dto.email,
            password: dto.password,
        });
        // 3️⃣ Отправляем письмо подтверждения
        const token = this.jwtService.sign({ email: dto.email }, { expiresIn: '24h' });
        await this.mailer.sendEmailConfirmation(dto.email, token);

        return { message: 'Client registered, please confirm email', client: client.client, owner: owner ?? null };
    }

    async confirmClientEmail(token: string) {
        const { email } = this.jwtService.verify(token);
        const user = await this.userService.findUserByEmail(email);
        await this.userService.updateUserByEmail(email, {
            email_verified_at: new Date(),
        });
        await this.clientService.update(user?.client_id ?? 0, {
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
        if (!user) throw new UnauthorizedException('Invalid credentials');
        const valid = compare(dto.password, user?.password ?? '');
        if (!valid) throw new UnauthorizedException('Invalid credentials');
        const client = await this.clientService.findById(user.client_id);
        if (!client) throw new ForbiddenException('Client not found');
        if (!client?.is_active) throw new ForbiddenException('Client is inactive');

        const token = this.jwtService.sign({ sub: user.id, client_id: user.client_id });
        return { token, user, client };
    }

    async logout(user: any) {
        // Если используем JWT — клиент просто забывает токен
        // Если используем Sanctum-style токены — удаляем из таблицы tokens
        return { message: 'Logged out' };
    }

    async resendConfirmation(email: string) {
        const token = this.jwtService.sign({ email }, { expiresIn: '24h' });
        await this.mailer.sendEmailConfirmation(email, token);
        return { message: 'Confirmation email resent' };
    }

    generateToken(userId: number, clientId: number) {
        return this.jwtService.sign({ sub: userId, client_id: clientId });
    }

    verifyToken(token: string) {
        return this.jwtService.verify(token);
    }


}
