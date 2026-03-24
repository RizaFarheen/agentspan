/**
 * Google ADK Agent with Function Tools -- tool calling via plain functions.
 *
 * Demonstrates:
 *   - Defining tools as plain functions (ADK auto-converts them)
 *   - Multiple tools with typed parameters
 *   - The Conductor runtime auto-extracts callables, registers them as
 *     workers, and the server normalizes them into worker tasks.
 *
 * Requirements:
 *   - Conductor server with Google Gemini LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Tools -----------------------------------------------------------------

function getWeather(city: string): Record<string, unknown> {
  const weatherData: Record<string, Record<string, unknown>> = {
    tokyo: { temp_c: 22, condition: 'Clear', humidity: 65 },
    paris: { temp_c: 18, condition: 'Partly Cloudy', humidity: 72 },
    sydney: { temp_c: 25, condition: 'Sunny', humidity: 58 },
    mumbai: { temp_c: 32, condition: 'Humid', humidity: 85 },
  };
  const data = weatherData[city.toLowerCase()] ?? { temp_c: 20, condition: 'Unknown', humidity: 50 };
  return { city, ...data };
}

function convertTemperature(tempCelsius: number, toUnit: string = 'fahrenheit'): Record<string, unknown> {
  if (toUnit.toLowerCase() === 'fahrenheit') {
    const converted = tempCelsius * 9 / 5 + 32;
    return { celsius: tempCelsius, fahrenheit: Math.round(converted * 10) / 10 };
  } else if (toUnit.toLowerCase() === 'kelvin') {
    const converted = tempCelsius + 273.15;
    return { celsius: tempCelsius, kelvin: Math.round(converted * 10) / 10 };
  }
  return { error: `Unknown unit: ${toUnit}` };
}

function getTimeZone(city: string): Record<string, unknown> {
  const timezones: Record<string, Record<string, string>> = {
    tokyo: { timezone: 'JST', utc_offset: '+9:00' },
    paris: { timezone: 'CET', utc_offset: '+1:00' },
    sydney: { timezone: 'AEST', utc_offset: '+10:00' },
    mumbai: { timezone: 'IST', utc_offset: '+5:30' },
  };
  return timezones[city.toLowerCase()] ?? { timezone: 'Unknown', utc_offset: 'Unknown' };
}

// -- Mock ADK Agent --------------------------------------------------------

const adkTools = [
  {
    name: 'get_weather',
    description: 'Get the current weather for a city.',
    fn: getWeather,
    parameters: {
      type: 'object',
      properties: { city: { type: 'string', description: 'Name of the city to get weather for.' } },
      required: ['city'],
    },
  },
  {
    name: 'convert_temperature',
    description: 'Convert temperature between Celsius and Fahrenheit.',
    fn: convertTemperature,
    parameters: {
      type: 'object',
      properties: {
        temp_celsius: { type: 'number', description: 'Temperature in Celsius.' },
        to_unit: { type: 'string', description: 'Target unit -- "fahrenheit" or "kelvin".' },
      },
      required: ['temp_celsius'],
    },
  },
  {
    name: 'get_time_zone',
    description: 'Get the timezone for a city.',
    fn: getTimeZone,
    parameters: {
      type: 'object',
      properties: { city: { type: 'string', description: 'Name of the city.' } },
      required: ['city'],
    },
  },
];

const agent = {
  run: async (prompt: string) => ({ output: `Travel: ${prompt}` }),
  model: llmModel,
  name: 'travel_assistant',
  instruction:
    'You are a travel assistant. Help users with weather information, ' +
    'temperature conversions, and timezone lookups. Be concise and accurate.',
  tools: adkTools,
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    agent,
    "What's the weather in Tokyo right now? Convert the temperature to " +
      "Fahrenheit and tell me what timezone they're in.",
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
