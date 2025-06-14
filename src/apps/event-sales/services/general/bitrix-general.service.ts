import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class BitrixGeneralService {
    async makeRequest(url: string, data: any): Promise<any> {
        try {
            const response = await axios.get(url, { params: data });
            return response.data;
        } catch (error) {
            console.error('Error in makeRequest:', error);
            throw error;
        }
    }
} 