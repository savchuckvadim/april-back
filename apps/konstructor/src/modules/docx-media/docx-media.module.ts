import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    DOCX_MEDIA_CONFIG,
    buildDocxMediaConfig,
} from './config/docx-media.config';
import { DocxImageResizer } from './services/docx-image-resizer.service';
import { DocxMediaOptimizerService } from './services/docx-media-optimizer.service';

@Module({
    providers: [
        {
            provide: DOCX_MEDIA_CONFIG,
            inject: [ConfigService],
            useFactory: (configService: ConfigService) =>
                buildDocxMediaConfig(configService),
        },
        DocxImageResizer,
        DocxMediaOptimizerService,
    ],
    exports: [DocxMediaOptimizerService],
})
export class DocxMediaModule {}
