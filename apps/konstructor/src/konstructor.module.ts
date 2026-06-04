import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GlobalExceptionFilter, HealthModule } from '@/core';
import { KonstructorController } from './konstructor.controller';
import { KonstructorService } from './konstructor.service';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/konstructor/.env', '.env'],
        }),
        HealthModule,
    ],
    controllers: [KonstructorController],
    providers: [KonstructorService, GlobalExceptionFilter],
})
export class KonstructorModule {}
