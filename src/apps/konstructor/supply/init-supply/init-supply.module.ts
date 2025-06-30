import { Module } from "@nestjs/common";
import { InitSupplyService } from "./init-supply.service";
import { InitSupplyBxrqService } from "./services/bxrq/init-supply-bxrq.service";
import { InitSupplyController } from "./init-supply.controller";
import { PBXModule } from "@/modules/pbx";
import { InitSupplyUseCase } from "./init-supply.use-case";
import { InitSupplyRpaFieldsService } from "./services/rpa-fields/init-supply-rpa-fields.service";
import { InitSupplyRpaSupplyReportFileFieldService } from "./services/rpa-fields/supply-report-file-field.service";
import { InitSupplyRpaRqFieldsService } from "./services/rpa-fields/rq-fields.service";
import { InitSupplyRpaCrmFieldsService } from "./services/rpa-fields/crm-fields.service";
import { InitSupplyRpaSupplyReportFieldsService } from "./services/rpa-fields/supply-report-fields.service";
import { InitSupplyRpaPbxItemsFieldsService } from "./services/rpa-fields/pbx-items-fields.service";
import { InitSupplyFileService } from "./services/file/init-supply-file.service";
import { InitSupplyTimelineCommentService } from "./services/rpa-timeline-comment/init-supply-timeline-comment.service";
import { ProviderCommentService } from "./services/rpa-timeline-comment/provider-comment.service";
import { ProviderModule } from "@/modules/portal-konstructor/provider";
import { ArmCommentService } from "./services/rpa-timeline-comment/arm-comment.service";
import { RqCommentService } from "./services/rpa-timeline-comment/rq-comment.service";
import { InfoblockConsaltingService } from "./services/rpa-timeline-comment/infoblock/infoblock-consalting.service";
import { ComplectCommentService } from "./services/rpa-timeline-comment/complect-comment.service";
import { InfoblockGeneralService } from "./services/rpa-timeline-comment/infoblock/infoblock-general.service";
import { InfoblockOtherService } from "./services/rpa-timeline-comment/infoblock/infoblock-other.service";
import { InfoblockLtService } from "./services/rpa-timeline-comment/infoblock/infoblock-lt.service";
import { InfoblocksCommentService } from "./services/rpa-timeline-comment/infoblocks-comment.service";
import { ContractCommentService } from "./services/rpa-timeline-comment/contract-comment.service";
import { TotalSumCommentService } from "./services/rpa-timeline-comment/total-comment.service";
import { TelegramModule } from "@/modules/telegram/telegram.module";

@Module({
    imports: [
        PBXModule,
        ProviderModule,
        TelegramModule
    ],
    controllers: [InitSupplyController],
    providers: [
        InitSupplyUseCase,
        InitSupplyService,

        // RPA fields
        InitSupplyBxrqService,
        InitSupplyRpaFieldsService,
        InitSupplyRpaPbxItemsFieldsService,
        InitSupplyRpaSupplyReportFieldsService,
        InitSupplyRpaRqFieldsService,
        InitSupplyRpaCrmFieldsService,
        InitSupplyRpaSupplyReportFileFieldService,
        InitSupplyFileService,

        // RPA timeline comment
        InitSupplyTimelineCommentService,
        ProviderCommentService,
        ArmCommentService,
        RqCommentService,
        ComplectCommentService,
        InfoblocksCommentService,
        InfoblockConsaltingService,
        InfoblockGeneralService,
        InfoblockOtherService,
        InfoblockLtService,
        ContractCommentService,
        TotalSumCommentService
    ],

})
export class InitSupplyModule { }