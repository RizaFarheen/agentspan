/**
 * Google ADK Agent with Sub-Agents -- multi-agent orchestration.
 *
 * Demonstrates:
 *   - Defining specialist sub-agents with tools
 *   - A coordinator agent that routes to specialists via sub_agents
 *   - The server normalizer maps sub_agents to agents + strategy="handoff"
 *
 * Requirements:
 *   - Conductor server with Google Gemini LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Specialist tools ------------------------------------------------------

function searchFlights(origin: string, destination: string, date: string): Record<string, unknown> {
  return {
    flights: [
      { airline: 'SkyLine', departure: '08:00', arrival: '11:30', price: '$320' },
      { airline: 'AirGlobe', departure: '14:00', arrival: '17:45', price: '$285' },
    ],
    route: `${origin} -> ${destination}`,
    date,
  };
}

function searchHotels(city: string, checkin: string, checkout: string): Record<string, unknown> {
  return {
    hotels: [
      { name: 'Grand Plaza', rating: 4.5, price: '$180/night' },
      { name: 'City Comfort Inn', rating: 4.0, price: '$95/night' },
      { name: 'Boutique Lux', rating: 4.8, price: '$250/night' },
    ],
    city,
    dates: `${checkin} to ${checkout}`,
  };
}

function getTravelAdvisory(country: string): Record<string, unknown> {
  const advisories: Record<string, Record<string, string>> = {
    japan: { level: 'Level 1 - Exercise Normal Precautions', visa: 'Visa-free for 90 days' },
    france: { level: 'Level 2 - Exercise Increased Caution', visa: 'Schengen visa required' },
    australia: { level: 'Level 1 - Exercise Normal Precautions', visa: 'eVisitor visa required' },
  };
  return advisories[country.toLowerCase()] ?? { level: 'Unknown', visa: 'Check embassy website' };
}

// -- Specialist agents -----------------------------------------------------

const flightAgent = {
  run: async (prompt: string) => ({ output: `Flights: ${prompt}` }),
  model: llmModel,
  name: 'flight_specialist',
  description: 'Handles flight searches and booking inquiries.',
  instruction: 'You are a flight specialist. Search for flights and present options clearly with prices and schedules.',
  tools: [
    {
      name: 'search_flights',
      description: 'Search for available flights.',
      fn: searchFlights,
      parameters: {
        type: 'object',
        properties: {
          origin: { type: 'string' },
          destination: { type: 'string' },
          date: { type: 'string' },
        },
        required: ['origin', 'destination', 'date'],
      },
    },
  ],
  _google_adk: true,
};

const hotelAgent = {
  run: async (prompt: string) => ({ output: `Hotels: ${prompt}` }),
  model: llmModel,
  name: 'hotel_specialist',
  description: 'Handles hotel searches and accommodation inquiries.',
  instruction: 'You are a hotel specialist. Search for hotels and present options with ratings and prices.',
  tools: [
    {
      name: 'search_hotels',
      description: 'Search for available hotels.',
      fn: searchHotels,
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string' },
          checkin: { type: 'string' },
          checkout: { type: 'string' },
        },
        required: ['city', 'checkin', 'checkout'],
      },
    },
  ],
  _google_adk: true,
};

const advisoryAgent = {
  run: async (prompt: string) => ({ output: `Advisory: ${prompt}` }),
  model: llmModel,
  name: 'travel_advisory_specialist',
  description: 'Provides travel advisories, visa requirements, and safety information.',
  instruction: 'You are a travel advisory specialist. Provide safety levels and visa requirements for destinations.',
  tools: [
    {
      name: 'get_travel_advisory',
      description: 'Get travel advisory information for a country.',
      fn: getTravelAdvisory,
      parameters: {
        type: 'object',
        properties: { country: { type: 'string' } },
        required: ['country'],
      },
    },
  ],
  _google_adk: true,
};

// -- Coordinator agent -----------------------------------------------------

const coordinator = {
  run: async (prompt: string) => ({ output: `Coordinator: ${prompt}` }),
  model: llmModel,
  name: 'travel_coordinator',
  instruction:
    "You are a travel planning coordinator. When a user wants to plan a trip:\n" +
    "1. Use the travel advisory specialist to check safety and visa info\n" +
    "2. Use the flight specialist to find flights\n" +
    "3. Use the hotel specialist to find accommodation\n" +
    "Route the user's request to the appropriate specialist.",
  sub_agents: [flightAgent, hotelAgent, advisoryAgent],
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    coordinator,
    'I want to plan a trip to Japan. I need a flight from San Francisco ' +
      "on 2025-04-15 and a hotel for 5 nights. Also, what's the travel advisory?",
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
