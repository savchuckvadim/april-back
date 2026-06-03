import { Module } from '@nestjs/common';
import { BxDiskStorageService } from './services/bx-disk-storage.service';

@Module({
    providers: [BxDiskStorageService],
    exports: [BxDiskStorageService],
})
export class BxDiskStorageModule {}
