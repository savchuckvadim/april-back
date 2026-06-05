import { Module } from '@nestjs/common';
import { BitrixImBotV2BotDomainModule } from './bot/bx-imbot-v2-bot.module';
import { BitrixImBotV2MessageDomainModule } from './message/bx-imbot-v2-message.module';
import { BitrixImBotV2CommandDomainModule } from './command/bx-imbot-v2-command.module';
import { BitrixImBotV2ChatDomainModule } from './chat/bx-imbot-v2-chat.module';
import { BitrixImBotV2FileDomainModule } from './file/bx-imbot-v2-file.module';
import { BitrixImBotV2EventDomainModule } from './event/bx-imbot-v2-event.module';
import { BitrixImBotV2RevisionDomainModule } from './revision/bx-imbot-v2-revision.module';

@Module({
    imports: [
        BitrixImBotV2BotDomainModule,
        BitrixImBotV2MessageDomainModule,
        BitrixImBotV2CommandDomainModule,
        BitrixImBotV2ChatDomainModule,
        BitrixImBotV2FileDomainModule,
        BitrixImBotV2EventDomainModule,
        BitrixImBotV2RevisionDomainModule,
    ],
    exports: [
        BitrixImBotV2BotDomainModule,
        BitrixImBotV2MessageDomainModule,
        BitrixImBotV2CommandDomainModule,
        BitrixImBotV2ChatDomainModule,
        BitrixImBotV2FileDomainModule,
        BitrixImBotV2EventDomainModule,
        BitrixImBotV2RevisionDomainModule,
    ],
})
export class BitrixImBotV2AggregateDomainModule {}
