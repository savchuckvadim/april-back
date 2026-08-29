import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { QueueModule } from '@/modules/queue/queue.module';
import { WsModule } from '@/core/ws/ws.module';
import { PbxPresentationSmartModule } from '@lib/portal-lib/pbx/pbx-presentation-smart/pbx-presentation-smart.module';
import { PbxSmartItemFieldsModule } from '@lib/portal-lib/pbx/smart-item-fields';
import { SideFlowModule } from '../shared/side-flow';
import { PresentationFlowService } from './presentation-flow.service';
import { PresentationFlowProcessor } from './presentation-flow.processor';

/**
 * Сайд-flow презентаций: отдельная очередь, свой воркер. Основной
 * event-report только ставит джобы (QueueDispatcherService) — см.
 * presentation-flow.service. Сделки «ОП Презентации» продолжают работать
 * как раньше, смарт живёт параллельно.
 */
@Module({
    imports: [
        PBXModule,
        QueueModule,
        WsModule,
        PbxPresentationSmartModule,
        // Живые поля элемента: адреса портальной анкеты (UF-имя → camel-ключ).
        PbxSmartItemFieldsModule,
        // Гейт повторной доставки джоба — общий с очередью ЗПР.
        SideFlowModule,
    ],
    providers: [PresentationFlowService, PresentationFlowProcessor],
})
export class PresentationFlowModule {}
