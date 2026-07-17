import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailerModule } from '@nestjs-modules/mailer';

import { MailController } from './mail.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getMailerConfig } from '@lib/core/config/mail/mailer.config';
import { StorageModule } from '@lib/core/storage';
import { QueueModule } from '@lib/queue/queue.module';
import { MailQueueService } from './services/mail-queue.service';
import { MailProcessor } from './processors/mail.processor';
@Global()
@Module({
    imports: [
        MailerModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: getMailerConfig,
            inject: [ConfigService],
        }),
        QueueModule,
        StorageModule,
    ],
    providers: [MailService, MailQueueService, MailProcessor],
    exports: [MailService, MailQueueService],

    controllers: [MailController],
})
export class MailModule {}
