import { Module } from "@nestjs/common";
import { BitrixCoreModule } from "src/modules/bitrix/core/bitrix-core.module";
import { BxTimelineService } from "./services/bx-timeline.service";
import { BxTimelineBatchService } from "./services/bx-timeline.batch.service";


@Module({
    imports: [
        BitrixCoreModule
    ],
    providers: [
        BxTimelineService,
        BxTimelineBatchService
    ],
    exports: [
        BxTimelineService,
        BxTimelineBatchService
    ]
})
export class BxTimelineModule { }