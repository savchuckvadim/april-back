import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { QueueModule } from '@/modules/queue/queue.module';
import { WsModule } from '@/core/ws/ws.module';
import { PbxZprSmartModule } from '@lib/portal-lib/pbx/pbx-zpr-smart/pbx-zpr-smart.module';
import { PbxSmartItemFieldsModule } from '@lib/portal-lib/pbx/smart-item-fields';
import { SideFlowModule } from '../shared/side-flow';
import { ZprFlowUseCase } from './use-cases/zpr-flow.use-case';
import { ZprFlowProcessor } from './zpr-flow.processor';

/**
 * Сайд-flow ЗПР: отдельная очередь, свой воркер. Основной event-report
 * только ставит джобы (QueueDispatcherService) — см. zpr-flow.use-case.
 */
@Module({
    imports: [
        PBXModule,
        QueueModule,
        WsModule,
        PbxZprSmartModule,
        // Живые поля элемента: адреса портальной анкеты (UF-имя → camel-ключ).
        PbxSmartItemFieldsModule,
        // Общее с очередью презентаций: гейт повторной доставки джоба,
        // привязка элемента к задаче (UF_CRM_TASK) и дотяжка базовой сделки.
        SideFlowModule,
    ],
    providers: [ZprFlowUseCase, ZprFlowProcessor],
})
export class ZprFlowModule {}
