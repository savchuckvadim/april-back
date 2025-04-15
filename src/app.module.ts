import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DocumentModule } from './modules/document/document.module';
import { QueueModule } from './modules/queue/queue.module';
import { HooksModule } from './modules/hooks/hooks.module';
import { ConfigModule } from '@nestjs/config';
import { BitrixModule } from './modules/bitrix/bitrix.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { GlobalExceptionFilter } from './core/filters/global-exception.filter';
import { RedisModule } from './core/redis/redis.module';
import { RedisService } from './core/redis/redis.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      ignoreEnvFile: false,
      load: [() => ({
        REDIS_HOST: process.env.REDIS_HOST,
        REDIS_PORT: process.env.REDIS_PORT,
      })],
    }),
    DocumentModule,
    QueueModule,
    HooksModule,
    BitrixModule,
    TelegramModule,
    RedisModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    GlobalExceptionFilter,
    RedisService
  ],
})
export class AppModule { }
