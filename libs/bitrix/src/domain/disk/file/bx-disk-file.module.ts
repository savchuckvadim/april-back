import { Module } from '@nestjs/common';
import { BxDiskFileService } from './services/bx-disk-file.service';

@Module({
    providers: [BxDiskFileService],
    exports: [BxDiskFileService],
})
export class BxDiskFileModule {}
