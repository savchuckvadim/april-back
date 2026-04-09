import { Module } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { StorageModule } from '../../../core/storage/storage.module';

// Repositories from parent module
import {
    OfferTemplateRepository,
    OfferTemplatePrismaRepository,
} from '../offer-template/';
import {
    OfferTemplatePortalRepository,
    OfferTemplatePortalPrismaRepository,
} from '../portal/';
import {
    UserSelectedTemplateRepository,
    UserSelectedTemplatePrismaRepository,
} from '../user-selected/';

// Services
import { WordTemplateService } from './services/word-template.service';
import { DownloadTemplateService } from './services/download-template.service';
import { DocumentTagsFileService } from './services/document-tags-file.service';

// Controllers
import { WordTemplateController } from './controllers/word-template.controller';
import { WordTemplateTagsController } from './controllers/word-template-tags.controller';

@Module({
    imports: [StorageModule],
    providers: [
        PrismaService,

        // Repository providers from parent module
        {
            provide: OfferTemplateRepository,
            useClass: OfferTemplatePrismaRepository,
        },
        {
            provide: OfferTemplatePortalRepository,
            useClass: OfferTemplatePortalPrismaRepository,
        },
        {
            provide: UserSelectedTemplateRepository,
            useClass: UserSelectedTemplatePrismaRepository,
        },

        // Services
        WordTemplateService,
        DownloadTemplateService,
        DocumentTagsFileService,
    ],
    controllers: [WordTemplateController, WordTemplateTagsController],
    exports: [
        // Export services for use in other modules
        WordTemplateService,
        DownloadTemplateService,
        DocumentTagsFileService,
    ],
})
export class WordTemplateModule {}
