import os


class Config:
    WORLD_MODEL_URL = os.getenv("WORLD_MODEL_URL", "http://127.0.0.1:8010").rstrip("/")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.6-terra")
    REQUEST_TIMEOUT_SECONDS = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "8"))


config = Config()
