import { BadRequestException } from '@nestjs/common';

export interface FileValidationOptions {
    maxSize?: number; // в байтах
    allowedMimeTypes?: string[];
    allowedExtensions?: string[];
}

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const DEFAULT_DOCX_MIME_TYPES = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip', // DOCX файлы технически являются ZIP архивами
];
const DEFAULT_DOCX_EXTENSIONS = ['.docx'];

/**
 * Валидирует DOCX файл
 * @param file - файл для валидации
 * @param options - опции валидации
 * @throws BadRequestException если файл не прошел валидацию
 */
export function validateDocxFile(
    file: Express.Multer.File | undefined,
    options: FileValidationOptions = {},
): void {
    if (!file) {
        throw new BadRequestException('File is required');
    }

    const {
        maxSize = DEFAULT_MAX_SIZE,
        allowedMimeTypes = DEFAULT_DOCX_MIME_TYPES,
        allowedExtensions = DEFAULT_DOCX_EXTENSIONS,
    } = options;

    // Проверка размера файла
    if (file.size > maxSize) {
        const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(2);
        throw new BadRequestException(
            `File size exceeds maximum allowed size of ${maxSizeMB} MB`,
        );
    }

    // Проверка расширения файла
    const fileExtension = file.originalname
        .toLowerCase()
        .substring(file.originalname.lastIndexOf('.'));
    const isValidExtension = allowedExtensions.some(ext =>
        fileExtension === ext.toLowerCase(),
    );

    // Проверка типа файла по MIME типу
    const isValidMimeType = allowedMimeTypes.some(mimeType =>
        file.mimetype.includes(mimeType) || file.mimetype === mimeType,
    );

    // Проверка магических байтов для DOCX (DOCX файлы начинаются с PK, так как это ZIP)
    const isValidMagicBytes =
        file.buffer && file.buffer.length >= 2
            ? file.buffer[0] === 0x50 && file.buffer[1] === 0x4b // PK (ZIP signature)
            : false;

    // Файл должен пройти хотя бы одну проверку (расширение ИЛИ MIME тип ИЛИ магические байты)
    // Но если есть расширение, то должны совпадать и магические байты (для безопасности)
    if (isValidExtension && !isValidMagicBytes) {
        throw new BadRequestException(
            'File appears to be corrupted or is not a valid DOCX file. Please ensure the file is a valid DOCX document.',
        );
    }

    // Если ни одна проверка не прошла
    if (!isValidMimeType && !isValidExtension && !isValidMagicBytes) {
        throw new BadRequestException(
            'File must be a DOCX file. Allowed types: .docx',
        );
    }
}

