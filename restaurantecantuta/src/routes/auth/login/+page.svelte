<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { getSupabaseBrowserClient } from '$lib/supabaseClient';
  import { normalizeStaffRole } from '$lib/staffRoles';
  import type { PageData } from './$types';

  type RoleOption = {
    id: 'admin' | 'mesero' | 'caja' | 'cocina';
    label: string;
    description: string;
    icon: string;
  };

  let { data }: { data: PageData } = $props();
  let vista: 'cliente' | 'personal' = $state('cliente');
  let rol = $state<RoleOption['id']>('mesero');
  let email = $state('');
  let password = $state('');
  let nombre = $state('');
  let mesa = $state('');
  let personalizarCliente = $state(false);
  let cargando: 'guest' | 'cliente' | 'password' | 'google' | null = $state(null);
  let errorAcceso = $state('');

  const mesas = Array.from({ length: 16 }, (_, index) => `Mesa ${index + 1}`);
  const demoCredentials = { email: 'demo@cantuta.pe', password: 'demo1234' };
  const roles: RoleOption[] = [
    { id: 'admin', label: 'Admin', description: 'Gestión y control', icon: '✦' },
    { id: 'mesero', label: 'Mesero / Moza', description: 'Atención de salón', icon: '◈' },
    { id: 'caja', label: 'Caja', description: 'Pagos y comprobantes', icon: '▤' },
    { id: 'cocina', label: 'Cocina', description: 'Preparación de pedidos', icon: '♨' }
  ];

  $effect(() => {
    const requestedRole = page.url.searchParams.get('role');
    const requestedCanonicalRole = normalizeStaffRole(requestedRole);
    const requestedOption = roles.find(
      (opcion) => normalizeStaffRole(opcion.id) === requestedCanonicalRole
    );
    if (requestedOption) rol = requestedOption.id;
    if (requestedRole || page.url.searchParams.has('error')) vista = 'personal';
    const requestedTable = page.url.searchParams.get('mesa');
    if (requestedTable && /^(?:[1-9]|1[0-6])$/.test(requestedTable)) {
      mesa = `Mesa ${requestedTable}`;
      personalizarCliente = true;
    }
  });

  const erroresOAuth: Record<string, string> = {
    supabase_not_configured:
      'OAuth no está configurado todavía. Puedes entrar con la cuenta demo local.',
    use_demo_login: 'Google OAuth está desactivado en modo demo. Usa el acceso demo local.',
    supabase_configuration:
      'Falta configurar la URL y la clave pública de Supabase para habilitar el acceso real.',
    oauth_callback_failed:
      'No se pudo completar el acceso con Google. Inténtalo nuevamente.',
    oauth_provider_error:
      'Google no pudo completar el acceso. Inténtalo nuevamente.',
    authentication_required: 'Tu sesión terminó. Ingresa de nuevo para continuar.',
    staff_not_authorized:
      'Esta cuenta no está autorizada para el perfil seleccionado. Contacta al administrador.',
    invalid_role: 'Selecciona un perfil válido para continuar.',
    role_mismatch: 'Tu cuenta no tiene permisos para el perfil seleccionado.'
  };

  let authError = $derived(erroresOAuth[page.url.searchParams.get('error') ?? ''] ?? '');
  let isDemo = $derived(data.authMode === 'demo');
  let isUnavailable = $derived(data.authMode === 'unavailable');

  async function ingresarComoInvitado() {
    cargando = 'guest';
    errorAcceso = '';

    try {
      await goto('/');
    } catch (error) {
      console.error('No se pudo iniciar la sesión de comensal:', error);
      errorAcceso = 'No se pudo iniciar el menú en este dispositivo. Inténtalo otra vez.';
      cargando = null;
    }

  }

  async function ingresarConMesa(event: SubmitEvent) {
    event.preventDefault();
    errorAcceso = '';

    const nombreLimpio = nombre.trim();
    if (!nombreLimpio || !mesa) {
      errorAcceso = 'Escribe tu nombre y selecciona una mesa.';
      return;
    }

    cargando = 'cliente';
    try {
      const response = await fetch('/api/customer/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre: nombreLimpio, mesa })
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        errorAcceso =
          typeof result === 'object' &&
          result !== null &&
          'message' in result &&
          typeof result.message === 'string'
            ? result.message
            : 'No se pudo validar tu nombre y mesa.';
        cargando = null;
        return;
      }
      localStorage.setItem(
        'sesion',
        JSON.stringify({ usuario: nombreLimpio, mesa, rol: 'cliente' })
      );
      await goto(`/?mesa=${encodeURIComponent(mesa.replace('Mesa ', ''))}`);
    } catch (error) {
      console.error('No se pudo guardar la sesión de comensal:', error);
      errorAcceso = 'No se pudo iniciar el menú en este dispositivo. Inténtalo otra vez.';
      cargando = null;
    }
  }

  async function ingresarPersonal(event: SubmitEvent) {
    event.preventDefault();
    errorAcceso = '';

    if (!email.trim() || !password) {
      errorAcceso = 'Ingresa tu correo y contraseña para continuar.';
      return;
    }

    cargando = 'password';

    try {
      if (isDemo) {
        if (
          email.trim().toLowerCase() !== demoCredentials.email ||
          password !== demoCredentials.password
        ) {
          errorAcceso = 'Revisa las credenciales demo y el perfil seleccionado.';
          cargando = null;
          return;
        }

        const roleCookie = `cantuta_demo_role_client=${encodeURIComponent(rol)}; Max-Age=28800; Path=/; SameSite=Lax`;
        document.cookie = roleCookie;
        if (!document.cookie.split('; ').some((cookie) => cookie.startsWith('cantuta_demo_role_client='))) {
          errorAcceso = 'No se pudo guardar la sesión demo en este navegador.';
          cargando = null;
          return;
        }
        try {
          localStorage.setItem('cantuta_demo_role', rol);
          sessionStorage.setItem(
            'cantuta_dashboard_welcome',
            `Bienvenido al Panel de ${roles.find((role) => role.id === rol)?.label ?? rol}`
          );
        } catch (error) {
          console.warn('No se pudo guardar el estado visual de la sesión demo:', error);
        }

        await goto('/dashboard');
        return;
      }

      if (isUnavailable) {
        errorAcceso =
          'El acceso real no está disponible. Revisa las variables de Supabase o usa el modo demo local.';
        cargando = null;
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        errorAcceso = 'Supabase no está disponible. Recarga la página o usa el modo demo local.';
        cargando = null;
        return;
      }

      const { data: resultado, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (error) {
        console.error('Falló el inicio de sesión con correo y contraseña:', error.message);
        errorAcceso =
          error.message === 'Invalid login credentials'
            ? 'El correo o la contraseña no son correctos.'
            : error.message === 'Email not confirmed'
              ? 'Confirma tu correo antes de iniciar sesión.'
              : 'No se pudo iniciar sesión. Revisa tus datos e inténtalo nuevamente.';
        cargando = null;
        return;
      }

      const assignedRole = normalizeStaffRole(resultado.user.app_metadata.role);
      if (!assignedRole || assignedRole !== normalizeStaffRole(rol)) {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
          console.error('No se pudo cerrar la sesión sin permisos:', signOutError.message);
        }
        errorAcceso =
          'Tu cuenta no está autorizada para el perfil seleccionado. Contacta al administrador.';
        cargando = null;
        return;
      }

      await goto(`/dashboard?role=${encodeURIComponent(rol)}`);
    } catch (error) {
      console.error('Error inesperado durante el acceso del personal:', error);
      errorAcceso = 'Ocurrió un problema de conexión. Inténtalo nuevamente.';
      cargando = null;
    }
  }

  function iniciarOAuth() {
    if (data.authMode !== 'supabase') return;
    cargando = 'google';
    window.location.assign(`/api/auth/login?role=${encodeURIComponent(rol)}`);
  }
