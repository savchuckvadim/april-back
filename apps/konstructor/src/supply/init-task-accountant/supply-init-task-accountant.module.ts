import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx';
import { InitTaskAccountantController } from './init-task-accountant.controller';
import { InitTaskAccountantUseCase } from './init-task-accountant.use-case';

@Module({
    imports: [PBXModule],
    controllers: [InitTaskAccountantController],
    providers: [InitTaskAccountantUseCase],
})
export class SupplyInitTaskAccountantModule {}
