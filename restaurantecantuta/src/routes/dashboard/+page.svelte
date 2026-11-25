<script lang="ts">
  import { onMount } from 'svelte';
  import { canPerformStaffOrderAction, type StaffRole, type StaffOrderAction } from '$lib/staffRoles';
  import {
    getTableStatuses,
    menuProducts,
    type MenuProduct,
    type RestaurantOrder,
    type RestaurantTable
  } from '$lib/menu';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let errorCierre = $state('');
  let errorDashboard = $state('');
  let errorMenu = $state('');
  let welcomeToast = $state('');
  let orders: RestaurantOrder[] = $state([]);
  let products: MenuProduct[] = $state(menuProducts);
  let tables: RestaurantTable[] = $state(getTableStatuses([]));
  let loading = $state(true);
  let adminView: StaffRole = $state('admin');
  let busyOrderIds = $state(new Set<string>());
  let busyProductIds = $state(new Set<string>());
  let alertOrders: RestaurantOrder[] = $state([]);
  let receiptToPrint: RestaurantOrder | null = $state(null);
  let paymentOrder: RestaurantOrder | null = $state(null);
  let paymentMethod: RestaurantOrder['metodoPago'] = $state('yape_plin');
  let paymentPayer = $state('');
  let readyAlerts: RestaurantOrder[] = $state([]);
  let adminStatusFilter = $state('todos');
  let adminTypeFilter = $state('todos');
  let adminDateFilter = $state('');
  let newStaffName = $state('');
  let newStaffEmail = $state('');
  let newStaffRole: StaffRole = $state('mesero');
  let staffInviteBusy = $state(false);
  let staffInviteError = $state('');
  let staffInviteSuccess = $state('');
  let polling = false;
  let previousPayments = new Map<string, string>();

  let pendingCount = $derived(orders.filter((order) => order.estado !== 'completed' && order.pagoEstado !== 'paid').length);
  let paidCount = $derived(orders.filter((order) => order.estado !== 'completed' && order.pagoEstado === 'paid').length);
  let currentView: StaffRole = $derived(data.rol === 'admin' ? adminView : data.rol);
  let activeOrders = $derived(orders.filter((order) => order.estado !== 'completed'));
  let kitchenOrders = $derived(activeOrders.filter((order) => order.cocinaEstado !== 'ready'));
  let cashOrders = $derived(activeOrders.filter((order) =>
    order.pagoEstado === 'paid' ||
    (order.tipoPedido === 'delivery'
      ? order.salonEstado === 'served'
      : order.salonEstado === 'served' || order.salonEstado === 'bill_requested')
  ));
  let adminOrders = $derived(orders.filter((order) => {
    const status = orderStatus(order);
    return (adminStatusFilter === 'todos' || status === adminStatusFilter) &&
      (adminTypeFilter === 'todos' || order.tipoPedido === adminTypeFilter) &&
      (!adminDateFilter || dateKey(order.createdAt) === adminDateFilter);
  }));
  let todaySales = $derived(
    orders
      .filter((order) => order.pagoEstado === 'paid' && new Date(order.createdAt).toDateString() === new Date().toDateString())
      .reduce((sum, order) => sum + order.total, 0)
  );
  let bestSellingDishes = $derived.by(() => {
    const quantities = new Map<string, number>();
    for (const order of orders) {
      if (order.pagoEstado !== 'paid') continue;
      for (const item of order.items) {
        quantities.set(item.nombre, (quantities.get(item.nombre) ?? 0) + item.cantidad);
      }
    }
    return [...quantities.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  });
  let latestOrderByTable = $derived.by(() => {
    const latest = new Map<string, RestaurantOrder>();
    for (const order of orders) {
      if (order.estado === 'completed') continue;
      const current = latest.get(order.mesa);
      if (!current || current.createdAt < order.createdAt) latest.set(order.mesa, order);
    }
    return latest;
  });

  onMount(() => {
    let active = true;
    let retryTimer: number | null = null;
    let retryDelay = 3000;

    try {
      welcomeToast = sessionStorage.getItem('cantuta_dashboard_welcome') ?? '';
      sessionStorage.removeItem('cantuta_dashboard_welcome');
      if (welcomeToast) {
        window.setTimeout(() => {
          welcomeToast = '';
        }, 4000);
      }
    } catch (error) {
      console.warn('No se pudo recuperar el aviso de bienvenida:', error);
    }

    async function refreshDashboard() {
      if (polling) return;
      polling = true;
      try {
        const [ordersResponse, menuResponse] = await Promise.all([
          fetch('/api/orders'),
          fetch('/api/menu/availability')
        ]);
        const [ordersResult, menuResult]: [unknown, unknown] = await Promise.all([
          ordersResponse.json(),
          menuResponse.json()
        ]);

        if (!ordersResponse.ok) throw new Error(readMessage(ordersResult, 'No se pudieron consultar los pedidos.'));
        if (!menuResponse.ok) throw new Error(readMessage(menuResult, 'No se pudo consultar la disponibilidad del menú.'));
        if (
          typeof ordersResult !== 'object' ||
          ordersResult === null ||
          !('orders' in ordersResult) ||
          !Array.isArray(ordersResult.orders)
        ) {
          throw new Error('El servidor devolvió una lista de pedidos no válida.');
        }
        if (
          typeof menuResult !== 'object' ||
          menuResult === null ||
          !('products' in menuResult) ||
          !Array.isArray(menuResult.products)
        ) {
          throw new Error('El servidor devolvió una disponibilidad de menú no válida.');
        }

        if (!active) return;
        const nextOrders = ordersResult.orders as RestaurantOrder[];
        const changedToPaid = nextOrders.filter(
          (order) => order.pagoEstado === 'paid' && previousPayments.get(order.id) === 'pending_confirmation'
        );
        orders = nextOrders;
        products = menuResult.products as MenuProduct[];
        tables = getTableStatuses(nextOrders);
        readyAlerts = nextOrders
          .filter((order) => order.estado !== 'completed' && order.cocinaEstado === 'ready' && order.salonEstado === 'active')
          .slice(0, 8);
        errorDashboard = '';
        errorMenu = '';

        for (const order of nextOrders) {
          previousPayments.set(order.id, order.pagoEstado);
        }
        if (changedToPaid.length) {
          alertOrders = [...changedToPaid, ...alertOrders].slice(0, 8);
          playPaymentAlert();
        }
        retryDelay = 3000;
      } catch (error) {
        console.error('No se pudo actualizar el panel:', error);
        retryDelay = Math.min(retryDelay * 2, 60_000);
        if (active) errorDashboard = error instanceof Error ? error.message : 'No se pudo actualizar el panel.';
      } finally {
        polling = false;
        if (active) {
          loading = false;
          retryTimer = window.setTimeout(() => void refreshDashboard(), retryDelay);
        }
      }
    }

    void refreshDashboard();
    return () => {
      active = false;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  });

  function readMessage(value: unknown, fallback: string): string {
    return typeof value === 'object' &&
      value !== null &&
      'message' in value &&
      typeof value.message === 'string'
      ? value.message
      : fallback;
  }

  function playPaymentAlert() {
    try {
      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) return;
      const context = new AudioContextConstructor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      oscillator.frequency.setValueAtTime(1174, context.currentTime + 0.14);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.48);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.5);
      oscillator.addEventListener('ended', () => void context.close(), { once: true });
    } catch (error) {
      console.error('No se pudo reproducir la alerta sonora de pago:', error);
    }
  }

  async function updateOrder(
    order: RestaurantOrder,
    action: StaffOrderAction,
    payment?: { metodoPago: RestaurantOrder['metodoPago']; nombrePagador: string }
  ) {
    errorDashboard = '';
    busyOrderIds = new Set(busyOrderIds).add(order.id);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...payment })
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(readMessage(result, 'No se pudo actualizar el pedido.'));
      if (typeof result !== 'object' || result === null || !('order' in result)) {
        throw new Error('El servidor no devolvió el pedido actualizado.');
      }
      const updatedOrder = result.order as RestaurantOrder;
      orders = orders.map((candidate) => (candidate.id === updatedOrder.id ? updatedOrder : candidate));
      tables = getTableStatuses(orders);
      if (action === 'confirm') {
        previousPayments.set(updatedOrder.id, 'paid');
        alertOrders = [updatedOrder, ...alertOrders.filter((item) => item.id !== updatedOrder.id)].slice(0, 8);
        playPaymentAlert();
      }
      if (action === 'serve') {
        readyAlerts = readyAlerts.filter((item) => item.id !== updatedOrder.id);
      }
    } catch (error) {
      console.error('No se pudo actualizar el pedido:', error);
      errorDashboard = error instanceof Error ? error.message : 'No se pudo actualizar el pedido.';
    } finally {
      const next = new Set(busyOrderIds);
      next.delete(order.id);
      busyOrderIds = next;
    }
  }

  function canAct(action: StaffOrderAction) {
    return canPerformStaffOrderAction(data.rol, action);
  }

  function openPaymentConfirmation(order: RestaurantOrder) {
    errorDashboard = '';
    paymentOrder = order;
    paymentMethod = order.metodoPago;
    paymentPayer = order.nombrePagador;
  }

  async function confirmPayment(event: SubmitEvent) {
    event.preventDefault();
    if (!paymentOrder) return;
    const payer = paymentPayer.trim();
    if (payer.length < 2) {
      errorDashboard = 'Ingresa el nombre del titular originario del pago.';
      return;
    }
    await updateOrder(paymentOrder, 'confirm', { metodoPago: paymentMethod, nombrePagador: payer });
    if (!errorDashboard) paymentOrder = null;
  }

  async function toggleAvailability(product: MenuProduct) {
    errorMenu = '';
    busyProductIds = new Set(busyProductIds).add(product.id);
    try {
      const response = await fetch('/api/menu/availability', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: product.id, available: !product.available })
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(readMessage(result, 'No se pudo actualizar el plato.'));
      if (typeof result !== 'object' || result === null || !('product' in result)) {
        throw new Error('El servidor no devolvió el plato actualizado.');
      }
      const updatedProduct = result.product as MenuProduct;
      products = products.map((item) => (item.id === updatedProduct.id ? updatedProduct : item));
    } catch (error) {
      console.error('No se pudo actualizar la disponibilidad del plato:', error);
      errorMenu = error instanceof Error ? error.message : 'No se pudo actualizar el plato.';
    } finally {
      const next = new Set(busyProductIds);
      next.delete(product.id);
      busyProductIds = next;
    }
  }

  async function inviteStaff(event: SubmitEvent) {
    event.preventDefault();
    staffInviteError = '';
    staffInviteSuccess = '';
    staffInviteBusy = true;
    try {
      const response = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nombre: newStaffName,
          correo: newStaffEmail,
          rol: newStaffRole
        })
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(readMessage(result, 'No se pudo invitar al miembro del personal.'));
      staffInviteSuccess = `Se envió una invitación a ${newStaffEmail.trim()}.`;
      newStaffName = '';
      newStaffEmail = '';
      newStaffRole = 'mesero';
    } catch (error) {
      console.error('No se pudo invitar al personal:', error);
      staffInviteError = error instanceof Error ? error.message : 'No se pudo enviar la invitación.';
    } finally {
      staffInviteBusy = false;
    }
  }

  function printReceipt(order: RestaurantOrder) {
    receiptToPrint = order;
    window.setTimeout(() => window.print(), 50);
  }

  function cerrarSesion() {
    errorCierre = '';
    try {
      localStorage.clear();
    } catch (error) {
      console.warn('No se pudo limpiar el estado local de sesión:', error);
    }

    try {
      sessionStorage.clear();
    } catch (error) {
      console.warn('No se pudo limpiar el estado temporal de sesión:', error);
    }

    try {
      document.cookie = 'cantuta_demo_role_client=; Max-Age=0; Path=/; SameSite=Lax';
      document.cookie = 'cantuta_customer=; Max-Age=0; Path=/; SameSite=Lax';
    } catch (error) {
      console.warn('No se pudieron eliminar las cookies locales:', error);
    }

    window.location.href = '/auth/login';
  }

  function formatDate(value: string) {
    return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }

  function receiptLabel(order: RestaurantOrder) {
    return order.comprobante === 'factura'
      ? `Factura · RUC ${order.ruc ?? 'No registrado'}`
      : 'Boleta';
  }

  function simulationReceiptCode(order: RestaurantOrder) {
    const prefix = order.comprobante === 'factura' ? 'F001' : 'B001';
    return `${prefix}-${order.id.slice(0, 8).toUpperCase()}`;
  }

  function orderStatus(order: RestaurantOrder) {
    if (order.estado === 'completed' || order.pagoEstado === 'paid') return 'pagado';
    if (order.cocinaEstado === 'ready') return 'listo';
    if (order.cocinaEstado === 'preparing') return 'en_preparacion';
    return 'pendiente';
  }

  function dateKey(value: string) {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function waitMinutes(order: RestaurantOrder) {
    return Math.max(0, Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60_000));
  }

  function waitLabel(order: RestaurantOrder) {
    const minutes = waitMinutes(order);
    return minutes < 1 ? 'Recién recibido' : `${minutes} min esperando`;
  }

  function handleImageError(event: Event) {
    const image = event.currentTarget;
    if (!(image instanceof HTMLImageElement)) return;
    if (image.dataset.fallbackStage !== 'unsplash') {
      image.dataset.fallbackStage = 'unsplash';
      image.src =
        'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1200&q=80';
    } else if (!image.src.endsWith('/img/food-fallback.svg')) {
      image.dataset.fallbackStage = 'local';
      image.src = '/img/food-fallback.svg';
    }
  }
