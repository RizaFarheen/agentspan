/**
 * Short Movie Pipeline -- sequential content generation stages.
 *
 * Demonstrates:
 *   - SequentialAgent with 5 specialized stages
 *   - Each stage builds on previous output (concept -> script -> visuals -> audio -> assembly)
 *   - Tools at each stage for structured output
 *
 * Requirements:
 *   - Conductor server
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Stage tools -----------------------------------------------------------

function createConcept(title: string, genre: string, logline: string): Record<string, unknown> {
  return { concept: { title, genre, logline, status: 'approved' } };
}

function writeScene(sceneNumber: number, location: string, action: string, dialogue: string = ''): Record<string, unknown> {
  const scene: Record<string, unknown> = { scene: sceneNumber, location, action };
  if (dialogue) scene.dialogue = dialogue;
  return { scene };
}

function describeVisual(sceneNumber: number, shotType: string, description: string): Record<string, unknown> {
  return { visual: { scene: sceneNumber, shot_type: shotType, description } };
}

function specifyAudio(sceneNumber: number, musicMood: string, soundEffects: string): Record<string, unknown> {
  return { audio: { scene: sceneNumber, music_mood: musicMood, sound_effects: soundEffects } };
}

function assembleProduction(title: string, totalScenes: number, estimatedRuntime: string): Record<string, unknown> {
  return { production: { title, total_scenes: totalScenes, estimated_runtime: estimatedRuntime, status: 'ready_for_production' } };
}

// -- Pipeline stages -------------------------------------------------------

const conceptDeveloper = {
  run: async (prompt: string) => ({ output: `Concept: ${prompt}` }),
  model: llmModel, name: 'concept_developer',
  instruction: 'You are a creative director. Develop a concept for a short film based on the given theme. Use create_concept to document the title, genre, and logline.',
  tools: [{ name: 'create_concept', description: 'Create a movie concept document.', fn: createConcept, parameters: { type: 'object', properties: { title: { type: 'string' }, genre: { type: 'string' }, logline: { type: 'string' } }, required: ['title', 'genre', 'logline'] } }],
  _google_adk: true,
};

const scriptwriter = {
  run: async (prompt: string) => ({ output: `Script: ${prompt}` }),
  model: llmModel, name: 'scriptwriter',
  instruction: 'You are a scriptwriter. Based on the concept, write 3 short scenes using write_scene for each.',
  tools: [{ name: 'write_scene', description: 'Write a single scene for the script.', fn: writeScene, parameters: { type: 'object', properties: { scene_number: { type: 'number' }, location: { type: 'string' }, action: { type: 'string' }, dialogue: { type: 'string' } }, required: ['scene_number', 'location', 'action'] } }],
  _google_adk: true,
};

const visualDirector = {
  run: async (prompt: string) => ({ output: `Visual: ${prompt}` }),
  model: llmModel, name: 'visual_director',
  instruction: 'You are a visual director. For each scene, use describe_visual to specify camera shots, lighting, and visual mood.',
  tools: [{ name: 'describe_visual', description: 'Describe visual direction for a scene.', fn: describeVisual, parameters: { type: 'object', properties: { scene_number: { type: 'number' }, shot_type: { type: 'string' }, description: { type: 'string' } }, required: ['scene_number', 'shot_type', 'description'] } }],
  _google_adk: true,
};

const audioDesigner = {
  run: async (prompt: string) => ({ output: `Audio: ${prompt}` }),
  model: llmModel, name: 'audio_designer',
  instruction: 'You are an audio designer. For each scene, use specify_audio to define the music mood and key sound effects.',
  tools: [{ name: 'specify_audio', description: 'Specify audio direction for a scene.', fn: specifyAudio, parameters: { type: 'object', properties: { scene_number: { type: 'number' }, music_mood: { type: 'string' }, sound_effects: { type: 'string' } }, required: ['scene_number', 'music_mood', 'sound_effects'] } }],
  _google_adk: true,
};

const producer = {
  run: async (prompt: string) => ({ output: `Produce: ${prompt}` }),
  model: llmModel, name: 'producer',
  instruction: 'You are the producer. Review all previous stages and use assemble_production to create final production notes.',
  tools: [{ name: 'assemble_production', description: 'Assemble final production notes.', fn: assembleProduction, parameters: { type: 'object', properties: { title: { type: 'string' }, total_scenes: { type: 'number' }, estimated_runtime: { type: 'string' } }, required: ['title', 'total_scenes', 'estimated_runtime'] } }],
  _google_adk: true,
};

const moviePipeline = {
  run: async (prompt: string) => ({ output: `Movie: ${prompt}` }),
  model: llmModel, name: 'short_movie_pipeline',
  sub_agents: [conceptDeveloper, scriptwriter, visualDirector, audioDesigner, producer],
  _adk_sequential: true,
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    moviePipeline,
    'Create a 3-scene short film about a robot discovering music ' +
      'for the first time in a post-apocalyptic world.',
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
