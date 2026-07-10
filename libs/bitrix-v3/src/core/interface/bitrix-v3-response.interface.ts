/** Блок time — приходит в каждом успешном ответе REST 3.0 */
export interface IBitrixV3Time {
    start: number;
    finish: number;
    duration: number;
    processing: number;
    date_start: string;
    date_finish: string;
    operating_reset_at: number;
    operating: number;
}

/** Единый формат успешного ответа REST 3.0 */
export interface IBitrixV3Response<T> {
    result: T;
    time: IBitrixV3Time;
}

/** Одна проблема валидации из блока error.validation */
export interface IBitrixV3ValidationIssue {
    message: string;
    field: string;
}

/** Единый формат ошибки REST 3.0 */
export interface IBitrixV3ErrorBody {
    error: {
        code: string;
        message: string;
        validation?: IBitrixV3ValidationIssue[];
    };
}

/** Параметры постраничной навигации списочных методов (limit максимум 200) */
export interface IBitrixV3Pagination {
    page?: number;
    limit?: number;
    offset?: number;
}
