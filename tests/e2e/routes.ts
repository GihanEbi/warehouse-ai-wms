/** Every top-level route that must render a real page (no placeholders, no 404s). */
export const MAIN_ROUTES: { path: string; slug: string; title: RegExp }[] = [
  { path: "/dashboard", slug: "dashboard", title: /dashboard/i },
  { path: "/ai-assistant", slug: "ai-assistant", title: /assistant/i },
  { path: "/notifications", slug: "notifications", title: /notifications/i },
  { path: "/warehouses", slug: "warehouses", title: /warehouses/i },
  { path: "/products", slug: "products", title: /products/i },
  { path: "/inventory", slug: "inventory", title: /inventory/i },
  { path: "/suppliers", slug: "suppliers", title: /suppliers/i },
  { path: "/purchase-orders", slug: "purchase-orders", title: /purchase orders/i },
  { path: "/receiving", slug: "receiving", title: /receiving/i },
  { path: "/transfers", slug: "transfers", title: /transfers/i },
  { path: "/orders", slug: "orders", title: /orders/i },
  { path: "/picking-packing", slug: "picking-packing", title: /picking/i },
  { path: "/shipping", slug: "shipping", title: /shipping/i },
  { path: "/returns", slug: "returns", title: /returns/i },
  { path: "/tasks", slug: "tasks", title: /tasks/i },
  { path: "/reports", slug: "reports", title: /reports/i },
  { path: "/users", slug: "users", title: /users/i },
  { path: "/settings", slug: "settings", title: /settings/i },
];

export const CREATE_ROUTES = ["/purchase-orders/new", "/orders/new", "/transfers/new", "/returns/new", "/receiving/new"];
