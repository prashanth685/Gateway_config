function appError(status, message) {
  return { tag: "app_error", status, message };
}

export const Errors = {
  badRequest: (msg) => appError(400, msg),
  unauthorized: (msg) => appError(401, msg),
  forbidden: (msg) => appError(403, msg),
  notFound: (msg) => appError(404, msg),
  internal: (msg) => appError(500, msg),
};
