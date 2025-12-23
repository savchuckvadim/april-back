import { WordTemplateModule } from "@/modules/offer-template/word";
import { OfferWordGenerateController } from "./controllers/offer-word-generate.controller";
import { OfferWordGenerateByTemplateService } from "./services/offer-word-generate-by-template.service";
import { Module } from "@nestjs/common";
import { GarantModule } from "@/modules/garant";
import { PortalKonstructorModule } from "@/modules/portal-konstructor/portal-konstructor.module";
import { ProviderModule } from "@/modules/portal-konstructor/provider";
import { StorageModule } from "@/core/storage/storage.module";
import { FileLinkModule } from "@/core/file-link/file-link.module";



@Module({
    imports: [
        WordTemplateModule,
        GarantModule,
        PortalKonstructorModule,
        ProviderModule,
        StorageModule,
        FileLinkModule
    ],
    controllers: [OfferWordGenerateController],
    providers: [OfferWordGenerateByTemplateService],
})
export class OfferWordModule { }
