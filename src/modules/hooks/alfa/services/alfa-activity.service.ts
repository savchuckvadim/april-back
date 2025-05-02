import { Injectable } from '@nestjs/common';
import { BitrixActivityCreateService } from 'src/modules/bitrix/domain/activity/services/activity-create.service';
import { AlfaActivityData } from '../types/alfa-activity-data.interface';

// export interface AlfaActivityData {
//     companyId: number;
//     title: string;
//     date: string;
//     responsible: string;
// }

@Injectable()
export class AlfaActivityService {
    constructor(private readonly bitrixService: BitrixActivityCreateService) { }

    async processActivities(
        domain: string, 
        activities: Record<string, AlfaActivityData>
    ) {
        await this.bitrixService.createActivities(domain, activities);
    }
} 