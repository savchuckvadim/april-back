import { Module } from '@nestjs/common';
import { BxDiskFolderService } from './services/bx-disk-folder.service';

@Module({
    providers: [BxDiskFolderService],
    exports: [BxDiskFolderService],
})
export class BxDiskFolderModule {}
