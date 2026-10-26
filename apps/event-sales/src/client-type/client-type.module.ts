import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx';
import { OpenCardOnceModule } from '../shared/open-card-once';
import { ClientTypeController } from './controllers/client-type.controller';
import { ClientTypeUseCase } from './use-cases/client-type.use-case';

/**
 * Тип клиента в шапке «Звонков»: выравнивание сделки и компании и выбор.
 * Модуль приложения: ручки нужны только фрейму отдела продаж
 * (ai/rules/app-api-surface.md).
 */
@Module({
    imports: [PBXModule, OpenCardOnceModule],
    controllers: [ClientTypeController],
    providers: [ClientTypeUseCase],
})
export class ClientTypeModule {}
