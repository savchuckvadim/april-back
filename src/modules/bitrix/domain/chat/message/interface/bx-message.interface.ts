export interface IBXMessageAttach {
    MESSAGE?: string;
    [key: string]: any;
}

export interface IBXMessageKeyboard {
    [key: string]: any;
}

export interface IBXMessageMenu {
    [key: string]: any;
}

export interface IBXMessageAddRequest {
    DIALOG_ID: string; // chatXXX или XXX (идентификатор получателя)
    MESSAGE: string; // Текст сообщения
    SYSTEM?: boolean; // Отображать как системное сообщение, по умолчанию 'N'
    ATTACH?: IBXMessageAttach[]; // Вложение
    URL_PREVIEW?: boolean; // Преобразовывать ссылки в rich-ссылки, по умолчанию 'Y'
    KEYBOARD?: IBXMessageKeyboard; // Клавиатура
    MENU?: IBXMessageMenu; // Контекстное меню
}

export interface IBXMessageAddResponse {
    result: number; // MESSAGE_ID - идентификатор сообщения
}

