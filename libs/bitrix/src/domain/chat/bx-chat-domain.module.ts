import { Module } from '@nestjs/common';
import { BitrixRecentDomainModule } from './recent/bx-recent.module';
import { BitrixMessageDomainModule } from './message/bx-message.module';
import { BitrixDialogMessageDomainModule } from './dialog-message/bx-dialog-message.module';
import { BitrixImV2EventDomainModule } from './im-v2-event/bx-im-v2-event.module';
import { BitrixImV2ChatMessageDomainModule } from './im-v2-chat-message/bx-im-v2-chat-message.module';
@Module({
    imports: [
        BitrixRecentDomainModule,
        BitrixMessageDomainModule,
        BitrixDialogMessageDomainModule,
        BitrixImV2EventDomainModule,
        BitrixImV2ChatMessageDomainModule,
    ],
    exports: [
        BitrixRecentDomainModule,
        BitrixMessageDomainModule,
        BitrixDialogMessageDomainModule,
        BitrixImV2EventDomainModule,
        BitrixImV2ChatMessageDomainModule,
    ],
})
export class BitrixChatDomainModule {}
