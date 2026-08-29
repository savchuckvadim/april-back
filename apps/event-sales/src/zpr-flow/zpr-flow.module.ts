import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { QueueModule } from '@/modules/queue/queue.module';
import { WsModule } from '@/core/ws/ws.module';
import { PbxZprSmartModule } from '@lib/portal-lib/pbx/pbx-zpr-smart/pbx-zpr-smart.module';
import { PbxSmartItemFieldsModule } from '@lib/portal-lib/pbx/smart-item-fields';
import { SideFlowModule } from '../shared/side-flow';
import { ZprFlowService } from './zpr-flow.service';
import { ZprFlowProcessor } from './zpr-flow.processor';

/**
 * Сайд-flow ЗПР: отдельная очередь, свой воркер. Основной event-report
 * только ставит джобы (QueueDispatcherService) — см. zpr-flow.service.
 */
@Module({
    imports: [
        PBXModule,
        QueueModule,
        WsModule,
        PbxZprSmartModule,
        // Живые поля элемента: адреса портальной анкеты (UF-имя → camel-ключ).
        PbxSmartItemFieldsModule,
        // Гейт повторной доставки джоба — общий с очередью презентаций.
        SideFlowModule,
    ],
    providers: [ZprFlowService, ZprFlowProcessor],
})
export class ZprFlowModule {}
