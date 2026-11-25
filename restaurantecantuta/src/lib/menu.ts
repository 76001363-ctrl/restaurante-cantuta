export type MenuCategory = 'Comidas' | 'Bebidas' | 'Postres' | 'Cervezas';

export type MenuProduct = {
  id: string;
  nombre: string;
  precio: number;
  imagen: string;
  categoria: MenuCategory;
  tipoMenu: 'Entradas' | 'Fondos' | 'Bebidas' | 'Postres';
  reconocimiento?: 'Popular' | 'Recomendado del chef';
  available: boolean;
};

export const menuProducts: MenuProduct[] = [
  { id: 'lomo-saltado', nombre: 'Lomo Saltado', precio: 35, imagen: '/img/lomosaltado7.webp', categoria: 'Comidas', tipoMenu: 'Fondos', reconocimiento: 'Recomendado del chef', available: true },
  { id: 'ceviche-mixto', nombre: 'Ceviche de Trucha', precio: 39, imagen: '/img/ceviche8.webp', categoria: 'Comidas', tipoMenu: 'Entradas', reconocimiento: 'Popular', available: true },
  { id: 'chicharron-cerdo', nombre: 'Chicharrón de Cerdo', precio: 30, imagen: '/img/chicharron5.jpg', categoria: 'Comidas', tipoMenu: 'Fondos', available: true },
  { id: 'papa-rellena', nombre: 'Papa Rellena', precio: 20, imagen: '/img/paparellena3.webp', categoria: 'Comidas', tipoMenu: 'Entradas', reconocimiento: 'Popular', available: true },
  { id: 'pachamanca', nombre: 'Pachamanca', precio: 30, imagen: '/img/pachamanca-plato.webp', categoria: 'Comidas', tipoMenu: 'Fondos', available: true },
  { id: 'trucha-frita', nombre: 'Trucha Frita', precio: 28, imagen: '/img/trucha-frita.png', categoria: 'Comidas', tipoMenu: 'Fondos', available: true },
  { id: 'cuy-chactado', nombre: 'Cuy Chactado Entero', precio: 80, imagen: '/img/cuy.jpg', categoria: 'Comidas', tipoMenu: 'Fondos', available: true },
  { id: 'cuy-picante', nombre: 'Cuy Picante', precio: 35, imagen: '/img/cuy picante.jpg', categoria: 'Comidas', tipoMenu: 'Fondos', available: true },
  { id: 'chicha-morada', nombre: 'Chicha Morada (1.5L)', precio: 18, imagen: '/img/chica morada.jpg', categoria: 'Bebidas', tipoMenu: 'Bebidas', available: true },
  { id: 'chicha-frozen', nombre: 'Limonada Frozen', precio: 18, imagen: '/img/limonada-frozen.png', categoria: 'Bebidas', tipoMenu: 'Bebidas', available: true },
  { id: 'chicha-jora', nombre: 'Chicha de Jora', precio: 18, imagen: '/img/jora.jpg', categoria: 'Bebidas', tipoMenu: 'Bebidas', available: true },
  { id: 'munya', nombre: 'Muña', precio: 12, imagen: '/img/nuña.jpg', categoria: 'Bebidas', tipoMenu: 'Bebidas', available: true },
  { id: 'jugo-papaya', nombre: 'Jugo de Papaya', precio: 16, imagen: '/img/jugo-papaya.png', categoria: 'Bebidas', tipoMenu: 'Bebidas', available: true },
  { id: 'jugo-pina', nombre: 'Jugo de Piña', precio: 16, imagen: '/img/pina.jpg', categoria: 'Bebidas', tipoMenu: 'Bebidas', available: true },
  { id: 'inka-kola', nombre: 'Inka Kola (1.5L)', precio: 13, imagen: '/img/inca cola.webp', categoria: 'Bebidas', tipoMenu: 'Bebidas', available: true },
  { id: 'coca-cola', nombre: 'Coca Cola (1.5L)', precio: 13, imagen: '/img/coca cola.jpg', categoria: 'Bebidas', tipoMenu: 'Bebidas', available: true },
  { id: 'helado-artesanal', nombre: 'Helado Artesanal', precio: 12, imagen: '/img/helados.jpg', categoria: 'Postres', tipoMenu: 'Postres', available: true },
  { id: 'mazamorra-morada', nombre: 'Mazamorra Morada', precio: 8, imagen: '/img/masamorra morada.jpg', categoria: 'Postres', tipoMenu: 'Postres', reconocimiento: 'Popular', available: true },
  { id: 'arroz-con-leche', nombre: 'Arroz con Leche', precio: 8, imagen: '/img/arroz-con-leche.png', categoria: 'Postres', tipoMenu: 'Postres', available: true },
  { id: 'nata', nombre: 'Nata', precio: 5, imagen: '/img/nata.jpg', categoria: 'Postres', tipoMenu: 'Postres', available: true },
  { id: 'pay-manzana', nombre: 'Pay de Manzana', precio: 7, imagen: '/img/pay-de-manzana.png', categoria: 'Postres', tipoMenu: 'Postres', available: true },
  { id: 'tartaletas-frutos-rojos', nombre: 'Mini Tartaletas de Frutos Rojos', precio: 12, imagen: '/img/tartaletas-frutos-rojos.png', categoria: 'Postres', tipoMenu: 'Postres', available: true },
  { id: 'torta-helada', nombre: 'Torta Helada', precio: 8, imagen: '/img/torta-helada.png', categoria: 'Postres', tipoMenu: 'Postres', available: true },
  { id: 'mil-hojas', nombre: 'Pastel Mil Hojas', precio: 5, imagen: '/img/100 hojas.jpg', categoria: 'Postres', tipoMenu: 'Postres', available: true },
  { id: 'cusquena', nombre: 'Cusqueña', precio: 10, imagen: '/img/cusqueña.jpg', categoria: 'Cervezas', tipoMenu: 'Bebidas', available: true },
  { id: 'pilsen-callao', nombre: 'Pilsen Callao', precio: 9, imagen: '/img/pinsel.jpg', categoria: 'Cervezas', tipoMenu: 'Bebidas', available: true },
  { id: 'cristal', nombre: 'Cristal', precio: 8, imagen: '/img/cristal.jpg', categoria: 'Cervezas', tipoMenu: 'Bebidas', available: true }
];

