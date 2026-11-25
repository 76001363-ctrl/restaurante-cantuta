import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';

const config = loadEnv('development', process.cwd(), '');
const email = process.argv[2]?.trim().toLowerCase();

if (!config.PUBLIC_SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Configura PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env antes de continuar.');
  process.exitCode = 1;
} else if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Uso: npm run setup:admin -- correo@ejemplo.com');
  process.exitCode = 1;
} else {
  const supabase = createClient(config.PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: users, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) {
    console.error(`No se pudo consultar la cuenta inicial: ${listError.message}`);
    process.exitCode = 1;
  } else {
    let user = users.users.find((candidate) => candidate.email?.toLowerCase() === email);
    let createdForBootstrap = false;

    if (!user) {
      const { data: invitation, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: { full_name: 'Administrador' },
        redirectTo: `${config.PUBLIC_SITE_URL ?? 'http://localhost:5173'}/auth/login`
      });
      if (inviteError || !invitation.user) {
        console.error(`Supabase no pudo invitar a ${email}: ${inviteError?.message ?? 'no devolvió una cuenta.'}`);
        process.exitCode = 1;
      } else {
        user = invitation.user;
        createdForBootstrap = true;
      }
    }

    if (user) {
      const { error: roleError } = await supabase.auth.admin.updateUserById(user.id, {
        app_metadata: { ...user.app_metadata, role: 'admin' }
      });

      if (roleError) {
        console.error(`No se pudo asignar el rol admin: ${roleError.message}`);
        if (createdForBootstrap) {
          const { error: cleanupError } = await supabase.auth.admin.deleteUser(user.id);
          if (cleanupError) {
            console.error(`No se pudo cancelar la invitación incompleta: ${cleanupError.message}`);
          }
        }
        process.exitCode = 1;
      } else {
        console.log(createdForBootstrap
          ? `Invitación de administrador enviada a ${email}.`
          : `Rol de administrador asignado a la cuenta existente ${email}.`);
      }
    }
  }
}
