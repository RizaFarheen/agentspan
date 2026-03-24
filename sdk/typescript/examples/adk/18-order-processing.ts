/**
 * Order Processing -- End-to-end order management agent.
 *
 * Mirrors the order-processing ADK sample. A single agent handles the
 * complete order lifecycle: search, cart, pricing, and order placement.
 *
 * Requirements:
 *   - Conductor server with Google Gemini LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Tools -----------------------------------------------------------------

function searchCatalog(query: string, category: string = 'all'): Record<string, unknown> {
  const catalog = [
    { sku: 'LAP-001', name: 'ProBook Laptop 15"', category: 'laptops', price: 1299.99, stock: 23 },
    { sku: 'LAP-002', name: 'UltraSlim Notebook 13"', category: 'laptops', price: 899.99, stock: 45 },
    { sku: 'ACC-001', name: 'Wireless Mouse', category: 'accessories', price: 29.99, stock: 200 },
    { sku: 'ACC-002', name: 'USB-C Dock', category: 'accessories', price: 79.99, stock: 67 },
    { sku: 'MON-001', name: '4K Monitor 27"', category: 'monitors', price: 449.99, stock: 12 },
  ];
  let results = catalog.filter((item) => {
    if (category !== 'all' && item.category !== category) return false;
    if (query.toLowerCase() !== '' && (item.name.toLowerCase().includes(query.toLowerCase()) || item.category.includes(query.toLowerCase()))) return true;
    return category !== 'all';
  });
  if (results.length === 0) results = catalog.filter((item) => category === 'all' || item.category === category);
  return { results: results.slice(0, 5), total_found: results.length };
}

function checkStock(sku: string): Record<string, unknown> {
  const stockData: Record<string, Record<string, unknown>> = {
    'LAP-001': { available: true, quantity: 23, warehouse: 'West' },
    'LAP-002': { available: true, quantity: 45, warehouse: 'East' },
    'ACC-001': { available: true, quantity: 200, warehouse: 'Central' },
    'ACC-002': { available: true, quantity: 67, warehouse: 'Central' },
    'MON-001': { available: true, quantity: 12, warehouse: 'West' },
  };
  return stockData[sku.toUpperCase()] ?? { available: false, quantity: 0 };
}

function calculateTotal(itemSkus: string, shippingMethod: string = 'standard'): Record<string, unknown> {
  const items = itemSkus.split(',').map((s) => s.trim());
  const prices: Record<string, number> = { 'LAP-001': 1299.99, 'LAP-002': 899.99, 'ACC-001': 29.99, 'ACC-002': 79.99, 'MON-001': 449.99 };
  const shippingRates: Record<string, number> = { standard: 9.99, express: 24.99, overnight: 49.99 };
  const subtotal = items.reduce((sum, sku) => sum + (prices[sku] ?? 0), 0);
  const tax = Math.round(subtotal * 0.085 * 100) / 100;
  const shipping = shippingRates[shippingMethod] ?? 9.99;
  const total = Math.round((subtotal + tax + shipping) * 100) / 100;
  return { subtotal, tax, shipping, shipping_method: shippingMethod, total };
}

function placeOrder(itemSkus: string, shippingMethod: string = 'standard', paymentMethod: string = 'credit_card'): Record<string, unknown> {
  const items = itemSkus.split(',').map((s) => s.trim());
  return {
    order_id: 'ORD-2025-0789',
    status: 'confirmed',
    items,
    shipping_method: shippingMethod,
    payment_method: paymentMethod,
    estimated_delivery: shippingMethod === 'standard' ? '2025-04-22' : '2025-04-18',
  };
}

// -- Mock ADK Agent --------------------------------------------------------

const agent = {
  run: async (prompt: string) => ({ output: `Order: ${prompt}` }),
  model: llmModel,
  name: 'order_processor',
  instruction:
    'You are an order processing assistant for TechMart. ' +
    'Help customers search products, check availability, calculate totals, and place orders. ' +
    'Always verify stock before confirming an order. Provide clear pricing breakdowns.',
  tools: [
    { name: 'search_catalog', description: 'Search the product catalog.', fn: searchCatalog, parameters: { type: 'object', properties: { query: { type: 'string' }, category: { type: 'string' } }, required: ['query'] } },
    { name: 'check_stock', description: 'Check real-time stock availability for a SKU.', fn: checkStock, parameters: { type: 'object', properties: { sku: { type: 'string' } }, required: ['sku'] } },
    { name: 'calculate_total', description: 'Calculate order total with tax and shipping.', fn: calculateTotal, parameters: { type: 'object', properties: { item_skus: { type: 'string' }, shipping_method: { type: 'string' } }, required: ['item_skus'] } },
    { name: 'place_order', description: 'Place an order.', fn: placeOrder, parameters: { type: 'object', properties: { item_skus: { type: 'string' }, shipping_method: { type: 'string' }, payment_method: { type: 'string' } }, required: ['item_skus'] } },
  ],
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    agent,
    "I need a laptop for work. Show me what's available, check stock for your recommendation, " +
      'and calculate the total with express shipping.',
  );
  console.log(`Status: ${result.status}`);
  console.log(`Output: ${result.output}`);
} finally {
  await runtime.shutdown();
}
