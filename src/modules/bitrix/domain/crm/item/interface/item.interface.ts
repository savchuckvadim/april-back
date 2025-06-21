

export interface IBXItem {
    id?: number | string
    categoryId?: number | string
    stageId?: `C${number | string}:${string}` | string
    [key: string]: any
}
