import { Module } from '@nestjs/common';
import { SkapRunNotifierService } from './skap-run-notifier.service';

/** Оповещения о результатах прогонов СКАП (Telegram-дайджест + im-notify). */
@Module({
    providers: [SkapRunNotifierService],
    exports: [SkapRunNotifierService],
})
export class SkapNotifyModule {}
