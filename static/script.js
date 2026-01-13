let mediaRecorder;
        let audioChunks = [];
        let isRecording = false;
        let currentAudio = null;
        let silenceTimer = null;
        let audioContext = null;
        let analyser = null;
        let isProcessing = false;
        let autoRecordEnabled = true;
        let audioStream = null;

        const recordButton = document.getElementById('recordButton');
        const statusDiv = document.getElementById('status');
        const chatContainer = document.getElementById('chatContainer');

        const SILENCE_THRESHOLD = 0.01;
        const SILENCE_DURATION = 2000;
        const INITIAL_SILENCE_DURATION = 3000;
        let hasDetectedSpeech = false;
        let initialSilenceTimer = null;

        recordButton.addEventListener('click', toggleRecording);

        async function toggleRecording() {
            if (isProcessing) return;
            
            if (!isRecording) {
                await startRecording();
            } else {
                stopRecording();
            }
        }

        async function startRecording() {
            try {
                audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                analyser = audioContext.createAnalyser();
                const source = audioContext.createMediaStreamSource(audioStream);
                source.connect(analyser);
                analyser.fftSize = 2048;
                
                mediaRecorder = new MediaRecorder(audioStream);
                audioChunks = [];
                hasDetectedSpeech = false;

                mediaRecorder.ondataavailable = (event) => {
                    audioChunks.push(event.data);
                };

                mediaRecorder.onstop = async () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    
                    if (audioStream) {
                        audioStream.getTracks().forEach(track => track.stop());
                        audioStream = null;
                    }
                    if (audioContext) {
                        audioContext.close();
                        audioContext = null;
                    }
                    
                    if (hasDetectedSpeech) {
                        await processAudio(audioBlob);
                    } else {
                        const processingMsg = document.getElementById('processing-msg');
                        if (processingMsg) {
                            processingMsg.remove();
                        }
                        setStatus('No speech detected', false);
                        isProcessing = false;
                        recordButton.disabled = false;
                        
                        if (autoRecordEnabled) {
                            setTimeout(() => {
                                if (!isRecording && !isProcessing) {
                                    startRecording();
                                }
                            }, 1000);
                        }
                    }
                };

                mediaRecorder.start();
                isRecording = true;
                recordButton.classList.add('recording');
                recordButton.textContent = '⏹️';
                setStatus('Listening... speak now', true);
                
                initialSilenceTimer = setTimeout(() => {
                    if (isRecording && !hasDetectedSpeech) {
                        console.log('Auto-stopping: No speech detected');
                        stopRecording();
                    }
                }, INITIAL_SILENCE_DURATION);
                
                monitorSilence();
            } catch (error) {
                console.error('Error accessing microphone:', error);
                showError('Microphone access denied');
            }
        }

        function monitorSilence() {
            if (!isRecording) return;
            
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyser.getByteTimeDomainData(dataArray);
            
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                const normalized = (dataArray[i] - 128) / 128;
                sum += normalized * normalized;
            }
            const rms = Math.sqrt(sum / bufferLength);
            
            if (rms >= SILENCE_THRESHOLD) {
                if (!hasDetectedSpeech) {
                    hasDetectedSpeech = true;
                    console.log('Speech detected!');
                    if (initialSilenceTimer) {
                        clearTimeout(initialSilenceTimer);
                        initialSilenceTimer = null;
                    }
                }
                
                if (silenceTimer) {
                    clearTimeout(silenceTimer);
                    silenceTimer = null;
                }
            } else {
                if (hasDetectedSpeech && !silenceTimer) {
                    silenceTimer = setTimeout(() => {
                        console.log('Auto-stopping due to silence after speech');
                        stopRecording();
                    }, SILENCE_DURATION);
                }
            }
            
            if (isRecording) {
                requestAnimationFrame(monitorSilence);
            }
        }

        function stopRecording() {
            if (mediaRecorder && isRecording) {
                if (silenceTimer) {
                    clearTimeout(silenceTimer);
                    silenceTimer = null;
                }
                if (initialSilenceTimer) {
                    clearTimeout(initialSilenceTimer);
                    initialSilenceTimer = null;
                }
                
                if (hasDetectedSpeech) {
                    addProcessingMessage();
                    setStatus('Processing audio...');
                }
                
                mediaRecorder.stop();
                isRecording = false;
                recordButton.classList.remove('recording');
                recordButton.textContent = '🎤';
            }
        }

        function addProcessingMessage() {
            const messageDiv = document.createElement('div');
            messageDiv.id = 'processing-msg';
            messageDiv.className = 'message assistant';
            messageDiv.innerHTML = `
                <div class="message-avatar">🤖</div>
                <div class="message-content waiting-message">
                    <span>Processing</span>
                    <div class="loading-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
            `;
            chatContainer.appendChild(messageDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        async function processAudio(audioBlob) {
            try {
                isProcessing = true;
                recordButton.disabled = true;
                
                const formData = new FormData();
                formData.append('audio', audioBlob, 'recording.webm');

                const uploadResponse = await fetch('/upload-audio', {
                    method: 'POST',
                    body: formData
                });

                const uploadData = await uploadResponse.json();
                
                if (!uploadData.success) {
                    throw new Error(uploadData.error || 'Upload failed');
                }

                setStatus('Transcribing...');
                
                const processResponse = await fetch('/process-audio', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ filename: uploadData.filename })
                });

                const processData = await processResponse.json();
                
                if (!processData.success) {
                    throw new Error(processData.error || 'Processing failed');
                }

                const processingMsg = document.getElementById('processing-msg');
                if (processingMsg) {
                    processingMsg.remove();
                }

                addMessage('user', processData.transcript, '👤');

                const waitingMsgId = addWaitingMessage();

                setStatus('Generating response...');
                await streamTextAndAudio(processData.response, waitingMsgId);

                setStatus('Click to start recording');
                isProcessing = false;
                recordButton.disabled = false;

            } catch (error) {
                console.error('Error processing audio:', error);
                
                const processingMsg = document.getElementById('processing-msg');
                if (processingMsg) {
                    processingMsg.remove();
                }
                
                showError('Error: ' + error.message);
                setStatus('Click to start recording');
                isProcessing = false;
                recordButton.disabled = false;
            }
        }

        function addWaitingMessage() {
            const messageDiv = document.createElement('div');
            const msgId = 'waiting-' + Date.now();
            messageDiv.id = msgId;
            messageDiv.className = 'message assistant';
            messageDiv.innerHTML = `
                <div class="message-avatar">🤖</div>
                <div class="message-content waiting-message">
                    <span>Wait</span>
                    <div class="loading-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
            `;
            chatContainer.appendChild(messageDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
            return msgId;
        }

        function addConvertingMessage() {
            const messageDiv = document.createElement('div');
            messageDiv.id = 'converting-msg';
            messageDiv.className = 'message assistant';
            messageDiv.innerHTML = `
                <div class="message-avatar">🤖</div>
                <div class="message-content waiting-message">
                    <span>Converting to speech</span>
                    <div class="loading-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
            `;
            chatContainer.appendChild(messageDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        async function streamTextAndAudio(text, waitingMsgId) {
            try {
                const waitingMsg = document.getElementById(waitingMsgId);
                if (waitingMsg) {
                    waitingMsg.remove();
                }
                
                // Create message container for streaming text
                const messageDiv = document.createElement('div');
                const streamMsgId = 'stream-' + Date.now();
                messageDiv.id = streamMsgId;
                messageDiv.className = 'message assistant';
                messageDiv.innerHTML = `
                    <div class="message-avatar">🤖</div>
                    <div class="message-content">
                        <span class="streaming-text"></span><span class="cursor"></span>
                    </div>
                `;
                chatContainer.appendChild(messageDiv);
                chatContainer.scrollTop = chatContainer.scrollHeight;
                
                const streamingText = messageDiv.querySelector('.streaming-text');
                const cursor = messageDiv.querySelector('.cursor');
                
                // Start text streaming immediately
                let charIndex = 0;
                const streamInterval = setInterval(() => {
                    if (charIndex < text.length) {
                        streamingText.textContent += text[charIndex];
                        charIndex++;
                        chatContainer.scrollTop = chatContainer.scrollHeight;
                    } else {
                        clearInterval(streamInterval);
                        cursor.remove();
                    }
                }, 30);
                
                // Start audio streaming in parallel
                setStatus('Converting to speech...');
                
                if (currentAudio) {
                    currentAudio.pause();
                    currentAudio = null;
                }

                const response = await fetch('/stream-audio', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ text: text })
                });

                if (!response.ok) {
                    clearInterval(streamInterval);
                    throw new Error('Audio streaming failed');
                }

                // Collect ALL audio chunks before playing
                const reader = response.body.getReader();
                const chunks = [];

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                }

                // Now create and play the complete audio
                const audioBlob = new Blob(chunks, { type: 'audio/mpeg' });
                const audioUrl = URL.createObjectURL(audioBlob);
                
                currentAudio = new Audio(audioUrl);
                
                setStatus('🔊 Playing response...');
                
                try {
                    await currentAudio.play();
                } catch (err) {
                    console.error('Audio play error:', err);
                }

                currentAudio.onended = () => {
                    URL.revokeObjectURL(audioUrl);
                    setStatus('Click to start recording');
                    
                    if (autoRecordEnabled) {
                        setTimeout(() => {
                            if (!isRecording && !isProcessing) {
                                console.log('Auto-starting next recording...');
                                startRecording();
                            }
                        }, 800);
                    }
                };
                
                currentAudio.onerror = (err) => {
                    console.error('Audio playback error:', err);
                    URL.revokeObjectURL(audioUrl);
                    showError('Audio playback failed');
                    setStatus('Click to start recording');
                };

            } catch (error) {
                console.error('Error streaming:', error);
                
                const waitingMsg = document.getElementById(waitingMsgId);
                if (waitingMsg) {
                    waitingMsg.remove();
                }
                
                showError('Failed to stream response');
                setStatus('Click to start recording');
            }
        }

        function addMessage(type, content, avatar) {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${type}`;
            messageDiv.innerHTML = `
                <div class="message-avatar">${avatar}</div>
                <div class="message-content">${content}</div>
            `;
            chatContainer.appendChild(messageDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        function setStatus(message, active = false) {
            statusDiv.textContent = message;
            if (active) {
                statusDiv.classList.add('active');
            } else {
                statusDiv.classList.remove('active');
            }
        }

        function showError(message) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error';
            errorDiv.textContent = message;
            chatContainer.appendChild(errorDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
            
            setTimeout(() => {
                errorDiv.remove();
            }, 5000);
        }

        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && e.target === document.body && !isProcessing) {
                e.preventDefault();
                if (!isRecording) {
                    startRecording();
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space' && isRecording) {
                e.preventDefault();
                stopRecording();
            }
        });