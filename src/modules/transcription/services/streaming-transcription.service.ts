import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { YandexAuthService } from 'src/core/yandex/yandex-auth.service';


@Injectable()
export class StreamingTranscriptionService {
    private readonly logger = new Logger(StreamingTranscriptionService.name);
    private readonly apiUrl: string;
    private readonly operationsUrl: string;
    private readonly folderId: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly yandexAuthService: YandexAuthService,
    ) {
        this.apiUrl = 'https://transcribe.api.cloud.yandex.net/speech/stt/v2/longRunningRecognize';
        this.operationsUrl = 'https://operation.api.cloud.yandex.net/operations';
        const folderId = this.configService.get<string>('YA_FOLDER_ID');
        if (!folderId) {
            throw new Error('YA_FOLDER_ID is not set');
        }
        this.folderId = folderId;
    }

    async transcribeAudio(fileUri: string): Promise<string> {
        try {
            const iamToken = await this.yandexAuthService.getIamToken();

            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${iamToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    config: {
                        folderId: this.folderId,
                        specification: {
                            languageCode: 'ru-RU',
                            model: 'general',
                            profanityFilter: false,
                            audioEncoding: 'MP3',
                            sampleRateHertz: 48000,
                            audioChannelCount: 1,
                            rawResults: false,
                        },
                    },
                    audio: {
                        uri: fileUri,
                    },
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error('Error sending audio for transcription:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorText,
                });
                throw new Error(`Failed to send audio for transcription: ${response.statusText}`);
            }

            const data = await response.json();
            this.logger.debug('Transcription response:', data);

            if (!data.id) {
                throw new Error('No operation ID in response');
            }

            return data.id;
        } catch (error) {
            this.logger.error('Error in transcribeAudio:', error);
            throw error;
        }
    }

    async getTranscriptionResult(operationId: string): Promise<string> {
        try {
            const iamToken = await this.yandexAuthService.getIamToken();
            const maxAttempts = 30;
            const delayMs = 2000;

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const response = await fetch(`${this.operationsUrl}/${operationId}`, {
                    headers: {
                        'Authorization': `Bearer ${iamToken}`,
                    },
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    this.logger.error('Error getting transcription result:', {
                        status: response.status,
                        statusText: response.statusText,
                        error: errorText,
                        operationId,
                    });
                    throw new Error(`Failed to get transcription result: ${response.statusText}`);
                }

                const data = await response.json();
                this.logger.debug('Transcription result response:', data);

                if (data.done) {
                    if (!data.response || !data.response.chunks || data.response.chunks.length === 0) {
                        this.logger.error('Invalid response format or empty transcription:', data);
                        throw new Error('Invalid response format or empty transcription');
                    }

                    const transcription = data.response.chunks
                        .map(chunk => chunk.alternatives[0].text)
                        .join(' ');

                    if (!transcription.trim()) {
                        this.logger.error('Empty transcription result:', data);
                        throw new Error('Empty transcription result');
                    }

                    return transcription;
                }

                await new Promise(resolve => setTimeout(resolve, delayMs));
            }

            throw new Error('Transcription timeout');
        } catch (error) {
            this.logger.error('Error getting transcription result:', {
                error: error.message,
                operationId,
                stack: error.stack,
            });
            throw error;
        }
    }
} 