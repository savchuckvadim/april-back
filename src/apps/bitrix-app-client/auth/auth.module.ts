import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './services/auth.service';
import { ClientModule } from '../client/client.module';
import { UserModule } from '../user/user.module';
import { MailConfirmationService } from './services/mail.service';
import { AuthController } from './controllers/auth.controller';
import { CookieModule } from '@/core/cookie/cookie.module';
import { MailModule } from '@/modules/mail/mail.module';
import { PortalStoreModule } from '@/modules/portal-konstructor/portal/portal-store.module';
import { TokenModule } from './token/token.module';

@Module({
    imports: [
        CookieModule,
        ClientModule,
        UserModule,
        MailModule,
        PortalStoreModule,
        TokenModule,
        JwtModule.register({ global: true }),
    ],
    controllers: [AuthController],
    providers: [AuthService, MailConfirmationService],
    exports: [AuthService],
})
export class AuthModule {}
