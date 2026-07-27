import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { PlansController } from './plans.controller';
import { PlansConfigService } from './services/plans-config.service';

/**
 * Планы руководителя (целевые показатели сотрудников).
 *
 * В providers только инфраструктура без bitrix-состояния (конфиг —
 * prisma). Доменные сервисы (user-поля, targets) создаются per-request
 * через `new` (CLAUDE.md про race condition с this.bitrix).
 */
@Module({
    imports: [PBXModule],
    controllers: [PlansController],
    providers: [PlansConfigService],
})
export class PlansModule {}
