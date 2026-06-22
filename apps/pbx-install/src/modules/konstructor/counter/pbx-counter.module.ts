import { Module } from '@nestjs/common';
import { CounterModule } from '@lib/portal-lib/konstructor';
import { PbxCounterController } from './controllers/pbx-counter.controller';
import { PbxCounterUseCase } from './use-cases/pbx-counter.use-case';

/**
 * CRUD-эндпоинты счётчиков конструктора (`counters`) в pbx-install.
 * Доменная логика — в lib `CounterModule` (`@lib/portal-lib/konstructor`).
 */
@Module({
    imports: [CounterModule],
    controllers: [PbxCounterController],
    providers: [PbxCounterUseCase],
})
export class PbxCounterModule {}
