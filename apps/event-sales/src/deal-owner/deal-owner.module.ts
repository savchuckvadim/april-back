import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx';
import { DealOwnerController } from './controllers/deal-owner.controller';
import { DealOwnerUseCase } from './use-cases/deal-owner.use-case';

/**
 * Компания и контакты за ответственным сделки при открытии своей сделки
 * в «Звонках». Модуль приложения: ручка нужна только фрейму отдела продаж
 * (ai/rules/app-api-surface.md).
 */
@Module({
    imports: [PBXModule],
    controllers: [DealOwnerController],
    providers: [DealOwnerUseCase],
})
export class DealOwnerModule {}
