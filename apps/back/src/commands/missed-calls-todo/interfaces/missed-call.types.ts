export type BxActivityCall = {
    ID?: number | string;
    OWNER_TYPE_ID?: number | string;
    OWNER_ID?: number | string;
    SUBJECT?: string;
    START_TIME?: string;
    RESPONSIBLE_ID?: number | string;
    COMPLETED?: string;
    DIRECTION?: number | string;
    PROVIDER_ID?: string;
    STATUS?: number | string;
};

export type EntityRef = {
    ownerTypeId: number;
    ownerId: number;
};

export type EntityInfo = EntityRef & {
    title: string;
    responsibleId: string;
};

export type TodoCreateItem = EntityRef & {
    responsibleId: string;
    description: string;
};

export type ResponsibleMessageItem = {
    responsibleId: string;
    message: string;
};