export type CustomerSession = {
  nombre: string;
  mesa: string;
};

export type OrderItem = {
  productId: string;
  nombre: string;
  cantidad: number;
  precio: number;
  nota: string;
};

export type RestaurantOrder = {
  id: string;
  createdAt: string;
  cliente: string;
  mesa: string;
  tipoPedido: 'delivery' | 'mesa';
  telefono: string | null;
  direccion: string | null;
  items: OrderItem[];
  subtotal: number;
  impuestos: number;
  total: number;
  comprobante: 'boleta' | 'factura';
  ruc: string | null;
  razonSocial: string | null;
  metodoPago: 'yape_plin' | 'tarjeta' | 'efectivo';
  nombrePagador: string;
  estado: 'pending_confirmation' | 'paid' | 'completed';
  pagoEstado: 'pending_confirmation' | 'paid';
  cocinaEstado: 'new' | 'preparing' | 'ready';
  salonEstado: 'active' | 'served' | 'bill_requested';
};

export type RestaurantTable = {
  mesa: string;
  estado: 'disponible' | 'ocupada' | 'servida' | 'pendiente_pago';
};

export function normalizeTable(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  const match = /^(?:mesa\s*)?(\d{1,2})$/i.exec(raw);
  if (!match) return null;
  const tableNumber = Number(match[1]);
  return tableNumber >= 1 && tableNumber <= 16 ? `Mesa ${tableNumber}` : null;
}

export function getTableStatuses(orders: RestaurantOrder[]): RestaurantTable[] {
  const activeOrdersByTable = new Map<string, RestaurantOrder[]>();
  for (const order of orders) {
    if (order.tipoPedido !== 'mesa' || order.estado === 'completed') continue;
    const activeOrders = activeOrdersByTable.get(order.mesa) ?? [];
    activeOrders.push(order);
    activeOrdersByTable.set(order.mesa, activeOrders);
  }

  return Array.from({ length: 16 }, (_, index) => {
    const mesa = `Mesa ${index + 1}`;
    const activeOrders = activeOrdersByTable.get(mesa) ?? [];
    return {
      mesa,
      estado: !activeOrders.length
        ? 'disponible'
        : activeOrders.some((order) => order.salonEstado === 'active')
          ? 'ocupada'
          : activeOrders.some((order) => order.salonEstado === 'bill_requested')
          ? 'pendiente_pago'
          : 'servida'
    };
  });
}
