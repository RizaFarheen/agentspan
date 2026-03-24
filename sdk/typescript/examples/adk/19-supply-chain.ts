/**
 * Supply Chain -- Multi-agent supply chain management.
 *
 * Mirrors the supply-chain ADK sample. A coordinator delegates to
 * inventory, logistics, and demand forecasting specialists.
 *
 * Requirements:
 *   - Conductor server with Google Gemini LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Inventory tools -------------------------------------------------------

function getInventoryLevels(warehouse: string): Record<string, unknown> {
  const warehouses: Record<string, Record<string, unknown>> = {
    west: {
      warehouse: 'West Coast',
      items: [
        { sku: 'WIDGET-A', quantity: 5000, reorder_point: 2000 },
        { sku: 'WIDGET-B', quantity: 1200, reorder_point: 1500 },
        { sku: 'GADGET-X', quantity: 800, reorder_point: 500 },
      ],
    },
    east: {
      warehouse: 'East Coast',
      items: [
        { sku: 'WIDGET-A', quantity: 3200, reorder_point: 2000 },
        { sku: 'WIDGET-B', quantity: 4500, reorder_point: 1500 },
        { sku: 'GADGET-X', quantity: 200, reorder_point: 500 },
      ],
    },
  };
  return warehouses[warehouse.toLowerCase()] ?? { error: `Warehouse '${warehouse}' not found` };
}

function checkSupplierStatus(sku: string): Record<string, unknown> {
  const suppliers: Record<string, Record<string, unknown>> = {
    'WIDGET-A': { supplier: 'WidgetCorp', lead_time_days: 14, min_order: 1000, unit_cost: 2.50 },
    'WIDGET-B': { supplier: 'WidgetCorp', lead_time_days: 21, min_order: 500, unit_cost: 4.75 },
    'GADGET-X': { supplier: 'GadgetWorks', lead_time_days: 30, min_order: 200, unit_cost: 12.00 },
  };
  return suppliers[sku.toUpperCase()] ?? { error: `No supplier for SKU ${sku}` };
}

// -- Logistics tools -------------------------------------------------------

function getShippingRoutes(origin: string, destination: string): Record<string, unknown> {
  return {
    origin, destination,
    routes: [
      { method: 'Ground', transit_days: 5, cost_per_unit: 0.50 },
      { method: 'Rail', transit_days: 3, cost_per_unit: 0.75 },
      { method: 'Air', transit_days: 1, cost_per_unit: 2.00 },
    ],
  };
}

function getPendingShipments(): Record<string, unknown> {
  return {
    shipments: [
      { id: 'SHP-001', sku: 'WIDGET-A', qty: 2000, status: 'in_transit', eta: '2025-04-18' },
      { id: 'SHP-002', sku: 'GADGET-X', qty: 500, status: 'processing', eta: '2025-05-01' },
    ],
  };
}

// -- Demand tools ----------------------------------------------------------

function getDemandForecast(sku: string, weeksAhead: number = 4): Record<string, unknown> {
  const forecasts: Record<string, Record<string, unknown>> = {
    'WIDGET-A': { weekly_demand: 800, trend: 'increasing', confidence: 0.85 },
    'WIDGET-B': { weekly_demand: 300, trend: 'stable', confidence: 0.90 },
    'GADGET-X': { weekly_demand: 150, trend: 'decreasing', confidence: 0.75 },
  };
  const data = forecasts[sku.toUpperCase()] ?? { weekly_demand: 0, trend: 'unknown' };
  const weeklyDemand = (data.weekly_demand as number) ?? 0;
  return { sku, weeks_ahead: weeksAhead, ...data, total_forecast: weeklyDemand * weeksAhead };
}

// -- Sub-agents ------------------------------------------------------------

const inventoryAgent = {
  run: async (prompt: string) => ({ output: `Inventory: ${prompt}` }),
  model: llmModel, name: 'inventory_manager',
  description: 'Manages inventory levels and supplier relationships.',
  instruction: 'Check inventory levels and supplier status. Flag items below reorder points.',
  tools: [
    { name: 'get_inventory_levels', description: 'Get current inventory levels at a warehouse.', fn: getInventoryLevels, parameters: { type: 'object', properties: { warehouse: { type: 'string' } }, required: ['warehouse'] } },
    { name: 'check_supplier_status', description: 'Check supplier availability and lead times.', fn: checkSupplierStatus, parameters: { type: 'object', properties: { sku: { type: 'string' } }, required: ['sku'] } },
  ],
  _google_adk: true,
};

const logisticsAgent = {
  run: async (prompt: string) => ({ output: `Logistics: ${prompt}` }),
  model: llmModel, name: 'logistics_coordinator',
  description: 'Handles shipping routes and shipment tracking.',
  instruction: 'Find optimal shipping routes and track pending shipments.',
  tools: [
    { name: 'get_shipping_routes', description: 'Get available shipping routes between warehouses.', fn: getShippingRoutes, parameters: { type: 'object', properties: { origin: { type: 'string' }, destination: { type: 'string' } }, required: ['origin', 'destination'] } },
    { name: 'get_pending_shipments', description: 'Get all pending shipments in the system.', fn: getPendingShipments, parameters: { type: 'object', properties: {} } },
  ],
  _google_adk: true,
};

const demandAgent = {
  run: async (prompt: string) => ({ output: `Demand: ${prompt}` }),
  model: llmModel, name: 'demand_planner',
  description: 'Forecasts product demand.',
  instruction: 'Analyze demand forecasts and identify trends.',
  tools: [
    { name: 'get_demand_forecast', description: 'Get demand forecast for a SKU.', fn: getDemandForecast, parameters: { type: 'object', properties: { sku: { type: 'string' }, weeks_ahead: { type: 'number' } }, required: ['sku'] } },
  ],
  _google_adk: true,
};

const coordinator = {
  run: async (prompt: string) => ({ output: `SC: ${prompt}` }),
  model: llmModel, name: 'supply_chain_coordinator',
  instruction:
    'You are a supply chain coordinator. Analyze inventory, logistics, and demand. ' +
    'Identify items that need restocking, recommend optimal shipping, and provide ' +
    'an action plan. Delegate to the appropriate specialist.',
  sub_agents: [inventoryAgent, logisticsAgent, demandAgent],
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    coordinator,
    'Give me a full supply chain status report. Check both warehouses, ' +
      'identify any items below reorder points, and recommend restocking actions.',
  );
  console.log(`Status: ${result.status}`);
  console.log(`Output: ${result.output}`);
} finally {
  await runtime.shutdown();
}
