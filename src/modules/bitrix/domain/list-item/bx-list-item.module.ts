import { BxListItemService } from "./services/bx-list-item.service";
import { Module } from "@nestjs/common";

@Module({
   
    providers: [BxListItemService],
    exports: [BxListItemService],
})
export class BxListItemDomainModule {}
