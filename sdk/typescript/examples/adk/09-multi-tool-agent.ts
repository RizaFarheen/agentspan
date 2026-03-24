/**
 * Google ADK Agent with Multiple Specialized Tools -- complex tool orchestration.
 *
 * Demonstrates:
 *   - Multiple tools working together for a complex task
 *   - Tools with various parameter types and return structures
 *   - Best practice: dict returns with "status" field
 *
 * Requirements:
 *   - Conductor server with Google Gemini LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Tools -----------------------------------------------------------------

function searchProducts(query: string, category: string = 'all', maxResults: number = 5): Record<string, unknown> {
  const products = [
    { id: 'P001', name: 'Wireless Mouse', category: 'electronics', price: 29.99, rating: 4.5 },
    { id: 'P002', name: 'Python Cookbook', category: 'books', price: 45.00, rating: 4.8 },
    { id: 'P003', name: 'USB-C Hub', category: 'electronics', price: 39.99, rating: 4.2 },
    { id: 'P004', name: 'Ergonomic Keyboard', category: 'electronics', price: 89.99, rating: 4.7 },
    { id: 'P005', name: 'Clean Code', category: 'books', price: 35.00, rating: 4.9 },
  ];
  const queryLower = query.toLowerCase();
  const results = products.filter(
    (p) => queryLower === '' || p.name.toLowerCase().includes(queryLower) || (category !== 'all' && p.category === category),
  );
  return { status: 'success', results: results.slice(0, maxResults), total: results.length };
}

function checkInventory(productId: string): Record<string, unknown> {
  const inventory: Record<string, Record<string, unknown>> = {
    P001: { in_stock: true, quantity: 150, warehouse: 'West' },
    P002: { in_stock: true, quantity: 45, warehouse: 'East' },
    P003: { in_stock: false, quantity: 0, restock_date: '2025-04-01' },
    P004: { in_stock: true, quantity: 8, warehouse: 'West' },
    P005: { in_stock: true, quantity: 200, warehouse: 'East' },
  };
  const item = inventory[productId];
  if (item) return { status: 'success', product_id: productId, ...item };
  return { status: 'error', message: `Product ${productId} not found` };
}

function calculateShipping(productIds: string[], destination: string): Record<string, unknown> {
  const baseCost = productIds.length * 5.99;
  return {
    status: 'success',
    destination,
    items: productIds.length,
    options: [
      { method: 'Standard (5-7 days)', cost: `$${baseCost.toFixed(2)}` },
      { method: 'Express (2-3 days)', cost: `$${(baseCost * 1.8).toFixed(2)}` },
      { method: 'Overnight', cost: `$${(baseCost * 3).toFixed(2)}` },
    ],
  };
}

function applyCoupon(subtotal: number, couponCode: string): Record<string, unknown> {
  const coupons: Record<string, { type: string; value: number }> = {
    SAVE10: { type: 'percentage', value: 10 },
    FLAT20: { type: 'fixed', value: 20 },
    FREESHIP: { type: 'shipping', value: 0 },
  };
  const coupon = coupons[couponCode.toUpperCase()];
  if (!coupon) return { status: 'error', message: `Invalid coupon: ${couponCode}` };

  let discount = 0;
  if (coupon.type === 'percentage') discount = subtotal * coupon.value / 100;
  else if (coupon.type === 'fixed') discount = Math.min(coupon.value, subtotal);

  return {
    status: 'success',
    coupon: couponCode,
    discount: `$${discount.toFixed(2)}`,
    final_price: `$${(subtotal - discount).toFixed(2)}`,
  };
}

// -- Mock ADK Agent --------------------------------------------------------

const agent = {
  run: async (prompt: string) => ({ output: `Shopping: ${prompt}` }),
  model: llmModel,
  name: 'shopping_assistant',
  instruction:
    'You are a helpful shopping assistant. Help users find products, ' +
    'check availability, calculate shipping, and apply coupons. ' +
    'Always check inventory before recommending products. ' +
    'Present information in a clear, organized format.',
  tools: [
    {
      name: 'search_products',
      description: 'Search the product catalog.',
      fn: searchProducts,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          category: { type: 'string' },
          max_results: { type: 'number' },
        },
        required: ['query'],
      },
    },
    {
      name: 'check_inventory',
      description: 'Check inventory availability for a product.',
      fn: checkInventory,
      parameters: {
        type: 'object',
        properties: { product_id: { type: 'string' } },
        required: ['product_id'],
      },
    },
    {
      name: 'calculate_shipping',
      description: 'Calculate shipping cost for a list of products.',
      fn: calculateShipping,
      parameters: {
        type: 'object',
        properties: {
          product_ids: { type: 'array', items: { type: 'string' } },
          destination: { type: 'string' },
        },
        required: ['product_ids', 'destination'],
      },
    },
    {
      name: 'apply_coupon',
      description: 'Apply a coupon code to calculate the discount.',
      fn: applyCoupon,
      parameters: {
        type: 'object',
        properties: {
          subtotal: { type: 'number' },
          coupon_code: { type: 'string' },
        },
        required: ['subtotal', 'coupon_code'],
      },
    },
  ],
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    agent,
    "I'm looking for electronics. Show me what you have, check if they're " +
      'in stock, and calculate shipping to San Francisco. I have coupon code SAVE10.',
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
