import { Module } from '@nestjs/common';
import { GarantModule } from '@lib/garant';
import { ContractSpecificationFormController } from './controllers/contract-specification-form.controller';
import { ContractSpecificationFormService } from './services/contract-specification-form.service';

/**
 * Форма договора (общая часть + спецификация) по собранному комплекту.
 * `GarantModule` — ради SupplyTextService: тексты поставки по коду.
 * Сервис экспортируется для легаси `init-form` отчёта о поставке.
 */
@Module({
    imports: [GarantModule],
    controllers: [ContractSpecificationFormController],
    providers: [ContractSpecificationFormService],
    exports: [ContractSpecificationFormService],
})
export class ContractSpecificationFormModule {}
