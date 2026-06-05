/** Стадия категории (аналог маппинга этапов в BtxCategoryResponseDto, camelCase). */
export class PortalStageEntity {
    id: number;
    btxCategoryId: number;
    name: string;
    title: string;
    code: string;
    bitrixId: string;
    color: string;
    isActive: boolean;
    createdAt: Date | null;
    updatedAt: Date | null;
}
