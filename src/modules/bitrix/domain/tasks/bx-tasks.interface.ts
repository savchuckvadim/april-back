export interface BXTaskRequest {
  // select:BXTaskRequestFields
  filter: BXTaskRequestFields
}

export interface BXTaskRequestFields {
  [key: string]: string | number | string[] | undefined;
  ID?: number | string;
  PARENT_ID?: number | string;
  GROUP_ID?: number | string;
  CREATED_BY?: number | string;
  STATUS_CHANGED_BY?: number | string;
  PRIORITY?: number | string;
  FORUM_TOPIC_ID?: number | string;
  RESPONSIBLE_ID?: number | string;
  TITLE?: number | string;
  TAG?: number | string;
  REAL_STATUS?: number | string;
  UF_CRM_TASK?: string[]
}