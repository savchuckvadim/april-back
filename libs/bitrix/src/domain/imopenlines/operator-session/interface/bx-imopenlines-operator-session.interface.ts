// Типы методов imopenlines.session.* от имени оператора — по документации
// Bitrix (api-reference/imopenlines/openlines/sessions). Scope `imopenlines`.

/** imopenlines.session.join — добавить текущего оператора в активный диалог. */
export interface IBXImOpenlinesSessionJoinRequest {
    /** Идентификатор чата открытой линии. */
    CHAT_ID: number;
}

/** true — оператор присоединён к диалогу. */
export type IBXImOpenlinesSessionJoinResponse = boolean;
