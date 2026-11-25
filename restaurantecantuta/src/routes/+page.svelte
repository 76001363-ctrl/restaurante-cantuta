<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import type { PageData } from './$types';
  import {
    menuProducts,
    normalizeTable,
    type CustomerSession,
    type MenuCategory,
    type MenuProduct,
    type OrderItem,
    type RestaurantOrder
  } from '$lib/menu';

  type CartLine = { productId: string; cantidad: number; nota: string };
  type OrderType = 'delivery' | 'mesa';
  type PaymentMethod = 'yape_plin' | 'tarjeta' | 'efectivo';
  type ReceiptType = 'boleta' | 'factura';

  let { data }: { data: PageData } = $props();
  let categoriaActiva: MenuCategory = $state('Comidas');
  let busqueda = $state('');
  let productos: MenuProduct[] = $state(menuProducts);
  let customer: CustomerSession | null = $state(null);
  let cart: CartLine[] = $state([]);
  let cartPersistenceReady = $state(false);
  let cartOpen = $state(false);
  let customerModalOpen = $state(false);
  let checkoutOpen = $state(false);
  let orderReviewOpen = $state(false);
  let orderConfirmation: RestaurantOrder | null = $state(null);
  let customerName = $state('');
  let table = $state('');
  let orderType: OrderType = $state('delivery');
  let customerPhone = $state('');
  let deliveryAddress = $state('');
  let receiptType: ReceiptType = $state('boleta');
  let ruc = $state('20123456789');
  let businessName = $state('');
  let paymentMethod: PaymentMethod = $state('yape_plin');
  const yapePhone = '925931087';
  let payerName = $state('');
  let busy = $state(false);
  let errorMessage = $state('');
  let notice = $state('');
  let availabilityError = $state('');
  let pendingProductId: string | null = $state(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let cartBumpTimer: ReturnType<typeof setTimeout> | null = null;
  let cartBump = $state(false);

  $effect(() => {
    orderType = data.meseroMode ? 'mesa' : 'delivery';
  });

  $effect(() => {
    if (!customer && data.customer) {
      customer = data.customer;
      customerName = data.customer.nombre;
      table = data.customer.mesa;
    }
    if (!table && data.mesaInicial) table = data.mesaInicial;
  });

  const categories: { nombre: MenuCategory; icon: string }[] = [
    { nombre: 'Comidas', icon: '🍛' },
    { nombre: 'Bebidas', icon: '🥤' },
    { nombre: 'Postres', icon: '🍰' },
    { nombre: 'Cervezas', icon: '🍻' }
  ];
  const tables = Array.from({ length: 16 }, (_, index) => `Mesa ${index + 1}`);

  let visibleProducts = $derived.by(() => {
    const query = normalizeSearchText(busqueda.trim());
    return productos.filter((product) => {
      const matchesCategory = product.categoria === categoriaActiva;
      const searchableText = normalizeSearchText(`${product.nombre} ${product.tipoMenu}`);
      return matchesCategory && (!query || searchableText.includes(query));
    });
  });
  let cartDetails: (CartLine & { product: MenuProduct })[] = $derived(
    cart.flatMap((line) => {
      const product = productos.find((item) => item.id === line.productId);
      return product ? [{ ...line, product }] : [];
    })
  );
  let itemCount = $derived(cart.reduce((sum, item) => sum + item.cantidad, 0));
  let subtotal = $derived(
    Number(cartDetails.reduce((sum, item) => sum + item.product.precio * item.cantidad, 0).toFixed(2))
  );
  let impuestos = $derived(Number((subtotal * 0.18).toFixed(2)));
  let total = $derived(Number((subtotal + impuestos).toFixed(2)));
  let quickSuggestions = $derived(
    productos
      .filter((product) =>
        product.available &&
        (product.tipoMenu === 'Bebidas' || product.tipoMenu === 'Postres') &&
        !cart.some((line) => line.productId === product.id)
      )
      .slice(0, 3)
  );

  onMount(() => {
    let active = true;
    try {
      const savedCart = localStorage.getItem('cantuta_cart_v1');
      if (savedCart) {
        const parsed: unknown = JSON.parse(savedCart);
        if (Array.isArray(parsed)) {
          cart = parsed.filter(isCartLine).slice(0, 100);
        }
      }
    } catch (error) {
      console.warn('No se pudo recuperar el carrito guardado:', error);
    }
    cartPersistenceReady = true;

    const mesaQuery = page.url.searchParams.get('mesa');
    if (!customer && mesaQuery) {
      const initialTable = tables.find((option) => option.toLowerCase() === `mesa ${mesaQuery}`.toLowerCase())
        ?? (tables.includes(`Mesa ${mesaQuery}`) ? `Mesa ${mesaQuery}` : '');
      if (initialTable) table = initialTable;
    }

    let savedSession: string | null = null;
    try {
      savedSession = localStorage.getItem('sesion');
    } catch (error) {
      console.warn('El almacenamiento local no está disponible; se usará la sesión en memoria.', error);
    }

    if (data.meseroMode && !customer && savedSession) {
      try {
        const parsed: unknown = JSON.parse(savedSession);
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'usuario' in parsed &&
          typeof parsed.usuario === 'string' &&
          'mesa' in parsed &&
          typeof parsed.mesa === 'string' &&
          parsed.usuario !== 'Comensal' &&
          parsed.mesa !== 'Por asignar'
        ) {
          void registerCustomer(parsed.usuario, parsed.mesa);
        }
      } catch (error) {
        console.error('No se pudo recuperar el acceso guardado del comensal:', error);
      }
    }

    if (data.authMode !== 'supabase') {
      return () => {
        active = false;
        if (toastTimer) clearTimeout(toastTimer);
        if (cartBumpTimer) clearTimeout(cartBumpTimer);
      };
    }

    const refreshAvailability = async () => {
      try {
        const response = await fetch('/api/menu/availability');
        const result: unknown = await response.json();
        if (!response.ok) throw new Error(readMessage(result, 'No se pudo actualizar el menú.'));
        if (
          typeof result !== 'object' ||
          result === null ||
          !('products' in result) ||
          !Array.isArray(result.products)
        ) {
          throw new Error('El servidor devolvió una disponibilidad de menú no válida.');
        }
        if (active) {
          productos = result.products as MenuProduct[];
          availabilityError = '';
        }
      } catch (error) {
        console.error('No se pudo actualizar la disponibilidad del menú:', error);
        if (active) availabilityError = 'No se pudo actualizar la disponibilidad. Revisa tu conexión.';
      }
    };

    void refreshAvailability();
    const interval = window.setInterval(refreshAvailability, 4000);
    return () => {
      active = false;
      window.clearInterval(interval);
      if (toastTimer) clearTimeout(toastTimer);
      if (cartBumpTimer) clearTimeout(cartBumpTimer);
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

  function normalizeSearchText(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  }

  function isCartLine(value: unknown): value is CartLine {
    return (
      typeof value === 'object' &&
      value !== null &&
      'productId' in value &&
      typeof value.productId === 'string' &&
      value.productId.length > 0 &&
      value.productId.length <= 100 &&
      'cantidad' in value &&
      typeof value.cantidad === 'number' &&
      Number.isInteger(value.cantidad) &&
      value.cantidad >= 1 &&
      value.cantidad <= 50 &&
      'nota' in value &&
      typeof value.nota === 'string' &&
      value.nota.length <= 250
    );
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

  function showToast(message: string) {
    notice = message;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      notice = '';
      toastTimer = null;
    }, 2800);
  }

  async function registerCustomer(
    nombre: string,
    mesaIngresada: string,
    type: OrderType = 'mesa'
  ): Promise<boolean> {
    const normalizedName = nombre.trim();
    const normalizedMesa = type === 'mesa' ? normalizeTable(mesaIngresada) : null;
    if (
      normalizedName.length < 2 ||
      normalizedName.length > 100 ||
      (type === 'mesa' && !normalizedMesa) ||
      (type === 'delivery' &&
        (!/^[+0-9 ()-]{7,20}$/.test(customerPhone.trim()) ||
          deliveryAddress.trim().length < 5 ||
          deliveryAddress.trim().length > 250))
    ) {
      errorMessage = type === 'mesa'
        ? 'Ingresa un nombre válido y selecciona una mesa del 1 al 16.'
        : 'Ingresa un nombre, teléfono y dirección válidos para delivery.';
      return false;
    }

    const normalizedCustomer: CustomerSession = {
      nombre: normalizedName,
      mesa: normalizedMesa ?? ''
    };
    customer = normalizedCustomer;
    if (type === 'mesa') {
      try {
        localStorage.setItem(
          'sesion',
          JSON.stringify({ usuario: normalizedCustomer.nombre, mesa: normalizedCustomer.mesa, rol: 'cliente' })
        );
      } catch (error) {
        console.warn('No se pudo guardar la sesión local; continuará en memoria.', error);
      }
    } else {
      try {
        localStorage.removeItem('sesion');
      } catch (error) {
        console.warn('No se pudo limpiar la sesión local del comensal:', error);
      }
    }

    customerName = normalizedCustomer.nombre;
    if (normalizedMesa) table = normalizedMesa;
    customerModalOpen = false;
    errorMessage = '';
    const pendingProduct = productos.find((product) => product.id === pendingProductId);
    pendingProductId = null;

    if (pendingProduct && addToCart(pendingProduct)) {
      showToast('¡Mesa registrada! Plato agregado al carrito.');
    } else if (pendingProduct) {
      showToast(`${pendingProduct.nombre} está agotado por el momento.`);
    }

    if (type === 'delivery') return true;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2000);
    try {
      const response = await fetch('/api/customer/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(normalizedCustomer),
        signal: controller.signal
      });
      if (!response.ok) {
        console.warn('La sesión del comensal no pudo persistirse en la cookie; se conserva en memoria.');
      }
    } catch (error) {
      console.warn('No se pudo sincronizar la sesión del comensal; se conserva en memoria.', error);
    } finally {
      window.clearTimeout(timeout);
    }

    return true;
  }

  function addToCart(product: MenuProduct): boolean {
    errorMessage = '';
    if (!product.available) {
      showToast(`${product.nombre} está agotado por el momento.`);
      return false;
    }
    if (!customer && data.meseroMode) {
      pendingProductId = product.id;
      customerName = '';
      orderType = data.meseroMode ? 'mesa' : 'delivery';
      customerPhone = '';
      deliveryAddress = '';
      table = data.mesaInicial ?? (page.url.searchParams.get('mesa') ? `Mesa ${page.url.searchParams.get('mesa')}` : '');
      customerModalOpen = true;
      return false;
    }

    const existing = cart.find((line) => line.productId === product.id);
    if (existing) {
      if (existing.cantidad >= 50) {
        showToast('Alcanzaste el máximo de 50 unidades para este plato.');
        return false;
      }
      cart = cart.map((line) =>
        line.productId === product.id ? { ...line, cantidad: line.cantidad + 1 } : line
      );
    } else {
      cart = [...cart, { productId: product.id, cantidad: 1, nota: '' }];
    }
    cartBump = true;
    if (cartBumpTimer) clearTimeout(cartBumpTimer);
    cartBumpTimer = setTimeout(() => {
      cartBump = false;
      cartBumpTimer = null;
    }, 420);
    showToast(`${product.nombre} agregado al carrito.`);
    return true;
  }

  function updateQuantity(productId: string, delta: number) {
    cart = cart
      .map((line) =>
        line.productId === productId
          ? { ...line, cantidad: Math.max(0, Math.min(50, line.cantidad + delta)) }
          : line
      )
      .filter((line) => line.cantidad > 0);
  }

  function updateNote(productId: string, nota: string) {
    cart = cart.map((line) => (line.productId === productId ? { ...line, nota } : line));
  }

  async function submitCustomer(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    errorMessage = '';
    try {
      await registerCustomer(customerName, table, orderType);
    } catch (error) {
      console.error('No se pudo iniciar la sesión del comensal:', error);
      errorMessage = 'No se pudo guardar tus datos. Inténtalo nuevamente.';
    } finally {
      busy = false;
    }
  }

  function openCheckout() {
    if (!cartDetails.length) {
      errorMessage = 'Agrega al menos un plato antes de continuar.';
      return;
    }
    receiptType = 'boleta';
    paymentMethod = 'yape_plin';
    payerName = customer?.nombre ?? '';
    errorMessage = '';
    checkoutOpen = true;
  }

  function selectReceiptType(type: ReceiptType) {
    receiptType = type;
    if (type === 'factura') updateRuc(ruc);
  }

  function updateRuc(value: string) {
    ruc = value.replace(/[^0-9]/g, '').slice(0, 11);
    businessName = ruc.length === 11 ? 'Restaurante Cantuta' : '';
  }

  function requestOrderConfirmation(event: SubmitEvent) {
    event.preventDefault();
    const normalizedMesa = orderType === 'mesa' ? normalizeTable(table) : null;
    if (customerName.trim().length < 2) {
      errorMessage = 'Ingresa el nombre completo del cliente.';
      return;
    }
    if (orderType === 'mesa' && !normalizedMesa) {
      errorMessage = 'Selecciona una mesa del 1 al 16.';
      return;
    }
    if (
      orderType === 'delivery' &&
      (!/^[+0-9 ()-]{7,20}$/.test(customerPhone.trim()) ||
        deliveryAddress.trim().length < 5 ||
        deliveryAddress.trim().length > 250)
    ) {
      errorMessage = 'Ingresa un teléfono y una dirección válidos para delivery.';
      return;
    }

    const form = event.currentTarget;
    if (form instanceof HTMLFormElement && !form.reportValidity()) return;

    customer = { nombre: customerName.trim(), mesa: normalizedMesa ?? '' };
    checkoutOpen = false;
    orderReviewOpen = true;
  }

  async function placeOrder() {
    busy = true;
    errorMessage = '';
    const items: OrderItem[] = cartDetails.map((line) => ({
      productId: line.productId,
      nombre: line.product.nombre,
      cantidad: line.cantidad,
      precio: line.product.precio,
      nota: line.nota
    }));

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: items.map(({ productId, cantidad, nota }) => ({ productId, cantidad, nota })),
          comprobante: receiptType,
          tipoPedido: orderType,
          numeroMesa: orderType === 'mesa' ? table : null,
          telefono: orderType === 'delivery' ? customerPhone : null,
          direccion: orderType === 'delivery' ? deliveryAddress : null,
          modoMesero: data.meseroMode,
          ruc,
          razonSocial: businessName,
          metodoPago: paymentMethod,
          nombrePagador: payerName,
          customer
        })
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        errorMessage = readMessage(result, 'No se pudo registrar el pedido.');
        orderReviewOpen = false;
        checkoutOpen = true;
        if (response.status === 409) void refreshMenuNow();
        return;
      }
      if (typeof result !== 'object' || result === null || !('order' in result)) {
        throw new Error('El servidor no devolvió la confirmación del pedido.');
      }

      orderConfirmation = result.order as RestaurantOrder;
      cart = [];
      orderReviewOpen = false;
      checkoutOpen = false;
      cartOpen = false;
    } catch (error) {
      console.error('No se pudo registrar el pedido:', error);
      errorMessage = 'No se pudo enviar el pedido. Comprueba tu conexión e inténtalo otra vez.';
    } finally {
      busy = false;
    }
  }

  async function refreshMenuNow() {
    try {
      const response = await fetch('/api/menu/availability');
      const result: unknown = await response.json();
      if (response.ok && typeof result === 'object' && result !== null && 'products' in result && Array.isArray(result.products)) {
        productos = result.products as MenuProduct[];
      }
    } catch (error) {
      console.error('No se pudo refrescar el menú:', error);
    }
  }

  async function closeCustomerSession() {
    try {
      try {
        localStorage.removeItem('sesion');
      } catch (error) {
        console.warn('No se pudo limpiar la sesión local del comensal:', error);
      }

      customer = null;
      cart = [];
      pendingProductId = null;
      customerModalOpen = false;
      cartOpen = false;
      checkoutOpen = false;
      orderReviewOpen = false;

      const cleanup = fetch('/api/customer/session', { method: 'DELETE' }).catch((error: unknown) => {
        console.warn('No se pudo limpiar la cookie de sesión del comensal:', error);
      });
      await Promise.race([
        cleanup,
        new Promise<void>((resolve) => window.setTimeout(resolve, 500))
      ]);
    } finally {
      try {
        await goto('/auth/login');
      } catch (error) {
        console.error('No se pudo abrir la pantalla de acceso al salir:', error);
        window.location.replace('/auth/login');
      }
    }
  }

  function clearCart() {
    cart = [];
    showToast('Carrito vaciado.');
  }

  function removeFromCart(productId: string) {
    const product = productos.find((item) => item.id === productId);
    cart = cart.filter((line) => line.productId !== productId);
    if (product) showToast(`${product.nombre} eliminado del carrito.`);
  }

  function addSuggestion(product: MenuProduct) {
    if (addToCart(product)) {
      cartOpen = true;
    }
  }

  $effect(() => {
    if (!cartPersistenceReady) return;
    try {
      localStorage.setItem('cantuta_cart_v1', JSON.stringify(cart));
    } catch (error) {
      console.warn('No se pudo guardar el carrito en este dispositivo:', error);
    }
  });
