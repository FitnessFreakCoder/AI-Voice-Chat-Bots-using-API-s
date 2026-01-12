# 🎙️ AI Voice & Chat Bot

An intelligent conversational assistant that supports **voice and text interaction** using modern AI models.  
The system converts user speech to text, processes it using **LLMs**, and returns responses as both **text and natural-sounding voice**.

---

## 🚀 Features

- Voice input (Speech-to-Text)
- AI-powered chat (OpenAI + Google Gemini)
- Natural Text-to-Speech output
- Web-based interface
- Real-time audio playback
- RAG-based response system

---

## 🧠 How It Works

1. User speaks or types a message.
2. Audio is converted into text.
3. The text is processed using AI models (OpenAI & Gemini).
4. The response is generated using RAG and LLMs.
5. The response is converted into speech.
6. The user hears the AI reply and sees the text.

---

## 📂 Project Structure

AIVoiceChatBot/
│
├── app.py # Main Flask application
├── Audio-text.py # Speech-to-text logic
├── RagSetup.py # Retrieval Augmented Generation
├── config.py # API & configuration settings
├── .env # API keys
│
├── templates/
│ └── index.html # Web UI
│
├── User_Audio/ # User audio inputs
├── output.wav # Generated voice output
├── output.mp3
└── output.pcm


---

## 🧩 Technologies Used

- Python  
- OpenAI API  
- Google Gemini API  
- Pydub  
- PyAudio  
- Flask  
- RAG (Retrieval Augmented Generation)  
- HTML, JavaScript  

---


