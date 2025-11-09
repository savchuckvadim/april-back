// auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './services/auth.service';
import { ClientModule } from '../client/client.module';
import { UserModule } from '../user/user.module';
import { MailConfirmationService } from './services/mail.service';
import { AuthController } from './controllers/auth.controller';
import { CookieModule } from '@/core/cookie/cookie.module';
import { MailModule } from '@/modules/mail/mail.module';

@Module({
    imports: [
        CookieModule,
        ClientModule,
        UserModule,
        MailModule,
        JwtModule.register({
            global: true,
            secret: process.env.APP_SECRET_KEY || 'super-secret', // секрет для подписи
            signOptions: { expiresIn: '60s' }, // || '24h' токен живёт 24 часа
        }),
    ],
    controllers: [AuthController],
    providers: [
        AuthService,
        MailConfirmationService
    ],
    exports: [
        AuthService,
    ],
})
export class AuthModule { }
