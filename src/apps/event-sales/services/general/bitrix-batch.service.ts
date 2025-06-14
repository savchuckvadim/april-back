import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class BitrixBatchService {
    async sendGeneralBatchRequest(commands: Record<string, any>): Promise<any> {
        try {
            const response = await axios.post('/batch', { cmd: commands });
            return response.data;
        } catch (error) {
            console.error('Error in sendGeneralBatchRequest:', error);
            throw error;
        }
    }
} 