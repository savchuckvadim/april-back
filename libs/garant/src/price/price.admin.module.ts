import { Module } from '@nestjs/common';
import { PriceModule } from './price.module';
import { AdminGarantProfPriceController } from './controllers/prof-price.admin.controller';

/**
 * Админ-слой доставки для проф-цен гаранта (`admin/garant/prof-prices`).
 * Импортирует {@link PriceModule} ради PriceService/PriceExcelService
 * (StorageService — глобальный) и регистрирует только админ-контроллер.
 * Подключать в приложении админки, а НЕ в konstructor.
 */
@Module({
    imports: [PriceModule],
    controllers: [AdminGarantProfPriceController],
})
export class AdminGarantProfPriceModule {}
