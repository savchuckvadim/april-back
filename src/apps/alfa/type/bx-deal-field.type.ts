export type AlfaBxField = {
    id: string;
    bitrixId: string;
    type: string;
    name: string;
    list?: Array<{
        bitrixId: string;
        name: string;
        sort: string;
    }>;
    multiple?: boolean;
    mandatory?: boolean;
    code?: string;
};