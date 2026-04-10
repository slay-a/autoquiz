from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str = ""
    supabase_url: str = ""
    supabase_service_key: str = ""
    supabase_db_url: str = ""
    redis_url: str = "redis://localhost:6379/0"
    max_upload_size_mb: int = 50
    chunk_size_tokens: int = 400
    chunk_overlap_tokens: int = 60
    top_k_results: int = 10

    class Config:
        env_file = ".env"


settings = Settings()
