import { Module } from '@nestjs/common';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { ZakupkiSettingsController } from './controllers/zakupki-settings.controller';
import { ZakupkiSettingsPrismaRepository } from './repositories/zakupki-settings.prisma.repository';
import { ZakupkiSettingsService } from './services/zakupki-settings.service';

/** Настройки «3 КП для торгов» (таблица offer_zakupki_settings) — замена Laravel-ручек zakupki/*. */
@Module({
    imports: [PortalStoreModule],
    controllers: [ZakupkiSettingsController],
    providers: [ZakupkiSettingsPrismaRepository, ZakupkiSettingsService],
    exports: [ZakupkiSettingsService],
})
export class ZakupkiSettingsModule {}
