import { Module } from '@nestjs/common';
import { PackageModule } from './package.module';
import { AdminGarantPackageController } from './controllers/package.admin.controller';

/**
 * Админ-слой доставки для пакетов гаранта (`admin/garant/packages`).
 * Импортирует {@link PackageModule} ради `PackageService` и регистрирует
 * только админ-контроллер. Подключать в приложении админки, а НЕ в konstructor.
 */
@Module({
    imports: [PackageModule],
    controllers: [AdminGarantPackageController],
})
export class AdminGarantPackageModule {}
