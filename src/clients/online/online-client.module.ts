import { HttpModule } from "@nestjs/axios";
import { APIOnlineClient } from "./client/api-online.client";
import { Module } from "@nestjs/common";
import { OnlineTranscriptionService } from "./services/online-transcription.service";


@Module({
    imports: [HttpModule],
    providers: [APIOnlineClient, OnlineTranscriptionService],
    exports: [APIOnlineClient, OnlineTranscriptionService]
})
export class OnlineClientModule { }
