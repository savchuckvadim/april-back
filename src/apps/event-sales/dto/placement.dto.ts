import { IBXPlacement } from "src/modules/bitrix/domain/interfaces/bitrix-placement.intreface";

export class PlacementDto implements IBXPlacement {
    options: {
        ID?: number;
        taskId?: number;
        TASK_ID?: number;
    };
    placement: string;
}