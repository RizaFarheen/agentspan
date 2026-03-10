"""OpenAI Agent with Structured Output — enforced JSON schema response.

Demonstrates:
    - Using output_type with a Pydantic model for structured responses
    - The agent is forced to return data matching the schema
    - Model settings (temperature) for deterministic output

Requirements:
    - pip install openai-agents pydantic
    - Conductor server with OpenAI LLM integration configured
    - export CONDUCTOR_SERVER_URL=http://localhost:7001/api
"""

from typing import List

from agents import Agent, ModelSettings
from pydantic import BaseModel

from agentspan.agents import AgentRuntime


class MovieRecommendation(BaseModel):
    title: str
    year: int
    genre: str
    reason: str


class MovieList(BaseModel):
    recommendations: List[MovieRecommendation]
    theme: str


agent = Agent(
    name="movie_recommender",
    instructions=(
        "You are a movie recommendation expert. When asked for movie suggestions, "
        "return a structured list of recommendations with title, year, genre, "
        "and a brief reason for each recommendation. Identify the overall theme."
    ),
    model="gpt-4o",
    output_type=MovieList,
    model_settings=ModelSettings(
        temperature=0.3,
        max_tokens=1000,
    ),
)

with AgentRuntime() as runtime:
    result = runtime.run(
        agent,
        "Recommend 3 sci-fi movies that explore the concept of artificial intelligence.",
    )
    result.print_result()
