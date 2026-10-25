import { Module } from '@nestjs/common';
import { GarantModule } from '@lib/garant';
import { StorageModule } from '@lib/core/storage/storage.module';
import { FileLinkModule } from '@lib/core/file-link/file-link.module';
import { ComplectDescriptionController } from './controllers/complect-description.controller';
import { ComplectDescriptionService } from './services/complect-description.service';

/** «Описание комплекта» — DOCX по наполнению (замена Laravel getDescription). */
@Module({
    imports: [GarantModule, StorageModule, FileLinkModule],
    controllers: [ComplectDescriptionController],
    providers: [ComplectDescriptionService],
    exports: [ComplectDescriptionService],
})
export class ComplectDescriptionModule {}
