import { IBXUser } from "src/modules/bitrix/domain/interfaces/bitrix.interface";

export class ReportRequestDto {
    domain: string;
    filters: {
        dateFrom: string;
        dateTo: string;
        userIds: Array<string | number>;
        departament: IBXUser[];
        userFieldId: string;
        dateFieldId: string;
        actionFieldId: string;
        currentActions: any;
    };
}


