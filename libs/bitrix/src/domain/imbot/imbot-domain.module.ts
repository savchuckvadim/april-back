import { Module } from '@nestjs/common';
import { BitrixImBotDomainModule } from './bot/bx-imbot-bot.module';
import { BitrixImBotMessageDomainModule } from './message/bx-imbot-message.module';
import { BitrixImBotCommandDomainModule } from './command/bx-imbot-command.module';
import { BitrixImBotChatDomainModule } from './chat/bx-imbot-chat.module';
import { BitrixImBotDialogDomainModule } from './dialog/bx-imbot-dialog.module';

@Module({
    imports: [
        BitrixImBotDomainModule,
        BitrixImBotMessageDomainModule,
        BitrixImBotCommandDomainModule,
        BitrixImBotChatDomainModule,
        BitrixImBotDialogDomainModule,
    ],
    exports: [
        BitrixImBotDomainModule,
        BitrixImBotMessageDomainModule,
        BitrixImBotCommandDomainModule,
        BitrixImBotChatDomainModule,
        BitrixImBotDialogDomainModule,
    ],
})
export class BitrixImBotAggregateDomainModule {}
