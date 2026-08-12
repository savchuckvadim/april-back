import { Module } from '@nestjs/common';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { PbxPortalCacheController } from './pbx-portal-cache.controller';

/** Ручка сброса слепка портала — только для админ-приложения pbx-install. */
@Module({
    imports: [PortalStoreModule],
    controllers: [PbxPortalCacheController],
})
export class PbxPortalCacheModule {}
