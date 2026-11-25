import { json } from '@sveltejs/kit';
import { getSupabaseAdminClient } from '$lib/server/supabaseAdmin';
import { normalizeStaffRole } from '$lib/staffRoles';
import type { RequestHandler } from './$types';

const staffRoles = new Set(['admin', 'mesero', 'cocina', 'caja']);

export const POST: RequestHandler = async ({ locals, request, url }) => {
  const requesterRole = normalizeStaffRole(locals.user?.app_metadata.role);
  if (!locals.user || requesterRole !== 'admin') {
    return json({ message: 'Solo un administrador autenticado puede crear cuentas de personal.' }, { status: 403 });
  }

  if (!locals.supabase || locals.authMode !== 'supabase') {
    return json({ message: 'La autenticación de Supabase no está disponible.' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ message: 'La solicitud de invitación no es válida.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return json({ message: 'Completa el nombre, correo y rol del personal.' }, { status: 400 });
  }

  const name = 'nombre' in body && typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const email = 'correo' in body && typeof body.correo === 'string' ? body.correo.trim().toLowerCase() : '';
  const role = 'rol' in body && typeof body.rol === 'string' ? body.rol : '';
  if (name.length < 2 || name.length > 100) {
    return json({ message: 'El nombre debe tener entre 2 y 100 caracteres.' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json({ message: 'Ingresa un correo electrónico válido.' }, { status: 400 });
  }
  if (!staffRoles.has(role)) {
    return json({ message: 'Selecciona un rol de personal válido.' }, { status: 400 });
  }

  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return json({
      message: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el entorno privado del servidor.'
    }, { status: 503 });
  }

  try {
    const { data: invitation, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name: name },
      redirectTo: new URL('/auth/login', url.origin).toString()
    });

    if (inviteError) {
      console.error('Supabase no pudo invitar al miembro del personal:', inviteError.message);
      return json(
        { message: inviteError.status === 422 ? 'Ya existe una cuenta con ese correo.' : 'No se pudo enviar la invitación.' },
        { status: inviteError.status === 422 ? 409 : 503 }
      );
    }

    const user = invitation.user;
    if (!user) {
      console.error('Supabase aceptó una invitación sin devolver el usuario invitado.');
      return json({ message: 'Supabase no devolvió la cuenta creada.' }, { status: 502 });
    }

    const { error: roleError } = await adminClient.auth.admin.updateUserById(user.id, {
      app_metadata: { ...user.app_metadata, role }
    });
    if (roleError) {
      console.error('No se pudo asignar el rol a la cuenta invitada:', roleError.message);
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(user.id);
      if (cleanupError) {
        console.error('No se pudo eliminar la invitación sin rol:', cleanupError.message);
      }
      return json({ message: 'No se pudo asignar el rol; la invitación fue cancelada si Supabase lo permitió.' }, { status: 503 });
    }

    return json({ success: true, email, role }, { status: 201 });
  } catch (error) {
    console.error('Falló la creación de la cuenta del personal:', error);
    return json({ message: 'No se pudo crear la cuenta del personal.' }, { status: 503 });
  }
};
