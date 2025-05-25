export interface IBXField {
    ID: string;
    ENTITY_ID: string;
    FIELD_NAME: string;
    USER_TYPE_ID: 'enumeration' | string;
    XML_ID: string | null;
    SORT: string;
    MULTIPLE: 'Y' | 'N';
    MANDATORY: 'Y' | 'N';
    SHOW_FILTER: string;
    SHOW_IN_LIST: 'Y' | 'N';
    EDIT_IN_LIST: 'Y' | 'N';
    IS_SEARCHABLE: 'Y' | 'N';
    SETTINGS: {
      DISPLAY: string;
      LIST_HEIGHT: number;
      CAPTION_NO_VALUE: string;
      SHOW_NO_VALUE: 'Y' | 'N';
    };
    EDIT_FORM_LABEL: BitrixLangMap;
    LIST_COLUMN_LABEL: BitrixLangMap;
    LIST_FILTER_LABEL: BitrixLangMap;
    ERROR_MESSAGE: BitrixLangMapNullable;
    HELP_MESSAGE: BitrixLangMapNullable;
    LIST?: BitrixEnumerationOption[];
  }
  
  export interface BitrixLangMap {
    [lang: string]: string;
  }
  
  export interface BitrixLangMapNullable {
    [lang: string]: string | null;
  }
  
  export interface BitrixEnumerationOption {
    ID: string;
    SORT: string;
    VALUE: string;
    DEF: 'Y' | 'N';
  }