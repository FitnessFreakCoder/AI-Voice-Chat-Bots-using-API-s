from flask import Flask, render_template, request, jsonify, Response, send_from_directory, stream_with_context
import os
from openai import OpenAI
from config import Api_Key, OpenAI_ApiKey
from pathlib import Path
import time
from datetime import datetime

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'User_Audio'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Create User_Audio folder if it doesn't exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Initialize OpenAI client
open_client = OpenAI(api_key=OpenAI_ApiKey)

# Initialize Gemini client for text generation
client_text = OpenAI(
    api_key=Api_Key,
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/upload-audio', methods=['POST'])
def upload_audio():
    """Handle audio file upload from user"""
    try:
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio']
        
        if audio_file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Save audio file with timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"user_audio_{timestamp}.webm"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        audio_file.save(filepath)
        
        return jsonify({
            'success': True,
            'filename': filename,
            'message': 'Audio uploaded successfully'
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/process-audio', methods=['POST'])
def process_audio():
    """Process the uploaded audio: transcribe and generate response"""
    try:
        data = request.get_json()
        filename = data.get('filename')
        
        if not filename:
            return jsonify({'error': 'No filename provided'}), 400
        
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        if not os.path.exists(filepath):
            return jsonify({'error': 'Audio file not found'}), 404
        
        # Step 1: Transcribe audio
        print('Transcribing audio...')
        with open(filepath, 'rb') as audio_file:
            transcription = open_client.audio.transcriptions.create(
                model="gpt-4o-transcribe",
                file=audio_file
            )
        
        user_text = transcription.text
        print(f"Transcript: {user_text}")
        
        # Step 2: Generate LLM response
        print('Generating response...')
        response = client_text.chat.completions.create(
            model="gemini-2.5-flash",
            reasoning_effort="low",
            messages=[
                {"role": "system", "content": "You are a helpful voice assistant. Keep responses concise and conversational, typically 2-4 sentences."},
                {"role": "user", "content": user_text}
            ]
        )
        
        ai_response = response.choices[0].message.content
        print(f"AI Response: {ai_response}")
        
        return jsonify({
            'success': True,
            'transcript': user_text,
            'response': ai_response
        })
    
    except Exception as e:
        print(f"Error processing audio: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/stream-audio', methods=['POST'])
def stream_audio():
    """Stream TTS audio response in real-time with chunked transfer"""
    try:
        data = request.get_json()
        text = data.get('text')
        
        if not text:
            return jsonify({'error': 'No text provided'}), 400
        
        @stream_with_context
        def generate_audio():
            """Generator function for real-time audio streaming"""
            try:
                print(f"Starting TTS stream for text: {text[:50]}...")
                
                # Use streaming response from OpenAI TTS
                with open_client.audio.speech.with_streaming_response.create(
                    model="gpt-4o-mini-tts",
                    voice="nova",
                    input=text,
                    instructions="Speak in a clear and natural tone.",
                    response_format="mp3"
                ) as tts_response:
                    # Stream audio chunks as they arrive
                    chunk_count = 0
                    for chunk in tts_response.iter_bytes(chunk_size=4096):
                        chunk_count += 1
                        if chunk_count % 10 == 0:
                            print(f"Streamed {chunk_count} chunks...")
                        yield chunk
                
                print(f"TTS stream complete. Total chunks: {chunk_count}")
                
            except Exception as e:
                print(f"TTS streaming error: {e}")
                raise
        
        # Return streaming response with proper headers for real-time playback
        return Response(
            generate_audio(),
            mimetype='audio/mpeg',
            headers={
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'X-Accel-Buffering': 'no',
                'Transfer-Encoding': 'chunked'
            }
        )
    
    except Exception as e:
        print(f"Error streaming audio: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/audio/<filename>')
def serve_audio(filename):
    """Serve audio files"""
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000, threaded=True)