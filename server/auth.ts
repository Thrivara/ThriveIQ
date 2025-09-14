import type { Request, Response, NextFunction } from 'express';
import { getSupabaseClient } from './supabase';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User {
      id: string;
      email?: string;
    }
    interface Request {
      user?: User;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : undefined;
    if (!token) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    req.user = { id: data.user.id, email: data.user.email ?? undefined };
    return next();
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

