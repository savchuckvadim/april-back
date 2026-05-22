export enum MailAuthJobType {
    EMAIL_VERIFICATION = 'email-verification',
    PASSWORD_RESET = 'password-reset',
}

export type MailAuthJobUserPayload = {
    id: string;
    email: string | null;
    name: string;
    surname: string;
};

export type MailAuthJobPayload = {
    type: MailAuthJobType;
    token: string;
    user: MailAuthJobUserPayload;
};
