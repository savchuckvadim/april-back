import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PBXModule } from '@/modules/pbx';
import { RedisModule } from '@/core/redis/redis.module';
import { MissedCallsConfigService } from './services/config/missed-calls-config.service';
import { MissedCallsStateService } from './services/state/missed-calls-state.service';
import { MissedCallsBitrixApiService } from './services/bitrix/missed-calls-bitrix-api.service';
import { ProcessMissedCallsUseCase } from './usecases/process-missed-calls.use-case';
import { MissedCallsCronService } from './services/cron/missed-calls-cron.service';

@Module({
    imports: [PBXModule, RedisModule, ConfigModule],
    providers: [
        MissedCallsConfigService,
        MissedCallsStateService,
        MissedCallsBitrixApiService,
        ProcessMissedCallsUseCase,
        MissedCallsCronService,
    ],
})
export class MissedCallsTodoModule {}
