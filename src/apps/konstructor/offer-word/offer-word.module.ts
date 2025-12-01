import { WordTemplateModule } from "@/modules/offer-template/word";
import { OfferWordGenerateController } from "./controllers/offer-word-generate.controller";
import { OfferWordGenerateByTemplateService } from "./services/offer-word-generate-by-template.service";
import { Module } from "@nestjs/common";
import { GarantModule } from "@/modules/garant";
import { PortalKonstructorModule } from "@/modules/portal-konstructor/portal-konstructor.module";
import { ProviderModule } from "@/modules/portal-konstructor/provider";



@Module({
    imports: [WordTemplateModule, GarantModule, PortalKonstructorModule, ProviderModule],
    controllers: [OfferWordGenerateController],
    providers: [OfferWordGenerateByTemplateService],
})
export class OfferWordModule { }
