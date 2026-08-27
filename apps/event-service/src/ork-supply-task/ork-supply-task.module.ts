import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx';
import { QueueModule } from '@lib/queue/queue.module';
import { OrkSupplyTaskService } from './services/ork-supply-task.service';
import { OrkSupplyTaskProcessor } from './processor/ork-supply-task.processor';

/**
 * Задачи ОРК по поставке. Konstructor доводит поставку до сервисной сделки и
 * ставит джобу — сами задачи ОРК живут здесь, в event-service.
 */
@Module({
    imports: [PBXModule, QueueModule],
    providers: [OrkSupplyTaskService, OrkSupplyTaskProcessor],
    exports: [OrkSupplyTaskService],
})
export class OrkSupplyTaskModule {}
