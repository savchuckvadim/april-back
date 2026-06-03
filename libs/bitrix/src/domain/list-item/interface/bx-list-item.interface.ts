export type BxYesNo = 'Y' | 'N';

export type BxListItemPropertyValue =
    | string
    | number
    | string[]
    | number[]
    | Record<string, string | number>
    | null;

export interface IBXListItem {
    ID: string | number;
    CODE?: string;
    NAME?: string;
    IBLOCK_ID?: string | number;
    IBLOCK_SECTION_ID?: string | number | null;
    CREATED_BY?: string | number;
    DATE_CREATE?: string;
    SORT?: string | number;
    ACTIVE?: BxYesNo;
    ACTIVE_FROM?: string | null;
    ACTIVE_TO?: string | null;
    BP_PUBLISHED?: BxYesNo;
    PREVIEW_TEXT?: string;
    PREVIEW_TEXT_TYPE?: 'text' | 'html';
    DETAIL_TEXT?: string;
    DETAIL_TEXT_TYPE?: 'text' | 'html';
    CREATED_USER_NAME?: string;
    [propertyKey: `PROPERTY_${string}`]: BxListItemPropertyValue | undefined;
}

export type IBXListItemFields = Partial<Omit<IBXListItem, 'ID'>> & {
    NAME: string;
    [propertyKey: `PROPERTY_${string}`]: BxListItemPropertyValue | undefined;
};
