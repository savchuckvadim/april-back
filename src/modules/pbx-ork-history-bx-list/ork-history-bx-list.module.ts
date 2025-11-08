import { Module } from "@nestjs/common";
import { PBXModule } from "../pbx";
import { OrkHistoryBxListService } from "./service/ork-history-bx-list.service";


@Module({
    imports: [PBXModule],
    providers: [OrkHistoryBxListService],
    exports: [OrkHistoryBxListService],
})
export class OrkHistoryBxListModule { }
