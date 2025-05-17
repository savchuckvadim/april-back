import { BitrixActivityTypeId, BitrixOwnerTypeId } from "../../enums/bitrix-constants.enum";

export interface BXActivityRequest {
  select?: string[]
  filter: BXActivityRequestFields
}

export interface BXActivityRequestFields {
  [key: string]: string | number | string[] | undefined;
  ID?: number | string
  OWNER_ID?: number | string
  OWNER_TYPE_ID?: BitrixOwnerTypeId,
  TYPE_ID?: BitrixActivityTypeId
  // "PROVIDER_ID": "VOXIMPLANT_CALL",
  // "PROVIDER_TYPE_ID": "CALL",
  // "PROVIDER_GROUP_ID": null,
  // "ASSOCIATED_ENTITY_ID": "0",
  // "SUBJECT": "Outgoing call Andrew Nikolaev",
  // "CREATED": "2020-09-27T13:26:55+03:00",
  // "LAST_UPDATED": "2021-03-21T20:28:24+03:00",
  // "START_TIME": "2020-09-27T13:25:00+03:00",
  // "END_TIME": "2020-09-27T19:25:00+03:00",
  // "DEADLINE": "2020-09-27T13:25:00+03:00",
  // "COMPLETED": "Y",
  // "STATUS": "2",
  // "RESPONSIBLE_ID": "505",
  // "PRIORITY": "2",
  // "NOTIFY_TYPE": "1",
  // "NOTIFY_VALUE": "15",
  // "DESCRIPTION": "",
  // "DESCRIPTION_TYPE": "1",
  // "DIRECTION": "2",
  // "LOCATION": "",
  // "SETTINGS": [],
  // "ORIGINATOR_ID": null,
  // "ORIGIN_ID": null,
  // "AUTHOR_ID": "505",
  // "EDITOR_ID": "505",
  // "PROVIDER_PARAMS": [],
  // "PROVIDER_DATA": null,
  // "RESULT_MARK": "0",
  // "RESULT_VALUE": null,
  // "RESULT_SUM": null,
  // "RESULT_CURRENCY_ID": null,
  // "RESULT_STATUS": "0",
  // "RESULT_STREAM": "0",
  // "RESULT_SOURCE_ID": null,
  // "AUTOCOMPLETE_RULE": "0"
}

export interface IBXActivity {
  [key: string]: any;
  ID?: number | string

  OWNER_TYPE_ID: BitrixOwnerTypeId,
  OWNER_ID: number | string
  TYPE_ID: BitrixActivityTypeId,
  SUBJECT: string
  RESPONSIBLE_ID: number | string
  START_TIME: string
  END_TIME: string
  COMMUNICATIONS: BXActivityCommunication[],
  FILES?: BXActivityFile[]
}

export type BXActivityCommunication = {
  VALUE: string,
  ENTITY_ID: number | string,
  ENTITY_TYPE_ID: BitrixOwnerTypeId,
  TYPE_ID: BitrixActivityTypeId,
}

export type BXActivityFile = {
  // activityId: st
  // ring | number
  id: string | number
  // name: string
  url: string
  // duration: string
  // isPlaying: string
}