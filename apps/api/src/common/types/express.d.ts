declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email?: string };
      scopes?: string[];
      authType?: 'jwt' | 'apikey';
    }
  }
}

export {};
