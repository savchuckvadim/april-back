export interface IUserFieldConfig {
  id?: string | number,
  entityId: 'CRM_LEAD' | 'CRM_CONTACT' | 'CRM_COMPANY' | 'CRM_DEAL' | 'CRM_QUOTE' | 'CRM_INVOICE' | 'CRM_SMART_INVOICE' | string
  fieldName: string, //UF_CRM_
  userTypeId: EUserFieldType,
  xmlId: string | null,
  sort?: string | number,
  multiple: 'Y' | 'N',
  mandatory: 'Y' | 'N',
  showFilter: 'E' | 'Y' | 'N',
  showInList: 'Y' | 'N',
  editInList?: 'Y' | 'N',
  isSearchable: 'Y' | 'N',
  settings?: {
    SIZE: number,
    LIST_WIDTH: number,
    LIST_HEIGHT: number,
    MAX_SHOW_SIZE: number,
    MAX_ALLOWED_SIZE: number,
    EXTENSIONS: string[]
  },
  languageId?: UFConfigLangMap,
  editFormLabel?: UFConfigLangMap,
  listColumnLabel?: UFConfigLangMap,
  listFilterLabel?: UFConfigLangMap,
  errorMessage?: UFConfigLangMapNullable,
  helpMessage?: UFConfigLangMapNullable,
  enum?: IUserFieldConfigEnumerationItem[]
}
export interface IUserFieldConfigSmart<T extends string> extends IUserFieldConfig {
  entityId: `CRM_${T}`
}


export interface UFConfigLangMap {
  [lang: string]: string;
}
export interface UFConfigLangMapNullable {
  [lang: string]: string | null;
}
export enum EUserFieldType {
  CRM = 'crm',
  CRM_STATUS = 'crm_status',
  EMPLOYEE = 'employee',
  MONEY = 'money',
  STRING = 'string',
  INTEGER = 'integer',
  DOUBLE = 'double',
  DATETIME = 'datetime',
  DATE = 'date',
  BOOLEAN = 'boolean',
  ADDRESS = 'address',
  URL = 'url',
  FILE = 'file',
  ENUMERATION = 'enumeration',
  IBLOCK_SECTION = 'iblock_section',
  IBLOCK_ELEMENT = 'iblock_element',
}


export interface IUserFieldConfigEnumerationItem {
  id?: string | number,
  userFieldId?: string | number,
  value: string,
  def: "N",
  sort: string | number,
  xmlId: string
}
export interface IUserFieldConfigSmart<T extends string> extends IUserFieldConfig {
  entityId: `CRM_${T}`
}