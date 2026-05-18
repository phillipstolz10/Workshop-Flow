import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nxvcteppevmuvnrmgkcr.supabase.co';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54dmN0ZXBwZXZtdXZucm1na2NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NDg4NjksImV4cCI6MjA5NDIyNDg2OX0.A8MFRsNZV2xsTIFWAvXcXJCCJfRRgXZFIGNol5ctqL8';

export const db = createClient(SUPABASE_URL, SUPABASE_KEY);
