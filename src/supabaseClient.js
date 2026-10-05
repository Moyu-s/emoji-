import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zjyycxlzzcqlqrkzafcj.supabase.co';
const supabaseKey = 'sb_publishable_xROd_7V0WnncKUlnxeoCMA_qGqNROA6';

export const supabase = createClient(supabaseUrl, supabaseKey);