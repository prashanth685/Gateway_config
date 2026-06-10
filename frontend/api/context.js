export async function createContext(opts) {
  return { req: opts.req, resHeaders: opts.resHeaders };
}
