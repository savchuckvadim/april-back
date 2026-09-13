import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx';
import { InnerDealModule } from '../../modules/inner-deal/inner-deal.module';
import { DirectServiceDealController } from './controllers/direct-service-deal.controller';
import { DirectServiceDealUseCase } from './use-cases/direct-service-deal.use-case';

/**
 * Облегчённая поставка: сервисная сделка из конструктора без заявки RPA.
 * Логику сборки полей и переноса переиспользует у init-deal — здесь только
 * вход (форма вместо карточки RPA).
 */
@Module({
    imports: [PBXModule, InnerDealModule],
    controllers: [DirectServiceDealController],
    providers: [DirectServiceDealUseCase],
    exports: [DirectServiceDealUseCase],
})
export class DirectServiceDealModule {}
