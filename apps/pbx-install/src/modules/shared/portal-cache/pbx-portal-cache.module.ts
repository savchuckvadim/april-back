import { Module } from '@nestjs/common';
import { PortalOnlineCacheModule } from '@lib/portal-lib/store/portal-online-cache.module';
import { PbxPortalCacheController } from './pbx-portal-cache.controller';

/** Ручка сброса слепка портала — только для админ-приложения pbx-install. */
@Module({
    imports: [PortalOnlineCacheModule],
    controllers: [PbxPortalCacheController],
})
export class PbxPortalCacheModule {}
