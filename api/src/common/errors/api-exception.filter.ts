import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";
import { ZodValidationException } from "nestjs-zod";
import type { ZodError } from "zod";

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  /** Ключ перевода (forbidden, courseNotFound), а не текст: переводит web. */
  message: string;
  details?: unknown;
}

// Сообщения самого Nest («Cannot GET /x», «ThrottlerException: Too Many
// Requests») ключами перевода не являются — для них ключ по статусу.
const DEFAULT_KEYS: Record<number, string> = {
  400: "badRequest",
  401: "unauthorized",
  403: "forbidden",
  404: "notFound",
  413: "payloadTooLarge",
  429: "tooManyRequests",
};

const TRANSLATION_KEY = /^[a-zA-Z][a-zA-Z0-9]*$/;

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("ApiException");

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ApiErrorBody {
    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError() as ZodError;
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: "Bad Request",
        message: "validationFailed",
        details: zodError.issues.map((issue) => ({ path: issue.path, code: issue.code, message: issue.message })),
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const raw = exception.getResponse();
      const rawMessage = typeof raw === "string" ? raw : (raw as { message?: unknown }).message;
      const message =
        typeof rawMessage === "string" && TRANSLATION_KEY.test(rawMessage)
          ? rawMessage
          : (DEFAULT_KEYS[statusCode] ?? "somethingWentWrong");
      // Подробности отказа (например, что держит пользователя от удаления) —
      // только если сервис передал их явно: throw new XxxException({ message, details })
      const details = typeof raw === "object" ? (raw as { details?: unknown }).details : undefined;
      return {
        statusCode,
        error: httpStatusName(statusCode),
        message,
        ...(details !== undefined && { details }),
      };
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: "Internal Server Error",
      message: "somethingWentWrong",
    };
  }
}

function httpStatusName(status: number): string {
  const name = HttpStatus[status];
  if (!name) return "Error";
  return name
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
