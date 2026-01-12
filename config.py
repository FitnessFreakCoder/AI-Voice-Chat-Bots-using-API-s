import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_APIKEY")
GEMINI_API_KEY = os.getenv("GEMINI_APIKEY")
