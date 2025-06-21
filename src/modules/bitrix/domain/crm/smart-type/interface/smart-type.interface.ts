import { IBXCategory } from "../../category/interface/bx-category.interface";
import { IBXStatus } from "../../status/interface/bx-status.interface";

export interface IBXSmartType  {
    id?: number;
    name: string;
    entityTypeId: string;
    // categories: IBXCategory[];
 
    title: string;
    code: string;
    createdBy: number;

    customSectionId: number | null;
    isCategoriesEnabled: string;
    isStagesEnabled: string;
    isBeginCloseDatesEnabled: "Y" | "N";
    isClientEnabled: "Y" | "N";
    isUseInUserfieldEnabled: "Y" | "N";
    isLinkWithProductsEnabled: "Y" | "N";
    isMycompanyEnabled: "Y" | "N";
    isDocumentsEnabled: "Y" | "N";
    isSourceEnabled: "Y" | "N";
    isObserversEnabled: "Y" | "N";
    isRecyclebinEnabled: "Y" | "N";
    isAutomationEnabled: "Y" | "N";
    isBizProcEnabled: "Y" | "N";
    isSetOpenPermissions: "Y" | "N";
    isPaymentsEnabled: "Y" | "N";
    isCountersEnabled: "Y" | "N";
    createdTime: string;
    updatedTime: string;
    updatedBy: number;
}

export interface IBXFullCategory extends IBXCategory {
    stages: IBXStatus[];
}

export interface IBXSmartFullType extends IBXSmartType {
    categories: IBXFullCategory[];
}
