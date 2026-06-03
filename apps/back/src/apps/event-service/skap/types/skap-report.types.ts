/** Строка отчёта (аналог Python ModelReport). */
export interface SkapReportRowDto {
    reg: string;
    login: string;
    countScap: string;
    /** Длительность из CSV, в миллисекундах. */
    timeMs: number;
}

export interface SkapParsedFileDto {
    /** Относительный путь внутри распакованного архива. */
    relativePath: string;
    rows: SkapReportRowDto[];
}

/** Ответ эндпоинта: распарсенные данные из ZIP. */
export interface SkapParseZipResponseDto {
    date: string;
    /** Фрагмент для поиска файлов (год.месяц), как в Python. */
    dateFragment: string;
    files: SkapParsedFileDto[];
}
