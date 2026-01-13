import os
import time
from pydub import AudioSegment
from google import genai
import json
from dotenv import load_dotenv
load_dotenv()

openai_apikey =  os.getenv("OPENAI_APIKEY")
gemini_apikey = os.getenv("GEMINI_APIKEY")

client = genai.Client(api_key=gemini_apikey)


# def convert_to_wav(file_path):
#     if file_path.lower().endswith(".wav"):
#         return file_path  # no need to convert

#     audio = AudioSegment.from_file(file_path)
#     wav_path = file_path.rsplit(".", 1)[0] + ".wav"
#     audio.export(wav_path, format="wav")
#     return wav_path


def get_latest_file(folder_path):
    files = [os.path.join(folder_path, f) for f in os.listdir(folder_path)]
    files = [f for f in files if os.path.isfile(f)]
    if not files:
        return None
    return max(files, key=os.path.getmtime)

folder = "User_Audio"
latest = get_latest_file(folder)
print(latest)

# latest = get_latest_file(folder)

# if latest:
#     print("Latest uploaded file:", latest)
# else:
#     print("No files found!")
#     exit()

# # ★ Convert to WAV
# wav_file = convert_to_wav(latest)
# print("Using audio file:", wav_file)

uploaded = client.files.upload(file=latest)
print("Uploaded file ID:", uploaded.name)
print("Initial status:", uploaded.state)

#Wait for ACTIVE
# while True:
#     f = client.files.get(name=uploaded.name)
#     print("Status:", f.state)

#     if f.state == "ACTIVE":
#         break
#     if f.state == "FAILED":
#         raise Exception("File processing failed.")

#     time.sleep(1)

print('Wait for the response.....')
response = client.models.generate_content(
    model="gemini-2.5-pro",
    contents=["Translate everything in English:", uploaded]
)

print("\n--- TRANSCRIPT ---")
print(response.text)
os.makedirs('Json_text' , exist_ok=True)
output_path = os.path.join("Json_text", "transcript.json")

with open(output_path , 'w') as f:
    json.dump({'Transcript':response.text},f)


print('Saved Successfully')