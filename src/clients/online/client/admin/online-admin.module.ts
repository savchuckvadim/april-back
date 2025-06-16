import { Module } from "@nestjs/common";
import { APIOnlineAdminClient } from "./api-online-admin.client";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";


@Module(    {
    imports: [HttpModule, ConfigModule],
    providers: [APIOnlineAdminClient],
    exports: [APIOnlineAdminClient],
})
export class OnlineAdminModule { }