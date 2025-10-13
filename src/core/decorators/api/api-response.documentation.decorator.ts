import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

export const ApiSuccessResponse = (type: any, description = 'Успешный ответ') =>
  applyDecorators(
    ApiResponse({
      status: 200,
      description,
      schema: {
        allOf: [
          { $ref: '#/components/schemas/SuccessResponseDto' },
          {
            properties: {
              data: { $ref: `#/components/schemas/${type.name}` },
            },
          },
        ],
      },
    }),
  );

  export const ApiErrorResponse = (status: number, type: any, description: string) =>
    applyDecorators(
      ApiResponse({
        status,
        description,
        type,
      }),
    );

