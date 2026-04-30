export interface IBXItem {
    id?: number | string;
    categoryId?: number | string;
    stageId?: `C${number | string}:${string}` | string;
    parentId2?: number | string; //id родительской сделки
    title?: string;

    [key: string]: any;
}
