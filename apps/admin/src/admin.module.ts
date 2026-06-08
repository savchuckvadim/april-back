import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GlobalExceptionFilter, HealthModule } from '@/core';
import { AdminController } from './admin.controller';
import { AdminAddModule } from './admin-app.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/admin/.env', '.env'],
        }),
        HealthModule,
        AdminAddModule,
    ],
    controllers: [AdminController],
    providers: [GlobalExceptionFilter],
})
export class AdminModule {}
