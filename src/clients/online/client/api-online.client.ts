import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class APIOnlineClient {
    private readonly logger = new Logger(APIOnlineClient.name);
    private readonly baseUrl: string;
    private readonly apiKey: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService
    ) {
        this.logger.log('APIOnlineClient initialized');
        this.baseUrl = this.configService.get('API_ONLINE_URL') as string;
        this.apiKey = this.configService.get('API_ONLINE_KEY') as string;
        this.logger.log(`Base URL: ${this.baseUrl}`);
    }

    async request(method: 'get' | 'post' | 'put', endpoint: string, data: any, dataName: string) {
        try {
            this.logger.log(`Request API ONLINE`);
            this.logger.log(`Making ${method.toUpperCase()} request to ${endpoint}`);
            this.logger.log(`full endpoint: ${this.baseUrl}/${endpoint}`);
            this.logger.log(`data: ${JSON.stringify(data)}`);

            const response = await firstValueFrom(
                this.httpService[method](
                    `${this.baseUrl}/${endpoint}`,
                    data,
                    {
                        headers: {
                            'X-Requested-With': 'XMLHttpRequest',
                            'X-API-KEY': this.apiKey
                        }
                    }
                )
            );

            if (response.status >= 200 && response.status < 300) {
                const responseData = response.data;
                this.logger.log(`Response status: ${response.status}`);
                // this.logger.log(`Response data: ${JSON.stringify(responseData)}`);

                if (responseData.resultCode === 0 && responseData[dataName]) {
                    this.logger.log(`Successfully retrieved ${dataName}`);
                    return {
                        resultCode: 0,
                        message: 'success',
                        data: responseData[dataName]
                    };
                } else {
                    this.logger.error(`${dataName} was not found in response`);
                    this.logger.error(`Response data: ${JSON.stringify(responseData, this.bigIntReplacer)}`);
                    return {
                        resultCode: 1,
                        message: 'Invalid data',
                        data: responseData
                    };
                }
            } else {
                this.logger.error(`Error in API request: ${response.status}`);
                this.logger.error(`Response data: ${JSON.stringify(response.data, this.bigIntReplacer)}`);
                return {
                    resultCode: 1,
                    message: 'Error in API request',
                    data: response.data
                };
            }
        } catch (error) {
            this.logger.error('Exception caught in API request');
            this.logger.error(`Error message: ${error.message}`);
            this.logger.error(`Stack trace: ${error.stack}`);
            return {
                resultCode: 1,
                message: error.message
            };
        }
    }

    private bigIntReplacer(key: string, value: any): any {
        if (typeof value === 'bigint') {
            return value.toString();
        }
        return value;
    }
} 