</script>

<svelte:head>
  <title>Acceso | Restaurante Cantuta</title>
  <meta
    name="description"
    content="Acceso rápido para comensales y personal del Restaurante Cantuta."
  />
</svelte:head>

<main class="access-shell">
  <div class="ambient ambient--one"></div>
  <div class="ambient ambient--two"></div>

  <header class="access-topbar">
    <a class="access-brand" href="/" aria-label="Restaurante Cantuta, inicio">
      <span class="access-brand__icon" aria-hidden="true">C</span>
      <span>cantuta<span class="access-brand__dot">.</span></span>
    </a>
    <a class="access-back" href="/">Volver al menú <span aria-hidden="true">↗</span></a>
  </header>

  <div class="access-layout">
    <section class="access-story" aria-label="Restaurante Cantuta">
      <div class="story-pill"><span></span> MURUHUAY · DESDE NUESTRA TIERRA</div>
      <h1>Un buen momento<br />siempre <em>comienza</em><br />a la mesa.</h1>
      <p class="story-copy">
        Sabores de casa, ingredientes de nuestra tierra y la calidez de compartir.
      </p>
      <div class="story-bottom">
        <div class="story-rating"><span aria-hidden="true">★★★★★</span><small>Hecho con cariño en Muruhuay</small></div>
        <span class="story-location">Tarma, Junín · Perú</span>
      </div>
      <div class="story-orbit story-orbit--outer"></div>
      <div class="story-orbit story-orbit--inner"></div>
      <div class="story-spark story-spark--one">✳</div>
      <div class="story-spark story-spark--two">✦</div>
    </section>

    <section class="access-card" aria-labelledby="access-title">
      <div class="access-card__heading">
        <p class="access-kicker">QUÉ GUSTO TENERTE AQUÍ</p>
        <h2 id="access-title">Bienvenido a Cantuta</h2>
        <p>Elige cómo quieres continuar.</p>
      </div>

      <div class="access-tabs" role="tablist" aria-label="Tipo de acceso">
        <button
          id="tab-cliente"
          class:access-tab--active={vista === 'cliente'}
          class="access-tab"
          role="tab"
          aria-selected={vista === 'cliente'}
          aria-controls="panel-cliente"
          onclick={() => {
            vista = 'cliente';
            errorAcceso = '';
          }}
        >Comensal</button>
        <button
          id="tab-personal"
          class:access-tab--active={vista === 'personal'}
          class="access-tab"
          role="tab"
          aria-selected={vista === 'personal'}
          aria-controls="panel-personal"
          onclick={() => {
            vista = 'personal';
            errorAcceso = '';
          }}
        >Personal</button>
      </div>

      {#if authError}
        <div class="access-alert access-alert--error" role="alert">
          <span aria-hidden="true">!</span>
          <p>{authError}</p>
        </div>
      {/if}
      {#if errorAcceso}
        <div class="access-alert access-alert--error" role="alert">
          <span aria-hidden="true">!</span>
          <p>{errorAcceso}</p>
        </div>
      {/if}

      {#if vista === 'cliente'}
        <div id="panel-cliente" class="access-panel" role="tabpanel" aria-labelledby="tab-cliente">
          <div class="guest-intro">
            <div class="guest-icon" aria-hidden="true">♨</div>
            <div>
              <h3>¿Listo para disfrutar?</h3>
              <p>Explora la carta y elige tu favorito.</p>
            </div>
          </div>
          <button
            class="access-submit access-submit--guest"
            disabled={cargando !== null}
            onclick={ingresarComoInvitado}
          >
            {#if cargando === 'guest'}
              <span class="spinner" aria-hidden="true"></span> Abriendo el menú…
            {:else}
              Entrar como comensal <span aria-hidden="true">→</span>
            {/if}
          </button>
          <div class="access-divider"><span>o si ya tienes mesa</span></div>

          {#if !personalizarCliente}
            <button
              class="access-secondary-link"
              onclick={() => {
                personalizarCliente = true;
                errorAcceso = '';
              }}
            >Personalizar con mi nombre y mesa <span aria-hidden="true">＋</span></button>
          {:else}
            <form class="access-form access-form--compact" onsubmit={ingresarConMesa}>
              <label for="cliente-nombre">Tu nombre</label>
              <input
                id="cliente-nombre"
                bind:value={nombre}
                autocomplete="name"
                maxlength="100"
                placeholder="Ej. Ana Cajaruri"
                required
              />
              <label for="cliente-mesa">Tu mesa</label>
              <select id="cliente-mesa" bind:value={mesa} required>
                <option value="" disabled>Selecciona tu mesa</option>
                {#each mesas as opcionMesa}
                  <option value={opcionMesa}>{opcionMesa}</option>
                {/each}
              </select>
              <button class="access-submit" type="submit" disabled={cargando !== null}>
                {#if cargando === 'cliente'}
                  <span class="spinner" aria-hidden="true"></span> Un momento…
                {:else}
                  Continuar con mi mesa <span aria-hidden="true">→</span>
                {/if}
              </button>
            </form>
          {/if}
          <p class="access-privacy">Sin registro · Tu pedido, a tu ritmo.</p>
        </div>
      {:else}
        <div id="panel-personal" class="access-panel" role="tabpanel" aria-labelledby="tab-personal">
          <div class="staff-heading">
            <div>
              <p class="access-kicker">ACCESO INTERNO</p>
              <h3>Selecciona tu área</h3>
            </div>
            {#if isDemo}
              <span class="mode-badge mode-badge--demo"><span></span> DEMO</span>
            {:else if isUnavailable}
              <span class="mode-badge mode-badge--offline"><span></span> CONFIGURACIÓN</span>
            {:else}
              <span class="mode-badge mode-badge--live"><span></span> SEGURO</span>
            {/if}
          </div>

          {#if isDemo}
            <div class="demo-hint" role="status">
              <span aria-hidden="true">✦</span>
              <p>
                <strong>Modo de prueba local.</strong>
                Correo: <code>demo@cantuta.pe</code> · Contraseña: <code>demo1234</code>
              </p>
            </div>
          {:else if isUnavailable}
            <div class="demo-hint demo-hint--offline" role="status">
              <span aria-hidden="true">i</span>
              <p>Supabase no está configurado. El ingreso real estará disponible al añadir las dos variables de entorno.</p>
            </div>
          {/if}

          <div class="role-grid" aria-label="Perfil de personal">
            {#each roles as opcionRol}
              <button
                class:role-option--active={rol === opcionRol.id}
                class="role-option"
                aria-pressed={rol === opcionRol.id}
                onclick={() => {
                  rol = opcionRol.id;
                  errorAcceso = '';
                }}
              >
                <span class="role-option__icon" aria-hidden="true">{opcionRol.icon}</span>
                <span class="role-option__text">
                  <strong>{opcionRol.label}</strong>
                  <small>{opcionRol.description}</small>
                </span>
                <span class="role-option__check" aria-hidden="true">{rol === opcionRol.id ? '✓' : ''}</span>
              </button>
            {/each}
          </div>

          <form class="access-form" onsubmit={ingresarPersonal}>
            <label for="personal-email">Correo electrónico</label>
            <input
              id="personal-email"
              bind:value={email}
              type="email"
              autocomplete="username"
              placeholder="nombre@restaurante.pe"
              required
            />
            <div class="field-label-row">
              <label for="personal-password">Contraseña</label>
            </div>
            <input
              id="personal-password"
              bind:value={password}
              type="password"
              autocomplete="current-password"
              placeholder="Ingresa tu contraseña"
              required
            />
            <button class="access-submit" type="submit" disabled={cargando !== null || isUnavailable}>
              {#if cargando === 'password'}
                <span class="spinner" aria-hidden="true"></span> Validando acceso…
              {:else}
                Ingresar al panel <span aria-hidden="true">→</span>
              {/if}
            </button>
          </form>

          {#if data.authMode === 'supabase'}
            <div class="access-divider"><span>o continúa con</span></div>
            <button class="google-button" onclick={iniciarOAuth} disabled={cargando !== null}>
              {#if cargando === 'google'}
                <span class="spinner spinner--dark" aria-hidden="true"></span>
                Conectando con Google…
              {:else}
                <svg aria-hidden="true" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.75 3.27-8.1Z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.15v2.84A11 11 0 0 0 12 23Z" />
                <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.15a11 11 0 0 0 0 9.9l3.69-2.84Z" />
                <path fill="#EA4335" d="M12 4.36c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0a11 11 0 0 0-9.85 7.05l3.69 2.84c.87-2.6 3.3-5.53 6.16-5.53Z" />
                </svg>
                Continuar con Google
              {/if}
            </button>
          {:else}
            <div class="google-button google-button--disabled" aria-disabled="true">
              <span aria-hidden="true">G</span>
              Google disponible con Supabase configurado
            </div>
          {/if}
          <p class="access-privacy">El perfil debe coincidir con los permisos de tu cuenta.</p>
        </div>
      {/if}
    </section>
  </div>

  <footer class="access-footer">
    <span>© 2026 Restaurante Cantuta</span>
    <span>Una experiencia hecha en Muruhuay <span aria-hidden="true">♥</span></span>
  </footer>
</main>
