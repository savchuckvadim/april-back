import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

// Repositories
import {
    OfferTemplateRepository,
    OfferTemplatePrismaRepository,
} from './offer-template/';
import {
    OfferTemplateFontRepository,
    OfferTemplateFontPrismaRepository,
} from './font';
import {
    OfferTemplateImageRepository,
    OfferTemplateImagePrismaRepository,
} from './image';
import {
    OfferTemplatePageRepository,
    OfferTemplatePagePrismaRepository,
} from './page';

import {
    OfferTemplatePageBlockRepository,
    OfferTemplatePageBlockPrismaRepository,
} from './page-block';
import {
    OfferTemplatePageStickerRepository,
    OfferTemplatePageStickerPrismaRepository,
} from './page-sticker';
import {
    OfferTemplatePortalRepository,
    OfferTemplatePortalPrismaRepository,
} from './portal';
import {
    UserSelectedTemplateRepository,
    UserSelectedTemplatePrismaRepository,
} from './user-selected';

// Services
import { OfferTemplateService } from './offer-template/';
import { OfferTemplateFontService } from './font/';
import { OfferTemplateImageService } from './image/';
import { OfferTemplatePageService } from './page/';
import { OfferTemplatePageBlockService } from './page-block/';
import { OfferTemplatePageStickerService } from './page-sticker/';
import { OfferTemplatePortalService } from './portal/';
import { UserSelectedTemplateService } from './user-selected/';

// Controllers
import { OfferTemplateController } from './offer-template/';
import { OfferTemplateFontController } from './font/';
import { OfferTemplateImageController } from './image/';
import { OfferTemplatePageController } from './page/';
import { OfferTemplatePageBlockController } from './page-block/';
import { OfferTemplatePageStickerController } from './page-sticker/';
import { OfferTemplatePortalController } from './portal/';
import { UserSelectedTemplateController } from './user-selected/';

@Module({
    providers: [
        PrismaService,

        // Repository providers
        {
            provide: OfferTemplateRepository,
            useClass: OfferTemplatePrismaRepository,
        },
        {
            provide: OfferTemplateFontRepository,
            useClass: OfferTemplateFontPrismaRepository,
        },
        {
            provide: OfferTemplateImageRepository,
            useClass: OfferTemplateImagePrismaRepository,
        },
        {
            provide: OfferTemplatePageRepository,
            useClass: OfferTemplatePagePrismaRepository,
        },
        {
            provide: OfferTemplatePageBlockRepository,
            useClass: OfferTemplatePageBlockPrismaRepository,
        },
        {
            provide: OfferTemplatePageStickerRepository,
            useClass: OfferTemplatePageStickerPrismaRepository,
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
        OfferTemplateService,
        OfferTemplateFontService,
        OfferTemplateImageService,
        OfferTemplatePageService,
        OfferTemplatePageBlockService,
        OfferTemplatePageStickerService,
        OfferTemplatePortalService,
        UserSelectedTemplateService,
    ],
    controllers: [
        OfferTemplateController,
        OfferTemplateFontController,
        OfferTemplateImageController,
        OfferTemplatePageController,
        OfferTemplatePageBlockController,
        OfferTemplatePageStickerController,
        OfferTemplatePortalController,
        UserSelectedTemplateController,
    ],
    exports: [
        // Export services for use in other modules
        OfferTemplateService,
        OfferTemplateFontService,
        OfferTemplateImageService,
        OfferTemplatePageService,
        OfferTemplatePageBlockService,
        OfferTemplatePageStickerService,
        OfferTemplatePortalService,
        UserSelectedTemplateService,
    ],
})
export class OfferTemplateModule {}