</script>

<svelte:head>
  <title>Panel de personal | Restaurante Cantuta</title>
</svelte:head>

<main class="dashboard-page restaurant-dashboard">
  {#if welcomeToast}
    <aside class="dashboard-welcome-toast" role="status" aria-live="polite">
      <span aria-hidden="true">✓</span>{welcomeToast}
    </aside>
  {/if}
  <header class="dashboard-header">
    <a class="dashboard-brand" href="/">🍽️ Restaurante Cantuta</a>
    {#if data.rol === 'admin'}
      <nav class="role-view-switch" aria-label="Vistas para supervisión">
        <button class:role-view-switch__active={adminView === 'admin'} onclick={() => (adminView = 'admin')}>Resumen</button>
        <button class:role-view-switch__active={adminView === 'cocina'} onclick={() => (adminView = 'cocina')}>Cocina</button>
        <button class:role-view-switch__active={adminView === 'mesero'} onclick={() => (adminView = 'mesero')}>Salón</button>
        <button class:role-view-switch__active={adminView === 'caja'} onclick={() => (adminView = 'caja')}>Caja</button>
      </nav>
    {/if}
    <div class="dashboard-header__actions">
      <a href="/">Ver menú ↗</a>
      <button class="button button--secondary" onclick={cerrarSesion}>Cerrar sesión</button>
    </div>
  </header>

  <section class="dashboard-card">
    <div>
      <p class="eyebrow">PANEL {currentView === 'admin' ? 'DE ADMINISTRACIÓN' : currentView === 'cocina' ? 'DE COCINA · KDS' : currentView === 'caja' ? 'DE CAJA' : 'DE SALÓN'}</p>
      <h1>{currentView === 'admin' ? 'Control del restaurante' : currentView === 'cocina' ? 'Comandas de cocina' : currentView === 'caja' ? 'Cobros y comprobantes' : 'Atención de salón'}</h1>
      <p>Sesión iniciada como <strong>{data.usuario}</strong>.</p>
    </div>
    <span class="role-badge">{data.roleLabel}</span>
    {#if errorCierre}<p class="form-message form-message--error" role="alert">{errorCierre}</p>{/if}
  </section>

  {#if alertOrders.length && (currentView === 'caja' || currentView === 'admin')}
    <aside class="payment-alert" aria-live="polite">
      <div>
        <span class="payment-alert__icon" aria-hidden="true">🔔</span>
        <div><strong>Pago confirmado</strong><p>{alertOrders.length === 1 ? `${alertOrders[0].mesa} tiene un comprobante listo para revisar.` : `${alertOrders.length} pedidos tienen comprobantes listos para revisar.`}</p></div>
      </div>
      <div class="payment-alert__actions">
        <button class="button button--light" onclick={() => (adminView = 'caja')}>Ver caja</button>
        <button class="icon-button" aria-label="Descartar alertas" onclick={() => (alertOrders = [])}>×</button>
      </div>
    </aside>
  {/if}

  {#if errorDashboard}<p class="form-message form-message--error dashboard-error" role="alert">{errorDashboard} Se reintentará automáticamente.</p>{/if}
  {#if data.authMode === 'demo'}
    <aside class="connection-notice" role="status">
      Modo demo local: los pedidos solo viven en memoria y se pierden al reiniciar. Configura Supabase para compartirlos y guardarlos.
    </aside>
  {:else if data.authMode === 'unavailable'}
    <aside class="connection-notice connection-notice--error" role="alert">
      Supabase no está configurado. No se pueden consultar ni guardar pedidos en la base de datos.
    </aside>
  {:else if data.authError}
    <aside class="connection-notice connection-notice--error" role="alert">
      No se pudo validar la sesión con Supabase. Revisa la conexión antes de gestionar pedidos.
    </aside>
  {/if}

  {#if currentView === 'admin'}
    <section class="dashboard-section admin-metrics" aria-label="Resumen del día">
      <article><span>Ventas de hoy</span><strong>S/ {todaySales.toFixed(2)}</strong></article>
      <article><span>Pedidos por cobrar</span><strong>{pendingCount}</strong></article>
      <article><span>Pedidos pagados activos</span><strong>{paidCount}</strong></article>
      <article><span>Platos agotados</span><strong>{products.filter((product) => !product.available).length}</strong></article>
    </section>
    <section class="dashboard-section">
      <div class="dashboard-section__heading"><div><p class="eyebrow">VENTAS CONFIRMADAS</p><h2>Platillos más vendidos</h2></div></div>
      {#if bestSellingDishes.length}
        <ol class="best-sellers">{#each bestSellingDishes as [name, quantity]}<li><span>{name}</span><strong>{quantity} vendidos</strong></li>{/each}</ol>
      {:else}<p class="orders-empty">Aún no hay ventas confirmadas hoy.</p>{/if}
    </section>
    <section class="dashboard-section" aria-labelledby="admin-orders-title">
      <div class="dashboard-section__heading">
        <div><p class="eyebrow">ACTUALIZA CADA 3 SEGUNDOS</p><h2 id="admin-orders-title">Todos los pedidos</h2></div>
        <span class="live-indicator"><i></i> En vivo</span>
      </div>
      <div class="admin-order-filters">
        <label>Estado
          <select bind:value={adminStatusFilter}>
            <option value="todos">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="en_preparacion">En preparación</option>
            <option value="listo">Listo</option>
            <option value="pagado">Pagado</option>
          </select>
        </label>
        <label>Tipo de pedido
          <select bind:value={adminTypeFilter}>
            <option value="todos">Todos</option>
            <option value="delivery">Delivery</option>
            <option value="mesa">En mesa</option>
          </select>
        </label>
        <label>Fecha
          <input type="date" bind:value={adminDateFilter} />
        </label>
        <button class="button button--light" onclick={() => {
          adminStatusFilter = 'todos';
          adminTypeFilter = 'todos';
          adminDateFilter = '';
        }}>Limpiar filtros</button>
      </div>
      {#if !adminOrders.length}
        <p class="orders-empty">No hay pedidos que coincidan con los filtros.</p>
      {:else}
        <div class="live-orders">
          {#each adminOrders as order (order.id)}
            <article class="live-order">
              <div class="live-order__header">
                <div>
                  <p class="eyebrow">{order.tipoPedido === 'delivery' ? 'DELIVERY' : order.mesa} · {formatDate(order.createdAt)}</p>
                  <h3>{order.cliente}</h3>
                  {#if order.tipoPedido === 'delivery'}
                    <small>{order.telefono} · {order.direccion}</small>
                  {/if}
                </div>
                <span class="order-state">{orderStatus(order).replace('_', ' ')}</span>
              </div>
              <div class="live-order__items">
                {#each order.items as item}
                  <div class="live-order__item"><span><strong>{item.cantidad}×</strong> {item.nombre}</span><strong>S/ {(item.precio * item.cantidad).toFixed(2)}</strong></div>
                {/each}
              </div>
              <div class="cash-summary"><span>Total <strong>S/ {order.total.toFixed(2)}</strong></span></div>
            </article>
          {/each}
        </div>
      {/if}
    </section>
    <section class="dashboard-section" aria-labelledby="staff-management-title">
      <div class="dashboard-section__heading">
        <div><p class="eyebrow">ACCESO INTERNO</p><h2 id="staff-management-title">Cuentas del personal</h2></div>
      </div>
      {#if data.demoMode}
        <p class="connection-notice">
          Para invitar personal, conecta Supabase y configura la clave privada SUPABASE_SERVICE_ROLE_KEY en el servidor.
        </p>
      {:else}
        <p class="staff-invite-help">Solo administración puede invitar cuentas. La persona recibirá un correo para activar su acceso.</p>
        <form class="staff-invite-form" onsubmit={inviteStaff}>
          <label>Nombre
            <input bind:value={newStaffName} minlength="2" maxlength="100" autocomplete="name" required />
          </label>
          <label>Correo electrónico
            <input bind:value={newStaffEmail} type="email" maxlength="254" autocomplete="email" required />
          </label>
          <label>Rol
            <select bind:value={newStaffRole}>
              <option value="mesero">Mesero</option>
              <option value="cocina">Cocina</option>
              <option value="caja">Caja</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
          <button class="button button--primary" type="submit" disabled={staffInviteBusy}>
            {staffInviteBusy ? 'Enviando invitación…' : 'Invitar personal'}
          </button>
        </form>
        {#if staffInviteError}<p class="form-message form-message--error" role="alert">{staffInviteError}</p>{/if}
        {#if staffInviteSuccess}<p class="form-message staff-invite-success" role="status">{staffInviteSuccess}</p>{/if}
      {/if}
    </section>
    {@render menuAvailability()}
  {:else if currentView === 'cocina'}
    <section class="dashboard-section kds-section" aria-labelledby="kds-title">
      <div class="dashboard-section__heading"><div><p class="eyebrow">COMANDAS EN VIVO · ACTUALIZA CADA 3 SEGUNDOS</p><h2 id="kds-title">En preparación</h2></div><span class="live-indicator"><i></i> En vivo</span></div>
      {#if loading && !orders.length}
        <p class="orders-empty">Cargando comandas…</p>
      {:else if !kitchenOrders.length}
        <p class="orders-empty">No hay comandas pendientes de preparación.</p>
      {:else}
        <div class="kds-grid">
          {#each kitchenOrders as order (order.id)}
            <article class:ticket--late={waitMinutes(order) >= 15} class="kds-ticket">
              <header><div><span>{order.tipoPedido === 'delivery' ? 'DELIVERY' : 'COMANDA'}</span><h3>{order.tipoPedido === 'delivery' ? 'Para llevar' : order.mesa}</h3><p>{order.cliente}</p>{#if order.tipoPedido === 'delivery'}<small>{order.telefono} · {order.direccion}</small>{/if}</div><strong>{waitLabel(order)}</strong></header>
              <ul>{#each order.items as item}<li><strong>{item.cantidad}×</strong><span>{item.nombre}{#if item.nota}<em>Nota: {item.nota}</em>{/if}</span></li>{/each}</ul>
              <footer><span>{order.cocinaEstado === 'new' ? 'Nueva' : 'Preparando'}</span>
                {#if order.cocinaEstado === 'new' && canAct('start_preparing')}
                  <button class="button button--primary" disabled={busyOrderIds.has(order.id)} onclick={() => updateOrder(order, 'start_preparing')}>Empezar a preparar</button>
                {:else if order.cocinaEstado === 'preparing' && canAct('ready')}
                  <button class="button button--primary" disabled={busyOrderIds.has(order.id)} onclick={() => updateOrder(order, 'ready')}>Listo para entregar</button>
                {/if}
              </footer>
            </article>
          {/each}
        </div>
      {/if}
    </section>
  {:else if currentView === 'mesero'}
    <section class="dashboard-section" aria-labelledby="tables-title">
      <div class="dashboard-section__heading"><div><p class="eyebrow">ESTADO EN VIVO · ACTUALIZA CADA 3 SEGUNDOS</p><h2 id="tables-title">Mapa de mesas</h2></div><span class="live-indicator"><i></i> En vivo</span></div>
      <div class="table-legend" aria-label="Leyenda"><span><i class="legend-dot legend-dot--free"></i>Disponible</span><span><i class="legend-dot legend-dot--occupied"></i>Ocupada</span><span><i class="legend-dot legend-dot--served"></i>Servida</span><span><i class="legend-dot legend-dot--payment"></i>Cuenta solicitada</span></div>
      <div class="table-grid">
        {#each tables as tableStatus (tableStatus.mesa)}
          {@const tableOrder = latestOrderByTable.get(tableStatus.mesa)}
          <article class={`table-tile table-tile--${tableStatus.estado}`}>
            <div class="table-tile__top"><strong>{tableStatus.mesa}</strong><span>{tableStatus.estado === 'disponible' ? 'Disponible' : tableStatus.estado === 'servida' ? 'Servida' : tableStatus.estado === 'pendiente_pago' ? 'Cuenta solicitada' : 'Ocupada'}</span></div>
            {#if tableOrder}<p>{tableOrder.cliente}</p><small>{tableStatus.estado === 'pendiente_pago' ? 'Cuenta solicitada · liberar al cobrar' : tableStatus.estado === 'servida' ? 'Servida · liberar al confirmar el pago' : tableOrder.salonEstado === 'served' || tableOrder.salonEstado === 'bill_requested' ? 'Hay otro pedido activo en esta mesa' : tableOrder.cocinaEstado === 'ready' ? '¡Pedido listo en cocina!' : `${tableOrder.items.length} platillos`}</small>
            {:else}<p>Lista para atender</p>{/if}
            <a class="button button--light table-order-link" href={`/?${data.rol === 'mesero' ? 'modo=mesero&' : ''}mesa=${encodeURIComponent(tableStatus.mesa.replace('Mesa ', ''))}`}>{tableOrder ? 'Agregar pedido' : 'Tomar pedido'}</a>
          </article>
        {/each}
      </div>
    </section>
    {#if readyAlerts.length}
      <aside class="ready-alert" aria-live="polite"><strong>🔔 Pedido listo para entregar</strong><ul>{#each readyAlerts as order (order.id)}<li>{order.tipoPedido === 'delivery' ? 'Delivery' : order.mesa} · {order.cliente}{#if canAct('serve')} <button class="button button--primary" disabled={busyOrderIds.has(order.id)} onclick={() => updateOrder(order, 'serve')}>{order.tipoPedido === 'delivery' ? 'Marcar entregado' : 'Marcar servido'}</button>{/if}</li>{/each}</ul></aside>
    {/if}
    <section class="dashboard-section">
      <div class="dashboard-section__heading"><div><p class="eyebrow">ATENCIÓN EN SALÓN</p><h2>Pedidos activos</h2></div><span class="polling-label">{loading ? 'Conectando…' : `${activeOrders.length} activos`}</span></div>
      {#if !activeOrders.length}<p class="orders-empty">No hay pedidos activos.</p>{:else}
        <div class="live-orders">{#each activeOrders as order (order.id)}
          <article class="live-order" class:order-ready={order.cocinaEstado === 'ready'}>
            <div class="live-order__header"><div><p class="eyebrow">{order.mesa} · {formatDate(order.createdAt)}</p><h3>{order.cliente}</h3></div><span class="order-state">{order.salonEstado === 'bill_requested' ? 'Cuenta solicitada' : order.salonEstado === 'served' ? 'Servido · pendiente de pago' : order.cocinaEstado === 'ready' ? 'Listo para entregar' : 'En cocina'}</span></div>
            <div class="live-order__items">{#each order.items as item}<div class="live-order__item"><span><strong>{item.cantidad}×</strong> {item.nombre}{#if item.nota}<small>Nota: {item.nota}</small>{/if}</span></div>{/each}</div>
            <div class="live-order__actions">
              {#if order.cocinaEstado === 'ready' && order.salonEstado === 'active' && canAct('serve')}<button class="button button--primary" disabled={busyOrderIds.has(order.id)} onclick={() => updateOrder(order, 'serve')}>{order.tipoPedido === 'delivery' ? 'Marcar entregado' : 'Marcar servido'}</button>{/if}
              {#if order.salonEstado === 'served' && canAct('request_bill')}<button class="button button--light" disabled={busyOrderIds.has(order.id)} onclick={() => updateOrder(order, 'request_bill')}>Solicitar cuenta a caja</button>{/if}
            </div>
          </article>
        {/each}</div>
      {/if}
    </section>
  {:else}
    <section class="dashboard-section" aria-labelledby="cash-title">
      <div class="dashboard-section__heading"><div><p class="eyebrow">COBROS Y COMPROBANTES</p><h2 id="cash-title">Pedidos listos para cobro</h2></div><span class="polling-label">{loading ? 'Conectando…' : `${cashOrders.length} pedidos`}</span></div>
      {#if !cashOrders.length}<p class="orders-empty">No hay pedidos entregados o con cuenta solicitada.</p>{:else}
        <div class="live-orders">{#each cashOrders as order (order.id)}
          <article class="live-order">
            <div class="live-order__header"><div><p class="eyebrow">{order.tipoPedido === 'delivery' ? 'DELIVERY' : order.mesa} · {formatDate(order.createdAt)}</p><h3>{order.cliente}</h3>{#if order.tipoPedido === 'delivery'}<small>{order.telefono} · {order.direccion}</small>{/if}</div><span class:order-state--paid={order.pagoEstado === 'paid'} class="order-state">{order.pagoEstado === 'paid' ? 'Pago confirmado' : 'Pendiente de pago'}</span></div>
            <div class="live-order__items">{#each order.items as item}<div class="live-order__item"><span><strong>{item.cantidad}×</strong> {item.nombre}{#if item.nota}<small>Nota: {item.nota}</small>{/if}</span><strong>S/ {(item.precio * item.cantidad).toFixed(2)}</strong></div>{/each}</div>
            <div class="cash-summary"><span>Subtotal <strong>S/ {order.subtotal.toFixed(2)}</strong></span><span>IGV (18%) <strong>S/ {order.impuestos.toFixed(2)}</strong></span><span>Total <strong>S/ {order.total.toFixed(2)}</strong></span></div>
            <div class="live-order__metadata"><div><span>Comprobante</span><strong>{receiptLabel(order)}</strong>{#if order.razonSocial}<small>{order.razonSocial}</small>{/if}</div>{#if order.pagoEstado === 'paid'}<div><span>Pago registrado</span><strong>{order.metodoPago === 'yape_plin' ? 'Yape / Plin' : order.metodoPago === 'tarjeta' ? 'Tarjeta' : 'Efectivo'}</strong><small>Titular: {order.nombrePagador}</small></div>{/if}</div>
            <div class="live-order__actions">
              {#if order.pagoEstado !== 'paid' && canAct('confirm')}<button class="button button--primary" disabled={busyOrderIds.has(order.id)} onclick={() => openPaymentConfirmation(order)}>{order.tipoPedido === 'mesa' ? 'Confirmar pago y liberar mesa' : 'Confirmar pago'}</button>{:else if order.pagoEstado === 'paid'}
                <button class="button button--light" onclick={() => printReceipt(order)}>Emitir {order.comprobante === 'factura' ? 'factura' : 'boleta'}</button>
                {#if canAct('complete')}<button class="button button--primary" disabled={busyOrderIds.has(order.id)} onclick={() => updateOrder(order, 'complete')}>{busyOrderIds.has(order.id) ? 'Cerrando…' : order.tipoPedido === 'delivery' ? 'Completar pedido' : 'Liberar mesa'}</button>{/if}
              {/if}
            </div>
          </article>
        {/each}</div>
      {/if}
    </section>
  {/if}
</main>

{#snippet menuAvailability()}
  <section class="dashboard-section" aria-labelledby="menu-control-title">
    <div class="dashboard-section__heading"><div><p class="eyebrow">DISPONIBILIDAD EN VIVO</p><h2 id="menu-control-title">Control de platos</h2></div><span class="polling-label">Los cambios se reflejan en el menú automáticamente</span></div>
    {#if errorMenu}<p class="form-message form-message--error" role="alert">{errorMenu}</p>{/if}
    <div class="availability-list">{#each products as product (product.id)}
      <article class="availability-item"><img src={product.imagen} alt="" loading="lazy" onerror={handleImageError} /><div><strong>{product.nombre}</strong><small>{product.categoria} · S/ {product.precio.toFixed(2)}</small></div><span class:availability-label--off={!product.available} class="availability-label">{product.available ? 'Disponible' : 'Agotado'}</span>
        <button class="button" class:button--unavailable={!product.available} class:button--light={product.available} class:button--primary={!product.available} disabled={busyProductIds.has(product.id)} onclick={() => toggleAvailability(product)}>{busyProductIds.has(product.id) ? 'Guardando…' : product.available ? 'Marcar agotado' : 'Activar plato'}</button>
      </article>
    {/each}</div>
  </section>
{/snippet}

{#if paymentOrder}
  <div class="modal-backdrop" role="presentation">
    <div class="payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-title" tabindex="-1">
      <button class="icon-button modal-close" aria-label="Cerrar" onclick={() => (paymentOrder = null)}>×</button>
      <p class="eyebrow">{paymentOrder.mesa} · S/ {paymentOrder.total.toFixed(2)}</p>
      <h2 id="payment-title">Confirmar pago</h2>
      <form onsubmit={confirmPayment}>
        <label>Método de pago<select bind:value={paymentMethod}><option value="yape_plin">Yape / Plin</option><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option></select></label>
        <label>Titular originario del pago<input bind:value={paymentPayer} minlength="2" maxlength="120" required /></label>
        {#if errorDashboard}<p class="form-message form-message--error" role="alert">{errorDashboard}</p>{/if}
        <div class="live-order__actions"><button type="button" class="button button--light" onclick={() => (paymentOrder = null)}>Volver</button><button class="button button--primary" disabled={busyOrderIds.has(paymentOrder.id)}>{busyOrderIds.has(paymentOrder.id) ? 'Confirmando…' : paymentOrder.tipoPedido === 'mesa' ? 'Registrar pago y liberar mesa' : 'Registrar pago'}</button></div>
      </form>
    </div>
  </div>
{/if}

{#if receiptToPrint}
  <section class="receipt-print" aria-label="Comprobante para impresión">
    <h1>Restaurante Cantuta</h1>
    <p>Muruhuay, Tarma · Junín, Perú</p>
    <p>Documento de demostración · Sin validez tributaria</p>
    <hr />
    <h2>{receiptLabel(receiptToPrint)}</h2>
    <p>Número simulado: {simulationReceiptCode(receiptToPrint)}</p>
    {#if receiptToPrint.ruc}<p>RUC: {receiptToPrint.ruc}</p>{/if}
    {#if receiptToPrint.razonSocial}<p>Razón social: {receiptToPrint.razonSocial}</p>{/if}
    <p>Pedido: {receiptToPrint.id}</p>
    <p>Fecha: {formatDate(receiptToPrint.createdAt)}</p>
    <p>Cliente: {receiptToPrint.cliente}</p>
    <p>Pedido: {receiptToPrint.tipoPedido === 'delivery' ? `Delivery · ${receiptToPrint.telefono ?? ''}` : receiptToPrint.mesa}</p>
    <hr />
    {#each receiptToPrint.items as item}
      <p>{item.cantidad} × {item.nombre} <span>S/ {(item.precio * item.cantidad).toFixed(2)}</span></p>
      {#if item.nota}<small>Nota: {item.nota}</small>{/if}
    {/each}
    <hr />
    <p>Subtotal <span>S/ {receiptToPrint.subtotal.toFixed(2)}</span></p>
    <p>IGV (18%) <span>S/ {receiptToPrint.impuestos.toFixed(2)}</span></p>
    <h2>Total <span>S/ {receiptToPrint.total.toFixed(2)}</span></h2>
    <p>Pagador: {receiptToPrint.nombrePagador}</p>
    <p>Pago: {receiptToPrint.pagoEstado === 'paid' ? 'Confirmado' : 'Pendiente de confirmación'}</p>
  </section>
{/if}
