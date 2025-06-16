import { Module } from "@nestjs/common";

import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { APIOnlineClient } from "../api-online.client";

@Module({
    imports: [HttpModule, ConfigModule],
    providers: [APIOnlineClient],
    exports: [APIOnlineClient],
})
export class OnlineModule { }   