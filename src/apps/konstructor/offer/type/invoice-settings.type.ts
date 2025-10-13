export enum INVOICE_QUESTION {
    ONE = 'one',
    MANY = 'many',
    PRESENTATION = 'presentation',
}

export type Questions = {
    [INVOICE_QUESTION.ONE]: {
        id: number;
        title: string;
        isActive: boolean;
        value: boolean;
        isAnswered: boolean;
    };
    [INVOICE_QUESTION.MANY]: {
        id: number;
        title: string;
        isActive: boolean;
        value: boolean;
        isAnswered: boolean;
    };
    [INVOICE_QUESTION.PRESENTATION]: {
        id: number;
        title: string;
        isActive: boolean;
        value: boolean;
        isAnswered: boolean;
    };
};
export interface InvoiceSettings {
    // status: boolean,
    questions: Questions;
}
