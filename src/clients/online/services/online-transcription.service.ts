import { Injectable, Logger } from "@nestjs/common";

import { APIOnlineClient } from "../client/api-online.client";
import { IOnlineTranscription } from "./online-transcription.interface";

@Injectable()
export class OnlineTranscriptionService {
    private readonly logger = new Logger(OnlineTranscriptionService.name);
    private readonly baseUrl = 'transcription';
    constructor(
        private readonly client: APIOnlineClient
    ) { }

    async sendTranscription(data: IOnlineTranscription): Promise<IOnlineTranscription> {
        try {


            const response = await this.client.request(
                'post',
                `${this.baseUrl}`,
                data,
                'data'
            )
            this.logger.log(`Transcription online OnlineTranscriptionService: ${JSON.stringify(response)}`);
            return response.data as IOnlineTranscription;
        } catch (error) {
            this.logger.error(`Error sending transcription: ${error}`);
            throw error;
        }
    }

    async updateTranscription(data: IOnlineTranscription, transcriptionId: string) {
        const response = await this.client.request(
            'put',
            `${this.baseUrl}/${transcriptionId}`,
            data,
            'data'
        )
        return response.data;
    }
}
