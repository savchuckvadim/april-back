import { Module } from '@nestjs/common';
import { KonstructorController } from './konstructor.controller';
import { KonstructorService } from './konstructor.service';

@Module({
    imports: [],
    controllers: [KonstructorController],
    providers: [KonstructorService],
})
export class KonstructorModule {}
