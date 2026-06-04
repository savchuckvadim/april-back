import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GlobalExceptionFilter, HealthModule } from '@/core';
import { AdminController } from './admin.controller';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/admin/.env', '.env'],
        }),
        HealthModule,
    ],
    controllers: [AdminController],
    providers: [GlobalExceptionFilter],
})
export class AdminModule {}
