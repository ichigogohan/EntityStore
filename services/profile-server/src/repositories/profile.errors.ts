import { Prisma } from "@prisma/client";

export class ProfileWriteError extends Error {
    constructor(
        readonly statusCode: 404 | 409 | 410,
        message: string,
        readonly currentVersion?: number,
    ) { super(message); }
}

export function isPrismaError(error: unknown, code: string): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}
