import { NextFunction, Request, Response } from 'express';
import { runAsInteractive } from './call-context';

/**
 * Каждый HTTP-запрос — интерактив: за ним обычно человек у экрана.
 *
 * Ставится первым в цепочке (см. bootstrapApp), поэтому класс виден и
 * гардам, и пайпам, и обработчику. Исключения помечают себя сами: вебхуки
 * роботов и ручной запуск кронов понижают класс через `runAsBackground`,
 * а работа очередей и кронов идёт вне HTTP и фоновой считается по
 * умолчанию.
 */
export const interactiveCallContextMiddleware = (
    req: Request,
    _res: Response,
    next: NextFunction,
): void => {
    runAsInteractive(`${req.method} ${req.path}`, next);
};
