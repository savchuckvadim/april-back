export class CustomField {
    ID: number;
    FIELD_NAME: string;
    value?: string | null;
    EDIT_FORM_LABEL: string;
    XML_ID?: string | null;

    constructor(data: Partial<CustomField>) {
        this.ID = data.ID || 0;
        this.FIELD_NAME = data.FIELD_NAME || '';
        this.value = data.value ?? null;
        this.EDIT_FORM_LABEL = data.EDIT_FORM_LABEL || '';
        this.XML_ID = data.XML_ID ?? null;
    }
}
