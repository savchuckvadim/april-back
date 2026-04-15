export const getErrorString = (error: unknown) => {
    return error instanceof Error ? error.message : String(error);
};
