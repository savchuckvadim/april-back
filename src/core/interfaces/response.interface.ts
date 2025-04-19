export interface ApiResponse<T> {
  resultCode: EResultCode; // 0 - успех, 1 - ошибка
  data?: T;           // данные ответа (при успехе)
  message?: string;   // сообщение ошибки (при ошибке)
}
export enum EResultCode {
  SUCCESS = 0,
  ERROR = 1,
}
