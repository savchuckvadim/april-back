import { Module } from '@nestjs/common';
import { BitrixRecentDomainModule } from './recent/bx-recent.module';
import { BitrixMessageDomainModule } from './message/bx-message.module';
import { BitrixDialogMessageDomainModule } from './dialog-message/bx-dialog-message.module';
import { BitrixImV2EventDomainModule } from './im-v2-event/bx-im-v2-event.module';
@Module({
    imports: [
        BitrixRecentDomainModule,
        BitrixMessageDomainModule,
        BitrixDialogMessageDomainModule,
        BitrixImV2EventDomainModule,
    ],
    exports: [
        BitrixRecentDomainModule,
        BitrixMessageDomainModule,
        BitrixDialogMessageDomainModule,
        BitrixImV2EventDomainModule,
    ],
})
export class BitrixChatDomainModule {}
