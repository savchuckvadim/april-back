import { BitrixService } from "@/modules/bitrix";
import { IBXActivity } from "@/modules/bitrix/domain/activity/interfaces/bx-activity.interface";
export interface IRecord {
    id: number;
    name: string;
    url: string;
    duration: string;
    isPlaying: boolean;
    activityId: number;
}
export class RecordsService {
    constructor(
        private readonly bitrix: BitrixService
    ) { }

    public async getRecords(activities: IBXActivity[]): Promise<IRecord[]> {
        const files: { [key: number]: IRecord } = {

        }
        for (const activity of activities) {
            if (activity.FILES) {
                for (const file of activity.FILES) {

                    const date = new Date(activity.LAST_UPDATED).toLocaleString('ru-RU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    const name = `${activity.SUBJECT} ${date}`;
                    files[file.id] = {
                        id: file.id,
                        name: name,
                        url: file.url,
                        duration: null,
                        isPlaying: false,
                        activityId: activity.ID,
                    }
                }
            }
        }
        for (const fileId in files) {
            this.bitrix.batch.file.get(`${fileId}`, fileId as string)
        }
        const responses = await this.bitrix.api.callBatchWithConcurrency(3);
        for (const response of responses) {
            for (const fileId in response.result) {
                files[fileId].url = response.result[fileId].DOWNLOAD_URL;
            }
        }
        return Object.values(files) || [];
    }
}
