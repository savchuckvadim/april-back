import { Module, OnModuleInit } from '@nestjs/common';
import { BxDepartmentModule } from 'libs/bx-department';
import { SalesHookCoreModule } from '../core/sales-hook-core.module';
import { SalesHookRegistryService } from '../core/services/sales-hook-registry.service';
import { LeadToWorkController } from './controllers/lead-to-work.controller';
import { LeadToWorkUseCase } from './use-cases/lead-to-work.use-case';
import { LeadToWorkAssigneeService } from './services/lead-to-work-assignee.service';

/**
 * Хук «лид → работа» (группа 1): конвертация лида в работу ОП и «ХО из
 * лида» — режимы одного use-case (различаются флагами, см. README).
 * BxDepartmentModule — для round-robin выбора ответственного
 * (LeadToWorkAssigneeService), когда responsible не передан.
 */
@Module({
    imports: [SalesHookCoreModule, BxDepartmentModule],
    controllers: [LeadToWorkController],
    providers: [LeadToWorkUseCase, LeadToWorkAssigneeService],
})
export class LeadToWorkHookModule implements OnModuleInit {
    constructor(
        private readonly registry: SalesHookRegistryService,
        private readonly useCase: LeadToWorkUseCase,
    ) {}

    onModuleInit(): void {
        this.registry.register(this.useCase);
    }
}
