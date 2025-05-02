import { IBXUser } from "src/modules/bitrix/domain/interfaces/bitrix.interface";

export class ReportGetRequestDto {
    domain: string;
    filters: ReportGetFiltersDto;
    socketId?: string; // 👈 сюда клиент пишет свой socket.id
}
export class ReportGetFiltersDto {
    dateFrom: string;
    dateTo: string;
    userIds: Array<string | number>;
    departament: IBXUser[];
    userFieldId: string;
    dateFieldId: string;
    actionFieldId: string;
    currentActions: any;
}
