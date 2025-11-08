import { Module } from '@nestjs/common';
import { BitrixRecentDomainModule } from './recent/bx-recent.module';
import { BitrixMessageDomainModule } from './message/bx-message.module';
@Module({
    imports: [
        BitrixRecentDomainModule,
        BitrixMessageDomainModule,
    ],
    exports: [
        BitrixRecentDomainModule,
        BitrixMessageDomainModule,
    ],
})
export class BitrixChatDomainModule { }
