/**
 * Google ADK ML Engineering Pipeline -- multi-agent ML workflow.
 *
 * Mirrors the pattern from google/adk-samples/machine-learning-engineering.
 * Demonstrates:
 *   - SequentialAgent pipeline with distinct ML phases
 *   - ParallelAgent for concurrent model strategy exploration
 *   - LoopAgent for iterative refinement
 *   - output_key for state passing between pipeline stages
 *
 * Requirements:
 *   - Conductor server
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Phase 1: Data Analysis ------------------------------------------------

const dataAnalyst = {
  run: async (prompt: string) => ({ output: `DataAnalysis: ${prompt}` }),
  model: llmModel, name: 'data_analyst',
  instruction:
    'You are a data scientist performing exploratory data analysis. ' +
    'Given a dataset description, analyze it and provide:\n' +
    '1. Key features and their likely importance\n' +
    '2. Data quality considerations (missing values, outliers, scaling)\n' +
    '3. Recommended preprocessing steps\n' +
    '4. Which model families are most promising and why\n\n' +
    'Be concise and structured. Output a numbered analysis.',
  output_key: 'data_analysis',
  _google_adk: true,
};

// -- Phase 2: Parallel Model Strategy Exploration --------------------------

const linearModeler = {
  run: async (prompt: string) => ({ output: `Linear: ${prompt}` }),
  model: llmModel, name: 'linear_modeler',
  instruction:
    'You are a machine learning engineer specializing in linear models. ' +
    'Propose a linear modeling approach with model choice, feature engineering, ' +
    'expected strengths/weaknesses, and estimated performance. Keep it to 4-5 bullet points.',
  _google_adk: true,
};

const treeModeler = {
  run: async (prompt: string) => ({ output: `Tree: ${prompt}` }),
  model: llmModel, name: 'tree_modeler',
  instruction:
    'You are a machine learning engineer specializing in tree-based models. ' +
    'Propose a tree-based approach with model choice, feature engineering, ' +
    'key hyperparameters, and expected strengths/weaknesses. Keep it to 4-5 bullet points.',
  _google_adk: true,
};

const nnModeler = {
  run: async (prompt: string) => ({ output: `NN: ${prompt}` }),
  model: llmModel, name: 'nn_modeler',
  instruction:
    'You are a machine learning engineer specializing in neural networks. ' +
    'Propose a neural network approach with architecture choice, preprocessing, ' +
    'training considerations, and expected strengths/weaknesses. Keep it to 4-5 bullet points.',
  _google_adk: true,
};

const parallelModeling = {
  run: async (prompt: string) => ({ output: `Parallel: ${prompt}` }),
  model: llmModel, name: 'model_exploration',
  sub_agents: [linearModeler, treeModeler, nnModeler],
  _adk_parallel: true,
  _google_adk: true,
};

// -- Phase 3: Evaluation & Selection ---------------------------------------

const evaluatorAgent = {
  run: async (prompt: string) => ({ output: `Eval: ${prompt}` }),
  model: llmModel, name: 'evaluator',
  instruction:
    'You are a senior ML engineer evaluating model proposals. ' +
    'Review the three approaches and:\n' +
    '1. Compare expected performance\n' +
    '2. Consider training cost, interpretability, and maintenance\n' +
    '3. Select the BEST approach with clear justification\n' +
    '4. Identify the top 3 hyperparameters to tune\n\n' +
    "Output your selection clearly as: 'Selected model: [name]' followed by reasoning.",
  output_key: 'model_selection',
  _google_adk: true,
};

// -- Phase 4: Iterative Refinement (LoopAgent) ----------------------------

const optimizer = {
  run: async (prompt: string) => ({ output: `Optimize: ${prompt}` }),
  model: llmModel, name: 'optimizer',
  instruction:
    'You are a hyperparameter optimization specialist. ' +
    'Suggest specific hyperparameter values, explain the rationale, ' +
    'and predict the expected improvement.',
  _google_adk: true,
};

const validatorAgent = {
  run: async (prompt: string) => ({ output: `Validate: ${prompt}` }),
  model: llmModel, name: 'validator',
  instruction:
    "You are a model validation expert. Review the optimizer's suggestions:\n" +
    '1. Are the hyperparameter choices reasonable?\n' +
    '2. Is there risk of overfitting or underfitting?\n' +
    '3. Suggest one additional tweak that could help',
  _google_adk: true,
};

const refineCycle = {
  run: async (prompt: string) => ({ output: `Refine: ${prompt}` }),
  model: llmModel, name: 'refine_cycle',
  sub_agents: [optimizer, validatorAgent],
  _adk_sequential: true,
  _google_adk: true,
};

const refinementLoop = {
  run: async (prompt: string) => ({ output: `Loop: ${prompt}` }),
  model: llmModel, name: 'refinement_loop',
  sub_agents: [refineCycle],
  max_iterations: 2,
  _adk_loop: true,
  _google_adk: true,
};

// -- Phase 5: Final Report -------------------------------------------------

const reporter = {
  run: async (prompt: string) => ({ output: `Report: ${prompt}` }),
  model: llmModel, name: 'reporter',
  instruction:
    'You are a technical writer producing an ML project summary. ' +
    'Write a concise final report:\n\n' +
    '## ML Pipeline Report\n' +
    '- **Dataset**: Brief description\n' +
    '- **Selected Model**: Name and rationale\n' +
    '- **Key Hyperparameters**: Final recommended values\n' +
    '- **Expected Performance**: Estimated metrics\n' +
    '- **Next Steps**: 2-3 recommendations\n\n' +
    'Keep the report under 200 words.',
  _google_adk: true,
};

// -- Full Pipeline ---------------------------------------------------------

const mlPipeline = {
  run: async (prompt: string) => ({ output: `ML: ${prompt}` }),
  model: llmModel, name: 'ml_pipeline',
  sub_agents: [dataAnalyst, parallelModeling, evaluatorAgent, refinementLoop, reporter],
  _adk_sequential: true,
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    mlPipeline,
    'Build a model to predict California housing prices. The dataset has 20,640 samples ' +
      'with 8 features: MedInc, HouseAge, AveRooms, AveBedrms, Population, AveOccup, ' +
      'Latitude, Longitude. Target: MedianHouseValue (continuous, in $100k units). ' +
      'Metric: RMSE. Some features have skewed distributions.',
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
