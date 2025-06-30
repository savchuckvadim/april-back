export interface IBxRpaItem {
    [key: string]: any;
    id: number;
    stageId: number;
    previousStageId: number;
    name: string;
    typeId: number;
    createdBy: number;
    updatedBy: number;
    createdTime: string;
    updatedTime: string;
    movedTime: string;
    detailUrl: string;
    movedBy: number;
    UF_RPA_1_NAME: string;

    tasksCounter: number;
    tasksFaces: {
        completed: number[];
        running: number[];
        all: number[];
    };
    users: {
        [key: string]: {
            id: string;
            name: string;
            secondName: string | null;
            lastName: string;
            title: string | null;
            workPosition: string | null;
            fullName: string;
            link: string;
        }
    }

}

