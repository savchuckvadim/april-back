// import { IBXCompany, IBXDeal, IBXTask    } from "./bitrix.interface";

export enum DISPLAY_MODE {
  PUBLIC = "public",
  ENTITY_CARD = "entityCard",
  CALL_CARD = "callCard",
  TIMELINE = "timeline",
  TASK = "task",
}
//   export type EntitiesFromPlacement = {
//     companyPlacement: Placement;
//     currentCompany: IBXCompany | null;
//     currentDeal: IBXDeal | null;
//     currentTask: IBXTask | null;
//   };

export type PlacementCallCard = {
  options: {
    CALL_DIRECTION: "outgoing";
    CALL_ID: "C24F78184C4BF39C.1716028715.2918176";
    CALL_LIST_MODE: "false";
    CALL_STATE: "connecting";
    CRM_ACTIVITY_ID: "";
    CRM_BINDINGS: Array<PlacementCallBindEntity>;

    CRM_ENTITY_ID: number;
    CRM_ENTITY_TYPE: "DEAL" | "COMPANY" | "LEAD";
    LINE_NAME: "SIP Mango Test";
    LINE_NUMBER: "reg118460";
    PHONE_NUMBER: "+79620027991";
  };
  placement: "CALL_CARD";
};
export type CustomPlacement = {
  placement: "DEFAULT",
  options: {
    entityTypeId: "4",
    entityId: number, //"158361",
    activityId: number, //"11005",
    companyId: number,
    dealId: number,
    planType: string | "fail_work",
    // "someImportant": "qwerty",
    // "placement": "COMPANY"
  }
}
type PlacementCallBindEntity = {
  ENTITY_TYPE: "DEAL" | "COMPANY" | "LEAD";
  ENTITY_ID: number;
};

type CallCardEntity = {
  ENTITY_ID: string; // as "19"
  ENTITY_TYPE: "DEAL" | "COMPANY" | "LEAD";
};

export enum PLACEMENT_ENTITY {
  LEAD = "LEAD",
  COMPANY = "COMPANY",
}



export type IBXPlacementOptions = {
  ID?: number;
  taskId?: number;
  TASK_ID?: number;
};

export type IBXPlacement = {
  options: IBXPlacementOptions;
  placement: string;
};
