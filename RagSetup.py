import json
import os
import wave
from openai import OpenAI
from google import genai
from google.genai import types

import time
from pydub import AudioSegment
from pydub.playback import play
from pathlib import Path
import io
import pyaudio
import threading
import queue
from dotenv import load_dotenv
load_dotenv()

openai_apikey =  os.getenv("OPENAI_APIKEY")
gemini_apikey = os.getenv("GEMINI_APIKEY")

client = genai.Client(api_key=gemini_apikey)
open_client = OpenAI(api_key=openai_apikey)


def get_latest_file(folder_path):
    files = [os.path.join(folder_path, f) for f in os.listdir(folder_path)]
    files = [f for f in files if os.path.isfile(f)]
    if not files:
        return None
    return max(files, key=os.path.getmtime)


folder = "User_Audio"
latest = get_latest_file(folder)

print('Wait for the response.....')
audio_file = open(latest, "rb")
response = open_client.audio.transcriptions.create(
    model="gpt-4o-transcribe", 
    file=audio_file
)

print("\n--- TRANSCRIPT ---")
print(response.text)
data = response.text

client_text = OpenAI(
    api_key=openai_apikey,
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
)


# ----------------------------------------
# LLM RESPONSE (TEXT GENERATION)
# ----------------------------------------
prompt = f"""
Answer it in 3 to 4 sentences:
{data}
"""

response = client_text.chat.completions.create(
    model="gemini-2.5-flash",
    reasoning_effort="low",
    messages=[
        {"role": "system", "content": "You are a Summary Assistant,Answer it in Strictly in 2-3 line"},
        {"role": "user", "content": "what is OOPS concept?"}
    ]
)

llm_response = response.choices[0].message
Final_response = llm_response.content
print("\nGenerated Text Response:\n", Final_response)


# ----------------------------------------
# ULTRA-OPTIMIZED REAL-TIME TTS STREAMING
# ----------------------------------------
print('Starting real-time audio streaming.....')

# Smaller queue for minimal latency
audio_queue = queue.Queue(maxsize=5)
audio_chunks = []
stop_playback = threading.Event()

def play_audio():
    """Play audio from queue with minimal latency"""
    p = pyaudio.PyAudio()
    
    # Ultra-low latency settings
    stream = p.open(
        format=pyaudio.paInt16,
        channels=1,
        rate=24000,
        output=True,
        frames_per_buffer=512,  # Minimum buffer for lowest latency
        stream_callback=None
    )
    
    # Pre-buffer check
    first_chunk = True
    buffer_count = 0
    MIN_PREBUFFER = 3  # Wait for 3 chunks before starting
    
    try:
        while not stop_playback.is_set() or not audio_queue.empty():
            try:
                chunk = audio_queue.get(timeout=0.05)
                
                if chunk is None:  # Stop signal
                    break
                
                # Pre-buffering logic
                if first_chunk:
                    buffer_count += 1
                    if buffer_count < MIN_PREBUFFER:
                        audio_queue.put(chunk)  # Put it back
                        time.sleep(0.01)
                        continue
                    else:
                        first_chunk = False
                        print("Playback started...")
                
                # Play immediately
                stream.write(chunk, exception_on_underflow=False)
                audio_chunks.append(chunk)
                
            except queue.Empty:
                continue
            except Exception as e:
                print(f"Playback error: {e}")
                continue
                
    finally:
        stream.stop_stream()
        stream.close()
        p.terminate()

# Start playback thread with higher priority
playback_thread = threading.Thread(target=play_audio, daemon=True)
playback_thread.start()

try:
    with open_client.audio.speech.with_streaming_response.create(
        model="gpt-4o-mini-tts",
        voice="nova",
        input=Final_response,
        instructions="Speak in a clear and natural tone.",
        response_format="pcm"
    ) as tts_response:
        print("Buffering audio...")
        
        # Ultra-small chunks for minimal latency
        for chunk in tts_response.iter_bytes(chunk_size=512):
            audio_queue.put(chunk, block=True)
        
        # Signal to stop
        audio_queue.put(None)
        stop_playback.set()

except Exception as e:
    print(f"Streaming error: {e}")
    stop_playback.set()

finally:
    playback_thread.join(timeout=10)
    print("\nAudio playback completed!")

# Save the complete audio to file
output_audio = Path(__file__).parent / "output.mp3"
print("Saving audio file...")
try:
    with open(output_audio, "wb") as f:
        for chunk in audio_chunks:
            f.write(chunk)
    print(f"Audio saved successfully as: {output_audio}")
except Exception as e:
    print(f"Error saving file: {e}")