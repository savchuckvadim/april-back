import { Module } from '@nestjs/common';
import { YandexStorageService } from './yandex-storage.service';
import { RedisModule } from '../../core/redis/redis.module';
import { ConfigModule } from '@nestjs/config';
import { YandexAuthService } from './yandex-auth.service';

@Module({
    imports: [RedisModule, ConfigModule],
    providers: [YandexAuthService, YandexStorageService],
    exports: [YandexAuthService, YandexStorageService],
})
export class YandexModule { } 