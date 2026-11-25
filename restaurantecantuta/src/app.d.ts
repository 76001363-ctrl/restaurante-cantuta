import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { CustomerSession } from './lib/menu';

declare global {
  namespace App {
    interface Locals {
      supabase: SupabaseClient | null;
      user: User | null;
      authMode: 'supabase' | 'demo' | 'unavailable';
      authError: string | null;
      demoRole: string | null;
      customer: CustomerSession | null;
    }
  }
}

export {};