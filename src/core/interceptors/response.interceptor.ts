import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse, EResultCode } from '../interfaces/response.interface';
import { Request } from 'express';

@Injectable()
export class ResponseInterceptor<T>
    implements NestInterceptor<T, ApiResponse<T>>
{
    intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<ApiResponse<T>> {
        const req = context.switchToHttp().getRequest<Request>();
        if (req.url === '/api/metrics') {
            return next.handle() as Observable<ApiResponse<T>>;
        }

        return next.handle().pipe(
            map((data: T) => {
                return {
                    resultCode: EResultCode.SUCCESS,
                    data: data,
                };
            }),
        );
    }

    // private serializeBigInt(obj: any): any {
    //   if (obj === null || obj === undefined) {
    //     return obj;
    //   }

    //   if (typeof obj === 'bigint') {
    //     return obj.toString();
    //   }

    //   if (Array.isArray(obj)) {
    //     return obj.map(item => this.serializeBigInt(item));
    //   }

    //   if (typeof obj === 'object') {
    //     const result: any = {};
    //     for (const [key, value] of Object.entries(obj)) {
    //       // Обрабатываем пустые объекты DateTime
    //       if (value && typeof value === 'object' && Object.keys(value).length === 0) {
    //         result[key] = null;
    //       } else {
    //         result[key] = this.serializeBigInt(value);
    //       }
    //     }
    //     return result;
    //   }

    //   return obj;
    // }
}
