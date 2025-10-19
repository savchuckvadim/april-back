import { Injectable } from '@nestjs/common';
import { AlfaActivityData } from '../types/alfa-activity-data.interface';
import { AlfaBxActivityCreateService } from './activity-create.service';

// export interface AlfaActivityData {
//     companyId: number;
//     title: string;
//     date: string;
//     responsible: string;
// }

@Injectable()
export class AlfaActivityService {
    constructor(private readonly bitrixService: AlfaBxActivityCreateService) {}

    async processActivities(
        domain: string,
        activities: Record<string, AlfaActivityData>,
    ) {
        await this.bitrixService.createActivities(domain, activities);
    }
}
