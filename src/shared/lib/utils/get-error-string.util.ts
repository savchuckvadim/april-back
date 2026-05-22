export const getErrorString = (error: unknown) => {
    return error instanceof Error ? error.message : String(error);
};

export const getErrorStack = (error: unknown) => {
    return error instanceof Error ? error.stack : undefined;
};

export const getErrorDetails = (error: unknown) => {
    return {
        message: getErrorString(error),
        stack: getErrorStack(error),
    };
};