</script>

<svelte:head>
  <title>Restaurante Cantuta | Menú</title>
  <meta
    name="description"
    content="Explora la carta del Restaurante Cantuta en Muruhuay, Tarma. Todos los días de 11:00 a 22:00."
  />
</svelte:head>

<main class="restaurant-page">
  <header class="restaurant-header">
    <a class="dashboard-brand" href="/" aria-label="Restaurante Cantuta, inicio">
      🍽️ <span>Restaurante Cantuta</span>
    </a>
    <nav aria-label="Navegación principal">
      {#if customer}
        <span class="customer-greeting">{customer.nombre} · {orderType === 'delivery' ? 'Delivery' : customer.mesa}</span>
        <button class="text-button" onclick={closeCustomerSession}>Salir</button>
      {:else if data.meseroMode}
        <span class="visitor-badge">Modo mesero · {data.mesaInicial ?? 'Salón'}</span>
        <a href="/dashboard">Volver al panel</a>
      {:else}
        <span class="visitor-badge">Explorando como visitante</span>
        <a href="/auth/login">Ingresar</a>
      {/if}
      <button class:cart-trigger--bump={cartBump} class="cart-trigger" aria-label={`Abrir carrito, ${itemCount} productos`} onclick={() => (cartOpen = true)}>
        🛒 <span>Carrito</span><strong>{itemCount}</strong>
      </button>
    </nav>
  </header>
  {#if !data.meseroMode && data.authMode === 'demo'}
    <aside class="connection-notice" role="status">
      Modo demo: los pedidos no se guardan en una base compartida. Configura Supabase para recibirlos en los paneles del personal.
    </aside>
  {:else if !data.meseroMode && data.authMode === 'unavailable'}
    <aside class="connection-notice connection-notice--error" role="alert">
      La base de datos no está configurada. Puedes explorar el menú, pero no se pueden registrar pedidos todavía.
    </aside>
  {/if}

  <section class="restaurant-hero">
    <p class="eyebrow">SABORES QUE NOS UNEN</p>
    <h1>Tradición de Muruhuay,<br />servida en tu mesa.</h1>
    <p>
      {#if customer}
        ¡Hola, {customer.nombre}! {orderType === 'delivery' ? 'Preparamos tu pedido para delivery.' : `Estás en la ${customer.mesa}.`}
      {:else if data.meseroMode}
        Registrando un pedido para {data.mesaInicial ?? 'una mesa'}.
      {:else}
        Cocina local, ingredientes frescos y el cariño de siempre.
      {/if}
    </p>
    <a class="button button--primary" href="#menu">Explorar el menú</a>
  </section>

  <section class="restaurant-info" aria-label="Información del restaurante">
    <article><span aria-hidden="true">◷</span><div><strong>Horario</strong><p>Todos los días · 11:00–22:00</p></div></article>
    <article><span aria-hidden="true">⌖</span><div><strong>Encuéntranos</strong><p>Muruhuay, Tarma · Junín, Perú</p></div></article>
    <a href="https://maps.google.com/?q=Muruhuay%2C+Tarma%2C+Peru" target="_blank" rel="noreferrer">Ver ubicación ↗</a>
  </section>

  <section class="menu-section" id="menu">
    <div class="section-heading">
      <p class="eyebrow">NUESTRA CARTA</p>
      <h2>¿Qué se te antoja?</h2>
      <p>Precios en soles. Añade tus favoritos y personaliza tu pedido.</p>
    </div>

    {#if availabilityError}
      <p class="availability-message" role="status">{availabilityError} Reintentando automáticamente…</p>
    {/if}
    {#if notice}
      <p class="order-notice" role="status">{notice}</p>
    {/if}

    <div class="menu-search">
      <label for="menu-search-input">Buscar en esta categoría</label>
      <div class="menu-search__control">
        <span aria-hidden="true">⌕</span>
        <input
          id="menu-search-input"
          type="search"
          bind:value={busqueda}
          autocomplete="off"
          placeholder="Ej. lomo saltado"
          aria-controls="menu-product-grid"
        />
        {#if busqueda}
          <button class="menu-search__clear" type="button" onclick={() => (busqueda = '')}>
            Limpiar
          </button>
        {/if}
      </div>
      <p class="menu-search__count" aria-live="polite">
        {visibleProducts.length} {visibleProducts.length === 1 ? 'producto disponible' : 'productos disponibles'}
      </p>
    </div>

    <div class="category-tabs" aria-label="Categorías del menú">
      {#each categories as category}
        <button
          class:category-tab--active={categoriaActiva === category.nombre}
          class="category-tab"
          aria-pressed={categoriaActiva === category.nombre}
          onclick={() => (categoriaActiva = category.nombre)}
        >
          <span aria-hidden="true">{category.icon}</span>
          {category.nombre}
        </button>
      {/each}
    </div>

    {#if visibleProducts.length}
      <div class="product-grid" id="menu-product-grid">
        {#each visibleProducts as product, index (product.id)}
        <article
          class:product-unavailable={!product.available}
          class="product-card"
          style={`--card-index: ${index}`}
        >
          <div class="product-image-wrap">
            <img src={product.imagen} alt={product.nombre} loading="lazy" onerror={handleImageError} />
            <div class="product-card__badges">
              <span class="product-category-badge">{product.tipoMenu}</span>
              {#if product.reconocimiento}
                <span class="product-feature-badge">
                  {product.reconocimiento === 'Popular' ? '★ Popular' : '✦ Recomendado del chef'}
                </span>
              {/if}
            </div>
            {#if !product.available}<span class="sold-out-badge">Agotado</span>{/if}
          </div>
          <div class="product-card__details">
            <div class="product-card__title-row">
              <h3>{product.nombre}</h3>
              <strong class="product-price">S/ {product.precio.toFixed(2)}</strong>
            </div>
            <button
              class="button button--select"
              disabled={!product.available}
              onclick={() => addToCart(product)}
            >
              {product.available ? 'Agregar al carrito' : 'No disponible'}
            </button>
          </div>
        </article>
        {/each}
      </div>
    {:else}
      <div class="menu-empty-state" role="status">
        <span aria-hidden="true">⌕</span>
        <h3>No encontramos ese plato</h3>
        <p>Prueba con otro nombre o elige una categoría diferente.</p>
        {#if busqueda}
          <button class="button button--light" onclick={() => (busqueda = '')}>Limpiar búsqueda</button>
        {/if}
      </div>
    {/if}
  </section>

  <footer class="restaurant-footer">
    <p>Restaurante Cantuta · Muruhuay, Tarma, Junín</p>
    <p>Horario: todos los días, 11:00–22:00</p>
    <a href="https://maps.google.com/?q=Muruhuay%2C+Tarma%2C+Peru" target="_blank" rel="noreferrer">Cómo llegar</a>
    <a href="/auth/login">Acceso de personal</a>
  </footer>
</main>

<aside class="floating-cart-bar" aria-label="Resumen del carrito">
  <div class="floating-cart-bar__summary">
    <span class="floating-cart-bar__icon" aria-hidden="true">🛒</span>
    <span><strong>{itemCount} {itemCount === 1 ? 'plato' : 'platos'}</strong><small>Total con IGV</small></span>
    <strong class="floating-cart-bar__total">S/ {total.toFixed(2)}</strong>
  </div>
  <button class="button button--primary" onclick={() => (cartOpen = true)}>
    {itemCount ? 'Ver carrito' : 'Explorar carta'} <span aria-hidden="true">→</span>
  </button>
</aside>

{#if cartOpen}
  <div class="cart-backdrop" role="presentation" onclick={(event) => {
    if (event.target === event.currentTarget) cartOpen = false;
  }}>
    <div class="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title" tabindex="-1">
      <header class="cart-header">
        <div><p class="eyebrow">TU SELECCIÓN</p><h2 id="cart-title">Tu carrito <span>({itemCount})</span></h2></div>
        <div class="cart-header__actions">
          {#if cartDetails.length}
            <button class="clear-cart-button" onclick={clearCart}>Vaciar carrito</button>
          {/if}
          <button class="modal-close" aria-label="Cerrar carrito" onclick={() => (cartOpen = false)}>×</button>
        </div>
      </header>
      {#if cartDetails.length === 0}
        <div class="cart-empty"><span aria-hidden="true">🛒</span><h3>Tu carrito está vacío</h3><p>Explora la carta y agrega algo delicioso.</p><button class="button button--primary" onclick={() => (cartOpen = false)}>Ver la carta</button></div>
      {:else}
        <div class="cart-lines">
          {#each cartDetails as line (line.productId)}
            <article class="cart-line">
              <img src={line.product.imagen} alt="" onerror={handleImageError} />
              <div class="cart-line__main">
                <div class="cart-line__top"><strong>{line.product.nombre}</strong><span>S/ {(line.product.precio * line.cantidad).toFixed(2)}</span></div>
                <small>S/ {line.product.precio.toFixed(2)} c/u</small>
                <label class="sr-only" for={`note-${line.productId}`}>Nota para {line.product.nombre}</label>
                <input id={`note-${line.productId}`} class="cart-note" maxlength="250" placeholder="Nota: sin cebolla…" value={line.nota} oninput={(event) => updateNote(line.productId, event.currentTarget.value)} />
                <div class="quantity-control">
                  <button aria-label={`Quitar una porción de ${line.product.nombre}`} onclick={() => updateQuantity(line.productId, -1)}>−</button>
                  <span>{line.cantidad}</span>
                  <button aria-label={`Agregar una porción de ${line.product.nombre}`} onclick={() => updateQuantity(line.productId, 1)}>+</button>
                  <button class="quantity-control__remove" aria-label={`Eliminar ${line.product.nombre} del carrito`} onclick={() => removeFromCart(line.productId)}>🗑</button>
                </div>
              </div>
            </article>
          {/each}

          {#if quickSuggestions.length}
            <section class="cart-suggestions" aria-labelledby="cart-suggestions-title">
              <p class="eyebrow">UN TOQUE MÁS DE SABOR</p>
              <h3 id="cart-suggestions-title">¿Deseas agregar alguna bebida o postre?</h3>
              <div class="cart-suggestions__list">
                {#each quickSuggestions as suggestion (suggestion.id)}
                  <article class="cart-suggestion">
                    <img src={suggestion.imagen} alt="" onerror={handleImageError} />
                    <span><strong>{suggestion.nombre}</strong><small>S/ {suggestion.precio.toFixed(2)}</small></span>
                    <button aria-label={`Agregar ${suggestion.nombre}`} onclick={() => addSuggestion(suggestion)}>+</button>
                  </article>
                {/each}
              </div>
            </section>
          {/if}
        </div>
        <div class="cart-summary">
          <p><span>Subtotal</span><strong>S/ {subtotal.toFixed(2)}</strong></p>
          <p><span>IGV (18%)</span><strong>S/ {impuestos.toFixed(2)}</strong></p>
          <p class="cart-total"><span>Total</span><strong>S/ {total.toFixed(2)}</strong></p>
          {#if errorMessage}<p class="form-message form-message--error" role="alert">{errorMessage}</p>{/if}
          <button class="button button--primary cart-checkout" onclick={openCheckout}>Continuar al comprobante</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if customerModalOpen}
  <div class="modal-backdrop" role="presentation">
    <div class="restaurant-modal" role="dialog" aria-modal="true" aria-labelledby="customer-modal-title" tabindex="-1">
      <button class="modal-close" aria-label="Cerrar" onclick={() => {
        customerModalOpen = false;
        pendingProductId = null;
      }}>×</button>
      <div class="modal-icon" aria-hidden="true">♨</div>
      <p class="eyebrow">ANTES DE AGREGAR AL CARRITO</p>
      <h2 id="customer-modal-title">¿Cómo disfrutarás tu pedido?</h2>
      <p>Indica tus datos para consumo en mesa o para recibirlo por delivery.</p>
      <form class="access-form" onsubmit={submitCustomer}>
        <label for="order-customer-name">Nombre y apellidos</label>
        <input id="order-customer-name" bind:value={customerName} maxlength="100" autocomplete="name" required placeholder="Tu nombre" />
        <label for="order-type">Tipo de pedido</label>
        <select id="order-type" bind:value={orderType}>
          {#if data.meseroMode}
            <option value="mesa">Consumir en mesa</option>
          {:else}
            <option value="delivery">Delivery</option>
          {/if}
        </select>
        {#if orderType === 'mesa'}
          <label for="order-customer-table">Número de mesa</label>
          <select id="order-customer-table" bind:value={table} required>
            <option value="" disabled>Selecciona tu mesa</option>
            {#each tables as option}<option value={option}>{option}</option>{/each}
          </select>
        {:else}
          <label for="delivery-phone">Teléfono</label>
          <input id="delivery-phone" bind:value={customerPhone} type="tel" inputmode="tel" pattern="[+0-9 ()\\-]+" minlength="7" maxlength="20" autocomplete="tel" required placeholder="999 999 999" />
          <label for="delivery-address">Dirección de entrega</label>
          <textarea id="delivery-address" bind:value={deliveryAddress} minlength="5" maxlength="250" autocomplete="street-address" required placeholder="Calle, número, referencia"></textarea>
        {/if}
        {#if errorMessage}<p class="form-message form-message--error" role="alert">{errorMessage}</p>{/if}
        <button class="button button--primary" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Continuar y agregar'}</button>
      </form>
      <button class="text-button modal-cancel" onclick={() => {
        customerModalOpen = false;
        pendingProductId = null;
      }}>Seguir explorando como visitante</button>
    </div>
  </div>
{/if}

{#if checkoutOpen}
  <div class="modal-backdrop" role="presentation">
    <div class="restaurant-modal checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title" tabindex="-1">
      <button class="modal-close" aria-label="Cerrar" onclick={() => (checkoutOpen = false)}>×</button>
      <p class="eyebrow">ÚLTIMO PASO · {orderType === 'delivery' ? 'DELIVERY' : table || 'RESTAURANTE'}</p>
      <h2 id="checkout-title">Comprobante y pago</h2>
      <form class="access-form checkout-form" onsubmit={requestOrderConfirmation}>
        <label for="checkout-order-type">Tipo de pedido</label>
        <select id="checkout-order-type" bind:value={orderType}>
          {#if data.meseroMode}
            <option value="mesa">Consumir en el restaurante (mesa)</option>
          {:else}
            <option value="mesa">Consumir en el restaurante (mesa)</option>
            <option value="delivery">Delivery</option>
          {/if}
        </select>
        <label for="checkout-customer-name">Nombre completo y apellidos</label>
        <input id="checkout-customer-name" bind:value={customerName} maxlength="100" autocomplete="name" required />
        {#if orderType === 'mesa'}
          <label for="checkout-table">Número de mesa</label>
          <select id="checkout-table" bind:value={table} required>
            <option value="" disabled>Selecciona tu mesa</option>
            {#each tables as option}<option value={option}>{option}</option>{/each}
          </select>
        {:else}
          <label for="checkout-phone">Teléfono</label>
          <input id="checkout-phone" bind:value={customerPhone} type="tel" inputmode="tel" pattern="[+0-9 ()\\-]+" minlength="7" maxlength="20" autocomplete="tel" required />
          <label for="checkout-address">Dirección de entrega</label>
          <textarea id="checkout-address" bind:value={deliveryAddress} minlength="5" maxlength="250" autocomplete="street-address" required placeholder="Calle, número, referencia"></textarea>
        {/if}
        <fieldset class="receipt-options">
          <legend>Tipo de comprobante</legend>
          <label class:receipt-option--selected={receiptType === 'boleta'} class="receipt-option">
            <input type="radio" name="receipt" value="boleta" checked={receiptType === 'boleta'} onchange={() => selectReceiptType('boleta')} />
            <span><strong>Boleta</strong><small>Para consumo personal · predeterminada</small></span>
          </label>
          <label class:receipt-option--selected={receiptType === 'factura'} class="receipt-option">
            <input type="radio" name="receipt" value="factura" checked={receiptType === 'factura'} onchange={() => selectReceiptType('factura')} />
            <span><strong>Factura</strong><small>Ingresa RUC y razón social</small></span>
          </label>
        </fieldset>
        {#if receiptType === 'factura'}
          <label for="invoice-ruc">RUC (11 dígitos)</label>
          <input id="invoice-ruc" value={ruc} oninput={(event) => updateRuc(event.currentTarget.value)} inputmode="numeric" pattern="[0-9]{11}" minlength="11" maxlength="11" required placeholder="20123456789" />
          <small>Consulta simulada: al ingresar 11 dígitos se mostrará Restaurante Cantuta. No se consulta SUNAT.</small>
          <label for="invoice-business">Razón social</label>
          <input id="invoice-business" value={businessName} readonly placeholder="Aparecerá al ingresar el RUC" aria-live="polite" />
        {/if}
        <p class="payment-footnote">Boletas y facturas de demostración; no son comprobantes electrónicos ni tienen validez tributaria.</p>
        <label for="payment-method">Método de pago</label>
        <select id="payment-method" bind:value={paymentMethod}>
          <option value="yape_plin">Yape / Plin</option>
          <option value="tarjeta">Pasarela de tarjeta (pendiente de integración)</option>
          <option value="efectivo">Efectivo en caja</option>
        </select>
        <div class="payment-instructions">
          <strong>{paymentMethod === 'yape_plin' ? 'Yape / Plin' : paymentMethod === 'tarjeta' ? 'Pago con tarjeta' : 'Pago en caja'}</strong>
          {#if paymentMethod === 'yape_plin'}
            <p>Escanea este QR con Yape o realiza el pago desde Yape o Plin al número <strong class="yape-phone">{yapePhone}</strong>. Conserva el comprobante.</p>
            <div class="payment-qr-layout">
              <img class="payment-qr" src="/img/yape-qr.png" alt="Código QR de Yape para pagar a Maria Luisa Santos Zarate" />
              <aside class="payment-order-card" aria-label="Resumen del pedido para el pago">
                <span>{orderType === 'mesa' ? 'Consumo en mesa' : 'Pedido delivery'}</span>
                <strong>{orderType === 'mesa' ? table || 'Selecciona mesa' : 'Delivery'}</strong>
                <span>Total a pagar</span>
                <strong class="payment-order-card__total">S/ {total.toFixed(2)}</strong>
              </aside>
            </div>
          {:else}
            <p>{paymentMethod === 'tarjeta' ? 'La pasarela aún no está conectada; el personal confirmará el pago de forma segura.' : 'Paga en caja. El personal marcará el pedido como pagado al recibir el importe.'}</p>
          {/if}
        </div>
        <label for="payer-origin">Nombre originario del pagador</label>
        <input id="payer-origin" bind:value={payerName} maxlength="120" required placeholder="Nombre que figura en el pago" />
        <p class="payment-holder-preview" aria-live="polite">
          Titular que se registrará: <strong>{payerName.trim() || 'Escribe el nombre del pagador'}</strong>
          · El pago seguirá pendiente hasta su verificación por el personal.
        </p>
        <div class="cart-summary cart-summary--inline">
          <p><span>Subtotal</span><strong>S/ {subtotal.toFixed(2)}</strong></p>
          <p><span>IGV (18%)</span><strong>S/ {impuestos.toFixed(2)}</strong></p>
          <p class="cart-total"><span>Total</span><strong>S/ {total.toFixed(2)}</strong></p>
        </div>
        {#if errorMessage}<p class="form-message form-message--error" role="alert">{errorMessage}</p>{/if}
        <button class="button button--primary" type="submit" disabled={busy}>Revisar y confirmar pedido</button>
      </form>
      <p class="payment-footnote">El pedido quedará <strong>Pendiente de Confirmación</strong> hasta que el personal verifique el pago.</p>
    </div>
  </div>
{/if}

{#if orderReviewOpen}
  <div class="modal-backdrop order-review-backdrop" role="presentation">
    <div class="restaurant-modal order-review-modal" role="dialog" aria-modal="true" aria-labelledby="order-review-title" tabindex="-1">
      <button class="modal-close" aria-label="Cerrar revisión" onclick={() => (orderReviewOpen = false)}>×</button>
      <div class="modal-icon order-review-icon" aria-hidden="true">✓</div>
      <p class="eyebrow">REVISA ANTES DE ENVIAR</p>
      <h2 id="order-review-title">¿Enviamos tu pedido a cocina?</h2>
      <p class="order-review-customer">
        {customer?.nombre}
        · {orderType === 'delivery' ? `Delivery · ${customerPhone} · ${deliveryAddress}` : table}
        · {receiptType === 'factura' ? `Factura · RUC ${ruc}` : 'Boleta'}
      </p>
      <div class="order-review-items">
        {#each cartDetails as line (line.productId)}
          <p><span>{line.cantidad} × {line.product.nombre}</span><strong>S/ {(line.product.precio * line.cantidad).toFixed(2)}</strong></p>
        {/each}
      </div>
      <div class="cart-summary cart-summary--inline">
        <p><span>Subtotal</span><strong>S/ {subtotal.toFixed(2)}</strong></p>
        <p><span>IGV (18%)</span><strong>S/ {impuestos.toFixed(2)}</strong></p>
        <p class="cart-total"><span>Total a pagar</span><strong>S/ {total.toFixed(2)}</strong></p>
      </div>
      <p class="order-review-warning" role="alert">
        <strong>⚠️ Importante:</strong> Una vez confirmado y enviado a cocina, no podrás modificar ni cancelar este pedido.
      </p>
      {#if errorMessage}<p class="form-message form-message--error" role="alert">{errorMessage}</p>{/if}
      <div class="order-review-actions">
        <button class="button button--light" disabled={busy} onclick={() => {
          orderReviewOpen = false;
          checkoutOpen = false;
          cartOpen = false;
          document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' });
        }}>Agregar algo más</button>
        <button class="button button--primary" disabled={busy || cartDetails.length === 0} onclick={placeOrder}>
          {busy ? 'Enviando pedido…' : 'Sí, enviar pedido a cocina'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if orderConfirmation}
  <div class="modal-backdrop">
    <div class="restaurant-modal confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="order-confirm-title" tabindex="-1">
      <div class="confirmation-check">✓</div>
      <p class="eyebrow">PEDIDO RECIBIDO</p>
      <h2 id="order-confirm-title">¡Gracias, {orderConfirmation.cliente}!</h2>
      <p>
        Tu pedido {orderConfirmation.tipoPedido === 'delivery'
          ? `para delivery a ${orderConfirmation.direccion}`
          : `para ${orderConfirmation.mesa}`} quedó pendiente de confirmación.
      </p>
      <div class="confirmation-total"><span>Total</span><strong>S/ {orderConfirmation.total.toFixed(2)}</strong></div>
      <p class="payment-footnote">Pagador registrado: {orderConfirmation.nombrePagador}</p>
      <p class="payment-footnote">Comprobante simulado sin validez tributaria.</p>
      <button class="button button--primary" onclick={() => (orderConfirmation = null)}>Volver al menú</button>
    </div>
  </div>
{/if}

{#if notice}
  <div class="toast-notification" role="status" aria-live="polite">
    <span class="toast-notification__icon" aria-hidden="true">{notice.includes('agregado') ? '✓' : '!'}</span>
    <span>{notice}</span>
  </div>
{/if}
