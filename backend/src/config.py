import os


class Config:
    WORLD_MODEL_URL = os.getenv("WORLD_MODEL_URL", "http://127.0.0.1:8010").rstrip("/")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.6-terra")
    REQUEST_TIMEOUT_SECONDS = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "8"))
    ARGUS_URL = os.getenv("ARGUS_URL", "http://127.0.0.1:8000").rstrip("/")
    PHOENIX_GRAPH_URL = os.getenv("PHOENIX_GRAPH_URL", "http://127.0.0.1:8080").rstrip("/")
    PHOENIX_CHAOS_URL = os.getenv("PHOENIX_CHAOS_URL", "http://127.0.0.1:8082").rstrip("/")
    PHOENIX_AGENT_URL = os.getenv("PHOENIX_AGENT_URL", "http://127.0.0.1:8084").rstrip("/")
    DEMO_MODE = os.getenv("SENTINEL_DEMO_MODE", "portable").lower()
    KUBECTL_CONTEXT = os.getenv("KUBECTL_CONTEXT", "")


config = Config()
