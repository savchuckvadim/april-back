import { DocumentTotalRowService } from './product-rows/total-row.service';
import { Module } from '@nestjs/common';
import { DocumentInfoblockService } from './infoblocks/infoblock.service';
import { DocumentClientBxRqService } from './bx-client-rq/bx-client-rq.service';
import { InfoblocksRenderDataService } from './infoblocks/infoblock-render-data.service';
import { GarantModule } from '@lib/garant';
import { DocumentProductRowService } from './product-rows/product-row.service';
import { SupplyPayloadEnricherService } from './supply/supply-payload-enricher.service';
@Module({
    imports: [GarantModule],
    providers: [
        DocumentTotalRowService,
        DocumentInfoblockService,
        DocumentClientBxRqService,
        InfoblocksRenderDataService,
        DocumentProductRowService,
        SupplyPayloadEnricherService,
    ],
    exports: [
        DocumentTotalRowService,
        DocumentInfoblockService,
        DocumentClientBxRqService,
        InfoblocksRenderDataService,
        DocumentProductRowService,
        SupplyPayloadEnricherService,
    ],
})
export class DocumentGenerateModule {}
